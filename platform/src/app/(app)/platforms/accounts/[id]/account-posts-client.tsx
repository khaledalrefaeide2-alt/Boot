'use client';

import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Newspaper, Search } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { InfiniteSentinel } from '@/components/ui/infinite-scroll';
import { PostCard, type PostListItemView } from '@/components/posts/post-card';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import { DATE_RANGES, SENTIMENT_LABELS } from '@/lib/domain/constants';
import { formatNumber } from '@/lib/utils';
import { countNoun, POST_FORMS } from '@/lib/domain/platform-directory';

interface PostsResponse {
  posts: PostListItemView[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 24;

const SORT_OPTIONS = [
  { value: 'publishedAt', label: 'الأحدث نشراً' },
  { value: 'engagementTotal', label: 'الأعلى تفاعلاً' },
  { value: 'likes', label: 'الأكثر إعجاباً' },
  { value: 'comments', label: 'الأكثر تعليقاً' },
  { value: 'shares', label: 'الأكثر مشاركة' },
  { value: 'views', label: 'الأكثر مشاهدة' },
];

/*
 * «كلّ الفترات» أوّلاً وافتراضاً — لا «آخر 30 يوماً» كشاشة المنشورات.
 *
 * من ضغط حساباً طلب منشوراته كلّها، وافتراضُ شهرٍ واحد كان سيُريه جزءاً
 * ويتركه يظنّه الكلّ. والنطاق المخصّص بالتاريخ يبقى في شاشة المنشورات.
 */
const RANGE_OPTIONS = [
  { value: 'all', label: 'كل الفترات' },
  ...DATE_RANGES.filter((range) => range.value !== 'custom').map((range) => ({
    value: range.value,
    label: range.label,
  })),
];

const SEARCH_DELAY_MS = 350;

export function AccountPostsClient({
  accountId,
  canReview,
}: {
  accountId: string;
  canReview: boolean;
}) {
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [range, setRange] = useState('all');
  const [sentiment, setSentiment] = useState('');
  const [sort, setSort] = useState('publishedAt');

  /*
   * البحث يُرسَل حين يتوقّف الكاتب لا مع كلّ حرف.
   *
   * كلّ حرفٍ طلبٌ إلى الخادم يبحث في المنشورات كلّها، وأوّل كلمةٍ من خمسة
   * أحرف كانت ستصير خمسة طلبات يُرمى أربعةٌ منها.
   */
  useEffect(() => {
    const timer = setTimeout(() => setQ(searchInput.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const params = {
    accountId,
    range,
    sort,
    pageSize: PAGE_SIZE,
    ...(q ? { q } : {}),
    ...(sentiment ? { sentiment } : {}),
  };

  const query = useInfiniteQuery({
    queryKey: ['account-posts', params],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<PostsResponse>(buildQuery('/api/posts', { ...params, page: pageParam })),
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
  });

  const posts = query.data?.pages.flatMap((page) => page.posts) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  const filtered = Boolean(q || sentiment || range !== 'all');

  function reset() {
    setSearchInput('');
    setQ('');
    setSentiment('');
    setRange('all');
  }

  return (
    <section aria-labelledby="account-posts-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="account-posts-title" className="text-base font-bold tracking-[-0.01em] text-heading sm:text-lg">
            منشورات الحساب
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm" aria-live="polite">
            {query.data
              ? filtered
                ? `${formatNumber(total)} ${countNoun(total, POST_FORMS)} — بحسب الفلاتر المختارة`
                : `كلّ ما استُخرج من الحساب — ${formatNumber(total)} ${countNoun(total, POST_FORMS)}`
              : 'جارٍ تحميل المنشورات…'}
          </p>
        </div>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={reset}>
            مسح الفلاتر
          </Button>
        )}
      </div>

      <Card className="mb-4 no-print">
        <CardBody className="flex flex-wrap items-end gap-3">
          <Input
            type="search"
            icon={Search}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="ابحث في منشورات هذا الحساب…"
            aria-label="البحث في منشورات الحساب"
            wrapperClassName="min-w-[min(100%,14rem)] flex-1"
            maxLength={300}
          />
          <Select
            aria-label="الفترة"
            wrapperClassName="w-full sm:w-44"
            value={range}
            onChange={(event) => setRange(event.target.value)}
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="المشاعر"
            wrapperClassName="w-full sm:w-40"
            value={sentiment}
            onChange={(event) => setSentiment(event.target.value)}
          >
            <option value="">كل المشاعر</option>
            {Object.entries(SENTIMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="ترتيب المنشورات"
            wrapperClassName="w-full sm:w-48"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </CardBody>
      </Card>

      {query.isPending ? (
        <Card>
          <SkeletonRows rows={6} />
        </Card>
      ) : query.isError ? (
        <Card>
          <ErrorState
            description={
              query.error instanceof ApiClientError ? query.error.message : 'تعذّر جلب منشورات الحساب'
            }
            action={
              <Button variant="secondary" onClick={() => query.refetch()}>
                إعادة المحاولة
              </Button>
            }
          />
        </Card>
      ) : posts.length === 0 ? (
        <Card>
          <EmptyState
            icon={Newspaper}
            title={filtered ? 'لا منشورات تطابق ما اخترت' : 'لم يُستخرج من هذا الحساب شيء بعد'}
            description={
              filtered
                ? 'جرّب كلمةً أخرى أو وسّع الفترة.'
                : 'تظهر المنشورات هنا بعد أوّل عملية استخراج ناجحة للحساب.'
            }
            action={
              filtered && (
                <Button variant="secondary" onClick={reset}>
                  عرض كلّ المنشورات
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} canReview={canReview} query={q} />
            ))}
          </div>
          <InfiniteSentinel
            hasMore={Boolean(query.hasNextPage)}
            isLoading={query.isFetchingNextPage}
            onLoad={() => void query.fetchNextPage()}
            loaded={posts.length}
            total={total}
          />
        </>
      )}
    </section>
  );
}
