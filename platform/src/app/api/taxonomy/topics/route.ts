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
import { createTopicSchema } from '@/lib/validation/taxonomy';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

export async function GET() {
  try {
    await requirePermission(PERMISSIONS.POSTS_VIEW);
    const topics = await prisma.topic.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        color: true,
        status: true,
        sortOrder: true,
        rules: true,
        _count: { select: { posts: true } },
      },
    });
    return jsonOk({ topics });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermission(PERMISSIONS.TAXONOMY_MANAGE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const input = await parseBody(request, createTopicSchema);

    const existing = await prisma.topic.findUnique({ where: { code: input.code } });
    if (existing) throw errors.conflict('رمز التصنيف مستخدم مسبقاً');

    const topic = await prisma.topic.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description,
        color: input.color,
        status: input.status,
        sortOrder: input.sortOrder,
        rules: { terms: input.terms } as never,
      },
      select: { id: true, name: true },
    });

    await audit(actor, {
      action: AUDIT_ACTIONS.TAXONOMY_CREATED,
      entityType: 'topic',
      entityId: topic.id,
      summary: `إضافة التصنيف «${topic.name}»`,
    });

    return jsonOk({ topic }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
