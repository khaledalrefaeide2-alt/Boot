import 'server-only';
import { prisma } from '@/lib/db';
import { buildPostWhere } from './posts';
import { topWords } from '@/lib/analysis/text';
import type { PostFilters } from '@/lib/validation/posts';
import { resolveDateRange } from '@/lib/validation/common';

/**
 * استعلامات الإحصاءات.
 * الأعداد الكبيرة تُقرأ من جداول الإحصاءات اليومية كلما أمكن،
 * والتجميع المباشر يقتصر على ما لا يمكن حسابه مسبقاً.
 */

export interface OverviewStats {
  totalPosts: number;
  postsToday: number;
  postsThisWeek: number;
  postsThisMonth: number;
  accountsCount: number;
  platformsCount: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalViews: number;
  totalEngagement: number;
  engagementRate: number;
  topPost: {
    id: string;
    text: string | null;
    url: string | null;
    engagementTotal: number;
    publishedAt: Date | null;
    accountName: string;
    platformName: string;
  } | null;
  topPlatform: { id: string; name: string; code: string; postsCount: number } | null;
}

function startOfDay(offsetDays = 0): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - offsetDays);
  return date;
}

/** بطاقات أعلى لوحة العرض */
export async function getOverviewStats(filters: PostFilters): Promise<OverviewStats> {
  const where = buildPostWhere(filters);

  const [totals, today, week, month, accountsCount, platformsCount, topPost, byPlatform] =
    await Promise.all([
      prisma.post.aggregate({
        where,
        _count: { _all: true },
        _sum: { likes: true, comments: true, shares: true, views: true, engagementTotal: true },
      }),
      prisma.post.count({ where: { ...where, publishedAt: { gte: startOfDay() } } }),
      prisma.post.count({ where: { ...where, publishedAt: { gte: startOfDay(7) } } }),
      prisma.post.count({ where: { ...where, publishedAt: { gte: startOfDay(30) } } }),
      prisma.account.count({ where: { status: 'ACTIVE' } }),
      prisma.platform.count({ where: { status: 'ACTIVE' } }),
      prisma.post.findFirst({
        where,
        orderBy: { engagementTotal: 'desc' },
        select: {
          id: true,
          text: true,
          url: true,
          engagementTotal: true,
          publishedAt: true,
          account: { select: { name: true } },
          platform: { select: { name: true } },
        },
      }),
      prisma.post.groupBy({
        by: ['platformId'],
        where,
        _count: { _all: true },
        orderBy: { _count: { platformId: 'desc' } },
        take: 1,
      }),
    ]);

  const postsCount = totals._count._all;
  const totalEngagement = totals._sum.engagementTotal ?? 0;

  let topPlatform: OverviewStats['topPlatform'] = null;
  if (byPlatform[0]) {
    const platform = await prisma.platform.findUnique({
      where: { id: byPlatform[0].platformId },
      select: { id: true, name: true, code: true },
    });
    if (platform) topPlatform = { ...platform, postsCount: byPlatform[0]._count._all };
  }

  return {
    totalPosts: postsCount,
    postsToday: today,
    postsThisWeek: week,
    postsThisMonth: month,
    accountsCount,
    platformsCount,
    totalLikes: totals._sum.likes ?? 0,
    totalComments: totals._sum.comments ?? 0,
    totalShares: totals._sum.shares ?? 0,
    totalViews: totals._sum.views ?? 0,
    totalEngagement,
    engagementRate: postsCount > 0 ? Number((totalEngagement / postsCount).toFixed(1)) : 0,
    topPost: topPost
      ? {
          id: topPost.id,
          text: topPost.text,
          url: topPost.url,
          engagementTotal: topPost.engagementTotal,
          publishedAt: topPost.publishedAt,
          accountName: topPost.account.name,
          platformName: topPost.platform.name,
        }
      : null,
    topPlatform,
  };
}

/** سلسلة زمنية للنشر والتفاعل — تُقرأ من الإحصاءات اليومية */
export async function getTimeseries(filters: PostFilters): Promise<
  { date: string; posts: number; engagement: number; likes: number; comments: number; shares: number }[]
> {
  const { from, to } = resolveDateRange({ range: filters.range, from: filters.from, to: filters.to });
  const where = buildPostWhere(filters);

  // نجمّع من جدول المنشورات بفهرس التاريخ لضمان احترام كل الفلاتر
  const posts = await prisma.post.findMany({
    where: { ...where, publishedAt: { not: null, ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } },
    select: { publishedAt: true, engagementTotal: true, likes: true, comments: true, shares: true },
    orderBy: { publishedAt: 'asc' },
    take: 50_000,
  });

  const buckets = new Map<
    string,
    { posts: number; engagement: number; likes: number; comments: number; shares: number }
  >();

  for (const post of posts) {
    if (!post.publishedAt) continue;
    const key = post.publishedAt.toISOString().slice(0, 10);
    const bucket = buckets.get(key) ?? { posts: 0, engagement: 0, likes: 0, comments: 0, shares: 0 };
    bucket.posts += 1;
    bucket.engagement += post.engagementTotal;
    bucket.likes += post.likes;
    bucket.comments += post.comments;
    bucket.shares += post.shares;
    buckets.set(key, bucket);
  }

  return Array.from(buckets.entries())
    .map(([date, values]) => ({ date, ...values }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** التوزيعات: حسب المنصة، النوع، المشاعر، التصنيف، اللغة */
export async function getBreakdowns(filters: PostFilters) {
  const where = buildPostWhere(filters);

  const [byPlatform, byType, bySentiment, byTopic, byLanguage, byCountry] = await Promise.all([
    prisma.post.groupBy({
      by: ['platformId'],
      where,
      _count: { _all: true },
      _sum: { engagementTotal: true },
    }),
    prisma.post.groupBy({ by: ['postType'], where, _count: { _all: true } }),
    prisma.post.groupBy({ by: ['sentiment'], where, _count: { _all: true } }),
    prisma.post.groupBy({ by: ['topicId'], where, _count: { _all: true } }),
    prisma.post.groupBy({ by: ['language'], where, _count: { _all: true } }),
    prisma.post.groupBy({ by: ['country'], where, _count: { _all: true } }),
  ]);

  const [platforms, topics] = await Promise.all([
    prisma.platform.findMany({ select: { id: true, name: true, code: true, color: true } }),
    prisma.topic.findMany({ select: { id: true, name: true, color: true } }),
  ]);

  const platformMap = new Map(platforms.map((p) => [p.id, p]));
  const topicMap = new Map(topics.map((t) => [t.id, t]));

  return {
    byPlatform: byPlatform
      .map((row) => ({
        id: row.platformId,
        name: platformMap.get(row.platformId)?.name ?? 'غير معروفة',
        code: platformMap.get(row.platformId)?.code ?? '',
        posts: row._count._all,
        engagement: row._sum.engagementTotal ?? 0,
      }))
      .sort((a, b) => b.posts - a.posts),
    byType: byType
      .map((row) => ({ type: row.postType, posts: row._count._all }))
      .sort((a, b) => b.posts - a.posts),
    bySentiment: bySentiment
      .map((row) => ({ sentiment: row.sentiment, posts: row._count._all }))
      .sort((a, b) => b.posts - a.posts),
    byTopic: byTopic
      .map((row) => ({
        id: row.topicId,
        name: row.topicId ? (topicMap.get(row.topicId)?.name ?? 'غير معروف') : 'بلا تصنيف',
        posts: row._count._all,
      }))
      .sort((a, b) => b.posts - a.posts),
    byLanguage: byLanguage
      .map((row) => ({ language: row.language, posts: row._count._all }))
      .sort((a, b) => b.posts - a.posts),
    byCountry: byCountry
      .filter((row) => row.country)
      .map((row) => ({ country: row.country as string, posts: row._count._all }))
      .sort((a, b) => b.posts - a.posts)
      .slice(0, 30),
  };
}

/** أكثر الحسابات نشراً وتفاعلاً */
export async function getTopAccounts(filters: PostFilters, limit = 10) {
  const where = buildPostWhere(filters);

  const grouped = await prisma.post.groupBy({
    by: ['accountId'],
    where,
    _count: { _all: true },
    _sum: { engagementTotal: true, likes: true, comments: true, shares: true, views: true },
    orderBy: { _count: { accountId: 'desc' } },
    take: limit,
  });

  if (grouped.length === 0) return [];

  const accounts = await prisma.account.findMany({
    where: { id: { in: grouped.map((row) => row.accountId) } },
    select: {
      id: true,
      name: true,
      followersCount: true,
      platform: { select: { name: true, code: true, color: true } },
    },
  });
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  return grouped.map((row) => {
    const account = accountMap.get(row.accountId);
    const posts = row._count._all;
    const engagement = row._sum.engagementTotal ?? 0;
    return {
      id: row.accountId,
      name: account?.name ?? 'حساب محذوف',
      platformName: account?.platform.name ?? '',
      platformCode: account?.platform.code ?? '',
      followersCount: account?.followersCount ?? null,
      posts,
      engagement,
      likes: row._sum.likes ?? 0,
      comments: row._sum.comments ?? 0,
      shares: row._sum.shares ?? 0,
      views: row._sum.views ?? 0,
      engagementRate: posts > 0 ? Number((engagement / posts).toFixed(1)) : 0,
    };
  });
}

/** أكثر الهاشتاغات استخداماً ضمن الفلاتر الحالية */
export async function getTopHashtags(filters: PostFilters, limit = 25) {
  const where = buildPostWhere(filters);
  const posts = await prisma.post.findMany({
    where: { ...where, hashtags: { isEmpty: false } },
    select: { hashtags: true },
    take: 20_000,
  });

  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.hashtags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** أكثر الكلمات تكراراً — خريطة حرارية للكلمات */
export async function getTopWords(filters: PostFilters, limit = 50) {
  const where = buildPostWhere(filters);
  const posts = await prisma.post.findMany({
    where: { ...where, text: { not: null } },
    select: { text: true },
    take: 10_000,
  });
  return topWords(posts.map((p) => p.text), limit);
}

/** أعلى المنشورات تفاعلاً */
export async function getTopPosts(filters: PostFilters, limit = 10) {
  const where = buildPostWhere(filters);
  return prisma.post.findMany({
    where,
    orderBy: { engagementTotal: 'desc' },
    take: limit,
    select: {
      id: true,
      text: true,
      url: true,
      publishedAt: true,
      engagementTotal: true,
      likes: true,
      comments: true,
      shares: true,
      views: true,
      sentiment: true,
      account: { select: { id: true, name: true } },
      platform: { select: { id: true, name: true, code: true } },
    },
  });
}
