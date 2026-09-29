'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowRight, Flame, Layers, Newspaper, ThumbsDown, ThumbsUp, Users } from 'lucide-react';
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
import { STANCE_METRIC } from '@/lib/domain/constants';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import { formatDate, formatNumber, formatPercent } from '@/lib/utils';

interface StorySummary {
  id: string;
  headline: string;
  headlinePostId: string;
  posts: number;
  accounts: number;
  engagement: number;
  negative: number;
  positive: number;
  firstPostAt: string | null;
  lastPostAt: string | null;
  sentiment: { positive: number; negative: number; neutral: number; unknown: number };
  topAccounts: { id: string; name: string; posts: number }[];
}

interface PostsResponse {
  posts: PostListItemView[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 24;

/**
 * حدثٌ واحد: ما جرى، ومن تناوله، وبأيّ موقف.
 *
 * والفلاتر واحدة للأرقام وللمنشورات — وإلا قال العنوان «٥٠ منشوراً»
 * وعُرض تحته ما لا يطابقه، ولا أحد ينتبه لأن أحداً لا يعدّ البطاقات.
 */
export function StoryClient({ storyId, canReview }: { storyId: string; canReview: boolean }) {
  const [filters, setFilters] = useState<PostFilterState>(EMPTY_FILTERS);
  const optionsQuery = useFilterOptions();
  const params = filtersToParams(filters);

  const summaryQuery = useQuery({
    queryKey: ['story', storyId, params],
    queryFn: () => api.get<StorySummary>(buildQuery(`/api/stories/${storyId}`, params)),
  });

  const postsQuery = useInfiniteQuery({
    queryKey: ['story-posts', storyId, params],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<PostsResponse>(
        buildQuery('/api/posts', { ...params, storyId, pageSize: PAGE_SIZE, page: pageParam }),
      ),
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    enabled: summaryQuery.isSuccess,
  });

  const summary = summaryQuery.data;
  const posts = postsQuery.data?.pages.flatMap((page) => page.posts) ?? [];
  const share = summary && summary.posts > 0 ? (summary.negative / summary.posts) * 100 : 0;

  return (
    <>
      <PageHeader
        eyebrow="الأحداث"
        title="حدث"
        description={
          summary
            ? `${formatNumber(summary.posts)} منشوراً من ${formatNumber(summary.accounts)} حساباً`
            : undefined
        }
        leading={<Layers className="h-5 w-5 text-muted-foreground" aria-hidden />}
        action={
          <Link href="/stories">
            <Button variant="secondary">
              <ArrowRight className="h-4 w-4" aria-hidden />
              كل الأحداث
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
        <ErrorState
          title="لا نتائج لهذا الحدث"
          description={
            summaryQuery.error instanceof ApiClientError
              ? summaryQuery.error.message
              : 'تعذّر جلب بيانات الحدث'
          }
          action={
            <Button
              variant="secondary"
              onClick={() => setFilters({ ...EMPTY_FILTERS, range: 'all' })}
            >
              وسّع النطاق إلى كل الفترات
            </Button>
          }
        />
      ) : summary ? (
        <>
          {/*
            نصّ أعلى المنشورات تفاعلاً هو عنوان الحدث.

            ولا عنوان محفوظ في القاعدة: لو حُفظ لعُرض لصاحب النطاق المحدود
            نصُّ منشورٍ من حسابٍ لا يملك فتحه.
          */}
          <Card className="mb-4">
            <CardHeader
              title="أبرز ما نُشر فيه"
              description="أعلى منشورات الحدث تفاعلاً ممّا يظهر في نطاقك وفلاترك"
            />
            <CardBody>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {summary.headline.trim() || '(منشور بلا نصّ — صورة أو فيديو)'}
              </p>
              <Link
                href={`/posts/${summary.headlinePostId}`}
                className="mt-3 inline-block text-xs text-primary hover:underline"
              >
                فتح المنشور
              </Link>
            </CardBody>
          </Card>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="المنشورات" value={summary.posts} icon={Newspaper} />
            <StatCard label="الحسابات" value={summary.accounts} icon={Users} />
            <StatCard label="التفاعل" value={summary.engagement} icon={Flame} compact />
            <StatCard
              label="نسبة النقد"
              value={formatPercent(share)}
              icon={ThumbsDown}
              tone={share >= 50 ? 'danger' : 'default'}
              hint={`${formatNumber(summary.negative)} منشوراً سلبياً`}
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
                    <Badge tone={tone} size="sm">
                      {label}
                    </Badge>
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
                <p className="num border-t border-border pt-2 text-2xs text-subtle-foreground">
                  {summary.firstPostAt && summary.lastPostAt
                    ? formatDate(summary.firstPostAt) === formatDate(summary.lastPostAt)
                      ? formatDate(summary.firstPostAt)
                      : `من ${formatDate(summary.firstPostAt)} إلى ${formatDate(summary.lastPostAt)}`
                    : '—'}
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="الحسابات التي تناولته" description="ضمن نطاقك وفلاترك الحالية" />
              <CardBody className="space-y-2">
                {summary.topAccounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">لا حسابات في هذه الفترة.</p>
                ) : (
                  summary.topAccounts.map((account) => (
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
