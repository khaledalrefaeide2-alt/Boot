'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Permission } from '@/lib/auth/rbac';

/**
 * صلاحيات المستخدم في مكوّنات العميل.
 *
 * وُجد لأن الصلاحية تُقرّر شكل الواجهة لا بوابتها وحدها: بطاقة المنشور
 * تعرض اسم الحساب لكل قارئ، لكن ربطَه بصفحة الحساب يُنتج رابطاً ميتاً لمن
 * لا يملك تصفّح الدليل. وتمريرُ ذلك خاصيةً يعبر أربع طبقات — من الصفحة إلى
 * القسم إلى الشبكة إلى البطاقة — فيُنسى في أحدها ويعود الرابط الميت.
 *
 * وليس حدّاً أمنياً: الحدّ في الخادم — حارسُ الصفحة و`requirePermission`
 * في كل مسار. وهذه تُجمّل ما يراه من يملك الصلاحية أصلاً.
 */

const PermissionsContext = createContext<ReadonlySet<Permission>>(new Set());

export function PermissionsProvider({
  permissions,
  children,
}: {
  permissions: Permission[];
  children: ReactNode;
}) {
  const value = useMemo(() => new Set(permissions), [permissions]);
  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

/** هل يملك المستخدم هذه الصلاحية؟ */
export function useCan(permission: Permission): boolean {
  return useContext(PermissionsContext).has(permission);
}
