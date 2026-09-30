import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { MemoriesClient } from './memories-client';

export const metadata: Metadata = { title: 'تعليمات المساعد' };

export default async function MemoriesPage() {
  const user = await getSession();
  // الحارس في الخادم لا في قائمة التنقّل: إخفاء الرابط يُخفي الباب ولا يُغلقه
  if (!can(user, PERMISSIONS.ASSISTANT_USE)) notFound();
  return <MemoriesClient />;
}
