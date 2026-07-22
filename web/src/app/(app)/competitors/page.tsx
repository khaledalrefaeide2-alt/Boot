'use client';
import { useState } from 'react';
import { Chart } from '@/components/Chart';
import { Card, CardTitle, EmptyState, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useIsDark } from '@/hooks/useIsDark';
import { radarOption } from '@/lib/charts';
import { compact, pct } from '@/lib/format';

export default function CompetitorsPage() {
  const dark = useIsDark();
  const [input, setInput] = useState('National Geographic, BBC News, NASA');
  const [items, setItems] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const list = input.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5);
    if (!list.length) return;
    setBusy(true);
    try {
      const res = await api.get('/analytics/competitors/pages', { params: { q: list.join(',') } });
      setItems(res.data.items);
    } finally {
      setBusy(false);
    }
  };

  const indicators = [
    { name: 'Followers', max: Math.max(1, ...(items || []).map((i) => i.followers)) },
    { name: 'Engagement', max: Math.max(1, ...(items || []).map((i) => i.engagement)) },
    { name: 'Avg Reactions', max: Math.max(1, ...(items || []).map((i) => i.avgReactions)) },
    { name: 'Avg Comments', max: Math.max(1, ...(items || []).map((i) => i.avgComments)) },
    { name: 'Avg Shares', max: Math.max(1, ...(items || []).map((i) => i.avgShares)) },
    { name: 'Posting Freq', max: Math.max(1, ...(items || []).map((i) => i.postingFrequency)) },
  ];

  return (
    <div>
      <PageHeader title="Competitor Analysis" subtitle="Benchmark pages side by side across followers, engagement and growth." />

      <Card className="mb-4">
        <CardTitle>Pages to compare</CardTitle>
        <div className="flex gap-2">
          <input className="input flex-1" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Page A, Page B, Page C" />
          <button className="btn-primary" onClick={run} disabled={busy}>{busy ? '…' : 'Compare'}</button>
        </div>
      </Card>

      {!items && !busy && <EmptyState title="Enter up to 5 pages to compare" />}

      {items && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardTitle>Radar Comparison</CardTitle>
            <Chart
              option={radarOption(
                dark,
                indicators,
                items.map((i) => ({
                  name: i.name,
                  value: [i.followers, i.engagement, i.avgReactions, i.avgComments, i.avgShares, i.postingFrequency],
                }))
              )}
              height={340}
            />
          </Card>
          <Card>
            <CardTitle>Metrics</CardTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
                    <th className="py-2">Page</th><th>Followers</th><th>Engagement</th><th>Freq</th><th>Growth</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.pageId} className="border-b border-[var(--border)]">
                      <td className="py-2 font-medium">{i.name}</td>
                      <td>{compact(i.followers)}</td>
                      <td>{compact(i.engagement)}</td>
                      <td>{i.postingFrequency}/wk</td>
                      <td className={i.growthRate >= 0 ? 'text-emerald-500' : 'text-red-500'}>{pct(i.growthRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
