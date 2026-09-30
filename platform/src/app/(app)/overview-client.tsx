'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Reveal } from '@/components/motion/reveal';
import { HighlightCard, METRIC_ICONS, StatCard, StatGrid } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

import { EmptyState, ErrorState, SkeletonCards } from '@/components/ui/states';

import { FilterBar, EMPTY_FILTERS, filtersToParams, type PostFilterState } from '@/components/filters/filter-bar';
import { useFilterOptions, EMPTY_OPTIONS } from '@/lib/hooks/use-filters';
import { TimelineChart } from '@/components/charts/timeline-chart';
import { TopPostsSection } from '@/components/sections/top-posts-section';
import { TopAccountsSection } from '@/components/sections/top-accounts-section';
import { ComparisonBars, DonutChart, SentimentChart } from '@/components/charts/distribution-charts';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import { formatNumber, truncate, halfOverHalfChange } from '@/lib/utils';
import { POST_TYPE_LABELS, SENTIMENT_LABELS } from '@/lib/domain/constants';

interface OverviewResponse {
  totalPosts: number;
  postsToday: number;
  postsThisWeek: number;
  postsThisMonth: number;
  accountsCount: number;
  platformsCount: number;
  platformsTotal: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalViews: number;
  totalEngagement: number;
  engagementRate: number;
  topPost: {
    id: string;
    text: string | null;
    engagementTotal: number;
    accountName: string;
    platformName: string;
    mediaKey: string | null;
    thumbnailUrl: string | null;
  } | null;
  topPlatform: { id: string; name: string; postsCount: number } | null;
}

interface BreakdownsResponse {
  byPlatform: { id: string; name: string; posts: number; engagement: number }[];
  byType: { type: string; posts: number }[];
  bySentiment: { sentiment: string; posts: number }[];
}

export function OverviewClient() {
  const [filters, setFilters] = useState<PostFilterState>(EMPTY_FILTERS);
  const params = filtersToParams(filters);
  const optionsQuery = useFilterOptions();

  const overview = useQuery({
    queryKey: ['overview', params],
    queryFn: () => api.get<OverviewResponse>(buildQuery('/api/stats/overview', params)),
  });

  const timeseries = useQuery({
    queryKey: ['timeseries', params],
    queryFn: () =>
      api.get<{
        series: {
          date: string;
          posts: number;
          engagement: number;
          likes: number;
          comments: number;
          shares: number;
          views: number;
        }[];
      }>(
        buildQuery('/api/stats/timeseries', params),
      ),
  });

  const breakdowns = useQuery({
    queryKey: ['breakdowns', params],
    queryFn: () => api.get<BreakdownsResponse>(buildQuery('/api/stats/breakdowns', params)),
  });

  /*
   * الأعمدة الصغيرة والاتجاه من السلسلة المعروضة نفسها.
   *
   * ولا يُطلب استعلامٌ ثانٍ لفترةٍ سابقة: الشارة تقول صراحةً إنّها تقارن
   * نصفَي النافذة المفتوحة، فيبقى ما يُعرض مطابقاً لما حُسب.
   *
   * والسلسلة تحمل المقاييس الستّة كلّها — فلا بطاقة تحمل أعمدةً مستعارة
   * من مقياسٍ آخر لأن مقياسها لم يُطلب.
   */
  const series = timeseries.data?.series ?? [];
  const seriesOf = (pick: (point: (typeof series)[number]) => number) => series.map(pick);

  const postsSeries = seriesOf((point) => point.posts);
  const engagementSeries = seriesOf((point) => point.engagement);
  const likesSeries = seriesOf((point) => point.likes);
  const commentsSeries = seriesOf((point) => point.comments);
  const sharesSeries = seriesOf((point) => point.shares);
  const viewsSeries = seriesOf((point) => point.views);

  const stats = overview.data;
  const isEmpty = stats && stats.totalPosts === 0;

  return (
    <>
      <PageHeader
        hero
        eyebrow="لوحة التشغيل"
        title="النظرة العامة"
        description="ملخص نشاط المنصات المرصودة خلال الفترة المحددة"
        action={
          <Link href="/reports">
            <Button variant="secondary">
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              التقارير والتصدير
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

      {overview.isPending ? (
        <SkeletonCards count={6} className="mb-4 lg:grid-cols-3" />
      ) : overview.isError ? (
        <Card className="mb-4">
          <ErrorState
            description={
              overview.error instanceof ApiClientError
                ? overview.error.message
                : 'تعذّر تحميل الإحصائيات'
            }
            action={
              <Button variant="secondary" onClick={() => overview.refetch()}>
                إعادة المحاولة
              </Button>
            }
          />
        </Card>
      ) : stats ? (
        <>
          {/*
            بطاقاتٌ متساوية، لا شبكة Bento.

            كانت المساحة تتبع الأهمية: «إجمالي المنشورات» أوسع من «عدد
            المنصات» لأنه الرقم الذي يُفتح النظام من أجله. وهي فكرةٌ صحيحة
            على الورق، وعلى الشاشة تُنتج صفّاً غير مستقيم تقفز فيه أحجام
            البطاقات بلا قاعدة تُقرأ.

            والتساوي يقول ما هو أصدق: هذه ستّة مقاييس من عائلة واحدة،
            وأهميتها تختلف باختلاف من ينظر ومتى — لا بقرارٍ مثبّت في
            التخطيط.
          */}
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Reveal index={0} className="h-full">
            <StatCard
              label="إجمالي المنشورات"
              value={stats.totalPosts}
              hint={`${formatNumber(stats.postsToday)} اليوم · ${formatNumber(stats.postsThisWeek)} هذا الأسبوع`}
              icon={METRIC_ICONS.posts}
              href="/posts"
              tint="amber"
              spark={postsSeries}
              trend={halfOverHalfChange(postsSeries)}
            />
            </Reveal>
            <Reveal index={1} className="h-full">
            <StatCard
              label="عدد الحسابات"
              value={stats.accountsCount}
              hint="الحسابات المرصودة النشطة"
              icon={METRIC_ICONS.accounts}
              href="/accounts"
              tint="mint"
            />
            </Reveal>
            <Reveal index={2} className="h-full">
            <StatCard
              label="عدد المنصات"
              value={stats.platformsCount}
              hint="المنصات المفعّلة"
              icon={METRIC_ICONS.platforms}
              href="/platforms"
              tint="sky"
              progress={
                stats.platformsTotal > 0
                  ? (stats.platformsCount / stats.platformsTotal) * 100
                  : undefined
              }
            />
            </Reveal>
            <Reveal index={3} className="h-full">
            <StatCard
              label="إجمالي التفاعل"
              value={stats.totalEngagement}
              hint={`معدل ${formatNumber(stats.engagementRate)} لكل منشور`}
              icon={METRIC_ICONS.engagement}
              compact
              tint="teal"
              spark={engagementSeries}
              trend={halfOverHalfChange(engagementSeries)}
            />
            </Reveal>
            <Reveal index={4} className="h-full sm:col-span-2">
            <HighlightCard
              label="أكثر منشور تفاعلاً"
              title={
                stats.topPost ? truncate(stats.topPost.text, 110) || 'منشور بلا نص' : 'لا يوجد بعد'
              }
              meta={
                stats.topPost
                  ? `${stats.topPost.accountName} — ${stats.topPost.platformName}`
                  : undefined
              }
              value={stats.topPost?.engagementTotal}
              valueLabel="تفاعل"
              href={stats.topPost ? `/posts/${stats.topPost.id}` : undefined}
              tint="amber"
              icon={METRIC_ICONS.engagement}
              thumbnail={stats.topPost?.thumbnailUrl}
              thumbnailKey={stats.topPost?.mediaKey}
            />
            </Reveal>
            <Reveal index={5} className="h-full sm:col-span-2">
            <HighlightCard
              label="أكثر منصة نشاطاً"
              title={stats.topPlatform?.name ?? 'لا يوجد بعد'}
              meta="حسب عدد المنشورات في الفترة"
              value={stats.topPlatform?.postsCount}
              valueLabel="منشور"
              href={stats.topPlatform ? `/platforms/${stats.topPlatform.id}` : undefined}
              tint="sky"
              icon={METRIC_ICONS.platforms}
              /*
               * حصّة المنصة من منشورات الفترة — رقمٌ محسوب لا شريطٌ زخرفي.
               * «٣٧ ألف منشور» لا تقول أكثيرٌ هي أم قليل حتى تُنسب إلى
               * مجموعٍ، والنسبة مكتوبةٌ بجانب الشريط فلا يقع المعنى على
               * طوله وحده.
               */
              share={
                stats.totalPosts > 0 && stats.topPlatform
                  ? (stats.topPlatform.postsCount / stats.totalPosts) * 100
                  : undefined
              }
            />
            </Reveal>
          </div>

          {/* مجاميع التفاعل التفصيلية */}
          <StatGrid count={4} className="mb-4">
            <StatCard
              label="الإعجابات"
              tint="mint"
              value={stats.totalLikes}
              icon={METRIC_ICONS.likes}
              compact
              spark={likesSeries}
              trend={halfOverHalfChange(likesSeries)}
            />
            <StatCard
              label="التعليقات"
              tint="violet"
              value={stats.totalComments}
              icon={METRIC_ICONS.comments}
              compact
              spark={commentsSeries}
              trend={halfOverHalfChange(commentsSeries)}
            />
            <StatCard
              label="المشاركات"
              tint="sky"
              value={stats.totalShares}
              icon={METRIC_ICONS.shares}
              compact
              spark={sharesSeries}
              trend={halfOverHalfChange(sharesSeries)}
            />
            <StatCard
              label="المشاهدات"
              tint="rose"
              value={stats.totalViews}
              icon={METRIC_ICONS.views}
              compact
              spark={viewsSeries}
              trend={halfOverHalfChange(viewsSeries)}
            />
          </StatGrid>
        </>
      ) : null}

      {isEmpty ? (
        <Card>
          <EmptyState
            title="لا توجد منشورات في هذه الفترة"
            description="أضف حسابات من لوحة الإدارة وشغّل عملية استخراج، أو وسّع النطاق الزمني للفلتر."
            action={
              <Link href="/admin/accounts">
                <Button variant="secondary">إدارة الحسابات</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <TimelineChart
              title="نشاط النشر عبر الزمن"
              description="عدد المنشورات في كل يوم"
              data={timeseries.data?.series ?? []}
              metric="posts"
            />
            <TimelineChart
              title="التفاعل عبر الزمن"
              description="مجموع الإعجابات والتعليقات والمشاركات والحفظ"
              data={timeseries.data?.series ?? []}
              metric="engagement"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <DonutChart
              title="توزيع المنشورات حسب المنصة"
              data={(breakdowns.data?.byPlatform ?? []).map((item) => ({
                label: item.name,
                value: item.posts,
              }))}
            />
            <SentimentChart
              data={breakdowns.data?.bySentiment ?? []}
              labels={SENTIMENT_LABELS}
              description="تحليل مبدئي بقواعد لغوية"
            />
            <ComparisonBars
              title="أنواع المنشورات"
              data={(breakdowns.data?.byType ?? []).map((item) => ({
                label: POST_TYPE_LABELS[item.type as keyof typeof POST_TYPE_LABELS] ?? item.type,
                value: item.posts,
              }))}
              valueLabel="منشور"
              height={260}
            />
          </div>

          {/*
            القسمان يحلّان محلّ جدولين كانا هنا: «أكثر الحسابات نشراً»
            و«أعلى المنشورات تفاعلاً».

            والجدول يُجيب سؤالاً واحداً بترتيبٍ ثابت لا يملك القارئ تغييره:
            «الأكثر نشراً» و«الأعلى تفاعلاً» سؤالان مختلفان، وحسابٌ ينشر
            مئة منشور باهت يتصدّر الأوّل ويغيب عن الثاني. فصار المقياس
            يُبدَّل بقرصٍ واحد، وصار المنشور يُعرض ببطاقته لا بسطرٍ من نصّ.
          */}
          <TopPostsSection params={params} />

          <TopAccountsSection params={params} />
        </div>
      )}
    </>
  );
}
