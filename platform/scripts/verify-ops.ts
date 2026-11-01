/**
 * فحص غرفة العمليات — الرسوم البيانية وبياناتها.
 *
 *   npm run verify:ops                                   # المنطق والشيفرة
 *   VERIFY_DATABASE_URL=postgresql://… npm run verify:ops  # ومعها القاعدة
 *
 * ١. التجميع الخالص — أنّ الأرقام في الرسوم صحيحة: الأيام الفارغة أصفار لا
 *    فجوات، والوسم يُعدّ مرّةً في المنشور، والتحويل إلى توقيت القارئ.
 * ٢. القاعدة — أنّ الرسوم محصورةٌ بنطاق المستخدم، وأنّ قسم التشغيل لا
 *    يُحسب لمن لا يرى الاستخراج.
 * ٣. الشيفرة — الحرّاس، والألوان من الرموز المُعايَرة لا ألواناً بيد.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  aggregateCounts,
  aggregateOps,
  aggregateRuns,
  bucketStart,
  localizeHeat,
  MIN_POSTS_FOR_AVERAGE,
  topAccounts,
  windowBuckets,
  type OpsPostRow,
} from '../src/lib/domain/ops-aggregate';
import { opsQuerySchema } from '../src/lib/validation/ops';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

function row(partial: Partial<OpsPostRow> & { publishedAt: Date | null }): OpsPostRow {
  return {
    accountId: 'a1',
    platformId: 'fb',
    postType: 'TEXT',
    language: 'ar',
    country: null,
    topicId: null,
    sentiment: 'NEUTRAL',
    hashtags: [],
    likes: 0,
    comments: 0,
    shares: 0,
    views: 0,
    engagementTotal: 0,
    analyzedAt: null,
    analysis: null,
    ...partial,
  };
}

// ══════════════ ١. التجميع ══════════════

const from = new Date('2026-10-20T08:00:00Z');
const to = new Date('2026-10-23T09:00:00Z');
const window = { from, to, bucket: 'day' as const };

check('دلاء النافذة كلّها، أوّلها وآخرها', windowBuckets(from, to, 'day').length === 4);
check('دلاء الساعات ليومٍ واحد', windowBuckets(new Date('2026-10-23T00:00:00Z'), new Date('2026-10-23T23:30:00Z'), 'hour').length === 24);
check('بداية الدلو بالتوقيت العالمي', bucketStart(new Date('2026-10-21T23:59:00Z'), 'day') === '2026-10-21T00:00:00.000Z');

const analysis = (severityLevel: number, extra: Partial<NonNullable<OpsPostRow['analysis']>> = {}) => ({
  severityLevel,
  rumorStatus: 'NONE',
  authorStance: 'NEUTRAL',
  labels: [] as string[],
  needsReview: false,
  ...extra,
});

const rows: OpsPostRow[] = [
  row({
    publishedAt: new Date('2026-10-20T10:00:00Z'),
    sentiment: 'NEGATIVE',
    likes: 10,
    comments: 2,
    shares: 1,
    views: 100,
    engagementTotal: 13,
    hashtags: ['#الكهرباء', 'الكهرباء', 'Water'],
    analysis: analysis(5, { labels: ['HATE_SPEECH', 'HATE_SPEECH'], rumorStatus: 'SUSPECTED_RUMOR', needsReview: true }),
  }),
  row({
    publishedAt: new Date('2026-10-20T22:30:00Z'),
    accountId: 'a2',
    platformId: 'x',
    sentiment: 'POSITIVE',
    engagementTotal: 7,
    hashtags: ['water'],
    analysis: analysis(1),
  }),
  row({ publishedAt: new Date('2026-10-22T05:00:00Z'), sentiment: 'MIXED', engagementTotal: 1 }),
  // خارج النافذة: يُعدّ في المجاميع، ولا يصنع دلواً
  row({ publishedAt: new Date('2026-10-10T05:00:00Z'), sentiment: 'UNKNOWN' }),
  row({ publishedAt: null, analysis: analysis(9) }),
];

const agg = aggregateOps(rows, window);
const day = (iso: string) => agg.series.find((p) => p.date === iso);

check('اليوم الفارغ صفرٌ مرسوم لا فجوة', day('2026-10-21T00:00:00.000Z')?.posts === 0 && agg.series.length === 4);
check('عدّ الدلو ومجموعه', day('2026-10-20T00:00:00.000Z')?.posts === 2 && day('2026-10-20T00:00:00.000Z')?.engagement === 20);
check(
  'المشاعر في الدلو: سلبي وإيجابي، والمختلط «غير ذلك»',
  day('2026-10-20T00:00:00.000Z')?.negative === 1 &&
    day('2026-10-20T00:00:00.000Z')?.positive === 1 &&
    day('2026-10-22T00:00:00.000Z')?.other === 1,
);
check('الخطورة العالية ٤ فأكثر', day('2026-10-20T00:00:00.000Z')?.highRisk === 1);
check('المنشور خارج النافذة لا يصنع دلواً', !agg.series.some((p) => p.date.startsWith('2026-10-10')));
check('المجاميع تشمل الشريحة كلّها', agg.totals.posts === 5 && agg.totals.engagement === 21 && agg.totals.views === 100);
check('الحسابات النشطة', agg.totals.activeAccounts === 2);
check('الخريطة الحرارية بالتوقيت العالمي — الثلاثاء ١٠', agg.heat[2]?.[10] === 1);
check('الوسم يُعدّ مرّةً في المنشور وبلا # ولا حالة أحرف', agg.hashtags.find((h) => h.key === 'الكهرباء')?.count === 1 && agg.hashtags.find((h) => h.key === 'water')?.count === 2);
check('وسم المحتوى المكرّر في منشورٍ يُعدّ مرّة', agg.labels.find((l) => l.key === 'HATE_SPEECH')?.count === 1);
check('الخطورة تُقصّ إلى ٠–٥', agg.severity[5] === 2 && agg.severity[1] === 1 && agg.severity.length === 6);
check('تغطية التحليل: مصنّف وبانتظار ومراجعة', agg.coverage.analyzed === 3 && agg.coverage.pending === 2 && agg.coverage.review === 1);
check('حسب المنصة', agg.byPlatform.get('x')?.posts === 1 && agg.byPlatform.get('fb')?.posts === 4);

const many = new Map([
  ['busy', { posts: 10, engagement: 100 }],
  ['viral', { posts: 1, engagement: 5000 }],
  ['steady', { posts: 4, engagement: 400 }],
]);
const avg = topAccounts(many, 'average');
check(
  `متوسط التفاعل لا يُحسب لمن نشر أقلّ من ${MIN_POSTS_FOR_AVERAGE}`,
  !avg.some((a) => a.id === 'viral') && avg[0]?.id === 'steady' && avg[0]?.value === 100,
);
check('الأعلى تفاعلاً يشمل الكلّ', topAccounts(many, 'engagement')[0]?.id === 'viral');

const runs = aggregateRuns(
  [
    { createdAt: new Date('2026-10-20T09:00:00Z'), status: 'SUCCEEDED', itemsSaved: 12 },
    { createdAt: new Date('2026-10-20T11:00:00Z'), status: 'FAILED', itemsSaved: 0 },
    { createdAt: new Date('2026-10-21T11:00:00Z'), status: 'NO_RESULTS', itemsSaved: 0 },
    { createdAt: new Date('2026-10-01T11:00:00Z'), status: 'SUCCEEDED', itemsSaved: 99 },
  ],
  window,
);
check(
  'عمليات الاستخراج بحالاتها والمحفوظ',
  runs[0]?.succeeded === 1 && runs[0]?.failed === 1 && runs[0]?.saved === 12 && runs[1]?.empty === 1 && runs.reduce((s, r) => s + r.saved, 0) === 12,
);
check(
  'إنتاجية التصنيف في دلائها',
  aggregateCounts([new Date('2026-10-22T01:00:00Z'), new Date('2026-10-22T23:00:00Z')], window)[2]?.count === 2,
);

// التوقيت المحلّي: دمشق +3
process.env.TZ = 'Asia/Damascus';
const utc = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
utc[0]![22] = 5; // الأحد ٢٢:٠٠ عالمياً
const local = localizeHeat(utc);
check('الخريطة تتحوّل إلى توقيت القارئ وتنقلب عند منتصف الليل', local[1]?.[1] === 5 && local[0]?.[22] === 0);

check('الفترة: اليوم و٧ و٣٠ و٩٠ وحدها', opsQuerySchema.safeParse({ range: '90d' }).success && !opsQuerySchema.safeParse({ range: '1y' }).success);
check('معرّف المنصة بشكله وحده', !opsQuerySchema.safeParse({ platformId: "x' OR 1=1" }).success);

// ══════════════ ٣. الشيفرة ══════════════

const page = stripComments(read('src/app/(app)/ops/page.tsx'));
check('الصفحة يحرسها OPS_VIEW في الخادم', /if \(!can\(user, PERMISSIONS\.OPS_VIEW\)\) notFound\(\)/.test(page));
const route = stripComments(read('src/app/api/stats/ops/route.ts'));
check('المسار يحرسه OPS_VIEW', /requirePermission\(PERMISSIONS\.OPS_VIEW\)/.test(route));
check('قسم التشغيل لمن يرى الاستخراج وحده', /operations: can\(user, PERMISSIONS\.EXTRACTION_VIEW\)/.test(route));
const query = stripComments(read('src/lib/queries/ops.ts'));
check('الاستعلام يبني شرطه بالنطاق', /buildPostWhere\(filters, scope\)/.test(query));
check('بلا المنشورات المخفية', /includeHidden: 'false'/.test(query));
check('عمليات الاستخراج محصورةٌ بالنطاق', /accountId: \{ in: scope \}/.test(query));
check('التشغيل لا يُحسب حين لا يُسمح', /options\.operations\s*\?\s*prisma\.extractionRun/.test(query));

const charts = stripComments(read('src/components/charts/ops-charts.tsx'));
const client = stripComments(read('src/app/(app)/ops/ops-client.tsx'));
check('لا ألوان بيد في الرسوم — كلّها رموز', !/#[0-9a-fA-F]{3,8}\b/.test(charts + client));
check('الشبكة خطٌّ متّصل لا متقطّع', !/strokeDasharray/.test(charts));
check('الأعمدة لا تتجاوز ٢٤ بكسل', /maxBarSize=\{24\}/.test(charts) && !/maxBarSize=\{(2[5-9]|[3-9]\d)\}/.test(charts));
check('لا رسم بمحورين', !/yAxisId/.test(charts + client));
check('لا فطيرة ولا حلقة', !/PieChart|<Pie\b/.test(charts + client));
check('القديم يتبع الجديد: لا قائمة منشورات نصّية في الغرفة', !/أعلى المنشورات تفاعلاً/.test(client));

const css = read('src/app/globals.css');
check(
  'ألوان السلاسل الثلاث المُعايَرة (فاتح)',
  css.includes('--chart-1: #008e95;') && css.includes('--chart-2: #d05418;') && css.includes('--chart-3: #295fd4;'),
);
check(
  'وفي الداكن',
  css.includes('--chart-1: #00a0a6;') && css.includes('--chart-2: #db640e;') && css.includes('--chart-3: #4385e4;'),
);
check(
  'تدرّجا الحرارة والخطورة معرّفان في السمتين',
  [1, 2, 3, 4, 5].every((n) => (css.match(new RegExp(`--heat-${n}:`, 'g')) ?? []).length === 2 && (css.match(new RegExp(`--sev-${n}:`, 'g')) ?? []).length === 2),
);

// ══════════════ ٢. القاعدة ══════════════

async function database() {
  const url = process.env.VERIFY_DATABASE_URL;
  if (!url) {
    console.log('— فحص القاعدة لم يُشغَّل: عرّف VERIFY_DATABASE_URL لتشغيله.\n');
    return;
  }
  process.env.DATABASE_URL = url;
  process.env.TZ = 'UTC';
  const { prisma } = await import('../src/lib/db');
  const { getOpsDashboard } = await import('../src/lib/queries/ops');

  const PREFIX = 'verify-ops-';
  const cleanup = async () => {
    await prisma.extractionRun.deleteMany({ where: { actorId: { startsWith: PREFIX } } });
    await prisma.post.deleteMany({ where: { dedupeKey: { startsWith: PREFIX } } });
    await prisma.account.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.platform.deleteMany({ where: { code: { startsWith: PREFIX } } });
  };
  await cleanup();
  try {
    const platform = await prisma.platform.create({ data: { code: `${PREFIX}p`, name: `${PREFIX}منصة` } });
    const mk = (name: string) =>
      prisma.account.create({ data: { name: `${PREFIX}${name}`, platformId: platform.id, url: `https://example.com/${PREFIX}${name}` } });
    const a1 = await mk('a1');
    const a2 = await mk('a2');
    const now = Date.now();
    const post = (accountId: string, key: string, extra: Record<string, unknown> = {}) =>
      prisma.post.create({
        data: { accountId, platformId: platform.id, dedupeKey: `${PREFIX}${key}`, publishedAt: new Date(now - 3_600_000), engagementTotal: 10, ...extra },
      });
    await post(a1.id, 'p1');
    await post(a1.id, 'p2', { sentiment: 'NEGATIVE' });
    await post(a1.id, 'hidden', { isHidden: true, engagementTotal: 99_999 });
    await post(a2.id, 'p3');
    await prisma.extractionRun.create({ data: { accountId: a1.id, platformId: platform.id, actorId: `${PREFIX}x`, status: 'SUCCEEDED', itemsSaved: 3 } });
    await prisma.extractionRun.create({ data: { accountId: a2.id, platformId: platform.id, actorId: `${PREFIX}x`, status: 'FAILED', itemsSaved: 0 } });

    const q = { range: '7d' as const, platformId: platform.id };
    const all = await getOpsDashboard(q, null, { operations: true });
    check('القاعدة: المخفيّ خارج الأرقام', all.totals.posts === 3 && all.totals.engagement === 30, JSON.stringify(all.totals));
    check(
      'القاعدة: التشغيل يُحسب للمشغّل',
      (all.operations?.runs.reduce((s, r) => s + r.succeeded + r.failed, 0) ?? 0) === 2,
    );
    const scoped = await getOpsDashboard(q, [a2.id], { operations: true });
    check('القاعدة: النطاق يحصر المنشورات', scoped.totals.posts === 1 && scoped.accounts.byPosts.every((a) => a.id === a2.id));
    check(
      'القاعدة: والنطاق يحصر عمليات الاستخراج',
      (scoped.operations?.runs.reduce((s, r) => s + r.succeeded, 0) ?? -1) === 0 &&
        (scoped.operations?.runs.reduce((s, r) => s + r.failed, 0) ?? 0) === 1,
    );
    const viewer = await getOpsDashboard(q, null, { operations: false });
    check('القاعدة: بلا إذن الاستخراج لا قسمَ تشغيل', viewer.operations === null);
    const empty = await getOpsDashboard(q, [], { operations: true });
    check('القاعدة: النطاق الفارغ لا يرى شيئاً', empty.totals.posts === 0);
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
