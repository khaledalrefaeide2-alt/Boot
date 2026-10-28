import { normalizeForSearch } from '@/lib/analysis/text';
import { arabicPlural, formatCompactNumber, formatNumber } from '@/lib/utils';

/*
 * دليل المنصات — الحسابات مصنّفةً في مجموعاتها.
 *
 * منطقٌ خالص بلا قاعدة ولا متصفّح: الخادم يجمع البيانات مرّةً، والشاشة
 * تصفّيها وترتّبها وتقسّمها في يد القارئ بلا ذهابٍ إلى الخادم مع كلّ حرف
 * يكتبه. والحسابات عشراتٌ أو مئات لا ملايين، فالقائمة كلّها تصل مرّةً
 * واحدة — وهو ما يجعل البحث فورياً.
 *
 * ويُفحص هذا الملف وحده في `verify:directory`، فلا تُختبر القسمة
 * والترتيب عبر متصفّح.
 */

export interface DirectoryAccount {
  id: string;
  name: string;
  username: string | null;
  platformId: string;
  groupId: string | null;
  /** الاستخراج مفعّل — المعطّل يبقى بمنشوراته، ويُوسم */
  isActive: boolean;
  followersCount: number | null;
  avatarUrl: string | null;
  avatarKey: string | null;
  posts: number;
  engagement: number;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  /** منشورات آخر سبعة أيام — نبضُ الحساب لا حجمه */
  postsThisWeek: number;
  /** وقت آخر منشور مستخرج، بصيغة ISO */
  lastPostAt: string | null;
}

export interface DirectoryGroup {
  id: string;
  name: string;
  description: string | null;
}

export interface DirectoryPlatform {
  id: string;
  code: string;
  name: string;
}

export interface PlatformDirectory {
  platforms: DirectoryPlatform[];
  /** بترتيب الظهور المضبوط في الإدارة */
  groups: DirectoryGroup[];
  accounts: DirectoryAccount[];
}

export const ACCOUNT_FORMS = { one: 'حساب', two: 'حسابان', few: 'حسابات', many: 'حساباً' };
export const POST_FORMS = { one: 'منشور', two: 'منشوران', few: 'منشورات', many: 'منشوراً' };

/**
 * تمييز العدد: «١٢ حساباً» و«٣ حسابات» و«٥٠٠ منشور».
 *
 * ★ المئات والألوف تأخذ المفرد.
 *
 *   تمييزُ «مئة» و«ألف» مفردٌ مجرور: «خمسمئة منشور» و«١٫٥ ألف منشور».
 *   و`arabicPlural` يقرأ الآحاد والعشرات وحدها، فيرى في ٥٠٠ صفراً ويعطي
 *   «منشوراً» — وهي خطأٌ يقرؤه كلّ من ينظر إلى الشريط.
 */
export function countNoun(
  value: number,
  forms: { one: string; two: string; few: string; many: string },
): string {
  if (value >= 1000 || (value >= 100 && value % 100 === 0)) return forms.one;
  return arabicPlural(value, forms);
}

/**
 * عددٌ يُقرأ كاملاً ما دام قصيراً.
 *
 * «١ ألف» لعدد ١٬٠٠٩ منشوراً تُضيّع ما يُسأل عنه بالضبط: كم منشوراً
 * استُخرج. والاختصار للأرقام التي لا يُقرأ تمامها — عشرة آلاف فأكثر.
 */
export function formatCount(value: number): string {
  return value < 10_000 ? formatNumber(value) : formatCompactNumber(value);
}

/** قيمة «بلا تصنيف» في الفلتر والرابط — لا تتصادم مع معرّف cuid */
export const UNGROUPED = 'none';
export const ALL = 'all';

export const DIRECTORY_SORTS = [
  { value: 'posts', label: 'الأكثر منشورات' },
  { value: 'engagement', label: 'الأعلى تفاعلاً' },
  { value: 'recent', label: 'الأحدث نشاطاً' },
  { value: 'name', label: 'الاسم' },
] as const;

export type DirectorySort = (typeof DIRECTORY_SORTS)[number]['value'];

export interface DirectoryFilters {
  /** `all` أو معرّف منصة */
  platform: string;
  /** `all` أو معرّف مجموعة أو `none` */
  group: string;
  q: string;
  sort: DirectorySort;
}

export const DEFAULT_DIRECTORY_FILTERS: DirectoryFilters = {
  platform: ALL,
  group: ALL,
  q: '',
  sort: 'posts',
};

const MAX_QUERY = 100;
const ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * قراءة الفلاتر من الرابط.
 *
 * الرابط يُكتب بيد من شاء، فكلّ قيمةٍ تُقبل بشكلها المعروف وحده وما سواها
 * يسقط إلى الافتراضي — لا خطأ ولا صفحةٌ فارغة بسبب حرفٍ زائد في رابطٍ
 * منسوخ.
 */
export function parseDirectoryFilters(
  params: Record<string, string | string[] | undefined>,
): DirectoryFilters {
  const first = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
  };

  const platform = first('platform');
  const group = first('group');
  const sort = first('sort');

  return {
    platform: ID_SHAPE.test(platform) ? platform : ALL,
    group: ID_SHAPE.test(group) ? group : ALL,
    q: first('q').slice(0, MAX_QUERY),
    sort: DIRECTORY_SORTS.some((item) => item.value === sort)
      ? (sort as DirectorySort)
      : DEFAULT_DIRECTORY_FILTERS.sort,
  };
}

/** الفلاتر في الرابط — الافتراضي لا يُكتب، فيبقى الرابط قصيراً */
export function directorySearchParams(filters: DirectoryFilters): string {
  const params = new URLSearchParams();
  if (filters.platform !== ALL) params.set('platform', filters.platform);
  if (filters.group !== ALL) params.set('group', filters.group);
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.sort !== DEFAULT_DIRECTORY_FILTERS.sort) params.set('sort', filters.sort);
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * مطابقة البحث على الاسم والمعرّف معاً.
 *
 * بالتطبيع نفسه الذي يجري على المنشورات: «الأمانة» و«الامانه» حسابٌ واحد
 * عند من يبحث، وإن اختلفت كتابتهما. والمعرّف لاتينيّ غالباً، والتطبيع
 * يصغّر حروفه — فـ«@Ministry» تُوجد بـ«ministry».
 */
export function matchesQuery(account: DirectoryAccount, query: string): boolean {
  const needle = normalizeForSearch(query.replace(/^@/, ''));
  if (!needle) return true;
  const haystack = normalizeForSearch(`${account.name} ${account.username ?? ''}`);
  return haystack.includes(needle);
}

const collator = new Intl.Collator('ar');

/**
 * الترتيب — والاسمُ فاصلُ التعادل دائماً.
 *
 * بلا فاصلٍ ثابت يتبدّل ترتيب حسابين متساويين بين تحميلٍ وتحميل، فيقفز
 * الحساب الذي يبحث عنه القارئ من موضعه وهو ينظر إليه.
 */
export function sortAccounts(accounts: DirectoryAccount[], sort: DirectorySort): DirectoryAccount[] {
  const byName = (a: DirectoryAccount, b: DirectoryAccount) => collator.compare(a.name, b.name);
  const time = (value: string | null) => (value ? new Date(value).getTime() : -Infinity);

  const compare: Record<DirectorySort, (a: DirectoryAccount, b: DirectoryAccount) => number> = {
    posts: (a, b) => b.posts - a.posts || byName(a, b),
    engagement: (a, b) => b.engagement - a.engagement || byName(a, b),
    recent: (a, b) => time(b.lastPostAt) - time(a.lastPostAt) || byName(a, b),
    name: byName,
  };

  return [...accounts].sort(compare[sort]);
}

export interface DirectorySection {
  /** معرّف المجموعة أو `none` */
  key: string;
  title: string;
  description: string | null;
  accounts: DirectoryAccount[];
  posts: number;
  engagement: number;
}

/** الحسابات بعد فلترَي المنصة والبحث — قبل فلتر المجموعة */
export function visibleAccounts(
  directory: PlatformDirectory,
  filters: Pick<DirectoryFilters, 'platform' | 'q'>,
): DirectoryAccount[] {
  return directory.accounts.filter(
    (account) =>
      (filters.platform === ALL || account.platformId === filters.platform) &&
      matchesQuery(account, filters.q),
  );
}

/**
 * القسمة إلى أقسام بحسب التصنيف.
 *
 * ★ بترتيب المجموعات المضبوط في الإدارة لا بالأبجدية ولا بالحجم.
 *
 *   الترتيب قرارُ من صنّف: «الوزارات» قبل «الإعلام» لأنّ أحداً قرّر ذلك.
 *   والقارئ يعرف موضع القسم في كلّ زيارة، ولا ينقلب الدليل حين ينشر
 *   حسابٌ في مجموعةٍ صغيرة يوماً كثيراً.
 *
 * ★ و«بلا تصنيف» آخرُ الأقسام دائماً، ولا يظهر فارغاً.
 *
 * ★ وحين لا توجد مجموعاتٌ أصلاً يصير القسم الوحيد «الحسابات» لا «بلا
 *   تصنيف»: الوسم يقول إنّ شيئاً ينقص، ولا ينقص شيءٌ في منصّةٍ لم تُعرّف
 *   مجموعاتٍ قط.
 */
export function buildSections(
  directory: PlatformDirectory,
  filters: DirectoryFilters,
): DirectorySection[] {
  const accounts = sortAccounts(visibleAccounts(directory, filters), filters.sort);
  const known = new Set(directory.groups.map((group) => group.id));
  const groupOf = (account: DirectoryAccount) =>
    account.groupId && known.has(account.groupId) ? account.groupId : UNGROUPED;

  const buckets = new Map<string, DirectoryAccount[]>();
  for (const account of accounts) {
    const key = groupOf(account);
    if (filters.group !== ALL && key !== filters.group) continue;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(account);
    else buckets.set(key, [account]);
  }

  const section = (
    key: string,
    title: string,
    description: string | null,
  ): DirectorySection | null => {
    const list = buckets.get(key);
    if (!list || list.length === 0) return null;
    return {
      key,
      title,
      description,
      accounts: list,
      posts: list.reduce((sum, account) => sum + account.posts, 0),
      engagement: list.reduce((sum, account) => sum + account.engagement, 0),
    };
  };

  const sections = directory.groups.map((group) => section(group.id, group.name, group.description));
  sections.push(section(UNGROUPED, directory.groups.length > 0 ? 'بلا تصنيف' : 'الحسابات', null));

  return sections.filter((item): item is DirectorySection => item !== null);
}

/** عدد الحسابات في كلّ مجموعة بعد فلترَي المنصة والبحث — لأقراص التصنيف */
export function groupCounts(
  directory: PlatformDirectory,
  filters: Pick<DirectoryFilters, 'platform' | 'q'>,
): Map<string, number> {
  const known = new Set(directory.groups.map((group) => group.id));
  const counts = new Map<string, number>();
  for (const account of visibleAccounts(directory, filters)) {
    const key = account.groupId && known.has(account.groupId) ? account.groupId : UNGROUPED;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** أرقام المنصة لشريط المنصات — حساباتها ومنشوراتها */
export function platformTotals(
  directory: PlatformDirectory,
): Map<string, { accounts: number; posts: number }> {
  const totals = new Map<string, { accounts: number; posts: number }>();
  for (const account of directory.accounts) {
    const entry = totals.get(account.platformId) ?? { accounts: 0, posts: 0 };
    entry.accounts += 1;
    entry.posts += account.posts;
    totals.set(account.platformId, entry);
  }
  return totals;
}

/** ملخّص ما يُعرض — يتبع المنصة المختارة */
export function directorySummary(accounts: DirectoryAccount[]) {
  return {
    accounts: accounts.length,
    posts: accounts.reduce((sum, account) => sum + account.posts, 0),
    engagement: accounts.reduce((sum, account) => sum + account.engagement, 0),
    activeThisWeek: accounts.filter((account) => account.postsThisWeek > 0).length,
  };
}
