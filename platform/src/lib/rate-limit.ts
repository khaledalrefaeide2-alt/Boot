import 'server-only';
import { getRedis } from '@/lib/redis';

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
  const redis = getRedis();
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

/*
 * الزيادة والمهلة جملةٌ واحدة على الخادم.
 *
 * ★ كانتا أمرين: `INCR` ثمّ `EXPIRE` إن كان العدّ واحداً.
 *
 *   فإن انقطع الاتصال أو أُعيد تشغيل التطبيق بينهما بقي المفتاح بلا مهلة —
 *   عدّاداً لا يُمحى أبداً. ومفتاح «الدخول لهذا البريد» بلا مهلة يعني
 *   صاحبه محجوباً إلى الأبد، ولا يرفعه إلا من يدخل Redis بيده.
 *
 *   والنصّ هنا يجعلها ذرّية، ويُصلح فوق ذلك أيّ مفتاحٍ قديم بقي بلا مهلة:
 *   كلّ زيادة تفحص المهلة وتضعها إن غابت.
 */
const INCR_WITH_TTL = `
local count = redis.call('INCR', KEYS[1])
if redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

async function incrementWithTtl(redisKey: string, windowSeconds: number): Promise<number> {
  const result = await getRedis().eval(INCR_WITH_TTL, 1, redisKey, String(windowSeconds));
  return Number(result);
}

/** تسجيل محاولة فاشلة — هذه وحدها ما يزيد العدّاد */
export async function recordFailedAttempt(key: string, windowSeconds: number): Promise<void> {
  try {
    await incrementWithTtl(`rl:${key}`, windowSeconds);
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
    const count = await incrementWithTtl(redisKey, windowSeconds);
    const ttl = count > limit ? await getRedis().ttl(redisKey) : 0;
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
    await getRedis().del(`rl:${key}`);
  } catch {
    // الذاكرة نُظّفت أعلاه
  }
}

/** محارف أنماط Redis تُهرَّب — البريد قد يحمل `*` أو `?` نظاماً */
function escapeGlob(value: string): string {
  return value.replace(/[*?[\]\\]/g, '\\$&');
}

/**
 * إعادة تعيين كلّ عدّادٍ يبدأ مفتاحه بهذه البادئة.
 *
 * لعدّادات «البريد من هذا العنوان»: عددها بعدد العناوين التي جُرّب منها،
 * ولا يُعرف أيّها حين يرفع المدير الحجب عن مستخدم.
 */
export async function resetRateLimitPrefix(prefix: string): Promise<void> {
  for (const key of [...memoryBuckets.keys()]) {
    if (key.startsWith(prefix)) memoryBuckets.delete(key);
  }
  try {
    const redis = getRedis();
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `rl:${escapeGlob(prefix)}*`, 'COUNT', 200);
      cursor = next;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== '0');
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
  /*
   * ★ حدّ البريد وحده كان عشراً، وكان يكفي لقفل أيّ حسابٍ عن بُعد.
   *
   *   عشر محاولاتٍ خاطئة من أيّ مكان — ولو من عشرة عناوين — كانت تحجب
   *   صاحب الحساب **وهو يُدخل كلمته الصحيحة**، والمالكُ أوّلهم. ويُجدَّد
   *   الحجب كلّ ربع ساعة بعشر محاولات أخرى، بلا جلسة ولا صلاحية.
   *
   *   فصار الحدّ ثلاث طبقات:
   *   - البريد من العنوان نفسه: عشر — يوقف من يخمّن من مكانٍ واحد.
   *   - البريد من كلّ مكان: ثلاثون — يوقف التخمين الموزَّع.
   *   - والجهاز الموثوق (دخل منه صاحب الحساب قبلاً) لا يمسّه الحدّان،
   *     وله عدّاده الخاص. فلا يستطيع خصمٌ أن يحجب موظّفاً عن متصفّحه.
   */
  LOGIN_PER_EMAIL_IP: { limit: 10, window: 15 * 60 },
  LOGIN_PER_EMAIL: { limit: 30, window: 15 * 60 },
  LOGIN_PER_DEVICE: { limit: 10, window: 15 * 60 },
  /* تخمين كلمة المرور الحالية من جلسةٍ مسروقة — يُحصى الفشل وحده */
  PASSWORD_CHANGE: { limit: 5, window: 15 * 60 },
  PASSWORD_RESET: { limit: 5, window: 60 * 60 },
  /*
   * السقف هنا احتياطيّ فقط: الرقم الفعليّ يُقرأ من الإعداد
   * extraction.hourlyLimit (و0 = بلا سقف). والمستعمَل من هذا المدخل هو
   * النافذة: طول الساعة التي يُحسب العدّ ضمنها.
   */
  EXTRACTION_RUN: { limit: 30, window: 60 * 60 },
  EXPORT: { limit: 20, window: 60 * 60 },
  /* المساعد يستهلك رصيداً خارجياً بكل سؤال، فالحدّ عليه أضيق من حدّ التعديل */
  ASSISTANT: { limit: 40, window: 60 * 60 },
  MUTATION: { limit: 240, window: 60 },
} as const;
