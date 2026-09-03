import 'server-only';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import {
  ApifyError,
  abortActorRun,
  fetchAllDatasetItems,
  getActorRun,
  isTerminalStatus,
  startActorRun,
} from '@/lib/apify/client';
import { DEFAULT_ACTORS, buildActorInput } from '@/lib/apify/inputs';
import { mapApifyItems } from '@/lib/apify/mappers';
import { importPosts } from './import';
import { refreshStatsAfterImport } from '@/lib/stats';
import { notifyOperators } from '@/lib/notifications';
import { auditSystem, AUDIT_ACTIONS } from '@/lib/audit';
import { getOperationalSettings } from '@/lib/settings';
import { enqueueExtraction, removeExtractionJob } from '@/lib/queue';
import type { ExtractionTrigger } from '@/generated/prisma';

export interface CreateRunOptions {
  accountId: string;
  trigger: ExtractionTrigger;
  requestedById?: string | null;
  /** تجاوز عدد المنشورات المحدد في إعدادات الحساب */
  maxItems?: number;
  /** تجاوز نافذة الاستخراج المحددة في إعدادات الحساب */
  windowDays?: number;
}

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractionError';
  }
}

/**
 * إنشاء عملية استخراج بحالة PENDING وإضافتها إلى الطابور.
 * لا يُستدعى Apify هنا — التنفيذ الفعلي في العامل الخلفي.
 */
export async function createExtractionRun(options: CreateRunOptions) {
  const account = await prisma.account.findUnique({
    where: { id: options.accountId },
    select: {
      id: true,
      name: true,
      url: true,
      username: true,
      isActive: true,
      status: true,
      maxItemsPerRun: true,
      extractionWindowDays: true,
      actorIdOverride: true,
      actorInputOverride: true,
      platform: {
        select: { id: true, code: true, name: true, status: true, defaultActorId: true, defaultActorInput: true },
      },
    },
  });

  if (!account) throw new ExtractionError('الحساب غير موجود');
  if (!account.isActive || account.status !== 'ACTIVE') {
    throw new ExtractionError('الحساب معطّل — فعّله قبل تشغيل الاستخراج');
  }
  if (account.platform.status !== 'ACTIVE') {
    throw new ExtractionError('المنصة معطّلة — فعّلها قبل تشغيل الاستخراج');
  }

  const actorId =
    account.actorIdOverride ??
    account.platform.defaultActorId ??
    DEFAULT_ACTORS[account.platform.code] ??
    null;

  if (!actorId) {
    throw new ExtractionError(
      `لم يُحدَّد Apify Actor للمنصة «${account.platform.name}». اضبطه من إدارة المنصات.`,
    );
  }

  // منع تشغيل موازٍ لنفس الحساب
  const active = await prisma.extractionRun.findFirst({
    where: { accountId: account.id, status: { in: ['PENDING', 'RUNNING'] } },
    select: { id: true },
  });
  if (active) throw new ExtractionError('توجد عملية استخراج قائمة لهذا الحساب بالفعل');

  const settings = await getOperationalSettings();
  const requestedMax = options.maxItems ?? account.maxItemsPerRun ?? settings.defaultMaxItems;
  // سقف الفوترة الصارم يمنع أي استهلاك زائد مهما كانت الإعدادات
  const maxItems = Math.min(Math.max(1, requestedMax), env.APIFY_MAX_ITEMS_HARD_CAP);
  const windowDays = options.windowDays ?? account.extractionWindowDays ?? settings.defaultWindowDays;

  const input = buildActorInput({
    platformCode: account.platform.code,
    url: account.url,
    username: account.username,
    maxItems,
    windowDays,
    overrides: {
      ...((account.platform.defaultActorInput as Record<string, unknown> | null) ?? {}),
      ...((account.actorInputOverride as Record<string, unknown> | null) ?? {}),
    },
  });

  const run = await prisma.extractionRun.create({
    data: {
      accountId: account.id,
      platformId: account.platform.id,
      actorId,
      status: 'PENDING',
      trigger: options.trigger,
      requestedById: options.requestedById ?? null,
      maxItems,
      input: input as never,
    },
    select: { id: true, actorId: true, maxItems: true, status: true },
  });

  const jobId = await enqueueExtraction(run.id);
  if (jobId) {
    await prisma.extractionRun.update({ where: { id: run.id }, data: { queueJobId: jobId } });
  }

  return { run, queued: Boolean(jobId), accountName: account.name };
}

/**
 * تنفيذ عملية الاستخراج فعلياً: تشغيل الـ Actor، انتظار النتيجة،
 * جلب البيانات، استيرادها، وتحديث الإحصاءات والتنبيهات.
 * يُستدعى من العامل الخلفي.
 */
export async function executeExtractionRun(runId: string): Promise<void> {
  const run = await prisma.extractionRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      status: true,
      actorId: true,
      maxItems: true,
      input: true,
      attempt: true,
      accountId: true,
      platformId: true,
      account: { select: { id: true, name: true, platform: { select: { id: true, code: true, name: true } } } },
    },
  });

  if (!run) throw new ExtractionError('عملية الاستخراج غير موجودة');
  if (run.status === 'CANCELLED') return;
  if (!run.account || !run.accountId || !run.platformId) {
    await failRun(runId, 'الحساب المرتبط بالعملية لم يعد موجوداً');
    return;
  }

  const startedAt = new Date();
  await prisma.extractionRun.update({
    where: { id: runId },
    data: { status: 'RUNNING', startedAt, attempt: { increment: run.attempt > 1 ? 0 : 0 } },
  });

  try {
    const apifyRun = await startActorRun(
      run.actorId,
      (run.input as Record<string, unknown>) ?? {},
      { maxItems: run.maxItems ?? 100 },
    );

    await prisma.extractionRun.update({
      where: { id: runId },
      data: { apifyRunId: apifyRun.id, apifyDatasetId: apifyRun.defaultDatasetId },
    });

    const finalRun = await waitForRun(apifyRun.id, runId);

    // العملية أُلغيت من لوحة التحكم أثناء الانتظار
    if (finalRun === null) return;

    if (finalRun.status === 'ABORTED') {
      await finalizeRun(runId, 'CANCELLED', startedAt, { errorMessage: 'أُوقف التشغيل من Apify' });
      return;
    }

    if (finalRun.status === 'FAILED' || finalRun.status === 'TIMED-OUT') {
      await failRun(
        runId,
        finalRun.status === 'TIMED-OUT'
          ? 'انتهت المهلة المحددة للتشغيل على Apify'
          : 'فشل تشغيل الـ Actor على Apify',
        startedAt,
      );
      return;
    }

    const items = await fetchAllDatasetItems(
      finalRun.defaultDatasetId,
      run.maxItems ?? env.APIFY_MAX_ITEMS_HARD_CAP,
    );

    const mapped = mapApifyItems(items, run.account.platform.code);

    if (items.length === 0) {
      await finalizeRun(runId, 'NO_RESULTS', startedAt, { itemsFetched: 0 });
      await notifyOperators({
        type: 'EXTRACTION_NO_RESULTS',
        severity: 'WARNING',
        title: `لا توجد نتائج: ${run.account.name}`,
        body: `انتهت عملية الاستخراج دون أي منشورات. تحقق من رابط الحساب وإعدادات الـ Actor.`,
        link: `/admin/extractions/${runId}`,
        entityType: 'extraction_run',
        entityId: runId,
      });
      return;
    }

    const imported = await importPosts(mapped.posts, {
      accountId: run.accountId,
      platformId: run.platformId,
      extractionRunId: runId,
    });

    // تحديث عدد المتابعين إن أرجعه الـ Actor
    if (imported.followersCount !== null) {
      await prisma.account
        .update({
          where: { id: run.accountId },
          data: { followersCount: imported.followersCount },
        })
        .catch(() => undefined);
    }

    await refreshStatsAfterImport(run.accountId, run.platformId, imported.publishedDates);

    await prisma.account.update({
      where: { id: run.accountId },
      data: { lastExtractedAt: new Date(), lastSuccessfulRunAt: new Date() },
    });

    await finalizeRun(runId, 'SUCCEEDED', startedAt, {
      itemsFetched: items.length,
      itemsSaved: imported.saved,
      itemsSkipped: imported.updated,
      itemsFailed: imported.failed + mapped.failed,
      rawSample: items.slice(0, 3),
      errorDetails:
        imported.failures.length > 0 || mapped.failures.length > 0
          ? { importFailures: imported.failures, mappingFailures: mapped.failures }
          : null,
    });

    await raiseAlerts(runId, run.account.name, imported);

    await auditSystem({
      action: AUDIT_ACTIONS.EXTRACTION_COMPLETED,
      entityType: 'extraction_run',
      entityId: runId,
      summary: `اكتمل استخراج ${run.account.name}: ${imported.saved} جديد و${imported.updated} محدّث`,
      metadata: {
        fetched: items.length,
        saved: imported.saved,
        updated: imported.updated,
        failed: imported.failed + mapped.failed,
      },
    });
  } catch (error) {
    const message =
      error instanceof ApifyError || error instanceof ExtractionError
        ? error.message
        : `خطأ غير متوقع: ${error instanceof Error ? error.message : 'غير معروف'}`;
    await failRun(runId, message, startedAt);
    throw error;
  }
}

/** انتظار انتهاء التشغيل مع فحص الإلغاء من لوحة التحكم */
async function waitForRun(apifyRunId: string, runId: string) {
  const deadline = Date.now() + env.APIFY_RUN_TIMEOUT_SECONDS * 1000;
  let delay = 3000;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.4, 15_000);

    const local = await prisma.extractionRun.findUnique({
      where: { id: runId },
      select: { status: true },
    });
    if (local?.status === 'CANCELLED') {
      await abortActorRun(apifyRunId).catch(() => undefined);
      return null;
    }

    const apifyRun = await getActorRun(apifyRunId);
    if (isTerminalStatus(apifyRun.status)) return apifyRun;
  }

  await abortActorRun(apifyRunId).catch(() => undefined);
  throw new ExtractionError('تجاوز التشغيل المهلة المحددة وأُوقف');
}

interface FinalizeData {
  itemsFetched?: number;
  itemsSaved?: number;
  itemsSkipped?: number;
  itemsFailed?: number;
  errorMessage?: string | null;
  errorDetails?: unknown;
  rawSample?: unknown;
}

async function finalizeRun(
  runId: string,
  status: 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'NO_RESULTS',
  startedAt: Date,
  data: FinalizeData = {},
): Promise<void> {
  const finishedAt = new Date();
  await prisma.extractionRun.update({
    where: { id: runId },
    data: {
      status,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      itemsFetched: data.itemsFetched ?? 0,
      itemsSaved: data.itemsSaved ?? 0,
      itemsSkipped: data.itemsSkipped ?? 0,
      itemsFailed: data.itemsFailed ?? 0,
      errorMessage: data.errorMessage ?? null,
      errorDetails: (data.errorDetails ?? undefined) as never,
      rawSample: (data.rawSample ?? undefined) as never,
    },
  });
}

async function failRun(runId: string, message: string, startedAt = new Date()): Promise<void> {
  await finalizeRun(runId, 'FAILED', startedAt, { errorMessage: message });

  const run = await prisma.extractionRun.findUnique({
    where: { id: runId },
    select: { account: { select: { name: true } } },
  });

  await notifyOperators({
    type: 'EXTRACTION_FAILED',
    severity: 'ERROR',
    title: `فشل استخراج: ${run?.account?.name ?? 'حساب محذوف'}`,
    body: message,
    link: `/admin/extractions/${runId}`,
    entityType: 'extraction_run',
    entityId: runId,
  });

  await auditSystem({
    action: AUDIT_ACTIONS.EXTRACTION_FAILED,
    entityType: 'extraction_run',
    entityId: runId,
    summary: message,
  });
}

/** التنبيهات التحليلية بعد نجاح الاستيراد */
async function raiseAlerts(
  runId: string,
  accountName: string,
  imported: Awaited<ReturnType<typeof importPosts>>,
): Promise<void> {
  const settings = await getOperationalSettings();
  const totalAnalyzed =
    imported.sentimentCounts.positive +
    imported.sentimentCounts.negative +
    imported.sentimentCounts.neutral;

  await notifyOperators({
    type: 'EXTRACTION_SUCCEEDED',
    severity: 'SUCCESS',
    title: `اكتمل استخراج: ${accountName}`,
    body: `حُفظ ${imported.saved} منشوراً جديداً وحُدّث ${imported.updated}${
      imported.failed > 0 ? ` مع تخطي ${imported.failed} عنصراً غير صالح` : ''
    }.`,
    link: `/admin/extractions/${runId}`,
    entityType: 'extraction_run',
    entityId: runId,
  });

  if (imported.topPost && imported.topPost.engagement >= settings.highEngagementThreshold) {
    await notifyOperators({
      type: 'HIGH_ENGAGEMENT_POST',
      severity: 'INFO',
      title: `منشور مرتفع التفاعل على ${accountName}`,
      body: `بلغ التفاعل ${imported.topPost.engagement}. ${(imported.topPost.text ?? '').slice(0, 160)}`,
      link: `/posts/${imported.topPost.id}`,
      entityType: 'post',
      entityId: imported.topPost.id,
    });
  }

  if (totalAnalyzed >= 5) {
    const negativeRatio = imported.sentimentCounts.negative / totalAnalyzed;
    if (negativeRatio >= settings.negativeSentimentRatio) {
      await notifyOperators({
        type: 'NEGATIVE_SENTIMENT_SPIKE',
        severity: 'WARNING',
        title: `ارتفاع في المشاعر السلبية على ${accountName}`,
        body: `${imported.sentimentCounts.negative} من ${totalAnalyzed} منشوراً سلبية في هذه الدفعة.`,
        link: `/admin/extractions/${runId}`,
        entityType: 'extraction_run',
        entityId: runId,
      });
    }
  }

  if (imported.matchedAlertKeywords.length > 0) {
    await notifyOperators({
      type: 'KEYWORD_HIT',
      severity: 'WARNING',
      title: 'ظهور كلمات مفتاحية مهمة',
      body: `ظهرت الكلمات التالية في منشورات ${accountName}: ${imported.matchedAlertKeywords.join('، ')}`,
      link: `/admin/extractions/${runId}`,
      entityType: 'extraction_run',
      entityId: runId,
    });
  }
}

/** إلغاء عملية استخراج قائمة */
export async function cancelExtractionRun(runId: string): Promise<void> {
  const run = await prisma.extractionRun.findUnique({
    where: { id: runId },
    select: { id: true, status: true, apifyRunId: true },
  });
  if (!run) throw new ExtractionError('عملية الاستخراج غير موجودة');
  if (!['PENDING', 'RUNNING'].includes(run.status)) {
    throw new ExtractionError('لا يمكن إلغاء عملية منتهية');
  }

  await prisma.extractionRun.update({
    where: { id: runId },
    data: { status: 'CANCELLED', finishedAt: new Date() },
  });

  await removeExtractionJob(runId);
  if (run.apifyRunId) await abortActorRun(run.apifyRunId).catch(() => undefined);
}
