import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { errors, jsonError, jsonOk, requireCsrf, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';

type Params = { params: Promise<{ id: string }> };

/** حذف لوحة محفوظة — لا يملك المستخدم إلا لوحاته */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.DASHBOARDS_SAVE);
    await requireCsrf();
    const { id } = await params;

    const dashboard = await prisma.savedDashboard.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!dashboard) throw errors.notFound('اللوحة غير موجودة');
    if (dashboard.userId !== user.id) throw errors.forbidden();

    await prisma.savedDashboard.delete({ where: { id } });
    return jsonOk({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
