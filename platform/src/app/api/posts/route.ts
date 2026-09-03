import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { jsonError, jsonOk, parseQuery, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { listPostsSchema } from '@/lib/validation/posts';
import { buildPostWhere, POST_LIST_SELECT } from '@/lib/queries/posts';
import { can } from '@/lib/auth/rbac';

/** قائمة المنشورات مع كل الفلاتر والبحث */
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.POSTS_VIEW);
    const query = parseQuery(request, listPostsSchema);

    // المنشورات المخفية لا تظهر إلا لمن يملك صلاحية المراجعة
    const includeHidden =
      query.includeHidden === 'true' && can(user, PERMISSIONS.POSTS_REVIEW) ? 'true' : 'false';

    const where = buildPostWhere({ ...query, includeHidden });

    const [total, posts] = await Promise.all([
      prisma.post.count({ where }),
      prisma.post.findMany({
        where,
        orderBy: [{ [query.sort]: query.order }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: POST_LIST_SELECT,
      }),
    ]);

    return jsonOk({ posts, total, page: query.page, pageSize: query.pageSize });
  } catch (error) {
    return jsonError(error);
  }
}
