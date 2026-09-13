import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import {
  ApiError,
  errors,
  jsonError,
  jsonOk,
  requireCsrf,
  requirePermission,
} from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { getAccountScope, scopeAllows } from '@/lib/auth/account-scope';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { isAssistantConfigured, MISSING_KEY_MESSAGE } from '@/lib/assistant/config';
import { AssistantError } from '@/lib/assistant/openai';
import { analyzeAndSave } from '@/lib/analysis/persist';

type Params = { params: Promise<{ id: string }> };

/** تحليل منشور واحد عند الطلب — لمن يملك صلاحية التصنيف */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const actor = await requirePermission(PERMISSIONS.POSTS_CLASSIFY);
    await requireCsrf();

    const quota = await rateLimit(
      `analyze:${actor.id}`,
      RATE_LIMITS.ASSISTANT.limit,
      RATE_LIMITS.ASSISTANT.window,
    );
    if (!quota.allowed) throw errors.tooMany('تجاوزت حدّ التحليل في هذه الساعة. حاول لاحقاً.');

    if (!isAssistantConfigured()) throw new ApiError(503, MISSING_KEY_MESSAGE);

    const { id } = await params;
    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, text: true, accountId: true },
    });
    if (!post) throw errors.notFound('المنشور غير موجود');

    /*
     * التحليل يتبع الاطلاع: النطاق يُقاس على حساب المنشور لا على معرّفه.
     *
     * ونطاق هذا النظام مصفوفة معرّفات حسابات؛ فمقارنة معرّف المنشور بها
     * تُخفق دائماً وتحجب كلّ شيء — أو تمرّ إن أسيء ترتيب الشرط. والصحيح
     * هو accountId.
     */
    if (!scopeAllows(await getAccountScope(), post.accountId)) {
      throw errors.notFound('المنشور غير موجود');
    }

    if (!post.text || post.text.trim().length < 10) {
      throw errors.badRequest('نصّ المنشور قصير جداً للتحليل');
    }

    const result = await analyzeAndSave(post.id, post.text);

    await audit(actor, {
      action: AUDIT_ACTIONS.POST_ANALYZED,
      entityType: 'post',
      entityId: post.id,
      summary: `تحليل منشور بالذكاء الاصطناعي — الموقف ${result.stance}`,
      metadata: {
        stance: result.stance,
        sentiment: result.sentiment,
        confidence: result.confidence,
        riskFlags: result.riskFlags,
      },
    });

    return jsonOk({ analysis: result });
  } catch (error) {
    if (error instanceof AssistantError) {
      return jsonError(new ApiError(error.status, error.message));
    }
    return jsonError(error);
  }
}
