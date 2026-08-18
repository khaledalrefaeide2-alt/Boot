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
  assert.match(card, /\.fx-meter i\s*\{[^}]*background: var\(--rule\)/, 'الشُرَط الفارغة محايدة');
});

test('البطاقة تحمل قضيب حكم على الحافة الابتدائية', () => {
  assert.match(card, /\.fx-card\s*\{[^}]*border-inline-start: 3px solid var\(--acc/,
    'القضيب منطقي الاتجاه فينقلب مع RTL بلا قاعدة ثانية');
});

test('ألوان الدلالة لا تُستعمل في الإطار', () => {
  // نفحص قواعد القشرة وحدها: ما يخصّ الحكم مسموح له اللون، وما عداه لا
  const chrome = ['.side-nav a.active', '.btn-primary', '.pill.active', '.panel-title .num',
                  '.hero-cta', '.view-toggle button.active'];
  for (const sel of chrome) {
    const m = theme.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
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

test('التصميم يخلو من مفردات الإصدار الخامس البصرية', () => {
  // السجلّ لا يتدرّج ولا يزجّج ولا يميل. هذه ليست ذوقاً بل تعريف الهوية.
  assert.ok(!/linear-gradient|radial-gradient/.test(theme), 'بلا تدرّجات لونية');
  assert.ok(!/backdrop-filter:\s*(?!none)/.test(theme), 'بلا زجاج مموّه');
  assert.ok(!/rotateX|rotateY|translate3d|perspective:\s*\d/.test(theme + card), 'بلا ميل ثلاثي الأبعاد');
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
  // display:none يمحو النصّ من قارئ الشاشة أيضاً، فتصير السكّة المطويّة
  // روابط بلا اسم. القاعدة تُخرج النصّ من الرسم وتُبقيه للقارئ الصوتي.
  const rule = theme.match(/:root\[data-nav="collapsed"\] \.side-nav a \.label,[\s\S]*?\{([^}]*)\}/);
  assert.ok(rule, 'قاعدة التسمية المطويّة موجودة');
  assert.ok(!/display:\s*none/.test(rule[1]), 'الإخفاء بصريّ لا بـ display:none');
  assert.match(rule[1], /clip-path: inset\(50%\)/, 'يُستعمل الإخفاء البصري القياسي');
});

test('القائمة تُطوى وتنزلق، وكلاهما قابل للتشغيل بلوحة المفاتيح', () => {
  const common = read('common.js');
  for (const page of PAGES) {
    const html = read(page);
    assert.match(html, /id="navToggle"[^>]*aria-controls="mainNav"/s, `${page}: الزرّ مربوط بالقائمة`);
    assert.match(html, /id="navToggle"[^>]*aria-expanded=/s, `${page}: الزرّ يعلن حالته`);
    assert.match(html, /<aside class="sidebar" id="mainNav"/, `${page}: القائمة تحمل المعرّف المشار إليه`);
    assert.match(html, /id="navScrim"/, `${page}: الحجاب موجود`);
    assert.match(html, /initNav\(\);/, `${page}: التهيئة مستدعاة`);
    // الحالة المطويّة تُقرأ قبل أوّل رسمة وإلا انكمشت السكّة بعد رسمها
    const head = html.slice(0, html.indexOf('</head>'));
    assert.match(head, /fbx_nav_collapsed/, `${page}: الحالة تُقرأ في الرأس`);
  }
  assert.match(common, /e\.key === 'Escape'/, 'Escape يغلق الدرج');
  assert.match(common, /scrim\.onclick/, 'النقر على الحجاب يغلق');
  assert.match(common, /btn\.focus\(\)/, 'التركيز يعود إلى الزرّ عند الإغلاق');
  assert.match(common, /setAttribute\('inert'/, 'بقية الصفحة تصير inert فلا يتسلّل التبويب خلف الحجاب');
  assert.match(common, /removeAttribute\('inert'/, 'وتعود عند الإغلاق');
});

test('انزلاق الدرج بـ transform لا بخصائص تُعيد التخطيط', () => {
  // تحريك inset أو width يُعيد تخطيط الصفحة كل إطار؛ transform يجري على
  // بطاقة الرسم وحدها.
  const rule = theme.match(/@media \(max-width: 1024px\)[\s\S]*?\.sidebar\s*\{([^}]*)\}/);
  assert.ok(rule, 'قاعدة الدرج موجودة');
  assert.match(rule[1], /transform: translateX/, 'الانزلاق بـ transform');
  assert.match(rule[1], /transition: transform/, 'والانتقال على transform وحده');
});

test('لا لون مثبَّت في سمة style السطرية', () => {
  /* السمة السطرية تغلب ورقة الأنماط، فلونٌ مثبَّت فيها يبقى كما هو مهما
     تغيّر المظهر أو الهوية. زرّ «رصد فوري» كان يحمل نصّاً أبيض من يوم كان
     شريط الرصد كحلياً في الإصدار الخامس؛ ولمّا صار الشريط ورقاً فاتحاً
     اختفى الزرّ تماماً — أبيضُ على أبيض. الألوان تأتي من الرموز لتتبع
     السياق، والسمة السطرية للتخطيط لا للّون. */
  for (const page of PAGES) {
    const html = read(page);
    for (const m of html.matchAll(/style="([^"]*)"/g)) {
      assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(m[1]),
        `${page}: لون مثبَّت في سمة سطرية ← ${m[1]}`);
    }
  }
});
