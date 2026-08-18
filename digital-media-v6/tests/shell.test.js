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
 * ثبات الشرط الأساسي: صفر طلبات خارجية
 * ============================================================
 * الموقع يُفتح من القرص (file://) وقد يُستعمل بلا إنترنت. أيّ خطّ بعيد أو
 * مكتبة من CDN يحوّل صفحة تعمل إلى صفحة معطوبة نصفها. هذا الاختبار يمنع
 * تسرّب مرجع خارجي مع أيّ تعديل لاحق. */
for (const page of PAGES) {
  test(`${page}: لا مرجع خارجي في وسوم التحميل`, () => {
    const html = read(page);
    const tags = html.match(/<(?:script|link|img|iframe)\b[^>]*>/gi) || [];
    for (const t of tags) {
      const m = t.match(/\b(?:src|href)\s*=\s*"([^"]*)"/i);
      if (!m) continue;
      assert.ok(!/^(https?:)?\/\//i.test(m[1]), `${page}: مرجع خارجي ← ${m[1]}`);
    }
    assert.ok(!/@import\s+url\(\s*["']?https?:/i.test(html), 'لا @import خارجي');
  });
}

test('ورقة الأنماط لا تجلب خطاً أو صورة من الشبكة', () => {
  assert.ok(!/@import/i.test(theme), 'بلا @import');
  assert.ok(!/url\(\s*["']?https?:/i.test(theme), 'بلا url() خارجي');
  assert.ok(!/fonts\.googleapis|fonts\.gstatic/i.test(theme), 'بلا خطوط Google');
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

/* ============================================================
 * أطروحة الإصدار السادس: اللون كلّه للحكم
 * ============================================================
 * الإرشاد الأعلى شدّةً في قاعدة المهارة هو «لا تنقل معلومة باللون
 * وحده». الأداة كلّها فرزُ أحكام، فهذا ليس تفصيلاً فيها بل صلبها.
 * الاختبارات التالية تثبّت أن الحكم يصل بثلاث طرق مستقلّة، وأن
 * الإطار حول الحكم يبقى بلا لون حتى لا ينازعه على الانتباه. */
const card = read('card.js');

test('الحكم يصل بنصّ صريح لا بلون وحده', () => {
  // الشارة تحمل نصّ التصنيف من المحرّك، لا صنفاً لونياً فقط
  assert.match(card, /class="fx-vd fx-vd-\$\{a\.classification\.toLowerCase\(\)\}"\>\$\{esc\(a\.classificationLabel\)/,
    'شارة الحكم تطبع نصّ التصنيف');
  // والإجراء غير «الإبقاء» يصحبه رسم تحذير لا لون خلفية فقط
  assert.match(card, /fx-vd-act">\$\{icon\('warning'/, 'تنبيه الإجراء يحمل رسماً');
});

test('مقياس الخطورة شكل يُقرأ بلا لون', () => {
  // ثلاث شُرَط تمتلئ بقدر المستوى: الامتلاء معلومة هندسية لا لونية
  assert.match(card, /\[1, 2, 3\]\.map\(i => `<i class="\$\{i <= filled \? 'on' : ''\}"/);
  assert.match(card, /\.fx-meter i\s*\{[^}]*background: var\(--(?:rule|glass-brd)\)/, 'الشُرَط الفارغة محايدة');
});

test('البطاقة تحمل قضيب حكم على الحافة الابتدائية', () => {
  // الخاصية منطقية لا فيزيائية، فينقلب القضيب مع RTL بلا قاعدة ثانية
  assert.match(card, /\.fx-card::after\s*\{[^}]*inset-inline-start: 0;[^}]*background: var\(--acc/s,
    'قضيب البطاقة على الحافة الابتدائية');
  assert.match(card, /\.fx-row\s*\{[^}]*border-inline-start: 4px solid var\(--acc/s,
    'وصفّ الجدول كذلك');
});

test('ألوان الدلالة لا تُستعمل في الإطار', () => {
  // نفحص قواعد القشرة وحدها: ما يخصّ الحكم مسموح له اللون، وما عداه لا
  const chrome = ['.side-nav a.active', '.btn-primary', '.pill.active', '.panel-title .num',
                  '.hero-cta', '.view-toggle button.active'];
  for (const sel of chrome) {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // المحدِّد قد يرد وحده أو ضمن مجموعة مفصولة بفواصل
    const m = theme.match(new RegExp('(?:^|,)\\s*' + esc + '\\s*(?:,[^{]*)?\\{([^}]*)\\}', 'm'));
    assert.ok(m, `${sel} معرَّف`);
    assert.ok(!/--keep|--review|--remove|--success|--warn|--danger/.test(m[1]),
      `${sel} يجب أن يخلو من ألوان الدلالة — هي ملك الحكم وحده`);
  }
});

/* ============================================================
 * قائمة التسليم التي تنصّ عليها المهارة
 * ============================================================ */
test('هدف اللمس 44×44 متوفّر دون تضخيم الشكل', () => {
  assert.match(theme, /\.btn::after\s*\{[^}]*height: 44px[^}]*min-width: 44px/s,
    'الزرّ يمدّ منطقة لمس شفافة بدل أن يكبر');
  assert.match(card, /\.fx-btn::after[^}]*width: 44px; height: 44px/s);
});

test('حلقة التركيز 3px كما تشترط فئة الوصول', () => {
  assert.match(theme, /:focus-visible\s*\{\s*outline: 3px solid var\(--focus\)/);
});

test('أرضية مقاس الخطّ 12px لا تُخترق', () => {
  const sizes = [...theme.matchAll(/--fs-[a-z0-9]+:\s*(\d+)px/g)].map(m => +m[1]);
  assert.ok(sizes.length >= 5, 'مقياس الخطّ معرَّف بالبكسل');
  assert.ok(Math.min(...sizes) >= 12, `أصغر مقاس ${Math.min(...sizes)}px — الحدّ 12px`);
});

test('الأسطح الزجاجية تعلن التمويه وبادئته معاً', () => {
  // بلا البادئة يسقط الأثر على Safari وWebKit فيصير السطح شفافاً بلا تمويه —
  // أي نصّ فوق ما تحته مباشرةً، وهو أسوأ من غياب الزجاج أصلاً.
  const all = [...theme.matchAll(/(-webkit-)?backdrop-filter:\s*blur/g)];
  const plain = all.filter(m => !m[1]).length;
  const pref  = all.filter(m => m[1]).length;
  assert.ok(plain >= 2, 'التمويه مستعمل فعلاً');
  assert.strictEqual(pref, plain, `${plain} قاعدة تمويه مقابل ${pref} بادئة — يجب أن تتساويا`);
});

test('ألوان الحكم أشبع من خضرة الإطار — والتشبّع نفسه معنى', () => {
  /* الأطروحة: في واجهة كلّها خضرة لا يكفي أن يفارق الحكمُ الإطارَ درجةً،
     فقد يضيع الزمرّدي في الساج. الفارق محمول على التشبّع: الإطار مهدَّأ
     والحكم مشبَع. هذا الاختبار يقيسه عدداً لا ذوقاً. */
  const hex = n => {
    const m = theme.match(new RegExp('--' + n + ':\\s*(#[0-9a-f]{6})', 'i'));
    assert.ok(m, `الرمز --${n} معرَّف بقيمة سداسية`);
    return m[1];
  };
  const sat = h => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return 0;
    return (mx - mn) / (l > .5 ? (2 - mx - mn) : (mx + mn));
  };
  const chrome = sat(hex('sage'));
  for (const n of ['keep', 'review', 'remove']) {
    const v = sat(hex(n));
    assert.ok(v > chrome + .15,
      `تشبّع --${n} (${v.toFixed(2)}) يجب أن يفوق تشبّع الإطار (${chrome.toFixed(2)}) بفارق واضح`);
  }
});

test('المظهر الفاتح يعيد تعريف كل رمز أرضية وحبر ودلالة', () => {
  // نمط Glassmorphism مصنَّف risk:conditional في القاعدة: لونٌ معرَّف في
  // مظهر واحد فقط ينتج نصّ مظهر فوق أرضية المظهر الآخر — وهو العطل الكلاسيكي.
  const light = theme.slice(theme.indexOf('[data-theme="light"]'));
  for (const n of ['bg', 'surface', 'text', 'text-2', 'text-3', 'cream',
                   'sage', 'sage-ink', 'keep', 'review', 'remove', 'glass', 'glass-brd', 'focus']) {
    assert.match(light, new RegExp('--' + n + ':'), `--${n} غير معرَّف في المظهر الفاتح`);
  }
});

test('الاستجابة مغطّاة عند المقاسات الأربعة', () => {
  for (const bp of [1024, 768, 375]) {
    assert.match(theme, new RegExp(`@media \\(max-width: ${bp}px\\)`), `نقطة الانكسار ${bp}px`);
  }
  // وشريط التنقّل السفلي على الجوّال لا يتجاوز خمسة بنود (حدّ الإرشاد)
  const links = (read('index.html').match(/<a href="[^"]*\.html"[^>]*>\s*<span class="ico"/g) || []).length;
  assert.ok(links <= 5, `بنود التنقّل ${links} — الحدّ خمسة`);
});

test('روابط التنقّل تحمل أسماء مستقلّة تصمد عند طيّ السكّة', () => {
  // «فيسبوك» تتكرّر مرّتين — استخراجاً ورصداً — وقارئ الشاشة لا يرى عنوان
  // المجموعة فيميّز بينهما، فالسياق يُدمج في الاسم نفسه.
  for (const page of PAGES) {
    const html = read(page);
    const links = html.match(/<a href="[^"]*\.html"[^>]*><span class="ico">/g) || [];
    assert.ok(links.length >= 5, `${page}: روابط التنقّل موجودة`);
    for (const l of links) assert.match(l, /aria-label="[^"]{3,}"/, `${page}: رابط بلا اسم ← ${l}`);
    const names = [...html.matchAll(/<a href="[^"]*\.html" (?:class="active" )?aria-label="([^"]+)"><span class="ico">/g)].map(m => m[1]);
    assert.strictEqual(new Set(names).size, names.length, `${page}: أسماء التنقّل متكرّرة ← ${names}`);
  }
});

test('التسميات المطويّة تُخفى بصرياً لا تُحذف من شجرة الوصول', () => {
  // display:none يمحو النصّ من قارئ الشاشة أيضاً، فتصير السكّة روابط بلا اسم
  const m = theme.match(/@media \(max-width: 1024px\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(m, 'نقطة الانكسار 1024px معرَّفة');
  const rule = m[1].match(/\.side-nav a \.label[^{]*\{([^}]*)\}/);
  assert.ok(rule, 'قاعدة التسمية المطويّة موجودة');
  assert.ok(!/display:\s*none/.test(rule[1]), 'الإخفاء بصريّ لا بـ display:none');
  assert.match(rule[1], /clip-path: inset\(50%\)/, 'يُستعمل الإخفاء البصري القياسي');
});

test('لا لون مثبَّت في سمة style السطرية', () => {
  /* السمة السطرية تغلب ورقة الأنماط، فلونٌ مثبَّت فيها يبقى كما هو في
     المظهرين. زرّ «رصد فوري» كان يحمل نصّاً أبيض من يوم كان الشريط
     داكناً، فاختفى تماماً على المظهر الفاتح. الألوان تأتي من الرموز
     لتتبع المظهر، والسطرية للتخطيط لا للّون. */
  for (const page of PAGES) {
    const html = read(page);
    for (const m of html.matchAll(/style="([^"]*)"/g)) {
      assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(m[1]),
        `${page}: لون مثبَّت في سمة سطرية ← ${m[1]}`);
    }
  }
});
