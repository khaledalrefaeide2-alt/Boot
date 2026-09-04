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
import { requiredString } from '@/lib/validation/common';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

const createSchema = z.object({
  name: requiredString('اسم القالب', 120),
  description: z.string().trim().max(400).optional().nullable(),
  period: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM']).default('MONTHLY'),
  format: z.enum(['EXCEL', 'PDF']).default('EXCEL'),
  filters: z.record(z.string(), z.unknown()),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

/** قوالب التقارير وسجل عمليات التصدير */
export async function GET() {
  try {
    await requirePermission(PERMISSIONS.REPORTS_VIEW);

    const [templates, recentRuns] = await Promise.all([
      prisma.reportTemplate.findMany({
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          description: true,
          period: true,
          format: true,
          filters: true,
          status: true,
          isScheduled: true,
          createdAt: true,
          createdBy: { select: { name: true } },
          _count: { select: { runs: true } },
        },
      }),
      prisma.reportRun.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          format: true,
          status: true,
          rowCount: true,
          createdAt: true,
          requestedBy: { select: { name: true } },
          template: { select: { name: true } },
        },
      }),
    ]);

    return jsonOk({ templates, recentRuns });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermission(PERMISSIONS.REPORTS_TEMPLATES);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const input = await parseBody(request, createSchema);

    const existing = await prisma.reportTemplate.findUnique({ where: { name: input.name } });
    if (existing) throw errors.conflict('يوجد قالب بهذا الاسم');

    const template = await prisma.reportTemplate.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        period: input.period,
        format: input.format,
        filters: input.filters as never,
        status: input.status,
        createdById: actor.id,
      },
      select: { id: true, name: true },
    });

    await audit(actor, {
      action: AUDIT_ACTIONS.TEMPLATE_CREATED,
      entityType: 'report_template',
      entityId: template.id,
      summary: `إنشاء قالب التقرير «${template.name}»`,
    });

    return jsonOk({ template }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
