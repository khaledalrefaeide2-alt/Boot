import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { CompareClient } from './compare-client';

export const metadata: Metadata = { title: 'مقارنة الحسابات' };

/*
 * المقارنة تتبع الاطلاع على الحسابات.
 *
 * مقارنةُ حساباتٍ لا يملك المستخدم تصفّحها تناقضٌ: الشاشة تعرض أسماءها
 * وأرقامها كلها، وهي عين ما يُخفيه دليل الحسابات عنه.
 */
export default async function ComparePage() {
  const user = await getSession();
  if (!can(user, PERMISSIONS.ACCOUNTS_VIEW)) notFound();

  return <CompareClient />;
}
