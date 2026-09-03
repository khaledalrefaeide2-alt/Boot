import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import {
  errors,
  guardMutationRate,
  jsonError,
  jsonOk,
  parseBody,
  parseQuery,
  requireCsrf,
  requirePermission,
} from '@/lib/api';
import { PERMISSIONS, assignableRoles } from '@/lib/auth/rbac';
import { createUserSchema, listUsersSchema } from '@/lib/validation/users';
import { hashPassword } from '@/lib/auth/password';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import type { Prisma } from '@/generated/prisma';

/** قائمة المستخدمين مع البحث والفلترة */
export async function GET(request: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.USERS_VIEW);
    const query = parseQuery(request, listUsersSchema);

    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
              { jobTitle: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, users, pendingCount] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { [query.sort]: query.order },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
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
          approvedAt: true,
          mustChangePassword: true,
        },
      }),
      prisma.user.count({ where: { status: 'PENDING' } }),
    ]);

    return jsonOk({ users, total, page: query.page, pageSize: query.pageSize, pendingCount });
  } catch (error) {
    return jsonError(error);
  }
}

/** إنشاء مستخدم يدوياً — لا يوجد تسجيل ذاتي في النظام */
export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermission(PERMISSIONS.USERS_CREATE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const input = await parseBody(request, createUserSchema);

    if (!assignableRoles(actor.role).includes(input.role)) {
      throw errors.forbidden('لا تملك صلاحية إسناد هذا الدور');
    }

    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw errors.conflict('البريد الإلكتروني مسجل مسبقاً');

    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: await hashPassword(input.password),
        role: input.role,
        status: input.status,
        jobTitle: input.jobTitle,
        phone: input.phone,
        mustChangePassword: input.mustChangePassword,
        createdById: actor.id,
        approvedAt: input.status === 'ACTIVE' ? new Date() : null,
        approvedById: input.status === 'ACTIVE' ? actor.id : null,
      },
      select: { id: true, email: true, name: true, role: true, status: true },
    });

    await audit(actor, {
      action: AUDIT_ACTIONS.USER_CREATED,
      entityType: 'user',
      entityId: user.id,
      summary: `إنشاء المستخدم ${user.name} بدور ${user.role}`,
      metadata: { email: user.email, role: user.role, status: user.status },
    });

    return jsonOk({ user }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
