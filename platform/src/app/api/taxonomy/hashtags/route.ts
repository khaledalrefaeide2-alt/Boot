import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { jsonError, jsonOk, parseQuery, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { listTaxonomySchema } from '@/lib/validation/taxonomy';
import type { Prisma } from '@/generated/prisma';

export async function GET(request: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.POSTS_VIEW);
    const query = parseQuery(request, listTaxonomySchema);

    const where: Prisma.HashtagWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { tag: { contains: query.q.replace(/^#/, ''), mode: 'insensitive' } } : {}),
    };

    const [total, hashtags] = await Promise.all([
      prisma.hashtag.count({ where }),
      prisma.hashtag.findMany({
        where,
        orderBy: [{ usageCount: 'desc' }, { tag: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          tag: true,
          status: true,
          usageCount: true,
          createdAt: true,
          _count: { select: { posts: true } },
        },
      }),
    ]);

    return jsonOk({ hashtags, total, page: query.page, pageSize: query.pageSize });
  } catch (error) {
    return jsonError(error);
  }
}
