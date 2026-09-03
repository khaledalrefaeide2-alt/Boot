import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { errors, guardMutationRate, jsonError, jsonOk, requireCsrf, requirePermission } from '@/lib/api';
import { PERMISSIONS, canManageUserWithRole } from '@/lib/auth/rbac';
import { generateToken, hashToken } from '@/lib/auth/password';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

const TOKEN_TTL_MINUTES = 60;

/**
 * توليد رابط استعادة كلمة مرور يسلّمه المدير للمستخدم بقناة موثوقة.
 * يُعرض الرابط مرة واحدة فقط ولا يُخزَّن الرمز الخام في القاعدة.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const actor = await requirePermission(PERMISSIONS.USERS_UPDATE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const { id } = await params;
    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, status: true },
    });
    if (!target) throw errors.notFound('المستخدم غير موجود');
    if (!canManageUserWithRole(actor.role, target.role)) {
      throw errors.forbidden('لا تملك صلاحية إعادة تعيين كلمة مرور هذا المستخدم');
    }

    const token = generateToken(32);
    await prisma.$transaction([
      // إبطال أي روابط سابقة لم تُستخدم
      prisma.passwordResetToken.updateMany({
        where: { userId: id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.passwordResetToken.create({
        data: {
          userId: id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000),
        },
      }),
      prisma.user.update({ where: { id }, data: { mustChangePassword: true } }),
    ]);

    await audit(actor, {
      action: AUDIT_ACTIONS.USER_PASSWORD_RESET_BY_ADMIN,
      entityType: 'user',
      entityId: id,
      summary: `توليد رابط استعادة كلمة مرور للمستخدم ${target.name}`,
    });

    return jsonOk({
      resetPath: `/reset-password?token=${token}`,
      expiresInMinutes: TOKEN_TTL_MINUTES,
    });
  } catch (error) {
    return jsonError(error);
  }
}
