import 'server-only';
import type { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/db';
import { buildPostWhere } from '@/lib/queries/posts';
import { postFiltersSchema, type PostFilters } from '@/lib/validation/posts';
import { NEWEST_FIRST } from '@/lib/queries/post-order';
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

/** ما يُحفظ في عمود `filters` — الفلاتر ونطاق طالبها وحدُّ الاستخراج معاً */
export interface StoredFilters {
  filters: PostFilters;
  scope: string[] | null;
  /**
   * أقدم لحظة استيراد تدخل الجولة — ISO، وnull تعني بلا حدّ.
   *
   * ولا يُعبَّر عنه بـ`PostFilters`: تلك تُرشِّح بـ`publishedAt` (لحظة
   * النشر في المنصة)، وهذا يُرشِّح بـ`createdAt` (لحظة دخوله قاعدتنا).
   * والفرق جوهري في منصة رصد: منشورٌ نُشر قبل سنة يُستخرج اليوم أوّل
   * مرّة، فهو «وارد اليوم» بكل معنى وإن كان تاريخه قديماً.
   */
  createdSince: string | null;
  /**
   * أعِد تصنيف ما صُنّف قبل هذه اللحظة — ISO، وnull بلا حدّ.
   *
   * وهو المسار الوحيد إلى «أعد تصنيف كلّ ما صُنّف بالقواعد القديمة»: بعد
   * تغيير السياسة أو إضافة وسوم، تبقى آلافُ الصفوف على حكمٍ وُضع بمحرّكٍ
   * لا يعرفها — وهي تُقرأ في اللوحات كأنّها حكمُ اليوم.
   *
   * والقياس `updatedAt` لا `createdAt`: الصفّ يُحدَّث عند إعادة التصنيف،
   * فلو قِيس بالإنشاء لعاد المنشور نفسه في كل جولةٍ بعدها إلى الأبد.
   */
  analyzedBefore: string | null;
}

/**
 * النطاق يُجمَّد لحظة الطلب لا لحظة التنفيذ.
 *
 * العامل الخلفي لا جلسة له، فلا يعرف من طلب الجولة ولا ما يملك. ولو
 * قرأ النطاق عند التنفيذ لتغيّر الجواب لو عُدّل إسناد الحسابات بين
 * الطلب والتنفيذ — فتُحلَّل حسابات لم يكن للطالب حقّ فيها حين طلب.
 */
export function storedFilters(
  filters: PostFilters,
  scope: AccountScope,
  createdSince: Date | null = null,
  analyzedBefore: Date | null = null,
): StoredFilters {
  return {
    filters,
    scope,
    createdSince: createdSince ? createdSince.toISOString() : null,
    analyzedBefore: analyzedBefore ? analyzedBefore.toISOString() : null,
  };
}

/** إعادة قراءة ما خُزّن — بتحقّق كامل، فالعمود JSON حرّ الشكل */
function readStored(value: Prisma.JsonValue | null): StoredFilters {
  const raw = (value ?? {}) as {
    filters?: unknown;
    scope?: unknown;
    createdSince?: unknown;
    analyzedBefore?: unknown;
  };
  const filters = postFiltersSchema.parse(raw.filters ?? {});
  const scope = Array.isArray(raw.scope) ? (raw.scope as string[]) : null;

  /*
   * التاريخ المشوَّه يُقرأ «بلا حدّ» لا `Invalid Date`.
   *
   * `new Date('abc')` لا يرمي، و`createdAt: { gte: Invalid Date }` يمرّ
   * إلى Postgres فيرفضه بخطأ غامض في منتصف الجولة — أو أسوأ: يُقرأ
   * شرطاً لا يطابق شيئاً فتنتهي الجولة «بنجاح» بلا منشور واحد. والسقوط
   * إلى «بلا حدّ» يُصنِّف أكثر ممّا طُلب، وهو أهون من الصمت.
   */
  const readDate = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    return Number.isFinite(Date.parse(value)) ? value : null;
  };

  return {
    filters,
    scope,
    createdSince: readDate(raw.createdSince),
    analyzedBefore: readDate(raw.analyzedBefore),
  };
}

/** شرط المنشورات المشمولة بالجولة */
/**
 * ★ ثلاثة شروط تقع كلّها على علاقة `analysis`، فتُدمَج ولا تُكتب فوق بعضها.
 *
 *   الفلاتر (وسمٌ أو خطورة)، وحدّ «صُنّف قبل»، وشرطُ «بلا تحليل» حين لا
 *   تُطلب الإعادة. وكتابةُ كلٍّ منها كائناً مستقلّاً تجعل الأخير يغلب
 *   صامتاً — ومن طلب «أعد تصنيف ما خطورته ٤ فأعلى» يحصل على «صنّف كلّ ما
 *   لم يُصنَّف»: جولةٌ أوسع بكثير ممّا طُلب، تُنفق على آلافٍ لم يقصدها،
 *   ولا شيء في النتيجة يقول إنّ الفلتر سقط.
 *
 * ★ و«بلا تحليل» يناقض الفلترَ بالوسم أو الخطورة.
 *
 *   منشورٌ له وسمٌ له تحليلٌ بالضرورة. فالجمع بينهما يُرجع صفراً دائماً —
 *   ويُقرأ «لا منشورات تطابق» فيظنّ صاحبه أن لا شيء بهذه المواصفات، وفي
 *   القاعدة آلاف. فيُردّ الطلب صراحةً في `createAnalysisRun` بدل أن يمرّ.
 */
function analysisCondition(stored: StoredFilters, reanalyze: boolean): Prisma.PostWhereInput {
  /*
   * ★ حدُّ «صُنّف قبل» انتقل من صفّ التحليل إلى عمود المنشور.
   *
   *   كان `analysis.updatedAt < X` — شرطاً على جدولٍ آخر، لا فهرس يخدمه
   *   ولا يجتمع مع ترتيب الطابور في مسحٍ واحد. وصار `analyzedAt` عموداً
   *   على المنشور نفسه يحمله الفهرس الذي يحمل الطابور. ومعناه لم يتغيّر:
   *   آخر مرّة مرّ فيها المنشور على التصنيف.
   */
  if (!reanalyze) return { analyzedAt: null };

  /*
   * ★ وجولةُ الإعادة تحمل حدّاً زمنياً دائماً — ولو لم يطلبه أحد.
   *
   *   هذا ما يجعل الطابور يُفرِغ نفسه بلا مؤشّر. المنشور الذي أُعيد
   *   تصنيفه الآن صار `analyzedAt` عنده «الآن»، فخرج من شرط «ما صُنّف
   *   قبل لحظة بدء الجولة» — أي خرج من الطابور بفعل العمل نفسه.
   *
   *   وبلا هذا الحدّ يبقى بعد معالجته، فتقرؤه الدفعة التالية من جديد:
   *   جولةٌ على خمسين ألفاً تُعيد تصنيف الخمسة والعشرين الأُوَل مراراً
   *   حتى يبلغ العدّاد سقفه. والمؤشّر كان يستر هذا، ويستر معه أنّ
   *   الترتيب غير مضمون.
   *
   *   والمنتظرون يدخلون معهم: `null` لا يصمد أمام `<`، فيُذكرون صراحةً.
   */
  const before = new Date(stored.analyzedBefore ?? Date.now());
  return { OR: [{ analyzedAt: null }, { analyzedAt: { lt: before } }] };
}

/** هل تحصر الفلاتر الجولةَ في منشوراتٍ لها تحليل؟ */
export function requiresExistingAnalysis(filters: PostFilters): boolean {
  // و«المصنَّف» منها: جولةٌ بلا إعادة تصنيف على ما صُنِّف طلبٌ متناقض
  return Boolean(filters.label || filters.minSeverity || filters.analyzed === 'yes');
}

/**
 * شرط المنشورات المشمولة بالجولة.
 *
 * ومُصدَّرٌ ليُفحص: ترتيب الطابور وحدوده هي ما انكسر ثلاث مرّات، وفحصُه
 * على قاعدة حقيقية (`verify:queue`) لا يصحّ من خلف واجهةٍ تُخفيه.
 */
export function targetWhere(stored: StoredFilters, reanalyze: boolean): Prisma.PostWhereInput {
  /*
   * ★ التركيب بـ`AND` لا بنشر الكائنات.
   *
   *   كانت الشروط تُنشر في كائنٍ واحد (`{ ...base, ...cond }`)، وهو ما
   *   يجعل مفتاحاً يكتب فوق مفتاحٍ مثله صامتاً. وقد وقع ذلك هنا مرّتين:
   *   مرّةً حين كتب شرطُ التحليل فوق فلتر الوسم، ومرّةً كادت أن تقع حين
   *   صار لشرط الإعادة `OR` — وللبحث النصّي `OR` أيضاً، فكان أحدهما
   *   سيمحو الآخر: جولةٌ على «كلمةٍ بعينها» تصير جولةً على كلّ شيء، بلا
   *   أن يقول شيءٌ إنّ الكلمة سقطت.
   *
   *   و`AND` لا يحتمل ذلك: كلّ شرطٍ قائمٌ بذاته، ولا يُلغي جارَه مهما
   *   تشابهت مفاتيحهما.
   */
  const conditions: Prisma.PostWhereInput[] = [buildPostWhere(stored.filters, stored.scope)];

  /*
   * حدّ الاستخراج — يُجمَّد لحظة الطلب كالنطاق.
   *
   * لو قُرئ «بداية اليوم» عند التنفيذ لاختلف الجواب عن لحظة الطلب:
   * جولةٌ أُنشئت الساعة ١١:٥٩ مساءً وبدأ العامل بها بعد دقيقتين تجد
   * نفسها أمام مجموعةٍ أخرى — تُعدّ ألفاً وتصنّف عشرة. فالقيمة تُحسب
   * مرّةً وتُحفظ، والعدّ والتنفيذ يقرآن المحفوظ نفسه.
   */
  if (stored.createdSince) {
    conditions.push({ createdAt: { gte: new Date(stored.createdSince) } });
  }

  /*
   * المنشور بلا نصّ يدخل الجولة.
   *
   * وكان يُستثنى بـ`text: { not: null }` — فصفحةٌ تنشر صورةً واحدة تحمل
   * كلّ الكلام تبقى «غير محسومة» إلى الأبد، وهي أوضح ما في اللوحة.
   * وطبقةُ الحفظ اليوم تقرأ صورته المخزَّنة وتصنّف منها، فإن لم تجد
   * سجّلت إحالةً إلى المراجعة — ولا يبقى منشورٌ بلا صفّ مهما كان حاله.
   */
  conditions.push(analysisCondition(stored, reanalyze));

  return { AND: conditions };
}

/** عدد المنشورات التي ستشملها جولة بهذه الفلاتر */
export async function countAnalysisTargets(
  filters: PostFilters,
  scope: AccountScope,
  reanalyze: boolean,
  createdSince: Date | null = null,
  analyzedBefore: Date | null = null,
): Promise<number> {
  return prisma.post.count({
    where: targetWhere(storedFilters(filters, scope, createdSince, analyzedBefore), reanalyze),
  });
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
    select: { id: true, status: true, total: true, done: true, createdAt: true, trigger: true },
  });
}

export interface CreateAnalysisRunOptions {
  filters: PostFilters;
  scope: AccountScope;
  reanalyze: boolean;
  limit: number;
  /** null للجولة التلقائية — لا إنسان طلبها */
  requestedById: string | null;
  trigger?: 'MANUAL' | 'AUTO';
  /**
   * أقدم لحظة استيراد تدخل الجولة — null تعني بلا حدّ.
   *
   * المكنسة تمرّره (بداية اليوم) والتشغيل اليدوي لا يمرّره: الحصر قاعدةٌ
   * على الأتمتة، ومن يفتح الشاشة ويطلب جولةً بقصدٍ يريد ما يختاره بفلاتره.
   */
  createdSince?: Date | null;
  /** أعِد تصنيف ما صُنّف قبل هذه اللحظة — للقواعد التي تغيّرت */
  analyzedBefore?: Date | null;
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

  const trigger = options.trigger ?? 'MANUAL';

  /*
   * طلبُ الإنسان يسبق المكنسة.
   *
   * المكنسة تعمل كل بضع دقائق بلا انقطاع، فلو مُنع التشغيل اليدوي لوجودها
   * لصار الزرّ معطّلاً أكثر الوقت — ولا يفهم من يضغطه لماذا. فتُلغى
   * الجولة التلقائية ويُسلَّم الطابور لمن طلب، وما صنّفته قبل الإلغاء
   * محفوظ، وستعود هي في الدورة التالية إلى ما بقي.
   *
   * والعكس لا يصحّ: المكنسة لا تُلغي جولةً يدوية، بل تتخطّى دورتها.
   */
  const existing = await activeRun();
  if (existing) {
    if (trigger === 'MANUAL' && existing.trigger === 'AUTO') {
      await cancelAnalysisRun(existing.id);
    } else {
      throw new AnalysisRunError(
        409,
        trigger === 'MANUAL'
          ? 'هناك جولة تحليل قائمة الآن — انتظر انتهاءها أو ألغِها قبل بدء جولة جديدة'
          : 'جولة قائمة',
      );
    }
  }

  /*
   * التناقض يُردّ قبل أن يُنشأ صفّ.
   *
   * «بلا تحليل» + فلترٌ على التحليل يُرجع صفراً دائماً، ورسالةُ «لا
   * منشورات تطابق» تُقرأ خبراً عن البيانات وهي خبرٌ عن الطلب.
   */
  if (!options.reanalyze && requiresExistingAnalysis(options.filters)) {
    throw new AnalysisRunError(
      400,
      'الترشيح بالوسم أو بدرجة الخطورة يخصّ منشوراتٍ صُنّفت من قبل — فعّل «إعادة تحليل المحلَّل سابقاً»',
    );
  }
  if (options.analyzedBefore && !options.reanalyze) {
    throw new AnalysisRunError(
      400,
      'إعادة تصنيف ما صُنّف قبل تاريخٍ ما تقتضي تفعيل «إعادة تحليل المحلَّل سابقاً»',
    );
  }

  const stored = storedFilters(
    options.filters,
    options.scope,
    options.createdSince ?? null,
    options.analyzedBefore ?? null,
  );
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
      trigger,
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
  /*
   * المتعثّرون يُستبعدون من القراءة التالية.
   *
   * الطابور يُفرِغ نفسه لأنّ المعالجة تُخرج المنشور منه. والمتعثّر لا
   * تُخرجه: يبقى `analyzedAt` فارغاً، فيعود في رأس الدفعة التالية بلا
   * نهاية — وتُنفق الجولة كلّها على منشورٍ واحدٍ لا ينجح.
   *
   * فيُحفظ معرّفه هنا ويُستبعد. والقائمة في الذاكرة لا في القاعدة: هي
   * شأن هذه الجولة وحدها، والجولة التالية تستحقّ أن تحاول من جديد — فقد
   * يكون التعثّر انقطاعاً عابراً عند المزوّد.
   */
  const failedIds = new Set<string>();
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

      /*
       * ★ طابورٌ يُفرِغ نفسه — لا مؤشّرٌ يمشي على جدول.
       *
       *   كانت الحلقة تمشي بمؤشّر (`cursor`) على ترتيب المعرّف. وفي ذلك
       *   عطبان اثنان، كلاهما صامت:
       *
       *   الأول أنّ الترتيب كان `id` — وهو يصلح لأنّ cuid يبدأ بطابع
       *   زمني، وهي خاصّةٌ عَرَضية. فمن بدّل مولّد المعرّفات يوماً يحصل
       *   على ترتيبٍ عشوائي ولا يفشل شيء ولا يقول شيءٌ ما جرى.
       *
       *   والثاني أنّ المؤشّر يفترض مجموعةً ثابتة، والمجموعة هنا تتغيّر
       *   تحت يده: ما يُصنَّف يخرج منها، وما يَرِد أثناء الجولة يدخلها.
       *   فالمؤشّر يتخطّى الوارد الجديد إلى نهاية الجولة — وهو بالضبط ما
       *   تقوم عليه المكنسة.
       *
       *   والطابور اليوم شيءٌ قائم: `analyzedAt IS NULL` عمودٌ عليه
       *   فهرس. والمعالجة تُخرج المنشور منه، فالقراءة التالية «أوّل
       *   خمسةٍ وعشرين في الطابور» تجد ما بعدهم بلا مؤشّر — ويدخل معهم
       *   ما وَرَد قبل لحظة، في موضعه الصحيح من الترتيب لا في آخر الصفّ.
       *
       * والترتيب مستورَد لا مكتوب هنا — انظر `NEWEST_FIRST`.
       */
      const posts = await prisma.post.findMany({
        where: failedIds.size > 0 ? { AND: [where, { id: { notIn: [...failedIds] } }] } : where,
        select: { id: true, text: true },
        orderBy: NEWEST_FIRST,
        take: Math.min(BATCH_SIZE, run.total - processed),
      });

      if (posts.length === 0) break;

      for (const post of posts) {
        /*
         * لا تخطٍّ صامت بعد اليوم.
         *
         * كان القصير يُتخطّى هنا فلا يُعدّ في «أُنجز» ولا في «تعثّر» ولا
         * يُكتب له صفّ — فيعود في كلّ دورة، ويبقى العدّاد لا يصل صفراً.
         * وطبقةُ الحفظ تتولّى أمره الآن: صورةٌ تُقرأ، أو إحالةٌ تُسجَّل.
         */
        try {
          const result = await analyzeAndSave(post.id, post.text ?? '');
          counters.done += 1;
          consecutiveFailures = 0;
          if (result.sentiment === 'NEGATIVE') counters.negative += 1;
          if (result.needsReview) counters.review += 1;
          if (result.riskFlags.length > 0) counters.flagged += 1;
        } catch (error) {
          counters.failed += 1;
          consecutiveFailures += 1;
          failedIds.add(post.id);
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
