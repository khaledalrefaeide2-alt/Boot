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
import { updateTopicSchema } from '@/lib/validation/taxonomy';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const actor = await requirePermission(PERMISSIONS.TAXONOMY_MANAGE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const { id } = await params;
    const input = await parseBody(request, updateTopicSchema);

    const existing = await prisma.topic.findUnique({ where: { id }, select: { name: true } });
    if (!existing) throw errors.notFound('التصنيف غير موجود');

    const topic = await prisma.topic.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.terms !== undefined ? { rules: { terms: input.terms } as never } : {}),
      },
      select: { id: true, name: true },
    });

    await audit(actor, {
      action: AUDIT_ACTIONS.TAXONOMY_UPDATED,
      entityType: 'topic',
      entityId: id,
      summary: `تعديل التصنيف «${existing.name}»`,
    });

    return jsonOk({ topic });
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
    const topic = await prisma.topic.findUnique({
      where: { id },
      select: { name: true, _count: { select: { posts: true } } },
    });
    if (!topic) throw errors.notFound('التصنيف غير موجود');

    // المنشورات المصنّفة تبقى، ويصبح تصنيفها فارغاً
    await prisma.topic.delete({ where: { id } });

    await audit(actor, {
      action: AUDIT_ACTIONS.TAXONOMY_DELETED,
      entityType: 'topic',
      entityId: id,
      summary: `حذف التصنيف «${topic.name}» — بقيت ${topic._count.posts} منشوراً بلا تصنيف`,
    });

    return jsonOk({ deleted: true, postsAffected: topic._count.posts });
  } catch (error) {
    return jsonError(error);
  }
}
