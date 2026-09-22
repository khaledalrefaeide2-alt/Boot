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
import { cacheRunThumbnails } from '@/lib/media/cache-posts';
import { notifyOperators } from '@/lib/notifications';
import { auditSystem, AUDIT_ACTIONS } from '@/lib/audit';
import { getExcludeReplies, getOperationalSettings } from '@/lib/settings';
import { enqueueExtraction, removeExtractionJob } from '@/lib/queue';
import { classifyRunOutcome } from './outcome';
import type { ExtractionTrigger } from '@/generated/prisma';

export interface CreateRunOptions {
  accountId: string;
  trigger: ExtractionTrigger;
  requestedById?: string | null;
  /** تجاوز عدد المنشورات المحدد في إعدادات الحساب */
  maxItems?: number;
  /** تجاوز نافذة الاستخراج المحددة في إعدادات الحساب */
  windowDays?: number;
  /** بداية النافذة الزمنية YYYY-MM-DD — إلزامية في التشغيل اليدوي */
  fromDate?: string | null;
  /** نهاية النافذة الزمنية YYYY-MM-DD — إلزامية في التشغيل اليدوي */
  toDate?: string | null;
  /** ترتيب النتائج — إكس وحدها */
  sort?: 'Latest' | 'Top' | null;
  /** نوع المحتوى — إنستغرام وحدها */
  resultsType?: 'posts' | 'reels' | null;
  /** المقطع الذي تنتمي إليه التشغيلة من استخراج تاريخي */
  backfill?: { id: string; seq: number } | null;
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
      `لم يُحدَّد مشغّل النظام للمنصة «${account.platform.name}». اضبطه من إدارة المنصات.`,
    );
  }

  // منع تشغيل موازٍ لنفس الحساب
  const active = await prisma.extractionRun.findFirst({
    where: { accountId: account.id, status: { in: ['PENDING', 'RUNNING'] } },
    select: { id: true },
  });
  if (active) throw new ExtractionError('توجد عملية استخراج قائمة لهذا الحساب بالفعل');

  const settings = await getOperationalSettings();

  /*
   * التشغيل اليدوي يلزمه تحديد صريح لكل فلتر: لا نافذة زمنية مفترضة ولا
   * عدد افتراضي. الاستخراج يستهلك حصة مدفوعة ويجلب بيانات تدخل التقارير،
   * فترك القرار لقيمة محفوظة في الإعدادات يعني تشغيلاً لا يعرف صاحبه ما
   * طلبه بالضبط. أما الجدولة التلقائية فتستعمل إعدادات الحساب لأنها لا
   * تجد من يحدد لها شيئاً وقت التشغيل.
   */
  if (options.trigger === 'MANUAL' && (!options.fromDate || !options.toDate || !options.maxItems)) {
    throw new ExtractionError(
      'التشغيل اليدوي يتطلب تحديد النطاق الزمني وأقصى عدد للمنشورات قبل البدء',
    );
  }

  const requestedMax = options.maxItems ?? account.maxItemsPerRun ?? settings.defaultMaxItems;
  // سقف الفوترة الصارم يمنع أي استهلاك زائد مهما كانت الإعدادات
  const maxItems = Math.min(Math.max(1, requestedMax), env.APIFY_MAX_ITEMS_HARD_CAP);

  const windowFrom = options.fromDate ? new Date(`${options.fromDate}T00:00:00.000Z`) : null;
  const windowTo = options.toDate ? new Date(`${options.toDate}T23:59:59.999Z`) : null;

  if (windowFrom && windowTo && windowFrom > windowTo) {
    throw new ExtractionError('تاريخ البداية بعد تاريخ النهاية');
  }

  // النافذة بالأيام تُشتق من الحدود عند تحديدها، وإلا فمن إعدادات الحساب
  const windowDays =
    windowFrom !== null
      ? Math.max(1, Math.ceil((Date.now() - windowFrom.getTime()) / 86_400_000))
      : (options.windowDays ?? account.extractionWindowDays ?? settings.defaultWindowDays);

  const excludeReplies = await getExcludeReplies();

  const input = buildActorInput({
    platformCode: account.platform.code,
    excludeReplies,
    url: account.url,
    username: account.username,
    maxItems,
    windowDays,
    fromDate: options.fromDate ?? null,
    toDate: options.toDate ?? null,
    sort: options.sort ?? null,
    resultsType: options.resultsType ?? null,
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
      windowFrom,
      windowTo,
      backfillId: options.backfill?.id ?? null,
      backfillSeq: options.backfill?.seq ?? null,
      input: input as never,
    },
    select: { id: true, actorId: true, maxItems: true, status: true },
  });

  const jobId = await enqueueExtraction(run.id);
  if (jobId) {
    await prisma.extractionRun.update({ where: { id: run.id }, data: { queueJobId: jobId } });
    return { run, queued: true, accountName: account.name };
  }

  // فشل الإضافة إلى الطابور يُنهي العملية فوراً بحالة «فشل».
  // لو تُركت معلّقة لأقفلت الحساب إلى الأبد: التشغيل اليدوي يُرفض لوجود
  // «عملية قائمة»، والجدولة تتخطّى الحساب للسبب نفسه، فلا يُستخرج منه شيء
  // بعدها إطلاقاً. الفشل الصريح يُبقي الحساب قابلاً لإعادة المحاولة.
  await prisma.extractionRun.update({
    where: { id: run.id },
    data: {
      status: 'FAILED',
      finishedAt: new Date(),
      errorMessage: 'تعذّرت إضافة العملية إلى الطابور — تأكد من تشغيل Redis والعامل الخلفي ثم أعد المحاولة',
    },
  });

  return { run: { ...run, status: 'FAILED' }, queued: false, accountName: account.name };
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
      windowFrom: true,
      windowTo: true,
      input: true,
      attempt: true,
      accountId: true,
      platformId: true,
      account: {
        select: {
          id: true,
          name: true,
          // يلزم لتمييز الردّ على الغير من متابعة سلسلة ذاتية
          username: true,
          platform: { select: { id: true, code: true, name: true } },
        },
      },
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
      await finalizeRun(runId, 'CANCELLED', startedAt, { errorMessage: 'أُوقف التشغيل من النظام' });
      return;
    }

    if (finalRun.status === 'FAILED' || finalRun.status === 'TIMED-OUT') {
      await failRun(
        runId,
        finalRun.status === 'TIMED-OUT'
          ? 'انتهت المهلة المحددة للتشغيل في النظام'
          : 'فشل تشغيل المشغّل في النظام',
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

    /*
     * الحاجز الثاني على الردود.
     *
     * المصدر يستبعدها بمعامل البحث، وهذا يمسك ما يفلت: الحسابات التي
     * لا يُشتقّ لها معرّف تمرّ بمسار الرابط لا البحث، فلا يصلها المعامل
     * أصلاً. وحاجزان على شرط واحد أرخص من صفٍّ خاطئ في قاعدة تُبنى
     * عليها تقارير.
     */
    const imported = await importPosts(mapped.posts, {
      accountId: run.accountId,
      platformId: run.platformId,
      extractionRunId: runId,
      windowFrom: run.windowFrom,
      windowTo: run.windowTo,
      excludeReplies: await getExcludeReplies(),
      accountUsername: run.account?.username ?? null,
    });

    // تحديث عدد المتابعين وصورة الحساب إن أرجعهما الـ Actor
    if (imported.followersCount !== null || imported.authorAvatarUrl) {
      await prisma.account
        .update({
          where: { id: run.accountId },
          data: {
            ...(imported.followersCount !== null
              ? { followersCount: imported.followersCount }
              : {}),
            ...(imported.authorAvatarUrl ? { avatarUrl: imported.authorAvatarUrl } : {}),
          },
        })
        .catch(() => undefined);
    }

    /*
     * المصغّرات تُجلب الآن لا حين تُعرض.
     *
     * روابط صور المنصات موقّعة وتنتهي صلاحيتها بعد ساعات إلى أيام، وهذه هي
     * اللحظة الوحيدة التي يكون فيها الرابط حيّاً بيقين. وتأجيلُها إلى وقت
     * العرض يعني أرشيفاً بلا صور بعد أسبوع.
     *
     * وهي بأفضل جهد: فشلُ صورة — أو المخزن كلّه — لا يُفشل استخراجاً نجح.
     */
    await cacheRunThumbnails(run.id).catch((error: unknown) => {
      console.error('[media] تعذّر حفظ المصغّرات:', error);
    });

    await refreshStatsAfterImport(run.accountId, run.platformId, imported.publishedDates);

    const totalFailed = imported.failed + mapped.failed;
    const { status, message: outcomeMessage } = classifyRunOutcome({
      fetched: items.length,
      saved: imported.saved,
      updated: imported.updated,
      failed: totalFailed,
      firstReason: mapped.failures[0] ?? imported.failures[0] ?? null,
    });

    // «آخر استخراج ناجح» لا يُحدَّث إلا بنجاح فعلي، وإلا بدا الحساب مرصوداً وهو لا يُجلب منه شيء
    await prisma.account.update({
      where: { id: run.accountId },
      data: {
        lastExtractedAt: new Date(),
        ...(status === 'SUCCEEDED' ? { lastSuccessfulRunAt: new Date() } : {}),
      },
    });

    await finalizeRun(runId, status, startedAt, {
      itemsFetched: items.length,
      itemsSaved: imported.saved,
      itemsSkipped: imported.updated,
      itemsOutOfWindow: imported.skipped,
      itemsReplies: imported.replies,
      fetchedFrom: imported.fetchedFrom,
      fetchedTo: imported.fetchedTo,
      itemsFailed: totalFailed,
      errorMessage: outcomeMessage,
      rawSample: items.slice(0, 3),
      errorDetails:
        imported.failures.length > 0 || mapped.failures.length > 0
          ? { importFailures: imported.failures, mappingFailures: mapped.failures }
          : null,
    });

    if (status === 'SUCCEEDED') {
      await raiseAlerts(runId, run.account.name, imported);
    } else {
      await notifyOperators({
        type: 'EXTRACTION_NO_RESULTS',
        severity: status === 'FAILED' ? 'ERROR' : 'WARNING',
        title: `لم يُحفظ شيء: ${run.account.name}`,
        body: outcomeMessage ?? '',
        link: `/admin/extractions/${runId}`,
        entityType: 'extraction_run',
        entityId: runId,
      });
    }

    await auditSystem({
      action: AUDIT_ACTIONS.EXTRACTION_COMPLETED,
      entityType: 'extraction_run',
      entityId: runId,
      summary:
        status === 'SUCCEEDED'
          ? `اكتمل استخراج ${run.account.name}: ${imported.saved} جديد و${imported.updated} محدّث`
          : `انتهى استخراج ${run.account.name} دون حفظ شيء (${items.length} عنصراً، ${totalFailed} مرفوضاً)`,
      metadata: {
        status,
        fetched: items.length,
        saved: imported.saved,
        updated: imported.updated,
        failed: totalFailed,
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
  itemsOutOfWindow?: number;
  itemsReplies?: number;
  fetchedFrom?: Date | null;
  fetchedTo?: Date | null;
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
      itemsOutOfWindow: data.itemsOutOfWindow ?? 0,
      itemsReplies: data.itemsReplies ?? 0,
      fetchedFrom: data.fetchedFrom ?? null,
      fetchedTo: data.fetchedTo ?? null,
      itemsFailed: data.itemsFailed ?? 0,
      errorMessage: data.errorMessage ?? null,
      errorDetails: (data.errorDetails ?? undefined) as never,
      rawSample: (data.rawSample ?? undefined) as never,
    },
  });

  /*
   * المقطع التالي يُنشأ هنا لا في مكان آخر: finalizeRun هي المرور الوحيد
   * الذي تسلكه كلّ نهاية — نجاحاً وفشلاً وبلا نتائج — فوضع السلسلة فيها
   * يعني أن استخراجاً تاريخياً لا يتوقّف لأن مقطعاً انتهى من طريق لم
   * نتذكّره. والاستيراد بالطلب يكسر دورة استيراد بين الوحدتين.
   */
  if (status !== 'CANCELLED') {
    const { advanceBackfill } = await import('./backfill');
    await advanceBackfill(runId).catch((error: unknown) => {
      console.error('[backfill] تعذّر إنشاء المقطع التالي:', error);
    });
  }
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

  /*
   * تنبيه ارتفاع السلبية انتقل إلى نهاية جولة التحليل.
   *
   * كان يُحسب هنا من تصنيفٍ يضعه الاستيراد بمحرّك كلمات مفتاحية يقيس نبرة
   * النصّ — فيُنذر لأن الدفعة ذكرت «حادث» و«تأخير»، لا لأن فيها نقداً
   * للجهات. والإنذار الكاذب المتكرّر أسوأ من لا إنذار: يُسكِت المشغّل عن
   * الحقيقيّ حين يأتي.
   *
   * والاستيراد اليوم لا يصنّف أصلاً، فلا رقم هنا يُبنى عليه. والجولة وحدها
   * تعرف كم منشوراً صُنّف سلبياً وفق السياسة.
   */

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
    select: { id: true, status: true, apifyRunId: true, backfillId: true },
  });
  if (!run) throw new ExtractionError('عملية الاستخراج غير موجودة');
  if (!['PENDING', 'RUNNING'].includes(run.status)) {
    throw new ExtractionError('لا يمكن إلغاء عملية منتهية');
  }

  await prisma.extractionRun.update({
    where: { id: runId },
    data: { status: 'CANCELLED', finishedAt: new Date() },
  });

  /*
   * إلغاء مقطعٍ إلغاءٌ للسلسلة كلها.
   *
   * من يُلغي مقطعاً واحداً من ثمانين لا يقصد أن يستأنف النظام من التاسع
   * بعده — يقصد أن يتوقّف. ولو بقي الاستخراج التاريخي «قائماً» بعد إلغاء
   * مقطعه الجاري لبقي معلّقاً إلى الأبد: لا مقطع يجري، ولا شيء يُنهيه.
   */
  if (run.backfillId) {
    await prisma.backfill.updateMany({
      where: { id: run.backfillId, status: 'RUNNING' },
      data: {
        status: 'CANCELLED',
        stopReason: 'أُلغي أحد مقاطعه من سجل العمليات',
        finishedAt: new Date(),
      },
    });
  }

  await removeExtractionJob(runId);
  if (run.apifyRunId) await abortActorRun(run.apifyRunId).catch(() => undefined);
}
