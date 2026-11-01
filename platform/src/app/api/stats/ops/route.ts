import type { NextRequest } from 'next/server';
import { jsonError, jsonOk, parseQuery, requirePermission } from '@/lib/api';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { getAccountScope } from '@/lib/auth/account-scope';
import { opsQuerySchema } from '@/lib/validation/ops';
import { getOpsDashboard } from '@/lib/queries/ops';

/**
 * بيانات غرفة العمليات — طلبٌ واحد لكلّ الرسوم.
 *
 * محروسٌ بإذن الغرفة نفسها، ومحصورٌ بنطاق الحسابات. وقسم التشغيل (عمليات
 * الاستخراج وإنتاجية التصنيف) لا يُحسب أصلاً لمن لا يرى الاستخراج — لا
 * يُحسب ثمّ يُخفى في الواجهة.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.OPS_VIEW);
    const query = parseQuery(request, opsQuerySchema);
    const scope = await getAccountScope();
    const dashboard = await getOpsDashboard(query, scope, {
      operations: can(user, PERMISSIONS.EXTRACTION_VIEW),
    });
    return jsonOk(dashboard);
  } catch (error) {
    return jsonError(error);
  }
}
