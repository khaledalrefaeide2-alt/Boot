import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { AnalyticsClient } from './analytics-client';

export const metadata: Metadata = { title: 'الإحصائيات' };

export default async function AnalyticsPage() {
  const user = await getSession();
  // الحارس في الخادم لا في قائمة التنقّل: إخفاء الرابط يُخفي الباب ولا يُغلقه
  if (!can(user, PERMISSIONS.POSTS_VIEW)) notFound();
  return <AnalyticsClient />;
}
