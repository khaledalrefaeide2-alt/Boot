import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { KeywordsClient } from './keywords-client';

export const metadata: Metadata = { title: 'الكلمات المفتاحية' };

export default async function KeywordsPage() {
  const user = await getSession();
  // الحارس في الخادم لا في قائمة التنقّل: إخفاء الرابط يُخفي الباب ولا يُغلقه
  if (!can(user, PERMISSIONS.TAXONOMY_MANAGE)) notFound();
  return <KeywordsClient />;
}
