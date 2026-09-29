import { z } from 'zod';
import { paginationSchema } from './common';
import { postFiltersSchema } from './posts';

/** أنواع الكيانات كما في المخطّط — مصدرٌ واحد للمخطّط والواجهة */
export const ENTITY_TYPE_VALUES = ['PERSON', 'ORGANIZATION', 'PLACE', 'OTHER'] as const;

/**
 * فلاتر شاشة الكيانات.
 *
 * تمتدّ من فلاتر المنشورات لا تعيد تعريفها: النافذة الزمنية والمنصة
 * والحساب والمجموعة والتصنيف — كلّها تُطبَّق على المنشورات التي ذُكر فيها
 * الكيان، فيكون «أكثر الجهات ذكراً» محسوباً على النطاق نفسه الذي تعرضه
 * بقيّة الشاشات. ولو عُرّفت هنا مستقلّة لانحرف الرقمان بلا أن يُنتبه.
 *
 * ويُضاف إليها بُعدان خاصّان بهذه الشاشة: نوع الكيان، وبحثٌ في اسمه —
 * وهو غير `q` الذي يبحث في نصّ المنشور.
 */
export const listEntitiesSchema = postFiltersSchema
  .extend(paginationSchema.shape)
  .extend({
    type: z.enum(ENTITY_TYPE_VALUES).optional(),
    /** بحث في اسم الكيان — يُطبَّع قبل المطابقة فيتجاوز فروق الهمزة */
    name: z.string().trim().max(120).optional(),
    sort: z.enum(['mentions', 'negative']).default('mentions'),
  });

export type ListEntitiesInput = z.infer<typeof listEntitiesSchema>;
