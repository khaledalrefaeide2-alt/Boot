import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ApiError, errors, jsonError, jsonOk, parseBody, requireTrustedOrigin } from '@/lib/api';
import { loginSchema } from '@/lib/validation/auth';
import { verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { loginKeys, rememberDevice, trustedDeviceFor } from '@/lib/auth/login-guard';
import {
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { audit, AUDIT_ACTIONS, requestMeta } from '@/lib/audit';
import { AUTH_MESSAGES } from '@/lib/domain/constants';

/**
 * عدد المحاولات الفاشلة المتتالية على الحساب قبل الإيقاف المؤقت.
 *
 * مساوٍ لحدّ البريد من كلّ مكان: القفل في القاعدة هو ذاك الحدّ نفسه حين
 * يغيب Redis أو يُعاد تشغيله، لا حدٌّ ثالث أضيق منه.
 */
const MAX_FAILED_ATTEMPTS = RATE_LIMITS.LOGIN_PER_EMAIL.limit;
const LOCK_MINUTES = 15;

interface LimitRule {
  key: string;
  limit: number;
  window: number;
}

export async function POST(request: NextRequest) {
  try {
    await requireTrustedOrigin();
    const meta = await requestMeta();
    const ipKey = loginKeys.ip(meta.ipAddress);

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

    /*
     * الجهاز الموثوق يُحسب وحده؛ وما سواه يُحسب على البريد من عنوانه،
     * وعلى البريد من كلّ مكان. شرحُ الطبقات الثلاث عند RATE_LIMITS.
     */
    const deviceId = await trustedDeviceFor(email);
    const rules: LimitRule[] = deviceId
      ? [{ key: loginKeys.device(deviceId), ...RATE_LIMITS.LOGIN_PER_DEVICE }]
      : [
          { key: loginKeys.emailIp(email, meta.ipAddress), ...RATE_LIMITS.LOGIN_PER_EMAIL_IP },
          { key: loginKeys.email(email), ...RATE_LIMITS.LOGIN_PER_EMAIL },
        ];

    for (const rule of rules) {
      const result = await checkRateLimit(rule.key, rule.limit);
      if (!result.allowed) throw errors.tooMany(AUTH_MESSAGES.LOCKED);
    }

    const recordFailure = async () => {
      await recordFailedAttempt(ipKey, RATE_LIMITS.LOGIN_PER_IP.window);
      for (const rule of rules) await recordFailedAttempt(rule.key, rule.window);
    };

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

    /*
     * ★ القفل يُفحص قبل أن يُقال شيءٌ عن كلمة المرور.
     *
     *   كان يُفحص بعدها: الكلمة الخاطئة على حسابٍ مقفل تردّ 401، والصحيحة
     *   تردّ 429. فمن واصل التخمين أثناء القفل عرف الكلمة الصحيحة من
     *   اختلاف الردّ وحده — القفل يُعلن نجاح التخمين بدل أن يمنعه.
     *
     *   والجهاز الموثوق لا يقف عند هذا القفل: هو قفلُ ما يأتي من غيره.
     */
    const lockActive = Boolean(user?.lockedUntil && user.lockedUntil.getTime() > Date.now());
    if (user && lockActive && !deviceId) {
      if (!passwordValid) await recordFailure();
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

    if (!user || !passwordValid) {
      // الزيادة تحدث عند الفشل فقط، وعلى كل المفاتيح الفاعلة معاً
      await recordFailure();

      if (user) {
        // إذا انتهت مدة إيقاف سابقة نبدأ عدّاً جديداً، وإلا بقي الحساب
        // محجوباً إلى الأبد لأن العدّاد يظل فوق الحد بعد انقضاء المدة
        const lockExpired =
          user.lockedUntil !== null && user.lockedUntil.getTime() <= Date.now();
        const failedCount = lockExpired ? 1 : user.failedLoginCount + 1;
        /*
         * ★ والقفل القائم لا يُمدَّد.
         *
         *   كانت كلّ محاولةٍ فاشلة أثناء القفل تعيد ضبطه ربع ساعةٍ من
         *   لحظتها، فيبقى الحساب مقفلاً ما دام أحدٌ يطرق بابه.
         */
        const lockedUntil = lockActive
          ? user.lockedUntil
          : failedCount >= MAX_FAILED_ATTEMPTS
            ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
            : null;
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: failedCount, lockedUntil },
        });
        await audit(
          { id: user.id, email: user.email, role: user.role },
          {
            action: AUDIT_ACTIONS.LOGIN_FAILED,
            entityType: 'auth',
            entityId: user.id,
            summary: 'كلمة مرور غير صحيحة',
            metadata: { failedCount, locked: lockedUntil !== null, trustedDevice: Boolean(deviceId) },
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
    await rememberDevice(user.email);

    // الدخول الناجح يمسح أثر المحاولات الفاشلة على كل المفاتيح
    for (const rule of rules) await resetRateLimit(rule.key);
    await resetRateLimit(loginKeys.email(email));
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
