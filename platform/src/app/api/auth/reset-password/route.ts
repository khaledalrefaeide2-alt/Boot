import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { jsonError, jsonOk, parseBody, errors } from '@/lib/api';
import { resetPasswordSchema } from '@/lib/validation/auth';
import { hashPassword, hashToken } from '@/lib/auth/password';
import { revokeAllSessions } from '@/lib/auth/session';
import { rateLimit, resetRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { audit, AUDIT_ACTIONS, requestMeta } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const meta = await requestMeta();
    const limit = await rateLimit(
      `reset-submit:${meta.ipAddress ?? 'unknown'}`,
      RATE_LIMITS.PASSWORD_RESET.limit,
      RATE_LIMITS.PASSWORD_RESET.window,
    );
    if (!limit.allowed) throw errors.tooMany('محاولات كثيرة، حاول بعد ساعة');

    const { token, password } = await parseBody(request, resetPasswordSchema);

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        usedAt: true,
        expiresAt: true,
        user: { select: { id: true, email: true, role: true, status: true } },
      },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw errors.badRequest('رابط الاستعادة غير صالح أو منتهي الصلاحية');
    }
    if (record.user.status === 'DISABLED') {
      throw errors.forbidden('حسابك معطل');
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.user.id },
        data: {
          passwordHash: await hashPassword(password),
          failedLoginCount: 0,
          lockedUntil: null,
          mustChangePassword: false,
        },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // إبطال كل الرموز الأخرى للمستخدم نفسه
      prisma.passwordResetToken.updateMany({
        where: { userId: record.user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);

    // كل الجلسات القديمة تُبطل بعد تغيير كلمة المرور
    await revokeAllSessions(record.user.id);

    // رفع أي حجب على محاولات الدخول حتى يدخل المستخدم فوراً بكلمته الجديدة
    await resetRateLimit(`login:email:${record.user.email}`);

    await audit(
      { id: record.user.id, email: record.user.email, role: record.user.role },
      {
        action: AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED,
        entityType: 'user',
        entityId: record.user.id,
        summary: 'تمت استعادة كلمة المرور وإبطال الجلسات السابقة',
      },
    );

    return jsonOk({ message: 'تم تغيير كلمة المرور بنجاح، يمكنك تسجيل الدخول الآن' });
  } catch (error) {
    return jsonError(error);
  }
}
