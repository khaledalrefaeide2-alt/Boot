import 'server-only';
import { z } from 'zod';

/**
 * التحقق من متغيرات البيئة عند الإقلاع — يفشل التطبيق مبكراً بدل أن يفشل أثناء الاستخدام.
 * هذا الملف خادمي بحت ولا يجوز استيراده في أي مكوّن عميل.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL مطلوب'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET يجب ألا يقل عن 32 محرفاً'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().max(90).default(7),
  APP_URL: z.string().min(1).default('http://localhost:3000'),

  APIFY_TOKEN: z.string().default(''),
  APIFY_API_BASE: z.string().default('https://api.apify.com/v2'),
  APIFY_MAX_ITEMS_HARD_CAP: z.coerce.number().int().positive().default(1000),
  APIFY_RUN_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(900),

  SEED_OWNER_EMAIL: z.string().email().optional(),
  SEED_OWNER_NAME: z.string().optional(),
  SEED_OWNER_PASSWORD: z.string().optional(),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`إعدادات البيئة غير صالحة:\n${issues}`);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
