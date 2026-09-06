import { jsonError, jsonOk, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { isApifyConfigured, verifyApifyToken } from '@/lib/apify/client';
import { getQueueHealth } from '@/lib/queue';
import { prisma } from '@/lib/db';

/**
 * حالة التكاملات — تُستخدم في لوحة الإدارة.
 * لا تكشف قيمة الرمز إطلاقاً، فقط ما إذا كان معرّفاً وصالحاً.
 */
export async function GET() {
  try {
    await requirePermission(PERMISSIONS.EXTRACTION_VIEW);

    const [apify, queue, activeRuns] = await Promise.all([
      isApifyConfigured() ? verifyApifyToken() : Promise.resolve({ ok: false, message: 'رمز Apify غير معرّف في متغيرات البيئة' }),
      getQueueHealth(),
      prisma.extractionRun.count({ where: { status: { in: ['PENDING', 'RUNNING'] } } }),
    ]);

    return jsonOk({
      apify: { configured: isApifyConfigured(), ok: apify.ok, message: apify.message, username: 'username' in apify ? apify.username : undefined },
      queue: {
        // «جاهز» تعني أن المهمة تُضاف وتُسحب معاً، لا أن Redis يردّ فقط
        ready: queue.redisReady && (!queue.workersKnown || queue.workers > 0),
        redisReady: queue.redisReady,
        workers: queue.workers,
        workersKnown: queue.workersKnown,
        waiting: queue.waiting,
        active: queue.active,
        message: !queue.redisReady
          ? 'Redis غير متاح — الجدولة والتشغيل الخلفي معطّلان'
          : queue.workersKnown && queue.workers === 0
            ? 'Redis متصل لكن لا يوجد عامل خلفي يسحب المهام — العمليات ستبقى بانتظار التشغيل'
            : 'الطابور متصل والعامل الخلفي يسحب المهام',
      },
      activeRuns,
    });
  } catch (error) {
    return jsonError(error);
  }
}
