import 'server-only';
import { redis } from '@/lib/redis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** ذاكرة احتياطية داخل العملية إذا تعذّر الوصول إلى Redis */
const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

function memoryLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  bucket.count += 1;
  const allowed = bucket.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: allowed ? 0 : Math.ceil((bucket.resetAt - now) / 1000),
  };
}

/**
 * تحديد المعدل بنافذة ثابتة عبر Redis، مع تدهور لطيف إلى ذاكرة العملية.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const redisKey = `rl:${key}`;
  try {
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.expire(redisKey, windowSeconds);
    const ttl = count > limit ? await redis.ttl(redisKey) : 0;
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: ttl > 0 ? ttl : 0,
    };
  } catch {
    return memoryLimit(key, limit, windowSeconds);
  }
}

/** إعادة تعيين العدّاد — يُستدعى بعد نجاح تسجيل الدخول */
export async function resetRateLimit(key: string): Promise<void> {
  // نمسح المخزنين معاً دائماً: العدّاد قد يكون في الذاكرة إذا تعذّر Redis
  // لحظة تسجيله، ثم عاد Redis للعمل — فمسح أحدهما فقط يترك الحجب سارياً
  memoryBuckets.delete(key);
  try {
    await redis.del(`rl:${key}`);
  } catch {
    // Redis غير متاح — المسح من الذاكرة تم بالفعل أعلاه
  }
}

/**
 * رفع الحجب عن محاولات دخول بريد معيّن، من المخزنين معاً.
 * يُستدعى بعد إعادة تعيين كلمة المرور حتى لا يبقى المستخدم محجوباً.
 */
export async function clearLoginBlock(email: string): Promise<void> {
  await resetRateLimit(`login:email:${email}`);
  for (const key of memoryBuckets.keys()) {
    if (key.startsWith('login:')) memoryBuckets.delete(key);
  }
  try {
    const keys = await redis.keys('rl:login:*');
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // لا شيء إضافي — الذاكرة نُظّفت أعلاه
  }
}

/** حدود جاهزة للعمليات الحساسة */
export const RATE_LIMITS = {
  LOGIN_PER_IP: { limit: 20, window: 15 * 60 },
  LOGIN_PER_EMAIL: { limit: 6, window: 15 * 60 },
  PASSWORD_RESET: { limit: 5, window: 60 * 60 },
  EXTRACTION_RUN: { limit: 30, window: 60 * 60 },
  EXPORT: { limit: 20, window: 60 * 60 },
  MUTATION: { limit: 240, window: 60 },
} as const;
