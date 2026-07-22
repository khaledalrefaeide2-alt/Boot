'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Chart } from '@/components/Chart';
import { Filters, FilterValues } from '@/components/Filters';
import { Icon } from '@/components/icons';
import { Badge, Card, CardTitle, EmptyState, Kpi, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useIsDark } from '@/hooks/useIsDark';
import { lineOption } from '@/lib/charts';
import { compact, sentimentLabel } from '@/lib/format';

function KeywordExplorer() {
  const params = useSearchParams();
  const dark = useIsDark();
  const [query, setQuery] = useState(params.get('q') || '');
  const [filters, setFilters] = useState<FilterValues>({});
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (q = query) => {
    if (!q.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.get('/analytics/keywords', { params: { q, ...filters } });
      setData(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Search failed');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (params.get('q')) run(params.get('q')!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    // Save the keyword into a quick collection item via a default collection.
    const { data: cols } = await api.get('/collections');
    let col = cols.collections.find((c: any) => c.name === 'Saved Keywords');
    if (!col) {
      const r = await api.post('/collections', { name: 'Saved Keywords', kind: 'keyword' });
      col = r.data.collection;
    }
    await api.post(`/collections/${col.id}/items`, { itemType: 'keyword', itemRef: query, label: query });
    alert('Keyword saved to collection');
  };

  const s = data ? sentimentLabel(data.sentiment) : null;

  return (
    <div>
      <PageHeader
        title="Keyword Explorer"
        subtitle="Search a keyword to reveal mentions, engagement, reach, sentiment and trends."
      />

      <Card className="mb-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Icon.search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" width={17} />
            <input
              className="input pl-9"
              placeholder="e.g. sustainability, ai marketing…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && run()}
            />
          </div>
          <button className="btn-primary" onClick={() => run()} disabled={busy}>
            {busy ? 'Searching…' : 'Search'}
          </button>
          {data && <button className="btn-ghost" onClick={save}><Icon.heart width={16} /> Save</button>}
        </div>
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <Filters value={filters} onChange={setFilters} />
        </div>
      </Card>

      {error && <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>}

      {!data && !busy && <EmptyState title="Search a keyword to begin" hint="Insights, related terms and a 30-day trend will appear here." />}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <Kpi index={0} label="Mentions" value={data.mentions} icon={<Icon.comment width={16} />} />
            <Kpi index={1} label="Engagement" value={data.engagement} accent="#10B981" icon={<Icon.heart width={16} />} />
            <Kpi index={2} label="Reach" value={data.reach} accent="#0EA5E9" icon={<Icon.trending width={16} />} />
            <Kpi index={3} label="Popularity" value={`${data.popularity}/100`} accent="#F59E0B" icon={<Icon.spark width={16} />} />
            <Kpi index={4} label="Sentiment" value={s!.label} accent={s!.color} icon={<Icon.check width={16} />} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardTitle right={<Badge>30 days</Badge>}>Engagement Trend</CardTitle>
              <Chart
                option={lineOption(
                  dark,
                  data.trend.map((t: any) => t.date.slice(5)),
                  [{ name: query, data: data.trend.map((t: any) => t.value) }]
                )}
                height={300}
              />
            </Card>
            <Card>
              <CardTitle>Related Keywords</CardTitle>
              <div className="flex flex-wrap gap-2">
                {data.related.map((r: string, i: number) => (
                  <button
                    key={i}
                    className="chip hover:border-brand-500"
                    onClick={() => {
                      setQuery(r);
                      run(r);
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <div className="mt-4 border-t border-[var(--border)] pt-4 space-y-2 text-sm">
                <Row label="Engagement score" value={`${data.engagementScore}/100`} />
                <Row label="Est. reach" value={compact(data.reach)} />
                <Row label="Sentiment index" value={data.sentiment.toFixed(2)} />
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <KeywordExplorer />
    </Suspense>
  );
}
