import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ApiError, jsonError, jsonOk, parseBody, errors } from '@/lib/api';
import { loginSchema } from '@/lib/validation/auth';
import { verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { rateLimit, resetRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { audit, AUDIT_ACTIONS, requestMeta } from '@/lib/audit';
import { AUTH_MESSAGES } from '@/lib/domain/constants';

/** عدد المحاولات الفاشلة قبل الإيقاف المؤقت */
const MAX_FAILED_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

export async function POST(request: NextRequest) {
  try {
    const meta = await requestMeta();
    const ipKey = meta.ipAddress ?? 'unknown';

    // تحديد المعدل حسب العنوان قبل قراءة أي بيانات
    const ipLimit = await rateLimit(
      `login:ip:${ipKey}`,
      RATE_LIMITS.LOGIN_PER_IP.limit,
      RATE_LIMITS.LOGIN_PER_IP.window,
    );
    if (!ipLimit.allowed) {
      await audit(null, {
        action: AUDIT_ACTIONS.LOGIN_BLOCKED,
        entityType: 'auth',
        summary: 'تجاوز حد المحاولات من العنوان نفسه',
      });
      throw errors.tooMany(AUTH_MESSAGES.LOCKED);
    }

    const { email, password } = await parseBody(request, loginSchema);

    const emailLimit = await rateLimit(
      `login:email:${email}`,
      RATE_LIMITS.LOGIN_PER_EMAIL.limit,
      RATE_LIMITS.LOGIN_PER_EMAIL.window,
    );
    if (!emailLimit.allowed) throw errors.tooMany(AUTH_MESSAGES.LOCKED);

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        passwordHash: true,
        failedLoginCount: true,
        lockedUntil: true,
        mustChangePassword: true,
      },
    });

    // مقارنة تُنفَّذ دائماً حتى لا يكشف الفارق الزمني وجود الحساب
    const passwordValid = await verifyPassword(password, user?.passwordHash ?? null);

    if (!user || !passwordValid) {
      if (user) {
        const failedCount = user.failedLoginCount + 1;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: failedCount,
            lockedUntil:
              failedCount >= MAX_FAILED_ATTEMPTS
                ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
                : null,
          },
        });
        await audit(
          { id: user.id, email: user.email, role: user.role },
          {
            action: AUDIT_ACTIONS.LOGIN_FAILED,
            entityType: 'auth',
            entityId: user.id,
            summary: 'كلمة مرور غير صحيحة',
            metadata: { failedCount },
          },
        );
      } else {
        await audit(null, {
          action: AUDIT_ACTIONS.LOGIN_FAILED,
          entityType: 'auth',
          summary: 'محاولة دخول ببريد غير مسجل',
          metadata: { email },
        });
      }
      throw new ApiError(401, AUTH_MESSAGES.INVALID);
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw errors.tooMany(AUTH_MESSAGES.LOCKED);
    }

    // الحالة تُكشف بعد التحقق من كلمة المرور فقط — لا تسريب لوجود الحسابات
    if (user.status === 'PENDING') {
      await audit(
        { id: user.id, email: user.email, role: user.role },
        {
          action: AUDIT_ACTIONS.LOGIN_BLOCKED,
          entityType: 'auth',
          entityId: user.id,
          summary: 'محاولة دخول لحساب بانتظار الموافقة',
        },
      );
      throw new ApiError(403, AUTH_MESSAGES.PENDING);
    }

    if (user.status === 'DISABLED') {
      await audit(
        { id: user.id, email: user.email, role: user.role },
        {
          action: AUDIT_ACTIONS.LOGIN_BLOCKED,
          entityType: 'auth',
          entityId: user.id,
          summary: 'محاولة دخول لحساب معطل',
        },
      );
      throw new ApiError(403, AUTH_MESSAGES.DISABLED);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    await createSession(user.id, meta);
    await resetRateLimit(`login:email:${email}`);

    await audit(
      { id: user.id, email: user.email, role: user.role },
      { action: AUDIT_ACTIONS.LOGIN_SUCCESS, entityType: 'auth', entityId: user.id },
    );

    return jsonOk({
      redirectTo: user.mustChangePassword ? '/profile?change-password=1' : '/',
      user: { id: user.id, name: user.name, role: user.role },
    });
  } catch (error) {
    return jsonError(error);
  }
}
