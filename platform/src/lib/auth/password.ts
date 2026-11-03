import 'server-only';
import bcrypt from 'bcryptjs';
import { randomBytes, createHmac } from 'node:crypto';
import { env } from '@/lib/env';

const BCRYPT_ROUNDS = 12;

/**
 * بصمةٌ صالحة بالكلفة نفسها لكلمة مرورٍ عشوائية أُتلفت لحظة توليدها.
 *
 * ★ كانت البصمة الوهمية نصّاً بطول 65 محرفاً، والبصمة الصالحة 60.
 *
 *   وbcryptjs يردّ «لا» فوراً على بصمةٍ بطولٍ غير صالح دون أن يجزّئ
 *   شيئاً. فكان البريد غير المسجّل يُجاب في نحو 14ms، والمسجّل في نحو
 *   400ms — فرقٌ يقرؤه أيّ أحد بساعة يده، فيعرف أيّ بريد موظّفٍ مسجّل
 *   ثمّ يركّز التخمين عليه. والتعليق فوق المقارنة كان يقول العكس.
 *
 * ليست سرّاً: لا أحد يعرف ما جُزّئ فيها، ووجودها في الشيفرة لا يُعطي شيئاً.
 * وتُفحص في `verify:hardening`: طولها، وأنّ زمنها كزمن بصمةٍ حقيقية.
 */
export const DUMMY_PASSWORD_HASH = '$2b$12$rZ4gTlgEGQMyx791IpwJ6e5D2YzNmBNzubbGv/fJpDKf0V1odFILe';

/** تشفير كلمة المرور */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/** التحقق من كلمة المرور — بزمنٍ واحد وُجد المستخدم أم لم يوجد */
export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (!hash) {
    // مقارنةٌ حقيقية الكلفة حتى لا يكشف الفارق الزمني وجود المستخدم من عدمه
    await bcrypt.compare(plain, DUMMY_PASSWORD_HASH);
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
