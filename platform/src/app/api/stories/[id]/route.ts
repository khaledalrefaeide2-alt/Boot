import type { NextRequest } from 'next/server';
import { errors, jsonError, jsonOk, parseQuery, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { getAccountScope } from '@/lib/auth/account-scope';
import { postFiltersSchema } from '@/lib/validation/posts';
import { storySummary } from '@/lib/queries/stories';

type Params = { params: Promise<{ id: string }> };

/** ملخّص حدث واحد ضمن فلاتر القارئ — أرقامه كلّها من نطاقه */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requirePermission(PERMISSIONS.POSTS_VIEW);
    const { id } = await params;
    const filters = parseQuery(request, postFiltersSchema);
    const scope = await getAccountScope();

    const summary = await storySummary(id, filters, scope);
    if (!summary) throw errors.notFound('الحدث غير موجود في هذه الفترة');

    return jsonOk(summary);
  } catch (error) {
    return jsonError(error);
  }
}
