'use strict';

/*
 * اختبارات دليل الصفحات — pages.js + xlsx-import.js
 * --------------------------------------------------
 * تحليل XML وفك ضغط ZIP يعتمدان على واجهات المتصفح (DOMParser،
 * DecompressionStream) وقد تحقّقنا منهما بملفات Excel حقيقية داخل متصفح فعلي.
 * هنا نختبر المنطق الخالص الذي يقرّر كيف تتحوّل صفوف الجدول إلى صفحات —
 * وهو موضع الخطأ الحقيقي: ملفات المستخدمين تأتي بترتيب أعمدة مختلف،
 * وبرؤوس عربية أو إنجليزية أو بلا رؤوس إطلاقاً.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(file) {
  // سياق الـ vm لا يرث الجلوبالات المدمجة، فنمرّر ما تحتاجه الوحدات فعلاً
  const win = { document: { getElementById: () => null }, TextDecoder, TextEncoder };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ctx, { filename: file });
  return win;
}

const P = load('pages.js').FBXPages;
const X = load('xlsx-import.js').FBXExcelImport;

/* ============================================================
 * مراجع خلايا Excel
 * ============================================================ */
test('colIndex يحوّل مرجع الخلية إلى فهرس عمود صحيح', () => {
  assert.strictEqual(X._colIndex('A1'), 0);
  assert.strictEqual(X._colIndex('B2'), 1);
  assert.strictEqual(X._colIndex('Z9'), 25);
  assert.strictEqual(X._colIndex('AA1'), 26);
  assert.strictEqual(X._colIndex('AB1'), 27);
  assert.strictEqual(X._colIndex('BC12'), 54);
});

/* ============================================================
 * تنظيف الروابط والمعرّفات
 * ============================================================ */
test('cleanUrl يستخرج الرابط ويكمل البروتوكول الناقص', () => {
  assert.strictEqual(P._cleanUrl('https://www.facebook.com/nasa'), 'https://www.facebook.com/nasa');
  assert.strictEqual(P._cleanUrl('www.facebook.com/nasa'), 'https://www.facebook.com/nasa');
  assert.strictEqual(P._cleanUrl('facebook.com/nasa'), 'https://facebook.com/nasa');
  assert.strictEqual(P._cleanUrl('  https://x.com/user  '), 'https://x.com/user');
  assert.strictEqual(P._cleanUrl('الصفحة: https://facebook.com/abc'), 'https://facebook.com/abc');
  assert.strictEqual(P._cleanUrl('لا يوجد رابط'), '');
  assert.strictEqual(P._cleanUrl(''), '');
});

test('cleanUrl يزيل علامات الترقيم الملتصقة بنهاية الرابط', () => {
  assert.strictEqual(P._cleanUrl('(https://facebook.com/abc)'), 'https://facebook.com/abc');
  assert.strictEqual(P._cleanUrl('https://facebook.com/abc.'), 'https://facebook.com/abc');
});

test('parseHandle يستخرج معرّف X من كل الأشكال الشائعة', () => {
  assert.strictEqual(P._parseHandle('https://x.com/ALsahmaLsaudi'), 'ALsahmaLsaudi');
  assert.strictEqual(P._parseHandle('https://twitter.com/bbcarabic'), 'bbcarabic');
  assert.strictEqual(P._parseHandle('@someone'), 'someone');
  assert.strictEqual(P._parseHandle('someone'), 'someone');
  assert.strictEqual(P._parseHandle('https://x.com/@withat'), 'withat');
  assert.strictEqual(P._parseHandle(''), '');
  assert.strictEqual(P._parseHandle('اسم عربي'), '', 'الأسماء غير الصالحة تُرفض');
  assert.strictEqual(P._parseHandle('toolongusernamehere'), '', 'يتجاوز 15 حرفاً');
});

test('detectPlatform يميّز المنصة من الرابط أو من عمود صريح', () => {
  assert.strictEqual(P._detectPlatform('https://facebook.com/x', '', ''), 'facebook');
  assert.strictEqual(P._detectPlatform('https://x.com/user', '', ''), 'twitter');
  assert.strictEqual(P._detectPlatform('https://twitter.com/user', '', ''), 'twitter');
  assert.strictEqual(P._detectPlatform('', '', 'فيسبوك'), 'facebook');
  assert.strictEqual(P._detectPlatform('', '', 'تويتر'), 'twitter');
  assert.strictEqual(P._detectPlatform('', '', 'X'), 'twitter');
  assert.strictEqual(P._detectPlatform('https://example.com/a', '', ''), '');
});

/* ============================================================
 * التعرّف على صف الرؤوس
 * ============================================================ */
test('looksLikeHeader يميّز صف الرؤوس عن صف بيانات', () => {
  assert.strictEqual(P._looksLikeHeader(['اسم الصفحة', 'الرابط', 'التصنيف']), true);
  assert.strictEqual(P._looksLikeHeader(['Name', 'URL', 'Category']), true);
  assert.strictEqual(P._looksLikeHeader(['ناسا', 'https://facebook.com/nasa']), false,
    'الصف الذي يحوي رابطاً هو بيانات لا رؤوس');
  assert.strictEqual(P._looksLikeHeader([]), false);
});

/* ============================================================
 * التحويل الكامل: صفوف → صفحات
 * ============================================================ */
test('ملف برؤوس عربية يُقرأ بالكامل مع التصنيف', () => {
  const rows = [
    ['اسم الصفحة', 'الرابط', 'التصنيف', 'ملاحظات'],
    ['وكالة ناسا', 'https://www.facebook.com/nasa', 'علوم', 'مهم'],
    ['بي بي سي', 'https://www.facebook.com/bbc', 'أخبار', '']
  ];
  const { pages, skipped } = P._rowsToPages(rows);
  assert.strictEqual(pages.length, 2);
  assert.strictEqual(skipped, 0);
  assert.strictEqual(pages[0].name, 'وكالة ناسا');
  assert.strictEqual(pages[0].url, 'https://www.facebook.com/nasa');
  assert.strictEqual(pages[0].category, 'علوم');
  assert.strictEqual(pages[0].notes, 'مهم');
  assert.strictEqual(pages[0].platform, 'facebook');
});

test('ملف برؤوس إنجليزية يُقرأ كذلك', () => {
  const { pages } = P._rowsToPages([
    ['Name', 'URL', 'Category'],
    ['NASA', 'https://facebook.com/nasa', 'Science']
  ]);
  assert.strictEqual(pages.length, 1);
  assert.strictEqual(pages[0].name, 'NASA');
  assert.strictEqual(pages[0].category, 'Science');
});

test('ترتيب الأعمدة المعكوس لا يكسر القراءة', () => {
  const { pages } = P._rowsToPages([
    ['الرابط', 'اسم الصفحة'],
    ['https://facebook.com/nasa', 'ناسا']
  ]);
  assert.strictEqual(pages[0].url, 'https://facebook.com/nasa');
  assert.strictEqual(pages[0].name, 'ناسا');
});

test('ملف بلا صف رؤوس يُستنتج من شكل القيم', () => {
  const { pages } = P._rowsToPages([
    ['https://www.facebook.com/page1', 'صفحة أولى'],
    ['https://www.facebook.com/page2', 'صفحة ثانية']
  ]);
  assert.strictEqual(pages.length, 2, 'الصف الأول بيانات لا رؤوس — يجب ألا يُبتلع');
  assert.strictEqual(pages[0].url, 'https://www.facebook.com/page1');
  assert.strictEqual(pages[0].name, 'صفحة أولى');
});

test('حسابات X تُقرأ بمعرّفاتها', () => {
  const { pages } = P._rowsToPages([
    ['الاسم', 'الرابط'],
    ['السهم السعودي', 'https://x.com/ALsahmaLsaudi']
  ]);
  assert.strictEqual(pages[0].platform, 'twitter');
  assert.strictEqual(pages[0].handle, 'ALsahmaLsaudi');
});

test('الصفوف بلا رابط صالح تُتخطّى وتُحصى', () => {
  const { pages, skipped } = P._rowsToPages([
    ['الاسم', 'الرابط'],
    ['صالحة', 'https://facebook.com/ok'],
    ['بلا رابط', ''],
    ['نص فقط', 'ليس رابطاً']
  ]);
  assert.strictEqual(pages.length, 1);
  assert.strictEqual(skipped, 2);
});

test('التكرار داخل الملف يُزال', () => {
  const { pages, skipped } = P._rowsToPages([
    ['الاسم', 'الرابط'],
    ['أ', 'https://facebook.com/same'],
    ['ب', 'https://facebook.com/same']
  ]);
  assert.strictEqual(pages.length, 1, 'نفس الرابط لا يُضاف مرتين');
  assert.strictEqual(skipped, 1);
});

test('الصفوف الفارغة تماماً تُتجاهل بلا ضجيج', () => {
  const { pages, skipped } = P._rowsToPages([
    ['الاسم', 'الرابط'],
    ['', ''],
    ['أ', 'https://facebook.com/a'],
    ['', '']
  ]);
  assert.strictEqual(pages.length, 1);
  assert.strictEqual(skipped, 0, 'الصفوف الفارغة ليست «متخطّاة» — هي غير موجودة أصلاً');
});

test('الاسم الناقص يُعوَّض بالمعرّف أو الرابط بدل أن يُترك فارغاً', () => {
  const { pages } = P._rowsToPages([
    ['الاسم', 'الرابط'],
    ['', 'https://facebook.com/noname']
  ]);
  assert.strictEqual(pages[0].name, 'https://facebook.com/noname');
});

test('الرابط في عمود غير متوقع يُلتقط من أي مكان في الصف', () => {
  const { pages } = P._rowsToPages([
    ['ملاحظات', 'الاسم', 'شيء آخر'],
    ['لا شيء', 'صفحة', 'https://facebook.com/hidden']
  ]);
  assert.strictEqual(pages.length, 1);
  assert.strictEqual(pages[0].url, 'https://facebook.com/hidden');
});

test('جدول فارغ لا يُسقط المحوّل', () => {
  const a = P._rowsToPages([]);
  assert.strictEqual(a.pages.length, 0);
  const b = P._rowsToPages([['', ''], ['', '']]);
  assert.strictEqual(b.pages.length, 0);
});

test('مفتاح الصفحة يعتمد الرابط، ويقع على المعرّف عند غيابه', () => {
  const withUrl = P._rowsToPages([['الاسم', 'الرابط'], ['أ', 'https://x.com/user1']]).pages[0];
  assert.strictEqual(withUrl.key, 'https://x.com/user1');
  const handleOnly = P._rowsToPages([['الاسم', 'المعرف'], ['ب', '@user2']]).pages[0];
  assert.strictEqual(handleOnly.key, '@user2');
  assert.strictEqual(handleOnly.handle, 'user2');
});

/* ============================================================
 * حجم واقعي — 200 صفحة كما في حالة الاستخدام الفعلية
 * ============================================================ */
test('ملف بمئتي صفحة يُقرأ كاملاً دون فقد', () => {
  const rows = [['اسم الصفحة', 'الرابط', 'التصنيف']];
  for (let i = 1; i <= 200; i++) {
    rows.push([`صفحة ${i}`, `https://www.facebook.com/page${i}`, i % 2 ? 'أخبار' : 'رياضة']);
  }
  const { pages, skipped } = P._rowsToPages(rows);
  assert.strictEqual(pages.length, 200);
  assert.strictEqual(skipped, 0);
  assert.strictEqual(new Set(pages.map(p => p.key)).size, 200, 'كل المفاتيح فريدة');
  assert.ok(pages.every(p => p.platform === 'facebook'));
});
