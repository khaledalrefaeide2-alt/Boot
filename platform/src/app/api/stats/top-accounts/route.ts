import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { jsonError, jsonOk, parseQuery, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { postFiltersSchema } from '@/lib/validation/posts';
import { getTopAccounts } from '@/lib/queries/stats';
import { getAccountScope } from '@/lib/auth/account-scope';

/*
 * مسارٌ مستقلّ عن `/api/stats/top`.
 *
 * ذاك يُرجع الحسابات والمنشورات والهاشتاغات والكلمات في طلب واحد — وهو
 * مناسبٌ لشاشة التحليلات التي تعرضها كلها. أما قسمٌ يبدّل مقياس ترتيب
 * الحسابات فيُعيد جلب ذلك كلّه مع كل ضغطة زرّ، وأثقلُه حساب الكلمات.
 */
const schema = postFiltersSchema.extend({
  metric: z.enum(['posts', 'engagement', 'likes', 'comments', 'shares', 'views']).default('posts'),
  limit: z.coerce.number().int().min(1).max(24).default(4),
});

export async function GET(request: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.POSTS_VIEW);
    const { metric, limit, ...filters } = parseQuery(request, schema);
    const scope = await getAccountScope();

    const accounts = await getTopAccounts(filters, scope, limit, metric);
    return jsonOk({ accounts });
  } catch (error) {
    return jsonError(error);
  }
}
