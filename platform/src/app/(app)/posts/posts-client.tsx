'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, LayoutGrid, List, Newspaper } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/button-group';
import { Select } from '@/components/ui/field';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { Pagination } from '@/components/ui/pagination';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { FilterBar, EMPTY_FILTERS, filtersToParams, type PostFilterState } from '@/components/filters/filter-bar';
import { useFilterOptions, EMPTY_OPTIONS } from '@/lib/hooks/use-filters';
import { PostCard, PostRow, PostTableHead } from '@/components/posts/post-card';
import { Table, TBody, TableWrapper } from '@/components/ui/table';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import { formatNumber } from '@/lib/utils';
import type { PostListItemView } from '@/components/posts/post-card';

interface PostsResponse {
  posts: PostListItemView[];
  total: number;
  page: number;
  pageSize: number;
}

const SORT_OPTIONS = [
  { value: 'publishedAt', label: 'الأحدث نشراً' },
  { value: 'engagementTotal', label: 'الأعلى تفاعلاً' },
  { value: 'likes', label: 'الأكثر إعجاباً' },
  { value: 'comments', label: 'الأكثر تعليقاً' },
  { value: 'shares', label: 'الأكثر مشاركة' },
  { value: 'views', label: 'الأكثر مشاهدة' },
];

export function PostsClient({
  canReview,
  canExport,
  canDelete,
}: {
  canReview: boolean;
  canExport: boolean;
  canDelete: boolean;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<PostListItemView | null>(null);
  const [filters, setFilters] = useState<PostFilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('publishedAt');
  const [view, setView] = useState<'cards' | 'table'>('cards');

  const optionsQuery = useFilterOptions();
  const params = { ...filtersToParams(filters), sort, page, pageSize: 24 };

  const query = useQuery({
    queryKey: ['posts', params],
    queryFn: () => api.get<PostsResponse>(buildQuery('/api/posts', params)),
  });

  /*
   * الحذف نهائي ولا رجعة فيه، فله حوار تأكيد يذكر صاحب المنشور.
   *
   * ومن أراد إخفاءً قابلاً للتراجع فله «مخفي» في شاشة المراجعة — وهما
   * بابان مختلفان عمداً: أحدهما يُخرج المنشور من العرض، والآخر يمحوه.
   */
  const deleteMutation = useMutation({
    mutationFn: (post: PostListItemView) => api.delete(`/api/posts/${post.id}`),
    onSuccess: () => {
      toast.success('حُذف المنشور');
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
    onError: (error) => {
      toast.error('تعذّر الحذف', error instanceof ApiClientError ? error.message : undefined);
      setDeleteTarget(null);
    },
  });

  function updateFilters(next: PostFilterState) {
    setFilters(next);
    setPage(1);
  }

  const exportHref = buildQuery('/api/reports/export', {
    ...filtersToParams(filters),
    format: 'excel',
  });

  return (
    <>
      <PageHeader
        title="المنشورات"
        description={
          query.data
            ? `${formatNumber(query.data.total)} منشوراً مطابقاً للفلاتر الحالية`
            : 'كل المنشورات المستخرجة من المنصات المرصودة'
        }
        action={
          <>
            {/* اختيار شكل العرض حالةٌ واحدة من اثنتين لا زرّان مستقلّان */}
            <Segmented
              size="sm"
              label="شكل العرض"
              value={view}
              onChange={setView}
              options={[
                {
                  value: 'cards',
                  label: (
                    <>
                      <LayoutGrid className="h-4 w-4" aria-hidden />
                      <span className="sr-only">عرض البطاقات</span>
                    </>
                  ),
                },
                {
                  value: 'table',
                  label: (
                    <>
                      <List className="h-4 w-4" aria-hidden />
                      <span className="sr-only">عرض الجدول</span>
                    </>
                  ),
                },
              ]}
            />
            {canExport && (
              <a href={exportHref}>
                <Button variant="secondary">
                  <Download className="h-4 w-4" aria-hidden />
                  تصدير Excel
                </Button>
              </a>
            )}
          </>
        }
      />

      <FilterBar
        className="mb-4"
        filters={filters}
        options={optionsQuery.data ?? EMPTY_OPTIONS}
        onChange={updateFilters}
        onReset={() => updateFilters(EMPTY_FILTERS)}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 no-print">
        <Select
          wrapperClassName="w-52"
          value={sort}
          onChange={(event) => {
            setSort(event.target.value);
            setPage(1);
          }}
          aria-label="ترتيب النتائج"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      {query.isPending ? (
        <Card>
          <SkeletonRows rows={8} />
        </Card>
      ) : query.isError ? (
        <Card>
          <ErrorState
            description={
              query.error instanceof ApiClientError ? query.error.message : 'تعذّر جلب المنشورات'
            }
            action={
              <Button variant="secondary" onClick={() => query.refetch()}>
                إعادة المحاولة
              </Button>
            }
          />
        </Card>
      ) : !query.data || query.data.posts.length === 0 ? (
        <Card>
          <EmptyState
            icon={Newspaper}
            title="لا توجد منشورات مطابقة"
            description="جرّب توسيع النطاق الزمني أو إزالة بعض الفلاتر، أو شغّل عملية استخراج جديدة."
            action={
              <Link href="/admin/extractions">
                <Button variant="secondary">عمليات الاستخراج</Button>
              </Link>
            }
          />
        </Card>
      ) : view === 'cards' ? (
        <>
          {/*
            أربع بطاقات في السطر على الأعرض، وتتدرّج نزولاً:
            2xl أربع · lg ثلاث · sm اثنتان · الجوال واحدة.

            كانت خمساً، ونزلت إلى أربع حين صارت البطاقة تحمل ترويسة: صورة
            الحساب واسمه وزرّ الحذف في سطر واحد يحتاج عرضاً لا يتركه خمسة
            أعمدة على شاشة 1280 — نحو 190 بكسل، يكفي الصورة والزرّ ولا يبقي
            للاسم إلا حرفين وثلاث نقاط.

            والفجوة 16px لا 10px: البطاقة صارت أعلى ارتفاعاً وأوضح حافّةً،
            والفجوة الضيّقة بين جسمين كبيرين تجعلهما يبدوان ملتصقين.
          */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {query.data.posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                canReview={canReview}
                onDelete={canDelete ? setDeleteTarget : undefined}
              />
            ))}
          </div>
          <Card className="mt-4">
            <Pagination
              page={query.data.page}
              pageSize={query.data.pageSize}
              total={query.data.total}
              onPageChange={setPage}
              className="border-t-0"
            />
          </Card>
        </>
      ) : (
        <Card>
          <TableWrapper>
            <Table>
              <PostTableHead />
              <TBody>
                {query.data.posts.map((post) => (
                  <PostRow key={post.id} post={post} />
                ))}
              </TBody>
            </Table>
          </TableWrapper>
          <Pagination
            page={query.data.page}
            pageSize={query.data.pageSize}
            total={query.data.total}
            onPageChange={setPage}
          />
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        title="حذف المنشور"
        message={`سيُحذف منشور «${deleteTarget?.account.name ?? ''}» نهائياً مع تحليله وتصنيفه. لا يمكن التراجع.`}
        confirmLabel="حذف المنشور"
        loading={deleteMutation.isPending}
      />
    </>
  );
}