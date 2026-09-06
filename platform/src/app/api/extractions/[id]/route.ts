import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { errors, jsonError, jsonOk, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { getAccountScope, scopeAllows } from '@/lib/auth/account-scope';

type Params = { params: Promise<{ id: string }> };

/** تفاصيل عملية استخراج واحدة */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission(PERMISSIONS.EXTRACTION_VIEW);
    const { id } = await params;

    const run = await prisma.extractionRun.findUnique({
      where: { id },
      include: {
        account: { select: { id: true, name: true, url: true } },
        platform: { select: { id: true, name: true, code: true } },
        requestedBy: { select: { name: true, email: true } },
        _count: { select: { posts: true } },
      },
    });
    if (!run) throw errors.notFound('عملية الاستخراج غير موجودة');
    if (!scopeAllows(await getAccountScope(), run.accountId)) {
      throw errors.notFound('عملية الاستخراج غير موجودة');
    }

    return jsonOk({ run });
  } catch (error) {
    return jsonError(error);
  }
}
