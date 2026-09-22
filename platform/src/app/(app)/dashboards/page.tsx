import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { DashboardsClient } from './dashboards-client';

export const metadata: Metadata = { title: 'اللوحات المحفوظة' };

export default async function DashboardsPage() {
  const user = await getSession();
  // الحارس في الخادم لا في قائمة التنقّل: إخفاء الرابط يُخفي الباب ولا يُغلقه
  if (!can(user, PERMISSIONS.DASHBOARDS_SAVE)) notFound();
  return <DashboardsClient />;
}
