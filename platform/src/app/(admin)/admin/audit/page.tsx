import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { AuditClient } from './audit-client';

export const metadata: Metadata = { title: 'السجلات والنشاطات' };

export default async function AuditPage() {
  const user = await getSession();
  // الحارس في الخادم لا في قائمة التنقّل: إخفاء الرابط يُخفي الباب ولا يُغلقه
  if (!can(user, PERMISSIONS.AUDIT_VIEW)) notFound();
  return <AuditClient />;
}
