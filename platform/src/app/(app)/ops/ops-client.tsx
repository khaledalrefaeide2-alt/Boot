'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/ui/states';
import { TimelineChart } from '@/components/charts/timeline-chart';
import { ComparisonBars, SentimentChart } from '@/components/charts/distribution-charts';
import { api, buildQuery } from '@/lib/api-client';
import { formatCompactNumber, formatDateTime, formatNumber, truncate } from '@/lib/utils';
import { SENTIMENT_LABELS } from '@/lib/domain/constants';

/** فترة التحديث التلقائي لشاشة العرض */
const REFRESH_MS = 60_000;

/**
 * شاشة غرفة العمليات: عرض مكبّر للعرض على شاشة كبيرة،
 * بتحديث تلقائي ودون أي عناصر تحكم مزعجة.
 */
export function OpsRoomClient() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  const params = { range: '7d' };

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const overview = useQuery({
    queryKey: ['ops-overview'],
    queryFn: () =>
      api.get<{
        totalPosts: number;
        postsToday: number;
        totalEngagement: number;
        accountsCount: number;
        platformsCount: number;
        engagementRate: number;
      }>(buildQuery('/api/stats/overview', params)),
    refetchInterval: REFRESH_MS,
  });

  const timeseries = useQuery({
    queryKey: ['ops-timeseries'],
    queryFn: () =>
      api.get<{ series: { date: string; posts: number; engagement: number }[] }>(
        buildQuery('/api/stats/timeseries', params),
      ),
    refetchInterval: REFRESH_MS,
  });

  const breakdowns = useQuery({
    queryKey: ['ops-breakdowns'],
    queryFn: () =>
      api.get<{
        byPlatform: { id: string; name: string; posts: number }[];
        bySentiment: { sentiment: string; posts: number }[];
      }>(buildQuery('/api/stats/breakdowns', params)),
    refetchInterval: REFRESH_MS,
  });

  const top = useQuery({
    queryKey: ['ops-top'],
    queryFn: () =>
      api.get<{
        posts: {
          id: string;
          text: string | null;
          publishedAt: string | null;
          engagementTotal: number;
          account: { name: string };
          platform: { name: string };
        }[];
        accounts: { id: string; name: string; posts: number }[];
      }>(buildQuery('/api/stats/top', params)),
    refetchInterval: REFRESH_MS,
  });

  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => undefined);
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen().catch(() => undefined);
      setIsFullscreen(false);
    }
  }

  const stats = overview.data;

  return (
    <div className="ops-room space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">غرفة العمليات</h1>
          <p className="text-sm text-muted-foreground">
            رصد مباشر لآخر 7 أيام — يُحدَّث تلقائياً كل دقيقة
            {now && <span className="ms-2">· آخر تحديث {formatDateTime(now)}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <Badge tone="success">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-success" aria-hidden />
            مباشر
          </Badge>
          <Button variant="secondary" onClick={() => overview.refetch()} aria-label="تحديث الآن">
            <RefreshCw className="h-4 w-4" aria-hidden />
          </Button>
          <Button variant="secondary" onClick={toggleFullscreen}>
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" aria-hidden />
            ) : (
              <Maximize2 className="h-4 w-4" aria-hidden />
            )}
            {isFullscreen ? 'إنهاء العرض' : 'ملء الشاشة'}
          </Button>
        </div>
      </header>

      {overview.isPending ? (
        <LoadingState message="جارٍ تحميل بيانات غرفة العمليات…" />
      ) : (
        stats && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                { label: 'منشورات اليوم', value: stats.postsToday, tone: 'text-primary' },
                { label: 'منشورات الأسبوع', value: stats.totalPosts, tone: 'text-foreground' },
                {
                  label: 'إجمالي التفاعل',
                  value: formatCompactNumber(stats.totalEngagement),
                  tone: 'text-primary',
                },
                { label: 'الحسابات المرصودة', value: stats.accountsCount, tone: 'text-foreground' },
                { label: 'المنصات', value: stats.platformsCount, tone: 'text-foreground' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-border bg-surface p-4 text-center shadow-elev-1"
                >
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className={`ops-metric num font-bold ${item.tone}`}>
                    {typeof item.value === 'number' ? formatNumber(item.value) : item.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <TimelineChart
                  title="نشاط النشر — آخر 7 أيام"
                  data={timeseries.data?.series ?? []}
                  metric="posts"
                  height={320}
                />
              </div>
              <SentimentChart
                data={breakdowns.data?.bySentiment ?? []}
                labels={SENTIMENT_LABELS}
                title="المشاعر العامة"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <ComparisonBars
                title="النشاط حسب المنصة"
                data={(breakdowns.data?.byPlatform ?? []).map((item) => ({
                  label: item.name,
                  value: item.posts,
                }))}
                valueLabel="منشور"
                colorByIndex
                height={240}
              />
              <ComparisonBars
                title="أنشط الحسابات"
                data={(top.data?.accounts ?? []).slice(0, 6).map((item) => ({
                  label: item.name,
                  value: item.posts,
                }))}
                valueLabel="منشور"
                height={240}
              />
            </div>

            <div className="rounded-lg border border-border bg-surface shadow-elev-1">
              <div className="border-b border-border px-4 py-3">
                <h2 className="font-semibold text-foreground">أعلى المنشورات تفاعلاً</h2>
              </div>
              <ul className="divide-y divide-border">
                {(top.data?.posts ?? []).slice(0, 5).map((post) => (
                  <li key={post.id} className="flex items-start gap-4 px-4 py-3">
                    <span className="num shrink-0 text-lg font-bold text-primary">
                      {formatCompactNumber(post.engagementTotal)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 leading-relaxed">
                        {truncate(post.text, 180) || 'منشور بلا نص'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {post.account.name} · {post.platform.name} ·{' '}
                        {formatDateTime(post.publishedAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )
      )}
    </div>
  );
}
