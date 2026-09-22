import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { PlatformsAdminClient } from './platforms-client';

export const metadata: Metadata = { title: 'إدارة المنصات' };

export default async function AdminPlatformsPage() {
  const user = await getSession();
  // الحارس في الخادم لا في قائمة التنقّل: إخفاء الرابط يُخفي الباب ولا يُغلقه
  if (!can(user, PERMISSIONS.PLATFORMS_MANAGE)) notFound();
  return <PlatformsAdminClient />;
}
