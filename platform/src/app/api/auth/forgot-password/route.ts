import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { jsonError, jsonOk, parseBody, errors } from '@/lib/api';
import { forgotPasswordSchema } from '@/lib/validation/auth';
import { generateToken, hashToken } from '@/lib/auth/password';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { audit, AUDIT_ACTIONS, requestMeta } from '@/lib/audit';

/** صلاحية رابط الاستعادة */
const TOKEN_TTL_MINUTES = 60;

/**
 * طلب استعادة كلمة المرور.
 * لا يوجد بريد في النسخة الأولى — يُنشأ رمز ويُبلَّغ المدراء داخل النظام
 * ليسلّموا الرابط للمستخدم بقناة موثوقة.
 */
export async function POST(request: NextRequest) {
  try {
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
      const token = generateToken(32);
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000),
        },
      });

      await prisma.notification.create({
        data: {
          role: 'ADMIN',
          type: 'SYSTEM',
          severity: 'WARNING',
          title: 'طلب استعادة كلمة مرور',
          body: `طلب المستخدم ${user.name} (${user.email}) استعادة كلمة المرور. سلّمه الرابط بقناة موثوقة — صالح ${TOKEN_TTL_MINUTES} دقيقة.`,
          link: `/reset-password?token=${token}`,
          entityType: 'user',
          entityId: user.id,
        },
      });

      await audit(
        { id: user.id, email: user.email, role: user.role },
        {
          action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
          entityType: 'user',
          entityId: user.id,
          summary: 'طلب استعادة كلمة المرور',
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
