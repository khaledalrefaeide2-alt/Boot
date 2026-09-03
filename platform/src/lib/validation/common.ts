import { z } from 'zod';

/** نص عربي مطلوب مع اقتصاص المسافات */
export const requiredString = (field: string, max = 255) =>
  z
    .string({ message: `${field} مطلوب` })
    .trim()
    .min(1, `${field} مطلوب`)
    .max(max, `${field} أطول من الحد المسموح (${max} محرفاً)`);

export const optionalString = (max = 255) =>
  z
    .string()
    .trim()
    .max(max, `النص أطول من الحد المسموح (${max} محرفاً)`)
    .optional()
    .or(z.literal(''))
    .transform((value) => (value === '' || value === undefined ? null : value));

export const emailSchema = z
  .string({ message: 'البريد الإلكتروني مطلوب' })
  .trim()
  .toLowerCase()
  .min(1, 'البريد الإلكتروني مطلوب')
  .email('صيغة البريد الإلكتروني غير صحيحة')
  .max(255, 'البريد الإلكتروني أطول من الحد المسموح');

export const urlSchema = z
  .string({ message: 'الرابط مطلوب' })
  .trim()
  .min(1, 'الرابط مطلوب')
  .max(2048, 'الرابط أطول من الحد المسموح')
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'الرابط غير صالح — يجب أن يبدأ بـ http أو https');

export const passwordSchema = z
  .string({ message: 'كلمة المرور مطلوبة' })
  .min(10, 'يجب ألا تقل كلمة المرور عن 10 محارف')
  .max(128, 'كلمة المرور أطول من الحد المسموح')
  .refine((value) => /\d/.test(value), 'يجب أن تحتوي كلمة المرور على رقم واحد على الأقل')
  .refine((value) => /[^\d\s]/.test(value), 'يجب أن تحتوي كلمة المرور على حروف');

export const cuidSchema = z.string().trim().min(1, 'المعرّف مطلوب').max(64);

/** ترقيم الصفحات الموحّد لكل القوائم */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

/** ترتيب النتائج */
export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');

/** نطاق زمني: قيمة جاهزة أو تواريخ مخصصة */
export const dateRangeSchema = z.object({
  range: z.enum(['today', '7d', '30d', '90d', 'custom', 'all']).default('30d'),
  from: z.string().datetime().optional().or(z.string().date().optional()),
  to: z.string().datetime().optional().or(z.string().date().optional()),
});

export type DateRangeInput = z.infer<typeof dateRangeSchema>;

/** تحويل النطاق الزمني إلى حدود فعلية */
export function resolveDateRange(input: DateRangeInput): { from: Date | null; to: Date | null } {
  const now = new Date();

  if (input.range === 'all') return { from: null, to: null };

  if (input.range === 'custom') {
    const from = input.from ? new Date(input.from) : null;
    const to = input.to ? new Date(input.to) : null;
    if (to) to.setHours(23, 59, 59, 999);
    return {
      from: from && !Number.isNaN(from.getTime()) ? from : null,
      to: to && !Number.isNaN(to.getTime()) ? to : null,
    };
  }

  const days = { today: 1, '7d': 7, '30d': 30, '90d': 90 }[input.range];
  const from = new Date(now);
  if (input.range === 'today') {
    from.setHours(0, 0, 0, 0);
  } else {
    from.setDate(from.getDate() - days);
  }
  return { from, to: now };
}
