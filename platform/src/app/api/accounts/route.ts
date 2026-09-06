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
import { PERMISSIONS } from '@/lib/auth/rbac';
import { createAccountSchema, listAccountsSchema } from '@/lib/validation/sources';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import type { Prisma } from '@/generated/prisma';
import { getAccountScope } from '@/lib/auth/account-scope';

/** قائمة الحسابات المرصودة مع البحث والفلترة */
export async function GET(request: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.ACCOUNTS_VIEW);
    const query = parseQuery(request, listAccountsSchema);

    // المستخدم المقيّد لا يرى في القائمة إلا الحسابات المُسندة إليه
    const scope = await getAccountScope();

    const where: Prisma.AccountWhereInput = {
      ...(scope === null ? {} : { id: { in: scope } }),
      ...(query.platformId ? { platformId: query.platformId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.ownership ? { ownership: query.ownership } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.isActive ? { isActive: query.isActive === 'true' } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { username: { contains: query.q, mode: 'insensitive' } },
              { url: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, accounts] = await Promise.all([
      prisma.account.count({ where }),
      prisma.account.findMany({
        where,
        orderBy: { [query.sort]: query.order },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          name: true,
          username: true,
          url: true,
          type: true,
          ownership: true,
          visibility: true,
          language: true,
          country: true,
          status: true,
          isActive: true,
          followersCount: true,
          extractionWindowDays: true,
          extractionIntervalMinutes: true,
          maxItemsPerRun: true,
          actorIdOverride: true,
          lastExtractedAt: true,
          lastSuccessfulRunAt: true,
          createdAt: true,
          platform: { select: { id: true, name: true, code: true, color: true, defaultActorId: true } },
          _count: { select: { posts: true, runs: true } },
        },
      }),
    ]);

    return jsonOk({ accounts, total, page: query.page, pageSize: query.pageSize });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermission(PERMISSIONS.ACCOUNTS_MANAGE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const input = await parseBody(request, createAccountSchema);

    const platform = await prisma.platform.findUnique({
      where: { id: input.platformId },
      select: { id: true, name: true },
    });
    if (!platform) throw errors.badRequest('المنصة المحددة غير موجودة');

    const duplicate = await prisma.account.findUnique({
      where: { platformId_url: { platformId: input.platformId, url: input.url } },
      select: { id: true, name: true },
    });
    if (duplicate) throw errors.conflict(`هذا الرابط مسجل مسبقاً باسم «${duplicate.name}»`);

    const account = await prisma.account.create({
      data: {
        platformId: input.platformId,
        name: input.name,
        username: input.username,
        url: input.url,
        externalId: input.externalId,
        type: input.type,
        ownership: input.ownership,
        visibility: input.visibility,
        language: input.language,
        country: input.country,
        status: input.status,
        isActive: input.isActive,
        extractionWindowDays: input.extractionWindowDays,
        extractionIntervalMinutes: input.extractionIntervalMinutes,
        maxItemsPerRun: input.maxItemsPerRun,
        actorIdOverride: input.actorIdOverride,
        followersCount: input.followersCount ?? null,
        notes: input.notes,
        createdById: actor.id,
        keywords: {
          create: input.keywordIds.map((keywordId) => ({ keywordId })),
        },
      },
      select: { id: true, name: true, url: true },
    });

    await audit(actor, {
      action: AUDIT_ACTIONS.ACCOUNT_CREATED,
      entityType: 'account',
      entityId: account.id,
      summary: `إضافة الحساب ${account.name} على ${platform.name}`,
      metadata: { url: account.url, platform: platform.name },
    });

    return jsonOk({ account }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
