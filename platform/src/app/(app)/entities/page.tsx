import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { EntitiesClient } from './entities-client';

export const metadata: Metadata = { title: 'الكيانات' };

/*
 * الكيانات تتبع الاطلاع على المنشورات.
 *
 * الشاشة عدٌّ لمنشوراتٍ يراها صاحبها أصلاً: من لا يملك تصفّح المنشورات
 * لا يُعرض له من ذُكر فيها ولا كم مرّة.
 */
export default async function EntitiesPage() {
  const user = await getSession();
  if (!can(user, PERMISSIONS.POSTS_VIEW)) notFound();

  return <EntitiesClient />;
}
