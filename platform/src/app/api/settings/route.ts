import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import {
  ApiError,
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

    /*
     * المفتاح المجهول يُردّ، والنوع لا ينزلق.
     *
     * المفاتيح تُولد في الترحيلات ومعها تسميتها وقسمها ووصفها — والشاشة
     * تعدّل ما وُلد ولا تُنشئ شيئاً. فمفتاحٌ لا وجود له طلبٌ مغلوط:
     * كان `upsert` يُنشئه صفّاً بلا قسم ولا تسمية، فيظهر في الشاشة تحت
     * بطاقةٍ بلا عنوان ولا يقرأه أحد في الخادم أبداً — نجاحٌ ظاهره
     * صحيح وأثره صفر.
     *
     * والنوع يُحرَس معه: `analysis.auto` قيمتها boolean، فحفظُ نصّ
     * «false» فوقها يُبدّل نوع العمود. وكل قارئ في الخادم يحمل حرزاً
     * ضدّ ذلك، وهو ما أخفى العطب سنةً — فالحرز يبقى، ويُمنع المصدر.
     */
    const existing = await prisma.setting.findMany({
      where: { key: { in: settings.map((setting) => setting.key) } },
      select: { key: true, value: true },
    });
    const known = new Map(existing.map((row) => [row.key, row.value]));

    for (const setting of settings) {
      const current = known.get(setting.key);
      if (current === undefined) {
        throw new ApiError(400, `إعداد غير معروف: ${setting.key}`);
      }
      /*
       * `null` في العمود لا نوع له، فيُقبل ما يُكتب فوقه. وما عداه
       * يُطابَق نوعُه: الرقم رقماً، والنعم/لا boolean، والنصّ نصّاً.
       */
      if (current !== null && typeof current !== typeof setting.value) {
        throw new ApiError(
          400,
          `نوع القيمة لا يطابق الإعداد ${setting.key} — المتوقّع ${typeof current}`,
        );
      }
    }

    for (const setting of settings) {
      await prisma.setting.update({
        where: { key: setting.key },
        data: { value: setting.value as never, updatedById: actor.id },
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
