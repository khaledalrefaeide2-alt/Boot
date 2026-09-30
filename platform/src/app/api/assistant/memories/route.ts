import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import {
  ApiError,
  guardMutationRate,
  jsonError,
  jsonOk,
  parseBody,
  requireCsrf,
  requirePermission,
} from '@/lib/api';
import { PERMISSIONS, can } from '@/lib/auth/rbac';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { createMemorySchema } from '@/lib/validation/assistant';
import { listMemories, memoryCount, MEMORY_LIMITS } from '@/lib/assistant/memory';

/*
 * تعليمات المستخدم المحفوظة.
 *
 * الصلاحية `assistant.use` — من يستعمل المساعد يملك تعليماته. وهذا ليس
 * تساهلاً: التعليمة تُغيّر أسلوب جوابه هو، ولا تمسّ تصنيفاً ولا رقماً ولا
 * بيانات غيره. أما `GLOBAL` فترجع إلى `taxonomy.manage` — الإذن نفسه
 * الذي يحرس توجيهات التصنيف، لأنها كذلك تسري على الجميع.
 */

export async function GET() {
  try {
    const actor = await requirePermission(PERMISSIONS.ASSISTANT_USE);
    const memories = await listMemories(actor.id);
    return jsonOk({
      memories,
      canManageGlobal: can(actor, PERMISSIONS.TAXONOMY_MANAGE),
      limits: MEMORY_LIMITS,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermission(PERMISSIONS.ASSISTANT_USE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const input = await parseBody(request, createMemorySchema);

    /*
     * النطاق العام يُردّ صراحةً لمن لا يملكه.
     *
     * ولا يُخفَّض صامتاً إلى `USER`: من طلب تعليمةً على المنصة كلها
     * وحُفظت له وحده يحسبها سارية على الجميع شهوراً — والصمت هنا يصنع
     * اعتقاداً خاطئاً، والرفض يصنع سؤالاً.
     */
    if (input.scope === 'GLOBAL' && !can(actor, PERMISSIONS.TAXONOMY_MANAGE)) {
      throw new ApiError(403, 'التعليمات العامة تخصّ من يملك إدارة التصنيف — احفظها لنفسك أو اطلب من مسؤول');
    }

    const owned = await memoryCount(actor.id);
    if (owned >= MEMORY_LIMITS.perUser) {
      throw new ApiError(400, `بلغتَ الحدّ الأقصى (${MEMORY_LIMITS.perUser} تعليمة) — احذف أو عطّل بعضها`);
    }

    const memory = await prisma.userMemory.create({
      // `userId` من الجلسة لا من الطلب: لا يُنشئ أحدٌ تعليمةً باسم غيره
      data: { ...input, userId: actor.id },
      select: { id: true, title: true, scope: true },
    });

    await audit(actor, {
      action: AUDIT_ACTIONS.ASSISTANT_MEMORY_SAVED,
      entityType: 'user_memory',
      entityId: memory.id,
      summary: `حفظ تعليمة: ${memory.title}`,
      metadata: { scope: memory.scope, kind: input.kind },
    });

    return jsonOk({ memory }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
