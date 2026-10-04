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
import { createSearchTopicSchema } from '@/lib/validation/taxonomy';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

/**
 * مواضيع البحث المحفوظة.
 *
 * القراءة لكلّ من يرى المنشورات — الموضوع أداةُ بحثٍ لا بيانات، وحجبُه
 * عمّن يبحث يُفرغه من معناه. والكتابة لمن يملك إدارة التصنيف: سطرٌ واحد
 * يُحرَّر يغيّر ما يراه كلّ من اختار الموضوع، على التاريخ كلّه.
 */
export async function GET() {
  try {
    await requirePermission(PERMISSIONS.POSTS_VIEW);
    const topics = await prisma.searchTopic.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        query: true,
        description: true,
        color: true,
        status: true,
        sortOrder: true,
        updatedAt: true,
        createdBy: { select: { id: true, name: true } },
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

    const input = await parseBody(request, createSearchTopicSchema);

    const existing = await prisma.searchTopic.findUnique({ where: { name: input.name } });
    if (existing) throw errors.conflict('اسم الموضوع مستخدم مسبقاً');

    const topic = await prisma.searchTopic.create({
      data: { ...input, createdById: actor.id },
      select: { id: true, name: true },
    });

    await audit(actor, {
      action: AUDIT_ACTIONS.TAXONOMY_CREATED,
      entityType: 'searchTopic',
      entityId: topic.id,
      summary: `إضافة موضوع البحث «${topic.name}»`,
    });

    return jsonOk({ topic }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
