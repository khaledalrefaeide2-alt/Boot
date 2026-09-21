import type { NextRequest } from 'next/server';
import { z } from 'zod';
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
import { getAccountScope, scopeAllows } from '@/lib/auth/account-scope';
import { createBackfill } from '@/lib/extraction/backfill';
import { ExtractionError } from '@/lib/extraction/service';
import { MAX_CHUNK_DAYS, MIN_CHUNK_DAYS } from '@/lib/extraction/chunks';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { getQueueHealth } from '@/lib/queue';
import type { Prisma } from '@/generated/prisma';

const DATE = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ يجب أن تكون YYYY-MM-DD');

/*
 * حدود المدخلات.
 *
 * السقف على النافذة لا على المدى: المدى يمتدّ سنوات بطبيعته، والنافذة
 * الطويلة هي ما يُفقد البيانات — تسعون يوماً من حسابٍ نشط تتجاوز سقف
 * الألف عنصر فيُقتطع أقدمُها بلا أثر.
 */
const backfillSchema = z.object({
  accountId: z.string().trim().min(1, 'يجب اختيار حساب').max(64),
  fromDate: DATE,
  toDate: DATE,
  chunkDays: z.coerce
    .number({ message: 'حدّد طول النافذة' })
    .int('طول النافذة عدد صحيح')
    .min(MIN_CHUNK_DAYS, `أقل طول للنافذة ${MIN_CHUNK_DAYS} يوم`)
    .max(MAX_CHUNK_DAYS, `أقصى طول للنافذة ${MAX_CHUNK_DAYS} يوماً`)
    .default(30),
  maxItemsPerChunk: z.coerce
    .number({ message: 'حدّد أقصى عدد للمنشورات في النافذة' })
    .int('العدد يجب أن يكون صحيحاً')
    .min(1, 'أقل عدد منشور واحد')
    .max(1000, 'أقصى عدد 1000 منشور للنافذة الواحدة'),
});

const listSchema = z.object({
  accountId: z.string().trim().max(64).optional(),
  status: z.enum(['RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']).optional(),
});

/** سجل عمليات الاستخراج التاريخي */
export async function GET(request: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.EXTRACTION_VIEW);

    const url = new URL(request.url);
    const query = listSchema.parse({
      accountId: url.searchParams.get('accountId') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
    });

    const scope = await getAccountScope();
    if (query.accountId && !scopeAllows(scope, query.accountId)) {
      throw errors.notFound('الحساب غير متاح');
    }

    const where: Prisma.BackfillWhereInput = {
      ...(scope === null ? {} : { accountId: { in: scope } }),
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const backfills = await prisma.backfill.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        fromDate: true,
        toDate: true,
        chunkDays: true,
        maxItemsPerChunk: true,
        totalChunks: true,
        doneChunks: true,
        failedChunks: true,
        status: true,
        itemsSaved: true,
        itemsFetched: true,
        stopReason: true,
        createdAt: true,
        finishedAt: true,
        account: { select: { id: true, name: true } },
        platform: { select: { name: true } },
      },
    });

    return jsonOk({ backfills });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * بدء استخراج تاريخي.
 *
 * الطلب يُنشئ المقطع الأول وحده ثم يعود. والبقية تتولّد في العامل الخلفي
 * مقطعاً إثر مقطع — فطلبُ HTTP لا ينتظر سنوات.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermission(PERMISSIONS.EXTRACTION_RUN);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const input = await parseBody(request, backfillSchema);

    const scope = await getAccountScope();
    if (!scopeAllows(scope, input.accountId)) throw errors.notFound('الحساب غير متاح');

    if (input.fromDate > input.toDate) {
      throw errors.badRequest('تاريخ البداية بعد تاريخ النهاية', {
        fromDate: 'تاريخ البداية بعد النهاية',
      });
    }

    /*
     * الطابور يُفحص قبل الإنشاء: استخراج تاريخي بلا عامل خلفي يُنشئ صفّاً
     * «قائماً» لا يتقدّم أبداً، وهو أسوأ من رفضٍ صريح.
     */
    const queue = await getQueueHealth();
    if (!queue.redisReady) {
      throw errors.conflict('الطابور غير متاح — شغّل Redis والعامل الخلفي قبل بدء استخراج تاريخي');
    }
    if (queue.workersKnown && queue.workers === 0) {
      throw errors.conflict(
        'لا يوجد عامل خلفي متصل — شغّله قبل بدء استخراج تاريخي، وإلا بقيت المقاطع بلا تنفيذ',
      );
    }

    const result = await createBackfill({
      accountId: input.accountId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      chunkDays: input.chunkDays,
      maxItemsPerChunk: input.maxItemsPerChunk,
      requestedById: actor.id,
    });

    await audit(actor, {
      action: AUDIT_ACTIONS.BACKFILL_STARTED,
      entityType: 'backfill',
      entityId: result.backfill.id,
      summary: `استخراج تاريخي لـ«${result.accountName}» من ${input.fromDate} إلى ${input.toDate} — ${result.chunks} نافذة`,
      metadata: {
        accountId: input.accountId,
        fromDate: input.fromDate,
        toDate: input.toDate,
        chunkDays: input.chunkDays,
        maxItemsPerChunk: input.maxItemsPerChunk,
        chunks: result.chunks,
      },
    });

    return jsonOk({
      backfillId: result.backfill.id,
      chunks: result.chunks,
      firstRunId: result.firstRunId,
    });
  } catch (error) {
    if (error instanceof ExtractionError) return jsonError(errors.badRequest(error.message));
    return jsonError(error);
  }
}
