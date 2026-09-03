'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  FileSpreadsheet,
  Heart,
  MessageSquare,
  Newspaper,
  Share2,
  TrendingUp,
  UsersRound,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { StatCard, HighlightCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState, SkeletonCards, SkeletonRows } from '@/components/ui/states';
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from '@/components/ui/table';
import { FilterBar, EMPTY_FILTERS, filtersToParams, type PostFilterState } from '@/components/filters/filter-bar';
import { useFilterOptions, EMPTY_OPTIONS } from '@/lib/hooks/use-filters';
import { TimelineChart } from '@/components/charts/timeline-chart';
import { ComparisonBars, DonutChart, SentimentChart } from '@/components/charts/distribution-charts';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import { formatCompactNumber, formatDateTime, formatNumber, truncate } from '@/lib/utils';
import { POST_TYPE_LABELS, SENTIMENT_LABELS } from '@/lib/domain/constants';

interface OverviewResponse {
  totalPosts: number;
  postsToday: number;
  postsThisWeek: number;
  postsThisMonth: number;
  accountsCount: number;
  platformsCount: number;
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
  } | null;
  topPlatform: { id: string; name: string; postsCount: number } | null;
}

interface BreakdownsResponse {
  byPlatform: { id: string; name: string; posts: number; engagement: number }[];
  byType: { type: string; posts: number }[];
  bySentiment: { sentiment: string; posts: number }[];
}

interface TopResponse {
  accounts: { id: string; name: string; platformName: string; posts: number; engagement: number }[];
  posts: {
    id: string;
    text: string | null;
    publishedAt: string | null;
    engagementTotal: number;
    account: { id: string; name: string };
    platform: { id: string; name: string };
  }[];
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
      api.get<{ series: { date: string; posts: number; engagement: number }[] }>(
        buildQuery('/api/stats/timeseries', params),
      ),
  });

  const breakdowns = useQuery({
    queryKey: ['breakdowns', params],
    queryFn: () => api.get<BreakdownsResponse>(buildQuery('/api/stats/breakdowns', params)),
  });

  const top = useQuery({
    queryKey: ['top', params],
    queryFn: () => api.get<TopResponse>(buildQuery('/api/stats/top', params)),
  });

  const stats = overview.data;
  const isEmpty = stats && stats.totalPosts === 0;

  return (
    <>
      <PageHeader
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
          {/* البطاقات الست الرئيسية أعلى اللوحة */}
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="إجمالي المنشورات"
              value={stats.totalPosts}
              hint={`${formatNumber(stats.postsToday)} اليوم · ${formatNumber(stats.postsThisWeek)} هذا الأسبوع`}
              icon={Newspaper}
              href="/posts"
            />
            <StatCard
              label="عدد الحسابات"
              value={stats.accountsCount}
              hint="الحسابات المرصودة النشطة"
              icon={UsersRound}
              href="/accounts"
            />
            <StatCard
              label="عدد المنصات"
              value={stats.platformsCount}
              hint="المنصات المفعّلة"
              icon={Building2}
              href="/platforms"
            />
            <StatCard
              label="إجمالي التفاعل"
              value={stats.totalEngagement}
              hint={`معدل ${formatNumber(stats.engagementRate)} لكل منشور`}
              icon={TrendingUp}
              compact
              tone="primary"
            />
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
            />
            <HighlightCard
              label="أكثر منصة نشاطاً"
              title={stats.topPlatform?.name ?? 'لا يوجد بعد'}
              meta="حسب عدد المنشورات في الفترة"
              value={stats.topPlatform?.postsCount}
              valueLabel="منشور"
              href={stats.topPlatform ? `/platforms/${stats.topPlatform.id}` : undefined}
            />
          </div>

          {/* مجاميع التفاعل التفصيلية */}
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="الإعجابات" value={stats.totalLikes} icon={Heart} compact />
            <StatCard label="التعليقات" value={stats.totalComments} icon={MessageSquare} compact />
            <StatCard label="المشاركات" value={stats.totalShares} icon={Share2} compact />
            <StatCard label="المشاهدات" value={stats.totalViews} icon={TrendingUp} compact />
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

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="أكثر الحسابات نشراً"
                action={
                  <Link href="/compare">
                    <Button variant="ghost" size="sm">
                      مقارنة الحسابات
                    </Button>
                  </Link>
                }
              />
              {top.isPending ? (
                <SkeletonRows rows={5} />
              ) : (top.data?.accounts.length ?? 0) === 0 ? (
                <EmptyState title="لا توجد بيانات" />
              ) : (
                <TableWrapper>
                  <Table>
                    <THead>
                      <TR>
                        <TH>الحساب</TH>
                        <TH>المنصة</TH>
                        <TH>المنشورات</TH>
                        <TH>التفاعل</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {top.data?.accounts.map((account) => (
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
                          <TD className="num">{formatNumber(account.posts)}</TD>
                          <TD className="num font-medium">{formatCompactNumber(account.engagement)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrapper>
              )}
            </Card>

            <Card>
              <CardHeader
                title="أعلى المنشورات تفاعلاً"
                action={
                  <Link href="/posts">
                    <Button variant="ghost" size="sm">
                      كل المنشورات
                    </Button>
                  </Link>
                }
              />
              {top.isPending ? (
                <SkeletonRows rows={5} />
              ) : (top.data?.posts.length ?? 0) === 0 ? (
                <EmptyState title="لا توجد بيانات" />
              ) : (
                <CardBody className="space-y-2.5 py-3">
                  {top.data?.posts.slice(0, 6).map((post) => (
                    <Link
                      key={post.id}
                      href={`/posts/${post.id}`}
                      className="flex items-start gap-3 rounded-md border border-border p-2.5 transition-colors hover:bg-surface-2/50"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="line-clamp-2 text-sm leading-relaxed">
                          {truncate(post.text, 120) || 'منشور بلا نص'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {post.account.name} · {post.platform.name} ·{' '}
                          {formatDateTime(post.publishedAt)}
                        </p>
                      </div>
                      <Badge tone="primary" className="shrink-0">
                        <span className="num">{formatCompactNumber(post.engagementTotal)}</span>
                      </Badge>
                    </Link>
                  ))}
                </CardBody>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
