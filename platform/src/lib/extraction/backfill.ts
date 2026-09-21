import 'server-only';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { createExtractionRun, ExtractionError } from './service';
import { planChunks, ChunkPlanError, type Chunk } from './chunks';
import { notifyOperators } from '@/lib/notifications';

/**
 * الاستخراج التاريخي — تشغيل مدىً يمتدّ سنوات نافذةً بعد نافذة.
 *
 * المقاطع تُنشأ واحداً إثر واحد لا دفعةً واحدة. والسبب ليس تنظيمياً:
 * قيد «لا تشغيل موازٍ لنفس الحساب» يمنع وجود أكثر من تشغيلة معلّقة، فلو
 * أُنشئت الثمانون مقدَّماً لسقطت تسعٌ وسبعون منها على القيد نفسه. والتقدّم
 * يُحفظ في صفّ الاستخراج التاريخي، والمقطع التالي يُولد من نهاية سابقه.
 */

/** ثلاثة إخفاقات متتابعة تعني عطباً عاماً لا نافذةً رديئة */
const CONSECUTIVE_FAILURE_LIMIT = 3;

/*
 * كشف المشغّل الذي يتجاهل النافذة.
 *
 * نافذةٌ قديمة تُرجع عشرات العناصر ولا يُحفظ منها شيء لأنها كلها خارج
 * المدى: هذه ليست نافذةً فارغة بل مشغّلاً يُعيد الأحدث مهما طُلب منه.
 * والاستمرار عليه يُنفق الحصة على مقاطعَ لا تُخرج منشوراً واحداً — وهو
 * أسوأ ما يمكن أن يفعله استخراجٌ تاريخي: يبدو عاملاً وهو يحرق ويُهمل.
 */
const WINDOW_IGNORED_LIMIT = 3;
const WINDOW_IGNORED_MIN_ITEMS = 25;

export interface CreateBackfillOptions {
  accountId: string;
  /** بداية المدى YYYY-MM-DD */
  fromDate: string;
  /** نهاية المدى YYYY-MM-DD */
  toDate: string;
  chunkDays: number;
  maxItemsPerChunk: number;
  requestedById?: string | null;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** خطة المقاطع كما حُفظت — تُعاد بناؤها من الصفّ لا تُخزَّن مكرّرة */
function chunksOf(backfill: {
  fromDate: Date;
  toDate: Date;
  chunkDays: number;
}): Chunk[] {
  return planChunks(formatDate(backfill.fromDate), formatDate(backfill.toDate), backfill.chunkDays);
}

/**
 * بدء استخراج تاريخي.
 *
 * يُنشئ الصفّ ثمّ المقطع الأول وحده. وفشل المقطع الأول يُفشل الصفّ فوراً:
 * استخراجٌ تاريخي لم يبدأ لا يجوز أن يبقى «قائماً» في الشاشة.
 */
export async function createBackfill(options: CreateBackfillOptions) {
  let chunks: Chunk[];
  try {
    chunks = planChunks(options.fromDate, options.toDate, options.chunkDays);
  } catch (error) {
    throw error instanceof ChunkPlanError ? new ExtractionError(error.message) : error;
  }

  const first = chunks[0];
  if (!first) throw new ExtractionError('المدى المطلوب لا ينتج أي نافذة');

  const account = await prisma.account.findUnique({
    where: { id: options.accountId },
    select: { id: true, name: true, platformId: true, isActive: true, status: true },
  });
  if (!account) throw new ExtractionError('الحساب غير موجود');
  if (!account.isActive || account.status !== 'ACTIVE') {
    throw new ExtractionError('الحساب معطّل — فعّله قبل تشغيل الاستخراج التاريخي');
  }

  /*
   * استخراجان تاريخيان على حساب واحد يتعارضان لا يتعاونان: كلاهما ينتظر
   * دوره على القيد نفسه، فيتقدّم أحدهما ويتعثّر الآخر بلا سبب ظاهر.
   */
  const running = await prisma.backfill.findFirst({
    where: { accountId: account.id, status: 'RUNNING' },
    select: { id: true },
  });
  if (running) {
    throw new ExtractionError('يوجد استخراج تاريخي قائم لهذا الحساب — انتظر انتهاءه أو ألغِه');
  }

  const maxItemsPerChunk = Math.min(
    Math.max(1, options.maxItemsPerChunk),
    env.APIFY_MAX_ITEMS_HARD_CAP,
  );

  const backfill = await prisma.backfill.create({
    data: {
      accountId: account.id,
      platformId: account.platformId,
      fromDate: new Date(`${options.fromDate}T00:00:00.000Z`),
      toDate: new Date(`${options.toDate}T00:00:00.000Z`),
      chunkDays: options.chunkDays,
      maxItemsPerChunk,
      totalChunks: chunks.length,
      requestedById: options.requestedById ?? null,
    },
    select: { id: true, totalChunks: true },
  });

  try {
    const started = await createExtractionRun({
      accountId: account.id,
      trigger: 'MANUAL',
      requestedById: options.requestedById ?? null,
      maxItems: maxItemsPerChunk,
      fromDate: first.from,
      toDate: first.to,
      backfill: { id: backfill.id, seq: first.seq },
    });

    if (!started.queued) {
      await stopBackfill(backfill.id, 'FAILED', 'تعذّرت إضافة المقطع الأول إلى الطابور');
      throw new ExtractionError(
        'تعذّرت إضافة المقطع الأول إلى الطابور — تأكد من تشغيل Redis والعامل الخلفي',
      );
    }

    return { backfill, chunks: chunks.length, firstRunId: started.run.id, accountName: account.name };
  } catch (error) {
    await stopBackfill(
      backfill.id,
      'FAILED',
      error instanceof Error ? error.message : 'تعذّر بدء الاستخراج التاريخي',
    ).catch(() => undefined);
    throw error;
  }
}

async function stopBackfill(
  id: string,
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED',
  stopReason: string | null,
): Promise<void> {
  await prisma.backfill.updateMany({
    where: { id, status: 'RUNNING' },
    data: { status, stopReason, finishedAt: new Date() },
  });
}

/**
 * المضيّ إلى المقطع التالي بعد انتهاء مقطع.
 *
 * تُستدعى من finalizeRun على كل نهاية غير ملغاة. وهي صامتة تماماً حين لا
 * تكون التشغيلة جزءاً من استخراج تاريخي — وهو الحال الغالب.
 */
export async function advanceBackfill(runId: string): Promise<void> {
  const run = await prisma.extractionRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      status: true,
      accountId: true,
      backfillId: true,
      backfillSeq: true,
      itemsSaved: true,
      itemsFetched: true,
      itemsOutOfWindow: true,
    },
  });

  if (!run?.backfillId || run.backfillSeq === null || !run.accountId) return;

  const backfill = await prisma.backfill.findUnique({
    where: { id: run.backfillId },
    select: {
      id: true,
      status: true,
      fromDate: true,
      toDate: true,
      chunkDays: true,
      totalChunks: true,
      maxItemsPerChunk: true,
      requestedById: true,
      account: { select: { name: true } },
    },
  });

  // ألغي أو انتهى بينما كان المقطع يجري — فلا يُستأنف
  if (!backfill || backfill.status !== 'RUNNING') return;

  const failed = run.status === 'FAILED';

  await prisma.backfill.update({
    where: { id: backfill.id },
    data: {
      doneChunks: { increment: 1 },
      ...(failed ? { failedChunks: { increment: 1 } } : {}),
      itemsSaved: { increment: run.itemsSaved },
      itemsFetched: { increment: run.itemsFetched },
    },
  });

  const accountName = backfill.account?.name ?? 'حساب محذوف';

  /*
   * مقطعٌ فاشل لا يوقف المدى: نافذةٌ واحدة قد تتعثّر لسبب عابر، وإيقاف
   * سنواتٍ بسببها إهدارٌ لما نجح. لكنّ ثلاثة متتابعة ليست تعثّراً عابراً
   * بل عطبٌ عامّ — رصيدٌ نفد أو مشغّلٌ تغيّر — والاستمرار عليه يحرق الحصة
   * مقطعاً بعد مقطع بلا أن يُحفظ شيء.
   */
  if (failed) {
    const recent = await prisma.extractionRun.findMany({
      where: { backfillId: backfill.id },
      orderBy: { backfillSeq: 'desc' },
      take: CONSECUTIVE_FAILURE_LIMIT,
      select: { status: true },
    });

    if (
      recent.length >= CONSECUTIVE_FAILURE_LIMIT &&
      recent.every((entry) => entry.status === 'FAILED')
    ) {
      await stopBackfill(
        backfill.id,
        'FAILED',
        `توقّف بعد ${CONSECUTIVE_FAILURE_LIMIT} مقاطع فاشلة متتابعة — تحقّق من الرصيد والمشغّل`,
      );
      await notifyOperators({
        type: 'EXTRACTION_FAILED',
        severity: 'ERROR',
        title: `توقّف الاستخراج التاريخي: ${accountName}`,
        body: `ثلاثة مقاطع متتابعة فشلت، فأُوقفت السلسلة عند المقطع ${run.backfillSeq} من ${backfill.totalChunks}.`,
        link: `/admin/extractions?backfillId=${backfill.id}`,
        entityType: 'backfill',
        entityId: backfill.id,
      }).catch(() => undefined);
      return;
    }
  }

  /*
   * يُفحص بعد الفشل المتتابع لا قبله: المقطع الذي يفشل لا يحمل عدّادات
   * يُقاس عليها أصلاً.
   */
  if (run.itemsSaved === 0 && run.itemsOutOfWindow >= WINDOW_IGNORED_MIN_ITEMS) {
    const recent = await prisma.extractionRun.findMany({
      where: { backfillId: backfill.id },
      orderBy: { backfillSeq: 'desc' },
      take: WINDOW_IGNORED_LIMIT,
      select: { itemsSaved: true, itemsOutOfWindow: true },
    });

    if (
      recent.length >= WINDOW_IGNORED_LIMIT &&
      recent.every(
        (entry) => entry.itemsSaved === 0 && entry.itemsOutOfWindow >= WINDOW_IGNORED_MIN_ITEMS,
      )
    ) {
      await stopBackfill(
        backfill.id,
        'FAILED',
        'المشغّل يتجاهل النطاق الزمني — ثلاث نوافذ متتابعة جلبت عناصر كلها خارج المدى ولم يُحفظ منها شيء',
      );
      await notifyOperators({
        type: 'EXTRACTION_FAILED',
        severity: 'ERROR',
        title: `أُوقف الاستخراج التاريخي: ${accountName}`,
        body: 'المشغّل يُرجع أحدث ما لديه بصرف النظر عن النافذة المطلوبة، فأُوقفت السلسلة قبل أن تُنفق الحصة على مقاطع لا تُخرج شيئاً.',
        link: `/admin/extractions?backfillId=${backfill.id}`,
        entityType: 'backfill',
        entityId: backfill.id,
      }).catch(() => undefined);
      return;
    }
  }

  const nextSeq = run.backfillSeq + 1;

  if (nextSeq > backfill.totalChunks) {
    await stopBackfill(backfill.id, 'COMPLETED', null);
    const totals = await prisma.backfill.findUnique({
      where: { id: backfill.id },
      select: { itemsSaved: true, doneChunks: true, failedChunks: true },
    });
    await notifyOperators({
      type: 'EXTRACTION_SUCCEEDED',
      severity: 'SUCCESS',
      title: `اكتمل الاستخراج التاريخي: ${accountName}`,
      body: `حُفظ ${totals?.itemsSaved ?? 0} منشوراً عبر ${totals?.doneChunks ?? 0} نافذة${
        totals?.failedChunks ? ` (${totals.failedChunks} منها فشلت)` : ''
      }.`,
      link: `/admin/extractions?backfillId=${backfill.id}`,
      entityType: 'backfill',
      entityId: backfill.id,
    }).catch(() => undefined);
    return;
  }

  const next = chunksOf(backfill).find((chunk) => chunk.seq === nextSeq);
  if (!next) {
    await stopBackfill(backfill.id, 'COMPLETED', null);
    return;
  }

  try {
    const started = await createExtractionRun({
      accountId: run.accountId,
      trigger: 'MANUAL',
      requestedById: backfill.requestedById,
      maxItems: backfill.maxItemsPerChunk,
      fromDate: next.from,
      toDate: next.to,
      backfill: { id: backfill.id, seq: next.seq },
    });

    if (!started.queued) {
      await stopBackfill(backfill.id, 'FAILED', 'تعذّرت إضافة المقطع التالي إلى الطابور');
    }
  } catch (error) {
    await stopBackfill(
      backfill.id,
      'FAILED',
      error instanceof Error ? error.message : 'تعذّر إنشاء المقطع التالي',
    );
  }
}

/** إلغاء استخراج تاريخي — يوقف السلسلة ويلغي مقطعها الجاري */
export async function cancelBackfill(id: string): Promise<void> {
  const backfill = await prisma.backfill.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!backfill) throw new ExtractionError('الاستخراج التاريخي غير موجود');
  if (backfill.status !== 'RUNNING') throw new ExtractionError('الاستخراج التاريخي منتهٍ بالفعل');

  /*
   * الصفّ يُوقَف أولاً ثم المقطع الجاري.
   *
   * العكس يفتح نافذة سباق: إلغاء المقطع يُنهيه، و finalizeRun قد يكون قد
   * قرأ الصفّ وهو «قائم» فيُنشئ المقطع التالي بعد الإلغاء مباشرة.
   */
  await stopBackfill(id, 'CANCELLED', 'أُلغي يدوياً');

  const active = await prisma.extractionRun.findFirst({
    where: { backfillId: id, status: { in: ['PENDING', 'RUNNING'] } },
    select: { id: true },
  });

  if (active) {
    const { cancelExtractionRun } = await import('./service');
    await cancelExtractionRun(active.id).catch(() => undefined);
  }
}
