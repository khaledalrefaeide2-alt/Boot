'use client';
import { Suspense, useState } from 'react';
import { Filters, FilterValues } from '@/components/Filters';
import { Icon } from '@/components/icons';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { compact, relTime } from '@/lib/format';

function Discovery() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<FilterValues>({ sort: 'viral' });
  const [posts, setPosts] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!query.trim()) return;
    setBusy(true);
    try {
      const res = await api.get('/analytics/content', { params: { q: query, ...filters, limit: 30 } });
      setPosts(res.data.posts);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Content Discovery" subtitle="Search public Facebook posts and surface the most engaging content." />

      <Card className="mb-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Icon.search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" width={17} />
            <input className="input pl-9" placeholder="Search keyword or #hashtag…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} />
          </div>
          <button className="btn-primary" onClick={run} disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
        </div>
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <Filters value={filters} onChange={setFilters} showSort />
        </div>
      </Card>

      {!posts && !busy && <EmptyState title="Search to discover viral content" hint="Sort by virality, engagement, comments and more." />}

      {posts && (
        <>
          <p className="text-sm text-[var(--muted)] mb-3">{posts.length} posts found</p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {posts.map((p) => (
              <Card key={p.externalId} className="!p-4 flex flex-col">
                {p.mediaUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.mediaUrl} alt="" className="mb-3 h-40 w-full rounded-xl object-cover" />
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-white text-[10px] font-bold">
                      {p.pageName.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium">{p.pageName}</span>
                  </div>
                  <Badge>{p.language}</Badge>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)] line-clamp-3 flex-1">{p.content}</p>
                <div className="mt-3 flex items-center gap-3 text-xs text-[var(--muted)]">
                  <span className="flex items-center gap-1"><Icon.heart width={13} /> {compact(p.likes)}</span>
                  <span className="flex items-center gap-1"><Icon.comment width={13} /> {compact(p.comments)}</span>
                  <span className="flex items-center gap-1"><Icon.share width={13} /> {compact(p.shares)}</span>
                  <span className="ml-auto"><Badge color="#EF4444">{p.engagementRate}%</Badge></span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2">
                  <span className="text-[10px] text-[var(--muted)]">{relTime(p.publishedAt)}</span>
                  <a href={p.url} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                    Open <Icon.external width={12} />
                  </a>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Discovery />
    </Suspense>
  );
}
