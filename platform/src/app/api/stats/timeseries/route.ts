import type { NextRequest } from 'next/server';
import { jsonError, jsonOk, parseQuery, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { postFiltersSchema } from '@/lib/validation/posts';
import { getTimeseries } from '@/lib/queries/stats';
import { getAccountScope } from '@/lib/auth/account-scope';

export async function GET(request: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.POSTS_VIEW);
    const filters = parseQuery(request, postFiltersSchema);
    const scope = await getAccountScope();
    const series = await getTimeseries(filters, scope);
    return jsonOk({ series });
  } catch (error) {
    return jsonError(error);
  }
}
