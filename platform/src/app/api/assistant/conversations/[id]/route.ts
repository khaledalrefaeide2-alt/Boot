import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import {
  errors,
  guardMutationRate,
  jsonError,
  jsonOk,
  requireCsrf,
  requirePermission,
} from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';

type Params = { params: Promise<{ id: string }> };

/**
 * التحقّق من الملكية.
 *
 * محادثة مستخدم آخر تُعامل كغير موجودة لا كممنوعة: الردّ «ممنوع» يؤكّد
 * وجود المعرّف لمن جرّبه، والردّ «غير موجود» لا يؤكّد شيئاً.
 */
async function ownedOrNotFound(id: string, userId: string): Promise<void> {
  const existing = await prisma.assistantConversation.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!existing || existing.userId !== userId) {
    throw errors.notFound('المحادثة غير موجودة');
  }
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const actor = await requirePermission(PERMISSIONS.ASSISTANT_USE);
    const { id } = await params;
    await ownedOrNotFound(id, actor.id);

    const conversation = await prisma.assistantConversation.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          // الـ metadata لا تُرسل إلى المتصفّح: هي للتدقيق الخادمي وحده
          select: { id: true, role: true, content: true, createdAt: true },
        },
      },
    });

    return jsonOk({ conversation });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const actor = await requirePermission(PERMISSIONS.ASSISTANT_USE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const { id } = await params;
    await ownedOrNotFound(id, actor.id);

    // الرسائل تُحذف معها بـ onDelete: Cascade في المخطط
    await prisma.assistantConversation.delete({ where: { id } });

    return jsonOk({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
