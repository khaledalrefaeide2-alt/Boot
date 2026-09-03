import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getSession } from '@/lib/auth/session';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/auth/rbac';
import { ProfileClient } from './profile-client';
import { LoadingState } from '@/components/ui/states';

export const metadata: Metadata = { title: 'الملف الشخصي' };

export default async function ProfilePage() {
  const user = await getSession();
  if (!user) return null;

  return (
    <Suspense fallback={<LoadingState />}>
      <ProfileClient
        roleLabel={ROLE_LABELS[user.role]}
        roleDescription={ROLE_DESCRIPTIONS[user.role]}
        permissions={user.permissions}
        mustChangePassword={user.mustChangePassword}
      />
    </Suspense>
  );
}
