import { z } from 'zod';
import { emailSchema, optionalString, paginationSchema, passwordSchema, requiredString } from './common';

export const roleSchema = z.enum(['OWNER', 'ADMIN', 'SUPERVISOR', 'VIEWER']);
export const userStatusSchema = z.enum(['PENDING', 'ACTIVE', 'DISABLED']);

export const createUserSchema = z.object({
  email: emailSchema,
  name: requiredString('الاسم', 120),
  password: passwordSchema,
  role: roleSchema.default('VIEWER'),
  status: userStatusSchema.default('ACTIVE'),
  jobTitle: optionalString(120),
  phone: optionalString(40),
  mustChangePassword: z.boolean().default(true),
});

export const updateUserSchema = z.object({
  name: requiredString('الاسم', 120).optional(),
  role: roleSchema.optional(),
  status: userStatusSchema.optional(),
  jobTitle: optionalString(120).optional(),
  phone: optionalString(40).optional(),
});

export const listUsersSchema = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  role: roleSchema.optional(),
  status: userStatusSchema.optional(),
  sort: z.enum(['createdAt', 'name', 'lastLoginAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersInput = z.infer<typeof listUsersSchema>;
