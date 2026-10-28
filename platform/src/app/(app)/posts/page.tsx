import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { postFiltersFromSearchParams } from '@/lib/domain/post-filter-params';
import { PostsClient } from './posts-client';

export const metadata: Metadata = { title: 'المنشورات' };

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSession();
  // الحارس في الخادم لا في قائمة التنقّل: إخفاء الرابط يُخفي الباب ولا يُغلقه
  if (!can(user, PERMISSIONS.POSTS_VIEW)) notFound();
  return (
    <PostsClient
      initialFilters={postFiltersFromSearchParams(await searchParams)}
      canReview={can(user, PERMISSIONS.POSTS_REVIEW)}
      canExport={can(user, PERMISSIONS.REPORTS_EXPORT)}
      canDelete={can(user, PERMISSIONS.POSTS_DELETE)}
    />
  );
}
