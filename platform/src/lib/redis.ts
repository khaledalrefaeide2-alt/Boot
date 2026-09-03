import 'server-only';
import Redis from 'ioredis';
import { env } from './env';

/**
 * اتصال Redis مشترك للتخزين المؤقت وتحديد المعدل.
 * طوابير BullMQ تنشئ اتصالاتها الخاصة (تتطلب maxRetriesPerRequest = null).
 */
const globalForRedis = globalThis as unknown as { redis: Redis | undefined };

function createRedis(): Redis {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    lazyConnect: false,
    enableOfflineQueue: true,
    retryStrategy: (times) => Math.min(times * 200, 3000),
  });
  client.on('error', (err) => {
    // لا نُسقط التطبيق بسبب Redis — الوظائف المعتمدة عليه تتدهور بلطف
    console.error('[redis] خطأ في الاتصال:', err.message);
  });
  return client;
}

export const redis = globalForRedis.redis ?? createRedis();

if (env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}

/** إعدادات اتصال BullMQ — يتطلب maxRetriesPerRequest = null */
export const bullConnection = {
  url: env.REDIS_URL,
  maxRetriesPerRequest: null,
} as const;

/** هل Redis متاح فعلياً الآن؟ تُستخدم للتدهور اللطيف. */
export async function isRedisReady(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
