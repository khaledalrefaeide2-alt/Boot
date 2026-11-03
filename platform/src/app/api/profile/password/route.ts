import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { errors, jsonError, jsonOk, parseBody, requireAuth, requireCsrf } from '@/lib/api';
import { changePasswordSchema } from '@/lib/validation/auth';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { revokeAllSessions, createSession } from '@/lib/auth/session';
import { audit, AUDIT_ACTIONS, requestMeta } from '@/lib/audit';
import { checkRateLimit, recordFailedAttempt, resetRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/** تغيير كلمة المرور — يُبطل كل الجلسات الأخرى ويُنشئ جلسة جديدة للمستخدم */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth({ allowPendingPasswordChange: true });
    await requireCsrf();

    /*
     * ★ فحصُ «كلمة المرور الحالية» كان بلا حدّ.
     *
     *   فمن سرق جلسةً مفتوحة — حاسوبٌ تُرك بلا قفل، أو كوكي تسرّبت —
     *   كان يستطيع أن يخمّن الكلمة نفسها بلا عدد، فيأخذ ما يصلح لحسابات
     *   الموظّف الأخرى، ثمّ يغيّرها فيُخرجه من حسابه.
     */
    const limitKey = `password-change:${user.id}`;
    const limit = await checkRateLimit(limitKey, RATE_LIMITS.PASSWORD_CHANGE.limit);
    if (!limit.allowed) throw errors.tooMany('محاولات كثيرة، حاول بعد ربع ساعة');

    const input = await parseBody(request, changePasswordSchema);

    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    const valid = await verifyPassword(input.currentPassword, record?.passwordHash ?? null);
    if (!valid) {
      await recordFailedAttempt(limitKey, RATE_LIMITS.PASSWORD_CHANGE.window);
      throw errors.badRequest('كلمة المرور الحالية غير صحيحة');
    }
    await resetRateLimit(limitKey);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.password), mustChangePassword: false },
    });

    await revokeAllSessions(user.id);
    await createSession(user.id, await requestMeta());

    await audit(user, {
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      entityType: 'user',
      entityId: user.id,
      summary: 'تغيير كلمة المرور وإبطال الجلسات الأخرى',
    });

    return jsonOk({ message: 'غُيّرت كلمة المرور وأُبطلت جلساتك الأخرى' });
  } catch (error) {
    return jsonError(error);
  }
}
