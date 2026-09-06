import type { NextRequest } from 'next/server';
import { z } from 'zod';
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
import { PERMISSIONS, canManageUserWithRole } from '@/lib/auth/rbac';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

const scopeSchema = z
  .object({
    accountAccess: z.enum(['ALL', 'ASSIGNED']),
    accountIds: z.array(z.string().trim().min(1).max(64)).max(500).default([]),
  })
  /*
   * نطاق مقيّد بلا حساب واحد يعني مستخدماً لا يرى شيئاً. هذا وضع صالح في
   * طبقة الاستعلام ومقصود فيها، لكن الوصول إليه من الشاشة يكون غالباً سهواً
   * لا قصداً، فيُرفض هنا ويُطلب اختيار حساب أو العودة إلى «كل الحسابات».
   */
  .refine((value) => value.accountAccess === 'ALL' || value.accountIds.length > 0, {
    path: ['accountIds'],
    message: 'اختر حساباً واحداً على الأقل، أو امنح المستخدم كل الحسابات',
  });

/** نطاق المستخدم الحالي مع قائمة الحسابات المتاحة للإسناد */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission(PERMISSIONS.USERS_VIEW);
    const { id } = await params;

    const [user, accounts] = await Promise.all([
      prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          role: true,
          accountAccess: true,
          accountAssignments: { select: { accountId: true } },
        },
      }),
      prisma.account.findMany({
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          status: true,
          platform: { select: { id: true, name: true } },
        },
      }),
    ]);
    if (!user) throw errors.notFound('المستخدم غير موجود');

    return jsonOk({
      accountAccess: user.accountAccess,
      accountIds: user.accountAssignments.map((row) => row.accountId),
      accounts,
    });
  } catch (error) {
    return jsonError(error);
  }
}

/** استبدال نطاق المستخدم بالكامل */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const actor = await requirePermission(PERMISSIONS.USERS_ROLES);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const { id } = await params;
    const input = await parseBody(request, scopeSchema);

    const target = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        role: true,
        accountAccess: true,
        accountAssignments: { select: { accountId: true } },
      },
    });
    if (!target) throw errors.notFound('المستخدم غير موجود');

    // نفس قاعدة تعديل المستخدم: لا يُقيَّد من هو في رتبة أعلى أو مساوية
    if (!canManageUserWithRole(actor.role, target.role)) {
      throw errors.forbidden('لا تملك صلاحية تعديل نطاق هذا المستخدم');
    }

    /*
     * تقييد النفس يقطع الطريق على من يملك رفع القيد: لو حصر مدير نطاقه
     * بحسابين ثم أغلق عليه، لا يبقى في الشاشة ما يعيده. فيُمنع صراحةً.
     */
    if (actor.id === target.id && input.accountAccess === 'ASSIGNED') {
      throw errors.badRequest('لا يمكنك تقييد نطاق حسابك أنت');
    }

    const accountIds = input.accountAccess === 'ASSIGNED' ? [...new Set(input.accountIds)] : [];

    if (accountIds.length > 0) {
      const found = await prisma.account.count({ where: { id: { in: accountIds } } });
      if (found !== accountIds.length) throw errors.badRequest('بعض الحسابات المختارة غير موجودة');
    }

    /*
     * الاستبدال ذرّي: لو نجح الحذف وفشل الإدراج خارج المعاملة لبقي المستخدم
     * مقيّداً بلا حساب واحد — أي بلا بيانات أصلاً.
     */
    await prisma.$transaction([
      prisma.userAccount.deleteMany({ where: { userId: id } }),
      ...(accountIds.length > 0
        ? [
            prisma.userAccount.createMany({
              data: accountIds.map((accountId) => ({ userId: id, accountId })),
            }),
          ]
        : []),
      prisma.user.update({ where: { id }, data: { accountAccess: input.accountAccess } }),
    ]);

    const previous = target.accountAssignments.map((row) => row.accountId);
    await audit(actor, {
      action: AUDIT_ACTIONS.USER_SCOPE_CHANGED,
      entityType: 'user',
      entityId: id,
      summary:
        input.accountAccess === 'ALL'
          ? `منح ${target.name} الوصول إلى كل الحسابات`
          : `حصر ${target.name} في ${accountIds.length} من الحسابات`,
      metadata: {
        from: { accountAccess: target.accountAccess, accountIds: previous },
        to: { accountAccess: input.accountAccess, accountIds },
      },
    });

    return jsonOk({ accountAccess: input.accountAccess, accountIds });
  } catch (error) {
    return jsonError(error);
  }
}
