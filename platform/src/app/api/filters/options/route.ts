import { prisma } from '@/lib/db';
import { jsonError, jsonOk, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { getAccountScope } from '@/lib/auth/account-scope';

/** خيارات الفلاتر المشتركة لكل شاشات الرصد */
export async function GET() {
  try {
    await requirePermission(PERMISSIONS.POSTS_VIEW);

    // قوائم الفلاتر تكشف أسماء الحسابات، فتُحصر بنطاق المستخدم كذلك
    const scope = await getAccountScope();

    const [platforms, accounts, topics, keywords] = await Promise.all([
      prisma.platform.findMany({
        // منصة بلا حساب واحد داخل النطاق لا معنى لظهورها في الفلتر،
        // ووجودها وحده يقول إن هناك رصداً عليها لا يراه المستخدم
        where: {
          status: 'ACTIVE',
          ...(scope === null ? {} : { accounts: { some: { id: { in: scope } } } }),
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, code: true, color: true },
      }),
      prisma.account.findMany({
        where: { status: 'ACTIVE', ...(scope === null ? {} : { id: { in: scope } }) },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, platformId: true },
      }),
      prisma.topic.findMany({
        where: { status: 'ACTIVE' },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, color: true },
      }),
      prisma.keyword.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { term: 'asc' },
        select: { id: true, term: true },
        take: 300,
      }),
    ]);

    return jsonOk({ platforms, accounts, topics, keywords });
  } catch (error) {
    return jsonError(error);
  }
}
