'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowRight, AtSign, Flame, Newspaper, ThumbsDown, ThumbsUp } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState, ErrorState, SkeletonCards, SkeletonRows } from '@/components/ui/states';
import { InfiniteSentinel } from '@/components/ui/infinite-scroll';
import {
  FilterBar,
  EMPTY_FILTERS,
  filtersToParams,
  type PostFilterState,
} from '@/components/filters/filter-bar';
import { useFilterOptions, EMPTY_OPTIONS } from '@/lib/hooks/use-filters';
import { PostCard, type PostListItemView } from '@/components/posts/post-card';
import { ENTITY_TYPE_LABELS, ENTITY_TYPE_TONE, STANCE_METRIC } from '@/lib/domain/constants';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import { formatDate, formatNumber, formatPercent } from '@/lib/utils';
import type { EntityType } from '@/generated/prisma';

interface EntitySummary {
  id: string;
  name: string;
  type: EntityType;
  posts: number;
  engagement: number;
  sentiment: { positive: number; negative: number; neutral: number; unknown: number };
  lastPostAt: string | null;
  accounts: { id: string; name: string; posts: number }[];
}

interface PostsResponse {
  posts: PostListItemView[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 24;

/**
 * صفحة الكيان الواحد: أرقامه، ومن ذكره، ومنشوراته.
 *
 * ★ الفلاتر واحدة للأرقام وللمنشورات.
 *
 *   لو قُرئت الأرقام من نافذةٍ وقُرئت المنشورات من أخرى لقال العنوان
 *   «٣٢٠ منشوراً» وعُرض تحته ما لا يطابقه — ولا أحد ينتبه، لأن أحداً لا
 *   يعدّ البطاقات. فتُبنى المعاملات مرّةً وتُمرَّر إلى الطلبين معاً.
 */
export function EntityClient({
  entityId,
  canReview,
}: {
  entityId: string;
  canReview: boolean;
}) {
  const [filters, setFilters] = useState<PostFilterState>(EMPTY_FILTERS);
  const optionsQuery = useFilterOptions();
  const params = filtersToParams(filters);

  const summaryQuery = useQuery({
    queryKey: ['entity', entityId, params],
    queryFn: () => api.get<EntitySummary>(buildQuery(`/api/entities/${entityId}`, params)),
  });

  const postsQuery = useInfiniteQuery({
    queryKey: ['entity-posts', entityId, params],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<PostsResponse>(
        buildQuery('/api/posts', { ...params, entityId, pageSize: PAGE_SIZE, page: pageParam }),
      ),
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    enabled: summaryQuery.isSuccess,
  });

  const summary = summaryQuery.data;
  const posts = postsQuery.data?.pages.flatMap((page) => page.posts) ?? [];

  return (
    <>
      <PageHeader
        eyebrow="الكيانات"
        title={summary?.name ?? '…'}
        description={
          summary
            ? `${ENTITY_TYPE_LABELS[summary.type]} — ${formatNumber(summary.posts)} منشوراً في الفترة المحدَّدة`
            : undefined
        }
        leading={<AtSign className="h-5 w-5 text-muted-foreground" aria-hidden />}
        action={
          <Link href="/entities">
            <Button variant="secondary">
              <ArrowRight className="h-4 w-4" aria-hidden />
              كل الكيانات
            </Button>
          </Link>
        }
      />

      <FilterBar
        className="mb-4"
        filters={filters}
        options={optionsQuery.data ?? EMPTY_OPTIONS}
        onChange={setFilters}
        onReset={() => setFilters(EMPTY_FILTERS)}
      />

      {summaryQuery.isPending ? (
        <SkeletonRows rows={4} />
      ) : summaryQuery.isError ? (
        /*
         * «غير موجود» هنا تعني أيضاً «ليس في نطاقك».
         *
         * والرسالة لا تفرّق بينهما عن قصد: الفرق نفسه هو ما لا يُكشف —
         * فلو قيل «ممنوع» لعرف القارئ أنّ الاسم موجود في المنصّة وأنّ
         * منشوراته عند غيره.
         */
        <ErrorState
          title="لا نتائج لهذا الكيان"
          description={
            summaryQuery.error instanceof ApiClientError
              ? summaryQuery.error.message
              : 'تعذّر جلب بيانات الكيان'
          }
          action={
            <Button variant="secondary" onClick={() => setFilters({ ...EMPTY_FILTERS, range: 'all' })}>
              وسّع النطاق إلى كل الفترات
            </Button>
          }
        />
      ) : summary ? (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="المنشورات" value={summary.posts} icon={Newspaper} />
            <StatCard label="التفاعل" value={summary.engagement} icon={Flame} compact />
            <StatCard
              label="سلبي"
              value={summary.sentiment.negative}
              icon={ThumbsDown}
              tone="danger"
              hint={
                summary.posts > 0
                  ? `${formatPercent((summary.sentiment.negative / summary.posts) * 100)} ممّا ذُكر فيه`
                  : undefined
              }
            />
            <StatCard
              label="إيجابي"
              value={summary.sentiment.positive}
              icon={ThumbsUp}
              tone="success"
              hint={
                summary.posts > 0
                  ? `${formatPercent((summary.sentiment.positive / summary.posts) * 100)} ممّا ذُكر فيه`
                  : undefined
              }
            />
          </div>

          <div className="mb-4 grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader title="التوزيع" description={STANCE_METRIC.short} />
              <CardBody className="space-y-2">
                {(
                  [
                    ['سلبي', summary.sentiment.negative, 'danger'],
                    ['إيجابي', summary.sentiment.positive, 'success'],
                    ['محايد', summary.sentiment.neutral, 'neutral'],
                    ['غير محسوم', summary.sentiment.unknown, 'neutral'],
                  ] as const
                ).map(([label, value, tone]) => (
                  <div key={label} className="flex items-center justify-between gap-3 text-xs">
                    <span className="flex items-center gap-2">
                      <Badge tone={tone} size="sm">
                        {label}
                      </Badge>
                    </span>
                    <span className="num text-muted-foreground">
                      {formatNumber(value)}
                      {summary.posts > 0 && (
                        <span className="text-subtle-foreground">
                          {' '}
                          ({formatPercent((value / summary.posts) * 100)})
                        </span>
                      )}
                    </span>
                  </div>
                ))}
                {summary.lastPostAt && (
                  <p className="border-t border-border pt-2 text-2xs text-subtle-foreground">
                    آخر ذكر: <span className="num">{formatDate(summary.lastPostAt)}</span>
                  </p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="أكثر الحسابات ذكراً له"
                description="ضمن نطاقك وفلاترك الحالية"
              />
              <CardBody className="space-y-2">
                {summary.accounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">لا حسابات في هذه الفترة.</p>
                ) : (
                  summary.accounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <Link
                        href={`/accounts/${account.id}`}
                        className="truncate text-foreground hover:text-primary hover:underline"
                      >
                        {account.name}
                      </Link>
                      <span className="num shrink-0 text-muted-foreground">
                        {formatNumber(account.posts)}
                      </span>
                    </div>
                  ))
                )}
              </CardBody>
            </Card>
          </div>

          <Card className="mb-3">
            <CardHeader
              title="المنشورات التي ذُكر فيها"
              description={
                <>
                  <Badge tone={ENTITY_TYPE_TONE[summary.type]} size="sm">
                    {ENTITY_TYPE_LABELS[summary.type]}
                  </Badge>{' '}
                  {summary.name}
                </>
              }
            />
          </Card>

          {postsQuery.isPending ? (
            <SkeletonCards count={6} />
          ) : postsQuery.isError ? (
            <Card>
              <ErrorState
                description={
                  postsQuery.error instanceof ApiClientError
                    ? postsQuery.error.message
                    : 'تعذّر جلب المنشورات'
                }
                action={
                  <Button variant="secondary" onClick={() => postsQuery.refetch()}>
                    إعادة المحاولة
                  </Button>
                }
              />
            </Card>
          ) : posts.length === 0 ? (
            <Card>
              <EmptyState
                icon={Newspaper}
                title="لا منشورات مطابقة"
                description="الأرقام أعلاه محسوبة على الفلاتر نفسها — جرّب توسيع النطاق الزمني."
              />
            </Card>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} canReview={canReview} />
                ))}
              </div>
              <InfiniteSentinel
                hasMore={postsQuery.hasNextPage}
                isLoading={postsQuery.isFetchingNextPage}
                onLoad={() => postsQuery.fetchNextPage()}
                loaded={posts.length}
                total={postsQuery.data?.pages[0]?.total ?? 0}
              />
            </>
          )}
        </>
      ) : null}

      <p className="mt-4 text-2xs text-subtle-foreground">{STANCE_METRIC.caveat}</p>
    </>
  );
}
