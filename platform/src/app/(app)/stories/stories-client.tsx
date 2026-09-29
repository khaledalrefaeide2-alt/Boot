'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Flame, Layers, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Segmented } from '@/components/ui/button-group';
import { EmptyState, ErrorState, SkeletonCards } from '@/components/ui/states';
import { InfiniteSentinel } from '@/components/ui/infinite-scroll';
import {
  FilterBar,
  EMPTY_FILTERS,
  filtersToParams,
  type PostFilterState,
} from '@/components/filters/filter-bar';
import { useFilterOptions, EMPTY_OPTIONS } from '@/lib/hooks/use-filters';
import { STANCE_METRIC } from '@/lib/domain/constants';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import { arabicPlural, formatCompactNumber, formatDate, formatNumber, formatPercent } from '@/lib/utils';

interface StoryRow {
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
}

interface StoriesResponse {
  stories: StoryRow[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

const PAGE_SIZE = 20;

/** أطول ما يُعرض من نصّ المنشور في بطاقة الحدث */
const HEADLINE_CHARS = 240;

/**
 * الأحداث — خبرٌ واحد بدل خمسين بطاقة.
 *
 * ★ الحدث بلا عنوان في القاعدة.
 *
 *   العنوان هنا نصُّ أعلى منشورات الحدث تفاعلاً **ممّا يراه القارئ**، لا
 *   نصٌّ محفوظ. ولو حُفظ لعُرض لصاحب النطاق المحدود نصُّ منشورٍ من حسابٍ
 *   لا يملك فتحه — وهو تسريبُ محتوىً مقروء لا تسريبُ رقم.
 *
 * ★ والحدث من منشورٍ واحد لا يُعرض.
 *
 *   التجميع يفتح عنقوداً لكلّ منشورٍ لا يجد له نظيراً، فأكثر ما في الجدول
 *   عناقيدُ من عضوٍ واحد. وعرضها يملأ الشاشة بما هو موجودٌ أصلاً في شاشة
 *   المنشورات، ويُخفي الأحداث الحقيقية بينها.
 */
export function StoriesClient() {
  const [filters, setFilters] = useState<PostFilterState>(EMPTY_FILTERS);
  const [sort, setSort] = useState<'posts' | 'engagement' | 'negative'>('posts');

  const optionsQuery = useFilterOptions();
  const params = { ...filtersToParams(filters), sort, pageSize: PAGE_SIZE };

  const query = useInfiniteQuery({
    queryKey: ['stories', params],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<StoriesResponse>(buildQuery('/api/stories', { ...params, page: pageParam })),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  const stories = query.data?.pages.flatMap((page) => page.stories) ?? [];

  return (
    <>
      <PageHeader
        eyebrow="الرصد"
        title="الأحداث"
        description="المنشورات المتقاربة مجموعةً في حدث واحد — خبرٌ واحد بدل خمسين بطاقة تُقرأ من جديد"
        leading={<Layers className="h-5 w-5 text-muted-foreground" aria-hidden />}
      />

      <FilterBar
        className="mb-4"
        filters={filters}
        options={optionsQuery.data ?? EMPTY_OPTIONS}
        onChange={setFilters}
        onReset={() => setFilters(EMPTY_FILTERS)}
      />

      <div className="mb-4 flex justify-end no-print">
        <Segmented
          label="ترتيب الأحداث"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'posts', label: 'الأكثر تناولاً' },
            { value: 'engagement', label: 'الأعلى تفاعلاً' },
            { value: 'negative', label: 'الأكثر نقداً' },
          ]}
          size="sm"
        />
      </div>

      {query.isPending ? (
        <SkeletonCards count={6} />
      ) : query.isError ? (
        <Card>
          <ErrorState
            description={
              query.error instanceof ApiClientError ? query.error.message : 'تعذّر جلب الأحداث'
            }
            action={
              <Button variant="secondary" onClick={() => query.refetch()}>
                إعادة المحاولة
              </Button>
            }
          />
        </Card>
      ) : stories.length === 0 ? (
        <Card>
          <EmptyState
            icon={Layers}
            title="لا أحداث في هذه الفترة"
            description="يُجمَّع الحدث من منشورين فأكثر متقاربَي النصّ، ويعتمد على الفهرسة الدلالية. وسّع النطاق الزمني، أو راجع «الإعدادات» إن كانت الفهرسة أو التجميع مطفأين."
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {stories.map((story) => {
              const share = story.posts > 0 ? (story.negative / story.posts) * 100 : 0;
              return (
                <Card key={story.id} className="flex flex-col">
                  <CardBody className="flex flex-1 flex-col gap-3">
                    <Link
                      href={`/stories/${story.id}`}
                      className="text-sm leading-relaxed text-foreground hover:text-primary"
                    >
                      {story.headline.trim().slice(0, HEADLINE_CHARS) ||
                        '(منشور بلا نصّ — صورة أو فيديو)'}
                      {story.headline.trim().length > HEADLINE_CHARS && '…'}
                    </Link>

                    <div className="mt-auto space-y-2 border-t border-border pt-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="primary" size="sm">
                          <Layers className="h-3 w-3" aria-hidden />
                          <span className="num">{formatNumber(story.posts)}</span>{' '}
                          {arabicPlural(story.posts, {
                            one: 'منشور',
                            two: 'منشوران',
                            few: 'منشورات',
                            many: 'منشوراً',
                          })}
                        </Badge>
                        <Badge tone="neutral" size="sm">
                          <Users className="h-3 w-3" aria-hidden />
                          <span className="num">{formatNumber(story.accounts)}</span>{' '}
                          {arabicPlural(story.accounts, {
                            one: 'حساب',
                            two: 'حسابان',
                            few: 'حسابات',
                            many: 'حساباً',
                          })}
                        </Badge>
                        <Badge tone="neutral" size="sm">
                          <Flame className="h-3 w-3" aria-hidden />
                          <span className="num">{formatCompactNumber(story.engagement)}</span>
                        </Badge>
                        {story.negative > 0 && (
                          <Badge tone={share >= 50 ? 'danger' : 'warning'} size="sm">
                            <span className="num">{formatPercent(share)}</span> نقد
                          </Badge>
                        )}
                      </div>

                      {/*
                        المدى الزمني يقول إن كان الحدث خبر يومٍ أم قضيةً
                        امتدّت أسبوعاً — وهو فرقٌ يغيّر كيف يُقرأ العدد.
                      */}
                      <p className="num text-2xs text-subtle-foreground">
                        {story.firstPostAt && story.lastPostAt
                          ? formatDate(story.firstPostAt) === formatDate(story.lastPostAt)
                            ? formatDate(story.firstPostAt)
                            : `${formatDate(story.firstPostAt)} — ${formatDate(story.lastPostAt)}`
                          : '—'}
                      </p>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>

          <InfiniteSentinel
            hasMore={query.hasNextPage}
            isLoading={query.isFetchingNextPage}
            onLoad={() => query.fetchNextPage()}
            loaded={stories.length}
            label="حدثاً"
          />
        </>
      )}

      <p className="mt-4 text-2xs text-subtle-foreground">{STANCE_METRIC.caveat}</p>
    </>
  );
}
