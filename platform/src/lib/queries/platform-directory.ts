import 'server-only';
import { prisma } from '@/lib/db';
import type { AccountScope } from '@/lib/auth/account-scope';
import type { DirectoryAccount, PlatformDirectory } from '@/lib/domain/platform-directory';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * بيانات دليل المنصات — أربعة استعلامات مهما بلغ عدد الحسابات.
 *
 * ★ محصورةٌ بنطاق المستخدم في كلّ استعلام لا في القائمة وحدها.
 *
 *   الحساب خارج النطاق لا يظهر، ولا تظهر منشوراته في مجموع منصّته ولا
 *   في مجموع مجموعته. لو حُصرت البطاقات وحدها لبقيت الأرقام فوقها تكشف
 *   حجم ما لا يراه — وهو ما تحرسه شاشة المنصات منذ كُتبت.
 *
 * ★ والمنشورات المخفية خارج الأرقام، كما في كلّ شاشات العرض.
 */
export async function getPlatformDirectory(
  scope: AccountScope,
  now: Date = new Date(),
): Promise<PlatformDirectory> {
  if (scope !== null && scope.length === 0) return { platforms: [], groups: [], accounts: [] };

  const accounts = await prisma.account.findMany({
    where: {
      status: 'ACTIVE',
      platform: { status: 'ACTIVE' },
      ...(scope === null ? {} : { id: { in: scope } }),
    },
    select: {
      id: true,
      name: true,
      username: true,
      groupId: true,
      isActive: true,
      followersCount: true,
      avatarUrl: true,
      avatarKey: true,
      platform: { select: { id: true, code: true, name: true, sortOrder: true } },
      group: { select: { id: true, name: true, description: true, sortOrder: true } },
    },
  });

  if (accounts.length === 0) return { platforms: [], groups: [], accounts: [] };

  const ids = accounts.map((account) => account.id);
  const visible = { accountId: { in: ids }, isHidden: false };

  /*
   * التجميع في القاعدة لا في الذاكرة: صفٌّ واحد لكل حساب مهما بلغت
   * منشوراته. والفهرس (accountId, publishedAt) يخدم الاستعلامين.
   */
  const [totals, recent] = await Promise.all([
    prisma.post.groupBy({
      by: ['accountId'],
      where: visible,
      _count: { _all: true },
      _sum: { engagementTotal: true, likes: true, comments: true, shares: true, views: true },
      _max: { publishedAt: true },
    }),
    prisma.post.groupBy({
      by: ['accountId'],
      where: { ...visible, publishedAt: { gte: new Date(now.getTime() - WEEK_MS) } },
      _count: { _all: true },
    }),
  ]);

  const totalsMap = new Map(totals.map((row) => [row.accountId, row]));
  const recentMap = new Map(recent.map((row) => [row.accountId, row._count._all]));

  const rows: DirectoryAccount[] = accounts.map((account) => {
    const stats = totalsMap.get(account.id);
    return {
      id: account.id,
      name: account.name,
      username: account.username,
      platformId: account.platform.id,
      groupId: account.groupId,
      isActive: account.isActive,
      followersCount: account.followersCount,
      avatarUrl: account.avatarUrl,
      avatarKey: account.avatarKey,
      posts: stats?._count._all ?? 0,
      engagement: stats?._sum.engagementTotal ?? 0,
      likes: stats?._sum.likes ?? 0,
      comments: stats?._sum.comments ?? 0,
      shares: stats?._sum.shares ?? 0,
      views: stats?._sum.views ?? 0,
      postsThisWeek: recentMap.get(account.id) ?? 0,
      lastPostAt: stats?._max.publishedAt?.toISOString() ?? null,
    };
  });

  /*
   * المنصات والمجموعات تُستخرج من الحسابات المرئية نفسها.
   *
   * فلا تظهر منصةٌ بلا حساب في نطاق القارئ، ولا مجموعةٌ فارغة. والمجموعة
   * المعطّلة تظهر إن بقي فيها حساب: إخفاؤها كان سينقل حساباتها إلى «بلا
   * تصنيف»، وهي مصنّفة — والوسم الخاطئ أسوأ من وسمٍ قديم.
   */
  const platforms = new Map<string, { id: string; code: string; name: string; sortOrder: number }>();
  const groups = new Map<
    string,
    { id: string; name: string; description: string | null; sortOrder: number }
  >();
  for (const account of accounts) {
    platforms.set(account.platform.id, account.platform);
    if (account.group) groups.set(account.group.id, account.group);
  }

  const collator = new Intl.Collator('ar');
  const ordered = <T extends { sortOrder: number; name: string }>(list: Iterable<T>) =>
    [...list].sort((a, b) => a.sortOrder - b.sortOrder || collator.compare(a.name, b.name));

  return {
    platforms: ordered(platforms.values()).map(({ id, code, name }) => ({ id, code, name })),
    groups: ordered(groups.values()).map(({ id, name, description }) => ({ id, name, description })),
    accounts: rows,
  };
}
