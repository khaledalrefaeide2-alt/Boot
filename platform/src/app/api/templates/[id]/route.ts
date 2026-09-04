import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { errors, jsonError, jsonOk, requireCsrf, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const actor = await requirePermission(PERMISSIONS.REPORTS_TEMPLATES);
    await requireCsrf();
    const { id } = await params;

    const template = await prisma.reportTemplate.findUnique({
      where: { id },
      select: { name: true },
    });
    if (!template) throw errors.notFound('القالب غير موجود');

    await prisma.reportTemplate.delete({ where: { id } });

    await audit(actor, {
      action: AUDIT_ACTIONS.TEMPLATE_DELETED,
      entityType: 'report_template',
      entityId: id,
      summary: `حذف قالب التقرير «${template.name}»`,
    });

    return jsonOk({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
