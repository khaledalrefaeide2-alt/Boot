'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, Printer } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Reveal } from '@/components/motion/reveal';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { HighlightCard, METRIC_ICONS, StatCard, StatGrid } from '@/components/ui/stat-card';
import { TopPostsSection } from '@/components/sections/top-posts-section';
import { TopAccountsSection } from '@/components/sections/top-accounts-section';
import { EmptyState, ErrorState, SkeletonCards } from '@/components/ui/states';
import {
  FilterBar,
  EMPTY_FILTERS,
  filtersToParams,
  type PostFilterState,
} from '@/components/filters/filter-bar';
import { useFilterOptions, EMPTY_OPTIONS } from '@/lib/hooks/use-filters';
import { TimelineChart } from '@/components/charts/timeline-chart';
import {
  ComparisonBars,
  DonutChart,
  SentimentChart,
  WordCloud,
} from '@/components/charts/distribution-charts';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import { formatNumber, halfOverHalfChange, truncate } from '@/lib/utils';
import { POST_TYPE_LABELS, SENTIMENT_LABELS, languageLabel } from '@/lib/domain/constants';

/*
 * شاشةٌ واحدة بدل شاشتين.
 *
 * كانت «النظرة العامة» و«الإحصائيات» تقرآن الاستعلامات نفسها وتعرضان
 * أكثرها مرّتين: المقاييس، ورسما الزمن، وتوزيع المنصة، وتوزيع الموقف،
 * وأبرز المنشورات — كلّها في الشاشتين. والفرق بينهما لم يكن في المحتوى
 * بل في ترتيبه، فكان الموظّف يفتح الأولى ثم الثانية ليجد ما رآه للتوّ.
 *
 * ★ ودمجُهما ليس لصقاً: ما تكرّر حُذف أحد وجهيه، وأُبقي الأغنى.
 *
 *   «أكثر الحسابات نشراً» كان جدولاً ثابتاً هنا وقسماً بمقياسٍ قابل
 *   للتبديل هناك — فبقي القسم. و«أنواع المنشورات» كان قرصاً هنا وأعمدةً
 *   هناك — فبقي القرص، لأن جاريه في الصفّ قرصان.
 *
 * وما انفرد به الوجه المحذوف انتقل كما هو: عدد الحسابات، وعدد المنصات،
 * وأكثر منشور تفاعلاً، وأكثر منصة نشاطاً.
 */

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

interface SeriesPoint {
  date: string;
  posts: number;
  engagement: number;
  likes: number;
  comments: number;
  shares: number;
  views: number;
}

interface BreakdownsResponse {
  byPlatform: { id: string; name: string; posts: number; engagement: number }[];
  byType: { type: string; posts: number }[];
  bySentiment: { sentiment: string; posts: number }[];
  byTopic: { id: string | null; name: string; posts: number }[];
  byLanguage: { language: string | null; posts: number }[];
  byCountry: { country: string; posts: number }[];
}

export function AnalyticsClient() {
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
      api.get<{ series: SeriesPoint[] }>(buildQuery('/api/stats/timeseries', params)),
  });

  const breakdowns = useQuery({
    queryKey: ['breakdowns', params],
    queryFn: () => api.get<BreakdownsResponse>(buildQuery('/api/stats/breakdowns', params)),
  });

  const top = useQuery({
    queryKey: ['top', params],
    queryFn: () =>
      api.get<{
        hashtags: { tag: string; count: number }[];
        words: { word: string; count: number }[];
      }>(buildQuery('/api/stats/top', params)),
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
  const seriesOf = (pick: (point: SeriesPoint) => number) => series.map(pick);

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
        title="الإحصائيات"
        description="ملخّص نشاط المنصات المرصودة وتحليله التفصيلي خلال الفترة المحددة"
        action={
          <>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden />
              طباعة أو حفظ PDF
            </Button>
            <Link href="/reports">
              <Button>
                <FileSpreadsheet className="h-4 w-4" aria-hidden />
                التقارير والتصدير
              </Button>
            </Link>
          </>
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
        <SkeletonCards count={8} className="mb-4" />
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
            اثنتا عشرة بطاقة في شبكةٍ واحدة متساوية.
            الحجم أوّلاً (كم نُشر، ومن أين)، ثم التفاعل (كم استُقبل).
          */}
          <StatGrid count={12} className="mb-4">
            <StatCard
              label="إجمالي المنشورات"
              value={stats.totalPosts}
              icon={METRIC_ICONS.posts}
              href="/posts"
              spark={postsSeries}
              trend={halfOverHalfChange(postsSeries)}
            />
            <StatCard label="منشورات اليوم" value={stats.postsToday} icon={METRIC_ICONS.today} />
            <StatCard
              label="منشورات الأسبوع"
              value={stats.postsThisWeek}
              icon={METRIC_ICONS.week}
            />
            <StatCard label="منشورات الشهر" value={stats.postsThisMonth} icon={METRIC_ICONS.month} />
            <StatCard
              label="عدد الحسابات"
              value={stats.accountsCount}
              hint="الحسابات المرصودة النشطة"
              icon={METRIC_ICONS.accounts}
              href="/accounts"
            />
            <StatCard
              label="عدد المنصات"
              value={stats.platformsCount}
              hint="المنصات المفعّلة"
              icon={METRIC_ICONS.platforms}
              href="/platforms"
              progress={
                stats.platformsTotal > 0
                  ? (stats.platformsCount / stats.platformsTotal) * 100
                  : undefined
              }
            />
            <StatCard
              label="الإعجابات"
              value={stats.totalLikes}
              icon={METRIC_ICONS.likes}
              compact
              spark={likesSeries}
              trend={halfOverHalfChange(likesSeries)}
            />
            <StatCard
              label="التعليقات"
              value={stats.totalComments}
              icon={METRIC_ICONS.comments}
              compact
              spark={commentsSeries}
              trend={halfOverHalfChange(commentsSeries)}
            />
            <StatCard
              label="المشاركات"
              value={stats.totalShares}
              icon={METRIC_ICONS.shares}
              compact
              spark={sharesSeries}
              trend={halfOverHalfChange(sharesSeries)}
            />
            <StatCard
              label="المشاهدات"
              value={stats.totalViews}
              icon={METRIC_ICONS.views}
              compact
              spark={viewsSeries}
              trend={halfOverHalfChange(viewsSeries)}
            />
            <StatCard
              label="إجمالي التفاعل"
              value={stats.totalEngagement}
              icon={METRIC_ICONS.engagement}
              compact
              spark={engagementSeries}
              trend={halfOverHalfChange(engagementSeries)}
            />
            <StatCard
              label="معدل التفاعل لكل منشور"
              value={formatNumber(stats.engagementRate)}
              icon={METRIC_ICONS.rate}
            />
          </StatGrid>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <Reveal index={0} className="h-full">
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
            <Reveal index={1} className="h-full">
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
              data={series}
              metric="posts"
            />
            <TimelineChart
              title="التفاعل عبر الزمن"
              description="مجموع الإعجابات والتعليقات والمشاركات والحفظ"
              data={series}
              metric="engagement"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <DonutChart
              title="حسب المنصة"
              data={(breakdowns.data?.byPlatform ?? []).map((item) => ({
                label: item.name,
                value: item.posts,
              }))}
            />
            <SentimentChart data={breakdowns.data?.bySentiment ?? []} labels={SENTIMENT_LABELS} />
            <DonutChart
              title="حسب نوع المنشور"
              data={(breakdowns.data?.byType ?? []).map((item) => ({
                label: POST_TYPE_LABELS[item.type as keyof typeof POST_TYPE_LABELS] ?? item.type,
                value: item.posts,
              }))}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ComparisonBars
              title="أهم المواضيع"
              description="حسب التصنيف الموضوعي"
              data={(breakdowns.data?.byTopic ?? []).slice(0, 10).map((item) => ({
                label: item.name,
                value: item.posts,
              }))}
              valueLabel="منشور"
              colorByIndex
            />
            <ComparisonBars
              title="أكثر الهاشتاغات استخداماً"
              data={(top.data?.hashtags ?? []).slice(0, 12).map((item) => ({
                label: `#${item.tag}`,
                value: item.count,
              }))}
              valueLabel="مرة"
            />
          </div>

          <WordCloud
            words={top.data?.words ?? []}
            description="خريطة حرارية للكلمات الأكثر تكراراً في نصوص المنشورات"
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <ComparisonBars
              title="حسب اللغة"
              data={(breakdowns.data?.byLanguage ?? []).map((item) => ({
                label: languageLabel(item.language),
                value: item.posts,
              }))}
              valueLabel="منشور"
              height={200}
            />
            <ComparisonBars
              title="حسب الدولة أو الموقع"
              description={
                (breakdowns.data?.byCountry.length ?? 0) === 0
                  ? 'لم تُرجع المنصات بيانات موقع لهذه المنشورات'
                  : undefined
              }
              data={(breakdowns.data?.byCountry ?? []).slice(0, 10).map((item) => ({
                label: item.country,
                value: item.posts,
              }))}
              valueLabel="منشور"
              height={200}
            />
          </div>

          {/*
            المنشور ببطاقته والحساب بقسمه — لا جدولين.

            الجدول يُجيب سؤالاً واحداً بترتيبٍ ثابت لا يملك القارئ تغييره:
            «الأكثر نشراً» و«الأعلى تفاعلاً» سؤالان مختلفان، وحسابٌ ينشر
            مئة منشور باهت يتصدّر الأوّل ويغيب عن الثاني. والقسمان
            يُبدَّل مقياسهما بقرصٍ واحد.
          */}
          <TopPostsSection params={params} />

          <TopAccountsSection params={params} />
        </div>
      )}
    </>
  );
}
