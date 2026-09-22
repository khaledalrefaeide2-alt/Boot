import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import {
  guardMutationRate,
  jsonError,
  jsonOk,
  parseBody,
  requireCsrf,
  requirePermission,
} from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { guidanceSchema } from '@/lib/validation/analysis';

/*
 * توجيهات التحليل.
 *
 * الصلاحية `taxonomy.manage` — نفس صلاحية من يضبط التصنيفات والكلمات
 * المفتاحية. والتوجيه يغيّر كيف يُصنَّف كلّ منشور بعده، فهو أقرب إلى
 * ضبط معايير التصنيف منه إلى مراجعة منشور.
 */

export async function GET() {
  try {
    await requirePermission(PERMISSIONS.TAXONOMY_MANAGE);

    const guidance = await prisma.analysisGuidance.findMany({
      /*
       * ما ينتظر القرار يتصدّر.
       *
       * التوجيه الملتقَط من محادثة يُحفظ معطَّلاً، ولا أثر له حتى يُفعَّل.
       * ولو رُتّب مع البقية بالترتيب وحده لغرق بين عشرات التوجيهات
       * المفعّلة، فبقي معطَّلاً لأن أحداً لم يره — لا لأن أحداً رفضه.
       */
      orderBy: [
        { isActive: 'asc' },
        { source: 'desc' },
        { sortOrder: 'asc' },
        { createdAt: 'asc' },
      ],
      select: {
        id: true,
        scope: true,
        instruction: true,
        isActive: true,
        sortOrder: true,
        source: true,
        sourceMessage: true,
        createdAt: true,
        createdBy: { select: { name: true } },
      },
    });

    return jsonOk({ guidance });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermission(PERMISSIONS.TAXONOMY_MANAGE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const input = await parseBody(request, guidanceSchema);

    const created = await prisma.analysisGuidance.create({
      data: { ...input, createdById: actor.id },
      select: { id: true, instruction: true },
    });

    await audit(actor, {
      action: AUDIT_ACTIONS.ANALYSIS_GUIDANCE_CHANGED,
      entityType: 'analysis_guidance',
      entityId: created.id,
      summary: `إضافة توجيه تحليل: ${created.instruction.slice(0, 80)}`,
      metadata: { scope: input.scope, instruction: input.instruction },
    });

    return jsonOk({ guidance: created }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
