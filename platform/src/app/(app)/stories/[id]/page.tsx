import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { StoryClient } from './story-client';

export const metadata: Metadata = { title: 'الحدث' };

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!can(user, PERMISSIONS.POSTS_VIEW)) notFound();

  const { id } = await params;
  return <StoryClient storyId={id} canReview={can(user, PERMISSIONS.POSTS_REVIEW)} />;
}
