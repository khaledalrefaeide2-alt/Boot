'use strict';

/*
 * FBXAI — طبقة التصنيف بالنموذج اللغوي
 * -------------------------------------
 * المحرك المحلي (analyzer.js) يطابق كلمات مفتاحية: سريع ومجاني وحتمي، لكنه
 * ينكسر أمام اللهجات، والأخطاء الإملائية، والتحايل المتعمد على الكتابة،
 * والسياق المعكوس («لا يجوز أن نقول إنهم خونة» ليست خطاب كراهية).
 *
 * هذه الطبقة تُراجع حكم المحرك المحلي بنموذج لغوي يفهم السياق، وتُعيد النتيجة
 * بنفس شكل مخرجات analyzer.analyze تماماً حتى تعمل كل الواجهة وقاعدة البيانات
 * دون أي تغيير. تعمل بشكل اختياري بالكامل: بدون مفتاح يبقى الموقع كما هو.
 *
 * الخصوصية: عند تفعيلها يُرسَل نص المنشور إلى واجهة النموذج — وهذا خروج عن
 * مبدأ «كل شيء محلي»، لذا فهي مُعطَّلة افتراضياً ويُنبَّه عليها في الإعدادات.
 */

(function (W) {

  const API_URL = 'https://api.anthropic.com/v1/messages';
  const DEFAULT_MODEL = 'claude-sonnet-5';
  const S = () => (W.FBXCommon ? W.FBXCommon.STORAGE : { aiKey: 'fbx_ai_key', aiModel: 'fbx_ai_model', aiAuto: 'fbx_ai_auto' });

  const getKey   = () => (localStorage.getItem(S().aiKey) || '').trim();
  const getModel = () => (localStorage.getItem(S().aiModel) || '').trim() || DEFAULT_MODEL;
  const isEnabled = () => !!getKey();
  const isAuto = () => localStorage.getItem(S().aiAuto) === '1';

  /* ============================================================
   * التعليمات — مبنية من نفس إطار المحرك المحلي حتى لا ينحرف التعريفان
   * ============================================================ */
  function systemPrompt() {
    const fw = W.FBXAnalyzer.framework();
    const neg = fw.negative.map(c =>
      `- ${c.id} | ${c.label} | الخطورة الافتراضية: ${c.severity} | الإجراء: ${c.action}\n  الاستناد: ${c.legal}`).join('\n');
    const pos = fw.positive.map(c =>
      `- ${c.id} | ${c.label} | الأهمية: ${c.importance}\n  الاستناد: ${c.legal}`).join('\n');

    return `أنت مُراجع محتوى محترف في فريق الثقة والأمان (Trust & Safety) يعمل ضمن الإطار القانوني والأخلاقي السوري.
مهمتك تصنيف منشور واحد من وسائل التواصل الاجتماعي تصنيفاً دقيقاً كما يفعل مراجع بشري متمرس، لا كباحث عن ألفاظ مسيئة.

# الفئات السلبية المعتمدة
${neg}

# الفئات الإيجابية المعتمدة
${pos}

# قواعد الحالات الخاصة — إلزامية وهي جوهر دقة الحكم
1. نقل انتهاك أو اقتباسه بقصد الإدانة أو التحذير أو التوثيق ليس انتهاكاً: صنّفه إيجابياً (DIGITAL_AWARENESS) واضبط exceptionApplied=true.
2. السخرية السياسية العامة التي لا تستهدف شخصاً بعينه ولا تستهزئ بضحايا: حيادية، خطورة LOW، الإجراء KEEP.
3. القدح أو الذم بحق شخصية عامة أو مكلَّف بعمل عام: شدِّد إلى HIGH والإجراء DELETE (المادتان 24 و25).
4. اتهام باطل بلا أي دليل (افتراء): ينتقل من النقد المشروع إلى القدح ← HIGH و DELETE.
5. السخرية من أعراض الناس أو من مآسي الضحايا: قدح وتحقير ← سلبي.
6. النقد البنّاء لسياسة أو أداء عام، الخالي من القدح والاتهام غير الموثق: حيادي مشروع ← KEEP.
7. النص الاستفهامي البحت: حيادي، LOW.
8. الخبر الإحصائي أو التقرير المجرد بأرقام موضوعية: حيادي، MEDIUM.

# ضوابط الحكم
- احكم على المعنى والنية في السياق، لا على مجرد ورود لفظ. اللهجات والأخطاء الإملائية والتحايل في الكتابة يجب أن تُفهم كما يفهمها قارئ عربي.
- ورود لفظ قاسٍ داخل اقتباس أو استنكار لا يجعل المنشور سلبياً (القاعدة 1).
- الإجراء DELETE لا يكون إلا لمحتوى NEGATIVE بخطورة HIGH.
- كل محتوى POSITIVE إجراؤه KEEP دائماً.
- إن لم ينطبق شيء، فالتصنيف NEUTRAL بخطورة LOW والإجراء KEEP.
- اكتب كل النصوص الوصفية بالعربية الفصحى، وبصياغة مهنية موجزة.

# صيغة الإخراج
أعِد كائن JSON واحداً فقط، دون أي نص قبله أو بعده، ودون أسوار شفرة، بهذه الحقول تحديداً:
{
  "classification": "POSITIVE" | "NEGATIVE" | "NEUTRAL",
  "level": "HIGH" | "MEDIUM" | "LOW",
  "categoryId": "معرّف الفئة من القوائم أعلاه، أو null إن كان حيادياً",
  "subCategory": "اسم الفئة بالعربية، أو وصف موجز للحالة الحيادية",
  "legalBasis": "الاستناد القانوني والأخلاقي الدقيق بذكر رقم المادة إن وُجد",
  "contextualAnalysis": "تحليل سياقي يشرح سبب هذا الحكم تحديداً في جملتين إلى ثلاث",
  "action": "KEEP" | "DELETE" | "REVIEW",
  "exceptionApplied": true | false,
  "confidence": عدد بين 0 و1 يعبّر عن ثقتك في الحكم
}`;
  }

  function userPrompt(post, localAnalysis) {
    const meta = [
      `الحساب/الصفحة: ${post.author || 'غير معروف'}`,
      post.platform ? `المنصة: ${post.platform === 'twitter' ? 'X (تويتر)' : 'فيسبوك'}` : '',
      `التفاعل: ${post.likes || 0} إعجاب · ${post.comments || 0} تعليق · ${post.shares || 0} مشاركة`
    ].filter(Boolean).join('\n');

    const hint = localAnalysis
      ? `\n\n# الحكم الأولي من المحرك المحلي (للاسترشاد فقط — صحّحه إن كان مخطئاً)\nالتصنيف: ${localAnalysis.classificationLabel} · المستوى: ${localAnalysis.levelLabel} · الفئة: ${localAnalysis.subCategory}`
      : '';

    return `# بيانات المنشور\n${meta}${hint}\n\n# نص المنشور المطلوب تصنيفه\n"""\n${post.text || '(بدون نص)'}\n"""`;
  }

  /* ============================================================
   * تحويل ناتج النموذج إلى شكل مخرجات المحرك المحلي نفسه
   * ============================================================ */
  const CLASS_LABEL = { POSITIVE: 'إيجابي', NEGATIVE: 'سلبي', NEUTRAL: 'حيادي' };
  const CLASS_ICON  = { POSITIVE: '🟢', NEGATIVE: '🔴', NEUTRAL: '⚪' };
  const LEVEL_LABEL = { HIGH: 'عالي', MEDIUM: 'متوسط', LOW: 'منخفض' };
  const LEVEL_CLASS = { HIGH: 'lv-high', MEDIUM: 'lv-mid', LOW: 'lv-low' };
  const ACTION_LABEL = { KEEP: 'الإبقاء على المنشور', DELETE: 'الحذف الفوري', REVIEW: 'تحويله للمراجعة البشرية' };
  const ACTION_ICON = { KEEP: '✅', DELETE: '⛔', REVIEW: '🔍' };

  const oneOf = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

  function toAnalysis(out, post, localAnalysis) {
    const classification = oneOf(out.classification, ['POSITIVE', 'NEGATIVE', 'NEUTRAL'], 'NEUTRAL');
    let level  = oneOf(out.level, ['HIGH', 'MEDIUM', 'LOW'], 'LOW');
    let action = oneOf(out.action, ['KEEP', 'DELETE', 'REVIEW'], 'KEEP');

    // حراسة الاتساق: النموذج قد يخالف القواعد الصارمة أحياناً، فنفرضها هنا
    // بدل الوثوق الأعمى — نفس الثوابت التي تختبرها مجموعة الاختبارات.
    if (classification === 'POSITIVE') action = 'KEEP';
    if (action === 'DELETE' && classification !== 'NEGATIVE') action = 'REVIEW';
    if (action === 'DELETE' && level !== 'HIGH') level = 'HIGH';

    const conf = typeof out.confidence === 'number' ? Math.max(0, Math.min(1, out.confidence)) : null;
    const subCategory = String(out.subCategory || 'غير محدد');

    return {
      classification,
      classificationLabel: CLASS_LABEL[classification],
      classificationIcon: CLASS_ICON[classification],
      level, levelLabel: LEVEL_LABEL[level], levelClass: LEVEL_CLASS[level],
      subCategory,
      legalBasis: String(out.legalBasis || '—'),
      contextualAnalysis: String(out.contextualAnalysis || '—'),
      action, actionLabel: ACTION_LABEL[action], actionIcon: ACTION_ICON[action],
      exceptionApplied: !!out.exceptionApplied,
      flagged: classification === 'NEGATIVE',
      source: (localAnalysis && localAnalysis.source) || null,
      summary: `${CLASS_LABEL[classification]} · ${LEVEL_LABEL[level]} الخطورة/الأهمية · ${subCategory}`,
      analyzedAt: Date.now(),
      engine: 'ai',
      aiModel: getModel(),
      confidence: conf,
      categoryId: out.categoryId || null,
      // نحتفظ بالحكم المحلي للمقارنة وإظهار مواضع الاختلاف
      localClassification: localAnalysis ? localAnalysis.classification : null,
      changedFromLocal: !!localAnalysis && localAnalysis.classification !== classification
    };
  }

  function extractJson(text) {
    const t = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try { return JSON.parse(t); } catch (_) {}
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a !== -1 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (_) {} }
    return null;
  }

  /* ============================================================
   * نداء الواجهة
   * ============================================================ */
  async function callModel(post, localAnalysis, signal) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': getKey(),
        'anthropic-version': '2023-06-01',
        // مطلوب للنداء المباشر من المتصفح
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      signal,
      body: JSON.stringify({
        model: getModel(),
        max_tokens: 1024,
        system: systemPrompt(),
        messages: [{ role: 'user', content: userPrompt(post, localAnalysis) }]
      })
    });

    if (!res.ok) {
      let detail = '';
      try { const e = await res.json(); detail = e?.error?.message || ''; } catch (_) {}
      if (res.status === 401) throw new Error('🔑 مفتاح النموذج غير صحيح — تحقق منه في صفحة الإعدادات.');
      if (res.status === 429) throw new Error('⏳ تم تجاوز حد الطلبات — أعد المحاولة بعد قليل.');
      if (res.status === 400 && /credit|balance/i.test(detail)) throw new Error('💳 رصيد حساب النموذج غير كافٍ.');
      throw new Error(`خطأ من واجهة النموذج (HTTP ${res.status})${detail ? ': ' + detail : ''}`);
    }

    const data = await res.json();
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    const out = extractJson(text);
    if (!out) throw new Error('تعذّر قراءة رد النموذج بصيغة JSON.');
    return out;
  }

  /* ============================================================
   * الواجهة العامة
   * ============================================================ */
  async function classify(post, opts) {
    opts = opts || {};
    if (!isEnabled()) throw new Error('لم يُضبط مفتاح النموذج بعد — اضبطه من صفحة الإعدادات ⚙️.');
    const local = post.analysis || W.FBXAnalyzer.analyze(post);
    const out = await callModel(post, local, opts.signal);
    return toAnalysis(out, post, local);
  }

  /*
   * يراجع مجموعة منشورات على دفعات صغيرة متوازية.
   * فشل منشور واحد لا يُسقط الدفعة — يُبقى حكمه المحلي ويُسجَّل الخطأ.
   */
  async function classifyBatch(posts, opts) {
    opts = opts || {};
    const concurrency = opts.concurrency || 3;
    const onProgress = opts.onProgress || (() => {});
    const list = posts.slice();
    let done = 0, changed = 0, failed = 0;
    const errors = [];

    async function worker() {
      while (list.length) {
        if (opts.signal && opts.signal.aborted) return;
        const post = list.shift();
        try {
          const a = await classify(post, opts);
          post.analysis = a;
          if (a.changedFromLocal) changed++;
        } catch (e) {
          failed++;
          if (errors.length < 3) errors.push(e.message);
        }
        done++;
        onProgress({ done, total: posts.length, changed, failed });
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, posts.length) }, worker));
    return { done, changed, failed, errors };
  }

  /* فحص سريع للمفتاح من صفحة الإعدادات */
  async function testKey(key, model) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': (key || '').trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: model || getModel(),
        max_tokens: 16,
        messages: [{ role: 'user', content: 'قل: جاهز' }]
      })
    });
    if (res.status === 401) throw new Error('🔴 المفتاح غير صحيح أو منتهي الصلاحية.');
    if (!res.ok) {
      let detail = '';
      try { const e = await res.json(); detail = e?.error?.message || ''; } catch (_) {}
      throw new Error(`تعذّر التحقق (HTTP ${res.status})${detail ? ': ' + detail : ''}`);
    }
    return true;
  }

  W.FBXAI = {
    isEnabled, isAuto, getModel, classify, classifyBatch, testKey,
    DEFAULT_MODEL,
    // مكشوفة للاختبار
    _toAnalysis: toAnalysis, _extractJson: extractJson
  };

})(typeof window !== 'undefined' ? window : this);
