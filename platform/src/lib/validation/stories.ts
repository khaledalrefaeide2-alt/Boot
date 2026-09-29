import { z } from 'zod';
import { paginationSchema } from './common';
import { postFiltersSchema } from './posts';

/**
 * فلاتر شاشة الأحداث.
 *
 * تمتدّ من فلاتر المنشورات لا تعيد تعريفها: أرقام الحدث تُحسب من
 * منشوراته تحت الفلاتر نفسها التي تعرضها بقيّة الشاشات.
 */
export const listStoriesSchema = postFiltersSchema.extend(paginationSchema.shape).extend({
  sort: z.enum(['posts', 'engagement', 'negative']).default('posts'),
});

export type ListStoriesInput = z.infer<typeof listStoriesSchema>;
