import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { AccountsViewClient } from './accounts-view-client';

export const metadata: Metadata = { title: 'الحسابات' };

export default async function AccountsPage() {
  const user = await getSession();
  // الحارس هنا لا في قائمة التنقّل: إخفاء الرابط يُخفي الباب ولا يُغلقه
  if (!can(user, PERMISSIONS.ACCOUNTS_VIEW)) notFound();

  return <AccountsViewClient canManage={can(user, PERMISSIONS.ACCOUNTS_MANAGE)} />;
}
