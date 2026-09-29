import type { NextRequest } from 'next/server';
import { errors, jsonError, jsonOk, parseQuery, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { getAccountScope } from '@/lib/auth/account-scope';
import { postFiltersSchema } from '@/lib/validation/posts';
import { entitySummary } from '@/lib/queries/entities';

type Params = { params: Promise<{ id: string }> };

/** ملخّص كيان واحد ضمن فلاتر القارئ — أرقامه كلّها من نطاقه */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requirePermission(PERMISSIONS.POSTS_VIEW);
    const { id } = await params;
    const filters = parseQuery(request, postFiltersSchema);
    const scope = await getAccountScope();

    const summary = await entitySummary(id, filters, scope);
    if (!summary) throw errors.notFound('الكيان غير موجود في هذه الفترة');

    return jsonOk(summary);
  } catch (error) {
    return jsonError(error);
  }
}
