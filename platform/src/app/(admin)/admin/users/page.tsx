import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS, assignableRoles } from '@/lib/auth/rbac';
import { UsersClient } from './users-client';

export const metadata: Metadata = { title: 'إدارة المستخدمين' };

export default async function UsersPage() {
  const user = await getSession();
  // الحارس في الخادم لا في قائمة التنقّل: إخفاء الرابط يُخفي الباب ولا يُغلقه
  if (!can(user, PERMISSIONS.USERS_VIEW)) notFound();

  return (
    <UsersClient
      canCreate={can(user, PERMISSIONS.USERS_CREATE)}
      canUpdate={can(user, PERMISSIONS.USERS_UPDATE)}
      canApprove={can(user, PERMISSIONS.USERS_APPROVE)}
      canScope={can(user, PERMISSIONS.USERS_ROLES)}
      assignable={user ? assignableRoles(user.role) : []}
      currentUserId={user?.id ?? ''}
    />
  );
}
