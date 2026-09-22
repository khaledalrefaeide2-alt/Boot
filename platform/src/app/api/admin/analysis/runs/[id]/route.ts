import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import {
  errors,
  guardMutationRate,
  jsonError,
  jsonOk,
  requireCsrf,
  requirePermission,
} from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { cancelAnalysisRun, reapStaleRuns } from '@/lib/analysis/run';

type Params = { params: Promise<{ id: string }> };

const RUN_SELECT = {
  id: true,
  status: true,
  reanalyze: true,
  total: true,
  done: true,
  failed: true,
  negative: true,
  review: true,
  flagged: true,
  errorMessage: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
  updatedAt: true,
  requestedBy: { select: { name: true } },
} as const;

/** حال جولة واحدة — تسألها الواجهة كل بضع ثوانٍ ما دامت جارية */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission(PERMISSIONS.TAXONOMY_MANAGE);
    await reapStaleRuns();

    const { id } = await params;
    const run = await prisma.analysisRun.findUnique({ where: { id }, select: RUN_SELECT });
    if (!run) throw errors.notFound('الجولة غير موجودة');

    return jsonOk({ run });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * الإلغاء.
 *
 * لا يُوقف المنشور الجاري تحليله — استدعاءٌ انطلق لا يُستردّ. يوقف ما
 * بعده: الحلقة تقرأ الحالة قبل كل دفعة فتخرج، ويبقى ما أُنجز محفوظاً.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const actor = await requirePermission(PERMISSIONS.TAXONOMY_MANAGE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const { id } = await params;
    const existing = await prisma.analysisRun.findUnique({
      where: { id },
      select: { id: true, status: true, done: true, total: true },
    });
    if (!existing) throw errors.notFound('الجولة غير موجودة');

    const cancelled = await cancelAnalysisRun(id);
    if (!cancelled) {
      throw errors.conflict('الجولة انتهت بالفعل — لا شيء لإلغائه');
    }

    await audit(actor, {
      action: AUDIT_ACTIONS.ANALYSIS_RUN_CANCELLED,
      entityType: 'analysis_run',
      entityId: id,
      summary: `إلغاء جولة تحليل بعد ${existing.done} من ${existing.total}`,
      metadata: { done: existing.done, total: existing.total },
    });

    const run = await prisma.analysisRun.findUnique({ where: { id }, select: RUN_SELECT });
    return jsonOk({ run });
  } catch (error) {
    return jsonError(error);
  }
}
