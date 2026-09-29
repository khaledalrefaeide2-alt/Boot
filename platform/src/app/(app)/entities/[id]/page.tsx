import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { EntityClient } from './entity-client';

export const metadata: Metadata = { title: 'الكيان' };

export default async function EntityPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!can(user, PERMISSIONS.POSTS_VIEW)) notFound();

  const { id } = await params;
  return <EntityClient entityId={id} canReview={can(user, PERMISSIONS.POSTS_REVIEW)} />;
}
