'use client';
import { useState } from 'react';
import { Icon } from '@/components/icons';
import { Badge, Card, CardTitle, EmptyState, PageHeader } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { useFetch } from '@/hooks/useFetch';
import { relTime } from '@/lib/format';

const TEMPLATES = [
  { id: 'executive', label: 'Executive Report', desc: 'High-level KPIs across the workspace.' },
  { id: 'trend', label: 'Trend Report', desc: 'Engagement & mentions over time.' },
  { id: 'hashtag', label: 'Hashtag Report', desc: 'Performance of tracked hashtags.' },
  { id: 'keyword', label: 'Keyword Report', desc: 'Mentions, reach and sentiment by keyword.' },
  { id: 'engagement', label: 'Engagement Report', desc: 'Top posts by engagement rate.' },
  { id: 'competitor', label: 'Competitor Report', desc: 'Page-by-page benchmark.' },
];

export default function ReportsPage() {
  const { data, refetch } = useFetch<any>('/reports');
  const [template, setTemplate] = useState('executive');
  const [format, setFormat] = useState('csv');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      await api.post('/reports', {
        title: title || TEMPLATES.find((t) => t.id === template)!.label,
        template,
        format,
      });
      setTitle('');
      refetch();
    } finally {
      setBusy(false);
    }
  };

  const download = async (r: any) => {
    if (r.format === 'csv') {
      // Stream CSV directly with auth header via fetch.
      const res = await fetch(`/api/reports/${r.id}/download`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const blob = await res.blob();
      triggerDownload(blob, `${r.title}.csv`);
    } else {
      const res = await api.get(`/reports/${r.id}/download`);
      const blob = new Blob([JSON.stringify(res.data.rows, null, 2)], { type: 'application/json' });
      triggerDownload(blob, `${r.title}.${r.format === 'excel' ? 'json' : 'json'}`);
    }
  };

  const remove = async (id: number) => {
    await api.delete(`/reports/${id}`);
    refetch();
  };

  return (
    <div>
      <PageHeader title="Reports Center" subtitle="Generate and export professional reports in PDF, Excel or CSV." />

      <div className="grid gap-4 lg:grid-cols-3 mb-4">
        <Card className="lg:col-span-2">
          <CardTitle>Report templates</CardTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTemplate(t.id)}
                className={`text-left rounded-xl border p-4 transition-colors ${template === t.id ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-[var(--border)] hover:border-brand-400'}`}
              >
                <div className="flex items-center gap-2">
                  <Icon.reports width={18} className="text-brand-600" />
                  <span className="font-medium text-sm">{t.label}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">{t.desc}</p>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle>Generate</CardTitle>
          <div className="space-y-3">
            <div>
              <label className="label">Title</label>
              <input className="input" placeholder="Q3 Executive Summary" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="label">Format</label>
              <div className="flex gap-2">
                {['pdf', 'excel', 'csv'].map((f) => (
                  <button key={f} onClick={() => setFormat(f)} className={`flex-1 rounded-lg border py-2 text-sm uppercase ${format === f ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-600' : 'border-[var(--border)]'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn-primary w-full" onClick={generate} disabled={busy}>
              {busy ? 'Generating…' : 'Generate report'}
            </button>
            <p className="text-xs text-[var(--muted)]">CSV exports server-side. PDF/Excel return a structured dataset for client rendering.</p>
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle>Saved reports</CardTitle>
        {data?.reports?.length ? (
          <div className="divide-y divide-[var(--border)]">
            {data.reports.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{r.title}</span>
                    <Badge>{r.template}</Badge>
                    <Badge color="#0EA5E9">{r.format.toUpperCase()}</Badge>
                  </div>
                  <p className="text-xs text-[var(--muted)] mt-0.5">{relTime(r.created_at)} · {r.user_email}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button className="btn-ghost !p-2" onClick={() => download(r)} title="Download"><Icon.download width={16} /></button>
                  <button className="btn-ghost !p-2 text-red-500" onClick={() => remove(r.id)} title="Delete"><Icon.trash width={16} /></button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No reports yet" hint="Generate your first report above." />
        )}
      </Card>
    </div>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
