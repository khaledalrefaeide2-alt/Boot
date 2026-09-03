import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import {
  ApiError,
  errors,
  jsonError,
  jsonOk,
  parseBody,
  parseQuery,
  requireCsrf,
  requirePermission,
} from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { paginationSchema } from '@/lib/validation/common';
import { createExtractionRun, ExtractionError } from '@/lib/extraction/service';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import type { Prisma } from '@/generated/prisma';

const listSchema = paginationSchema.extend({
  accountId: z.string().trim().max(64).optional(),
  platformId: z.string().trim().max(64).optional(),
  status: z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'NO_RESULTS']).optional(),
  trigger: z.enum(['MANUAL', 'SCHEDULED', 'WEBHOOK']).optional(),
});

const startSchema = z.object({
  accountId: z.string().trim().min(1, 'يجب اختيار حساب').max(64),
  maxItems: z.coerce.number().int().min(1).max(1000).optional(),
  windowDays: z.coerce.number().int().min(1).max(365).optional(),
});

/** سجل عمليات الاستخراج */
export async function GET(request: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.EXTRACTION_VIEW);
    const query = parseQuery(request, listSchema);

    const where: Prisma.ExtractionRunWhereInput = {
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.platformId ? { platformId: query.platformId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.trigger ? { trigger: query.trigger } : {}),
    };

    const [total, runs, activeCount] = await Promise.all([
      prisma.extractionRun.count({ where }),
      prisma.extractionRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          status: true,
          trigger: true,
          actorId: true,
          apifyRunId: true,
          maxItems: true,
          itemsFetched: true,
          itemsSaved: true,
          itemsSkipped: true,
          itemsFailed: true,
          errorMessage: true,
          startedAt: true,
          finishedAt: true,
          durationMs: true,
          createdAt: true,
          account: { select: { id: true, name: true } },
          platform: { select: { id: true, name: true, code: true } },
          requestedBy: { select: { name: true } },
        },
      }),
      prisma.extractionRun.count({ where: { status: { in: ['PENDING', 'RUNNING'] } } }),
    ]);

    return jsonOk({ runs, total, page: query.page, pageSize: query.pageSize, activeCount });
  } catch (error) {
    return jsonError(error);
  }
}

/** تشغيل استخراج يدوي */
export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermission(PERMISSIONS.EXTRACTION_RUN);
    await requireCsrf();

    const limit = await rateLimit(
      `extraction:${actor.id}`,
      RATE_LIMITS.EXTRACTION_RUN.limit,
      RATE_LIMITS.EXTRACTION_RUN.window,
    );
    if (!limit.allowed) {
      throw errors.tooMany('تجاوزت حد عمليات الاستخراج في الساعة، حاول لاحقاً');
    }

    const input = await parseBody(request, startSchema);

    const { run, queued, accountName } = await createExtractionRun({
      accountId: input.accountId,
      trigger: 'MANUAL',
      requestedById: actor.id,
      maxItems: input.maxItems,
      windowDays: input.windowDays,
    });

    await audit(actor, {
      action: AUDIT_ACTIONS.EXTRACTION_STARTED,
      entityType: 'extraction_run',
      entityId: run.id,
      summary: `تشغيل استخراج يدوي للحساب ${accountName}`,
      metadata: { actorId: run.actorId, maxItems: run.maxItems, queued },
    });

    return jsonOk(
      {
        run,
        queued,
        message: queued
          ? 'أُضيفت العملية إلى الطابور وستبدأ خلال لحظات'
          : 'أُنشئت العملية لكن الطابور غير متاح — تأكد من تشغيل Redis والعامل الخلفي',
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ExtractionError) return jsonError(new ApiError(400, error.message));
    return jsonError(error);
  }
}
