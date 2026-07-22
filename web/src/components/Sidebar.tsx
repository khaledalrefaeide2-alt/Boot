'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './icons';
import { NAV } from './nav';

export function Sidebar({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <aside
      className={clsx(
        'flex h-full flex-col border-r border-[var(--border)] bg-[var(--card)] transition-all duration-200',
        collapsed ? 'w-[76px]' : 'w-64'
      )}
    >
      <div className="flex items-center gap-2.5 px-5 h-16 shrink-0">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-white font-bold">
          fb
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <div className="font-semibold">FB Intel</div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Social Intelligence</div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
        {NAV.map((group) => (
          <div key={group.section}>
            {!collapsed && (
              <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                {group.section}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href;
                const IconCmp = Icon[item.icon];
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    title={item.label}
                    className={clsx(
                      'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'text-[var(--muted)] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[var(--text)]',
                      collapsed && 'justify-center'
                    )}
                  >
                    <IconCmp width={19} height={19} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
