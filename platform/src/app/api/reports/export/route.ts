import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { attachmentHeaders, errors, jsonError, parseQuery, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { postFiltersSchema } from '@/lib/validation/posts';
import { buildPostsWorkbook } from '@/lib/reports/excel';
import { getOperationalSettings } from '@/lib/settings';
import { prisma } from '@/lib/db';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { getAccountScope } from '@/lib/auth/account-scope';

const exportSchema = postFiltersSchema.extend({
  format: z.enum(['excel']).default('excel'),
});

/** تصدير المنشورات إلى ملف Excel وفق الفلاتر الحالية */
export async function GET(request: NextRequest) {
  try {
    const actor = await requirePermission(PERMISSIONS.REPORTS_EXPORT);

    const limit = await rateLimit(
      `export:${actor.id}`,
      RATE_LIMITS.EXPORT.limit,
      RATE_LIMITS.EXPORT.window,
    );
    if (!limit.allowed) throw errors.tooMany('تجاوزت حد التصدير في الساعة، حاول لاحقاً');

    const filters = parseQuery(request, exportSchema);
    const scope = await getAccountScope();
    const settings = await getOperationalSettings();

    const { buffer, rowCount } = await buildPostsWorkbook(filters, scope, {
      organization: settings.organization,
      appName: settings.appName,
      generatedBy: actor.name,
    });

    // تسجيل التصدير لغرض التدقيق
    await prisma.reportRun
      .create({
        data: {
          format: 'EXCEL',
          status: 'SUCCEEDED',
          filters: filters as never,
          rowCount,
          requestedById: actor.id,
          finishedAt: new Date(),
        },
      })
      .catch(() => undefined);

    await audit(actor, {
      action: AUDIT_ACTIONS.REPORT_EXPORTED,
      entityType: 'report',
      summary: `تصدير Excel بـ ${rowCount} صفاً`,
      metadata: { rowCount, range: filters.range },
    });

    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `تقرير-الرصد-${stamp}.xlsx`;

    return new Response(new Uint8Array(buffer), {
      headers: attachmentHeaders(fileName, `monitoring-report-${stamp}.xlsx`, buffer.length),
    });
  } catch (error) {
    return jsonError(error);
  }
}
