import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import {
  errors,
  guardMutationRate,
  jsonError,
  jsonOk,
  parseBody,
  requireCsrf,
  requirePermission,
} from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { updateGuidanceSchema } from '@/lib/validation/analysis';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const actor = await requirePermission(PERMISSIONS.TAXONOMY_MANAGE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const { id } = await params;
    const input = await parseBody(request, updateGuidanceSchema);

    const existing = await prisma.analysisGuidance.findUnique({
      where: { id },
      select: { id: true, instruction: true, isActive: true },
    });
    if (!existing) throw errors.notFound('التوجيه غير موجود');

    const updated = await prisma.analysisGuidance.update({
      where: { id },
      data: Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)),
      select: { id: true, instruction: true, isActive: true },
    });

    await audit(actor, {
      action: AUDIT_ACTIONS.ANALYSIS_GUIDANCE_CHANGED,
      entityType: 'analysis_guidance',
      entityId: id,
      summary: `تعديل توجيه تحليل: ${updated.instruction.slice(0, 80)}`,
      metadata: { was: existing, now: updated },
    });

    return jsonOk({ guidance: updated });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const actor = await requirePermission(PERMISSIONS.TAXONOMY_MANAGE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const { id } = await params;
    const existing = await prisma.analysisGuidance.findUnique({
      where: { id },
      select: { instruction: true },
    });
    if (!existing) throw errors.notFound('التوجيه غير موجود');

    await prisma.analysisGuidance.delete({ where: { id } });

    await audit(actor, {
      action: AUDIT_ACTIONS.ANALYSIS_GUIDANCE_CHANGED,
      entityType: 'analysis_guidance',
      entityId: id,
      summary: `حذف توجيه تحليل: ${existing.instruction.slice(0, 80)}`,
    });

    return jsonOk({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
