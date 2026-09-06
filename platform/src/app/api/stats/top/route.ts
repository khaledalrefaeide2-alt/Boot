import type { NextRequest } from 'next/server';
import { jsonError, jsonOk, parseQuery, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { postFiltersSchema } from '@/lib/validation/posts';
import { getTopAccounts, getTopHashtags, getTopPosts, getTopWords } from '@/lib/queries/stats';
import { getAccountScope } from '@/lib/auth/account-scope';

/** أعلى الحسابات والمنشورات والهاشتاغات والكلمات — في طلب واحد */
export async function GET(request: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.POSTS_VIEW);
    const filters = parseQuery(request, postFiltersSchema);
    const scope = await getAccountScope();

    const [accounts, posts, hashtags, words] = await Promise.all([
      getTopAccounts(filters, scope, 10),
      getTopPosts(filters, scope, 10),
      getTopHashtags(filters, scope, 25),
      getTopWords(filters, scope, 50),
    ]);

    return jsonOk({ accounts, posts, hashtags, words });
  } catch (error) {
    return jsonError(error);
  }
}
