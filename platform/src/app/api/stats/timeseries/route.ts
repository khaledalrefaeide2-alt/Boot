import type { NextRequest } from 'next/server';
import { jsonError, jsonOk, parseQuery, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { postFiltersSchema } from '@/lib/validation/posts';
import { getTimeseries } from '@/lib/queries/stats';

export async function GET(request: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.POSTS_VIEW);
    const filters = parseQuery(request, postFiltersSchema);
    const series = await getTimeseries(filters);
    return jsonOk({ series });
  } catch (error) {
    return jsonError(error);
  }
}
