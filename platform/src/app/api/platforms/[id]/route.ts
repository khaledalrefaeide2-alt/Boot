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
import { PERMISSIONS } from '@/lib/auth/rbac';
import { updatePlatformSchema } from '@/lib/validation/sources';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission(PERMISSIONS.PLATFORMS_VIEW);
    const { id } = await params;

    const platform = await prisma.platform.findUnique({
      where: { id },
      include: { _count: { select: { accounts: true, posts: true, extractionRuns: true } } },
    });
    if (!platform) throw errors.notFound('المنصة غير موجودة');

    return jsonOk({ platform });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const actor = await requirePermission(PERMISSIONS.PLATFORMS_MANAGE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const { id } = await params;
    const input = await parseBody(request, updatePlatformSchema);

    const existing = await prisma.platform.findUnique({ where: { id }, select: { name: true } });
    if (!existing) throw errors.notFound('المنصة غير موجودة');

    const platform = await prisma.platform.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.defaultActorId !== undefined ? { defaultActorId: input.defaultActorId } : {}),
        ...(input.defaultActorInput !== undefined
          ? { defaultActorInput: (input.defaultActorInput ?? undefined) as never }
          : {}),
      },
    });

    await audit(actor, {
      action: AUDIT_ACTIONS.PLATFORM_UPDATED,
      entityType: 'platform',
      entityId: id,
      summary: `تعديل المنصة ${platform.name}`,
      metadata: input as never,
    });

    return jsonOk({ platform });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const actor = await requirePermission(PERMISSIONS.PLATFORMS_MANAGE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const { id } = await params;
    const platform = await prisma.platform.findUnique({
      where: { id },
      select: { name: true, code: true, _count: { select: { accounts: true } } },
    });
    if (!platform) throw errors.notFound('المنصة غير موجودة');

    // لا نحذف منصة تحمل حسابات — نطلب نقلها أو حذفها أولاً حفاظاً على البيانات
    if (platform._count.accounts > 0) {
      throw errors.conflict(
        `لا يمكن حذف المنصة لارتباطها بـ ${platform._count.accounts} حساباً. عطّلها بدل حذفها.`,
      );
    }

    await prisma.platform.delete({ where: { id } });

    await audit(actor, {
      action: AUDIT_ACTIONS.PLATFORM_DELETED,
      entityType: 'platform',
      entityId: id,
      summary: `حذف المنصة ${platform.name}`,
      metadata: { code: platform.code },
    });

    return jsonOk({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
