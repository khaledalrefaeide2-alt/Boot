import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import {
  ApiError,
  guardMutationRate,
  jsonError,
  jsonOk,
  parseBody,
  parseQuery,
  requireCsrf,
  requirePermission,
} from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { getAccountScope } from '@/lib/auth/account-scope';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { isAssistantConfigured, MISSING_KEY_MESSAGE } from '@/lib/assistant/config';
import { analysisRunSchema } from '@/lib/validation/analysis';
import { postFiltersSchema } from '@/lib/validation/posts';
import {
  AnalysisRunError,
  countAnalysisTargets,
  createAnalysisRun,
  reapStaleRuns,
} from '@/lib/analysis/run';

/*
 * جولات التحليل.
 *
 * الصلاحية `taxonomy.manage` — نفس صلاحية التوجيهات. والجولة تُعيد تصنيف
 * آلاف المنشورات دفعةً واحدة، وهي أوسع أثراً من أيّ توجيه مفرد، فلا يصحّ
 * أن تكون دونه حراسةً.
 */

const RUNS_PAGE = 20;

export async function GET(request: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.TAXONOMY_MANAGE);

    // الجولات الميتة تُغلق قبل القراءة، فلا تُعرض «جارية» وهي متوقّفة منذ ساعة
    await reapStaleRuns();

    const url = new URL(request.url);

    /*
     * تقدير الكلفة قبل الالتزام بها.
     *
     * `?preview=1` مع الفلاتر يُرجع العدد وحده بلا إنشاء شيء. وهو ليس
     * ترفاً: كلّ منشور في الجولة استدعاءٌ مدفوع، وفلترٌ أوسع ممّا قصد
     * صاحبه يصير فاتورةً لا رسالة خطأ. فيُرى الرقم قبل الضغط.
     */
    if (url.searchParams.get('preview') === '1') {
      const filters = parseQuery(request, postFiltersSchema);
      const scope = await getAccountScope();
      const [pending, matching] = await Promise.all([
        countAnalysisTargets(filters, scope, false),
        countAnalysisTargets(filters, scope, true),
      ]);
      return jsonOk({ preview: { pending, matching } });
    }

    const runs = await prisma.analysisRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: RUNS_PAGE,
      select: {
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
        requestedBy: { select: { name: true } },
      },
    });

    return jsonOk({ runs });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermission(PERMISSIONS.TAXONOMY_MANAGE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const input = await parseBody(request, analysisRunSchema);

    /*
     * فحص المفتاح قبل إنشاء أيّ صفّ.
     *
     * بدونه تُسجَّل جولة وتُسلَّم للطابور ثم تفشل عند أوّل منشور، فيبقى في
     * السجلّ أثرُ عملٍ لم يبدأ. والرفض المبكّر يقول السبب في مكانه.
     */
    if (!isAssistantConfigured()) {
      throw new ApiError(503, MISSING_KEY_MESSAGE);
    }

    const { reanalyze, limit, ...filters } = input;
    const scope = await getAccountScope();

    let result;
    try {
      result = await createAnalysisRun({
        filters: postFiltersSchema.parse(filters),
        scope,
        reanalyze,
        limit,
        requestedById: actor.id,
      });
    } catch (error) {
      // رسائل الطبقة مكتوبة للمستخدم أصلاً — تُمرَّر كما هي بحالها الصحيح
      if (error instanceof AnalysisRunError) throw new ApiError(error.status, error.message);
      throw error;
    }

    await audit(actor, {
      action: AUDIT_ACTIONS.ANALYSIS_RUN_STARTED,
      entityType: 'analysis_run',
      entityId: result.run.id,
      summary: `بدء جولة تحليل لـ${result.run.total} منشوراً${reanalyze ? ' (إعادة تحليل)' : ''}`,
      metadata: { total: result.run.total, reanalyze, filters },
    });

    return jsonOk(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
