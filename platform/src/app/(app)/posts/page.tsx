import type { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { PostsClient } from './posts-client';

export const metadata: Metadata = { title: 'المنشورات' };

export default async function PostsPage() {
  const user = await getSession();
  return (
    <PostsClient
      canReview={can(user, PERMISSIONS.POSTS_REVIEW)}
      canExport={can(user, PERMISSIONS.REPORTS_EXPORT)}
    />
  );
}
