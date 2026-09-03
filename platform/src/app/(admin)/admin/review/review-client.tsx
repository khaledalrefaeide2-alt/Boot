'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Eye, EyeOff, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from '@/components/ui/table';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { Pagination } from '@/components/ui/pagination';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { FilterBar, EMPTY_FILTERS, filtersToParams, type PostFilterState } from '@/components/filters/filter-bar';
import { useFilterOptions, EMPTY_OPTIONS } from '@/lib/hooks/use-filters';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import { SENTIMENT_LABELS, SENTIMENT_TONE } from '@/lib/domain/constants';
import { formatDateTime, formatNumber, truncate } from '@/lib/utils';
import type { PostListItemView } from '@/components/posts/post-card';
import type { Sentiment } from '@/generated/prisma';

export function ReviewClient() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<PostFilterState>({ ...EMPTY_FILTERS, range: 'all' });
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<PostListItemView | null>(null);

  const optionsQuery = useFilterOptions();
  const params = { ...filtersToParams(filters), page, pageSize: 25, includeHidden: 'true' };

  const query = useQuery({
    queryKey: ['review-posts', params],
    queryFn: () =>
      api.get<{ posts: PostListItemView[]; total: number; page: number; pageSize: number }>(
        buildQuery('/api/posts', params),
      ),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['review-posts'] });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.patch(`/api/posts/${id}`, data),
    onSuccess: () => {
      toast.success('حُدّث المنشور');
      void invalidate();
    },
    onError: (error) =>
      toast.error('تعذّر التحديث', error instanceof ApiClientError ? error.message : undefined),
  });

  const deleteMutation = useMutation({
    mutationFn: (post: PostListItemView) => api.delete(`/api/posts/${post.id}`),
    onSuccess: () => {
      toast.success('حُذف المنشور نهائياً');
      setDeleteTarget(null);
      void invalidate();
    },
    onError: (error) => {
      toast.error('تعذّر الحذف', error instanceof ApiClientError ? error.message : undefined);
      setDeleteTarget(null);
    },
  });

  const data = query.data;
  const topics = optionsQuery.data?.topics ?? [];

  return (
    <>
      <PageHeader
        title="مراجعة البيانات"
        description="تصحيح التصنيف والمشاعر، وإخفاء أو حذف المنشورات غير الصالحة"
      />

      <Alert tone="info" className="mb-4">
        الإخفاء هو الإجراء المفضّل: يُستبعد المنشور من كل اللوحات والإحصاءات مع بقائه في القاعدة.
        الحذف نهائي ولا رجعة فيه.
      </Alert>

      <FilterBar
        className="mb-4"
        filters={filters}
        options={optionsQuery.data ?? EMPTY_OPTIONS}
        onChange={(next) => {
          setFilters(next);
          setPage(1);
        }}
        onReset={() => setFilters({ ...EMPTY_FILTERS, range: 'all' })}
      />

      <Card>
        {query.isPending ? (
          <SkeletonRows rows={8} />
        ) : query.isError ? (
          <ErrorState description={query.error instanceof ApiClientError ? query.error.message : undefined} />
        ) : !data || data.posts.length === 0 ? (
          <EmptyState icon={ClipboardList} title="لا توجد منشورات للمراجعة" />
        ) : (
          <>
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>المنشور</TH>
                    <TH>الحساب</TH>
                    <TH>التاريخ</TH>
                    <TH>التفاعل</TH>
                    <TH>المشاعر</TH>
                    <TH>التصنيف</TH>
                    <TH className="text-end">إجراءات</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.posts.map((post) => (
                    <TR key={post.id} className={post.isHidden ? 'opacity-60' : ''}>
                      <TD className="max-w-80">
                        <p className="line-clamp-2 text-sm">
                          {truncate(post.text, 140) || 'منشور بلا نص'}
                        </p>
                        {post.isHidden && (
                          <Badge tone="warning" size="sm" className="mt-1">
                            مخفي
                          </Badge>
                        )}
                      </TD>
                      <TD className="text-xs">{post.account.name}</TD>
                      <TD className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(post.publishedAt)}
                      </TD>
                      <TD className="num">{formatNumber(post.engagementTotal)}</TD>
                      <TD>
                        <Select
                          className="h-8 text-xs"
                          value={post.sentiment}
                          onChange={(event) =>
                            updateMutation.mutate({
                              id: post.id,
                              data: { sentiment: event.target.value as Sentiment },
                            })
                          }
                          aria-label="تعديل المشاعر"
                        >
                          {Object.entries(SENTIMENT_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </Select>
                      </TD>
                      <TD>
                        <Select
                          className="h-8 text-xs"
                          value={post.topic?.id ?? ''}
                          onChange={(event) =>
                            updateMutation.mutate({
                              id: post.id,
                              data: { topicId: event.target.value || null },
                            })
                          }
                          aria-label="تعديل التصنيف"
                        >
                          <option value="">بلا تصنيف</option>
                          {topics.map((topic) => (
                            <option key={topic.id} value={topic.id}>
                              {topic.name}
                            </option>
                          ))}
                        </Select>
                      </TD>
                      <TD>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              updateMutation.mutate({
                                id: post.id,
                                data: { isHidden: !post.isHidden },
                              })
                            }
                            title={post.isHidden ? 'استعادة المنشور' : 'إخفاء المنشور'}
                          >
                            {post.isHidden ? (
                              <Eye className="h-3.5 w-3.5" aria-hidden />
                            ) : (
                              <EyeOff className="h-3.5 w-3.5" aria-hidden />
                            )}
                            {post.isHidden ? 'استعادة' : 'إخفاء'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger"
                            onClick={() => setDeleteTarget(post)}
                            aria-label="حذف نهائي"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
          </>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        title="حذف المنشور نهائياً"
        message="سيُحذف المنشور من قاعدة البيانات ولا يمكن استرجاعه. إن كان الهدف استبعاده من اللوحات فاستخدم الإخفاء بدلاً من الحذف."
        confirmLabel="حذف نهائي"
        loading={deleteMutation.isPending}
      />
    </>
  );
}
