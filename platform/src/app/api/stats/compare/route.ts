import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { errors, jsonError, jsonOk, parseQuery, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { buildPostWhere } from '@/lib/queries/posts';
import { postFiltersSchema } from '@/lib/validation/posts';

const compareSchema = postFiltersSchema.extend({
  accountId: z.union([z.string(), z.array(z.string())]),
});

/**
 * مقارنة حسابات: مجاميع كل حساب + سلسلة زمنية موحّدة للرسم.
 * محور واحد لكل رسم — لا يُخلط مقياسان مختلفان في رسم واحد.
 */
export async function GET(request: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.ACCOUNTS_VIEW);
    const query = parseQuery(request, compareSchema);

    const accountIds = (Array.isArray(query.accountId) ? query.accountId : [query.accountId]).filter(
      Boolean,
    );
    if (accountIds.length === 0) throw errors.badRequest('اختر حساباً واحداً على الأقل للمقارنة');
    if (accountIds.length > 6) throw errors.badRequest('الحد الأقصى ستة حسابات في المقارنة الواحدة');

    const accounts = await prisma.account.findMany({
      where: { id: { in: accountIds } },
      select: {
        id: true,
        name: true,
        followersCount: true,
        platform: { select: { name: true } },
      },
    });

    const results = await Promise.all(
      accounts.map(async (account) => {
        const where = buildPostWhere({ ...query, accountId: account.id });

        const [totals, posts, sentiments] = await Promise.all([
          prisma.post.aggregate({
            where,
            _count: { _all: true },
            _sum: {
              likes: true,
              comments: true,
              shares: true,
              views: true,
              engagementTotal: true,
            },
          }),
          prisma.post.findMany({
            where: { ...where, publishedAt: { not: null } },
            select: { publishedAt: true, engagementTotal: true },
            take: 20_000,
          }),
          prisma.post.groupBy({ by: ['sentiment'], where, _count: { _all: true } }),
        ]);

        const daily = new Map<string, { posts: number; engagement: number }>();
        for (const post of posts) {
          if (!post.publishedAt) continue;
          const key = post.publishedAt.toISOString().slice(0, 10);
          const bucket = daily.get(key) ?? { posts: 0, engagement: 0 };
          bucket.posts += 1;
          bucket.engagement += post.engagementTotal;
          daily.set(key, bucket);
        }

        const postsCount = totals._count._all;
        const engagement = totals._sum.engagementTotal ?? 0;

        return {
          id: account.id,
          name: account.name,
          platformName: account.platform.name,
          followersCount: account.followersCount,
          posts: postsCount,
          likes: totals._sum.likes ?? 0,
          comments: totals._sum.comments ?? 0,
          shares: totals._sum.shares ?? 0,
          views: totals._sum.views ?? 0,
          engagement,
          engagementPerPost: postsCount > 0 ? Number((engagement / postsCount).toFixed(1)) : 0,
          engagementPerFollower:
            account.followersCount && account.followersCount > 0 && postsCount > 0
              ? Number((((engagement / postsCount) / account.followersCount) * 100).toFixed(3))
              : null,
          positive: sentiments.find((s) => s.sentiment === 'POSITIVE')?._count._all ?? 0,
          negative: sentiments.find((s) => s.sentiment === 'NEGATIVE')?._count._all ?? 0,
          daily: Array.from(daily.entries()).map(([date, values]) => ({ date, ...values })),
        };
      }),
    );

    // سلسلة زمنية موحّدة: صف لكل تاريخ وعمود لكل حساب
    const allDates = Array.from(
      new Set(results.flatMap((result) => result.daily.map((day) => day.date))),
    ).sort();

    const timeseries = allDates.map((date) => {
      const row: Record<string, string | number> = { date };
      for (const result of results) {
        const day = result.daily.find((item) => item.date === date);
        row[`posts_${result.id}`] = day?.posts ?? 0;
        row[`engagement_${result.id}`] = day?.engagement ?? 0;
      }
      return row;
    });

    return jsonOk({
      accounts: results.map(({ daily: _daily, ...rest }) => rest),
      timeseries,
    });
  } catch (error) {
    return jsonError(error);
  }
}
