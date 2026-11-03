/**
 * سياسة المحتوى للصفحات — برمزٍ عشوائيّ (nonce) لكلّ طلب.
 *
 * ★ كانت `script-src 'self' 'unsafe-inline'`، أي أنّ أيّ نصٍّ برمجيّ سطريّ يُنفَّذ.
 *
 *   React يهرّب ما يعرضه، فالسياسة طبقةٌ ثانية. لكنّ `unsafe-inline` كان
 *   يُبطل نصفها: حقنٌ يبلغ يوماً موضعاً غير مهرَّب — في مكتبةٍ أو في شيفرةٍ
 *   تُضاف بعد سنة — يُنفَّذ كما لو كتبناه نحن. وكان مقبولاً لأنّ Next
 *   يبثّ حالة الصفحة في وسومٍ سطرية لا تعمل بدونه.
 *
 *   والرمز يحلّ ذلك: الوسيط يولّد رمزاً لكلّ طلب ويكتبه في السياسة، وNext
 *   يقرؤه من ترويسة الطلب ويضعه على كلّ وسمٍ يكتبه هو. فيعمل ما كتبناه،
 *   ولا يعمل ما حُقن — لأنّ الحاقن لا يعرف رمز الطلب.
 *
 *   و`'strict-dynamic'` تُجيز ما يُحمّله نصٌّ موثوق (أجزاء الحزمة التي
 *   تُطلب عند التنقّل) دون قائمة مضيفات.
 *
 *   والثمن: الصفحات كلّها تُصيَّر عند الطلب — رمزٌ لكلّ طلب لا يُكتب في
 *   صفحةٍ مبنيّة سلفاً. وهي كذلك أصلاً إلا صفحات الدخول الثلاث.
 *
 * والأنماط تبقى `'unsafe-inline'`: React يكتب `style=` على العناصر، والرمز
 * لا يسري على السمات. وخطرُ الأنماط تسريبٌ محدود لا تنفيذ شيفرة.
 *
 * دالّتان خالصتان — تُفحصان في `verify:hardening` و`verify:security`.
 */

/** رمزٌ عشوائيّ لطلبٍ واحد — Web Crypto متاحٌ في الوسيط وفي Node */
export function generateNonce(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function contentSecurityPolicy(nonce: string, options: { dev: boolean }): string {
  return [
    "default-src 'self'",
    // التطوير وحده يحتاج eval: React يبني منه تتبّع الأخطاء في وضع التطوير
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${options.dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    // الخطّ مستضافٌ في public/fonts — فلا مصدر خارجي البتّة
    "font-src 'self'",
    // الصور من المنصة نفسها وحدها — الوسائط تُقدَّم من /api/media
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/**
 * سياسة ردود API — لا تُعرض صفحاتٍ أصلاً، فلا تحتاج شيئاً.
 *
 * ردٌّ JSON فُتح في المتصفّح مباشرةً لا يُنفّذ شيئاً ولا يُؤطَّر.
 */
export const API_CONTENT_SECURITY_POLICY = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";
