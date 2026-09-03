import { jsonError, jsonOk, requireAuth, requireCsrf } from '@/lib/api';
import { prisma } from '@/lib/db';

/** تعليم كل تنبيهات المستخدم كمقروءة */
export async function POST() {
  try {
    const user = await requireAuth();
    await requireCsrf();

    const result = await prisma.notification.updateMany({
      where: { OR: [{ userId: user.id }, { role: user.role }], isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    return jsonOk({ updated: result.count });
  } catch (error) {
    return jsonError(error);
  }
}
