'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Newspaper } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/button-group';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { PostCard, type PostListItemView } from '@/components/posts/post-card';
import { SectionHeader } from '@/components/sections/section-header';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';

/*
 * أبرز المنشورات بمقياسٍ يختاره القارئ.
 *
 * «الأكثر تفاعلاً» ليست سؤالاً واحداً: منشورٌ يتصدّر بالإعجابات قد لا يظهر
 * في المشاركات أصلاً — والأول يقول «أُعجب الناس»، والثاني يقول «حملوه إلى
 * غيرهم»، وبينهما فرقٌ في المعنى لا في الترتيب فقط. فالمقياس يُبدَّل ولا
 * يُفترض.
 */

/*
 * المقاييس المتاحة هي ما تحفظه القاعدة فعلاً.
 *
 * ولا تفصيل للتفاعلات (إعجاب · أحببته · هاها · واو · حزين · غاضب): المشغّل
 * يُرجع مجموعها رقماً واحداً ولا يفصّلها، فإظهارُ أقراصٍ لها يَعِد بما لا
 * يوجد.
 */
const METRICS = [
  { value: 'engagementTotal', label: 'إجمالي التفاعل' },
  { value: 'likes', label: 'الإعجابات' },
  { value: 'comments', label: 'التعليقات' },
  { value: 'shares', label: 'المشاركات' },
  { value: 'views', label: 'المشاهدات' },
] as const;

type Metric = (typeof METRICS)[number]['value'];

export function TopPostsSection({
  title = 'أبرز المنشورات تفاعلاً',
  description = 'اختر المقياس لعرض المنشورات الأربعة الأولى بحسبه وأرقامها.',
  params = {},
  limit = 4,
  href = '/posts',
  canDelete,
  className,
}: {
  title?: string;
  description?: string;
  /** فلاتر تُمرَّر كما هي إلى مسار المنشورات — المنصة أو الفترة مثلاً */
  params?: Record<string, string | number | undefined>;
  limit?: number;
  href?: string;
  canDelete?: (post: PostListItemView) => void;
  className?: string;
}) {
  const [metric, setMetric] = useState<Metric>('engagementTotal');

  const query = useQuery({
    queryKey: ['top-posts', metric, limit, params],
    queryFn: () =>
      api.get<{ posts: PostListItemView[] }>(
        buildQuery('/api/posts', { ...params, sort: metric, order: 'desc', pageSize: limit }),
      ),
  });

  const posts = query.data?.posts ?? [];

  return (
    <section className={className}>
      <SectionHeader title={title} description={description} href={href} hrefLabel="عرض جميع المنشورات">
        <Segmented
          variant="pills"
          size="sm"
          label="مقياس الترتيب"
          value={metric}
          onChange={setMetric}
          options={METRICS.map((item) => ({ value: item.value, label: item.label }))}
        />
      </SectionHeader>

      {query.isPending ? (
        <Card>
          <SkeletonRows rows={3} />
        </Card>
      ) : query.isError ? (
        <Card>
          <ErrorState
            description={query.error instanceof ApiClientError ? query.error.message : undefined}
          />
        </Card>
      ) : posts.length === 0 ? (
        <Card>
          <EmptyState
            icon={Newspaper}
            title="لا توجد منشورات في هذا النطاق"
            description="غيّر الفترة أو الفلاتر لعرض نتائج"
          />
        </Card>
      ) : (
        /*
          الأعمدة تتبع العدد المطلوب لا رقماً ثابتاً: قسمٌ يعرض أربعة يختلف
          عن قسمٍ يعرض ثلاثة، وصفٌّ فيه فجوة يبدو ناقصاً لا مقصوداً.
        */
        <div
          className={
            limit % 3 === 0
              ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
              : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4'
          }
        >
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onDelete={canDelete} />
          ))}
        </div>
      )}
    </section>
  );
}
