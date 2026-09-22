import 'server-only';
import type { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/db';
import { buildPostWhere } from '@/lib/queries/posts';
import { postFiltersSchema, type PostFilters } from '@/lib/validation/posts';
import type { AccountScope } from '@/lib/auth/account-scope';
import { enqueueAnalysis, removeAnalysisJob } from '@/lib/queue';
import { notifyOperators } from '@/lib/notifications';
import { getOperationalSettings } from '@/lib/settings';
import { analyzeAndSave } from './persist';

/*
 * جولات التحليل.
 *
 * التحليل كان يُشغَّل من سطر الأوامر وحده (`npm run analyze:posts`)، فلا
 * يملكه إلا من يملك الخادم. وهذا يفتحه من داخل الموقع، ويُبقي أثراً لكل
 * جولة: ما شملته، وكم أُنجز، وكم تعثّر، ومن طلبها.
 *
 * ولا يُنفَّذ في طلب HTTP. تحليل ألف منشور استدعاءٌ متسلسل ألف مرة لمزوّد
 * خارجي — دقائق لا ثوانٍ — والطلب الذي ينتظرها ينقطع قبل أن تنتهي، فيبقى
 * نصف العمل بلا من يُنهيه ولا من يعرف أين توقّف. فالجولة تُسجَّل ثم تُسلَّم
 * إلى العامل الخلفي.
 */

/**
 * خطأ يُعرف حاله.
 *
 * «جولة قائمة» تعارضٌ (409) و«لا منشورات تطابق» طلبٌ غير صالح (400).
 * وبلا تمييز يسقط الاثنان في رمز واحد، فيُعامل العميل الحالتين سواءً:
 * يعيد المحاولة على ما لن ينجح بإعادة، ويستسلم أمام ما ينجح بعد دقيقة.
 */
export class AnalysisRunError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AnalysisRunError';
  }
}

/** حجم الدفعة المقروءة من القاعدة في كل دورة */
const BATCH_SIZE = 25;

/**
 * كل كم منشوراً تُكتب العدّادات.
 *
 * ليست تفصيلاً في الأداء بل نبضُ الجولة: `updatedAt` هو ما يُقاس عليه
 * «هل ما زالت حيّة؟». ولو كُتبت بعد الدفعة وحدها لأمكن لدفعةٍ بطيئة — خمسٌ
 * وعشرون منشوراً، كلٌّ بمهلة أربعين ثانية ومحاولةٍ ثانية — أن تصمت نصف
 * ساعة، فتُقرأ ميتةً وهي تعمل، وتُغلق تحت يد العامل.
 *
 * وخمسةٌ ثمنها خمس كتاباتٍ بمفتاح أوّلي لكل دفعة، بإزاء خمسة استدعاءات
 * شبكية تستغرق ثوانيَ كلٌّ منها. الفارق غير محسوس.
 */
const FLUSH_EVERY = 5;

/** أقصر نصّ يستحق استدعاء المزوّد — ما دونه لا يحمل معنى يُصنَّف */
const MIN_TEXT_LENGTH = 10;

/**
 * سقف الفشل المتتالي.
 *
 * منشورٌ يفشل تحليله وحده حالةٌ عادية — نصّ غريب أو ردّ مشوَّه من النموذج.
 * وثمانيةٌ متتالية ليست كذلك: هي مفتاح انتهى، أو رصيد نفد، أو نموذج سُحب.
 * والمضيّ حينها يحرق آلاف الاستدعاءات الفاشلة قبل أن ينتبه أحد.
 */
const CONSECUTIVE_FAILURE_LIMIT = 8;

/**
 * بعد هذه المدة بلا تقدّم تُعدّ الجولة ميتة.
 *
 * العدّادات تُكتب بعد كل دفعة، فـ`updatedAt` نبضُ الجولة. والعامل الذي
 * يُقتل في منتصف جولة يترك صفّاً حالته RUNNING إلى الأبد، وهو يمنع كل
 * جولة بعده (لا نسمح بجولتين معاً). فتُقرأ الجولة الصامتة فشلاً صريحاً،
 * ويبقى الباب مفتوحاً لإعادة المحاولة.
 *
 * والمدّة أربعةُ أضعاف أسوأ صمتٍ ممكن بين نبضتين (خمسة منشورات × مهلة
 * أربعين ثانية × محاولتين ≈ سبع دقائق)، فلا تُقتل جولةٌ بطيئة بحكمٍ
 * عجول.
 */
const STALE_AFTER_MS = 20 * 60 * 1000;

/** أقصى ما تشمله جولة واحدة — حاجز كلفة لا حدّ تقني */
export const MAX_RUN_LIMIT = 20_000;
export const DEFAULT_RUN_LIMIT = 500;

/** ما يُحفظ في عمود `filters` — الفلاتر ونطاق طالبها معاً */
interface StoredFilters {
  filters: PostFilters;
  scope: string[] | null;
}

/**
 * النطاق يُجمَّد لحظة الطلب لا لحظة التنفيذ.
 *
 * العامل الخلفي لا جلسة له، فلا يعرف من طلب الجولة ولا ما يملك. ولو
 * قرأ النطاق عند التنفيذ لتغيّر الجواب لو عُدّل إسناد الحسابات بين
 * الطلب والتنفيذ — فتُحلَّل حسابات لم يكن للطالب حقّ فيها حين طلب.
 */
export function storedFilters(filters: PostFilters, scope: AccountScope): StoredFilters {
  return { filters, scope };
}

/** إعادة قراءة ما خُزّن — بتحقّق كامل، فالعمود JSON حرّ الشكل */
function readStored(value: Prisma.JsonValue | null): StoredFilters {
  const raw = (value ?? {}) as { filters?: unknown; scope?: unknown };
  const filters = postFiltersSchema.parse(raw.filters ?? {});
  const scope = Array.isArray(raw.scope) ? (raw.scope as string[]) : null;
  return { filters, scope };
}

/** شرط المنشورات المشمولة بالجولة */
function targetWhere(stored: StoredFilters, reanalyze: boolean): Prisma.PostWhereInput {
  return {
    ...buildPostWhere(stored.filters, stored.scope),
    // منشورٌ بلا نصّ لا يُحلَّل: لا مادة للنموذج، والاستدعاء كلفةٌ بلا ناتج
    text: { not: null },
    // ما لم تُطلب الإعادة، تُتخطّى المنشورات التي لها تحليل سابق
    ...(reanalyze ? {} : { analysis: { is: null } }),
  };
}

/** عدد المنشورات التي ستشملها جولة بهذه الفلاتر */
export async function countAnalysisTargets(
  filters: PostFilters,
  scope: AccountScope,
  reanalyze: boolean,
): Promise<number> {
  return prisma.post.count({ where: targetWhere(storedFilters(filters, scope), reanalyze) });
}

/**
 * إنهاء الجولات الصامتة.
 *
 * تُستدعى قبل كل قراءة للقائمة وقبل كل إنشاء: أرخص من مؤقّت دوري، ولا
 * تعمل إلا حين ينظر أحد.
 */
export async function reapStaleRuns(): Promise<number> {
  const { count } = await prisma.analysisRun.updateMany({
    where: {
      status: { in: ['PENDING', 'RUNNING'] },
      updatedAt: { lt: new Date(Date.now() - STALE_AFTER_MS) },
    },
    data: {
      status: 'FAILED',
      finishedAt: new Date(),
      errorMessage: 'توقّفت الجولة بلا تقدّم — تأكّد من تشغيل العامل الخلفي ثم أعد المحاولة',
    },
  });
  return count;
}

/** الجولة القائمة الآن، إن وُجدت */
export async function activeRun() {
  return prisma.analysisRun.findFirst({
    where: { status: { in: ['PENDING', 'RUNNING'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, total: true, done: true, createdAt: true },
  });
}

export interface CreateAnalysisRunOptions {
  filters: PostFilters;
  scope: AccountScope;
  reanalyze: boolean;
  limit: number;
  requestedById: string;
}

export interface CreateAnalysisRunResult {
  run: { id: string; total: number };
  queued: boolean;
  message?: string;
}

/**
 * تسجيل جولة وتسليمها للطابور.
 *
 * جولةٌ واحدة في الوقت الواحد. والمنع ليس تحفّظاً: جولتان على المنشورات
 * نفسها تستدعيان المزوّد مرّتين لكلّ منشور وتكتبان فوق بعضهما، فتُدفع
 * الكلفة مضاعفةً ويبقى في القاعدة أحدُ الحكمين بلا قاعدة تقول أيّهما.
 */
export async function createAnalysisRun(
  options: CreateAnalysisRunOptions,
): Promise<CreateAnalysisRunResult> {
  await reapStaleRuns();

  const existing = await activeRun();
  if (existing) {
    throw new AnalysisRunError(
      409,
      'هناك جولة تحليل قائمة الآن — انتظر انتهاءها أو ألغِها قبل بدء جولة جديدة',
    );
  }

  const stored = storedFilters(options.filters, options.scope);
  const matching = await prisma.post.count({ where: targetWhere(stored, options.reanalyze) });
  const total = Math.min(matching, options.limit);

  if (total === 0) {
    throw new AnalysisRunError(
      400,
      options.reanalyze
        ? 'لا منشورات تطابق هذه الفلاتر'
        : 'لا منشورات غير محلَّلة تطابق هذه الفلاتر — فعّل «إعادة تحليل المحلَّل سابقاً» إن أردت إعادتها',
    );
  }

  const run = await prisma.analysisRun.create({
    data: {
      status: 'PENDING',
      filters: stored as unknown as Prisma.InputJsonValue,
      reanalyze: options.reanalyze,
      total,
      requestedById: options.requestedById,
    },
    select: { id: true, total: true },
  });

  const jobId = await enqueueAnalysis(run.id);
  if (jobId) {
    await prisma.analysisRun.update({ where: { id: run.id }, data: { queueJobId: jobId } });
    return { run, queued: true };
  }

  /*
   * تعذّر الطابور يُنهي الجولة فوراً لا يتركها معلّقة.
   *
   * الجولة المعلّقة تمنع كلّ جولة بعدها ولا ينفّذها أحد — قفلٌ دائم على
   * ميزةٍ كاملة. والفشل الصريح يقول السبب ويترك الباب مفتوحاً.
   */
  await prisma.analysisRun.update({
    where: { id: run.id },
    data: {
      status: 'FAILED',
      finishedAt: new Date(),
      errorMessage:
        'تعذّرت إضافة الجولة إلى الطابور — تأكّد من تشغيل Redis والعامل الخلفي ثم أعد المحاولة',
    },
  });

  return {
    run,
    queued: false,
    message: 'تعذّرت إضافة الجولة إلى الطابور — تأكّد من تشغيل Redis والعامل الخلفي',
  };
}

/** إلغاء جولة — الحالة في القاعدة هي إشارة التوقّف التي تقرأها الحلقة */
export async function cancelAnalysisRun(runId: string): Promise<boolean> {
  const { count } = await prisma.analysisRun.updateMany({
    where: { id: runId, status: { in: ['PENDING', 'RUNNING'] } },
    data: { status: 'CANCELLED', finishedAt: new Date() },
  });
  if (count === 0) return false;

  await removeAnalysisJob(runId);
  return true;
}

interface Counters {
  done: number;
  failed: number;
  negative: number;
  review: number;
  flagged: number;
}

/** أقلّ عدد محلَّل يُبنى عليه إنذار — نسبةٌ من ثلاثة منشورات ليست ظاهرة */
const ALERT_MIN_SAMPLE = 5;

/**
 * إنذار ارتفاع السلبية — بعد الجولة لا بعد الاستيراد.
 *
 * كان يُحسب عند الاستيراد من تصنيفٍ يضعه محرّك كلمات مفتاحية يقيس نبرة
 * النصّ، فيُنذر لأن الدفعة ذكرت «حادث» و«تأخير» لا لأن فيها نقداً
 * للجهات. وهنا يُحسب من تصنيفٍ وضعته السياسة على منشورات قرأها النموذج،
 * فالرقم يعني ما يقوله.
 *
 * ولا يُفشل الجولة إن تعثّر: الجولة انتهت وحُفظت، والإنذار خدمةٌ فوقها.
 */
async function raiseNegativeAlert(runId: string, counters: Counters): Promise<void> {
  try {
    if (counters.done < ALERT_MIN_SAMPLE) return;

    const settings = await getOperationalSettings();
    const ratio = counters.negative / counters.done;
    if (ratio < settings.negativeSentimentRatio) return;

    await notifyOperators({
      type: 'NEGATIVE_SENTIMENT_SPIKE',
      severity: 'WARNING',
      title: 'ارتفاع في المنشورات السلبية تجاه الجهات والخدمات',
      body: `${counters.negative} من ${counters.done} منشوراً صُنّفت سلبيةً في هذه الجولة (${Math.round(ratio * 100)}%).`,
      link: '/admin/analysis',
      entityType: 'analysis_run',
      entityId: runId,
    });
  } catch (error) {
    console.error('[analysis] تعذّر رفع إنذار السلبية:', error);
  }
}

/** كتابة العدّادات — كل خمسة منشورات وفي نهاية كل دفعة */
async function flush(runId: string, counters: Counters): Promise<void> {
  await prisma.analysisRun.update({ where: { id: runId }, data: { ...counters } });
}

/**
 * تنفيذ الجولة — يعمل في العامل الخلفي وحده.
 *
 * متسلسل لا متوازٍ، كما في أداة سطر الأوامر: التوازي يضرب حدّ الطلبات لدى
 * المزوّد فتفشل الدفعة كلها بدل أن تبطؤ.
 */
export async function executeAnalysisRun(runId: string): Promise<void> {
  const run = await prisma.analysisRun.findUnique({
    where: { id: runId },
    select: { id: true, status: true, filters: true, reanalyze: true, total: true },
  });
  if (!run) return;
  if (run.status !== 'PENDING') return;

  const stored = readStored(run.filters);
  const where = targetWhere(stored, run.reanalyze);

  await prisma.analysisRun.update({
    where: { id: runId },
    data: { status: 'RUNNING', startedAt: new Date() },
  });

  const counters: Counters = { done: 0, failed: 0, negative: 0, review: 0, flagged: 0 };
  let consecutiveFailures = 0;
  let cursor: string | undefined;
  let stopReason: string | null = null;
  let cancelled = false;

  try {
    for (;;) {
      const processed = counters.done + counters.failed;
      if (processed >= run.total) break;

      /*
       * حالة الجولة تُقرأ قبل كل دفعة.
       *
       * هي قناة الإلغاء الوحيدة: الواجهة تكتب CANCELLED في القاعدة،
       * والحلقة تقرؤها فتتوقّف. ولا تُقرأ بعد كل منشور — استعلامٌ لكل
       * منشور ثمنُ استجابةٍ أسرع بثوانٍ معدودة، ولا يستحقّه.
       */
      const current = await prisma.analysisRun.findUnique({
        where: { id: runId },
        select: { status: true },
      });
      if (!current || current.status !== 'RUNNING') {
        // أُلغيت من الواجهة، أو أُغلقت لصمتها — وفي الحالين لا تُكتب حالتها هنا
        cancelled = true;
        break;
      }

      const posts = await prisma.post.findMany({
        where,
        select: { id: true, text: true },
        orderBy: { id: 'asc' },
        take: Math.min(BATCH_SIZE, run.total - processed),
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      if (posts.length === 0) break;
      cursor = posts[posts.length - 1]!.id;

      for (const post of posts) {
        const text = (post.text ?? '').trim();
        if (text.length < MIN_TEXT_LENGTH) continue;

        try {
          const result = await analyzeAndSave(post.id, text);
          counters.done += 1;
          consecutiveFailures = 0;
          if (result.sentiment === 'NEGATIVE') counters.negative += 1;
          if (result.needsReview) counters.review += 1;
          if (result.riskFlags.length > 0) counters.flagged += 1;
        } catch (error) {
          counters.failed += 1;
          consecutiveFailures += 1;
          console.error(
            `[analysis] فشل تحليل ${post.id}:`,
            error instanceof Error ? error.message : error,
          );
          if (consecutiveFailures >= CONSECUTIVE_FAILURE_LIMIT) {
            stopReason = `توقّفت الجولة بعد ${CONSECUTIVE_FAILURE_LIMIT} إخفاقات متتالية — يُرجَّح أن العطب في المفتاح أو الرصيد لا في المنشورات`;
            break;
          }
        }

        if ((counters.done + counters.failed) % FLUSH_EVERY === 0) {
          await flush(runId, counters);
        }
      }

      await flush(runId, counters);
      if (stopReason) break;
    }

    if (cancelled) {
      // الحالة كُتبت CANCELLED من الخارج؛ تُحفظ العدّادات وحدها
      await flush(runId, counters);
      return;
    }

    await prisma.analysisRun.update({
      where: { id: runId },
      data: {
        ...counters,
        status: stopReason ? 'FAILED' : 'SUCCEEDED',
        errorMessage: stopReason,
        finishedAt: new Date(),
      },
    });

    if (!stopReason) await raiseNegativeAlert(runId, counters);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'خطأ غير متوقّع';
    console.error('[analysis] فشلت الجولة:', message);
    await prisma.analysisRun
      .update({
        where: { id: runId },
        data: { ...counters, status: 'FAILED', errorMessage: message, finishedAt: new Date() },
      })
      .catch(() => undefined);
  }
}
