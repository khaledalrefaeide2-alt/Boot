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
import { cancelExtractionRun, ExtractionError } from '@/lib/extraction/service';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const actor = await requirePermission(PERMISSIONS.EXTRACTION_CANCEL);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const { id } = await params;

    // الإلغاء يتبع الاطلاع: عملية حساب خارج النطاق كأنها غير موجودة
    const run = await prisma.extractionRun.findUnique({
      where: { id },
      select: { accountId: true },
    });
    if (!run) throw errors.notFound('عملية الاستخراج غير موجودة');
    if (!scopeAllows(await getAccountScope(), run.accountId)) {
      throw errors.notFound('عملية الاستخراج غير موجودة');
    }

    await cancelExtractionRun(id);

    await audit(actor, {
      action: AUDIT_ACTIONS.EXTRACTION_CANCELLED,
      entityType: 'extraction_run',
      entityId: id,
      summary: 'إلغاء عملية استخراج',
    });

    return jsonOk({ cancelled: true });
  } catch (error) {
    if (error instanceof ExtractionError) return jsonError(new ApiError(400, error.message));
    return jsonError(error);
  }
}
