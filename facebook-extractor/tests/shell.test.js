'use strict';

/*
 * اختبارات قشرة الصفحة — ما يجب أن يكون صحيحاً قبل أوّل رسمة
 * ------------------------------------------------------------------
 * كل تأكيد هنا وُلد من عطل مقيس لا من قاعدة نظرية:
 *
 * (1) مقاس الأيقونة. كان محجوزاً في الـ SVG نفسه (width: 1.15em)، فنقلناه إلى
 *     الغلاف وجعلنا الرسم 100% — فانفجر كل استعمال بلا غلاف إلى 300px
 *     الافتراضية: زرّ «بدء الرصد» صار 318px وشريط التحكم 380px. الصواب أن
 *     يحمل الطرفان مقاساً: الغلاف يحجز المكان، والرسم يكفي نفسه بلا غلاف.
 *
 * (2) موطن القاعدة. الأيقونات تُحقن بـ JS من نهاية الصفحة؛ فلو كان مقاسها
 *     معرَّفاً في ذلك الـ JS لبدأت بعرض صفر ثم قفزت — قِيست CLS = 0.0219.
 *     theme.css يحجب الرسم، فالتعريف فيه يحجز المكان منذ اللحظة الأولى.
 *
 * (3) حالة المفتاح والمظهر. كانتا تُقرآن بعد التحميل، فيظهر تنبيه «اضبط
 *     مفتاحك» متأخراً ويدفع ما تحته 135px. صارتا تُقرآن في <head> قبل الرسم.
 *
 * القياس النهائي بعد هذه الإصلاحات: CLS = 0 على الصفحات الخمس، في المظهرين،
 * وبمفتاح محفوظ وبدونه.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const PAGES = ['index.html', 'twitter.html', 'dashboard.html', 'twitter-dashboard.html', 'settings.html'];
const theme = read('theme.css');
const icons = read('icons.js');

/* ============================================================
 * مقاس الأيقونة — الطرفان يحملان مقاساً
 * ============================================================ */
test('الرسم يكفي نفسه: .ic-svg له مقاس em لا 100% فقط', () => {
  // 100% وحدها تعني «مقاس الأب»، وبلا أب مقيس يرجع المتصفح إلى 300px
  const rule = theme.match(/^\.ic-svg\s*\{([^}]*)\}/m);
  assert.ok(rule, '.ic-svg يجب أن يكون معرَّفاً في theme.css');
  assert.match(rule[1], /width:\s*[\d.]+em/, 'عرض بوحدة em لا نسبة');
  assert.match(rule[1], /height:\s*[\d.]+em/, 'ارتفاع بوحدة em لا نسبة');
});

test('داخل الغلاف يرث الرسم مقاس الغلاف فيصحّ المقاس الكبير', () => {
  assert.match(theme, /\.ic\s*>\s*\.ic-svg\s*\{[^}]*width:\s*100%/,
    'الرسم داخل .ic يملأ الغلاف حتى يعمل .ic.lg');
});

test('الغلاف يحجز مكانه قبل الحقن', () => {
  const rule = theme.match(/^\.ic\s*\{([^}]*)\}/m);
  assert.ok(rule, '.ic يجب أن يكون معرَّفاً في theme.css');
  assert.match(rule[1], /width:\s*[\d.]+em/, 'بلا عرض معلن يبدأ الغلاف بصفر ثم يقفز');
  assert.match(rule[1], /height:\s*[\d.]+em/);
});

test('نسخة icons.js الاحتياطية لا تتعارض مع theme.css', () => {
  // الملف يبقى صالحاً وحده، لكنه يمتنع عن الحقن متى وجد علامة theme.css
  assert.match(theme, /--fbx-ic\s*:/, 'theme.css يضع العلامة');
  assert.match(icons, /--fbx-ic/, 'icons.js يقرأ العلامة فيمتنع');
  assert.match(icons, /\.ic-svg\s*\{[^}]*width:\s*[\d.]+em/,
    'النسخة الاحتياطية تحمل المقاس الذاتي نفسه');
});

/* ============================================================
 * ما يُقرأ قبل الرسم
 * ============================================================ */
for (const page of PAGES) {
  test(`${page}: المظهر والمفتاح يُقرآن في <head> قبل ورقة الأنماط`, () => {
    const html = read(page);
    const head = html.slice(0, html.indexOf('</head>'));
    const iBoot = head.indexOf('fbx_apify_key');
    const iCss = head.indexOf('href="theme.css"');
    assert.notStrictEqual(iBoot, -1, 'حالة المفتاح تُقرأ في الرأس');
    assert.match(head, /fbx_theme/, 'المظهر يُقرأ في الرأس فلا يومض الفاتح');
    // السكربت قبل الرابط: السكربتات تنتظر أوراق الأنماط المعلَّقة قبلها
    assert.ok(iBoot < iCss, 'سكربت التهيئة يسبق ورقة الأنماط');
    assert.match(head, /data-nokey/, 'النتيجة تُثبَّت على <html>');
  });
}

test('تنبيهات المفتاح تُخفى بقاعدة CSS لا بسمة سطرية', () => {
  // السمة السطرية display:none تغلب CSS، فيعود التبديل إلى JS بعد التحميل
  for (const page of PAGES) {
    const html = read(page);
    for (const id of ['setupPanel', 'keyHint']) {
      const m = html.match(new RegExp(`<[^>]*id="${id}"[^>]*>`));
      if (m) assert.ok(!/style="[^"]*display\s*:\s*none/.test(m[0]),
        `${page}: ${id} لا يجوز أن يُخفى بسمة سطرية`);
    }
  }
  assert.match(theme, /:root\[data-nokey\][^{]*#setupPanel/, 'الإظهار مشروط بالعلامة');
});

test('لا صفحة تعيد إخفاء التنبيه بأمر JS بعد التحميل', () => {
  for (const page of PAGES) {
    const html = read(page);
    assert.ok(!/\$\('(setupPanel|keyHint)'\)\.style\.display/.test(html),
      `${page}: التبديل يجب أن يمرّ عبر data-nokey لا عبر style.display`);
  }
});

/* ============================================================
 * البنية الدلالية — قِيست غائبة في المراجعة نفسها
 * ============================================================ */
for (const page of PAGES) {
  test(`${page}: معالم ARIA ورابط التخطّي وعنوان h1 واحد للصفحة`, () => {
    const html = read(page);
    assert.match(html, /class="skip-link"/, 'رابط تخطٍّ للمحتوى (WCAG 2.4.1)');
    assert.match(html, /<main[^>]*id="main-content"/, 'هدف الرابط موجود');
    assert.match(html, /<aside[^>]*aria-label=/, 'القائمة الجانبية معنونة');
    assert.match(html, /<nav[^>]*aria-label=/, 'التنقّل معنون');
    const h1 = html.match(/<h1[^>]*>/g) || [];
    assert.strictEqual(h1.length, 1, 'عنوان رئيسي واحد لا أكثر');
    // العنوان الرئيسي هو عنوان الصفحة لا اسم الأداة المكرَّر في كل صفحة
    assert.ok(!/<h1[^>]*class="[^"]*brand-name/.test(html),
      'اسم الأداة في الشريط الجانبي ليس عنوان الصفحة');
  });
}
