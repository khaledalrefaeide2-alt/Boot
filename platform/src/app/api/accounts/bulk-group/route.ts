import type { NextRequest } from 'next/server';
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
import { getAccountScope, scopeAllows } from '@/lib/auth/account-scope';
import { bulkAssignGroupSchema } from '@/lib/validation/sources';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { arabicPlural } from '@/lib/utils';

/**
 * إسناد عدة حسابات إلى مجموعة واحدة — أو نزع مجموعتها.
 *
 * خلافاً للتشغيل الجماعي، هذه عملية واحدة لا سلسلة عمليات: كتابة واحدة
 * على القاعدة تنجح كلها أو تفشل كلها. فلا حاجة إلى تقرير لكل حساب، ولا
 * معنى لنجاحٍ جزئي يترك نصف الدفعة في مجموعة ونصفها في أخرى.
 *
 * وما يُسقَط قبل الكتابة شيء آخر: الحسابات خارج نطاق المستخدم. تُسقط
 * بصمت لا برسالة خطأ، لأن قول «هذا الحساب ليس في نطاقك» يؤكّد وجوده
 * لمن لا يحقّ له معرفة ذلك. ويُرجَع عددها في `skipped` ليرى الموظف أن
 * ما حُدِّد أكثر مما نُقل، بلا أن يعرف أيّها.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermission(PERMISSIONS.ACCOUNTS_MANAGE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const input = await parseBody(request, bulkAssignGroupSchema);
    const requested = [...new Set(input.accountIds)];

    const scope = await getAccountScope();
    const allowed = requested.filter((id) => scopeAllows(scope, id));
    if (allowed.length === 0) throw errors.notFound('لا توجد حسابات متاحة في هذا الطلب');

    /*
     * المجموعة تُتحقَّق قبل الكتابة لا بعدها.
     *
     * المفتاح الأجنبي يحمي من معرّف غير موجود، لكنه لا يحمي من مجموعة
     * مؤرشفة: تلك موجودة في القاعدة وتقبل الربط، ثم تختفي من كل قوائم
     * التصفية لأنها ليست ACTIVE — فتصير الحسابات في مجموعة لا يراها أحد
     * ولا يجد الموظف سبباً لاختفائها.
     */
    let groupName: string | null = null;
    if (input.groupId) {
      const group = await prisma.accountGroup.findUnique({
        where: { id: input.groupId },
        select: { id: true, name: true, status: true },
      });
      if (!group) throw errors.notFound('المجموعة غير موجودة');
      if (group.status !== 'ACTIVE') throw errors.badRequest('هذه المجموعة غير مفعّلة');
      groupName = group.name;
    }

    const result = await prisma.account.updateMany({
      where: { id: { in: allowed } },
      data: { groupId: input.groupId },
    });

    // السجلّ يُقرأ كجملة عربية سليمة: «٣ حسابات» لا «٣ حساباً»
    const countLabel = `${result.count} ${arabicPlural(result.count, {
      one: 'حساب',
      two: 'حساب',
      few: 'حسابات',
      many: 'حساباً',
    })}`;

    await audit(actor, {
      action: AUDIT_ACTIONS.ACCOUNTS_GROUPED,
      entityType: 'account',
      entityId: null,
      summary: groupName
        ? `إسناد ${countLabel} إلى مجموعة ${groupName}`
        : `نزع المجموعة عن ${countLabel}`,
      metadata: {
        groupId: input.groupId,
        groupName,
        requested: requested.length,
        updated: result.count,
        accountIds: allowed,
      },
    });

    /*
     * `skipped` يُحسب من الفرق لا من مصفوفة النطاق وحدها.
     *
     * الفارق يشمل ما خرج عن النطاق وما لم يعد موجوداً (حساب حُذف بين
     * عرض الجدول والضغط على الزر) معاً، فيبقى المجموع متّسقاً دائماً:
     * updated + skipped = ما أُرسل. ولو عددنا النطاق وحده لقال الردّ
     * «نُقل ٢ وتُخطّي ٠» وقد أُرسل ثلاثة — رقمان لا يجمعان.
     */
    return jsonOk({
      updated: result.count,
      skipped: requested.length - result.count,
      groupName,
    });
  } catch (error) {
    return jsonError(error);
  }
}
