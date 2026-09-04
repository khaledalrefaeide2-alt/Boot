import type { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { getOperationalSettings } from '@/lib/settings';
import { ReportsClient } from './reports-client';

export const metadata: Metadata = { title: 'التقارير' };

export default async function ReportsPage() {
  const user = await getSession();
  const settings = await getOperationalSettings();

  return (
    <ReportsClient
      canExport={can(user, PERMISSIONS.REPORTS_EXPORT)}
      organization={settings.organization}
      appName={settings.appName}
      generatedBy={user?.name ?? ''}
    />
  );
}
