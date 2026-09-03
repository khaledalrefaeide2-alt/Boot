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
  /** نافذة الاستخراج بالأيام */
  windowDays: number;
  /** مدخلات إضافية من إعدادات المنصة أو الحساب تُدمج فوق الافتراضي */
  overrides?: Record<string, unknown> | null;
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
  return {
    startUrls: [{ url: ctx.url }],
    resultsLimit: ctx.maxItems,
    onlyPostsNewerThan: daysAgoDate(ctx.windowDays),
  };
}

/** إكس — apidojo/tweet-scraper */
function xInput(ctx: BuildInputContext): Record<string, unknown> {
  const handle = ctx.username ?? usernameFromUrl(ctx.url);
  const base: Record<string, unknown> = {
    maxItems: ctx.maxItems,
    sort: 'Latest',
    start: daysAgoDate(ctx.windowDays),
    includeSearchTerms: false,
  };
  // نفضّل المعرّف على الرابط لأنه أدق في هذا الـ Actor
  if (handle) base.twitterHandles = [handle];
  else base.startUrls = [ctx.url];
  return base;
}

/** إنستغرام — apify/instagram-scraper */
function instagramInput(ctx: BuildInputContext): Record<string, unknown> {
  return {
    directUrls: [ctx.url],
    resultsType: 'posts',
    resultsLimit: ctx.maxItems,
    searchLimit: 1,
    addParentData: false,
  };
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
