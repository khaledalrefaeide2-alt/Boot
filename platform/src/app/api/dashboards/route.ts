import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import {
  errors,
  jsonError,
  jsonOk,
  parseBody,
  requireCsrf,
  requirePermission,
} from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { requiredString } from '@/lib/validation/common';

const createSchema = z.object({
  name: requiredString('اسم اللوحة', 80),
  description: z.string().trim().max(300).optional().nullable(),
  filters: z.record(z.string(), z.unknown()),
  isDefault: z.boolean().default(false),
});

/** اللوحات المحفوظة الخاصة بالمستخدم الحالي فقط */
export async function GET() {
  try {
    const user = await requirePermission(PERMISSIONS.DASHBOARDS_SAVE);
    const dashboards = await prisma.savedDashboard.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return jsonOk({ dashboards });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(PERMISSIONS.DASHBOARDS_SAVE);
    await requireCsrf();

    const input = await parseBody(request, createSchema);

    const existing = await prisma.savedDashboard.findUnique({
      where: { userId_name: { userId: user.id, name: input.name } },
      select: { id: true },
    });
    if (existing) throw errors.conflict('لديك لوحة محفوظة بهذا الاسم');

    // لوحة افتراضية واحدة فقط لكل مستخدم
    if (input.isDefault) {
      await prisma.savedDashboard.updateMany({
        where: { userId: user.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const dashboard = await prisma.savedDashboard.create({
      data: {
        userId: user.id,
        name: input.name,
        description: input.description ?? null,
        filters: input.filters as never,
        isDefault: input.isDefault,
      },
    });

    return jsonOk({ dashboard }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
