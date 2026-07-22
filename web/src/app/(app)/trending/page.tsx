'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Chart } from '@/components/Chart';
import { Badge, Card, CardTitle, PageHeader } from '@/components/ui';
import { useFetch } from '@/hooks/useFetch';
import { useIsDark } from '@/hooks/useIsDark';
import { barOption } from '@/lib/charts';
import { compact, pct } from '@/lib/format';

const PERIODS = ['daily', 'weekly', 'monthly'] as const;

export default function TrendingPage() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('daily');
  const { data, loading } = useFetch<any>(`/analytics/trending?period=${period}`, [period]);
  const dark = useIsDark();

  const hashtags = data?.hashtags || [];
  const keywords = data?.keywords || [];

  return (
    <div>
      <PageHeader
        title="Trending Center"
        subtitle="Fastest-growing hashtags, keywords and emerging topics across monitored content."
        actions={
          <div className="flex gap-1 rounded-xl border border-[var(--border)] p-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${period === p ? 'bg-brand-600 text-white' : 'text-[var(--muted)]'}`}
              >
                {p}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle right={<Badge color="#8B5CF6">Top growing</Badge>}>Trending Hashtags</CardTitle>
          <Chart
            option={barOption(dark, hashtags.map((h: any) => h.hashtag), hashtags.map((h: any) => Math.round(h.score || 0)), 'Score')}
            loading={loading}
            height={280}
          />
          <div className="mt-3 space-y-1">
            {hashtags.slice(0, 6).map((h: any, i: number) => (
              <Link key={h.hashtag} href={`/hashtags?q=${encodeURIComponent(h.hashtag)}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/5">
                <span className="text-sm"><span className="text-[var(--muted)] mr-2">{i + 1}</span>{h.hashtag}</span>
                <span className={`text-xs font-medium ${h.growth >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{pct(h.growth || 0)}</span>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle right={<Badge>Top growing</Badge>}>Trending Keywords</CardTitle>
          <Chart
            option={barOption(dark, keywords.map((k: any) => k.keyword), keywords.map((k: any) => k.engagement || 0), 'Engagement')}
            loading={loading}
            height={280}
          />
          <div className="mt-3 space-y-1">
            {keywords.slice(0, 6).map((k: any, i: number) => (
              <Link key={k.keyword} href={`/keywords?q=${encodeURIComponent(k.keyword)}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/5">
                <span className="text-sm"><span className="text-[var(--muted)] mr-2">{i + 1}</span>{k.keyword}</span>
                <span className="text-xs text-[var(--muted)]">{compact(k.engagement)}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardTitle>Emerging Topics</CardTitle>
        <div className="flex flex-wrap gap-2">
          {[...hashtags, ...keywords].slice(0, 12).map((t: any, i: number) => (
            <span key={i} className="chip" style={{ fontSize: `${0.75 + Math.random() * 0.4}rem` }}>
              {t.hashtag || t.keyword}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}
