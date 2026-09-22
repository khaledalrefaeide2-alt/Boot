import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { TemplatesClient } from './templates-client';

export const metadata: Metadata = { title: 'القوالب والتقارير' };

export default async function TemplatesPage() {
  const user = await getSession();
  // الحارس في الخادم لا في قائمة التنقّل: إخفاء الرابط يُخفي الباب ولا يُغلقه
  if (!can(user, PERMISSIONS.REPORTS_TEMPLATES)) notFound();
  return <TemplatesClient canManage={can(user, PERMISSIONS.REPORTS_TEMPLATES)} />;
}
