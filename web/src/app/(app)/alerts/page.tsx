'use client';
import { useState } from 'react';
import { Icon } from '@/components/icons';
import { Badge, Card, CardTitle, EmptyState, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useFetch } from '@/hooks/useFetch';
import { relTime } from '@/lib/format';

export default function AlertsPage() {
  const { data, refetch } = useFetch<any>('/alerts');
  const [form, setForm] = useState({ name: '', targetType: 'hashtag', target: '', metric: 'trending_score', operator: '>', threshold: 70 });
  const [msg, setMsg] = useState('');

  const create = async () => {
    if (!form.name || !form.target) return;
    await api.post('/alerts', { ...form, threshold: Number(form.threshold) });
    setForm({ ...form, name: '', target: '' });
    refetch();
  };
  const toggle = async (a: any) => {
    await api.patch(`/alerts/${a.id}`, { active: !a.active });
    refetch();
  };
  const remove = async (id: number) => {
    await api.delete(`/alerts/${id}`);
    refetch();
  };
  const evaluate = async () => {
    const res = await api.post('/alerts/evaluate');
    setMsg(`${res.data.triggered.length} alert(s) triggered — check notifications.`);
    setTimeout(() => setMsg(''), 4000);
  };

  return (
    <div>
      <PageHeader
        title="Alerts Center"
        subtitle="Get notified when a keyword trends, a hashtag surges, or engagement crosses a threshold."
        actions={<button className="btn-ghost" onClick={evaluate}><Icon.spark width={16} /> Evaluate now</button>}
      />

      {msg && <div className="mb-4 rounded-lg bg-brand-50 dark:bg-brand-900/20 px-4 py-2 text-sm text-brand-600">{msg}</div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle>New alert</CardTitle>
          <div className="space-y-3">
            <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="World Cup surge" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">Target type</label>
                <select className="input" value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value })}>
                  {['hashtag', 'keyword', 'page', 'engagement'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label className="label">Target</label><input className="input" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="#worldcup" /></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="label">Metric</label>
                <select className="input" value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })}>
                  {['trending_score', 'engagement', 'mentions', 'growth'].map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div><label className="label">Op</label>
                <select className="input" value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })}>
                  {['>', '<', '>=', '<='].map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div><label className="label">Value</label><input type="number" className="input" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })} /></div>
            </div>
            <button className="btn-primary w-full" onClick={create}><Icon.plus width={16} /> Create alert</button>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle>Active & configured alerts</CardTitle>
          {data?.alerts?.length ? (
            <div className="divide-y divide-[var(--border)]">
              {data.alerts.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{a.name}</span>
                      <Badge color={a.active ? '#10B981' : '#94a3b8'}>{a.active ? 'active' : 'paused'}</Badge>
                    </div>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      {a.target} · {a.metric} {a.operator} {a.threshold}
                      {a.last_triggered_at && ` · last fired ${relTime(a.last_triggered_at)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button className="btn-ghost !p-2" onClick={() => toggle(a)} title="Toggle"><Icon.check width={15} /></button>
                    <button className="btn-ghost !p-2 text-red-500" onClick={() => remove(a.id)} title="Delete"><Icon.trash width={15} /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No alerts configured" hint="Create your first alert on the left." />
          )}
        </Card>
      </div>
    </div>
  );
}
