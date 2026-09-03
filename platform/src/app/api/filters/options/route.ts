import { prisma } from '@/lib/db';
import { jsonError, jsonOk, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';

/** خيارات الفلاتر المشتركة لكل شاشات الرصد */
export async function GET() {
  try {
    await requirePermission(PERMISSIONS.POSTS_VIEW);

    const [platforms, accounts, topics, keywords] = await Promise.all([
      prisma.platform.findMany({
        where: { status: 'ACTIVE' },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, code: true, color: true },
      }),
      prisma.account.findMany({
        where: { status: 'ACTIVE' },
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
