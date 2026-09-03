import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { errors, jsonError, jsonOk, parseBody, requireAuth, requireCsrf } from '@/lib/api';
import { changePasswordSchema } from '@/lib/validation/auth';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { revokeAllSessions, createSession } from '@/lib/auth/session';
import { audit, AUDIT_ACTIONS, requestMeta } from '@/lib/audit';

/** تغيير كلمة المرور — يُبطل كل الجلسات الأخرى ويُنشئ جلسة جديدة للمستخدم */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    await requireCsrf();

    const input = await parseBody(request, changePasswordSchema);

    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    const valid = await verifyPassword(input.currentPassword, record?.passwordHash ?? null);
    if (!valid) throw errors.badRequest('كلمة المرور الحالية غير صحيحة');

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.password), mustChangePassword: false },
    });

    await revokeAllSessions(user.id);
    await createSession(user.id, await requestMeta());

    await audit(user, {
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      entityType: 'user',
      entityId: user.id,
      summary: 'تغيير كلمة المرور وإبطال الجلسات الأخرى',
    });

    return jsonOk({ message: 'غُيّرت كلمة المرور وأُبطلت جلساتك الأخرى' });
  } catch (error) {
    return jsonError(error);
  }
}
