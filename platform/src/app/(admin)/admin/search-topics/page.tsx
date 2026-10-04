import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { SearchTopicsClient } from './search-topics-client';

export const metadata: Metadata = { title: 'مواضيع البحث' };

export default async function SearchTopicsPage() {
  const user = await getSession();
  // الحارس في الخادم لا في قائمة التنقّل: إخفاء الرابط يُخفي الباب ولا يُغلقه
  if (!can(user, PERMISSIONS.TAXONOMY_MANAGE)) notFound();
  return <SearchTopicsClient />;
}
