'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState, SkeletonCards } from '@/components/ui/states';
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from '@/components/ui/table';
import { FilterBar, EMPTY_FILTERS, filtersToParams, type PostFilterState } from '@/components/filters/filter-bar';
import { useFilterOptions, EMPTY_OPTIONS } from '@/lib/hooks/use-filters';
import { TimelineChart } from '@/components/charts/timeline-chart';
import { DonutChart, SentimentChart } from '@/components/charts/distribution-charts';
import { api, buildQuery } from '@/lib/api-client';
import { formatDate, formatNumber } from '@/lib/utils';
import { POST_TYPE_LABELS, SENTIMENT_LABELS } from '@/lib/domain/constants';

/**
 * شاشة التقارير: معاينة قابلة للطباعة مباشرة (PDF عبر طباعة المتصفح)
 * مع تصدير Excel كامل بالفلاتر نفسها.
 */
export function ReportsClient({
  canExport,
  organization,
  appName,
  generatedBy,
}: {
  canExport: boolean;
  organization: string;
  appName: string;
  generatedBy: string;
}) {
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
        accountsCount: number;
        platformsCount: number;
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
        }[];
      }>(buildQuery('/api/stats/top', params)),
  });

  const stats = overview.data;
  const exportHref = buildQuery('/api/reports/export', { ...params, format: 'excel' });

  return (
    <>
      <PageHeader
        title="التقارير"
        description="معاينة التقرير حسب الفلاتر، ثم تصديره Excel أو طباعته PDF"
        action={
          <>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden />
              طباعة أو حفظ PDF
            </Button>
            {canExport && (
              <a href={exportHref}>
                <Button>
                  <Download className="h-4 w-4" aria-hidden />
                  تصدير Excel
                </Button>
              </a>
            )}
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

      <Alert tone="info" className="mb-4 no-print">
        لتصدير PDF: اضغط «طباعة أو حفظ PDF» ثم اختر «حفظ بصيغة PDF» من نافذة الطباعة. التقرير
        مهيّأ لمقاس A4 مع ترويسة الجهة.
      </Alert>

      {/* ترويسة التقرير — تظهر عند الطباعة فقط */}
      <div className="mb-6 hidden border-b-2 border-black pb-4 print:block">
        <h1 className="text-xl font-bold">{organization || appName}</h1>
        <p className="text-sm">تقرير رصد وتحليل المنصات الإعلامية</p>
        <p className="mt-1 text-xs">
          أُنشئ بواسطة {generatedBy} — {formatDate(new Date())}
        </p>
      </div>

      {overview.isPending ? (
        <SkeletonCards count={8} />
      ) : stats?.totalPosts === 0 ? (
        <Card>
          <EmptyState
            icon={FileSpreadsheet}
            title="لا توجد بيانات في هذه الفترة"
            description="وسّع النطاق الزمني أو أزل بعض الفلاتر ثم أعد المحاولة"
          />
        </Card>
      ) : (
        stats && (
          <div className="space-y-4">
            <section className="print-avoid-break">
              <h2 className="mb-2 text-sm font-semibold text-foreground">ملخص الفترة</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="إجمالي المنشورات" value={stats.totalPosts} />
                <StatCard label="عدد الحسابات" value={stats.accountsCount} />
                <StatCard label="عدد المنصات" value={stats.platformsCount} />
                <StatCard label="إجمالي التفاعل" value={stats.totalEngagement} tone="primary" compact />
                <StatCard label="الإعجابات" value={stats.totalLikes} compact />
                <StatCard label="التعليقات" value={stats.totalComments} compact />
                <StatCard label="المشاركات" value={stats.totalShares} compact />
                <StatCard label="المشاهدات" value={stats.totalViews} compact />
              </div>
            </section>

            <TimelineChart
              title="توزيع المنشورات حسب التاريخ"
              data={timeseries.data?.series ?? []}
              metric="posts"
            />

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

            <Card className="print-break-before">
              <CardHeader title="أداء الحسابات" />
              <TableWrapper>
                <Table>
                  <THead>
                    <TR>
                      <TH>الحساب</TH>
                      <TH>المنصة</TH>
                      <TH>المنشورات</TH>
                      <TH>إجمالي التفاعل</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {(top.data?.accounts ?? []).map((account) => (
                      <TR key={account.id}>
                        <TD className="font-medium">{account.name}</TD>
                        <TD className="text-xs text-muted-foreground">{account.platformName}</TD>
                        <TD className="num">{formatNumber(account.posts)}</TD>
                        <TD className="num">{formatNumber(account.engagement)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrapper>
            </Card>

            <Card className="no-print">
              <CardHeader
                title="تصدير Excel"
                description="ملف واحد بأربع أوراق: الملخص، المنشورات، التوزيعات، الحسابات"
              />
              <CardBody>
                {canExport ? (
                  <a href={exportHref}>
                    <Button>
                      <Download className="h-4 w-4" aria-hidden />
                      تنزيل ملف Excel بالفلاتر الحالية
                    </Button>
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">لا تملك صلاحية التصدير.</p>
                )}
              </CardBody>
            </Card>
          </div>
        )
      )}
    </>
  );
}
