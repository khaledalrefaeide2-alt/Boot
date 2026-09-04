import type { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { AccountsViewClient } from './accounts-view-client';

export const metadata: Metadata = { title: 'الحسابات' };

export default async function AccountsPage() {
  const user = await getSession();
  return <AccountsViewClient canManage={can(user, PERMISSIONS.ACCOUNTS_MANAGE)} />;
}
