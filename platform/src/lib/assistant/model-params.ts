/*
 * معاملات الطلب بحسب النموذج.
 *
 * ★ النموذجان لا يقبلان الطلب نفسه.
 *
 *   نماذج المحادثة القديمة (gpt-4o-mini وأخواتها) تُضبط بالحرارة وبسقف
 *   `max_tokens`. ونماذج الاستدلال (o-series ثمّ gpt-5 فما بعدها، ومنها
 *   gpt-6.1-sol) ترفض الحرارة صراحةً، ولا تقبل `max_tokens` في Chat
 *   Completions، وتُضبط بدلاً منها بعمق التفكير.
 *
 *   فإرسالُ طلبٍ واحد للاثنين يكسر أحدهما لا محالة. وكان كلّ استدعاءٍ في
 *   المشروع يكتب `temperature` بيده؛ فتبديل النموذج في ملف البيئة كان
 *   يُسقط التصنيف كلّه بخطأ 400 على أوّل منشور. فالمعاملات تُبنى هنا،
 *   في موضعٍ واحد، من اسم النموذج — والاستدعاءات تنشرها ولا تكتبها.
 *
 * والملف بلا `server-only` عن قصد: لا سرّ فيه ولا اتصال، وفحصُه يجري
 * خارج Next.
 */

/**
 * درجات عمق التفكير المقبولة في الإعداد.
 *
 * `none` و`minimal` غير مدرَجتين: gpt-6.1-sol لا يقبلهما، ومن يكتب
 * إحداهما في ملف البيئة يُوقَف بخطأٍ يسمّي المتغيّر — لا برفضٍ غامض من
 * المزوّد على كلّ منشور.
 */
export const REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/**
 * هل النموذج نموذجُ استدلال؟
 *
 * يُعرف من الاسم: `o1`/`o3`/`o4-mini`…، و`gpt-N` حيث N خمسة فأكثر.
 * ونسخ `-chat` من العائلة الجديدة (`gpt-5-chat-latest`) نماذج محادثة
 * عادية تقبل الحرارة ولا تفكّر، فتُستثنى. والنموذج المعدَّل (`ft:`) يتبع
 * أصله.
 */
export function isReasoningModel(model: string): boolean {
  const name = model.trim().toLowerCase().replace(/^ft:/, '');
  if (/(^|-)chat(-|$)/.test(name)) return false;
  if (/^o\d/.test(name)) return true;
  const generation = /^gpt-(\d+)/.exec(name);
  return generation ? Number(generation[1]) >= 5 : false;
}

/*
 * ★ سقف المخرجات في نموذج الاستدلال يشمل التفكير.
 *
 *   `max_completion_tokens` و`max_output_tokens` يحسبان رموز التفكير مع
 *   النصّ الظاهر. فسقفٌ مضبوطٌ على طول الجواب وحده (1400 كما كان) يُستنفد
 *   في التفكير، فيعود الردّ فارغاً — وتُدفع كلفته كاملة.
 *
 *   فيُضاف فوق سقف النصّ هامشٌ يكبر مع العمق. وهو حدٌّ للهروب لا ميزانية
 *   متوقّعة: الكلفة على ما يُنتَج فعلاً لا على السقف.
 */
const REASONING_HEADROOM: Record<ReasoningEffort, number> = {
  low: 4_000,
  medium: 12_000,
  high: 24_000,
  xhigh: 48_000,
  max: 96_000,
};

/** سقف النصّ الظاهر حين لا يحدّده المستدعي — يتّسع لتحليل JSON كامل */
const DEFAULT_VISIBLE_TOKENS = 4_000;

/*
 * المهلة تتبع العمق.
 *
 * مهلة الأربعين ثانية كانت تكفي نموذجاً يجيب في ثانيتين. ونموذجٌ يفكّر
 * بعمقٍ عالٍ قد يحتاج دقائق، فتقطعه المهلة القديمة قبل أن يكتب حرفاً —
 * ويُعاد الطلب فيُدفع مرّتين ولا يصل شيء.
 *
 * والسقف خمس دقائق: جولة التحليل تُعدّ «صامتة» بعد عشرين دقيقة بلا أثر،
 * والمنشور الواحد بإعادة محاولته لا يبلغ ذلك.
 */
const REASONING_TIMEOUT_MS: Record<ReasoningEffort, number> = {
  low: 60_000,
  medium: 120_000,
  high: 180_000,
  xhigh: 300_000,
  max: 300_000,
};

interface ParamOptions {
  model: string;
  effort: ReasoningEffort;
  /** سقف النصّ الظاهر — بلا التفكير. يُترك فارغاً حيث لم يكن سقفٌ من قبل */
  maxOutputTokens?: number;
  /** حرارة نماذج المحادثة — تُسقَط لنماذج الاستدلال */
  temperature?: number;
}

/** معاملات Chat Completions — تُنشر داخل الطلب */
export function chatCompletionParams(options: ParamOptions): {
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  reasoning_effort?: ReasoningEffort;
} {
  if (isReasoningModel(options.model)) {
    return {
      reasoning_effort: options.effort,
      max_completion_tokens:
        (options.maxOutputTokens ?? DEFAULT_VISIBLE_TOKENS) + REASONING_HEADROOM[options.effort],
    };
  }
  // المسار القديم كما كان حرفاً بحرف: لا سقف حيث لم يكن سقف
  return {
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...(options.maxOutputTokens !== undefined ? { max_tokens: options.maxOutputTokens } : {}),
  };
}

/** معاملات Responses API — تُنشر داخل الطلب */
export function responsesParams(options: ParamOptions): {
  temperature?: number;
  max_output_tokens?: number;
  reasoning?: { effort: ReasoningEffort };
} {
  if (isReasoningModel(options.model)) {
    return {
      reasoning: { effort: options.effort },
      max_output_tokens:
        (options.maxOutputTokens ?? DEFAULT_VISIBLE_TOKENS) + REASONING_HEADROOM[options.effort],
    };
  }
  return {
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...(options.maxOutputTokens !== undefined ? { max_output_tokens: options.maxOutputTokens } : {}),
  };
}

/**
 * مهلة الطلب الواحد.
 *
 * تُمرَّر مع الطلب لا مع العميل: العميل مخزَّنٌ ومشترَك بين مهامّ تختلف
 * أعماقها، ومهلةٌ على العميل تفرض أطولها على الجميع.
 */
export function requestTimeoutMs(
  model: string,
  effort: ReasoningEffort,
  legacyMs: number,
): number {
  return isReasoningModel(model) ? Math.max(legacyMs, REASONING_TIMEOUT_MS[effort]) : legacyMs;
}
