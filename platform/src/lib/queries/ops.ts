import 'server-only';
import { prisma } from '@/lib/db';
import type { AccountScope } from '@/lib/auth/account-scope';
import { buildPostWhere } from '@/lib/queries/posts';
import { rankEntities } from '@/lib/queries/entities';
import { rankStories } from '@/lib/queries/stories';
import { resolveDateRange } from '@/lib/validation/common';
import type { OpsQuery } from '@/lib/validation/ops';
import {
  aggregateCounts,
  aggregateOps,
  aggregateRuns,
  topAccounts,
  type Count,
  type OpsBucket,
  type OpsPoint,
} from '@/lib/domain/ops-aggregate';

/*
 * سقف المسح.
 *
 * تسعون يوماً من منصةٍ نشطة عشرات الآلاف، والصفّ المقروء أرقامٌ قليلة
 * ووسوم. والسقف حدٌّ للهروب لا ميزانية: إن بلغه المسح قيل ذلك في الشاشة
 * (`truncated`) بدل أن تُعرض أرقامٌ ناقصة كأنّها كاملة.
 */
const ROW_CAP = 150_000;
const SIDE_CAP = 50_000;

export interface OpsDashboard {
  range: OpsQuery['range'];
  bucket: OpsBucket;
  from: string;
  to: string;
  generatedAt: string;
  truncated: boolean;
  totals: { posts: number; engagement: number; likes: number; comments: number; shares: number; views: number; activeAccounts: number };
  series: OpsPoint[];
  heat: number[][];
  sentiment: Count[];
  stance: Count[];
  labels: Count[];
  severity: number[];
  rumor: Count[];
  coverage: { analyzed: number; pending: number; review: number };
  platforms: { id: string; name: string; code: string; posts: number; engagement: number }[];
  groups: { id: string | null; name: string; posts: number }[];
  accounts: {
    byPosts: { id: string; name: string; value: number }[];
    byEngagement: { id: string; name: string; value: number }[];
    byAverage: { id: string; name: string; value: number }[];
  };
  types: Count[];
  languages: Count[];
  countries: Count[];
  topics: { key: string; name: string; count: number }[];
  hashtags: Count[];
  entities: { id: string; name: string; type: string; posts: number }[];
  stories: { id: string; headline: string; posts: number }[];
  /** للمشغّلين وحدهم — يغيب لمن لا يرى عمليات الاستخراج */
  operations: {
    runs: { date: string; succeeded: number; failed: number; empty: number; cancelled: number; saved: number }[];
    analyzed: { date: string; count: number }[];
  } | null;
}

export async function getOpsDashboard(
  query: OpsQuery,
  scope: AccountScope,
  options: { operations: boolean },
): Promise<OpsDashboard> {
  const filters = {
    range: query.range,
    platformId: query.platformId,
    groupId: query.groupId,
    includeHidden: 'false' as const,
  };
  const where = buildPostWhere(filters, scope);
  const { from: rangeFrom, to: rangeTo } = resolveDateRange({ range: query.range });
  const to = rangeTo ?? new Date();
  const from = rangeFrom ?? new Date(to.getTime() - 7 * 86_400_000);
  // اليوم الواحد بالساعات، وما فوقه بالأيام: سلسلةٌ من نقطةٍ واحدة ليست سلسلة
  const bucket: OpsBucket = query.range === 'today' ? 'hour' : 'day';
  const window = { from, to, bucket };

  const rows = await prisma.post.findMany({
    where,
    select: {
      publishedAt: true,
      accountId: true,
      platformId: true,
      postType: true,
      language: true,
      country: true,
      topicId: true,
      sentiment: true,
      hashtags: true,
      likes: true,
      comments: true,
      shares: true,
      views: true,
      engagementTotal: true,
      analyzedAt: true,
      analysis: {
        select: { severityLevel: true, rumorStatus: true, authorStance: true, labels: true, needsReview: true },
      },
    },
    orderBy: { publishedAt: 'desc' },
    take: ROW_CAP,
  });

  const agg = aggregateOps(rows, window);

  /*
   * التشغيل بلا قيد النشر الزمني على المنشور.
   *
   * «كم صُنّف اليوم؟» يُسأل عن وقت التصنيف لا عن وقت النشر: منشورٌ من
   * الأسبوع الماضي صُنّف الآن عملُ اليوم. فالمنشور يُحصر بالنطاق والمنصة
   * والمجموعة وحدها، والنافذة على وقت التصنيف نفسه.
   */
  const unbounded = buildPostWhere({ ...filters, range: 'all' }, scope);

  const accountIds = [...agg.byAccount.keys()];
  const [platforms, accounts, topicRows, entityRank, storyRank, runs, analyzed] = await Promise.all([
    prisma.platform.findMany({ where: { id: { in: [...agg.byPlatform.keys()] } }, select: { id: true, name: true, code: true } }),
    prisma.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, name: true, group: { select: { id: true, name: true, sortOrder: true } } },
    }),
    prisma.topic.findMany({
      where: { id: { in: agg.topics.map((t) => t.key).filter(Boolean) } },
      select: { id: true, name: true },
    }),
    rankEntities({ postWhere: where, take: 10 }),
    rankStories({ postWhere: where, sort: 'posts', take: 8 }),
    options.operations
      ? prisma.extractionRun.findMany({
          where: {
            createdAt: { gte: from, lte: to },
            ...(scope === null ? {} : { accountId: { in: scope } }),
            ...(query.platformId ? { platformId: query.platformId } : {}),
            ...(query.groupId ? { account: { groupId: query.groupId } } : {}),
          },
          select: { createdAt: true, status: true, itemsSaved: true },
          take: SIDE_CAP,
        })
      : Promise.resolve([]),
    options.operations
      ? prisma.postAnalysis.findMany({
          where: { createdAt: { gte: from, lte: to }, post: unbounded },
          select: { createdAt: true },
          take: SIDE_CAP,
        })
      : Promise.resolve([]),
  ]);

  const platformMap = new Map(platforms.map((p) => [p.id, p]));
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const topicMap = new Map(topicRows.map((t) => [t.id, t.name]));

  // المجموعات من حسابات الشريحة نفسها، بترتيب الإدارة، و«بلا تصنيف» آخرها
  const groupTotals = new Map<string, { id: string | null; name: string; posts: number; order: number }>();
  for (const [accountId, stats] of agg.byAccount) {
    const group = accountMap.get(accountId)?.group ?? null;
    const key = group?.id ?? '';
    const entry = groupTotals.get(key) ?? {
      id: group?.id ?? null,
      name: group?.name ?? 'بلا تصنيف',
      posts: 0,
      order: group ? group.sortOrder : Number.MAX_SAFE_INTEGER,
    };
    entry.posts += stats.posts;
    groupTotals.set(key, entry);
  }

  const named = (list: { id: string; value: number }[]) =>
    list.map((row) => ({ ...row, name: accountMap.get(row.id)?.name ?? 'حساب محذوف' }));

  return {
    range: query.range,
    bucket,
    from: from.toISOString(),
    to: to.toISOString(),
    generatedAt: new Date().toISOString(),
    truncated: rows.length >= ROW_CAP,
    totals: agg.totals,
    series: agg.series,
    heat: agg.heat,
    sentiment: agg.sentiment,
    stance: agg.stance,
    labels: agg.labels,
    severity: agg.severity,
    rumor: agg.rumor,
    coverage: agg.coverage,
    platforms: [...agg.byPlatform.entries()]
      .map(([id, v]) => ({
        id,
        name: platformMap.get(id)?.name ?? 'غير معروفة',
        code: platformMap.get(id)?.code ?? '',
        ...v,
      }))
      .sort((a, b) => b.posts - a.posts),
    groups: [...groupTotals.values()]
      .sort((a, b) => b.posts - a.posts || a.order - b.order)
      .map(({ id, name, posts }) => ({ id, name, posts })),
    accounts: {
      byPosts: named(topAccounts(agg.byAccount, 'posts')),
      byEngagement: named(topAccounts(agg.byAccount, 'engagement')),
      byAverage: named(topAccounts(agg.byAccount, 'average')),
    },
    types: agg.types,
    languages: agg.languages,
    countries: agg.countries,
    topics: agg.topics.map((t) => ({ ...t, name: t.key ? (topicMap.get(t.key) ?? 'غير معروف') : 'بلا تصنيف' })),
    hashtags: agg.hashtags,
    entities: entityRank.entities.map((e) => ({ id: e.id, name: e.name, type: e.type, posts: e.posts })),
    stories: storyRank.stories.map((s) => ({ id: s.id, headline: s.headline, posts: s.posts })),
    operations: options.operations
      ? { runs: aggregateRuns(runs, window), analyzed: aggregateCounts(analyzed.map((a) => a.createdAt), window) }
      : null,
  };
}
