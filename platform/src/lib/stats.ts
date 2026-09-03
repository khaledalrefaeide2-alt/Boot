import 'server-only';
import { prisma } from '@/lib/db';
import { startOfUtcDay } from '@/lib/utils';

/**
 * تحديث جداول الإحصاءات اليومية.
 *
 * الغرض: ألا يعتمد أي عرض على تجميع ثقيل من جدول المنشورات في كل طلب.
 * تُستدعى مباشرة بعد كل عملية استخراج، ويمكن إعادة بنائها كاملة عند الحاجة.
 */

/** الأيام التي تأثرت بدفعة منشورات — نعيد حساب هذه الأيام فقط */
export function affectedDays(dates: (Date | null)[]): Date[] {
  const days = new Set<number>();
  for (const date of dates) {
    if (date) days.add(startOfUtcDay(date).getTime());
  }
  // منشور بلا تاريخ نشر يُحسب على يوم الاستيراد
  if (dates.some((d) => !d)) days.add(startOfUtcDay().getTime());
  return Array.from(days).map((time) => new Date(time));
}

interface Aggregate {
  postsCount: number;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  saves: number;
  engagementTotal: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  unknownCount: number;
}

const EMPTY_AGGREGATE: Aggregate = {
  postsCount: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  views: 0,
  saves: 0,
  engagementTotal: 0,
  positiveCount: 0,
  neutralCount: 0,
  negativeCount: 0,
  unknownCount: 0,
};

/** حساب معدل التفاعل: التفاعل لكل منشور، أو نسبة إلى المتابعين إن توفروا */
function engagementRate(engagement: number, posts: number, followers: number | null): number {
  if (posts === 0) return 0;
  if (followers && followers > 0) {
    return Number((((engagement / posts) / followers) * 100).toFixed(4));
  }
  return Number((engagement / posts).toFixed(2));
}

async function aggregateForDay(
  where: { accountId?: string; platformId?: string },
  day: Date,
): Promise<Aggregate> {
  const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);

  const [totals, sentiments] = await Promise.all([
    prisma.post.aggregate({
      where: { ...where, isHidden: false, publishedAt: { gte: day, lt: nextDay } },
      _count: { _all: true },
      _sum: {
        likes: true,
        comments: true,
        shares: true,
        views: true,
        saves: true,
        engagementTotal: true,
      },
    }),
    prisma.post.groupBy({
      by: ['sentiment'],
      where: { ...where, isHidden: false, publishedAt: { gte: day, lt: nextDay } },
      _count: { _all: true },
    }),
  ]);

  const aggregate: Aggregate = {
    ...EMPTY_AGGREGATE,
    postsCount: totals._count._all,
    likes: totals._sum.likes ?? 0,
    comments: totals._sum.comments ?? 0,
    shares: totals._sum.shares ?? 0,
    views: totals._sum.views ?? 0,
    saves: totals._sum.saves ?? 0,
    engagementTotal: totals._sum.engagementTotal ?? 0,
  };

  for (const row of sentiments) {
    const count = row._count._all;
    if (row.sentiment === 'POSITIVE') aggregate.positiveCount = count;
    else if (row.sentiment === 'NEGATIVE') aggregate.negativeCount = count;
    else if (row.sentiment === 'NEUTRAL' || row.sentiment === 'MIXED')
      aggregate.neutralCount += count;
    else aggregate.unknownCount = count;
  }

  return aggregate;
}

/** إعادة حساب إحصاءات حساب في أيام محددة */
export async function refreshAccountStats(accountId: string, days: Date[]): Promise<void> {
  if (days.length === 0) return;

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { followersCount: true },
  });

  for (const day of days) {
    const aggregate = await aggregateForDay({ accountId }, day);
    const rate = engagementRate(
      aggregate.engagementTotal,
      aggregate.postsCount,
      account?.followersCount ?? null,
    );

    await prisma.dailyAccountStat.upsert({
      where: { accountId_date: { accountId, date: day } },
      create: {
        accountId,
        date: day,
        ...aggregate,
        engagementRate: rate,
        followersCount: account?.followersCount ?? null,
      },
      update: {
        ...aggregate,
        engagementRate: rate,
        followersCount: account?.followersCount ?? null,
      },
    });
  }
}

/** إعادة حساب إحصاءات منصة في أيام محددة */
export async function refreshPlatformStats(platformId: string, days: Date[]): Promise<void> {
  if (days.length === 0) return;

  for (const day of days) {
    const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    const [aggregate, activeAccounts] = await Promise.all([
      aggregateForDay({ platformId }, day),
      prisma.post.findMany({
        where: { platformId, isHidden: false, publishedAt: { gte: day, lt: nextDay } },
        select: { accountId: true },
        distinct: ['accountId'],
      }),
    ]);

    await prisma.dailyPlatformStat.upsert({
      where: { platformId_date: { platformId, date: day } },
      create: {
        platformId,
        date: day,
        ...aggregate,
        accountsCount: activeAccounts.length,
        engagementRate: engagementRate(aggregate.engagementTotal, aggregate.postsCount, null),
      },
      update: {
        ...aggregate,
        accountsCount: activeAccounts.length,
        engagementRate: engagementRate(aggregate.engagementTotal, aggregate.postsCount, null),
      },
    });
  }
}

/** تحديث الإحصاءات بعد عملية استخراج */
export async function refreshStatsAfterImport(
  accountId: string,
  platformId: string,
  publishedDates: (Date | null)[],
): Promise<void> {
  const days = affectedDays(publishedDates);
  if (days.length === 0) return;

  try {
    await refreshAccountStats(accountId, days);
    await refreshPlatformStats(platformId, days);
  } catch (error) {
    // فشل الإحصاءات لا يُفشل الاستيراد — البيانات محفوظة ويمكن إعادة البناء
    console.error('[stats] تعذّر تحديث الإحصاءات اليومية:', error);
  }
}

/** إعادة بناء كل الإحصاءات اليومية — عملية صيانة */
export async function rebuildAllDailyStats(sinceDays = 365): Promise<{ accounts: number; platforms: number }> {
  const since = startOfUtcDay(new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000));

  const [accounts, platforms] = await Promise.all([
    prisma.account.findMany({ select: { id: true } }),
    prisma.platform.findMany({ select: { id: true } }),
  ]);

  const days: Date[] = [];
  for (let cursor = new Date(since); cursor <= new Date(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    days.push(new Date(cursor));
  }

  for (const account of accounts) await refreshAccountStats(account.id, days);
  for (const platform of platforms) await refreshPlatformStats(platform.id, days);

  return { accounts: accounts.length, platforms: platforms.length };
}
