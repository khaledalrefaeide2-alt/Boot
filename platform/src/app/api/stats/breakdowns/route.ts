import type { NextRequest } from 'next/server';
import { jsonError, jsonOk, parseQuery, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { postFiltersSchema } from '@/lib/validation/posts';
import { getBreakdowns } from '@/lib/queries/stats';

export async function GET(request: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.POSTS_VIEW);
    const filters = parseQuery(request, postFiltersSchema);
    const breakdowns = await getBreakdowns(filters);
    return jsonOk(breakdowns);
  } catch (error) {
    return jsonError(error);
  }
}
