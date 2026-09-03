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
import { updateKeywordSchema } from '@/lib/validation/taxonomy';
import { normalizeKeywordTerm } from '@/lib/extraction/import';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const actor = await requirePermission(PERMISSIONS.TAXONOMY_MANAGE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const { id } = await params;
    const input = await parseBody(request, updateKeywordSchema);

    const existing = await prisma.keyword.findUnique({ where: { id }, select: { term: true } });
    if (!existing) throw errors.notFound('الكلمة غير موجودة');

    const keyword = await prisma.keyword.update({
      where: { id },
      data: {
        ...(input.term !== undefined
          ? { term: input.term, normalizedTerm: normalizeKeywordTerm(input.term) }
          : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.weight !== undefined ? { weight: input.weight } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.isAlerting !== undefined ? { isAlerting: input.isAlerting } : {}),
      },
      select: { id: true, term: true },
    });

    await audit(actor, {
      action: AUDIT_ACTIONS.TAXONOMY_UPDATED,
      entityType: 'keyword',
      entityId: id,
      summary: `تعديل الكلمة المفتاحية «${existing.term}»`,
    });

    return jsonOk({ keyword });
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
    const keyword = await prisma.keyword.findUnique({ where: { id }, select: { term: true } });
    if (!keyword) throw errors.notFound('الكلمة غير موجودة');

    await prisma.keyword.delete({ where: { id } });

    await audit(actor, {
      action: AUDIT_ACTIONS.TAXONOMY_DELETED,
      entityType: 'keyword',
      entityId: id,
      summary: `حذف الكلمة المفتاحية «${keyword.term}»`,
    });

    return jsonOk({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
