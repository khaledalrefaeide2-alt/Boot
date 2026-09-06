import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

/**
 * نطاق الحسابات المسموح بها للمستخدم الحالي.
 *
 * `null` تعني «كل الحسابات» ولا تُضيف شرطاً، ومصفوفة تعني الحصر في
 * معرّفاتها. المصفوفة الفارغة نطاق صالح: مستخدم مقيّد لم يُسند إليه شيء
 * لا يرى شيئاً — وهذا مقصود، لأن الافتراض المعاكس يمنح وصولاً كاملاً
 * لمن نُسي إسناده.
 */
export type AccountScope = string[] | null;

/**
 * قراءة نطاق المستخدم الحالي.
 *
 * تُخزَّن النتيجة لكل طلب عبر `cache` لأن كل استعلام بيانات يسألها،
 * فتُقرأ من القاعدة مرة واحدة لا مرة لكل مسار.
 */
export const getAccountScope = cache(async (): Promise<AccountScope> => {
  const user = await getSession();
  if (!user) return [];

  if (user.accountAccess !== 'ASSIGNED') return null;

  const assignments = await prisma.userAccount.findMany({
    where: { userId: user.id },
    select: { accountId: true },
  });

  return assignments.map((row) => row.accountId);
});

/**
 * دمج النطاق مع معرّفات حسابات طلبها المستخدم في الفلاتر.
 *
 * الحصر يقع على التقاطع لا على ما طُلب: من يطلب حساباً خارج نطاقه لا
 * يحصل عليه، ومن لا يطلب شيئاً يُحصر في نطاقه كاملاً. لذلك لا يفيد
 * تمرير معرّف حساب في معاملات الطلب لتجاوز القيد.
 */
export function intersectScope(scope: AccountScope, requested: string[]): string[] | null {
  if (scope === null) return requested.length > 0 ? requested : null;
  if (requested.length === 0) return scope;
  return requested.filter((id) => scope.includes(id));
}

/** هل يملك المستخدم صلاحية رؤية بيانات هذا الحساب؟ */
export function scopeAllows(scope: AccountScope, accountId: string | null): boolean {
  if (scope === null) return true;
  if (!accountId) return false;
  return scope.includes(accountId);
}
