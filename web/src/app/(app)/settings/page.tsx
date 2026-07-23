'use client';
import { useState } from 'react';
import { Icon } from '@/components/icons';
import { Badge, Card, CardTitle, PageHeader } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { useFetch } from '@/hooks/useFetch';
import { compact, relTime } from '@/lib/format';

const TABS = ['General', 'API', 'Database', 'Logs', 'About'] as const;

export default function SettingsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('General');
  return (
    <div>
      <PageHeader title="Settings" subtitle="Configure your platform, API integration and local database." />
      <div className="mb-6 flex flex-wrap gap-1 border-b border-[var(--border)]">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-brand-600 text-brand-600' : 'border-transparent text-[var(--muted)]'}`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'General' && <GeneralTab />}
      {tab === 'API' && <ApiTab />}
      {tab === 'Database' && <DatabaseTab />}
      {tab === 'Logs' && <LogsTab />}
      {tab === 'About' && <AboutTab />}
    </div>
  );
}

function GeneralTab() {
  const { data, refetch } = useFetch<any>('/settings');
  const [saved, setSaved] = useState(false);
  const s = data?.settings || {};
  const save = async (patch: Record<string, string>) => {
    await api.put('/settings', patch);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    refetch();
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardTitle right={saved ? <Badge color="#10B981">Saved</Badge> : undefined}>General</CardTitle>
        <div className="space-y-3">
          <div>
            <label className="label">Application name</label>
            <input className="input" defaultValue={s['general.appName'] || 'FB Intel'} onBlur={(e) => save({ 'general.appName': e.target.value })} />
          </div>
          <div>
            <label className="label">Default language</label>
            <select className="input" defaultValue={s['general.language'] || 'en'} onChange={(e) => save({ 'general.language': e.target.value })}>
              {['en', 'ar', 'es', 'fr', 'de', 'pt'].map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <p className="text-xs text-[var(--muted)]">Theme is toggled from the top bar (light / dark / system).</p>
        </div>
      </Card>
      <Card>
        <CardTitle>Security</CardTitle>
        <ChangePassword />
      </Card>
    </div>
  );
}

function ChangePassword() {
  const [f, setF] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState('');
  const submit = async () => {
    try {
      await api.post('/auth/change-password', f);
      setMsg('Password updated');
      setF({ current: '', next: '' });
    } catch (e: any) {
      setMsg(e?.response?.data?.error || 'Failed');
    }
    setTimeout(() => setMsg(''), 3000);
  };
  return (
    <div className="space-y-3">
      <div><label className="label">Current password</label><input type="password" className="input" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></div>
      <div><label className="label">New password</label><input type="password" className="input" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></div>
      <button className="btn-primary" onClick={submit}>Update password</button>
      {msg && <p className="text-xs text-brand-600">{msg}</p>}
    </div>
  );
}

function ApiTab() {
  const { data, refetch } = useFetch<any>('/settings');
  const status = useFetch<any>('/settings/api/status');
  const s = data?.settings || {};
  const [form, setForm] = useState<any>(null);
  const [test, setTest] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const model = form || {
    provider: s['api.provider'] || 'mock',
    baseUrl: s['api.baseUrl'] || '',
    apiKey: s['api.apiKey'] || '',
    apiSecret: s['api.apiSecret'] || '',
    pages: s['api.pages'] || '5',
    getSentiment: (s['api.getSentiment'] ?? 'true') !== 'false',
    apifyToken: s['api.apifyToken'] || '',
    apifyActor: s['api.apifyActor'] || 'easyapi/facebook-hashtag-search-scraper',
    apifyInput: s['api.apifyInput'] || '',
    apifyResultsLimit: s['api.apifyResultsLimit'] || '50',
  };
  const set = (patch: any) => setForm({ ...model, ...patch });

  const save = async () => {
    await api.put('/settings/api', model);
    refetch();
    status.refetch();
  };
  const runTest = async () => {
    setTesting(true);
    try {
      const res = await api.post('/settings/api/test');
      setTest(res.data);
    } finally {
      setTesting(false);
    }
  };
  const disconnect = async () => {
    await api.post('/settings/api/disconnect');
    setForm(null);
    refetch();
    status.refetch();
  };

  const connected = status.data?.connected;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardTitle
          right={
            <Badge color={connected ? '#10B981' : '#EF4444'}>
              {connected ? 'Connected' : 'Disconnected'}
            </Badge>
          }
        >
          Facebook Direct API
        </CardTitle>
        <div className="space-y-3">
          <div>
            <label className="label">Provider mode</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'mock', label: 'Built-in demo' },
                { id: 'http', label: 'Direct API' },
                { id: 'apify', label: 'Apify' },
              ].map((p) => (
                <button key={p.id} onClick={() => set({ provider: p.id })} className={`rounded-lg border py-2 text-sm ${model.provider === p.id ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-600' : 'border-[var(--border)]'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Third-party Direct API (e.g. apidirect.io) */}
          {model.provider === 'http' && (
            <>
              <div><label className="label">Base URL</label><input className="input" placeholder="https://apidirect.io/v1" value={model.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} /></div>
              <div><label className="label">API Key</label><input className="input" placeholder="Paste your key" value={model.apiKey} onChange={(e) => set({ apiKey: e.target.value })} /></div>
              <div><label className="label">API Secret (optional)</label><input className="input" value={model.apiSecret} onChange={(e) => set({ apiSecret: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Pages per search (1–10)</label>
                  <input type="number" min={1} max={10} className="input" value={model.pages} onChange={(e) => set({ pages: e.target.value })} />
                </div>
                <label className="flex items-center gap-2 text-sm mt-6">
                  <input type="checkbox" checked={model.getSentiment} onChange={(e) => set({ getSentiment: e.target.checked })} />
                  AI sentiment
                </label>
              </div>
              <p className="text-xs text-[var(--muted)]">More pages = more results (apidirect.io bills per page). Keys are encrypted at rest.</p>
            </>
          )}

          {/* Apify platform actor */}
          {model.provider === 'apify' && (
            <>
              <div><label className="label">Apify API token</label><input className="input" placeholder="apify_api_..." value={model.apifyToken} onChange={(e) => set({ apifyToken: e.target.value })} /></div>
              <div><label className="label">Actor (username/name)</label><input className="input" placeholder="easyapi/facebook-hashtag-search-scraper" value={model.apifyActor} onChange={(e) => set({ apifyActor: e.target.value })} /></div>
              <div>
                <label className="label">Input template (JSON) — optional</label>
                <textarea className="input font-mono text-xs h-24" placeholder={'{"searchQuery":"{{query}}","maxItems":{{limit}}}'} value={model.apifyInput} onChange={(e) => set({ apifyInput: e.target.value })} />
                <p className="text-[10px] text-[var(--muted)] mt-1">Use <code>{'{{query}}'}</code> for the search term and <code>{'{{limit}}'}</code> for the results limit. Leave empty to use the default.</p>
              </div>
              <div><label className="label">Results limit</label><input type="number" min={1} max={1000} className="input" value={model.apifyResultsLimit} onChange={(e) => set({ apifyResultsLimit: e.target.value })} /></div>
              <p className="text-xs text-[var(--muted)]">The token is encrypted at rest. The actor runs synchronously via Apify's run-sync dataset endpoint.</p>
            </>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <button className="btn-primary" onClick={save}>Save connection</button>
            <button className="btn-ghost" onClick={runTest} disabled={testing}>{testing ? 'Testing…' : 'Test connection'}</button>
            <button className="btn-ghost text-red-500" onClick={disconnect}>Disconnect</button>
          </div>
          {test && (
            <div className={`rounded-lg px-3 py-2 text-sm ${test.ok ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-500'}`}>
              {test.ok ? '✓ ' : '✗ '}{test.message} ({test.latencyMs}ms)
            </div>
          )}
        </div>
      </Card>
      <Card>
        <CardTitle>Rate Limit Monitor</CardTitle>
        <div className="space-y-2 text-sm">
          <Stat label="Total requests" value={compact(status.data?.usage?.total || 0)} />
          <Stat label="Last 24h" value={compact(status.data?.usage?.last24h || 0)} />
          <Stat label="Errors" value={String(status.data?.usage?.errors || 0)} />
          <Stat label="Error rate" value={`${status.data?.usage?.errorRate || 0}%`} />
          <Stat label="Avg latency" value={`${status.data?.usage?.avgDurationMs || 0}ms`} />
        </div>
      </Card>
    </div>
  );
}

function DatabaseTab() {
  const { data, refetch } = useFetch<any>('/database/health');
  const [msg, setMsg] = useState('');

  const act = async (path: string, label: string) => {
    try {
      await api.post(`/database/${path}`);
      setMsg(`${label} completed.`);
      refetch();
    } catch (e: any) {
      setMsg(e?.response?.data?.error || 'Action failed');
    }
    setTimeout(() => setMsg(''), 3000);
  };
  const exportDb = async () => {
    const res = await fetch('/api/database/export', { headers: { Authorization: `Bearer ${getToken()}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'fbintel-export.json'; a.click();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardTitle right={<Badge color={data?.integrity === 'ok' ? '#10B981' : '#F59E0B'}>{data?.integrity || '—'}</Badge>}>
          Database Health
        </CardTitle>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Stat label="Engine" value={data?.client || 'sqlite'} />
          <Stat label="Size" value={`${data?.sizeMb ?? 0} MB`} />
          <Stat label="Total rows" value={compact(data?.totalRows || 0)} />
          <Stat label="Tables" value={String(Object.keys(data?.tables || {}).length)} />
        </div>
        <div className="max-h-52 overflow-y-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(data?.tables || {}).map(([t, n]) => (
                <tr key={t} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-3 py-1.5 text-[var(--muted)]">{t}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{compact(n as number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <CardTitle>Maintenance</CardTitle>
        {msg && <div className="mb-3 rounded-lg bg-brand-50 dark:bg-brand-900/20 px-3 py-2 text-xs text-brand-600">{msg}</div>}
        <div className="space-y-2">
          <button className="btn-ghost w-full justify-start" onClick={() => act('initialize', 'Initialize')}><Icon.database width={16} /> Initialize database</button>
          <button className="btn-ghost w-full justify-start" onClick={() => act('optimize', 'Optimize')}><Icon.spark width={16} /> Optimize (VACUUM)</button>
          <button className="btn-ghost w-full justify-start" onClick={exportDb}><Icon.download width={16} /> Export database</button>
          <button className="btn-ghost w-full justify-start" onClick={() => act('clear-cache', 'Clear cache')}><Icon.trash width={16} /> Clear cache</button>
          <button className="btn-ghost w-full justify-start text-red-500" onClick={() => confirm('Reset all analytics data? Users & settings are kept.') && act('reset', 'Reset')}>
            <Icon.trash width={16} /> Reset application
          </button>
        </div>
      </Card>
    </div>
  );
}

function LogsTab() {
  const { data } = useFetch<any>('/settings/api/logs');
  return (
    <Card>
      <CardTitle>API Logs</CardTitle>
      <div className="overflow-x-auto max-h-[500px]">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
              <th className="py-2">Endpoint</th><th>Method</th><th>Status</th><th>Duration</th><th>Time</th>
            </tr>
          </thead>
          <tbody>
            {(data?.logs || []).map((l: any) => (
              <tr key={l.id} className="border-b border-[var(--border)]">
                <td className="py-2 font-mono text-xs">{l.endpoint}</td>
                <td>{l.method}</td>
                <td><Badge color={l.ok ? '#10B981' : '#EF4444'}>{l.status_code}</Badge></td>
                <td>{l.duration_ms}ms</td>
                <td className="text-[var(--muted)]">{relTime(l.created_at)}</td>
              </tr>
            ))}
            {!data?.logs?.length && <tr><td colSpan={5} className="py-8 text-center text-[var(--muted)]">No API calls logged yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AboutTab() {
  return (
    <Card>
      <CardTitle>About</CardTitle>
      <div className="space-y-2 text-sm max-w-lg">
        <p className="font-medium text-lg">FB Intel — Facebook Analytics & Social Intelligence Platform</p>
        <p className="text-[var(--muted)]">Version 1.0.0</p>
        <p className="text-[var(--muted)]">
          An enterprise-grade social listening platform for Facebook hashtags, keywords, public
          content and engagement analytics. Built with Next.js, Express, TypeScript and SQLite.
        </p>
        <div className="pt-3 flex flex-wrap gap-2">
          {['Next.js', 'React', 'TypeScript', 'Tailwind', 'ECharts', 'Express', 'SQLite', 'JWT'].map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
      <span className="text-[var(--muted)] text-sm">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
