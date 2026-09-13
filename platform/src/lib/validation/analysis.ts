import { z } from 'zod';

const stance = z.enum(['SUPPORTIVE', 'OPPOSED', 'NEUTRAL', 'MIXED', 'UNCLEAR']);
const sentiment = z.enum(['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED', 'UNKNOWN']);
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
