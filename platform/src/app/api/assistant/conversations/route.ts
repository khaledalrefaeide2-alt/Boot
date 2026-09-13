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
import { createConversationSchema } from '@/lib/validation/assistant';

/*
 * محادثات المستخدم الحالي وحده.
 *
 * `userId: actor.id` ليس فلتر عرض بل حدّ ملكية: لا معامل طلب يوسّعه، ولا
 * مسار آخر يقرأ المحادثات بدونه. والمحادثة تحمل أسئلة الموظف وتحليلاته،
 * وهي خاصة به ولو كان زميله يرى البيانات نفسها.
 */

export async function GET() {
  try {
    const actor = await requirePermission(PERMISSIONS.ASSISTANT_USE);

    const conversations = await prisma.assistantConversation.findMany({
      where: { userId: actor.id },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });

    return jsonOk({ conversations });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermission(PERMISSIONS.ASSISTANT_USE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const input = await parseBody(request, createConversationSchema);

    const conversation = await prisma.assistantConversation.create({
      data: { userId: actor.id, title: input.title || 'محادثة جديدة' },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });

    return jsonOk({ conversation }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
