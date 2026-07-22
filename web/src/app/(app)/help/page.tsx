'use client';
import { Card, CardTitle, PageHeader } from '@/components/ui';

const FAQ = [
  { q: 'How do I connect a real Facebook Direct API?', a: 'Go to Settings → API, switch provider mode to "Third-party Direct API", enter your Base URL and API key, then Test connection. Keys are encrypted at rest.' },
  { q: 'Where is my data stored?', a: 'Locally in SQLite by default (server/data/fbintel.db). PostgreSQL is supported as an optional upgrade via DB_CLIENT and DATABASE_URL.' },
  { q: 'How do exports work?', a: 'The Reports Center generates CSV server-side. PDF/Excel return a structured dataset the client renders. All report data is drawn from your stored analytics.' },
  { q: 'What are the user roles?', a: 'Admin (full access), Editor (create/edit + API), Viewer (read-only). The first registered account becomes the admin.' },
  { q: 'How do alerts trigger?', a: 'Alerts are evaluated against the latest metric snapshots every 5 minutes, or on demand from the Alerts Center. Triggered alerts appear in the notification center.' },
];

const SHORTCUTS = [
  ['Global search', 'Top bar search box'],
  ['Toggle theme', 'Sun/moon icon'],
  ['Collapse sidebar', 'Menu icon'],
];

export default function HelpPage() {
  return (
    <div>
      <PageHeader title="Help & Documentation" subtitle="Get the most out of your social intelligence platform." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>Frequently asked questions</CardTitle>
          <div className="divide-y divide-[var(--border)]">
            {FAQ.map((f) => (
              <div key={f.q} className="py-3">
                <p className="font-medium text-sm">{f.q}</p>
                <p className="text-sm text-[var(--muted)] mt-1">{f.a}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardTitle>Quick tips</CardTitle>
          <div className="space-y-2 text-sm">
            {SHORTCUTS.map(([a, b]) => (
              <div key={a} className="flex items-center justify-between">
                <span>{a}</span>
                <span className="text-[var(--muted)] text-xs">{b}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
