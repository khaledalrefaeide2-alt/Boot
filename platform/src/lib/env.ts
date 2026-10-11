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
  /**
   * عناوين إضافية يُقبل منها الطلب، مفصولة بفواصل.
   * تُستعمل للوصول من أجهزة أخرى على الشبكة المحلية (الجوال مثلاً)، إذ
   * يرسل المتصفح عنوان الخادم على الشبكة لا localhost، فيرفضه فحص المصدر.
   * قائمة صريحة لا حرف بدل: كل عنوان يُضاف قرار واعٍ يُراجَع لاحقاً.
   */
  APP_ALLOWED_ORIGINS: z.string().default(''),

  /**
   * عددُ الوكلاء الموثوقين أمام التطبيق.
   *
   * ★ منه يُعرف عنوانُ العميل الحقيقي، وهو ليس تفصيلاً تشغيلياً.
   *
   *   ترويسة `X-Forwarded-For` قائمةٌ يُضيف إليها كلّ وكيل عنوانَ من
   *   خاطبه. فإن أرسل المهاجم `X-Forwarded-For: 1.2.3.4` ثمّ أضاف Caddy
   *   عنوانَه الحقيقي، صارت `1.2.3.4, <الحقيقي>` — وقراءةُ **أوّلها**
   *   تعني أخذَ ما كتبه المهاجم بيده.
   *
   *   وثمنُ ذلك أنّ حدّ محاولات الدخول لكلّ عنوان يسقط كلّه: يبدّل
   *   المهاجم الترويسة كلّ طلب فلا يبلغ الحدّ أبداً. ويُسجَّل في سجلّ
   *   التدقيق عنوانٌ من اختياره، فيضيع أثرُه ويُتَّهم بريء.
   *
   *   والصحيح العدّ من آخر القائمة: الواحد يعني «وكيلٌ واحد بيننا وبين
   *   العميل» — وهو حالُ هذا النشر (Caddy وحده). ومن وضع شبكة توصيل
   *   أمامه يرفعه إلى اثنين.
   *
   *   وصفرٌ يعني «لا وكيل»: تُتجاهل الترويسة كلّها ويُعتمد العنوان
   *   المباشر — وهو الصحيح لمن يُعرّض التطبيق بلا وكيل.
   */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),

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
