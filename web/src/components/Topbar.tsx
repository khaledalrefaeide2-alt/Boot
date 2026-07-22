'use client';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useFetch } from '@/hooks/useFetch';
import { relTime } from '@/lib/format';
import { Icon } from './icons';

export function Topbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { user, logout } = useAuth();

  return (
    <header className="glass sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-[var(--border)] px-4 md:px-6">
      <button className="btn-ghost !p-2" onClick={onToggleSidebar} aria-label="Toggle sidebar">
        <Icon.menu />
      </button>

      <GlobalSearch />

      <div className="ml-auto flex items-center gap-2">
        <NotificationBell />
        <button
          className="btn-ghost !p-2"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle theme"
        >
          {mounted && resolvedTheme === 'dark' ? <Icon.sun /> : <Icon.moon />}
        </button>
        <div className="hidden sm:flex items-center gap-2 pl-2">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-brand-600 text-white text-xs font-semibold">
            {user?.name?.slice(0, 2).toUpperCase()}
          </div>
          <div className="leading-tight">
            <div className="text-sm font-medium">{user?.name}</div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{user?.role}</div>
          </div>
        </div>
        <button className="btn-ghost !p-2" onClick={logout} title="Log out">
          <Icon.logout />
        </button>
      </div>
    </header>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<any>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) return setResults(null);
      const { data } = await api.get('/search', { params: { q } });
      setResults(data);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const groups = results
    ? [
        { label: 'Keywords', items: results.keywords, href: (v: any) => `/keywords?q=${encodeURIComponent(v.value)}` },
        { label: 'Hashtags', items: results.hashtags, href: (v: any) => `/hashtags?q=${encodeURIComponent(v.value)}` },
        { label: 'Pages', items: results.pages, href: () => `/competitors` },
        { label: 'Reports', items: results.reports, href: () => `/reports`, text: (v: any) => v.title },
        { label: 'History', items: results.history, href: () => `/history`, text: (v: any) => v.query },
      ].filter((g) => g.items?.length)
    : [];

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <div className="relative">
        <Icon.search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" width={17} height={17} />
        <input
          className="input pl-9"
          placeholder="Search keywords, hashtags, pages…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && groups.length > 0 && (
        <div className="absolute mt-2 w-full card p-2 max-h-96 overflow-y-auto z-40">
          {groups.map((g) => (
            <div key={g.label} className="mb-1">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                {g.label}
              </div>
              {g.items.map((v: any, i: number) => (
                <Link
                  key={i}
                  href={g.href(v)}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-2 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5 truncate"
                >
                  {g.text ? g.text(v) : v.value}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationBell() {
  const { data, refetch } = useFetch<any>('/notifications');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const markAll = async () => {
    await api.post('/notifications/read-all');
    refetch();
  };

  return (
    <div ref={ref} className="relative">
      <button className="btn-ghost !p-2 relative" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        <Icon.bell />
        {data?.unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 card p-2 z-40">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-sm font-semibold">Notifications</span>
            <button className="text-xs text-brand-600 hover:underline" onClick={markAll}>
              Mark all read
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {(data?.notifications || []).slice(0, 10).map((n: any) => (
              <div key={n.id} className="rounded-lg px-2 py-2 hover:bg-black/5 dark:hover:bg-white/5">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ background: n.read ? '#94a3b8' : NOTIF_COLOR[n.type] || '#2563EB' }}
                  />
                  <span className="text-sm font-medium truncate">{n.title}</span>
                </div>
                {n.body && <p className="ml-4 text-xs text-[var(--muted)] mt-0.5">{n.body}</p>}
                <p className="ml-4 text-[10px] text-[var(--muted)] mt-0.5">{relTime(n.created_at)}</p>
              </div>
            ))}
            {!data?.notifications?.length && (
              <p className="px-2 py-6 text-center text-sm text-[var(--muted)]">No notifications</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const NOTIF_COLOR: Record<string, string> = {
  info: '#2563EB',
  warning: '#F59E0B',
  error: '#EF4444',
  success: '#10B981',
  trend: '#8B5CF6',
};
