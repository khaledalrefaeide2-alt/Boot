'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Chart } from '@/components/Chart';
import { Icon } from '@/components/icons';
import { Badge, Card, CardTitle, EmptyState, Kpi, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useIsDark } from '@/hooks/useIsDark';
import { donutOption, lineOption } from '@/lib/charts';
import { compact, pct } from '@/lib/format';

function HashtagExplorer() {
  const params = useSearchParams();
  const dark = useIsDark();
  const [query, setQuery] = useState(params.get('q') || '');
  const [compare, setCompare] = useState('');
  const [data, setData] = useState<any>(null);
  const [compareData, setCompareData] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (q = query) => {
    if (!q.trim()) return;
    setBusy(true);
    setCompareData(null);
    try {
      const res = await api.get('/analytics/hashtags', { params: { q } });
      setData(res.data);
    } finally {
      setBusy(false);
    }
  };

  const runCompare = async () => {
    const list = compare.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length < 2) return;
    const res = await api.get('/analytics/hashtags/compare', { params: { q: list.join(',') } });
    setCompareData(res.data.items);
    setData(null);
  };

  useEffect(() => {
    if (params.get('q')) run(params.get('q')!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <PageHeader title="Hashtag Explorer" subtitle="Analyze reach, growth and top content behind any hashtag." />

      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        <Card>
          <CardTitle>Analyze a hashtag</CardTitle>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Icon.hashtag className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" width={17} />
              <input className="input pl-9" placeholder="worldcup" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} />
            </div>
            <button className="btn-primary" onClick={() => run()} disabled={busy}>{busy ? '…' : 'Analyze'}</button>
          </div>
        </Card>
        <Card>
          <CardTitle>Compare hashtags</CardTitle>
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="ai, crypto, fitness" value={compare} onChange={(e) => setCompare(e.target.value)} />
            <button className="btn-ghost" onClick={runCompare}>Compare</button>
          </div>
        </Card>
      </div>

      {!data && !compareData && !busy && <EmptyState title="Analyze or compare hashtags to begin" />}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi index={0} label="Total Mentions" value={data.mentions} icon={<Icon.comment width={16} />} />
            <Kpi index={1} label="Total Engagement" value={data.engagement} accent="#10B981" icon={<Icon.heart width={16} />} />
            <Kpi index={2} label="Trending Score" value={`${Math.round(data.trendingScore)}/100`} accent="#8B5CF6" icon={<Icon.spark width={16} />} />
            <Kpi index={3} label="Growth" value={pct(data.growth)} delta={data.growth} accent="#F59E0B" icon={<Icon.trending width={16} />} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardTitle right={<Badge color="#8B5CF6">{data.hashtag}</Badge>}>Timeline</CardTitle>
              <Chart option={lineOption(dark, data.timeline.map((t: any) => t.date.slice(5)), [{ name: data.hashtag, data: data.timeline.map((t: any) => t.value) }])} height={300} />
            </Card>
            <Card>
              <CardTitle>Engagement Distribution</CardTitle>
              <Chart option={donutOption(dark, data.engagementDistribution.map((d: any) => ({ name: d.bucket, value: d.value })))} height={300} />
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardTitle>Top Pages</CardTitle>
              <div className="space-y-1.5">
                {data.topPages.map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded-lg px-2 py-1.5">
                    <span className="text-sm font-medium">{p.name}</span>
                    <span className="text-xs text-[var(--muted)]">{compact(p.engagement)}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <CardTitle>Top Posts</CardTitle>
              <div className="space-y-2">
                {data.topPosts.map((p: any) => (
                  <div key={p.externalId} className="rounded-xl border border-[var(--border)] p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{p.pageName}</span>
                      <Badge color="#EF4444">{p.engagementRate}%</Badge>
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted)] line-clamp-2">{p.content}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}

      {compareData && (
        <Card>
          <CardTitle>Comparison</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
                  <th className="py-2">Hashtag</th><th>Mentions</th><th>Engagement</th><th>Trending</th><th>Growth</th>
                </tr>
              </thead>
              <tbody>
                {compareData.map((h) => (
                  <tr key={h.hashtag} className="border-b border-[var(--border)]">
                    <td className="py-2 font-medium">{h.hashtag}</td>
                    <td>{compact(h.mentions)}</td>
                    <td>{compact(h.engagement)}</td>
                    <td>{Math.round(h.trendingScore)}</td>
                    <td className={h.growth >= 0 ? 'text-emerald-500' : 'text-red-500'}>{pct(h.growth)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <HashtagExplorer />
    </Suspense>
  );
}
