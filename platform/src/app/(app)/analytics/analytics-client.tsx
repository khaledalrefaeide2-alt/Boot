'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState, SkeletonCards } from '@/components/ui/states';
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from '@/components/ui/table';
import { FilterBar, EMPTY_FILTERS, filtersToParams, type PostFilterState } from '@/components/filters/filter-bar';
import { useFilterOptions, EMPTY_OPTIONS } from '@/lib/hooks/use-filters';
import { TimelineChart } from '@/components/charts/timeline-chart';
import {
  ComparisonBars,
  DonutChart,
  SentimentChart,
  WordCloud,
} from '@/components/charts/distribution-charts';
import { api, buildQuery } from '@/lib/api-client';
import { formatCompactNumber, formatNumber, formatPercent } from '@/lib/utils';
import {
  POST_TYPE_LABELS,
  SENTIMENT_LABELS,
  languageLabel,
} from '@/lib/domain/constants';

export function AnalyticsClient() {
  const [filters, setFilters] = useState<PostFilterState>(EMPTY_FILTERS);
  const params = filtersToParams(filters);
  const optionsQuery = useFilterOptions();

  const overview = useQuery({
    queryKey: ['overview', params],
    queryFn: () =>
      api.get<{
        totalPosts: number;
        totalLikes: number;
        totalComments: number;
        totalShares: number;
        totalViews: number;
        totalEngagement: number;
        engagementRate: number;
        postsToday: number;
        postsThisWeek: number;
        postsThisMonth: number;
      }>(buildQuery('/api/stats/overview', params)),
  });

  const timeseries = useQuery({
    queryKey: ['timeseries', params],
    queryFn: () =>
      api.get<{ series: { date: string; posts: number; engagement: number }[] }>(
        buildQuery('/api/stats/timeseries', params),
      ),
  });

  const breakdowns = useQuery({
    queryKey: ['breakdowns', params],
    queryFn: () =>
      api.get<{
        byPlatform: { id: string; name: string; posts: number; engagement: number }[];
        byType: { type: string; posts: number }[];
        bySentiment: { sentiment: string; posts: number }[];
        byTopic: { id: string | null; name: string; posts: number }[];
        byLanguage: { language: string | null; posts: number }[];
        byCountry: { country: string; posts: number }[];
      }>(buildQuery('/api/stats/breakdowns', params)),
  });

  const top = useQuery({
    queryKey: ['top', params],
    queryFn: () =>
      api.get<{
        accounts: {
          id: string;
          name: string;
          platformName: string;
          posts: number;
          engagement: number;
          engagementRate: number;
          followersCount: number | null;
        }[];
        hashtags: { tag: string; count: number }[];
        words: { word: string; count: number }[];
      }>(buildQuery('/api/stats/top', params)),
  });

  const stats = overview.data;
  const isEmpty = stats?.totalPosts === 0;

  return (
    <>
      <PageHeader
        title="الإحصائيات"
        description="تحليل تفصيلي للنشر والتفاعل والمواضيع"
        action={
          <>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden />
              طباعة أو حفظ PDF
            </Button>
            <Link href="/reports">
              <Button>التقارير والتصدير</Button>
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
        <SkeletonCards count={8} />
      ) : isEmpty ? (
        <Card>
          <EmptyState
            title="لا توجد بيانات في هذه الفترة"
            description="وسّع النطاق الزمني أو أزل بعض الفلاتر"
          />
        </Card>
      ) : (
        stats && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="إجمالي المنشورات" value={stats.totalPosts} />
              <StatCard label="منشورات اليوم" value={stats.postsToday} />
              <StatCard label="منشورات الأسبوع" value={stats.postsThisWeek} />
              <StatCard label="منشورات الشهر" value={stats.postsThisMonth} />
              <StatCard label="إجمالي الإعجابات" value={stats.totalLikes} compact />
              <StatCard label="إجمالي التعليقات" value={stats.totalComments} compact />
              <StatCard label="إجمالي المشاركات" value={stats.totalShares} compact />
              <StatCard label="إجمالي المشاهدات" value={stats.totalViews} compact />
              <StatCard
                label="إجمالي التفاعل"
                value={stats.totalEngagement}
                tone="primary"
                compact
              />
              <StatCard
                label="معدل التفاعل لكل منشور"
                value={formatNumber(stats.engagementRate)}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <TimelineChart
                title="توزيع المنشورات حسب التاريخ"
                data={timeseries.data?.series ?? []}
                metric="posts"
              />
              <TimelineChart
                title="التفاعل حسب التاريخ"
                data={timeseries.data?.series ?? []}
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
              <SentimentChart
                data={breakdowns.data?.bySentiment ?? []}
                labels={SENTIMENT_LABELS}
              />
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

            <Card>
              <CardHeader
                title="أكثر الحسابات نشراً"
                description="مرتبة حسب عدد المنشورات في الفترة المحددة"
              />
              <TableWrapper>
                <Table>
                  <THead>
                    <TR>
                      <TH>الحساب</TH>
                      <TH>المنصة</TH>
                      <TH>المتابعون</TH>
                      <TH>المنشورات</TH>
                      <TH>التفاعل</TH>
                      <TH>معدل التفاعل</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {(top.data?.accounts ?? []).map((account) => (
                      <TR key={account.id}>
                        <TD>
                          <Link
                            href={`/accounts/${account.id}`}
                            className="font-medium hover:text-primary hover:underline"
                          >
                            {account.name}
                          </Link>
                        </TD>
                        <TD className="text-xs text-muted-foreground">{account.platformName}</TD>
                        <TD className="num">
                          {account.followersCount ? formatCompactNumber(account.followersCount) : '—'}
                        </TD>
                        <TD className="num">{formatNumber(account.posts)}</TD>
                        <TD className="num">{formatCompactNumber(account.engagement)}</TD>
                        <TD className="num">{formatNumber(account.engagementRate)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrapper>
            </Card>
          </div>
        )
      )}
    </>
  );
}
