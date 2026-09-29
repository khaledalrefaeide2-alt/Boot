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
import { bulkExtractionSettingsSchema } from '@/lib/validation/sources';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { arabicPlural } from '@/lib/utils';

/**
 * ضبط سقف المنشورات لعدّة حسابات دفعةً واحدة.
 *
 * السقف حاجز الفوترة على Apify: كلّ تشغيل يدفع بعدد ما يجلب. وضبطه
 * حساباً حساباً على أربعين حساباً أربعون فتحاً لنافذة وأربعون حفظاً —
 * فيُترك على قيمته الافتراضية، وتُدفع فاتورةٌ لم يقصدها أحد.
 *
 * وهي كتابة واحدة كإسناد المجموعة، لا سلسلة عمليات كالتشغيل الجماعي:
 * تنجح كلها أو تفشل كلها، فلا معنى لنجاحٍ جزئي يترك نصف الدفعة على سقفٍ
 * ونصفها على آخر.
 *
 * والحسابات خارج نطاق المستخدم تُسقَط بصمت لا برسالة خطأ: قول «هذا
 * الحساب ليس في نطاقك» يؤكّد وجوده لمن لا يحقّ له معرفة ذلك. ويُرجَع
 * عددها في `skipped` ليرى الموظف أنّ ما حُدِّد أكثر ممّا عُدِّل، بلا أن
 * يعرف أيّها.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermission(PERMISSIONS.ACCOUNTS_MANAGE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const input = await parseBody(request, bulkExtractionSettingsSchema);
    const requested = [...new Set(input.accountIds)];

    const scope = await getAccountScope();
    const allowed = requested.filter((id) => scopeAllows(scope, id));
    if (allowed.length === 0) throw errors.notFound('لا توجد حسابات متاحة في هذا الطلب');

    /*
     * القيم السابقة تُقرأ قبل الكتابة.
     *
     * السجلّ الذي يقول «صار السقف ٥٠٠» لا يفيد من يراجع فاتورةً ارتفعت:
     * لا يعرف من ماذا ارتفع، ولا كم حساباً تغيّر فعلاً وكم كان على القيمة
     * نفسها أصلاً. والقراءة قبل الكتابة تجعل الأثر قابلاً للعكس يدوياً.
     */
    const before = await prisma.account.findMany({
      where: { id: { in: allowed } },
      select: { id: true, name: true, maxItemsPerRun: true },
    });

    const changed = before.filter((account) => account.maxItemsPerRun !== input.maxItemsPerRun);

    const result = await prisma.account.updateMany({
      where: { id: { in: allowed } },
      data: { maxItemsPerRun: input.maxItemsPerRun },
    });

    // السجلّ يُقرأ كجملة عربية سليمة: «٣ حسابات» لا «٣ حساباً»
    const countLabel = `${result.count} ${arabicPlural(result.count, {
      one: 'حساب',
      two: 'حساب',
      few: 'حسابات',
      many: 'حساباً',
    })}`;

    await audit(actor, {
      action: AUDIT_ACTIONS.ACCOUNTS_LIMITS_CHANGED,
      entityType: 'account',
      entityId: null,
      summary: `ضبط سقف الاستخراج إلى ${input.maxItemsPerRun} منشوراً لـ${countLabel}`,
      metadata: {
        maxItemsPerRun: input.maxItemsPerRun,
        requested: requested.length,
        updated: result.count,
        // ما تغيّر فعلاً وقيمته السابقة — به وحده يُعكَس التعديل
        changed: changed.map((account) => ({
          id: account.id,
          name: account.name,
          from: account.maxItemsPerRun,
        })),
      },
    });

    /*
     * `skipped` يُحسب من الفرق لا من مصفوفة النطاق وحدها.
     *
     * الفارق يشمل ما خرج عن النطاق وما لم يعد موجوداً (حساب حُذف بين
     * عرض الجدول والضغط على الزر) معاً، فيبقى المجموع متّسقاً:
     * updated + skipped = ما أُرسل.
     */
    return jsonOk({
      updated: result.count,
      skipped: requested.length - result.count,
      changed: changed.length,
      maxItemsPerRun: input.maxItemsPerRun,
    });
  } catch (error) {
    return jsonError(error);
  }
}
