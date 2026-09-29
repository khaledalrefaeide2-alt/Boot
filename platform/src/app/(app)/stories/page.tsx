import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { StoriesClient } from './stories-client';

export const metadata: Metadata = { title: 'الأحداث' };

/*
 * الأحداث تتبع الاطلاع على المنشورات.
 *
 * الشاشة تجميعٌ لمنشوراتٍ يراها صاحبها أصلاً: من لا يملك تصفّح المنشورات
 * لا يُعرض له نصُّ أحدها في بطاقة حدث.
 */
export default async function StoriesPage() {
  const user = await getSession();
  if (!can(user, PERMISSIONS.POSTS_VIEW)) notFound();

  return <StoriesClient />;
}
