'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, FileText, Printer } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Reveal } from '@/components/motion/reveal';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
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
import { PlatformShareBars } from '@/components/charts/platform-share';
import {
  ComparisonBars,
  DonutChart,
  SentimentChart,
  WordCloud,
} from '@/components/charts/distribution-charts';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import { formatNumber, halfOverHalfChange, truncate } from '@/lib/utils';
import {
  DATE_RANGES,
  POST_TYPE_LABELS,
  SENTIMENT_LABELS,
  languageLabel,
} from '@/lib/domain/constants';
import { LinkButton } from '@/components/ui/link-button';

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
  byPlatform: { id: string; name: string; code: string; posts: number; engagement: number }[];
  byType: { type: string; posts: number }[];
  bySentiment: { sentiment: string; posts: number }[];
  byTopic: { id: string | null; name: string; posts: number }[];
  byLanguage: { language: string | null; posts: number }[];
  byCountry: { country: string; posts: number }[];
}

/*
 * الفترة المعروضة — تُكتب في رأس كلّ رسم.
 *
 * المرجع يضع في رأس الرسم قائمةً بالفترة. وهنا الفترةُ واحدةٌ للصفحة كلّها
 * (من شريط الفلاتر)، وقائمةٌ ثانية في الرسم تعني فترتين في صفحةٍ واحدة:
 * بطاقاتٌ عن ثلاثين يوماً ورسمٌ بجانبها عن سبعة، ولا يعرف القارئ أيّهما
 * يقرأ. فالرأس يقول الفترة ولا يغيّرها — شارةٌ لا قائمة.
 */
function PeriodTag({ range }: { range: string }) {
  const label =
    range === 'all' ? 'كل الفترات' : (DATE_RANGES.find((item) => item.value === range)?.label ?? range);
  return (
    <span className="inline-flex h-9 items-center gap-2 rounded-control border border-border px-3 text-xs font-medium text-muted-foreground">
      <CalendarDays className="h-4 w-4" aria-hidden />
      {label}
    </span>
  );
}

export function AnalyticsClient({ canExport = false }: { canExport?: boolean }) {
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
  /*
   * معدّل التفاعل لكلّ منشور يوماً بيوم — سلسلةُ المقياس نفسه لا مستعارة.
   * والاتجاه لا يُحسب منها: متوسّطُ نسبٍ يومية غيرُ نسبة الفترة كلّها،
   * وشارةٌ تقول «+١٢٪» عن متوسّطٍ كهذا تقول ما لم يُحسب.
   */
  const rateSeries = seriesOf((point) => (point.posts > 0 ? point.engagement / point.posts : 0));
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
        title="الإحصائيات"
        description="نظرة شاملة على أداء الحسابات والمنصات خلال الفترة المحددة"
        action={
          <>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer aria-hidden />
              طباعة
            </Button>
            {/*
              «تصدير التقرير» يصدّر فعلاً — بفلاتر هذه الصفحة.

              كان الزرّ يفتح صفحة التقارير، فيضبط الموظّف فلاتره هناك من
              جديد. والمسار نفسه (`/api/reports/export`) يقبل الفلاتر ذاتها،
              فيُطلب منه مباشرةً ما يراه الموظّف الآن. والصلاحية تُحرس في
              الخادم؛ وهنا يُخفى الزرّ عمّن لا يملكها فلا يضغط زرّاً يُرفض.
            */}
            {canExport && (
              <a
                href={buildQuery('/api/reports/export', { ...params, format: 'excel' })}
                className={buttonVariants({ variant: 'primary' })}
              >
                <FileText aria-hidden />
                تصدير التقرير
              </a>
            )}
          </>
        }
      />

      <FilterBar
        className="mb-6"
        filters={filters}
        options={optionsQuery.data ?? EMPTY_OPTIONS}
        onChange={setFilters}
        onReset={() => setFilters(EMPTY_FILTERS)}
      />

      {overview.isPending ? (
        <SkeletonCards count={12} className="mb-6" />
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
          <StatGrid count={12} className="mb-6">
            <StatCard
              label="إجمالي المنشورات"
              value={stats.totalPosts}
              icon={METRIC_ICONS.posts}
              tint="sky"
              href="/posts"
              spark={postsSeries}
              trend={halfOverHalfChange(postsSeries)}
            />
            {/*
              الفترة مكتوبةٌ تحت الرقم: «منشورات الأسبوع» تُفهم أسبوعاً
              تقويمياً، والرقم عن آخر سبعة أيام. والفرق يغيّر القراءة يوم
              السبت مثلاً — فيُقال ما حُسب فعلاً.
            */}
            <StatCard
              label="منشورات اليوم"
              value={stats.postsToday}
              icon={METRIC_ICONS.today}
              hint="منذ بداية اليوم"
            />
            <StatCard
              label="منشورات الأسبوع"
              value={stats.postsThisWeek}
              icon={METRIC_ICONS.week}
              tint="sky"
              hint="آخر 7 أيام"
            />
            <StatCard
              label="منشورات الشهر"
              value={stats.postsThisMonth}
              icon={METRIC_ICONS.month}
              tint="mint"
              hint="آخر 30 يوماً"
            />
            <StatCard
              label="عدد الحسابات"
              value={stats.accountsCount}
              hint="الحسابات المرصودة النشطة"
              icon={METRIC_ICONS.accounts}
              tint="violet"
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
              spark={rateSeries}
            />
          </StatGrid>

          <div className="mb-6 grid gap-4 sm:grid-cols-2">
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
              <LinkButton href="/admin/accounts" variant="secondary">إدارة الحسابات</LinkButton>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {/*
            الصفّ الأوّل كما في المرجع: التوزيع على المنصّات في البداية
            (يمين) وتطوّر التفاعل أعرض منه في النهاية (يسار). والتفاعل أعرض
            لأنّه سلسلةٌ زمنية تحتاج طولاً لتُقرأ، والتوزيع ثلاثة أسطر.
          */}
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="min-w-0 lg:col-span-2">
              <PlatformShareBars
                data={breakdowns.data?.byPlatform ?? []}
                action={<PeriodTag range={filters.range} />}
              />
            </div>
            <div className="min-w-0 lg:col-span-3">
              <TimelineChart
                title="تطور التفاعل"
                description="مجموع الإعجابات والتعليقات والمشاركات والحفظ في كل يوم"
                data={series}
                metric="engagement"
                action={<PeriodTag range={filters.range} />}
              />
            </div>
          </div>

          {/*
            التوزيع على المنصّات لا يتكرّر قرصاً هنا: الأشرطة أعلاه تقوله
            بأرقامه ونِسَبه، وقرصٌ بجوارها يعرض الشيء نفسه بشكلٍ أضعف.
          */}
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="min-w-0 lg:col-span-3">
              <TimelineChart
                title="نشاط النشر عبر الزمن"
                description="عدد المنشورات في كل يوم"
                data={series}
                metric="posts"
              />
            </div>
            <div className="min-w-0 lg:col-span-2">
              <SentimentChart data={breakdowns.data?.bySentiment ?? []} labels={SENTIMENT_LABELS} />
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <div className="min-w-0 lg:col-span-2">
              <DonutChart
                title="حسب نوع المنشور"
                data={(breakdowns.data?.byType ?? []).map((item) => ({
                  label: POST_TYPE_LABELS[item.type as keyof typeof POST_TYPE_LABELS] ?? item.type,
                  value: item.posts,
                }))}
              />
            </div>
            <div className="min-w-0 lg:col-span-3">
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
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <ComparisonBars
              title="أكثر الهاشتاغات استخداماً"
              data={(top.data?.hashtags ?? []).slice(0, 12).map((item) => ({
                label: `#${item.tag}`,
                value: item.count,
              }))}
              valueLabel="مرة"
            />
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

          <WordCloud
            words={top.data?.words ?? []}
            description="خريطة حرارية للكلمات الأكثر تكراراً في نصوص المنشورات"
          />

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
