'use client';
import Link from 'next/link';
import { Chart } from '@/components/Chart';
import { Icon } from '@/components/icons';
import { Badge, Card, CardTitle, EmptyState, Kpi, PageHeader, Skeleton } from '@/components/ui';
import { useFetch } from '@/hooks/useFetch';
import { useIsDark } from '@/hooks/useIsDark';
import { barOption, lineOption } from '@/lib/charts';
import { compact, pct, relTime } from '@/lib/format';

export default function DashboardPage() {
  const { data, loading } = useFetch<any>('/dashboard');
  const dark = useIsDark();

  const kpis = data?.kpis;
  const daily = data?.dailyActivity || [];
  const activityOption = lineOption(
    dark,
    daily.map((d: any) => d.day.slice(5)),
    [{ name: 'Searches', data: daily.map((d: any) => d.searches) }]
  );
  const trendKw = data?.trendingKeywords || [];
  const kwOption = barOption(
    dark,
    trendKw.map((k: any) => k.keyword),
    trendKw.map((k: any) => k.engagement),
    'Engagement'
  );

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Real-time overview of your social intelligence workspace."
        actions={
          <Link href="/reports" className="btn-primary">
            <Icon.reports width={16} height={16} /> New report
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <Kpi index={0} label="Monitored Keywords" value={kpis.keywords} icon={<Icon.keyword width={16} />} accent="#2563EB" />
            <Kpi index={1} label="Monitored Hashtags" value={kpis.hashtags} icon={<Icon.hashtag width={16} />} accent="#8B5CF6" />
            <Kpi index={2} label="Total Searches" value={kpis.searches} icon={<Icon.search width={16} />} accent="#0EA5E9" />
            <Kpi index={3} label="API Requests" value={kpis.apiRequests} icon={<Icon.spark width={16} />} accent="#F59E0B" />
            <Kpi index={4} label="Viral Posts" value={kpis.viralPosts} icon={<Icon.trending width={16} />} accent="#EF4444" />
            <Kpi index={5} label="Avg Engagement" value={`${kpis.avgEngagement}%`} icon={<Icon.heart width={16} />} accent="#10B981" />
            <Kpi index={6} label="Active Alerts" value={kpis.alerts} icon={<Icon.alerts width={16} />} accent="#EC4899" />
            <Kpi index={7} label="Collections" value={kpis.collections} icon={<Icon.collections width={16} />} accent="#14B8A6" />
          </>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle right={<Badge>Last 14 days</Badge>}>Daily Activity</CardTitle>
          <Chart option={activityOption} loading={loading} height={280} />
        </Card>

        <Card>
          <CardTitle>Trending Hashtags</CardTitle>
          {loading ? (
            <Skeleton className="h-64" />
          ) : (
            <div className="space-y-2">
              {(data.trendingHashtags || []).map((h: any, i: number) => (
                <Link
                  href={`/hashtags?q=${encodeURIComponent(h.hashtag)}`}
                  key={h.hashtag}
                  className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-[var(--muted)] w-4">{i + 1}</span>
                    <span className="font-medium">{h.hashtag}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[var(--muted)]">score {Math.round(h.score)}</span>
                    <span className={`text-xs font-medium ${h.growth >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {pct(h.growth)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle>Top Keywords by Engagement</CardTitle>
          <Chart option={kwOption} loading={loading} height={260} />
        </Card>

        <Card>
          <CardTitle right={<Link href="/competitors" className="text-xs text-brand-600 hover:underline">View</Link>}>
            Most Active Pages
          </CardTitle>
          {loading ? (
            <Skeleton className="h-56" />
          ) : (
            <div className="space-y-1.5">
              {(data.activePages || []).map((p: any) => (
                <div key={p.page_name} className="flex items-center justify-between rounded-lg px-2 py-1.5">
                  <span className="font-medium text-sm truncate">{p.page_name}</span>
                  <span className="text-xs text-[var(--muted)]">{compact(p.reactions)} reactions</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle right={<Link href="/history" className="text-xs text-brand-600 hover:underline">All</Link>}>
            Recent Searches
          </CardTitle>
          {loading ? (
            <Skeleton className="h-56" />
          ) : data.recentSearches?.length ? (
            <div className="space-y-1.5">
              {data.recentSearches.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg px-2 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge color={TYPE_COLOR[s.type]}>{s.type}</Badge>
                    <span className="text-sm truncate">{s.query}</span>
                  </div>
                  <span className="text-[10px] text-[var(--muted)] shrink-0">{relTime(s.created_at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No searches yet" hint="Run a search to see it here." />
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardTitle right={<Link href="/discovery" className="text-xs text-brand-600 hover:underline">Discover more</Link>}>
            Viral Posts
          </CardTitle>
          {loading ? (
            <Skeleton className="h-40" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(data.viralPosts || []).map((p: any) => (
                <div key={p.external_id} className="rounded-xl border border-[var(--border)] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{p.page_name}</span>
                    <Badge color="#EF4444">{p.engagement_rate}%</Badge>
                  </div>
                  <p className="mt-1.5 text-sm text-[var(--muted)] line-clamp-2">{p.content}</p>
                  <div className="mt-2 flex items-center gap-4 text-xs text-[var(--muted)]">
                    <span className="flex items-center gap-1"><Icon.heart width={13} /> {compact(p.likes)}</span>
                    <span className="flex items-center gap-1"><Icon.comment width={13} /> {compact(p.comments)}</span>
                    <span className="flex items-center gap-1"><Icon.share width={13} /> {compact(p.shares)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

const TYPE_COLOR: Record<string, string> = {
  keyword: '#2563EB',
  hashtag: '#8B5CF6',
  content: '#0EA5E9',
  page: '#F59E0B',
};
