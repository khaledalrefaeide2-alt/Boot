'use client';

import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Activity,
  AtSign,
  BarChart3,
  Brain,
  CalendarClock,
  Eye,
  Flame,
  Gauge,
  Hash,
  Languages,
  Layers,
  Maximize2,
  Minimize2,
  RefreshCw,
  ShieldAlert,
  Shapes,
  Smile,
  Tags,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/field';
import { Segmented } from '@/components/ui/button-group';
import { Alert } from '@/components/ui/alert';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { METRIC_ICONS, StatCard, StatGrid } from '@/components/ui/stat-card';
import { ChartFrame, ChartLegend } from '@/components/charts/chart-kit';
import { PlatformMark } from '@/components/charts/platform-share';
import {
  bucketLabel,
  DataTable,
  OrdinalColumns,
  RankedBars,
  SegmentedBar,
  TimeArea,
  TimeBars,
  WeekHeatmap,
  type RankedRow,
} from '@/components/charts/ops-charts';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import { useFilterOptions } from '@/lib/hooks/use-filters';
import {
  AUTHOR_STANCE,
  CONTENT_LABELS,
  ENTITY_TYPE_LABELS,
  languageLabel,
  POST_TYPE_LABELS,
  RUMOR_STATUS,
  SENTIMENT_LABELS,
  SEVERITY_LEVELS,
} from '@/lib/domain/constants';
import { cn, formatCompactNumber, formatDateTime, formatNumber, formatPercent, halfOverHalfChange, truncate } from '@/lib/utils';
import type { OpsDashboard } from '@/lib/queries/ops';
import type { EntityType, PostType } from '@/generated/prisma';

/** فترة التحديث التلقائي لشاشة العرض */
const REFRESH_MS = 60_000;

const RANGE_OPTIONS = [
  { value: 'today', label: 'اليوم' },
  { value: '7d', label: '7 أيام' },
  { value: '30d', label: '30 يوماً' },
  { value: '90d', label: '90 يوماً' },
] as const;
type OpsRange = (typeof RANGE_OPTIONS)[number]['value'];

const RANGE_TEXT: Record<OpsRange, string> = {
  today: 'اليوم',
  '7d': 'آخر 7 أيام',
  '30d': 'آخر 30 يوماً',
  '90d': 'آخر 90 يوماً',
};

/*
 * ألوان المشاعر — مقياسٌ مرتّب بطرفين ووسطٍ رمادي.
 * وهي ألوان المنصة نفسها في كلّ شاشة، فلا يتعلّم الناظر لوناً هنا يخالف
 * ما تعلّمه في بطاقة المنشور.
 */
const SENTIMENT_PARTS = [
  { key: 'NEGATIVE', color: 'var(--chart-negative)' },
  { key: 'MIXED', color: 'var(--chart-mixed)' },
  { key: 'NEUTRAL', color: 'var(--chart-neutral)' },
  { key: 'POSITIVE', color: 'var(--chart-positive)' },
] as const;

/* نوع الكيان هويةٌ لا مقدار — ثلاث خانات بترتيبها الثابت، و«أخرى» رمادية */
const ENTITY_COLORS: Record<string, string> = {
  PERSON: 'var(--chart-1)',
  ORGANIZATION: 'var(--chart-2)',
  PLACE: 'var(--chart-3)',
  OTHER: 'var(--chart-neutral)',
};

function Section({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="flex items-center gap-2 text-base font-bold text-heading sm:text-lg">
        <Icon className="h-5 w-5 text-primary-text" aria-hidden />
        {title}
      </h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

const share = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

/**
 * غرفة العمليات — رسومٌ بيانية وحدها.
 *
 * ★ كلّ ما في المنصة ممّا يُرسم، في شاشةٍ واحدة تُعلَّق على الجدار.
 *
 *   النشاط عبر الزمن وساعات النشر، والمشاعر والخطورة والادّعاءات ووسوم
 *   المحتوى، والمنصات والمجموعات والحسابات، وأنواع المنشورات ولغاتها
 *   ووسومها وكياناتها وأحداثها — وللمشغّلين صحّة الاستخراج والتصنيف.
 *
 * ★ وفلترٌ واحد فوقها كلّها.
 *
 *   الفترة والمنصة والمجموعة في صفٍّ واحد، وكلّ رسمٍ يُعاد على الشريحة
 *   نفسها — فلا يقول رسمٌ «٤١٢» وجاره «٤١٣». وعند التحديث تبقى الرسوم
 *   مكانها بشفافيةٍ أخفّ، بلا هيكلٍ يومض ولا قفزٍ في الصفحة.
 */
export function OpsRoomClient() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [range, setRange] = useState<OpsRange>('7d');
  const [platformId, setPlatformId] = useState('');
  const [groupId, setGroupId] = useState('');
  const options = useFilterOptions();

  const query = useQuery({
    queryKey: ['ops-dashboard', range, platformId, groupId],
    queryFn: () =>
      api.get<OpsDashboard>(
        buildQuery('/api/stats/ops', {
          range,
          ...(platformId ? { platformId } : {}),
          ...(groupId ? { groupId } : {}),
        }),
      ),
    refetchInterval: REFRESH_MS,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => undefined);
    } else {
      await document.exitFullscreen().catch(() => undefined);
    }
  }

  const data = query.data;

  return (
    <div className="ops-room space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">غرفة العمليات</h1>
          <p className="text-sm text-muted-foreground">
            كلّ ما في المنصة مرسوماً — {RANGE_TEXT[range]}، ويُحدَّث تلقائياً كل دقيقة
            {data && <span className="ms-2">· آخر تحديث {formatDateTime(data.generatedAt)}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <Badge tone="success">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-success" aria-hidden />
            مباشر
          </Badge>
          <Button size="icon" variant="secondary" onClick={() => query.refetch()} aria-label="تحديث الآن">
            <RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin')} aria-hidden />
          </Button>
          <Button variant="secondary" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize2 className="h-4 w-4" aria-hidden /> : <Maximize2 className="h-4 w-4" aria-hidden />}
            {isFullscreen ? 'إنهاء العرض' : 'ملء الشاشة'}
          </Button>
        </div>
      </header>

      {/* صفّ الفلاتر الوحيد — الفترة أوّلاً، وكلّ ما تحته يتبعه */}
      <div className="flex flex-wrap items-center gap-3 no-print">
        <Segmented label="الفترة" value={range} onChange={setRange} options={RANGE_OPTIONS.map((o) => ({ ...o }))} />
        <Select
          aria-label="المنصة"
          wrapperClassName="w-full sm:w-48"
          value={platformId}
          onChange={(event) => setPlatformId(event.target.value)}
        >
          <option value="">كل المنصات</option>
          {(options.data?.platforms ?? []).map((platform) => (
            <option key={platform.id} value={platform.id}>
              {platform.name}
            </option>
          ))}
        </Select>
        {(options.data?.groups.length ?? 0) > 0 && (
          <Select
            aria-label="مجموعة الحسابات"
            wrapperClassName="w-full sm:w-52"
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
          >
            <option value="">كل المجموعات</option>
            {(options.data?.groups ?? []).map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {query.isPending ? (
        <LoadingState message="جارٍ تحميل رسوم غرفة العمليات…" />
      ) : query.isError || !data ? (
        <ErrorState
          description={query.error instanceof ApiClientError ? query.error.message : 'تعذّر جلب بيانات غرفة العمليات'}
          action={
            <Button variant="secondary" onClick={() => query.refetch()}>
              إعادة المحاولة
            </Button>
          }
        />
      ) : (
        <div className={cn('space-y-8 transition-opacity duration-200', query.isPlaceholderData && 'opacity-60')}>
          {data.truncated && (
            <Alert tone="warning">
              الفترة المختارة أكبر من حدّ القراءة الواحدة، فالرسوم مبنيّة على أحدث المنشورات فيها لا على كلّها. اختر فترةً أقصر لأرقامٍ كاملة.
            </Alert>
          )}
          <Dashboard data={data} />
        </div>
      )}
    </div>
  );
}

function Dashboard({ data }: { data: OpsDashboard }) {
  const { totals, series, bucket } = data;
  const analyzed = data.coverage.analyzed;
  const negative = data.sentiment.find((s) => s.key === 'NEGATIVE')?.count ?? 0;
  const highRisk = (data.severity[4] ?? 0) + (data.severity[5] ?? 0);
  const rows = series as unknown as Record<string, string | number>[];
  const timeRows = (keys: string[]) =>
    series.map((point) => [
      bucketLabel(point.date, bucket, true),
      ...keys.map((key) => Number((point as unknown as Record<string, number>)[key] ?? 0)),
    ]);
  const isEmpty = totals.posts === 0;

  const platformRows: RankedRow[] = data.platforms.map((p) => ({
    key: p.id,
    label: p.name,
    value: p.posts,
    swatch: <PlatformMark code={p.code} className="h-4 w-4 rounded-sm" />,
  }));

  return (
    <>
      {/* المؤشّرات — رقمٌ وخطّ اتجاهه، لا رسمَ من عمودٍ واحد */}
      <StatGrid count={5}>
        <StatCard
          label="المنشورات"
          value={totals.posts}
          icon={METRIC_ICONS.posts}
          spark={series.map((p) => p.posts)}
          trend={halfOverHalfChange(series.map((p) => p.posts))}
        />
        <StatCard
          label="التفاعل"
          value={totals.engagement}
          icon={METRIC_ICONS.engagement}
          compact
          spark={series.map((p) => p.engagement)}
          trend={halfOverHalfChange(series.map((p) => p.engagement))}
        />
        <StatCard label="الحسابات النشطة" value={totals.activeAccounts} icon={METRIC_ICONS.accounts} hint="نشرت في الفترة" />
        <StatCard
          label="نسبة السلبي"
          value={formatPercent(share(negative, totals.posts), 1)}
          icon={Smile}
          tint="rose"
          spark={series.map((p) => p.negative)}
        />
        <StatCard
          label="عالية الخطورة"
          value={highRisk}
          icon={ShieldAlert}
          tint="amber"
          hint="خطورة ٤ و٥"
          spark={series.map((p) => p.highRisk)}
        />
      </StatGrid>

      <Section title="النشاط" icon={Activity}>
        <ChartFrame
          title="المنشورات"
          description={bucket === 'hour' ? 'عدد المنشورات في كل ساعة' : 'عدد المنشورات في كل يوم'}
          icon={BarChart3}
          className="md:col-span-2"
          isEmpty={isEmpty}
          height="auto"
          footer={<DataTable caption="المنشورات" columns={['الفترة', 'المنشورات']} rows={timeRows(['posts'])} />}
        >
          <TimeBars data={rows} bucket={bucket} series={[{ key: 'posts', label: 'المنشورات', color: 'var(--chart-1)' }]} />
        </ChartFrame>
        <ChartFrame
          title="المشاهدات"
          description="بمقامٍ وحدها — لا تُكدَّس مع التفاعل"
          icon={Eye}
          isEmpty={totals.views === 0}
          height="auto"
          footer={<DataTable caption="المشاهدات" columns={['الفترة', 'المشاهدات']} rows={timeRows(['views'])} />}
        >
          <TimeArea data={rows} bucket={bucket} dataKey="views" label="المشاهدات" />
        </ChartFrame>
        <ChartFrame
          title="التفاعل"
          description="الإعجابات والتعليقات والمشاركات"
          icon={Flame}
          className="md:col-span-2 xl:col-span-3"
          isEmpty={totals.engagement === 0}
          height="auto"
          footer={
            <DataTable
              caption="التفاعل"
              columns={['الفترة', 'إعجابات', 'تعليقات', 'مشاركات']}
              rows={timeRows(['likes', 'comments', 'shares'])}
            />
          }
        >
          <TimeBars
            data={rows}
            bucket={bucket}
            series={[
              { key: 'likes', label: 'الإعجابات', color: 'var(--chart-1)' },
              { key: 'comments', label: 'التعليقات', color: 'var(--chart-2)' },
              { key: 'shares', label: 'المشاركات', color: 'var(--chart-3)' },
            ]}
          />
        </ChartFrame>
        <ChartFrame
          title="متى يُنشر؟"
          description="أيام الأسبوع وساعات اليوم بتوقيتك — الأغمق أكثر نشراً"
          icon={CalendarClock}
          className="md:col-span-2 xl:col-span-3"
          isEmpty={isEmpty}
          height="auto"
        >
          <WeekHeatmap heat={data.heat} />
        </ChartFrame>
      </Section>

      <Section title="المشاعر والخطورة" icon={ShieldAlert}>
        <ChartFrame
          title="توزيع المشاعر"
          description={`${formatNumber(totals.posts)} منشوراً في الفترة`}
          icon={Smile}
          isEmpty={isEmpty}
          height="auto"
        >
          <SegmentedBar
            parts={[
              ...SENTIMENT_PARTS.map((part) => ({
                key: part.key,
                label: SENTIMENT_LABELS[part.key],
                value: data.sentiment.find((s) => s.key === part.key)?.count ?? 0,
                color: part.color,
              })),
              {
                key: 'UNKNOWN',
                label: SENTIMENT_LABELS.UNKNOWN,
                value: data.sentiment.find((s) => s.key === 'UNKNOWN')?.count ?? 0,
                color: 'var(--border-strong)',
              },
            ]}
          />
        </ChartFrame>
        <ChartFrame
          title="المشاعر عبر الزمن"
          description="سلبي ومحايد وإيجابي، وما سواها معاً"
          icon={Activity}
          className="md:col-span-2"
          isEmpty={isEmpty}
          height="auto"
          footer={
            <DataTable
              caption="المشاعر عبر الزمن"
              columns={['الفترة', 'سلبي', 'محايد', 'إيجابي', 'غير ذلك']}
              rows={timeRows(['negative', 'neutral', 'positive', 'other'])}
            />
          }
        >
          <TimeBars
            data={rows}
            bucket={bucket}
            series={[
              { key: 'negative', label: SENTIMENT_LABELS.NEGATIVE, color: 'var(--chart-negative)' },
              { key: 'neutral', label: SENTIMENT_LABELS.NEUTRAL, color: 'var(--chart-neutral)' },
              { key: 'positive', label: SENTIMENT_LABELS.POSITIVE, color: 'var(--chart-positive)' },
              { key: 'other', label: 'مختلط أو غير محسوم', color: 'var(--chart-mixed)' },
            ]}
          />
        </ChartFrame>
        <ChartFrame
          title="درجات الخطورة"
          description={`من ${formatNumber(analyzed)} منشوراً مصنّفاً — ${formatNumber(data.severity[0] ?? 0)} بلا مشكلة`}
          icon={Gauge}
          isEmpty={analyzed === 0}
          height="auto"
        >
          <OrdinalColumns
            items={[1, 2, 3, 4, 5].map((level) => ({
              key: String(level),
              short: SEVERITY_LEVELS[level]?.short ?? String(level),
              label: SEVERITY_LEVELS[level]?.label ?? '',
              value: data.severity[level] ?? 0,
              color: `var(--sev-${level})`,
            }))}
          />
        </ChartFrame>
        <ChartFrame
          title="الادّعاءات والشائعات"
          description={`${formatNumber(data.rumor.find((r) => r.key === 'NONE')?.count ?? 0)} منشوراً بلا ادّعاء`}
          icon={ShieldAlert}
          isEmpty={data.rumor.filter((r) => r.key !== 'NONE').length === 0}
          emptyMessage="لا ادّعاءات في هذه الفترة"
          height="auto"
        >
          <RankedBars
            unit="منشوراً"
            rows={(['UNVERIFIED_CLAIM', 'SUSPECTED_RUMOR', 'VERIFIED_MISINFORMATION'] as const).map((key, index) => ({
              key,
              label: RUMOR_STATUS[key]?.label ?? key,
              value: data.rumor.find((r) => r.key === key)?.count ?? 0,
              // درجاتٌ مرتّبة — الأشدّ أغمق، من تدرّج الخطورة نفسه
              color: `var(--sev-${[2, 3, 5][index]})`,
            }))}
          />
        </ChartFrame>
        <ChartFrame title="وسوم المحتوى" description="أكثر الوسوم في الفترة" icon={Tags} isEmpty={data.labels.length === 0} height="auto">
          <RankedBars
            unit="منشوراً"
            rows={data.labels.map((label) => ({
              key: label.key,
              label: CONTENT_LABELS[label.key]?.label ?? label.key,
              value: label.count,
            }))}
          />
        </ChartFrame>
        <ChartFrame title="موقف الكاتب" description="ممّا ينقله — لا من الجهات" icon={Users} isEmpty={data.stance.length === 0} height="auto">
          <RankedBars
            unit="منشوراً"
            rows={data.stance.map((stance) => ({
              key: stance.key,
              label: AUTHOR_STANCE[stance.key] ?? stance.key,
              value: stance.count,
            }))}
          />
        </ChartFrame>
        <ChartFrame
          title="تغطية التحليل"
          description={`${formatPercent(share(analyzed, totals.posts), 0)} من منشورات الفترة مصنّفة`}
          icon={Brain}
          className="md:col-span-2"
          isEmpty={isEmpty}
          height="auto"
        >
          <SegmentedBar
            parts={[
              { key: 'done', label: 'مصنّف', value: analyzed - data.coverage.review, color: 'var(--chart-1)' },
              { key: 'review', label: 'يحتاج مراجعة', value: data.coverage.review, color: 'var(--chart-2)' },
              { key: 'pending', label: 'بانتظار التصنيف', value: data.coverage.pending, color: 'var(--chart-neutral)' },
            ]}
          />
        </ChartFrame>
      </Section>

      <Section title="المصادر" icon={Layers}>
        <ChartFrame title="المنشورات حسب المنصة" icon={Layers} isEmpty={platformRows.length === 0} height="auto">
          <RankedBars unit="منشوراً" rows={platformRows} />
        </ChartFrame>
        <ChartFrame title="التفاعل حسب المنصة" icon={Flame} isEmpty={totals.engagement === 0} height="auto">
          <RankedBars
            format={formatCompactNumber}
            rows={[...data.platforms]
              .sort((a, b) => b.engagement - a.engagement)
              .map((p) => ({
                key: p.id,
                label: p.name,
                value: p.engagement,
                swatch: <PlatformMark code={p.code} className="h-4 w-4 rounded-sm" />,
              }))}
          />
        </ChartFrame>
        <ChartFrame title="حسب مجموعة الحسابات" icon={Shapes} isEmpty={data.groups.length === 0} height="auto">
          <RankedBars unit="منشوراً" rows={data.groups.map((g) => ({ key: g.id ?? 'none', label: g.name, value: g.posts }))} />
        </ChartFrame>
        <ChartFrame title="أنشط الحسابات" description="بعدد المنشورات" icon={Users} isEmpty={data.accounts.byPosts.length === 0} height="auto">
          <RankedBars unit="منشوراً" rows={data.accounts.byPosts.map((a) => ({ key: a.id, label: a.name, value: a.value }))} />
        </ChartFrame>
        <ChartFrame title="الأعلى تفاعلاً" description="مجموع تفاعل منشوراته" icon={Flame} isEmpty={data.accounts.byEngagement.length === 0} height="auto">
          <RankedBars
            format={formatCompactNumber}
            rows={data.accounts.byEngagement.map((a) => ({ key: a.id, label: a.name, value: a.value }))}
          />
        </ChartFrame>
        <ChartFrame
          title="متوسط التفاعل للمنشور"
          description="للحسابات التي نشرت ٣ منشورات فأكثر"
          icon={Gauge}
          isEmpty={data.accounts.byAverage.length === 0}
          height="auto"
        >
          <RankedBars
            format={formatCompactNumber}
            rows={data.accounts.byAverage.map((a) => ({ key: a.id, label: a.name, value: a.value }))}
          />
        </ChartFrame>
      </Section>

      <Section title="المحتوى" icon={Hash}>
        <ChartFrame title="أنواع المنشورات" icon={Layers} isEmpty={data.types.length === 0} height="auto">
          <RankedBars
            unit="منشوراً"
            rows={data.types.map((t) => ({ key: t.key, label: POST_TYPE_LABELS[t.key as PostType] ?? t.key, value: t.count }))}
          />
        </ChartFrame>
        <ChartFrame title="اللغات" icon={Languages} isEmpty={data.languages.length === 0} height="auto">
          <RankedBars unit="منشوراً" rows={data.languages.map((l) => ({ key: l.key, label: languageLabel(l.key), value: l.count }))} />
        </ChartFrame>
        <ChartFrame title="التصنيفات" icon={Shapes} isEmpty={data.topics.length === 0} height="auto">
          <RankedBars unit="منشوراً" rows={data.topics.map((t) => ({ key: t.key || 'none', label: t.name, value: t.count }))} />
        </ChartFrame>
        <ChartFrame title="أكثر الوسوم" icon={Hash} isEmpty={data.hashtags.length === 0} height="auto">
          <RankedBars unit="منشوراً" rows={data.hashtags.map((h) => ({ key: h.key, label: `#${h.key}`, value: h.count }))} />
        </ChartFrame>
        <ChartFrame
          title="أكثر الكيانات ذكراً"
          description="أشخاص ومؤسسات وأماكن"
          icon={AtSign}
          isEmpty={data.entities.length === 0}
          height="auto"
          footer={
            data.entities.length > 0 ? (
              <ChartLegend
                items={(['PERSON', 'ORGANIZATION', 'PLACE', 'OTHER'] as const)
                  .filter((type) => data.entities.some((e) => e.type === type))
                  .map((type) => ({ label: ENTITY_TYPE_LABELS[type as EntityType], color: ENTITY_COLORS[type] ?? 'var(--chart-neutral)' }))}
              />
            ) : undefined
          }
        >
          <RankedBars
            unit="منشوراً"
            rows={data.entities.map((e) => ({
              key: e.id,
              label: e.name,
              value: e.posts,
              color: ENTITY_COLORS[e.type] ?? 'var(--chart-neutral)',
            }))}
          />
        </ChartFrame>
        <ChartFrame title="أكبر الأحداث" description="عناقيد المنشورات المتقاربة" icon={Layers} isEmpty={data.stories.length === 0} height="auto">
          <RankedBars unit="منشوراً" rows={data.stories.map((s) => ({ key: s.id, label: truncate(s.headline, 70), value: s.posts }))} />
        </ChartFrame>
        {data.countries.length > 0 && (
          <ChartFrame title="الدول" icon={Languages} height="auto">
            <RankedBars unit="منشوراً" rows={data.countries.map((c) => ({ key: c.key, label: c.key, value: c.count }))} />
          </ChartFrame>
        )}
      </Section>

      {data.operations && (
        <Section title="التشغيل" icon={Workflow}>
          <ChartFrame
            title="عمليات الاستخراج"
            description="كل عملية بحالتها"
            icon={Workflow}
            className="md:col-span-2"
            isEmpty={data.operations.runs.every((r) => r.succeeded + r.failed + r.empty + r.cancelled === 0)}
            emptyMessage="لم تجرِ عمليات استخراج في هذه الفترة"
            height="auto"
            footer={
              <DataTable
                caption="عمليات الاستخراج"
                columns={['الفترة', 'ناجحة', 'بلا نتائج', 'فاشلة', 'ملغاة']}
                rows={data.operations.runs.map((r) => [bucketLabel(r.date, bucket, true), r.succeeded, r.empty, r.failed, r.cancelled])}
              />
            }
          >
            <TimeBars
              data={data.operations.runs as unknown as Record<string, string | number>[]}
              bucket={bucket}
              series={[
                { key: 'succeeded', label: 'ناجحة', color: 'var(--success)' },
                { key: 'empty', label: 'بلا نتائج', color: 'var(--warning)' },
                { key: 'failed', label: 'فاشلة', color: 'var(--danger)' },
                { key: 'cancelled', label: 'ملغاة', color: 'var(--chart-neutral)' },
              ]}
            />
          </ChartFrame>
          <ChartFrame
            title="المنشورات المحفوظة"
            description="ما أضافه الاستخراج"
            icon={BarChart3}
            isEmpty={data.operations.runs.every((r) => r.saved === 0)}
            height="auto"
            footer={
              <DataTable
                caption="المنشورات المحفوظة"
                columns={['الفترة', 'المحفوظة']}
                rows={data.operations.runs.map((r) => [bucketLabel(r.date, bucket, true), r.saved])}
              />
            }
          >
            <TimeBars
              data={data.operations.runs as unknown as Record<string, string | number>[]}
              bucket={bucket}
              series={[{ key: 'saved', label: 'المحفوظة', color: 'var(--chart-1)' }]}
            />
          </ChartFrame>
          <ChartFrame
            title="إنتاجية التصنيف"
            description="المنشورات التي صُنّفت — بوقت التصنيف لا النشر"
            icon={Brain}
            className="md:col-span-2 xl:col-span-3"
            isEmpty={data.operations.analyzed.every((a) => a.count === 0)}
            emptyMessage="لم يُصنَّف شيء في هذه الفترة"
            height="auto"
            footer={
              <DataTable
                caption="إنتاجية التصنيف"
                columns={['الفترة', 'المصنّفة']}
                rows={data.operations.analyzed.map((a) => [bucketLabel(a.date, bucket, true), a.count])}
              />
            }
          >
            <TimeBars
              data={data.operations.analyzed as unknown as Record<string, string | number>[]}
              bucket={bucket}
              height={200}
              series={[{ key: 'count', label: 'المصنّفة', color: 'var(--chart-3)' }]}
            />
          </ChartFrame>
        </Section>
      )}
    </>
  );
}
