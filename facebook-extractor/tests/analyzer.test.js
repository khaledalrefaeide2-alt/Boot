'use strict';

/*
 * اختبارات محرك التصنيف — FBXAnalyzer
 * ------------------------------------
 * تشغيل:  node --test tests/
 * بلا أي مكتبات خارجية — تعتمد على وحدة الاختبار المدمجة في Node.
 *
 * الهدف: تثبيت سلوك المحرك حتى لا يقلب أي تعديل مستقبلي على قوائم الكلمات
 * تصنيف فئة كاملة دون أن يلاحظ أحد — فالمحرك يصدر أحكاماً بـ«الحذف الفوري»
 * استناداً لمواد قانونية، وأي انحراف صامت فيه مكلف.
 */

const test = require('node:test');
const assert = require('node:assert');
const { FBXAnalyzer } = require('../analyzer.js');

const analyze = text => FBXAnalyzer.analyze({ text });

/* ============================================================
 * 1) الفئات السلبية — كل فئة تُصنَّف سلبياً بالمستوى والإجراء الصحيحين
 * ============================================================ */
const NEGATIVE_CASES = [
  { name: 'المساس بالدستور والعصيان المسلح', text: 'يجب قلب نظام الحكم واعلان عصيان مسلح ضد السلطات',
    level: 'HIGH', action: 'DELETE', legalIncludes: '27' },
  { name: 'النيل من هيبة الدولة', text: 'الدوله تكذب على الشعب وهذه حكومه عميله بالكامل',
    level: 'HIGH', action: 'DELETE', legalIncludes: '28' },
  { name: 'زعزعة الثقة بالعملة', text: 'اسحبوا اموالكم من المصارف فالليره ستنهار كليا',
    level: 'HIGH', action: 'DELETE', legalIncludes: '29' },
  { name: 'خطاب الكراهية', text: 'هؤلاء جرذان وكفار يجب ان اقتلوهم جميعا',
    level: 'HIGH', action: 'DELETE' },
  { name: 'الإساءة للرموز الدينية', text: 'منشور فيه اهانه المقدسات وتدنيس المقدسات',
    level: 'HIGH', action: 'DELETE', legalIncludes: '31' },
  { name: 'استغلال الفئات الهشة', text: 'استغلال طفل في محتوى و استغلال قاصر لجمع التبرعات',
    level: 'HIGH', action: 'DELETE', legalIncludes: '26' },
  { name: 'الترويج للمخدرات', text: 'متوفر لدينا بيع الكبتاغون و توصيل مخدرات للمنزل',
    level: 'HIGH', action: 'DELETE', legalIncludes: '30' },
  { name: 'المحتوى المنافي للحشمة', text: 'سننشر محتوى اباحي و صور فاضحه',
    level: 'HIGH', action: 'DELETE' },
  { name: 'القدح والتحقير', text: 'انت يا حقير يا كلب يا تافه',
    level: 'MEDIUM', action: 'REVIEW', legalIncludes: '24' },
  { name: 'انتهاك الخصوصية', text: 'هذا رقم هاتفه و عنوانه هو كذا فانشروه',
    level: 'MEDIUM', action: 'REVIEW', legalIncludes: '21' },
  { name: 'الأخبار الكاذبة', text: 'حصري ولن تصدقوا هذه الحقيقه المخفيه من مصادر مجهوله',
    level: 'MEDIUM', action: 'REVIEW' }
];

test('الفئات السلبية تُصنَّف سلبياً بالمستوى والإجراء الصحيحين', async t => {
  for (const c of NEGATIVE_CASES) {
    await t.test(c.name, () => {
      const a = analyze(c.text);
      assert.strictEqual(a.classification, 'NEGATIVE', `توقعنا تصنيفاً سلبياً لـ«${c.name}»`);
      assert.strictEqual(a.level, c.level);
      assert.strictEqual(a.action, c.action);
      assert.strictEqual(a.flagged, true);
      assert.ok(a.subCategory && a.subCategory.length > 0, 'يجب تحديد الفئة الفرعية');
      assert.ok(a.legalBasis && a.legalBasis.length > 0, 'يجب ذكر الاستناد القانوني');
      assert.ok(a.contextualAnalysis && a.contextualAnalysis.length > 0, 'يجب ذكر التحليل السياقي');
      if (c.legalIncludes) {
        assert.ok(a.legalBasis.includes(c.legalIncludes),
          `الاستناد القانوني يجب أن يذكر المادة ${c.legalIncludes} — الناتج: ${a.legalBasis.slice(0, 90)}`);
      }
    });
  }
});

/* ============================================================
 * 2) الفئات الإيجابية
 * ============================================================ */
const POSITIVE_CASES = [
  { name: 'السلم الأهلي', text: 'ندعم التعايش السلمي و المصالحه الوطنيه و نبذ العنف والانتقام', importance: 'HIGH' },
  { name: 'حقوق الإنسان والتنوع', text: 'ندعم حقوق المراه و تمكين النساء و حقوق ذوي الاعاقه', importance: 'HIGH' },
  { name: 'مكافحة التضليل', text: 'تصحيح معلومه خاطئه: هذا الخبر غير صحيح والدليل موجود', importance: 'MEDIUM' },
  { name: 'الوعي الرقمي', text: 'احذروا الاحتيال الالكتروني و لا تشاركوا بياناتكم الشخصيه', importance: 'MEDIUM' },
  { name: 'دعم بناء الدولة', text: 'نعمل على اعاده الاعمار و سياده القانون و مكافحه الفساد', importance: 'MEDIUM' }
];

test('الفئات الإيجابية تُصنَّف إيجابياً مع الإبقاء على المنشور', async t => {
  for (const c of POSITIVE_CASES) {
    await t.test(c.name, () => {
      const a = analyze(c.text);
      assert.strictEqual(a.classification, 'POSITIVE');
      assert.strictEqual(a.action, 'KEEP');
      assert.strictEqual(a.flagged, false);
      assert.strictEqual(a.level, c.importance);
    });
  }
});

/* ============================================================
 * 3) الحالات الخاصة — جوهر دقة المحرك وما يميّزه عن فلتر ألفاظ
 * ============================================================ */
test('حالة خاصة 1: نقل الانتهاك بقصد الإدانة لا يُعاقَب عليه', () => {
  const a = analyze('ندين هذا الخطاب: قال احدهم اقتلوهم جميعا و هذا خطاب كراهيه مرفوض');
  assert.strictEqual(a.classification, 'POSITIVE', 'الإدانة الصريحة يجب ألا تُصنَّف سلبياً');
  assert.strictEqual(a.action, 'KEEP');
  assert.strictEqual(a.exceptionApplied, true, 'يجب وسم الاستثناء ليظهر للمراجع البشري');
});

test('حالة خاصة 2: السخرية السياسية العامة تبقى حيادية', () => {
  const a = analyze('يا سلام كالعاده يا تافه 🤡');
  assert.strictEqual(a.classification, 'NEUTRAL');
  assert.strictEqual(a.level, 'LOW');
  assert.strictEqual(a.action, 'KEEP');
});

test('حالة خاصة 3: القدح بحق شخصية عامة يُشدَّد إلى حذف فوري', () => {
  const plain = analyze('انت يا حقير');
  const publik = analyze('الوزير يا حقير');
  assert.strictEqual(plain.level, 'MEDIUM', 'القدح العادي يبقى متوسطاً');
  assert.strictEqual(plain.action, 'REVIEW');
  assert.strictEqual(publik.level, 'HIGH', 'القدح بحق شخصية عامة يُشدَّد');
  assert.strictEqual(publik.action, 'DELETE');
});

test('حالة خاصة 4: الافتراء بلا دليل يُشدَّد إلى حذف فوري', () => {
  const a = analyze('هو يا حقير و اكيد سارق ولا يوجد اثبات بلا دليل');
  assert.strictEqual(a.classification, 'NEGATIVE');
  assert.strictEqual(a.level, 'HIGH');
  assert.strictEqual(a.action, 'DELETE');
});

test('حالة خاصة 5: السخرية من الضحايا قدح وتحقير', () => {
  const a = analyze('يا كلب مصيبتهم مضحكه و يستاهلون الموت ضحكت');
  assert.strictEqual(a.classification, 'NEGATIVE');
  assert.ok(/سخريه|سخرية/.test(a.contextualAnalysis), 'يجب أن يذكر التحليل السخرية من المعاناة');
});

test('حالة خاصة 6: النقد البنّاء لشخصية عامة مشروع', () => {
  const a = analyze('نقترح على الحكومه اصلاحا اداريا و نطالب باصلاح الخدمات');
  assert.strictEqual(a.action, 'KEEP');
  assert.notStrictEqual(a.classification, 'NEGATIVE', 'النقد البنّاء يجب ألا يُصنَّف سلبياً');
});

test('حالة خاصة 7: النص الاستفهامي حيادي منخفض', () => {
  const a = analyze('هل تعلمون متي يبدا الدوام الرسمي؟');
  assert.strictEqual(a.classification, 'NEUTRAL');
  assert.strictEqual(a.level, 'LOW');
  assert.strictEqual(a.subCategory, 'استفسار عام');
});

test('حالة خاصة 8: الخبر الإحصائي حيادي بأهمية متوسطة', () => {
  const a = analyze('بلغ عدد الزوار 12000 بنسبه ارتفاع 30% وفق تقرير رسمي');
  assert.strictEqual(a.classification, 'NEUTRAL');
  assert.strictEqual(a.level, 'MEDIUM');
});

/* ============================================================
 * 4) الترجيح بين عدة فئات
 * ============================================================ */
test('عند تطابق عدة فئات تُعتمد الأعلى خطورة', () => {
  // قدح (متوسط) + تحريض على القتل (عالي) → يجب اعتماد الأعلى
  const a = analyze('يا حقير و اذبحوهم و اقتلوهم جميعا');
  assert.strictEqual(a.level, 'HIGH');
  assert.strictEqual(a.action, 'DELETE');
});

test('الفئات الإضافية تُذكر في التحليل السياقي', () => {
  const a = analyze('اقتلوهم جميعا و يا حقير و بيع الكبتاغون');
  assert.ok(/مؤشرات اضافيه|مؤشرات إضافية/.test(a.contextualAnalysis),
    `يجب ذكر الفئات الإضافية — الناتج: ${a.contextualAnalysis}`);
});

test('السلبي يَجُبّ الإيجابي عند اجتماعهما', () => {
  const a = analyze('ندعم التعايش السلمي لكن يجب بيع الكبتاغون و تهريب المخدرات');
  assert.strictEqual(a.classification, 'NEGATIVE', 'وجود محتوى إيجابي لا يلغي المخالفة');
});

/* ============================================================
 * 5) التطبيع العربي — يجب أن يتجاوز التشكيل وصور الهمزة والتاء المربوطة
 * ============================================================ */
test('التطبيع يتجاوز التشكيل والهمزات والتاء المربوطة', () => {
  const variants = [
    'اقتلوهم جميعا',
    'اقْتُلُوهُمْ جَمِيعًا',   // مع تشكيل كامل
    'أقتلوهم جميعا',           // همزة قطع
    'إقتلوهم جميعا'            // همزة كسر
  ];
  for (const v of variants) {
    assert.strictEqual(analyze(v).classification, 'NEGATIVE', `فشل التطبيع على: ${v}`);
  }
});

test('normalize يوحّد الأشكال المختلفة للحرف نفسه', () => {
  const n = FBXAnalyzer.normalize;
  assert.strictEqual(n('أإآا'), 'اااا');
  assert.strictEqual(n('مدرسة'), 'مدرسه');
  assert.strictEqual(n('مصطفى'), 'مصطفي');
  assert.strictEqual(n('  مسافات   متعددة '), ' مسافات متعدده ');
});

test('كلمات الاستفهام القصيرة لا تُطابَق كجزء من كلمة أخرى', () => {
  // «عليكم» تحوي «كم» — يجب ألا تجعل النص استفهامياً
  const a = analyze('سلام عليكم ورحمة الله');
  assert.notStrictEqual(a.subCategory, 'استفسار عام',
    'المطابقة يجب أن تكون على مستوى الكلمة لا السلسلة الفرعية');
});

/* ============================================================
 * 6) المحتوى المحايد والحالات الحدّية
 * ============================================================ */
test('المحتوى اليومي العادي حيادي ولا يستدعي إجراء', () => {
  const a = analyze('صباح الخير جميعا، اليوم الطقس جميل وذهبت الى العمل');
  assert.strictEqual(a.classification, 'NEUTRAL');
  assert.strictEqual(a.action, 'KEEP');
  assert.strictEqual(a.flagged, false);
});

test('النص الفارغ أو المفقود لا يُسقط المحرك', () => {
  for (const bad of [{}, { text: '' }, { text: null }, { text: undefined }]) {
    const a = FBXAnalyzer.analyze(bad);
    assert.strictEqual(a.classification, 'NEUTRAL');
    assert.strictEqual(a.action, 'KEEP');
  }
  assert.doesNotThrow(() => FBXAnalyzer.analyze(null));
  assert.doesNotThrow(() => FBXAnalyzer.analyze(undefined));
});

test('يقبل الحقل message كبديل عن text', () => {
  const a = FBXAnalyzer.analyze({ message: 'اقتلوهم جميعا' });
  assert.strictEqual(a.classification, 'NEGATIVE');
});

/* ============================================================
 * 7) تحليل المصدر
 * ============================================================ */
test('تحليل المصدر يصنّف التأثير حسب حجم التفاعل', () => {
  const big = FBXAnalyzer.analyze({ text: 'خبر', author: 'وكاله انباء', likes: 6000, comments: 100, shares: 50 });
  assert.strictEqual(big.source.engagement, 6150);
  assert.ok(big.source.credibility.includes('واسع الانتشار'));
  assert.ok(big.source.type.includes('إعلامية'), 'اسم يحوي «وكاله» يُرجَّح كصفحة إعلامية');

  const mid = FBXAnalyzer.analyze({ text: 'خبر', author: 'حساب', likes: 600 });
  assert.ok(mid.source.credibility.includes('متوسط'));

  const small = FBXAnalyzer.analyze({ text: 'خبر', author: 'حساب', likes: 3 });
  assert.ok(small.source.credibility.includes('محدود'));

  const none = FBXAnalyzer.analyze({ text: 'خبر', author: 'حساب' });
  assert.ok(none.source.credibility.includes('غير معروف'));
});

/* ============================================================
 * 8) الإحصاءات المجمّعة
 * ============================================================ */
test('aggregate يجمع التصنيفات والمستويات والإجراءات بدقة', () => {
  const analyses = [
    analyze('اقتلوهم جميعا'),                    // سلبي · عالي · حذف
    analyze('انت يا حقير'),                      // سلبي · متوسط · مراجعة
    analyze('ندعم التعايش السلمي'),              // إيجابي · عالي
    analyze('صباح الخير')                        // حيادي · منخفض
  ];
  const s = FBXAnalyzer.aggregate(analyses);
  assert.strictEqual(s.total, 4);
  assert.strictEqual(s.negative, 2);
  assert.strictEqual(s.positive, 1);
  assert.strictEqual(s.neutral, 1);
  assert.strictEqual(s.needsDelete, 1);
  assert.strictEqual(s.needsReview, 1);
  assert.strictEqual(s.flagged, 2);
  assert.strictEqual(s.high + s.medium + s.low, 4);
});

test('aggregate يتجاهل العناصر الفارغة ولا ينهار', () => {
  const s = FBXAnalyzer.aggregate([null, undefined, analyze('صباح الخير')]);
  assert.strictEqual(s.total, 3);
  assert.strictEqual(s.neutral, 1);
});

/* ============================================================
 * 9) ثبات شكل المخرجات — الصفحات وقاعدة البيانات تعتمد على هذه الحقول
 * ============================================================ */
test('كل تحليل يعيد الحقول التي تعتمد عليها الواجهة وقاعدة البيانات', () => {
  const a = analyze('اقتلوهم جميعا');
  const required = [
    'classification', 'classificationLabel', 'classificationIcon',
    'level', 'levelLabel', 'levelClass',
    'subCategory', 'legalBasis', 'contextualAnalysis',
    'action', 'actionLabel', 'actionIcon',
    'exceptionApplied', 'flagged', 'source', 'summary', 'analyzedAt'
  ];
  for (const k of required) {
    assert.ok(k in a, `الحقل «${k}» مفقود من ناتج التحليل`);
  }
  assert.ok(['POSITIVE', 'NEGATIVE', 'NEUTRAL'].includes(a.classification));
  assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(a.level));
  assert.ok(['KEEP', 'DELETE', 'REVIEW'].includes(a.action));
  assert.strictEqual(typeof a.analyzedAt, 'number');
});

test('الإجراء متسق دائماً مع التصنيف', () => {
  const samples = [
    ...NEGATIVE_CASES.map(c => c.text),
    ...POSITIVE_CASES.map(c => c.text),
    'صباح الخير', 'هل تعلم؟', 'بلغ عدد الزوار 500 بنسبه 20%'
  ];
  for (const text of samples) {
    const a = analyze(text);
    if (a.classification === 'POSITIVE') {
      assert.strictEqual(a.action, 'KEEP', `المحتوى الإيجابي يجب أن يُبقى: ${text}`);
      assert.strictEqual(a.flagged, false);
    }
    if (a.action === 'DELETE') {
      assert.strictEqual(a.classification, 'NEGATIVE', `الحذف لا يكون إلا لمحتوى سلبي: ${text}`);
      assert.strictEqual(a.level, 'HIGH', `الحذف الفوري يقتصر على الخطورة العالية: ${text}`);
    }
    assert.strictEqual(a.flagged, a.classification === 'NEGATIVE');
  }
});
