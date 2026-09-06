import { jsonError, jsonOk, requireAuth, requireCsrf } from '@/lib/api';
import { prisma } from '@/lib/db';
import { getAccountScope } from '@/lib/auth/account-scope';
import { notificationAudience } from '@/lib/notifications';

/** تعليم كل تنبيهات المستخدم كمقروءة */
export async function POST() {
  try {
    const user = await requireAuth();
    await requireCsrf();

    const result = await prisma.notification.updateMany({
      where: { ...notificationAudience(user.id, user.role, await getAccountScope()), isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    return jsonOk({ updated: result.count });
  } catch (error) {
    return jsonError(error);
  }
}
