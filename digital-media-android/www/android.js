/*
 * android.js — طبقة الغلاف الأصلي
 * ==================================================================
 * تُحمَّل قبل بقية الوحدات في نسخة أندرويد وحدها. لا يوجد ما يقابلها في
 * نسخة المتصفّح، ولا تُحمَّل هناك.
 *
 * WebView ليس متصفّحاً كاملاً: أربعة أشياء يعطيها المتصفّح مجاناً ويجب
 * أن تُكتب هنا صراحةً، وإلا بدت الميزة سليمةً وهي معطّلة:
 *
 *   1. الحفظ — <a download> لا يفعل شيئاً في WebView. التصدير يبدو ناجحاً
 *      ولا ملف يُكتب. نستبدل منفذ الحفظ FBXSave بكتابة فعلية على قرص
 *      الجهاز ثم عرض ورقة المشاركة ليختار المستخدم وجهة الملف.
 *   2. الروابط الخارجية — target=_blank يفتح داخل الغلاف نفسه بلا شريط
 *      عنوان ولا زرّ رجوع، فيحتجز المستخدم. تُفتح في متصفّح النظام.
 *   3. زرّ الرجوع الفيزيائي — بلا معالجة يخرج من التطبيق فوراً ولو كان
 *      الدرج مفتوحاً. الترتيب: يغلق الدرج، ثم يرجع في التاريخ، ثم يخرج.
 *   4. شريط الحالة — الصفحة تمتدّ تحته، فيقتطع من رأسها ما لم تُحجز
 *      مساحته.
 *
 * كل ما دون ذلك يعمل كما هو: التخزين المحلي، والشبكة، وحقل رفع الملفات.
 */
(function (W) {
  'use strict';
  const Cap = W.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) return;

  const P = Cap.Plugins || {};
  const { Filesystem, Share, App, StatusBar } = P;

  /* ---------- 1. الحفظ ---------- */
  const b64 = blob => new Promise((res, rej) => {
    const r = new FileReader();
    // النتيجة data:...;base64,xxxx — نأخذ ما بعد الفاصلة وحدها
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(r.error || new Error('تعذّرت قراءة الملف'));
    r.readAsDataURL(blob);
  });

  W.FBXSave = async function (blob, filename) {
    if (!Filesystem) return;
    try {
      const data = await b64(blob);
      // Cache لا Documents: لا يحتاج إذن تخزين على أي إصدار أندرويد،
      // وورقة المشاركة تنقل الملف حيث يريد المستخدم.
      const w = await Filesystem.writeFile({ path: filename, data, directory: 'CACHE' });
      if (Share && Share.share) {
        await Share.share({ title: filename, url: w.uri, dialogTitle: 'حفظ أو مشاركة الملف' });
      } else if (W.FBXCommon) {
        W.FBXCommon.showToast('حُفظ الملف: ' + filename);
      }
    } catch (e) {
      // الإلغاء من ورقة المشاركة ليس خطأً — لا نزعج المستخدم برسالة
      if (/cancel/i.test(e && e.message || '')) return;
      if (W.FBXCommon) W.FBXCommon.showToast('تعذّر حفظ الملف: ' + (e && e.message || 'سبب غير معروف'));
    }
  };

  /* ---------- 2. الروابط الخارجية ---------- */
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (!/^https?:/i.test(href)) return;      // الروابط الداخلية تبقى داخل الغلاف
    e.preventDefault();
    if (P.Browser && P.Browser.open) P.Browser.open({ url: href });
    else W.open(href, '_system');
  }, true);

  /* ---------- 3. زرّ الرجوع ---------- */
  if (App && App.addListener) {
    App.addListener('backButton', ({ canGoBack }) => {
      const root = document.documentElement;
      if (root.hasAttribute('data-nav-open')) {           // الدرج مفتوح
        const close = document.getElementById('navClose') || document.getElementById('navScrim');
        if (close) close.click();
        return;
      }
      const lb = document.querySelector('.fbx-lb, .fx-scrim, .fbxp-overlay');  // عارض أو نافذة
      if (lb) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return; }
      if (canGoBack) W.history.back(); else App.exitApp();
    });
  }

  /* ---------- 4. شريط الحالة ---------- */
  if (StatusBar && StatusBar.setStyle) {
    const sync = () => {
      const dark = document.documentElement.dataset.theme === 'dark';
      // Style.Dark تعني «خلفية داكنة ⇒ أيقونات فاتحة»
      StatusBar.setStyle({ style: dark ? 'DARK' : 'LIGHT' }).catch(() => {});
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--card').trim();
      if (StatusBar.setBackgroundColor && /^#[0-9a-f]{6}$/i.test(bg)) {
        StatusBar.setBackgroundColor({ color: bg }).catch(() => {});
      }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
    else sync();
    new MutationObserver(sync).observe(document.documentElement,
      { attributes: true, attributeFilter: ['data-theme'] });
  }

  if (P.SplashScreen && P.SplashScreen.hide) {
    W.addEventListener('load', () => P.SplashScreen.hide().catch(() => {}));
  }

  document.documentElement.setAttribute('data-native', 'android');
})(window);
