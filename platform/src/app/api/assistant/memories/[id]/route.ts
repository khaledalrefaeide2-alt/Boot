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
import { PERMISSIONS, can } from '@/lib/auth/rbac';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { updateMemorySchema } from '@/lib/validation/assistant';

/*
 * تعديل تعليمة وحذفها.
 *
 * ★ الملكية تُفحص في القاعدة لا في الواجهة، وتعليمةُ غيره تُقرأ «غير
 *   موجودة» لا «ممنوعة»: الفرق بين الردّين يقول لمن يجرّب المعرّفات أيّها
 *   موجود فعلاً.
 */
async function ownedMemory(id: string, userId: string, canGlobal: boolean) {
  const memory = await prisma.userMemory.findUnique({
    where: { id },
    select: { id: true, userId: true, scope: true, title: true },
  });
  if (!memory) throw errors.notFound('التعليمة غير موجودة');

  // العامّة يملكها من يملك إدارة التصنيف، ولو أنشأها غيره
  const mine = memory.userId === userId;
  const globalAndAllowed = memory.scope === 'GLOBAL' && canGlobal;
  if (!mine && !globalAndAllowed) throw errors.notFound('التعليمة غير موجودة');

  return memory;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.ASSISTANT_USE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const { id } = await context.params;
    const canGlobal = can(actor, PERMISSIONS.TAXONOMY_MANAGE);
    const existing = await ownedMemory(id, actor.id, canGlobal);

    const input = await parseBody(request, updateMemorySchema);

    // الترقية إلى العامّ تُحرَس كما يُحرَس إنشاؤه — وإلا صار البابُ خلفياً
    if (input.scope === 'GLOBAL' && !canGlobal) {
      throw new ApiError(403, 'التعليمات العامة تخصّ من يملك إدارة التصنيف');
    }

    const memory = await prisma.userMemory.update({
      where: { id: existing.id },
      data: input,
      select: { id: true, title: true, status: true, scope: true },
    });

    await audit(actor, {
      action: AUDIT_ACTIONS.ASSISTANT_MEMORY_UPDATED,
      entityType: 'user_memory',
      entityId: memory.id,
      summary: `تعديل تعليمة: ${memory.title}`,
      metadata: { fields: Object.keys(input) },
    });

    return jsonOk({ memory });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.ASSISTANT_USE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const { id } = await context.params;
    const existing = await ownedMemory(id, actor.id, can(actor, PERMISSIONS.TAXONOMY_MANAGE));

    await prisma.userMemory.delete({ where: { id: existing.id } });

    await audit(actor, {
      action: AUDIT_ACTIONS.ASSISTANT_MEMORY_DELETED,
      entityType: 'user_memory',
      entityId: existing.id,
      summary: `حذف تعليمة: ${existing.title}`,
    });

    return jsonOk({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
