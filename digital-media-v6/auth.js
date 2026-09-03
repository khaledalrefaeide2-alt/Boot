'use strict';

/*
 * auth.js — الفصل بين لوحة التحكّم الكامل ولوحة عرض النتائج
 * ==================================================================
 * الفكرة: صفحات الاستخراج والرصد والإعدادات (index.html، twitter.html،
 * dashboard.html، twitter-dashboard.html، settings.html) للمدير وحده.
 * وصفحة results.html — عرض واستعراض وبحث وتصنيف بلا أي إجراء — مفتوحة
 * للجميع بلا تسجيل دخول.
 *
 * ═══════════════════════ إخلاء مسؤولية صريح ═══════════════════════
 * هذا **ليس أماناً حقيقياً**، وهذا ليس تقصيراً بل نتيجة القيد الحاكم في
 * المشروع كله: الموقع ملفّات HTML/JS تُفتح من القرص مباشرةً (file://)،
 * بلا خادم يتحقّق من الهوية. من يملك المجلد يملك كل شيء فيه — يستطيع
 * فتح index.html مباشرةً متجاوزاً بوّابة الدخول، أو قراءة كلمة المرور
 * بأدوات المطوّر، أو حتى حذف هذا الملف. لا توجد طريقة تقنية لمنع ذلك
 * بدون خادم حقيقي يخدم الصفحات ويتحقّق من الجلسات على طرفه، وهو ما
 * يُبطل قدرة الأداة على العمل من القرص بلا اتصال — القيد الأعلى في
 * AGENTS.md.
 *
 * فائدة هذه البوّابة إذن سلوكية لا أمنية: تمنع الوصول العرضي والمرور
 * الطبيعي لمستخدم غير تقني لا ينوي التحايل، وتُبقي شاشة الاستخراج
 * والمفاتيح بعيدة عن أعين من لا يحتاجها في العمل اليومي. لا تُسلَّم هذه
 * الأداة لجهة لا تثق بها لمجرّد وجود هذه البوّابة.
 *
 * التنفيذ: كلمة المرور لا تُخزَّن أبداً — يُخزَّن فقط ملح عشوائي وناتج
 * SHA-256 له مع كلمة المرور (Web Crypto API، بلا اعتمادية خارجية). هذا
 * يمنع قراءة كلمة المرور مباشرة من التخزين المحلي، لكنه لا يمنع كسرها
 * دون اتصال بمن يملك الوقت — وهو نفس القيد أعلاه: لا خادم يبطئ المحاولات
 * أو يقفل الحساب.
 */

(function (W) {
  const KEY_HASH = 'fbx_admin_hash';       // JSON: { salt, hash }
  const KEY_SESSION = 'fbx_admin_session'; // '1' فور نجاح الدخول، حتى تسجيل الخروج

  function bytesToHex(buf) {
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return bytesToHex(buf);
  }

  function randomHex(bytes) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return bytesToHex(arr.buffer);
  }

  function readRecord() {
    try {
      const raw = localStorage.getItem(KEY_HASH);
      if (!raw) return null;
      const rec = JSON.parse(raw);
      return (rec && rec.salt && rec.hash) ? rec : null;
    } catch (e) { return null; }
  }

  /* هل ضُبطت كلمة مرور مدير من قبل؟ لا — فهذه أوّل زيارة، ويجب عرض شاشة
     «إنشاء حساب المدير» بدل «تسجيل الدخول» وإلا حُبس المدير الأوّل نفسه
     خارج أداته. */
  function isSetup() {
    return !!readRecord();
  }

  function isAdmin() {
    try { return localStorage.getItem(KEY_SESSION) === '1'; }
    catch (e) { return false; }
  }

  async function setPassword(pw) {
    const salt = randomHex(16);
    const hash = await sha256Hex(salt + pw);
    localStorage.setItem(KEY_HASH, JSON.stringify({ salt, hash }));
    localStorage.setItem(KEY_SESSION, '1');
  }

  async function login(pw) {
    const rec = readRecord();
    if (!rec) return false;
    const hash = await sha256Hex(rec.salt + pw);
    if (hash !== rec.hash) return false;
    localStorage.setItem(KEY_SESSION, '1');
    return true;
  }

  async function changePassword(oldPw, newPw) {
    const ok = await login(oldPw);
    if (!ok) return false;
    await setPassword(newPw);
    return true;
  }

  function logout() {
    try { localStorage.removeItem(KEY_SESSION); } catch (e) { /* لا شيء نفعله */ }
  }

  /* يستدعيها login.html فقط: مسح كلمة المرور بالكامل لمن نسيها، فيعود
     المشروع إلى حالة «بلا مدير» ويُطلب إنشاء حساب من جديد. إجراء متاح
     عمداً — فلا خادم يعيد التعيين، والبديل الوحيد لولاه حذف الملفات. */
  function resetSetup() {
    try { localStorage.removeItem(KEY_HASH); localStorage.removeItem(KEY_SESSION); } catch (e) {}
  }

  W.FBXAuth = { isSetup, isAdmin, setPassword, login, changePassword, logout, resetSetup };
})(typeof window !== 'undefined' ? window : globalThis);
