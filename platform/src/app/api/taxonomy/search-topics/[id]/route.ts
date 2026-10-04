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
import { updateSearchTopicSchema } from '@/lib/validation/taxonomy';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const actor = await requirePermission(PERMISSIONS.TAXONOMY_MANAGE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const { id } = await params;
    const input = await parseBody(request, updateSearchTopicSchema);

    const existing = await prisma.searchTopic.findUnique({
      where: { id },
      select: { name: true, query: true },
    });
    if (!existing) throw errors.notFound('موضوع البحث غير موجود');

    /*
     * الاسم المكرَّر يُردّ برسالةٍ لا بخطأ قاعدة.
     *
     * المفتاح الفريد يحمي الصحّة، ورسالتُه «Unique constraint failed»
     * — وهي جملةٌ لا تقول لصاحب الشاشة ما يفعل.
     */
    if (input.name && input.name !== existing.name) {
      const clash = await prisma.searchTopic.findUnique({ where: { name: input.name } });
      if (clash) throw errors.conflict('اسم الموضوع مستخدم مسبقاً');
    }

    const topic = await prisma.searchTopic.update({
      where: { id },
      data: input,
      select: { id: true, name: true, query: true },
    });

    /*
     * تغيير السطر يُسجَّل بنصّه القديم والجديد.
     *
     * الموضوع يُنفَّذ على التاريخ كلّه، فتعديلُ حرفٍ فيه يغيّر أرقام
     * تقريرٍ بُني عليه أمس. ومن قرأ الرقمين ولم يجد ما يفسّر الفرق
     * يشكّ في المنصّة كلها.
     */
    const summary =
      input.query !== undefined && input.query !== existing.query
        ? `تعديل موضوع البحث «${existing.name}» — السطر: «${existing.query}» ← «${topic.query}»`
        : `تعديل موضوع البحث «${existing.name}»`;

    await audit(actor, {
      action: AUDIT_ACTIONS.TAXONOMY_UPDATED,
      entityType: 'searchTopic',
      entityId: id,
      summary,
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
    const topic = await prisma.searchTopic.findUnique({ where: { id }, select: { name: true } });
    if (!topic) throw errors.notFound('موضوع البحث غير موجود');

    // لا منشور يُمسّ: الموضوع استعلامٌ لا رابطة
    await prisma.searchTopic.delete({ where: { id } });

    await audit(actor, {
      action: AUDIT_ACTIONS.TAXONOMY_DELETED,
      entityType: 'searchTopic',
      entityId: id,
      summary: `حذف موضوع البحث «${topic.name}»`,
    });

    return jsonOk({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
