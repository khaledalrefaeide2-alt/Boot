import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import {
  ApiError,
  errors,
  guardMutationRate,
  jsonError,
  jsonOk,
  parseBody,
  requireCsrf,
  requirePermission,
} from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { getAccountScope, scopeAllows } from '@/lib/auth/account-scope';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { isAssistantConfigured, MISSING_KEY_MESSAGE } from '@/lib/assistant/config';
import { AssistantError } from '@/lib/assistant/openai';
import { saveCorrection } from '@/lib/analysis/learning';
import { correctionSchema } from '@/lib/validation/analysis';

type Params = { params: Promise<{ id: string }> };

/**
 * تصحيح تحليل منشور.
 *
 * يفعل شيئين: يُصلح تصنيف هذا المنشور الآن، ويُخزَّن مثالاً يتعلّم منه
 * التحليل لاحقاً. والصلاحية هنا `posts.review` لا `posts.classify`: من
 * يصحّح يعلّم النظام، وهذه مسؤولية المراجع لا المشغّل.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const actor = await requirePermission(PERMISSIONS.POSTS_REVIEW);
    await requireCsrf();
    await guardMutationRate(actor.id);

    if (!isAssistantConfigured()) throw new ApiError(503, MISSING_KEY_MESSAGE);

    const { id } = await params;
    const input = await parseBody(request, correctionSchema);

    const post = await prisma.post.findUnique({
      where: { id },
      select: {
        id: true,
        text: true,
        accountId: true,
        analysis: {
          select: { stance: true, sentiment: true, riskFlags: true },
        },
      },
    });
    if (!post) throw errors.notFound('المنشور غير موجود');
    if (!scopeAllows(await getAccountScope(), post.accountId)) {
      throw errors.notFound('المنشور غير موجود');
    }
    if (!post.text || post.text.trim().length < 10) {
      throw errors.badRequest('نصّ المنشور قصير جداً');
    }

    const correction = await saveCorrection({
      postId: post.id,
      excerpt: post.text,
      aiStance: post.analysis?.stance ?? null,
      aiSentiment: post.analysis?.sentiment ?? null,
      aiRiskFlags: post.analysis?.riskFlags ?? [],
      stance: input.stance ?? null,
      sentiment: input.sentiment ?? null,
      riskFlags: input.riskFlags ?? [],
      note: input.note,
      correctedById: actor.id,
    });

    /*
     * التصنيف الحالي يُصحَّح فوراً ويُوسم MANUAL.
     *
     * والوسم هو ما يمنع جولة تحليل لاحقة من الكتابة فوق قرار المراجع —
     * وهو الشرط المكتوب في طبقة الحفظ. بدونه يُصحّح المراجع اليوم ويُلغى
     * تصحيحه ليلاً بلا أن يعلم.
     */
    if (post.analysis) {
      await prisma.postAnalysis.update({
        where: { postId: post.id },
        data: {
          ...(input.stance ? { stance: input.stance } : {}),
          ...(input.sentiment ? { sentiment: input.sentiment } : {}),
          ...(input.riskFlags ? { riskFlags: input.riskFlags } : {}),
          needsReview: false,
        },
      });
    }
    if (input.sentiment) {
      await prisma.post.update({
        where: { id: post.id },
        data: { sentiment: input.sentiment, sentimentSource: 'MANUAL' },
      });
    }

    await audit(actor, {
      action: AUDIT_ACTIONS.ANALYSIS_CORRECTED,
      entityType: 'post',
      entityId: post.id,
      summary: 'تصحيح تحليل آلي — يُستعمل مثالاً في التحليلات اللاحقة',
      metadata: {
        correctionId: correction.id,
        was: {
          stance: post.analysis?.stance ?? null,
          riskFlags: post.analysis?.riskFlags ?? [],
        },
        now: { stance: input.stance ?? null, riskFlags: input.riskFlags ?? [] },
        note: input.note,
      },
    });

    return jsonOk({ corrected: true, correctionId: correction.id });
  } catch (error) {
    if (error instanceof AssistantError) {
      return jsonError(new ApiError(error.status, error.message));
    }
    return jsonError(error);
  }
}
