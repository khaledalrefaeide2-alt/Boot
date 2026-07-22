'use client';
import { useState } from 'react';
import { Icon } from '@/components/icons';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useFetch } from '@/hooks/useFetch';

export default function CollectionsPage() {
  const { data, refetch } = useFetch<any>('/collections');
  const [name, setName] = useState('');
  const [kind, setKind] = useState('mixed');
  const [openId, setOpenId] = useState<number | null>(null);

  const create = async () => {
    if (!name.trim()) return;
    await api.post('/collections', { name, kind });
    setName('');
    refetch();
  };

  const remove = async (id: number) => {
    await api.delete(`/collections/${id}`);
    refetch();
  };

  return (
    <div>
      <PageHeader title="Saved Collections" subtitle="Organize favorite hashtags, keywords, reports and searches into folders." />

      <Card className="mb-4">
        <div className="flex flex-wrap gap-2">
          <input className="input flex-1 min-w-[200px]" placeholder="New collection name…" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="input w-40" value={kind} onChange={(e) => setKind(e.target.value)}>
            {['mixed', 'hashtag', 'keyword', 'report', 'search'].map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <button className="btn-primary" onClick={create}><Icon.plus width={16} /> Create</button>
        </div>
      </Card>

      {data?.collections?.length ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.collections.map((c: any) => (
            <Card key={c.id} className="!p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ background: c.color }}>
                    <Icon.collections width={18} />
                  </div>
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-[var(--muted)]">{c.item_count} items · {c.kind}</div>
                  </div>
                </div>
                <button className="btn-ghost !p-1.5 text-red-500" onClick={() => remove(c.id)}><Icon.trash width={15} /></button>
              </div>
              <button className="mt-3 text-xs text-brand-600 hover:underline" onClick={() => setOpenId(openId === c.id ? null : c.id)}>
                {openId === c.id ? 'Hide items' : 'View items'}
              </button>
              {openId === c.id && <CollectionItems id={c.id} />}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No collections yet" hint="Create a folder to start organizing." />
      )}
    </div>
  );
}

function CollectionItems({ id }: { id: number }) {
  const { data } = useFetch<any>(`/collections/${id}/items`, [id]);
  if (!data?.items?.length) return <p className="mt-2 text-xs text-[var(--muted)]">Empty.</p>;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {data.items.map((it: any) => (
        <Badge key={it.id}>{it.label}</Badge>
      ))}
    </div>
  );
}
