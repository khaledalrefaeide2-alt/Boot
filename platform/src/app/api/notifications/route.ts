import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { jsonError, jsonOk, parseQuery, requireAuth } from '@/lib/api';
import { paginationSchema } from '@/lib/validation/common';

const listSchema = paginationSchema.extend({
  unreadOnly: z.enum(['true', 'false']).default('false'),
});

/** تنبيهات المستخدم — الموجّهة إليه شخصياً أو إلى دوره */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const query = parseQuery(request, listSchema);

    const where = {
      OR: [{ userId: user.id }, { role: user.role }],
      ...(query.unreadOnly === 'true' ? { isRead: false } : {}),
    };

    const [total, notifications, unreadCount] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.notification.count({
        where: { OR: [{ userId: user.id }, { role: user.role }], isRead: false },
      }),
    ]);

    return jsonOk({ notifications, total, page: query.page, pageSize: query.pageSize, unreadCount });
  } catch (error) {
    return jsonError(error);
  }
}
