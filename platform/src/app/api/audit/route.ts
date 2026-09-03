import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { jsonError, jsonOk, parseQuery, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { paginationSchema } from '@/lib/validation/common';
import type { Prisma } from '@/generated/prisma';

const listSchema = paginationSchema.extend({
  q: z.string().trim().max(160).optional(),
  action: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(60).optional(),
  userId: z.string().trim().max(64).optional(),
});

/** سجل العمليات الحساسة */
export async function GET(request: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.AUDIT_VIEW);
    const query = parseQuery(request, listSchema);

    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.q
        ? {
            OR: [
              { summary: { contains: query.q, mode: 'insensitive' } },
              { actorEmail: { contains: query.q, mode: 'insensitive' } },
              { entityId: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, logs, actions] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          summary: true,
          actorEmail: true,
          actorRole: true,
          ipAddress: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
        },
      }),
      prisma.auditLog.groupBy({ by: ['action'], _count: { _all: true }, orderBy: { _count: { action: 'desc' } }, take: 40 }),
    ]);

    return jsonOk({
      logs,
      total,
      page: query.page,
      pageSize: query.pageSize,
      actions: actions.map((row) => ({ action: row.action, count: row._count._all })),
    });
  } catch (error) {
    return jsonError(error);
  }
}
