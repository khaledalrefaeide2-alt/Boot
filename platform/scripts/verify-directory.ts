/**
 * فحص شاشة «المنصات» — دليل الحسابات ومنشورات الحساب.
 *
 *   npm run verify:directory                                  # المنطق والشيفرة
 *   VERIFY_DATABASE_URL=postgresql://… npm run verify:directory  # ومعها القاعدة
 *
 * ثلاث طبقات:
 *
 * ١. المنطق الخالص — القسمة إلى تصنيفات، والترتيب، والبحث، وقراءة الرابط.
 *    هي ما يراه القارئ، وتُفحص بلا متصفّح.
 *
 * ٢. القاعدة — أنّ الأرقام محصورةٌ بنطاق المستخدم، وأنّ المخفيّ خارجها.
 *    وخطؤها لا يظهر خطأً: يظهر رقماً أكبر قليلاً يكشف ما لا يحقّ رؤيته.
 *    والصفوف ببادئةٍ مميّزة، وتُحذف في النهاية نجح الفحص أم سقط.
 *
 * ٣. الشيفرة — الحرّاس في مواضعهم، والروابط القديمة المكسورة لم تعد.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALL,
  buildSections,
  countNoun,
  directorySearchParams,
  formatCount,
  directorySummary,
  groupCounts,
  matchesQuery,
  parseDirectoryFilters,
  platformTotals,
  POST_FORMS,
  sortAccounts,
  UNGROUPED,
  type DirectoryAccount,
  type PlatformDirectory,
} from '../src/lib/domain/platform-directory';
import { postFiltersFromSearchParams } from '../src/lib/domain/post-filter-params';
import { formatNumber } from '../src/lib/utils';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

function account(partial: Partial<DirectoryAccount> & { id: string; name: string }): DirectoryAccount {
  return {
    username: null,
    platformId: 'fb',
    groupId: null,
    isActive: true,
    followersCount: null,
    avatarUrl: null,
    avatarKey: null,
    posts: 0,
    engagement: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    views: 0,
    postsThisWeek: 0,
    lastPostAt: null,
    ...partial,
  };
}

// ══════════════ ١. المنطق الخالص ══════════════

const directory: PlatformDirectory = {
  platforms: [
    { id: 'fb', code: 'facebook', name: 'فيسبوك' },
    { id: 'x', code: 'x', name: 'إكس' },
  ],
  // ترتيب الإدارة: الإعلام قبل الوزارات عمداً، ليُعرف أنّه لا أبجدية
  groups: [
    { id: 'g-media', name: 'الإعلام', description: 'القنوات والصحف' },
    { id: 'g-min', name: 'الوزارات', description: null },
    { id: 'g-empty', name: 'مجموعة بلا حسابات ظاهرة', description: null },
  ],
  accounts: [
    account({ id: 'a1', name: 'الأمانة العامة', groupId: 'g-min', posts: 40, engagement: 900, lastPostAt: '2026-10-20T10:00:00Z', postsThisWeek: 3 }),
    account({ id: 'a2', name: 'وزارة الكهرباء', groupId: 'g-min', posts: 40, engagement: 100, lastPostAt: '2026-10-25T10:00:00Z' }),
    account({ id: 'a3', name: 'قناة الأخبار', username: 'NewsTV', groupId: 'g-media', platformId: 'x', posts: 10, engagement: 5000 }),
    account({ id: 'a4', name: 'حساب يتيم', groupId: null, posts: 1 }),
    account({ id: 'a5', name: 'حساب بمجموعة محذوفة', groupId: 'g-gone', posts: 2 }),
  ],
};

const base = { platform: ALL, group: ALL, q: '', sort: 'posts' as const };

const sections = buildSections(directory, base);
check(
  'الأقسام بترتيب الإدارة لا بالأبجدية، و«بلا تصنيف» آخرها',
  sections.map((s) => s.key).join(',') === `g-media,g-min,${UNGROUPED}`,
  sections.map((s) => s.key).join(','),
);
check('المجموعة الفارغة لا تُعرض قسماً', !sections.some((s) => s.key === 'g-empty'));
check(
  'الحساب في مجموعةٍ غير معروفة يقع في «بلا تصنيف» لا يضيع',
  sections.find((s) => s.key === UNGROUPED)?.accounts.some((a) => a.id === 'a5') === true,
);
check(
  'مجموع القسم من حساباته',
  sections.find((s) => s.key === 'g-min')?.posts === 80 && sections.find((s) => s.key === 'g-min')?.engagement === 1000,
);
check(
  'الترتيب بالمنشورات، والاسم فاصلُ التعادل',
  sections.find((s) => s.key === 'g-min')?.accounts.map((a) => a.id).join(',') === 'a1,a2',
);
check(
  'الأحدث نشاطاً يقدّم الأحدث',
  buildSections(directory, { ...base, sort: 'recent' }).find((s) => s.key === 'g-min')?.accounts[0]?.id === 'a2',
);
check(
  'والحساب بلا منشور يأتي آخر الأحدث نشاطاً',
  sortAccounts(directory.accounts, 'recent').at(-1)?.lastPostAt === null,
);
check('فلتر المجموعة يُبقي قسمها وحده', buildSections(directory, { ...base, group: 'g-min' }).map((s) => s.key).join() === 'g-min');
check(
  'فلتر «بلا تصنيف» يُبقي غير المصنَّف وحده',
  buildSections(directory, { ...base, group: UNGROUPED }).map((s) => s.key).join() === UNGROUPED,
);
check(
  'فلتر المنصة يُسقط حسابات غيرها',
  buildSections(directory, { ...base, platform: 'x' }).flatMap((s) => s.accounts).map((a) => a.id).join() === 'a3',
);
check(
  'مجموعةٌ مجهولة في الرابط تُرجع فراغاً لا الكلّ',
  buildSections(directory, { ...base, group: 'zzz' }).length === 0,
);

const noGroups = buildSections({ ...directory, groups: [] }, base);
check(
  'بلا مجموعاتٍ أصلاً: قسمٌ واحد اسمه «الحسابات» لا «بلا تصنيف»',
  noGroups.length === 1 && noGroups[0]?.title === 'الحسابات' && noGroups[0].accounts.length === 5,
);

check('البحث يطبّع العربية: «الامانه» تجد «الأمانة»', matchesQuery(directory.accounts[0]!, 'الامانه'));
check('البحث في المعرّف بلا حساسيةٍ لحالة الأحرف', matchesQuery(directory.accounts[2]!, 'newstv'));
check('و«@» في أوّل البحث لا تمنع المطابقة', matchesQuery(directory.accounts[2]!, '@NewsTV'));
check('والبحث الفارغ يطابق الكلّ', matchesQuery(directory.accounts[3]!, '   '));
check('ولا يطابق ما ليس في الاسم ولا المعرّف', !matchesQuery(directory.accounts[1]!, 'الأخبار'));

const counts = groupCounts(directory, { platform: ALL, q: '' });
check(
  'عدّاد أقراص التصنيف',
  counts.get('g-min') === 2 && counts.get('g-media') === 1 && counts.get(UNGROUPED) === 2 && !counts.has('g-empty'),
);
const totals = platformTotals(directory);
check('أرقام شريط المنصات', totals.get('fb')?.accounts === 4 && totals.get('x')?.posts === 10);
const summary = directorySummary(directory.accounts);
check(
  'الملخّص: الحسابات والمنشورات والنشطة هذا الأسبوع',
  summary.accounts === 5 && summary.posts === 93 && summary.activeThisWeek === 1,
);

check('«١٫٥ ألف منشور» لا «منشوراً»', countNoun(1500, POST_FORMS) === 'منشور');
check('«١٢ منشوراً» و«٣ منشورات»', countNoun(12, POST_FORMS) === 'منشوراً' && countNoun(3, POST_FORMS) === 'منشورات');
check(
  '«٥٠٠ منشور» و«١٠٠ منشور» بالمفرد، و«١٩٩ منشوراً» و«٣١٠ منشورات»',
  countNoun(500, POST_FORMS) === 'منشور' &&
    countNoun(100, POST_FORMS) === 'منشور' &&
    countNoun(199, POST_FORMS) === 'منشوراً' &&
    countNoun(310, POST_FORMS) === 'منشورات',
);
check(
  'العدد القصير يُقرأ كاملاً والطويل مختصراً',
  formatCount(1009) === formatNumber(1009) && formatCount(25_000).includes('ألف'),
);

// — الرابط —
const parsed = parseDirectoryFilters({ platform: 'fb', group: 'none', q: ' وزارة ', sort: 'recent' });
check(
  'قراءة الفلاتر من الرابط',
  parsed.platform === 'fb' && parsed.group === 'none' && parsed.q === 'وزارة' && parsed.sort === 'recent',
);
const hostile = parseDirectoryFilters({
  platform: 'javascript:alert(1)',
  group: '../../etc',
  q: 'x'.repeat(500),
  sort: 'DROP',
});
check(
  'قيمٌ غريبة في الرابط تسقط إلى الافتراضي',
  hostile.platform === ALL && hostile.group === ALL && hostile.q.length === 100 && hostile.sort === 'posts',
);
check('القيمة المكرّرة تُقرأ أولاها', parseDirectoryFilters({ platform: ['fb', 'x'] }).platform === 'fb');
check(
  'الافتراضي لا يُكتب في الرابط، وغيره يُكتب',
  directorySearchParams(base) === '' &&
    directorySearchParams({ ...base, group: 'g-min', q: 'وزارة' }) === `?group=g-min&q=${encodeURIComponent('وزارة')}`,
);
const round = parseDirectoryFilters(
  Object.fromEntries(new URLSearchParams(directorySearchParams({ platform: 'x', group: UNGROUPED, q: 'قناة', sort: 'name' }))),
);
check('الرابط يُكتب ويُقرأ فيعود كما كان', round.platform === 'x' && round.group === UNGROUPED && round.q === 'قناة' && round.sort === 'name');

// — فلاتر شاشة المنشورات من الرابط —
const postFilters = postFiltersFromSearchParams({ accountId: 'cabc123', range: 'all', sentiment: 'NEGATIVE' });
check(
  'شاشة المنشورات تقرأ الحساب والفترة والمشاعر من الرابط',
  postFilters.accountId === 'cabc123' && postFilters.range === 'all' && postFilters.sentiment === 'NEGATIVE',
);
const badPostFilters = postFiltersFromSearchParams({ accountId: "' OR 1=1 --", range: 'forever', sentiment: 'EVIL' });
check(
  'وتُسقط ما ليس بشكله',
  !('accountId' in badPostFilters) && !('range' in badPostFilters) && !('sentiment' in badPostFilters),
);
check(
  'والتاريخ المخصّص لا يُقرأ إلا مع «مخصّص»',
  !('from' in postFiltersFromSearchParams({ range: '30d', from: '2026-01-01' })) &&
    postFiltersFromSearchParams({ range: 'custom', from: '2026-01-01' }).from === '2026-01-01',
);

// ══════════════ ٣. الشيفرة ══════════════

const platformsPage = stripComments(read('src/app/(app)/platforms/page.tsx'));
check('صفحة المنصات تحرسها PLATFORMS_VIEW في الخادم', /if \(!can\(user, PERMISSIONS\.PLATFORMS_VIEW\)\) notFound\(\)/.test(platformsPage));
check('وتمرّر نطاق المستخدم إلى الاستعلام', /getPlatformDirectory\(scope\)/.test(platformsPage));
check(
  'الفلاتر الأولى من الرابط الحيّ — فالرجوع من الحساب لا يمحو التصنيف',
  /useState<DirectoryFilters>\(\(\) =>\s*parseDirectoryFilters\(Object\.fromEntries\(searchParams\.entries\(\)\)\)/.test(
    read('src/app/(app)/platforms/platforms-client.tsx'),
  ) && !/initialFilters/.test(platformsPage),
);

const accountPage = stripComments(read('src/app/(app)/platforms/accounts/[id]/page.tsx'));
check(
  'منشورات الحساب: رؤية المنصات والمنشورات معاً',
  /PERMISSIONS\.PLATFORMS_VIEW\)\s*\|\|\s*!can\(user, PERMISSIONS\.POSTS_VIEW\)\) notFound\(\)/.test(accountPage),
);
check('منشورات الحساب: الحساب خارج النطاق 404', /if \(!scopeAllows\(scope, id\)\) notFound\(\)/.test(accountPage));
check('منشورات الحساب: المعرّف يُفحص شكله قبل القاعدة', /if \(!ID_SHAPE\.test\(id\)\) notFound\(\)/.test(accountPage));
check('منشورات الحساب: الأرقام بلا المخفي', /isHidden: false/.test(accountPage));
check('منشورات الحساب: الرابط الخارجي لـhttp(s) وحده', /\^https\?:/.test(accountPage));

const query = stripComments(read('src/lib/queries/platform-directory.ts'));
check('الاستعلام محصورٌ بالنطاق', /id: \{ in: scope \}/.test(query));
check('والنطاق الفارغ لا يعني «الكلّ»', /scope !== null && scope\.length === 0/.test(query));
check('والأرقام بلا المنشورات المخفية', /isHidden: false/.test(query));

const files = [
  'src/components/sections/top-accounts-section.tsx',
  'src/app/(app)/accounts/[id]/page.tsx',
  'src/app/(app)/posts/[id]/page.tsx',
  'src/app/(admin)/admin/extractions/[id]/page.tsx',
];
for (const file of files) {
  check(`${file}: «منشورات الحساب» تفتح الحساب لا كلّ المنشورات`, !read(file).includes('/posts?accountId='));
}
check(
  'الخطّافات لا تُستدعى بشرط في أبرز الحسابات',
  !/useCan\([^)]*\)\s*&&\s*useCan/.test(read('src/components/sections/top-accounts-section.tsx')),
);
check(
  'شاشة المنشورات تبدأ من فلاتر الرابط',
  /postFiltersFromSearchParams\(await searchParams\)/.test(read('src/app/(app)/posts/page.tsx')) &&
    /\{ \.\.\.EMPTY_FILTERS, \.\.\.initialFilters \}/.test(read('src/app/(app)/posts/posts-client.tsx')),
);
check(
  'الوحدة الخالصة بلا قاعدة',
  !/@\/lib\/db|prisma/.test(stripComments(read('src/lib/domain/platform-directory.ts'))),
);

// ══════════════ ٢. القاعدة ══════════════

async function database() {
  const url = process.env.VERIFY_DATABASE_URL;
  if (!url) {
    console.log('— فحص القاعدة لم يُشغَّل: عرّف VERIFY_DATABASE_URL لتشغيله.\n');
    return;
  }
  process.env.DATABASE_URL = url;
  const { prisma } = await import('../src/lib/db');
  const { getPlatformDirectory } = await import('../src/lib/queries/platform-directory');

  const PREFIX = 'verify-dir-';
  const cleanup = async () => {
    await prisma.post.deleteMany({ where: { dedupeKey: { startsWith: PREFIX } } });
    await prisma.account.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.accountGroup.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.platform.deleteMany({ where: { code: { startsWith: PREFIX } } });
  };

  await cleanup();
  try {
    const live = await prisma.platform.create({ data: { code: `${PREFIX}live`, name: `${PREFIX}منصة`, sortOrder: -100 } });
    const off = await prisma.platform.create({
      data: { code: `${PREFIX}off`, name: `${PREFIX}معطّلة`, status: 'INACTIVE' },
    });
    const group = await prisma.accountGroup.create({ data: { code: `${PREFIX}g`, name: `${PREFIX}مجموعة`, sortOrder: -100 } });

    const mk = (name: string, platformId: string, extra: Record<string, unknown> = {}) =>
      prisma.account.create({
        data: { name: `${PREFIX}${name}`, platformId, url: `https://example.com/${PREFIX}${name}`, ...extra },
      });
    const a1 = await mk('a1', live.id, { groupId: group.id, username: 'a_one' });
    const a2 = await mk('a2', live.id);
    const archived = await mk('archived', live.id, { status: 'INACTIVE' });
    const onOff = await mk('on-off', off.id);

    const day = 24 * 60 * 60 * 1000;
    const now = new Date();
    const post = (accountId: string, platformId: string, key: string, ageDays: number, extra: Record<string, unknown> = {}) =>
      prisma.post.create({
        data: {
          accountId,
          platformId,
          dedupeKey: `${PREFIX}${key}`,
          publishedAt: new Date(now.getTime() - ageDays * day),
          likes: 10,
          comments: 2,
          shares: 1,
          views: 100,
          engagementTotal: 13,
          ...extra,
        },
      });
    await post(a1.id, live.id, 'p1', 1);
    await post(a1.id, live.id, 'p2', 30);
    await post(a1.id, live.id, 'hidden', 0, { isHidden: true, engagementTotal: 999_999 });
    await post(a2.id, live.id, 'p3', 60);
    await post(archived.id, live.id, 'p4', 1);
    await post(onOff.id, off.id, 'p5', 1);

    const mine = (dir: PlatformDirectory) => dir.accounts.filter((row) => row.name.startsWith(PREFIX));

    const all = await getPlatformDirectory(null, now);
    const rows = mine(all);
    const r1 = rows.find((row) => row.id === a1.id);
    check('القاعدة: الحساب المؤرشف والمنصة المعطّلة خارج الدليل', rows.length === 2, rows.map((r) => r.name).join());
    check('القاعدة: المخفيّ خارج العدد والتفاعل', r1?.posts === 2 && r1.engagement === 26, JSON.stringify(r1));
    check('القاعدة: «هذا الأسبوع» من آخر سبعة أيام وحدها', r1?.postsThisWeek === 1);
    check(
      'القاعدة: آخر منشور هو أحدث الظاهر لا المخفي',
      r1?.lastPostAt !== null && new Date(r1!.lastPostAt!).getTime() < now.getTime() - day / 2,
    );
    check('القاعدة: المجموعة والمنصة تُستخرجان من الحسابات', all.groups.some((g) => g.id === group.id) && all.platforms[0]?.id === live.id);
    check('القاعدة: المنصة المعطّلة لا تظهر في الشريط', !all.platforms.some((p) => p.id === off.id));

    const scoped = await getPlatformDirectory([a2.id], now);
    check('القاعدة: النطاق يحصر الحسابات', scoped.accounts.length === 1 && scoped.accounts[0]?.id === a2.id);
    check('القاعدة: والنطاق يحصر المجموعات — لا مجموعةَ لحسابٍ خارجه', !scoped.groups.some((g) => g.id === group.id));
    const empty = await getPlatformDirectory([], now);
    check('القاعدة: النطاق الفارغ دليلٌ فارغ لا الدليل كلّه', empty.accounts.length === 0 && empty.platforms.length === 0);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

database()
  .catch((error) => {
    check('القاعدة: الفحص اكتمل بلا خطأ', false, error instanceof Error ? error.message : String(error));
  })
  .finally(() => {
    const failed = checks.filter((c) => !c.ok);
    for (const c of checks) {
      console.log(`${c.ok ? '✓' : '✗'} ${c.name}${!c.ok && c.detail ? `  ← ${c.detail}` : ''}`);
    }
    console.log(`\n${checks.length - failed.length}/${checks.length} فحصاً ناجحاً`);
    if (failed.length > 0) process.exit(1);
  });
