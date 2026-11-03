import 'server-only';
import { cookies } from 'next/headers';
import { env, isProduction } from '@/lib/env';
import { DEVICE_COOKIE } from './cookies';
import { issueDeviceToken, verifyDeviceToken } from './device-token';
import { resetRateLimit, resetRateLimitPrefix } from '@/lib/rate-limit';

/** مدة ثقة الجهاز — سنة، وتتجدّد مع كلّ دخولٍ ناجح منه */
const DEVICE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** مفاتيح عدّادات الدخول — في موضعٍ واحد يقرؤه الدخول ومن يرفع الحجب */
export const loginKeys = {
  ip: (ip: string | null) => `login:ip:${ip ?? 'unknown'}`,
  email: (email: string) => `login:email:${email}`,
  emailIp: (email: string, ip: string | null) => `login:email-ip:${email}:${ip ?? 'unknown'}`,
  emailIpPrefix: (email: string) => `login:email-ip:${email}:`,
  device: (deviceId: string) => `login:device:${deviceId}`,
};

/** معرّف الجهاز الموثوق لهذا البريد في الطلب الحالي، أو null */
export async function trustedDeviceFor(email: string): Promise<string | null> {
  const value = (await cookies()).get(DEVICE_COOKIE)?.value;
  return verifyDeviceToken(value, email, env.SESSION_SECRET);
}

/** يُعلَّم المتصفّح جهازاً موثوقاً لهذا البريد بعد دخولٍ ناجح */
export async function rememberDevice(email: string): Promise<void> {
  (await cookies()).set(DEVICE_COOKIE, issueDeviceToken(email, env.SESSION_SECRET), {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: DEVICE_MAX_AGE_SECONDS,
  });
}

/**
 * رفع كلّ حجبٍ على دخول هذا البريد — عند تفعيل الحساب أو إعادة تعيين كلمته.
 *
 * عدّادات «البريد من عنوان» بعدد العناوين التي جُرّب منها، فتُمحى بالبادئة.
 */
export async function clearLoginLocks(email: string): Promise<void> {
  await resetRateLimit(loginKeys.email(email));
  await resetRateLimitPrefix(loginKeys.emailIpPrefix(email));
}
