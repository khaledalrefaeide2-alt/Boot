import 'server-only';
import bcrypt from 'bcryptjs';
import { randomBytes, createHmac } from 'node:crypto';
import { env } from '@/lib/env';

const BCRYPT_ROUNDS = 12;

/** تشفير كلمة المرور */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/** التحقق من كلمة المرور — يعمل بزمن ثابت نسبياً عبر bcrypt */
export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (!hash) {
    // نُنفّذ مقارنة وهمية حتى لا يكشف الفارق الزمني وجود المستخدم من عدمه
    await bcrypt.compare(plain, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
    return false;
  }
  return bcrypt.compare(plain, hash);
}

/** توليد رمز عشوائي آمن (للجلسات واستعادة كلمة المرور) */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * تجزئة الرمز قبل تخزينه — لا نخزّن الرموز الخام في القاعدة إطلاقاً.
 *
 * نستخدم HMAC بمفتاح SESSION_SECRET بدل تجزئة عادية، فيصبح المفتاح خط دفاع
 * ثانياً: من يحصل على نسخة من قاعدة البيانات وحدها لا يستطيع مطابقة أي رمز
 * جلسة أو استعادة مسرَّب من مكان آخر ما لم يحصل على المفتاح من بيئة الخادم.
 *
 * تنبيه تشغيلي: تغيير SESSION_SECRET يُبطل كل الجلسات وروابط الاستعادة القائمة،
 * ويحتاج المستخدمون إلى تسجيل الدخول من جديد.
 */
export function hashToken(token: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(token).digest('hex');
}

export interface PasswordStrength {
  ok: boolean;
  problems: string[];
}

/** فحص قوة كلمة المرور — يُطبَّق في الخادم دائماً */
export function checkPasswordStrength(password: string): PasswordStrength {
  const problems: string[] = [];
  if (password.length < 10) problems.push('يجب ألا تقل كلمة المرور عن 10 محارف');
  if (!/[a-z؀-ۿ]/.test(password) && !/[A-Z]/.test(password)) {
    problems.push('يجب أن تحتوي على حروف');
  }
  if (!/\d/.test(password)) problems.push('يجب أن تحتوي على رقم واحد على الأقل');
  if (/^\s|\s$/.test(password)) problems.push('لا يجوز أن تبدأ أو تنتهي بمسافة');
  return { ok: problems.length === 0, problems };
}
