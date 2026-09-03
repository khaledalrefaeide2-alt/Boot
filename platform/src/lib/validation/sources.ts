import { z } from 'zod';
import { optionalString, paginationSchema, requiredString, urlSchema } from './common';

export const entityStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

/** معرّف Apify Actor: username~actor-name أو معرّف قصير */
export const actorIdSchema = z
  .string()
  .trim()
  .max(120, 'معرّف الـ Actor أطول من الحد المسموح')
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._~-]*(~[A-Za-z0-9][A-Za-z0-9._-]*)?$/,
    'صيغة معرّف الـ Actor غير صحيحة — مثال: apify~facebook-posts-scraper',
  );

// ============================ المنصات ============================

export const createPlatformSchema = z.object({
  code: requiredString('رمز المنصة', 40)
    .regex(/^[a-z0-9_-]+$/, 'الرمز بأحرف لاتينية صغيرة وأرقام وشرطات فقط')
    .transform((value) => value.toLowerCase()),
  name: requiredString('اسم المنصة', 80),
  icon: optionalString(40),
  color: optionalString(20),
  status: entityStatusSchema.default('ACTIVE'),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  defaultActorId: actorIdSchema.optional().or(z.literal('')).transform((v) => v || null),
  defaultActorInput: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const updatePlatformSchema = createPlatformSchema.partial().omit({ code: true });

// ============================ الحسابات ============================

export const accountTypeSchema = z.enum(['PAGE', 'PROFILE', 'GROUP', 'CHANNEL', 'OTHER']);
export const accountOwnershipSchema = z.enum(['OWNED', 'EXTERNAL']);
export const accountVisibilitySchema = z.enum(['PUBLIC', 'PRIVATE']);

export const createAccountSchema = z.object({
  platformId: requiredString('المنصة', 64),
  name: requiredString('اسم الحساب', 160),
  username: optionalString(120),
  url: urlSchema,
  externalId: optionalString(120),
  type: accountTypeSchema.default('PAGE'),
  ownership: accountOwnershipSchema.default('EXTERNAL'),
  visibility: accountVisibilitySchema.default('PUBLIC'),
  language: optionalString(10),
  country: optionalString(80),
  status: entityStatusSchema.default('ACTIVE'),
  isActive: z.boolean().default(true),
  extractionWindowDays: z.coerce.number().int().min(1).max(365).default(30),
  extractionIntervalMinutes: z.coerce.number().int().min(0).max(10080).default(0),
  maxItemsPerRun: z.coerce.number().int().min(1).max(1000).default(100),
  actorIdOverride: actorIdSchema.optional().or(z.literal('')).transform((v) => v || null),
  followersCount: z.coerce.number().int().min(0).nullable().optional(),
  notes: optionalString(1000),
  keywordIds: z.array(z.string().trim().max(64)).max(100).default([]),
});

export const updateAccountSchema = createAccountSchema.partial();

export const listAccountsSchema = paginationSchema.extend({
  q: z.string().trim().max(160).optional(),
  platformId: z.string().trim().max(64).optional(),
  status: entityStatusSchema.optional(),
  ownership: accountOwnershipSchema.optional(),
  type: accountTypeSchema.optional(),
  isActive: z.enum(['true', 'false']).optional(),
  sort: z.enum(['createdAt', 'name', 'lastExtractedAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type CreatePlatformInput = z.infer<typeof createPlatformSchema>;
