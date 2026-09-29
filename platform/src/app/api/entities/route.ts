import type { NextRequest } from 'next/server';
import { jsonError, jsonOk, parseQuery, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { getAccountScope } from '@/lib/auth/account-scope';
import { listEntitiesSchema } from '@/lib/validation/entities';
import { listEntities } from '@/lib/queries/entities';

/**
 * أكثر الأشخاص والمؤسسات والأماكن ذكراً في المنشورات.
 *
 * الصلاحية هي صلاحية المنشورات نفسها لا صلاحية جديدة: هذه الشاشة عدٌّ
 * لمنشوراتٍ يراها صاحبها أصلاً، ولا تكشف صفّاً لا يستطيع فتحه. وصلاحيةٌ
 * منفصلة كانت ستعني بابين لبيانٍ واحد، ويُنسى إغلاق أحدهما.
 */
export async function GET(request: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.POSTS_VIEW);
    const query = parseQuery(request, listEntitiesSchema);
    const scope = await getAccountScope();

    return jsonOk(await listEntities(query, scope));
  } catch (error) {
    return jsonError(error);
  }
}
