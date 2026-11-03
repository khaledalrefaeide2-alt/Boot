import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * رمز «الجهاز الموثوق» — دوالّ خالصة تُفحص وحدها.
 *
 * ★ لماذا الجهاز؟ لأنّ حدّ التخمين على البريد سلاحٌ في يد الخصم.
 *
 *   الحدّ يحمي من يخمّن كلمة المرور، وهو هو ما يحجب صاحبها: محاولاتٌ
 *   خاطئة كافية على بريد المالك من أيّ مكان تمنعه من الدخول بكلمته
 *   الصحيحة. والحلّ المعروف (OWASP: Device Cookies) أن يُعطى المتصفّح
 *   الذي دخل منه صاحب الحساب بنجاح رمزاً موقَّعاً بالبريد، فيُحسب له
 *   عدّاده الخاص ولا يمسّه حجبُ ما يأتي من غيره.
 *
 *   الرمز لا يُدخل أحداً: كلمة المرور تبقى شرطاً. كلّ ما يفعله أنّه
 *   يُخرج صاحبه من الحجب الذي يصنعه غيره.
 *
 * الصيغة: `<nonce>.<hmac(device|email|nonce)>` — والمفتاح سرّ الخادم.
 */
function signature(email: string, nonce: string, secret: string): string {
  return createHmac('sha256', secret).update(`device|${email}|${nonce}`).digest('base64url');
}

export function issueDeviceToken(email: string, secret: string): string {
  const nonce = randomBytes(16).toString('base64url');
  return `${nonce}.${signature(email, nonce, secret)}`;
}

/** يُعيد معرّف الجهاز إن كان الرمز صادراً لهذا البريد، وإلا null */
export function verifyDeviceToken(
  value: string | null | undefined,
  email: string,
  secret: string,
): string | null {
  if (!value) return null;
  const dot = value.indexOf('.');
  if (dot <= 0 || dot !== value.lastIndexOf('.')) return null;
  const nonce = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(signature(email, nonce, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return nonce;
}
