import 'server-only';
import { redis } from '@/lib/redis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** ذاكرة احتياطية داخل العملية إذا تعذّر الوصول إلى Redis */
const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

function memoryPeek(key: string, limit: number): RateLimitResult {
  const now = Date.now();
  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    memoryBuckets.delete(key);
    return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
  }
  return {
    allowed: bucket.count < limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: bucket.count >= limit ? Math.ceil((bucket.resetAt - now) / 1000) : 0,
  };
}

function memoryIncrement(key: string, windowSeconds: number): void {
  const now = Date.now();
  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return;
  }
  bucket.count += 1;
}

/**
 * قراءة العدّاد دون زيادته.
 *
 * الفصل بين القراءة والزيادة مقصود: الحد يجب أن يحسب المحاولات الفاشلة وحدها.
 * لو زاد العدّاد مع كل طلب لاستهلك الدخول الناجح نفسه من الحد، ولانحجب
 * المستخدم النظامي بمجرد استخدامه العادي للنظام.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
): Promise<RateLimitResult> {
  const redisKey = `rl:${key}`;
  try {
    const raw = await redis.get(redisKey);
    const count = raw ? Number.parseInt(raw, 10) : 0;
    if (count < limit) {
      return { allowed: true, remaining: limit - count, retryAfterSeconds: 0 };
    }
    const ttl = await redis.ttl(redisKey);
    return { allowed: false, remaining: 0, retryAfterSeconds: ttl > 0 ? ttl : 0 };
  } catch {
    return memoryPeek(key, limit);
  }
}

/** تسجيل محاولة فاشلة — هذه وحدها ما يزيد العدّاد */
export async function recordFailedAttempt(key: string, windowSeconds: number): Promise<void> {
  const redisKey = `rl:${key}`;
  try {
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.expire(redisKey, windowSeconds);
  } catch {
    memoryIncrement(key, windowSeconds);
  }
}

/**
 * فحص وزيادة معاً — للعمليات التي يُحسب فيها كل طلب، مثل حد العمليات
 * المغيّرة وحد التصدير، حيث الطلب نفسه هو المورد المستهلك لا فشله.
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
    memoryIncrement(key, windowSeconds);
    return memoryPeek(key, limit);
  }
}

/** إعادة تعيين عدّاد — يمسح المخزنين معاً دائماً */
export async function resetRateLimit(key: string): Promise<void> {
  memoryBuckets.delete(key);
  try {
    await redis.del(`rl:${key}`);
  } catch {
    // الذاكرة نُظّفت أعلاه
  }
}

/**
 * حدود العمليات الحساسة.
 * حدود الدخول تحسب المحاولات الفاشلة وحدها، ولذلك جُعلت أوسع: المستخدم
 * الذي يتذكر كلمة مروره لا يقترب منها إطلاقاً، ومن يخمّنها يُحجب سريعاً.
 */
export const RATE_LIMITS = {
  LOGIN_PER_IP: { limit: 50, window: 15 * 60 },
  LOGIN_PER_EMAIL: { limit: 10, window: 15 * 60 },
  PASSWORD_RESET: { limit: 5, window: 60 * 60 },
  EXTRACTION_RUN: { limit: 30, window: 60 * 60 },
  EXPORT: { limit: 20, window: 60 * 60 },
  MUTATION: { limit: 240, window: 60 },
} as const;
