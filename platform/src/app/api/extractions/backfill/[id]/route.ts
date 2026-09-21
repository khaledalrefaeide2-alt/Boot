import type { NextRequest } from 'next/server';
import {
  ApiError,
  errors,
  guardMutationRate,
  jsonError,
  jsonOk,
  requireCsrf,
  requirePermission,
} from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { getAccountScope, scopeAllows } from '@/lib/auth/account-scope';
import { cancelBackfill } from '@/lib/extraction/backfill';
import { ExtractionError } from '@/lib/extraction/service';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

/** إلغاء استخراج تاريخي قائم — يوقف السلسلة ومقطعها الجاري معاً */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const actor = await requirePermission(PERMISSIONS.EXTRACTION_CANCEL);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const { id } = await params;

    const backfill = await prisma.backfill.findUnique({
      where: { id },
      select: { accountId: true, doneChunks: true, totalChunks: true },
    });
    if (!backfill) throw errors.notFound('الاستخراج التاريخي غير موجود');
    if (!scopeAllows(await getAccountScope(), backfill.accountId)) {
      throw errors.notFound('الاستخراج التاريخي غير موجود');
    }

    await cancelBackfill(id);

    await audit(actor, {
      action: AUDIT_ACTIONS.BACKFILL_CANCELLED,
      entityType: 'backfill',
      entityId: id,
      summary: `إلغاء استخراج تاريخي عند المقطع ${backfill.doneChunks} من ${backfill.totalChunks}`,
    });

    return jsonOk({ cancelled: true });
  } catch (error) {
    if (error instanceof ExtractionError) return jsonError(new ApiError(400, error.message));
    return jsonError(error);
  }
}
