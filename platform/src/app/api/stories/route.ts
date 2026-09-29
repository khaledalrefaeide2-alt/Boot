import type { NextRequest } from 'next/server';
import { jsonError, jsonOk, parseQuery, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { getAccountScope } from '@/lib/auth/account-scope';
import { listStoriesSchema } from '@/lib/validation/stories';
import { listStories } from '@/lib/queries/stories';

/**
 * الأحداث — عناقيد المنشورات المتقاربة.
 *
 * الصلاحية هي صلاحية المنشورات نفسها: الشاشة تجميعٌ لمنشوراتٍ يراها
 * صاحبها أصلاً، ولا تكشف صفّاً لا يستطيع فتحه.
 */
export async function GET(request: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.POSTS_VIEW);
    const query = parseQuery(request, listStoriesSchema);
    const scope = await getAccountScope();

    return jsonOk(await listStories(query, scope));
  } catch (error) {
    return jsonError(error);
  }
}
