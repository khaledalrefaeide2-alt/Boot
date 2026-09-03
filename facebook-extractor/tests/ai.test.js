'use strict';

/*
 * اختبارات طبقة النموذج اللغوي — ai.js
 * -------------------------------------
 * لا تتصل بأي شبكة: تُختبر المنطقيات الخالصة فقط — قراءة رد النموذج،
 * وحراسة الاتساق التي تفرض القواعد الصارمة على مخرجاته.
 *
 * حراسة الاتساق هي بيت القصيد: النموذج قد يخطئ فيقول «إيجابي + حذف فوري»،
 * والواجهة وقاعدة البيانات تعتمدان على ألا يحدث ذلك أبداً.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { FBXAnalyzer } = require('../analyzer.js');

function loadAI() {
  const store = new Map();
  const win = {
    FBXAnalyzer,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k)
    },
    fetch: async () => { throw new Error('الشبكة ممنوعة في الاختبارات'); }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'ai.js'), 'utf8'), ctx, { filename: 'ai.js' });
  return { AI: win.FBXAI, store };
}

const { AI, store } = loadAI();
const local = FBXAnalyzer.analyze({ text: 'صباح الخير', author: 'حساب' });

/* ============================================================
 * قراءة رد النموذج
 * ============================================================ */
// الكائنات تُنشأ داخل realm الـ vm فتختلف نماذجها الأولية عن الخارجية،
// لذا نقارن المحتوى نصياً بدل المقارنة البنيوية الصارمة.
const sameJson = (actual, expected) =>
  assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected));

test('extractJson يقرأ JSON نظيفاً', () => {
  sameJson(AI._extractJson('{"a":1}'), { a: 1 });
});

test('extractJson يتجاوز أسوار الشفرة والنص الزائد', () => {
  sameJson(AI._extractJson('```json\n{"a":1}\n```'), { a: 1 });
  sameJson(AI._extractJson('```\n{"a":2}\n```'), { a: 2 });
  sameJson(AI._extractJson('إليك النتيجة:\n{"a":3}\nانتهى'), { a: 3 });
});

test('extractJson يردّ null على رد غير صالح بدل أن ينهار', () => {
  assert.strictEqual(AI._extractJson('لا يوجد JSON هنا'), null);
  assert.strictEqual(AI._extractJson(''), null);
  assert.strictEqual(AI._extractJson(null), null);
});

/* ============================================================
 * حراسة الاتساق — تفرض القواعد على مخرجات النموذج
 * ============================================================ */
test('المحتوى الإيجابي لا يمكن أن يحمل إجراء حذف مهما قال النموذج', () => {
  const a = AI._toAnalysis({ classification: 'POSITIVE', level: 'HIGH', action: 'DELETE' }, {}, local);
  assert.strictEqual(a.classification, 'POSITIVE');
  assert.strictEqual(a.action, 'KEEP', 'الإيجابي يُبقى دائماً');
  assert.strictEqual(a.flagged, false);
});

test('الحذف الفوري لا يُطبَّق إلا على محتوى سلبي', () => {
  const a = AI._toAnalysis({ classification: 'NEUTRAL', level: 'HIGH', action: 'DELETE' }, {}, local);
  assert.strictEqual(a.action, 'REVIEW', 'الحذف على محتوى غير سلبي يُخفَّض إلى مراجعة');
});

test('الحذف الفوري يستلزم خطورة عالية', () => {
  const a = AI._toAnalysis({ classification: 'NEGATIVE', level: 'LOW', action: 'DELETE' }, {}, local);
  assert.strictEqual(a.level, 'HIGH');
  assert.strictEqual(a.action, 'DELETE');
});

test('القيم غير المعروفة تُستبدل بقيم آمنة', () => {
  const a = AI._toAnalysis({ classification: 'BANANA', level: 'ULTRA', action: 'NUKE' }, {}, local);
  assert.strictEqual(a.classification, 'NEUTRAL');
  assert.strictEqual(a.level, 'LOW');
  assert.strictEqual(a.action, 'KEEP');
});

test('الرد الفارغ لا يُسقط التحويل', () => {
  const a = AI._toAnalysis({}, {}, local);
  assert.strictEqual(a.classification, 'NEUTRAL');
  assert.strictEqual(a.action, 'KEEP');
  assert.ok(a.legalBasis);
  assert.ok(a.contextualAnalysis);
});

/* ============================================================
 * شكل المخرجات — يجب أن يطابق مخرجات المحرك المحلي تماماً
 * ============================================================ */
test('مخرجات النموذج تطابق شكل مخرجات المحرك المحلي', () => {
  const a = AI._toAnalysis({
    classification: 'NEGATIVE', level: 'HIGH', action: 'DELETE',
    categoryId: 'HATE_SPEECH', subCategory: 'خطاب الكراهية',
    legalBasis: 'سياسات المنصات', contextualAnalysis: 'تحريض صريح',
    exceptionApplied: false, confidence: 0.93
  }, {}, local);

  const reference = FBXAnalyzer.analyze({ text: 'اقتلوهم جميعا' });
  for (const k of Object.keys(reference)) {
    assert.ok(k in a, `الحقل «${k}» الموجود في المحرك المحلي مفقود من مخرجات النموذج`);
  }
  assert.strictEqual(a.classificationLabel, 'سلبي');
  assert.strictEqual(a.levelLabel, 'عالي');
  assert.strictEqual(a.actionLabel, 'الحذف الفوري');
  assert.strictEqual(a.flagged, true);
  assert.strictEqual(a.engine, 'ai');
  assert.strictEqual(a.confidence, 0.93);
});

test('الثقة تُحصر بين صفر وواحد وتُهمَل إن لم تكن رقماً', () => {
  assert.strictEqual(AI._toAnalysis({ confidence: 5 }, {}, local).confidence, 1);
  assert.strictEqual(AI._toAnalysis({ confidence: -2 }, {}, local).confidence, 0);
  assert.strictEqual(AI._toAnalysis({ confidence: 'عالية' }, {}, local).confidence, null);
});

test('يُسجَّل تغيّر الحكم عن المحرك المحلي', () => {
  const same = AI._toAnalysis({ classification: 'NEUTRAL' }, {}, local);
  const diff = AI._toAnalysis({ classification: 'NEGATIVE', level: 'HIGH' }, {}, local);
  assert.strictEqual(same.changedFromLocal, false);
  assert.strictEqual(diff.changedFromLocal, true);
  assert.strictEqual(diff.localClassification, 'NEUTRAL');
});

/* ============================================================
 * التفعيل
 * ============================================================ */
test('الطبقة معطَّلة ما لم يوجد مفتاح', async () => {
  assert.strictEqual(AI.isEnabled(), false);
  await assert.rejects(() => AI.classify({ text: 'x' }), /مفتاح/);
});

test('تُفعَّل عند ضبط المفتاح، والنموذج الافتراضي محدَّد', () => {
  store.set('fbx_ai_key', 'sk-test-123');
  assert.strictEqual(AI.isEnabled(), true);
  assert.strictEqual(AI.getModel(), AI.DEFAULT_MODEL);
  store.set('fbx_ai_model', 'claude-opus-5');
  assert.strictEqual(AI.getModel(), 'claude-opus-5');
  store.delete('fbx_ai_key');
  store.delete('fbx_ai_model');
});

/* ============================================================
 * التعليمات تُبنى من نفس إطار المحرك
 * ============================================================ */
test('إطار المحرك يُصدَّر كاملاً لتبنى عليه تعليمات النموذج', () => {
  const fw = FBXAnalyzer.framework();
  assert.strictEqual(fw.negative.length, 11, 'كل الفئات السلبية يجب أن تُصدَّر');
  assert.strictEqual(fw.positive.length, 5);
  for (const c of fw.negative) {
    assert.ok(c.id && c.label && c.legal, 'كل فئة تحتاج معرّفاً وتسمية واستناداً');
    assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(c.severity));
    assert.ok(['KEEP', 'DELETE', 'REVIEW'].includes(c.action));
  }
});
