import type { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { TemplatesClient } from './templates-client';

export const metadata: Metadata = { title: 'القوالب والتقارير' };

export default async function TemplatesPage() {
  const user = await getSession();
  return <TemplatesClient canManage={can(user, PERMISSIONS.REPORTS_TEMPLATES)} />;
}
