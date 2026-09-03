'use strict';

/*
 * اختبارات مولّد التقرير — report.js
 * -----------------------------------
 * يُبنى المستند كنص HTML خالص، فيمكن اختباره دون متصفح.
 * التركيز على: الحالات الحدّية التي تكسر المولّدات عادةً (عيّنة فارغة،
 * بلا حالات حرجة، بلا تواريخ)، وعلى الحماية من حقن HTML عبر نص المنشور.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { FBXAnalyzer } = require('../analyzer.js');

function loadReport() {
  const win = { FBXAnalyzer, open: () => null };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'report.js'), 'utf8'), ctx, { filename: 'report.js' });
  return win.FBXReport;
}

const R = loadReport();

const mk = (text, extra) => {
  const p = Object.assign({ text, author: 'مصدر', likes: 10, comments: 2, shares: 1, url: 'https://ex.com/1', date: new Date('2026-02-03T09:00:00Z') }, extra || {});
  p.analysis = FBXAnalyzer.analyze(p);
  return p;
};

test('التقرير يحوي كل الأقسام الأساسية', () => {
  const html = R.buildHtml([mk('اقتلوهم جميعا'), mk('ندعم التعايش السلمي'), mk('صباح الخير')], {});
  for (const sec of ['الملخص التنفيذي', 'توزيع التصنيف', 'الفئات الأكثر تكراراً',
                     'الحالات المستوجبة لإجراء', 'السجل الكامل', 'منهجية التصنيف']) {
    assert.ok(html.includes(sec), `القسم «${sec}» مفقود من التقرير`);
  }
  assert.ok(html.includes('dir="rtl"'), 'المستند يجب أن يكون باتجاه RTL');
  assert.ok(html.includes('lang="ar"'));
});

test('الأعداد في الملخص تطابق التحليل الفعلي', () => {
  const posts = [mk('اقتلوهم جميعا'), mk('بيع الكبتاغون'), mk('ندعم التعايش السلمي'), mk('صباح الخير')];
  const html = R.buildHtml(posts, {});
  const stats = FBXAnalyzer.aggregate(posts.map(p => p.analysis));
  assert.strictEqual(stats.negative, 2);
  assert.strictEqual(stats.positive, 1);
  assert.strictEqual(stats.neutral, 1);
  // يجب أن تظهر هذه الأعداد في بطاقات الملخص
  assert.ok(/<div class="v v-neg">2<\/div>/.test(html), 'عدد السلبي يجب أن يظهر في الملخص');
  assert.ok(/<div class="v v-pos">1<\/div>/.test(html));
});

test('عيّنة بلا حالات حرجة تُنتج رسالة واضحة لا قسماً فارغاً', () => {
  const html = R.buildHtml([mk('صباح الخير'), mk('ندعم التعايش السلمي')], {});
  assert.ok(html.includes('لم تُرصد أي حالة تستوجب الحذف أو المراجعة البشرية'));
});

test('نص المنشور لا يمكن أن يحقن HTML في التقرير', () => {
  const evil = '<img src=x onerror="alert(1)"><script>steal()</script>';
  const html = R.buildHtml([mk(evil, { author: '<b>وسم</b>' })], {});
  assert.ok(!html.includes('<img src=x'), 'وسم الصورة يجب أن يُهرَّب');
  assert.ok(!html.includes('<script>steal()'), 'الشفرة المحقونة يجب أن تُهرَّب');
  assert.ok(html.includes('&lt;img src=x'), 'يجب أن يظهر النص مُهرَّباً');
  assert.ok(!html.includes('<b>وسم</b>'), 'اسم المصدر يجب أن يُهرَّب كذلك');
});

test('المنشورات بلا تاريخ لا تكسر نطاق الفترة', () => {
  const p = mk('صباح الخير', { date: null });
  const html = R.buildHtml([p], {});
  assert.ok(html.includes('الفترة المشمولة'));
  assert.ok(!html.includes('Invalid Date'), 'يجب ألا يظهر تاريخ غير صالح في المستند');
});

test('نص طويل جداً يُقتطع في السجل ولا يُخرِج المستند عن حدوده', () => {
  const long = 'ا'.repeat(3000);
  const html = R.buildHtml([mk(long)], {});
  assert.ok(html.includes('…'), 'النص الطويل يجب أن يُقتطع بعلامة حذف');
  assert.ok(!html.includes('ا'.repeat(1000)), 'يجب ألا يُدرَج النص كاملاً');
});

test('open يرفض العيّنة الفارغة برسالة مفهومة', () => {
  const r = R.open([], {});
  assert.strictEqual(r.ok, false);
  assert.ok(/لا توجد نتائج/.test(r.error));
});

test('open يبلّغ بوضوح عند منع النوافذ المنبثقة', () => {
  const r = R.open([mk('صباح الخير')], {});   // window.open مُهيّأ ليعيد null
  assert.strictEqual(r.ok, false);
  assert.ok(/النوافذ المنبثقة/.test(r.error));
});

test('يُذكر عدد ما روجع بالذكاء الاصطناعي عند وجوده فقط', () => {
  const plain = R.buildHtml([mk('صباح الخير')], {});
  assert.ok(!plain.includes('مراجعة الذكاء الاصطناعي'), 'لا يُذكر القسم إن لم تُستخدم الطبقة');

  const p = mk('صباح الخير');
  p.analysis = Object.assign({}, p.analysis, { engine: 'ai' });
  const withAi = R.buildHtml([p], {});
  assert.ok(withAi.includes('مراجعة الذكاء الاصطناعي'));
  assert.ok(withAi.includes('مراجَع بالذكاء الاصطناعي') || withAi.includes('روجِع'));
});

test('اسم المنصة يظهر حسب المصدر', () => {
  assert.ok(R.buildHtml([mk('a')], { platform: 'twitter' }).includes('منصة X'));
  assert.ok(R.buildHtml([mk('a')], { platform: 'facebook' }).includes('فيسبوك'));
});
