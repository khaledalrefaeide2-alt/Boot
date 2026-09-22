import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { SettingsClient } from './settings-client';

export const metadata: Metadata = { title: 'الإعدادات' };

export default async function SettingsPage() {
  const user = await getSession();
  // الحارس في الخادم لا في قائمة التنقّل: إخفاء الرابط يُخفي الباب ولا يُغلقه
  if (!can(user, PERMISSIONS.SETTINGS_MANAGE)) notFound();
  return <SettingsClient />;
}
