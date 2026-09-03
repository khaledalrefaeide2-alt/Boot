import type { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { AccountsAdminClient } from './accounts-client';

export const metadata: Metadata = { title: 'إدارة الحسابات' };

export default async function AdminAccountsPage() {
  const user = await getSession();
  return <AccountsAdminClient canRunExtraction={can(user, PERMISSIONS.EXTRACTION_RUN)} />;
}
