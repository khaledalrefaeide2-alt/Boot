import { z } from 'zod';
import { optionalString, paginationSchema, requiredString } from './common';
import { entityStatusSchema } from './sources';

export const createKeywordSchema = z.object({
  term: requiredString('الكلمة المفتاحية', 100),
  category: optionalString(60),
  color: optionalString(20),
  weight: z.coerce.number().int().min(1).max(10).default(1),
  status: entityStatusSchema.default('ACTIVE'),
  isAlerting: z.boolean().default(false),
});

export const updateKeywordSchema = createKeywordSchema.partial();

export const createTopicSchema = z.object({
  code: requiredString('رمز التصنيف', 40)
    .regex(/^[a-z0-9_-]+$/, 'الرمز بأحرف لاتينية صغيرة وأرقام وشرطات فقط')
    .transform((value) => value.toLowerCase()),
  name: requiredString('اسم التصنيف', 80),
  description: optionalString(500),
  color: optionalString(20),
  status: entityStatusSchema.default('ACTIVE'),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  /** كلمات القواعد للتصنيف التلقائي المبدئي */
  terms: z.array(z.string().trim().min(2).max(60)).max(200).default([]),
});

export const updateTopicSchema = createTopicSchema.partial().omit({ code: true });

export const updateHashtagSchema = z.object({
  status: entityStatusSchema,
});

export const listTaxonomySchema = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  status: entityStatusSchema.optional(),
});

export const updateSettingsSchema = z.object({
  settings: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(120),
        value: z.unknown(),
      }),
    )
    .min(1)
    .max(50),
});
