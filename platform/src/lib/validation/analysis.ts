import { z } from 'zod';
import { postFiltersSchema } from './posts';

const stance = z.enum(['SUPPORTIVE', 'OPPOSED', 'NEUTRAL', 'MIXED', 'UNCLEAR']);
/*
 * المؤشّر أربع قيم لا خمس.
 *
 * «مختلط» حُذف عمداً: السياسة تصنّف ما جمع مدحاً ونقداً سلبياً وتضع عليه
 * علامة، لا تجعله صنفاً ثالثاً. والقيمة باقية في نوع القاعدة لأن صفوفاً
 * قديمة تحملها، لكنها لا تُقبل مدخلاً جديداً — لا من النموذج ولا من
 * المراجع.
 */
const sentiment = z.enum(['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'UNKNOWN']);
const riskFlag = z.enum([
  'INCITEMENT_VIOLENCE',
  'SECTARIAN_REGIONAL',
  'HATE_SPEECH',
  'THREAT',
  'PLATFORM_POLICY',
]);

/*
 * التصحيح.
 *
 * الحقول كلها اختيارية عدا التعليل: المراجع قد يصحّح الموقف وحده، أو
 * يزيل إشارة خطر وحدها. وإلزامه بإعادة كتابة كلّ شيء يجعله ينسخ ما لم
 * يقصد تغييره فيُعلّم النموذج ما لم يُرِد تعليمه.
 *
 * والتعليل إلزامي لأنه ما يجعل المثال قابلاً للتعميم: «معارض» تقول ماذا،
 * و«لأن النصّ ينتقد أداء الخدمات لا يدعو لتقويض الدولة» تقول لماذا.
 */
export const correctionSchema = z
  .object({
    stance: stance.optional(),
    sentiment: sentiment.optional(),
    riskFlags: z.array(riskFlag).max(5).optional(),
    note: z.string().trim().min(10, 'اكتب تعليلاً يشرح سبب التصحيح').max(600),
  })
  .refine(
    (value) =>
      value.stance !== undefined ||
      value.sentiment !== undefined ||
      value.riskFlags !== undefined,
    { message: 'حدّد ما تريد تصحيحه على الأقل' },
  );

export const guidanceSchema = z.object({
  scope: z.enum(['STANCE', 'SENTIMENT', 'RISK', 'GENERAL']).default('GENERAL'),
  instruction: z
    .string()
    .trim()
    .min(10, 'اكتب توجيهاً واضحاً')
    .max(400, 'التوجيه أطول من الحد — اجعله قاعدة واحدة مختصرة'),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const updateGuidanceSchema = guidanceSchema.partial();

/*
 * جولة التحليل.
 *
 * الفلاتر نفسها التي تحكم شاشة المنشورات، فلا يتعلّم المستخدم لغتين:
 * ما يراه في القائمة هو ما ستشمله الجولة.
 */
export const analysisRunSchema = postFiltersSchema.extend({
  /*
   * إعادة تحليل ما حُلّل سابقاً — وإلا فغير المحلَّل وحده.
   *
   * ولا تُستعمل `z.coerce.boolean` هنا: هي تقرأ النصّ "false" صحيحاً لأنه
   * غير فارغ، فتصير الجولة إعادةً للكلّ بينما طُلب عكسُه — وهي كلفةٌ لا
   * تُسترَدّ. فتُقرأ القيمة منطقيةً، ويُترجَم النصّان وحدهما.
   */
  reanalyze: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')])
    .default(false),
  /*
   * السقف إلزاميّ بقيمة افتراضية متحفّظة.
   *
   * كلّ منشور في الجولة استدعاءٌ مدفوع لمزوّد خارجي، وفلترٌ أوسع ممّا قصد
   * صاحبه يصير فاتورة لا خطأ شاشة. فالسقف يُعرض ويُعدَّل بقصد.
   */
  limit: z.coerce.number().int().min(1).max(20_000).default(500),
});

/** التوجيهات التي التقطها المساعد وتنتظر قراراً */
export const guidanceListSchema = z.object({
  source: z.enum(['ALL', 'MANUAL', 'ASSISTANT']).default('ALL'),
});
