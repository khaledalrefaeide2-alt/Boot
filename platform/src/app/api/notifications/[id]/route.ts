import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { errors, jsonError, jsonOk, requireAuth, requireCsrf } from '@/lib/api';
import { getAccountScope } from '@/lib/auth/account-scope';

type Params = { params: Promise<{ id: string }> };

/** تعليم تنبيه كمقروء */
export async function PATCH(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth();
    await requireCsrf();
    const { id } = await params;

    const notification = await prisma.notification.findUnique({
      where: { id },
      select: { id: true, userId: true, role: true },
    });
    if (!notification) throw errors.notFound('التنبيه غير موجود');

    // لا يُعلَّم إلا تنبيه يقع ضمن جمهور المستخدم، وجمهور المقيّد بحسابات
    // بعينها هو ما وُجّه إليه شخصياً وحده — كما في قائمة التنبيهات تماماً.
    const scope = await getAccountScope();
    const isMine =
      notification.userId === user.id ||
      (scope === null && notification.role === user.role);
    if (!isMine) throw errors.notFound('التنبيه غير موجود');

    await prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });

    return jsonOk({ read: true });
  } catch (error) {
    return jsonError(error);
  }
}
