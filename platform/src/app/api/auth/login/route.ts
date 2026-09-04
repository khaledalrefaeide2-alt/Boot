import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ApiError, jsonError, jsonOk, parseBody, errors } from '@/lib/api';
import { loginSchema } from '@/lib/validation/auth';
import { verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import {
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { audit, AUDIT_ACTIONS, requestMeta } from '@/lib/audit';
import { AUTH_MESSAGES } from '@/lib/domain/constants';

/** عدد المحاولات الفاشلة المتتالية على الحساب قبل الإيقاف المؤقت */
const MAX_FAILED_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

export async function POST(request: NextRequest) {
  try {
    const meta = await requestMeta();
    const ipKey = `login:ip:${meta.ipAddress ?? 'unknown'}`;

    // العدّادات تحصي المحاولات الفاشلة وحدها، فالقراءة هنا لا تزيدها.
    // الدخول الناجح لا يستهلك من الحد مهما تكرر.
    const ipLimit = await checkRateLimit(ipKey, RATE_LIMITS.LOGIN_PER_IP.limit);
    if (!ipLimit.allowed) {
      await audit(null, {
        action: AUDIT_ACTIONS.LOGIN_BLOCKED,
        entityType: 'auth',
        summary: 'تجاوز حد المحاولات الفاشلة من العنوان نفسه',
      });
      throw errors.tooMany(AUTH_MESSAGES.LOCKED);
    }

    const { email, password } = await parseBody(request, loginSchema);
    const emailKey = `login:email:${email}`;

    const emailLimit = await checkRateLimit(emailKey, RATE_LIMITS.LOGIN_PER_EMAIL.limit);
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
      // الزيادة تحدث عند الفشل فقط، وعلى المفتاحين معاً
      await recordFailedAttempt(ipKey, RATE_LIMITS.LOGIN_PER_IP.window);
      await recordFailedAttempt(emailKey, RATE_LIMITS.LOGIN_PER_EMAIL.window);

      if (user) {
        // إذا انتهت مدة إيقاف سابقة نبدأ عدّاً جديداً، وإلا بقي الحساب
        // محجوباً إلى الأبد لأن العدّاد يظل فوق الحد بعد انقضاء المدة
        const lockExpired =
          user.lockedUntil !== null && user.lockedUntil.getTime() <= Date.now();
        const failedCount = lockExpired ? 1 : user.failedLoginCount + 1;
        const locked = failedCount >= MAX_FAILED_ATTEMPTS;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: failedCount,
            lockedUntil: locked ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null,
          },
        });
        await audit(
          { id: user.id, email: user.email, role: user.role },
          {
            action: AUDIT_ACTIONS.LOGIN_FAILED,
            entityType: 'auth',
            entityId: user.id,
            summary: 'كلمة مرور غير صحيحة',
            metadata: { failedCount, locked },
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
      await audit(
        { id: user.id, email: user.email, role: user.role },
        {
          action: AUDIT_ACTIONS.LOGIN_BLOCKED,
          entityType: 'auth',
          entityId: user.id,
          summary: 'الحساب موقوف مؤقتاً بعد محاولات فاشلة متتالية',
        },
      );
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

    // الدخول الناجح يمسح أثر المحاولات الفاشلة على المفتاحين معاً
    await resetRateLimit(emailKey);
    await resetRateLimit(ipKey);

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
