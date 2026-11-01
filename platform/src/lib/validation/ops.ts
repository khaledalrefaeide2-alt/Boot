import { z } from 'zod';

/*
 * فلاتر غرفة العمليات — أضيق من فلاتر المنشورات عمداً.
 *
 * الغرفة شاشةٌ تُعلَّق على الجدار وتُقرأ من بعيد، لا أداةُ تنقيب: نطاقٌ
 * زمني قصير ومنصةٌ ومجموعة. وما وراء التسعين يوماً سؤالُ تقريرٍ لا سؤالُ
 * رصدٍ حيّ — ومسحه كلّ دقيقة على شاشةٍ مفتوحة طوال اليوم ثمنٌ بلا مقابل.
 */
export const OPS_RANGES = ['today', '7d', '30d', '90d'] as const;

const id = z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/);

export const opsQuerySchema = z.object({
  range: z.enum(OPS_RANGES).default('7d'),
  platformId: id.optional(),
  groupId: id.optional(),
});

export type OpsQuery = z.infer<typeof opsQuerySchema>;
