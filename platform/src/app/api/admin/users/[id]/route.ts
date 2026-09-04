import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import {
  errors,
  guardMutationRate,
  jsonError,
  jsonOk,
  parseBody,
  requireCsrf,
  requirePermission,
} from '@/lib/api';
import { PERMISSIONS, assignableRoles, canManageUserWithRole } from '@/lib/auth/rbac';
import { updateUserSchema } from '@/lib/validation/users';
import { revokeAllSessions } from '@/lib/auth/session';
import { resetRateLimit } from '@/lib/rate-limit';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission(PERMISSIONS.USERS_VIEW);
    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        jobTitle: true,
        phone: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        approvedAt: true,
        disabledAt: true,
        mustChangePassword: true,
        failedLoginCount: true,
        createdBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
      },
    });
    if (!user) throw errors.notFound('المستخدم غير موجود');

    return jsonOk({ user });
  } catch (error) {
    return jsonError(error);
  }
}

/** تعديل مستخدم: الاسم، الدور، الحالة، بيانات الاتصال */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const actor = await requirePermission(PERMISSIONS.USERS_UPDATE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const { id } = await params;
    const input = await parseBody(request, updateUserSchema);

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, status: true },
    });
    if (!target) throw errors.notFound('المستخدم غير موجود');

    // لا يُعدَّل مستخدم في رتبة أعلى أو مساوية إلا من المالك
    if (!canManageUserWithRole(actor.role, target.role) && actor.id !== target.id) {
      throw errors.forbidden('لا تملك صلاحية التعديل على هذا المستخدم');
    }

    if (input.role && input.role !== target.role) {
      if (!assignableRoles(actor.role).includes(input.role)) {
        throw errors.forbidden('لا تملك صلاحية إسناد هذا الدور');
      }
      // منع فقدان آخر مالك للنظام
      if (target.role === 'OWNER') {
        const owners = await prisma.user.count({ where: { role: 'OWNER', status: 'ACTIVE' } });
        if (owners <= 1) throw errors.badRequest('لا يمكن تغيير دور آخر مالك للمنصة');
      }
    }

    if (input.status === 'DISABLED' && target.role === 'OWNER') {
      const owners = await prisma.user.count({ where: { role: 'OWNER', status: 'ACTIVE' } });
      if (owners <= 1) throw errors.badRequest('لا يمكن تعطيل آخر مالك للمنصة');
    }

    const statusChanged = input.status && input.status !== target.status;

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.status !== undefined
          ? {
              status: input.status,
              approvedAt: input.status === 'ACTIVE' ? new Date() : undefined,
              approvedById: input.status === 'ACTIVE' ? actor.id : undefined,
              disabledAt: input.status === 'DISABLED' ? new Date() : null,
              // تفعيل الحساب يرفع عنه قفل المحاولات الفاشلة
              ...(input.status === 'ACTIVE' ? { failedLoginCount: 0, lockedUntil: null } : {}),
            }
          : {}),
      },
      select: { id: true, name: true, email: true, role: true, status: true },
    });

    // تعطيل المستخدم يُنهي جلساته فوراً
    if (input.status === 'DISABLED') await revokeAllSessions(id);

    // تفعيل الحساب يرفع عدّاد المحاولات الفاشلة كذلك، وإلا بقي محجوباً بعد التفعيل
    if (input.status === 'ACTIVE') await resetRateLimit(`login:email:${target.email}`);

    if (input.role && input.role !== target.role) {
      await audit(actor, {
        action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
        entityType: 'user',
        entityId: id,
        summary: `تغيير دور ${target.name} من ${target.role} إلى ${input.role}`,
        metadata: { from: target.role, to: input.role },
      });
    }

    if (statusChanged) {
      const action =
        input.status === 'DISABLED'
          ? AUDIT_ACTIONS.USER_DISABLED
          : target.status === 'PENDING'
            ? AUDIT_ACTIONS.USER_APPROVED
            : AUDIT_ACTIONS.USER_ENABLED;
      await audit(actor, {
        action,
        entityType: 'user',
        entityId: id,
        summary: `تغيير حالة ${target.name} إلى ${input.status}`,
        metadata: { from: target.status, to: input.status },
      });
    }

    if (!statusChanged && !input.role) {
      await audit(actor, {
        action: AUDIT_ACTIONS.USER_UPDATED,
        entityType: 'user',
        entityId: id,
        summary: `تعديل بيانات ${target.name}`,
      });
    }

    return jsonOk({ user });
  } catch (error) {
    return jsonError(error);
  }
}
