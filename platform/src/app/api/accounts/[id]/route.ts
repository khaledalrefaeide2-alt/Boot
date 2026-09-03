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
import { updateAccountSchema } from '@/lib/validation/sources';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission(PERMISSIONS.ACCOUNTS_VIEW);
    const { id } = await params;

    const account = await prisma.account.findUnique({
      where: { id },
      include: {
        platform: { select: { id: true, name: true, code: true, color: true, defaultActorId: true } },
        keywords: { include: { keyword: { select: { id: true, term: true } } } },
        _count: { select: { posts: true, runs: true } },
      },
    });
    if (!account) throw errors.notFound('الحساب غير موجود');

    return jsonOk({ account });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const actor = await requirePermission(PERMISSIONS.ACCOUNTS_MANAGE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const { id } = await params;
    const input = await parseBody(request, updateAccountSchema);

    const existing = await prisma.account.findUnique({
      where: { id },
      select: { id: true, name: true, platformId: true, url: true },
    });
    if (!existing) throw errors.notFound('الحساب غير موجود');

    // منع تكرار الرابط داخل المنصة نفسها
    if (input.url && input.url !== existing.url) {
      const duplicate = await prisma.account.findUnique({
        where: {
          platformId_url: { platformId: input.platformId ?? existing.platformId, url: input.url },
        },
        select: { id: true },
      });
      if (duplicate && duplicate.id !== id) throw errors.conflict('هذا الرابط مسجل لحساب آخر');
    }

    const { keywordIds, ...rest } = input;

    const account = await prisma.account.update({
      where: { id },
      data: {
        ...Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined)),
        ...(keywordIds
          ? {
              keywords: {
                deleteMany: {},
                create: keywordIds.map((keywordId) => ({ keywordId })),
              },
            }
          : {}),
      },
      select: { id: true, name: true },
    });

    await audit(actor, {
      action: AUDIT_ACTIONS.ACCOUNT_UPDATED,
      entityType: 'account',
      entityId: id,
      summary: `تعديل الحساب ${account.name}`,
    });

    return jsonOk({ account });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const actor = await requirePermission(PERMISSIONS.ACCOUNTS_MANAGE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const { id } = await params;
    const account = await prisma.account.findUnique({
      where: { id },
      select: { name: true, url: true, _count: { select: { posts: true } } },
    });
    if (!account) throw errors.notFound('الحساب غير موجود');

    // حذف الحساب يحذف منشوراته المرتبطة — عملية لا رجعة فيها
    await prisma.account.delete({ where: { id } });

    await audit(actor, {
      action: AUDIT_ACTIONS.ACCOUNT_DELETED,
      entityType: 'account',
      entityId: id,
      summary: `حذف الحساب ${account.name} ومعه ${account._count.posts} منشوراً`,
      metadata: { url: account.url, postsDeleted: account._count.posts },
    });

    return jsonOk({ deleted: true, postsDeleted: account._count.posts });
  } catch (error) {
    return jsonError(error);
  }
}
