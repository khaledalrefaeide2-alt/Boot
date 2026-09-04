'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { GitCompare, X } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from '@/components/ui/table';
import { FilterBar, EMPTY_FILTERS, filtersToParams, type PostFilterState } from '@/components/filters/filter-bar';
import { useFilterOptions, EMPTY_OPTIONS } from '@/lib/hooks/use-filters';
import { MultiSeriesTimeline } from '@/components/charts/timeline-chart';
import { ComparisonBars } from '@/components/charts/distribution-charts';
import { seriesColor } from '@/components/charts/chart-kit';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import { formatCompactNumber, formatNumber, formatPercent } from '@/lib/utils';

interface CompareAccount {
  id: string;
  name: string;
  platformName: string;
  followersCount: number | null;
  posts: number;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  engagement: number;
  engagementPerPost: number;
  engagementPerFollower: number | null;
  positive: number;
  negative: number;
}

const MAX_ACCOUNTS = 6;

export function CompareClient() {
  const [selected, setSelected] = useState<string[]>([]);
  const [filters, setFilters] = useState<PostFilterState>({ ...EMPTY_FILTERS, range: '30d' });
  const [metric, setMetric] = useState<'posts' | 'engagement'>('posts');

  const optionsQuery = useFilterOptions();
  const accounts = optionsQuery.data?.accounts ?? [];

  const query = useQuery({
    queryKey: ['compare', selected, filtersToParams(filters)],
    queryFn: () =>
      api.get<{
        accounts: CompareAccount[];
        timeseries: Record<string, string | number>[];
      }>(buildQuery('/api/stats/compare', { ...filtersToParams(filters), accountId: selected })),
    enabled: selected.length > 0,
  });

  function addAccount(id: string) {
    if (!id || selected.includes(id) || selected.length >= MAX_ACCOUNTS) return;
    setSelected([...selected, id]);
  }

  const data = query.data;

  return (
    <>
      <PageHeader
        title="مقارنة الحسابات"
        description={`اختر حتى ${MAX_ACCOUNTS} حسابات لمقارنة أدائها في الفترة نفسها`}
        action={
          selected.length > 0 && (
            <Button variant="secondary" onClick={() => setSelected([])}>
              مسح الاختيار
            </Button>
          )
        }
      />

      <Card className="mb-4 no-print">
        <CardBody className="space-y-3">
          <Select
            label="إضافة حساب للمقارنة"
            value=""
            onChange={(event) => addAccount(event.target.value)}
            disabled={selected.length >= MAX_ACCOUNTS}
            hint={
              selected.length >= MAX_ACCOUNTS
                ? `بلغت الحد الأقصى (${MAX_ACCOUNTS}) — احذف حساباً لإضافة آخر`
                : undefined
            }
          >
            <option value="">— اختر حساباً —</option>
            {accounts
              .filter((account) => !selected.includes(account.id))
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
          </Select>

          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              {selected.map((id, index) => {
                const account = accounts.find((item) => item.id === id);
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: seriesColor(index) }}
                      aria-hidden
                    />
                    {account?.name ?? id}
                    <button
                      type="button"
                      onClick={() => setSelected(selected.filter((item) => item !== id))}
                      className="rounded p-0.5 text-muted-foreground transition-colors hover:text-danger"
                      aria-label={`إزالة ${account?.name ?? ''}`}
                    >
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {selected.length === 0 ? (
        <Card>
          <EmptyState
            icon={GitCompare}
            title="لم تختر أي حساب بعد"
            description="اختر حسابين أو أكثر من القائمة أعلاه لبدء المقارنة"
            action={
              <Link href="/accounts">
                <Button variant="secondary">تصفح الحسابات</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <FilterBar
            className="mb-4"
            filters={filters}
            options={optionsQuery.data ?? EMPTY_OPTIONS}
            onChange={setFilters}
            onReset={() => setFilters({ ...EMPTY_FILTERS, range: '30d' })}
            showSearch={false}
          />

          {query.isPending ? (
            <Card>
              <SkeletonRows rows={6} />
            </Card>
          ) : query.isError ? (
            <Card>
              <ErrorState
                description={query.error instanceof ApiClientError ? query.error.message : undefined}
              />
            </Card>
          ) : data ? (
            <div className="space-y-4">
              <MultiSeriesTimeline
                title={metric === 'posts' ? 'عدد المنشورات عبر الزمن' : 'التفاعل عبر الزمن'}
                description="مقارنة الحسابات المختارة في الفترة نفسها"
                data={data.timeseries}
                series={data.accounts.map((account) => ({
                  key: `${metric}_${account.id}`,
                  label: account.name,
                }))}
              />

              <div className="flex flex-wrap gap-2 no-print">
                <Button
                  variant={metric === 'posts' ? 'soft' : 'secondary'}
                  size="sm"
                  onClick={() => setMetric('posts')}
                >
                  عدد المنشورات
                </Button>
                <Button
                  variant={metric === 'engagement' ? 'soft' : 'secondary'}
                  size="sm"
                  onClick={() => setMetric('engagement')}
                >
                  التفاعل
                </Button>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <ComparisonBars
                  title="إجمالي التفاعل"
                  data={data.accounts.map((account, index) => ({
                    label: account.name,
                    value: account.engagement,
                    color: seriesColor(index),
                  }))}
                  valueLabel="تفاعل"
                />
                <ComparisonBars
                  title="معدل التفاعل لكل منشور"
                  data={data.accounts.map((account, index) => ({
                    label: account.name,
                    value: account.engagementPerPost,
                    color: seriesColor(index),
                  }))}
                  valueLabel="نقطة"
                />
              </div>

              <Card>
                <CardHeader title="جدول المقارنة التفصيلي" />
                <TableWrapper>
                  <Table>
                    <THead>
                      <TR>
                        <TH>الحساب</TH>
                        <TH>المنصة</TH>
                        <TH>المتابعون</TH>
                        <TH>المنشورات</TH>
                        <TH>الإعجابات</TH>
                        <TH>التعليقات</TH>
                        <TH>المشاركات</TH>
                        <TH>المشاهدات</TH>
                        <TH>إجمالي التفاعل</TH>
                        <TH>لكل منشور</TH>
                        <TH>لكل متابع</TH>
                        <TH>إيجابي / سلبي</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {data.accounts.map((account, index) => (
                        <TR key={account.id}>
                          <TD>
                            <span className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                                style={{ backgroundColor: seriesColor(index) }}
                                aria-hidden
                              />
                              <Link
                                href={`/accounts/${account.id}`}
                                className="font-medium hover:text-primary hover:underline"
                              >
                                {account.name}
                              </Link>
                            </span>
                          </TD>
                          <TD className="text-xs text-muted-foreground">{account.platformName}</TD>
                          <TD className="num">
                            {account.followersCount ? formatCompactNumber(account.followersCount) : '—'}
                          </TD>
                          <TD className="num">{formatNumber(account.posts)}</TD>
                          <TD className="num">{formatCompactNumber(account.likes)}</TD>
                          <TD className="num">{formatCompactNumber(account.comments)}</TD>
                          <TD className="num">{formatCompactNumber(account.shares)}</TD>
                          <TD className="num">{formatCompactNumber(account.views)}</TD>
                          <TD className="num font-semibold text-primary">
                            {formatCompactNumber(account.engagement)}
                          </TD>
                          <TD className="num">{formatNumber(account.engagementPerPost)}</TD>
                          <TD className="num">
                            {account.engagementPerFollower !== null
                              ? formatPercent(account.engagementPerFollower, 3)
                              : '—'}
                          </TD>
                          <TD>
                            <span className="flex items-center gap-1.5">
                              <Badge tone="success" size="sm">
                                {formatNumber(account.positive)}
                              </Badge>
                              <Badge tone="danger" size="sm">
                                {formatNumber(account.negative)}
                              </Badge>
                            </span>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrapper>
              </Card>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
