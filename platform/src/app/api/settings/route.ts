import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import {
  guardMutationRate,
  jsonError,
  jsonOk,
  parseBody,
  requireCsrf,
  requirePermission,
} from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { updateSettingsSchema } from '@/lib/validation/taxonomy';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

export async function GET() {
  try {
    await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
    const settings = await prisma.setting.findMany({
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
      select: {
        key: true,
        value: true,
        category: true,
        label: true,
        description: true,
        updatedAt: true,
        updatedBy: { select: { name: true } },
      },
    });
    return jsonOk({ settings });
  } catch (error) {
    return jsonError(error);
  }
}

/** تحديث الإعدادات — القيم غير الحساسة فقط، والأسرار تبقى في ملف البيئة */
export async function PATCH(request: NextRequest) {
  try {
    const actor = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const { settings } = await parseBody(request, updateSettingsSchema);

    for (const setting of settings) {
      await prisma.setting.upsert({
        where: { key: setting.key },
        create: {
          key: setting.key,
          value: setting.value as never,
          updatedById: actor.id,
        },
        update: { value: setting.value as never, updatedById: actor.id },
      });
    }

    await audit(actor, {
      action: AUDIT_ACTIONS.SETTINGS_UPDATED,
      entityType: 'settings',
      summary: `تعديل ${settings.length} إعداداً`,
      metadata: { keys: settings.map((s) => s.key) },
    });

    return jsonOk({ updated: settings.length });
  } catch (error) {
    return jsonError(error);
  }
}
