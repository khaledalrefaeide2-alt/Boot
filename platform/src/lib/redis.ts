import 'server-only';
import Redis from 'ioredis';
import { env } from './env';

/**
 * اتصال Redis مشترك للتخزين المؤقت وتحديد المعدل.
 * طوابير BullMQ تنشئ اتصالاتها الخاصة (تتطلب maxRetriesPerRequest = null).
 *
 * ★ لا اتصال عند استيراد هذا الملف — ولا حتى إنشاء عميل.
 *
 * السبب ليس أناقة: `next build` يستورد كل وحدة مسار ليقرأ إعداداتها، ثم
 * يستوردها من جديد في كل عملية عامل أثناء توليد الصفحات. فلو أنشأ الاستيراد
 * عميلاً متصلاً، لحاول البناء الاتصال بـ Redis غير موجود أصلاً في بيئة
 * البناء، ولفتح كل عامل حلقة إعادة محاولة تبقى حيّة إلى آخر البناء. وأثره
 * المرئي سطور «[redis] خطأ في الاتصال» تملأ سجل النشر، وأثره الخفي عمليات
 * لا تنتهي ومقابس تُفتح بلا داع بينما الذاكرة عند حدّها.
 *
 * فالعميل يُنشأ عند أول استعمال فعلي (طلب حقيقي)، لا عند تحميل الوحدة.
 */
const globalForRedis = globalThis as unknown as { redis: Redis | undefined };

function createRedis(): Redis {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    // حزام أمان ثانٍ: حتى لو أُنشئ العميل في مسار لا يستعمله، لا يُفتح مقبس
    // إلا مع أول أمر فعلي.
    lazyConnect: true,
    enableOfflineQueue: true,
    retryStrategy: (times) => Math.min(times * 200, 3000),
  });
  client.on('error', (err) => {
    // لا نُسقط التطبيق بسبب Redis — الوظائف المعتمدة عليه تتدهور بلطف
    console.error('[redis] خطأ في الاتصال:', err.message);
  });
  return client;
}

/**
 * العميل المشترك — يُنشأ عند أول نداء لا عند الاستيراد.
 *
 * محفوظ على globalThis لا في متغيّر وحدة: في التطوير تُعاد الوحدات تحميلاً مع
 * كل تعديل، فمتغيّر الوحدة يُنشئ عميلاً جديداً في كل مرة حتى تتراكم الاتصالات
 * ويرفض الخادم المزيد. وفي الإنتاج الوحدة تُحمَّل مرة واحدة فلا فرق.
 */
export function getRedis(): Redis {
  globalForRedis.redis ??= createRedis();
  return globalForRedis.redis;
}

/** إعدادات اتصال BullMQ — يتطلب maxRetriesPerRequest = null */
export const bullConnection = {
  url: env.REDIS_URL,
  maxRetriesPerRequest: null,
} as const;

/** هل Redis متاح فعلياً الآن؟ تُستخدم للتدهور اللطيف. */
export async function isRedisReady(): Promise<boolean> {
  try {
    const pong = await getRedis().ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
