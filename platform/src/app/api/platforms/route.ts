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
import { createPlatformSchema } from '@/lib/validation/sources';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

/** قائمة المنصات مع عدد الحسابات والمنشورات */
export async function GET() {
  try {
    await requirePermission(PERMISSIONS.PLATFORMS_VIEW);

    const platforms = await prisma.platform.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        icon: true,
        color: true,
        status: true,
        sortOrder: true,
        defaultActorId: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { accounts: true, posts: true } },
      },
    });

    return jsonOk({ platforms });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermission(PERMISSIONS.PLATFORMS_MANAGE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const input = await parseBody(request, createPlatformSchema);

    const existing = await prisma.platform.findUnique({ where: { code: input.code } });
    if (existing) throw errors.conflict('رمز المنصة مستخدم مسبقاً');

    const platform = await prisma.platform.create({
      data: {
        code: input.code,
        name: input.name,
        icon: input.icon,
        color: input.color,
        status: input.status,
        sortOrder: input.sortOrder,
        defaultActorId: input.defaultActorId,
        defaultActorInput: (input.defaultActorInput ?? undefined) as never,
      },
    });

    await audit(actor, {
      action: AUDIT_ACTIONS.PLATFORM_CREATED,
      entityType: 'platform',
      entityId: platform.id,
      summary: `إضافة المنصة ${platform.name}`,
      metadata: { code: platform.code },
    });

    return jsonOk({ platform }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
