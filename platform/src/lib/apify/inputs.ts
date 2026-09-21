import 'server-only';

/**
 * بناء مدخلات الـ Actor لكل منصة.
 * كل منصة لها Actor مختلف بمخطط مدخلات مختلف، والافتراضيات هنا
 * قابلة للتجاوز من إعدادات المنصة أو الحساب في لوحة الإدارة.
 */

export interface BuildInputContext {
  /** رمز المنصة: facebook | x | instagram */
  platformCode: string;
  /** رابط الحساب أو الصفحة المرصودة */
  url: string;
  /** اسم المستخدم إن توفر — بعض الـ Actors تفضّله على الرابط */
  username?: string | null;
  /** أقصى عدد منشورات — سقف الفوترة أيضاً */
  maxItems: number;
  /** نافذة الاستخراج بالأيام — تُشتق من الحدود عند تحديدها يدوياً */
  windowDays: number;
  /** بداية النافذة الزمنية بصيغة YYYY-MM-DD — تُقدَّم على windowDays */
  fromDate?: string | null;
  /** نهاية النافذة الزمنية بصيغة YYYY-MM-DD */
  toDate?: string | null;
  /** ترتيب النتائج — تدعمه إكس وحدها */
  sort?: 'Latest' | 'Top' | null;
  /** نوع المحتوى — تدعمه إنستغرام وحدها */
  resultsType?: 'posts' | 'reels' | null;
  /** مدخلات إضافية من إعدادات المنصة أو الحساب تُدمج فوق الافتراضي */
  overrides?: Record<string, unknown> | null;
  /** استبعاد الردود — افتراضه صحيح، ويُعطَّل من الإعدادات */
  excludeReplies?: boolean;
}

/** تاريخ بصيغة YYYY-MM-DD قبل عدد أيام محدد */
function daysAgoDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

/** استخراج اسم المستخدم من رابط المنصة عند عدم توفره */
export function usernameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const first = segments[0];
    if (!first) return null;
    // تجاهل المسارات العامة التي ليست أسماء حسابات
    if (['p', 'reel', 'reels', 'status', 'posts', 'photo', 'watch'].includes(first)) return null;
    return first.replace(/^@/, '');
  } catch {
    return null;
  }
}

/** فيسبوك — apify/facebook-posts-scraper */
function facebookInput(ctx: BuildInputContext): Record<string, unknown> {
  const input: Record<string, unknown> = {
    startUrls: [{ url: ctx.url }],
    resultsLimit: ctx.maxItems,
    onlyPostsNewerThan: ctx.fromDate ?? daysAgoDate(ctx.windowDays),
  };
  if (ctx.toDate) input.onlyPostsOlderThan = ctx.toDate;
  return input;
}

/**
 * اليوم التالي بصيغة YYYY-MM-DD.
 *
 * يلزم لأن `until:` في بحث إكس حصريّ لا شامل: `until:2026-09-10` يُرجع ما
 * نُشر حتى نهاية التاسع فقط. فطلبُ المستخدم «حتى العاشر» يعني `until:` اليوم
 * الحادي عشر — ونسيانُ هذا يُسقط اليوم الأخير كاملاً من كل تشغيل، بصمت.
 */
function nextDay(date: string): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/**
 * إكس — apidojo/tweet-scraper
 *
 * النطاق الزمني يُمرَّر عبر معاملات بحث إكس نفسها (`from:` و`since:`
 * و`until:`) لا عبر حقلَي `start`/`end` وحدهما.
 *
 * والسبب أثرٌ مقيس لا تفضيل: حين يُمرَّر النطاق بالحقلين وحدهما مع
 * `twitterHandles`، يعود المشغّل بآخر N تغريدة من الحساب بصرف النظر عن
 * المدى — فيصل 839 عنصراً ويقع 798 منها خارج النطاق. والأخطر من الهدر أن
 * السقف يُستهلك على عناصر خارج المدى، فإن كان النطاق المطلوب قديماً نفد
 * السقف قبل بلوغه ولم يصل منه شيء أصلاً.
 *
 * أما `since:`/`until:` فتُطبَّق في محرّك بحث إكس نفسه قبل أن تصل النتائج
 * إلى المشغّل، فيصير كلّ ما يُجلب داخل المدى ويُنفَق السقف عليه وحده.
 *
 * والحقلان يبقيان مُمرَّرين أيضاً: مشغّلٌ يحترمهما يزداد دقّة، ومن يتجاهلهما
 * يحكمه البحث. ولا ضرر من حاجزين على الشرط نفسه.
 */
function xInput(ctx: BuildInputContext): Record<string, unknown> {
  const handle = ctx.username ?? usernameFromUrl(ctx.url);
  const from = ctx.fromDate ?? daysAgoDate(ctx.windowDays);

  const base: Record<string, unknown> = {
    maxItems: ctx.maxItems,
    sort: ctx.sort ?? 'Latest',
    start: from,
    includeSearchTerms: false,
  };
  if (ctx.toDate) base.end = ctx.toDate;

  if (handle) {
    const terms = [`from:${handle}`, `since:${from}`];
    if (ctx.toDate) terms.push(`until:${nextDay(ctx.toDate)}`);

    /*
     * استبعاد الردود من المصدر لا بعد الجلب.
     *
     * الحساب المرصود يردّ على متابعيه عشرات المرات يومياً، وتلك محادثات
     * لا مواقف — «كسل كسل 😂» ليست تغريدة تُحلَّل ولا تُقاس. واستبعادها
     * في محرّك البحث يعني أنها لا تُجلب ولا تُحاسَب عليها أصلاً، بخلاف
     * تصفيتها عندنا بعد أن تُدفع.
     *
     * والثمن أن متابعات السلسلة الذاتية تسقط معها — إكس يعدّها ردوداً —
     * فتبقى التغريدة الأولى من كل سلسلة وتغيب تتمّاتها. ولذلك يُترك
     * الأمر للإعداد: من يحتاج السلاسل كاملة يُعطّله.
     */
    if (ctx.excludeReplies !== false) terms.push('-filter:replies');

    base.searchTerms = [terms.join(' ')];
    /*
     * لا يُمرَّر `twitterHandles` مع `searchTerms`.
     *
     * إرسالهما معاً يجعل المشغّل يجمع مصدرين: نتائج البحث المحدودة بالمدى،
     * وسجلّ الحساب غير المحدود — فيعود الهدر من الباب الذي أُغلق.
     */
  } else {
    base.startUrls = [ctx.url];
  }

  return base;
}

/** إنستغرام — apify/instagram-scraper */
function instagramInput(ctx: BuildInputContext): Record<string, unknown> {
  const input: Record<string, unknown> = {
    directUrls: [ctx.url],
    // لا نطلب التعليقات إطلاقاً — المواصفة تستثنيها صراحةً
    resultsType: ctx.resultsType ?? 'posts',
    resultsLimit: ctx.maxItems,
    searchLimit: 1,
    addParentData: false,
  };
  if (ctx.fromDate) input.onlyPostsNewerThan = ctx.fromDate;
  /*
   * الحدّ الأعلى يلزم للاستخراج التاريخي.
   *
   * بحدٍّ أدنى وحده يُرجع المشغّل الأحدث فالأحدث مهما كانت النافذة، فكلّ
   * نافذة قديمة تُعيد منشورات هذا الشهر ثمّ تُسقطها «خارج النافذة» —
   * تُدفع الحصة ولا يُحفظ شيء، نافذةً بعد نافذة.
   */
  if (ctx.toDate) input.onlyPostsOlderThan = ctx.toDate;
  return input;
}

/** مدخلات عامة لمنصة أُضيفت لاحقاً بلا بانٍ مخصص */
function genericInput(ctx: BuildInputContext): Record<string, unknown> {
  return {
    startUrls: [{ url: ctx.url }],
    maxItems: ctx.maxItems,
    resultsLimit: ctx.maxItems,
  };
}

const BUILDERS: Record<string, (ctx: BuildInputContext) => Record<string, unknown>> = {
  facebook: facebookInput,
  x: xInput,
  twitter: xInput,
  instagram: instagramInput,
};

/**
 * بناء المدخلات النهائية: الافتراضي حسب المنصة، ثم التجاوزات فوقه.
 */
export function buildActorInput(ctx: BuildInputContext): Record<string, unknown> {
  const builder = BUILDERS[ctx.platformCode] ?? genericInput;
  const base = builder(ctx);
  if (!ctx.overrides || Object.keys(ctx.overrides).length === 0) return base;
  return { ...base, ...ctx.overrides };
}

/** الـ Actors الافتراضية — تُستخدم عند عدم تحديدها في إعدادات المنصة */
export const DEFAULT_ACTORS: Record<string, string> = {
  facebook: 'apify~facebook-posts-scraper',
  x: 'apidojo~tweet-scraper',
  instagram: 'apify~instagram-scraper',
};
