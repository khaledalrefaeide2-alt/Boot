'use strict';

/*
 * اختبارات الدوال المشتركة — common.js
 * -------------------------------------
 * common.js مكتوب للمتصفح (يعتمد على window وdocument وlocalStorage)، لذا نُهيّئ
 * له بيئة صغيرة مزيّفة قبل تحميله، فتُختبر منطقيات البيانات الخالصة دون متصفح.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { FBXAnalyzer } = require('../analyzer.js');

/* بيئة متصفح مصغّرة تكفي لتحميل common.js */
function loadCommon() {
  const store = new Map();
  const win = {
    FBXAnalyzer,
    FBXMedia: { extract: () => [] },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v))
    },
    matchMedia: () => ({ matches: false }),
    document: { getElementById: () => null, documentElement: { dataset: {} } },
    setTimeout, clearTimeout, fetch: async () => ({ json: async () => ({ ok: false }) }),
    AbortSignal: { timeout: () => null },
    Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL: () => {} }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'common.js'), 'utf8'), ctx, { filename: 'common.js' });
  return win.FBXCommon;
}

const C = loadCommon();

/* ============================================================
 * num — تحويل أرقام التفاعل القادمة بصيغ مختلفة
 * ============================================================ */
test('num يفهم الأعداد المختصرة بدل أن يشوّهها', () => {
  // كان التجريد الساذج يحوّل "12.7K" إلى 127
  assert.strictEqual(C.num('12.7K'), 12700);
  assert.strictEqual(C.num('1.2M'), 1200000);
  assert.strictEqual(C.num('3k'), 3000);
  assert.strictEqual(C.num('2B'), 2000000000);
  assert.strictEqual(C.num('1.5 مليون'), 1500000);
  assert.strictEqual(C.num('4 الف'), 4000);
});

test('num يتعامل مع الفواصل والأرقام العربية والمسافات', () => {
  assert.strictEqual(C.num('1,234'), 1234);
  assert.strictEqual(C.num('١٢٣'), 123);
  assert.strictEqual(C.num('  42  '), 42);
});

test('num يمرّر الأعداد كما هي ويردّ صفراً لغير الصالح', () => {
  assert.strictEqual(C.num(99), 99);
  assert.strictEqual(C.num(0), 0);
  assert.strictEqual(C.num(''), 0);
  assert.strictEqual(C.num('لا يوجد'), 0);
  assert.strictEqual(C.num(null), 0);
  assert.strictEqual(C.num(undefined), 0);
  assert.strictEqual(C.num(NaN), 0);
  assert.strictEqual(C.num(Infinity), 0);
});

/* ============================================================
 * fmtNum — العرض المختصر
 * ============================================================ */
test('fmtNum يختصر الأعداد الكبيرة بشكل مقروء', () => {
  assert.strictEqual(C.fmtNum(999), '999');
  assert.strictEqual(C.fmtNum(1000), '1K');
  assert.strictEqual(C.fmtNum(12700), '12.7K');
  assert.strictEqual(C.fmtNum(1500000), '1.5M');
  assert.strictEqual(C.fmtNum(0), '0');
});

test('fmtNum و num متعاكستان في الحالات الشائعة', () => {
  for (const v of [0, 42, 1000, 12700, 1500000]) {
    assert.strictEqual(C.num(C.fmtNum(v)), v, `فشل التطابق عند ${v}`);
  }
});

/* ============================================================
 * escapeHtml — الحماية من حقن HTML
 * ============================================================ */
test('escapeHtml يُبطل وسوم HTML الخطرة', () => {
  assert.strictEqual(C.escapeHtml('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.strictEqual(C.escapeHtml(`" onerror='x'`), '&quot; onerror=&#39;x&#39;');
  assert.strictEqual(C.escapeHtml('a & b'), 'a &amp; b');
  assert.strictEqual(C.escapeHtml(null), '');
  assert.strictEqual(C.escapeHtml(undefined), '');
});

test('النص العربي يمرّ دون تشويه', () => {
  assert.strictEqual(C.escapeHtml('مرحباً بالعالم'), 'مرحباً بالعالم');
});

/* ============================================================
 * sevAccent — لون البطاقة يعكس الحكم
 * ============================================================ */
test('sevAccent يعطي لوناً مميزاً لكل مستوى', () => {
  assert.strictEqual(C.sevAccent({ classification: 'NEGATIVE', level: 'HIGH' }), 'var(--danger)');
  assert.strictEqual(C.sevAccent({ classification: 'NEGATIVE', level: 'MEDIUM' }), 'var(--gold-deep)');
  assert.strictEqual(C.sevAccent({ classification: 'POSITIVE', level: 'HIGH' }), 'var(--success)');
  assert.strictEqual(C.sevAccent({ classification: 'NEUTRAL', level: 'LOW' }), 'var(--text-2)');
  assert.strictEqual(C.sevAccent(null), 'var(--border)');
});

/* ============================================================
 * validDate
 * ============================================================ */
test('validDate يميّز التواريخ الصالحة', () => {
  assert.strictEqual(C.validDate('2026-01-01'), true);
  assert.strictEqual(C.validDate('not-a-date'), false);
  assert.strictEqual(C.validDate(''), false);
  assert.strictEqual(C.validDate(null), false);
});

/* ============================================================
 * postKey — مفتاح منع التكرار
 * ============================================================ */
test('postKey يعتمد الرابط أولاً ثم بديلاً مستقراً', () => {
  assert.strictEqual(C.postKey({ url: 'https://x.com/1' }), 'https://x.com/1');
  assert.strictEqual(C.postKey({ key: 'K1', url: 'https://x.com/1' }), 'K1');
  const noUrl = { author: 'أحمد', ts: 123, text: 'نص المنشور' };
  assert.strictEqual(C.postKey(noUrl), C.postKey({ ...noUrl }), 'نفس المنشور يعطي نفس المفتاح دائماً');
  assert.notStrictEqual(C.postKey({ author: 'أ', ts: 1, text: 'x' }),
                        C.postKey({ author: 'ب', ts: 1, text: 'x' }));
});

/* ============================================================
 * csvCell — سلامة ملفات CSV
 * ============================================================ */
test('csvCell يقتبس الحقول التي تحوي فواصل أو أسطراً أو علامات اقتباس', () => {
  assert.strictEqual(C.csvCell('عادي'), 'عادي');
  assert.strictEqual(C.csvCell('فيه, فاصلة'), '"فيه, فاصلة"');
  assert.strictEqual(C.csvCell('سطر\nجديد'), '"سطر\nجديد"');
  assert.strictEqual(C.csvCell('قال "مرحبا"'), '"قال ""مرحبا"""');
  assert.strictEqual(C.csvCell(null), '');
});

/* ============================================================
 * normalizePost — توحيد المنشور الخام
 * ============================================================ */
test('normalizePost يوحّد أسماء الحقول المختلفة بين أدوات الاستخراج', () => {
  const p = C.normalizePost({
    message: 'نص المنشور', postUrl: 'https://facebook.com/p/1',
    pageName: 'صفحة', likesCount: '12.7K', commentsCount: 8, sharesCount: 3,
    publishedTime: '2026-01-05T10:00:00Z'
  }, 'facebook');
  assert.strictEqual(p.text, 'نص المنشور');
  assert.strictEqual(p.url, 'https://facebook.com/p/1');
  assert.strictEqual(p.author, 'صفحة');
  assert.strictEqual(p.likes, 12700, 'الأعداد المختصرة يجب أن تُقرأ بشكل صحيح');
  assert.strictEqual(p.comments, 8);
  assert.strictEqual(p.platform, 'facebook');
  // `instanceof Date` لا يصلح هنا: الكائن يُنشأ داخل realm الـ vm فيختلف مُنشئه عن الخارجي
  assert.strictEqual(Object.prototype.toString.call(p.date), '[object Date]');
  assert.strictEqual(p.date.getTime(), Date.parse('2026-01-05T10:00:00Z'));
  assert.ok(p.analysis, 'يجب إرفاق التحليل تلقائياً');
});

test('normalizePost يقرأ حقول منصة X كذلك', () => {
  const p = C.normalizePost({
    full_text: 'تغريدة', twitterUrl: 'https://x.com/u/status/1',
    author: { name: 'حساب X' }, favorite_count: 5, retweet_count: 2, reply_count: 1
  }, 'twitter');
  assert.strictEqual(p.text, 'تغريدة');
  assert.strictEqual(p.author, 'حساب X');
  assert.strictEqual(p.likes, 5);
  assert.strictEqual(p.shares, 2);
  assert.strictEqual(p.comments, 1);
  assert.strictEqual(p.platform, 'twitter');
});

test('normalizePost يحوّل الطوابع الزمنية بالثواني وبالمللي ثانية', () => {
  const sec = C.normalizePost({ text: 'a', time: 1767600000 }, 'facebook');
  const ms  = C.normalizePost({ text: 'a', time: 1767600000000 }, 'facebook');
  assert.strictEqual(sec.ts, 1767600000000, 'الثواني تُضرب في ألف');
  assert.strictEqual(ms.ts, 1767600000000, 'المللي ثانية تبقى كما هي');
});

test('normalizePost لا ينهار على عنصر شبه فارغ', () => {
  const p = C.normalizePost({}, 'facebook');
  assert.strictEqual(p.text, '');
  assert.strictEqual(p.ts, null);
  assert.strictEqual(p.date, null);
  assert.strictEqual(p.likes, 0);
  assert.ok(p.analysis);
});
