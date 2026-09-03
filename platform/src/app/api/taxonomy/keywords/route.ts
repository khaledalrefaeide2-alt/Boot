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
import { createKeywordSchema, listTaxonomySchema } from '@/lib/validation/taxonomy';
import { normalizeKeywordTerm } from '@/lib/extraction/import';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import type { Prisma } from '@/generated/prisma';

export async function GET(request: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.POSTS_VIEW);
    const query = parseQuery(request, listTaxonomySchema);

    const where: Prisma.KeywordWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { term: { contains: query.q, mode: 'insensitive' } } : {}),
    };

    const [total, keywords] = await Promise.all([
      prisma.keyword.count({ where }),
      prisma.keyword.findMany({
        where,
        orderBy: [{ matchCount: 'desc' }, { term: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          term: true,
          category: true,
          weight: true,
          status: true,
          isAlerting: true,
          matchCount: true,
          createdAt: true,
          _count: { select: { posts: true, accounts: true } },
        },
      }),
    ]);

    return jsonOk({ keywords, total, page: query.page, pageSize: query.pageSize });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermission(PERMISSIONS.TAXONOMY_MANAGE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const input = await parseBody(request, createKeywordSchema);

    const existing = await prisma.keyword.findUnique({ where: { term: input.term } });
    if (existing) throw errors.conflict('هذه الكلمة مسجلة مسبقاً');

    const keyword = await prisma.keyword.create({
      data: {
        term: input.term,
        normalizedTerm: normalizeKeywordTerm(input.term),
        category: input.category,
        color: input.color,
        weight: input.weight,
        status: input.status,
        isAlerting: input.isAlerting,
        createdById: actor.id,
      },
      select: { id: true, term: true },
    });

    await audit(actor, {
      action: AUDIT_ACTIONS.TAXONOMY_CREATED,
      entityType: 'keyword',
      entityId: keyword.id,
      summary: `إضافة الكلمة المفتاحية «${keyword.term}»`,
    });

    return jsonOk({ keyword }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
