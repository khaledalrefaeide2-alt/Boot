import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { AccountsAdminClient } from './accounts-client';

export const metadata: Metadata = { title: 'إدارة الحسابات' };

export default async function AdminAccountsPage() {
  const user = await getSession();
  // الحارس في الخادم لا في قائمة التنقّل: إخفاء الرابط يُخفي الباب ولا يُغلقه
  if (!can(user, PERMISSIONS.ACCOUNTS_MANAGE)) notFound();
  return (
    <AccountsAdminClient
      canRunExtraction={can(user, PERMISSIONS.EXTRACTION_RUN)}
      canManageAccounts={can(user, PERMISSIONS.ACCOUNTS_MANAGE)}
    />
  );
}
