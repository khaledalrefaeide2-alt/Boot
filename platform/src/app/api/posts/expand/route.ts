import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  errors,
  jsonError,
  jsonOk,
  parseBody,
  requireCsrf,
  requirePermission,
} from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { isAssistantConfigured } from '@/lib/assistant/config';
import { expandSearch } from '@/lib/search/expand';

const bodySchema = z.object({
  q: z.string().trim().min(2).max(500),
});

/**
 * توسيع سطر البحث إلى ألفاظٍ مرتبطة.
 *
 * ★ ولا يُرجع خطأً حين يتعذّر التوسيع.
 *
 *   هو تحسينٌ لا شرط: بلا مفتاح، أو بانقطاع عند المزوّد، يجب أن يبحث
 *   الموظّف بكلماته كما كتبها. فيُعاد السطر كما ورد و`source: 'none'`،
 *   وتقول الشاشة إنّ التوسيع لم يتمّ — ولا تتعطّل.
 *
 * والحدّ حدُّ المساعد نفسه: كلّ توسيعٍ استدعاءٌ مدفوع، والنسخة المحفوظة
 * تجعل تكرار السؤال نفسه مجّانياً.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermission(PERMISSIONS.POSTS_VIEW);
    await requireCsrf();

    const { q } = await parseBody(request, bodySchema);

    if (!isAssistantConfigured()) {
      return jsonOk({ query: q, added: [], source: 'none' as const });
    }

    const quota = await rateLimit(
      `expand:${actor.id}`,
      RATE_LIMITS.ASSISTANT.limit,
      RATE_LIMITS.ASSISTANT.window,
    );
    if (!quota.allowed) throw errors.tooMany('تجاوزت حدّ التوسيع في هذه الساعة. ابحث بكلماتك.');

    return jsonOk(await expandSearch(q));
  } catch (error) {
    return jsonError(error);
  }
}
