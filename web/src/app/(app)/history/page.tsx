'use client';
import { useState } from 'react';
import { Icon } from '@/components/icons';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useFetch } from '@/hooks/useFetch';
import { compact, relTime } from '@/lib/format';

export default function HistoryPage() {
  const [showDeleted, setShowDeleted] = useState(false);
  const [type, setType] = useState('');
  const url = `/history?deleted=${showDeleted ? 1 : 0}${type ? `&type=${type}` : ''}`;
  const { data, refetch } = useFetch<any>(url, [url]);

  const act = async (id: number, action: string) => {
    if (action === 'delete') await api.delete(`/history/${id}`);
    else await api.post(`/history/${id}/${action}`);
    refetch();
  };

  return (
    <div>
      <PageHeader
        title="Search History"
        subtitle="Every search is stored — favorite, delete, restore or export."
        actions={
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
            Show deleted
          </label>
        }
      />

      <div className="mb-4 flex gap-1 rounded-xl border border-[var(--border)] p-1 w-fit">
        {['', 'keyword', 'hashtag', 'content', 'page'].map((t) => (
          <button key={t} onClick={() => setType(t)} className={`rounded-lg px-3 py-1.5 text-sm capitalize ${type === t ? 'bg-brand-600 text-white' : 'text-[var(--muted)]'}`}>
            {t || 'All'}
          </button>
        ))}
      </div>

      <Card>
        {data?.searches?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
                  <th className="py-2">Type</th><th>Query</th><th>Results</th><th>API</th><th>Date</th><th></th>
                </tr>
              </thead>
              <tbody>
                {data.searches.map((s: any) => (
                  <tr key={s.id} className={`border-b border-[var(--border)] ${s.deleted ? 'opacity-50' : ''}`}>
                    <td className="py-2.5"><Badge color={TYPE_COLOR[s.type]}>{s.type}</Badge></td>
                    <td className="font-medium">{s.query}</td>
                    <td>{compact(s.results_count)}</td>
                    <td>{s.api_calls}</td>
                    <td className="text-[var(--muted)]">{relTime(s.created_at)}</td>
                    <td>
                      <div className="flex items-center gap-1 justify-end">
                        <button className={`btn-ghost !p-1.5 ${s.favorite ? 'text-red-500' : ''}`} onClick={() => act(s.id, 'favorite')} title="Favorite">
                          <Icon.heart width={15} />
                        </button>
                        {s.deleted ? (
                          <button className="btn-ghost !p-1.5" onClick={() => act(s.id, 'restore')} title="Restore"><Icon.history width={15} /></button>
                        ) : (
                          <button className="btn-ghost !p-1.5 text-red-500" onClick={() => act(s.id, 'delete')} title="Delete"><Icon.trash width={15} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No search history" />
        )}
      </Card>
    </div>
  );
}

const TYPE_COLOR: Record<string, string> = {
  keyword: '#2563EB',
  hashtag: '#8B5CF6',
  content: '#0EA5E9',
  page: '#F59E0B',
};
