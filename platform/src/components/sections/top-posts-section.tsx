'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Newspaper } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/button-group';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { PostCard, type PostListItemView } from '@/components/posts/post-card';
import { SectionHeader } from '@/components/sections/section-header';
import { EMPTY_SCOPE, ScopeTabs, scopeParams, type SectionScope } from '@/components/sections/scope-tabs';
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
  description = 'اختر المنصة أو المجموعة والمقياس، لعرض المنشورات الأولى بحسبها وأرقامها.',
  params = {},
  limit = 10,
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
  const [scope, setScope] = useState<SectionScope>(EMPTY_SCOPE);

  const effective = scopeParams(params, scope);

  const query = useQuery({
    queryKey: ['top-posts', metric, limit, effective],
    queryFn: () =>
      api.get<{ posts: PostListItemView[] }>(
        buildQuery('/api/posts', { ...effective, sort: metric, order: 'desc', pageSize: limit }),
      ),
  });

  const posts = query.data?.posts ?? [];

  return (
    <section className={className}>
      <SectionHeader title={title} description={description} href={href} hrefLabel="عرض جميع المنشورات">
        <div className="space-y-2">
          <ScopeTabs value={scope} onChange={setScope} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="eyebrow shrink-0">المقياس</span>
            <Segmented
              variant="pills"
              size="sm"
              label="مقياس الترتيب"
              value={metric}
              onChange={setMetric}
              options={METRICS.map((item) => ({ value: item.value, label: item.label }))}
            />
          </div>
        </div>
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
          الأعمدة تقسم العدد بلا باقٍ كما في شريط المقاييس: صفٌّ أخير فيه
          بطاقتان وفجوة يبدو ناقصاً لا مقصوداً.

          والعشرةُ تقبل اثنين وخمسة، فخمسةٌ على الأوسع وصفّان. وخمسةُ أعمدة
          تُعطي البطاقة نحو 300 بكسل على شاشة عريضة — وهو دون الأربعة
          وفوق ما يقصّ النصّ.
        */
        <div
          className={
            limit % 5 === 0
              ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-5'
              : limit % 3 === 0
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
