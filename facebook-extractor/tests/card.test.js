'use strict';

/*
 * اختبارات وحدة العرض — card.js
 * ------------------------------------------------------------------
 * هذه الوحدة تبني HTML من بيانات المستخدم مباشرة، فموضع الخطأ الحقيقي فيها
 * ثلاثة: (1) الهروب من الوسوم — نصّ منشور فيه <script> يجب ألا يصير شيفرة،
 * (2) اختيار الشكل الصحيح بحسب البيانات — غلاف مع وسائط ورأس عادٍ بدونها،
 * (3) الاتساق مع محرك التصنيف — اللون والمقياس يجب أن يعكسا الحكم لا يناقضاه.
 *
 * الرسم الفعلي وربط الأحداث يعتمدان على المتصفح وقد تحقّقنا منهما بمتصفح فعلي؛
 * هنا نختبر بناء الـ HTML وهو منطق خالص.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const win = { document: undefined };
  win.window = win;
  const ctx = vm.createContext(win);
  for (const f of ['analyzer.js', 'media.js', 'card.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
  }
  return win;
}

const W = load();
const C = W.FBXCard;
const A = W.FBXAnalyzer;

const post = (over) => Object.assign({
  author: 'صفحة تجريبية', text: 'نص المنشور', likes: 10, comments: 2, shares: 1,
  date: new Date('2026-08-10T09:00:00Z'), url: 'https://facebook.com/1', mediaList: []
}, over);

/* ============================================================
 * الهروب من الوسوم — أهم اختبار في الملف
 * ============================================================ */
test('نص المنشور يُهرَّب فلا يُحقن كشيفرة', () => {
  const h = C.html(post({ text: '<script>alert(1)</script>' }));
  assert.ok(!h.includes('<script>'), 'وسم script يجب ألا يمرّ حرفياً');
  assert.ok(h.includes('&lt;script&gt;'));
});

test('اسم الحساب والرابط يُهرَّبان أيضاً', () => {
  const h = C.html(post({ author: '"><img src=x onerror=alert(1)>', url: 'https://x.com/"onmouseover="' }));
  assert.ok(!h.includes('<img src=x'), 'الاسم يجب ألا ينتج وسماً');
  assert.ok(!h.includes('"onmouseover="'), 'الرابط يجب ألا يكسر السمة');
});

test('الهروب يشمل صفّ الجدول كما البطاقة', () => {
  const h = C.rowHtml(post({ text: '<b>x</b>', author: '<i>y</i>' }));
  assert.ok(!h.includes('<b>x</b>'));
  assert.ok(!h.includes('<i>y</i>'));
});

/* ============================================================
 * الشكل يتبع البيانات
 * ============================================================ */
test('المنشور ذو الوسائط يأخذ غلافاً، وبدونها رأساً عادياً', () => {
  const withMedia = C.html(post({ mediaList: [{ type: 'image', src: 'a.jpg' }] }));
  assert.ok(withMedia.includes('fx-cover'), 'وجود صورة يعني غلافاً');
  assert.ok(!withMedia.includes('fx-plainhead'));

  const noMedia = C.html(post());
  assert.ok(noMedia.includes('fx-plainhead'), 'بلا صورة: رأس عادي');
  assert.ok(!noMedia.includes('fx-cover'));
});

test('المنشور بلا رابط لا يعرض زرّ فتح المنشور', () => {
  assert.ok(!C.html(post({ url: '' })).includes('fx-open'));
  assert.ok(C.html(post()).includes('fx-open'));
});

test('المؤشرات الصفرية تُحذف بدل عرض أصفار بلا معنى', () => {
  const h = C.html(post({ likes: 0, comments: 0, shares: 0, views: 0 }));
  assert.ok(!h.includes('fx-metrics'), 'لا تفاعل إطلاقاً ⇒ لا شريط مؤشرات');
  const h2 = C.html(post({ likes: 5, comments: 0, shares: 0, views: 0 }));
  assert.strictEqual((h2.match(/fx-metric"/g) || []).length, 1, 'المؤشر الوحيد غير الصفري فقط');
});

test('النص الفارغ يعرض عبارة بديلة قابلة للتخصيص', () => {
  assert.ok(C.html(post({ text: '' })).includes('منشور بدون نص'));
  assert.ok(C.html(post({ text: '' }), { emptyLabel: 'تغريدة بدون نص' }).includes('تغريدة بدون نص'));
});

test('معرّف X يظهر عند وجوده فقط', () => {
  assert.ok(C.html(post({ screenName: 'bbcarabic' })).includes('@bbcarabic'));
  assert.ok(!C.html(post()).includes('fx-handle'));
});

test('وسم إعادة النشر يظهر للتغريدات المعادة فقط', () => {
  assert.ok(C.html(post({ isRetweet: true, retweetedFrom: 'someone' })).includes('إعادة نشر من @someone'));
  assert.ok(!C.html(post()).includes('fx-rt'));
});

test('عدد الوسائط يظهر في صف الجدول عند تعددها', () => {
  const one = C.rowHtml(post({ mediaList: [{ type: 'image', src: 'a.jpg' }] }));
  assert.ok(!one.includes('fx-row-n'), 'وسيط واحد لا يحتاج عدّاداً');
  const many = C.rowHtml(post({ mediaList: [1, 2, 3].map(i => ({ type: 'image', src: i + '.jpg' })) }));
  assert.ok(many.includes('>3</i>'));
});

/* ============================================================
 * الاتساق مع محرك التصنيف
 * ============================================================ */
test('لون البطاقة يعكس التصنيف والمستوى معاً', () => {
  assert.strictEqual(C._accent({ classification: 'NEGATIVE', level: 'HIGH' }), 'var(--danger)');
  assert.strictEqual(C._accent({ classification: 'NEGATIVE', level: 'MEDIUM' }), 'var(--warn)');
  assert.strictEqual(C._accent({ classification: 'POSITIVE', level: 'HIGH' }), 'var(--success)');
  assert.strictEqual(C._accent({ classification: 'NEUTRAL', level: 'LOW' }), 'var(--text-2)');
  assert.strictEqual(C._accent(null), 'var(--border)');
});

test('مقياس الخطورة يمتلئ بمقدار المستوى', () => {
  const on = h => (h.match(/class="on"/g) || []).length;
  assert.strictEqual(on(C._meter({ level: 'HIGH', levelLabel: 'عالي' })), 3);
  assert.strictEqual(on(C._meter({ level: 'MEDIUM', levelLabel: 'متوسط' })), 2);
  assert.strictEqual(on(C._meter({ level: 'LOW', levelLabel: 'منخفض' })), 1);
  assert.strictEqual(on(C._meter(null)), 0);
});

test('الإجراء غير «الإبقاء» يُعرض كتنبيه، والإبقاء لا يُعرض', () => {
  const p1 = post({ text: 'اذبحوهم جميعا واقتلوهم فهم جرذان' });
  p1.analysis = A.analyze(p1);
  assert.strictEqual(p1.analysis.action, 'DELETE', 'الفرضية: المحرك يوصي بالحذف');
  assert.ok(C.html(p1).includes('fx-vd-act'), 'الحذف يجب أن يظهر كتنبيه على البطاقة');

  const p2 = post({ text: 'صباح الخير جميعاً' });
  p2.analysis = A.analyze(p2);
  assert.strictEqual(p2.analysis.action, 'KEEP');
  assert.ok(!C.html(p2).includes('fx-vd-act'), 'الإبقاء لا يحتاج تنبيهاً');
});

test('البطاقة بلا تحليل لا تعرض حكماً ولا زرّ تحليل', () => {
  const h = C.html(post());
  assert.ok(!h.includes('fx-verdict'));
  assert.ok(!h.includes('fx-analysis'));
  assert.ok(!h.includes('fx-panel'));
});

/* ============================================================
 * التاريخ والأرقام
 * ============================================================ */
test('التاريخ يُقرأ من date أو ts أو seenAt', () => {
  const d = new Date('2026-08-10T09:00:00Z');
  const expected = C._dateText({ date: d });
  assert.notStrictEqual(expected, 'تاريخ غير معروف');
  assert.strictEqual(C._dateText({ ts: d.getTime() }), expected, 'ts يعطي نفس النتيجة');
  assert.strictEqual(C._dateText({ seenAt: d.getTime() }), expected, 'seenAt احتياطي');
});

test('التاريخ الناقص أو التالف لا يُسقط البطاقة', () => {
  assert.strictEqual(C._dateText({}), 'تاريخ غير معروف');
  assert.strictEqual(C._dateText({ date: new Date('غير صالح') }), 'تاريخ غير معروف');
});

test('الأرقام الكبيرة تُختصر بلا فقد للدلالة', () => {
  assert.strictEqual(C._fmtNum(0), '0');
  assert.strictEqual(C._fmtNum(999), '999');
  assert.strictEqual(C._fmtNum(1200), '1.2K');
  assert.strictEqual(C._fmtNum(15000), '15K');
  assert.strictEqual(C._fmtNum(1500000), '1.5M');
  assert.strictEqual(C._fmtNum(null), '0', 'القيمة الغائبة صفر لا NaN');
});

/* ============================================================
 * الأيقونات — رسوم لا إيموجي
 * ============================================================ */
test('البطاقة تخلو من الإيموجي وتستخدم رسوم SVG', () => {
  const p = post({ mediaList: [{ type: 'image', src: 'a.jpg' }], views: 900 });
  p.analysis = A.analyze(p);
  const h = C.html(p) + C.rowHtml(p);
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(h), 'لا إيموجي في قوالب العرض');
  assert.ok(h.includes('<svg'), 'الأيقونات رسوم SVG');
});

test('اسم أيقونة غير معروف لا يكسر البناء', () => {
  const h = C.icon('لا-يوجد');
  assert.ok(h.startsWith('<svg') && h.endsWith('</svg>'));
});
