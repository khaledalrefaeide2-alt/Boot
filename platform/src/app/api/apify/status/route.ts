import { jsonError, jsonOk, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { isApifyConfigured, verifyApifyToken } from '@/lib/apify/client';
import { isRedisReady } from '@/lib/redis';
import { prisma } from '@/lib/db';

/**
 * حالة التكاملات — تُستخدم في لوحة الإدارة.
 * لا تكشف قيمة الرمز إطلاقاً، فقط ما إذا كان معرّفاً وصالحاً.
 */
export async function GET() {
  try {
    await requirePermission(PERMISSIONS.EXTRACTION_VIEW);

    const [apify, redisReady, activeRuns] = await Promise.all([
      isApifyConfigured() ? verifyApifyToken() : Promise.resolve({ ok: false, message: 'رمز Apify غير معرّف في متغيرات البيئة' }),
      isRedisReady(),
      prisma.extractionRun.count({ where: { status: { in: ['PENDING', 'RUNNING'] } } }),
    ]);

    return jsonOk({
      apify: { configured: isApifyConfigured(), ok: apify.ok, message: apify.message, username: 'username' in apify ? apify.username : undefined },
      queue: { ready: redisReady, message: redisReady ? 'الطابور متصل' : 'Redis غير متاح — الجدولة والتشغيل الخلفي معطّلان' },
      activeRuns,
    });
  } catch (error) {
    return jsonError(error);
  }
}
