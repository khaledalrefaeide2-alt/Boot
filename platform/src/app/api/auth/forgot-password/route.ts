import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { errors, jsonError, jsonOk, parseBody, requireTrustedOrigin } from '@/lib/api';
import { forgotPasswordSchema } from '@/lib/validation/auth';
import { resetRequestAudience } from '@/lib/auth/rbac';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { audit, AUDIT_ACTIONS, requestMeta } from '@/lib/audit';

/** نوع الكيان في تنبيه الطلب — به يُعرف التكرار فلا يُغرق المدراء */
const REQUEST_ENTITY = 'password_reset_request';

/** طلبٌ واحد لكل مستخدم في هذه المدة يكفي لإبلاغ الإدارة */
const DEDUPE_MINUTES = 60;

/**
 * طلب استعادة كلمة المرور.
 *
 * ★ هذا المسار **لا يولّد رمزاً**، وكان يولّده ويضعه في التنبيه.
 *
 *   كان الرابط الكامل `/reset-password?token=…` يُكتب في تنبيهٍ يُبثّ لكلّ
 *   من دوره ADMIN. والمسار مفتوح لأيّ زائر. فكان يكفي مديراً أن يطلب
 *   استعادة كلمة مرور **المالك** ثمّ يفتح الرابط الذي وصله هو — فيدخل
 *   بحساب المالك ويُخرجه من جلساته، والمالك لا يصله شيء.
 *
 *   وقاعدة الرتب (`canManageUserWithRole`) كانت قائمةً في مسار التوليد
 *   الإداري ولم يمرّ بها هذا الطريق. وكان الرمز الخام محفوظاً نصّاً في
 *   جدول التنبيهات، فنسخةٌ احتياطية من القاعدة كانت تكفي للاستيلاء.
 *
 * والآن: التنبيه إشعارٌ بأنّ فلاناً طلب الاستعادة، يصل وحده لمن يملك
 * إدارة رتبته (`resetRequestAudience`). ومن يتحقّق من هويّته يولّد له
 * الرابط من إدارة المستخدمين — حيث تُفحص الرتبة ويُعرض الرابط مرّة واحدة
 * ولا يُخزَّن خاماً في أيّ موضع.
 */
export async function POST(request: NextRequest) {
  try {
    await requireTrustedOrigin();
    const meta = await requestMeta();
    const limit = await rateLimit(
      `reset:${meta.ipAddress ?? 'unknown'}`,
      RATE_LIMITS.PASSWORD_RESET.limit,
      RATE_LIMITS.PASSWORD_RESET.window,
    );
    if (!limit.allowed) throw errors.tooMany('طلبات كثيرة، حاول بعد ساعة');

    const { email } = await parseBody(request, forgotPasswordSchema);
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true, status: true },
    });

    // نرد بالرسالة نفسها دائماً — لا نكشف أي بريد مسجل
    if (user && user.status !== 'DISABLED') {
      const recent = await prisma.notification.findFirst({
        where: {
          entityType: REQUEST_ENTITY,
          entityId: user.id,
          createdAt: { gte: new Date(Date.now() - DEDUPE_MINUTES * 60 * 1000) },
        },
        select: { id: true },
      });

      if (!recent) {
        await prisma.notification.createMany({
          data: resetRequestAudience(user.role).map((role) => ({
            role,
            type: 'SYSTEM' as const,
            severity: 'WARNING' as const,
            title: 'طلب استعادة كلمة مرور',
            body:
              `طلب المستخدم ${user.name} (${user.email}) استعادة كلمة المرور. ` +
              'تحقّق من هويته بقناة موثوقة أولاً، ثم ولّد له رابط الاستعادة من إدارة المستخدمين.',
            link: `/admin/users?q=${encodeURIComponent(user.email)}`,
            entityType: REQUEST_ENTITY,
            entityId: user.id,
          })),
        });
      }

      await audit(
        { id: user.id, email: user.email, role: user.role },
        {
          action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
          entityType: 'user',
          entityId: user.id,
          summary: recent ? 'طلب استعادة مكرر — لم يُرسل تنبيه جديد' : 'طلب استعادة كلمة المرور',
        },
      );
    }

    return jsonOk({
      message:
        'إذا كان البريد مسجلاً لدينا فقد أُبلغت الإدارة بطلبك. تواصل مع مدير النظام لاستلام رابط الاستعادة.',
    });
  } catch (error) {
    return jsonError(error);
  }
}
