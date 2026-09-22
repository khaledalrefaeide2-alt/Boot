import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { OpsRoomClient } from './ops-client';

export const metadata: Metadata = { title: 'غرفة العمليات' };

/*
 * الحارس هنا لا في قائمة التنقّل وحدها.
 *
 * إخفاء الرابط يُخفي الباب ولا يُغلقه: من يكتب `/ops` في شريط العنوان كان
 * يدخل. وهذه الصفحة — ومعها الحسابات والمقارنة — كانت بلا حارس أصلاً،
 * تتّكل على أن القائمة لا تعرضها.
 */
export default async function OpsRoomPage() {
  const user = await getSession();
  if (!can(user, PERMISSIONS.OPS_VIEW)) notFound();

  return <OpsRoomClient />;
}
