'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NavSection } from '@/lib/domain/navigation';
import { navIcon } from '@/lib/domain/nav-icons';
import { Button } from '@/components/ui/button';

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarContent({
  sections,
  appName,
  onNavigate,
}: {
  sections: NavSection[];
  appName: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <ShieldCheck className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-foreground">{appName}</p>
          <p className="text-[0.6875rem] text-muted-foreground">نظام داخلي</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="التنقل الرئيسي">
        {sections.map((section) => (
          <div key={section.title} className="space-y-1">
            <p className="px-2 pb-1 text-[0.6875rem] font-semibold tracking-wide text-subtle-foreground">
              {section.title}
            </p>
            {section.items.map((item) => {
              const active = isActive(pathname, item.href, item.exact);
              const Icon = navIcon(item.icon);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                    active
                      ? 'bg-primary-soft font-medium text-primary-soft-foreground'
                      : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}

export function Sidebar({ sections, appName }: { sections: NavSection[]; appName: string }) {
  return (
    <aside className="hidden w-60 shrink-0 border-l border-border bg-surface lg:block no-print">
      <div className="sticky top-0 h-dvh">
        <SidebarContent sections={sections} appName={appName} />
      </div>
    </aside>
  );
}

export function MobileSidebar({
  sections,
  appName,
  open,
  onClose,
}: {
  sections: NavSection[];
  appName: string;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden no-print">
      <div className="fixed inset-0 bg-black/45" onClick={onClose} aria-hidden />
      <div className="fixed inset-y-0 right-0 w-72 max-w-[85vw] border-l border-border bg-surface shadow-lg">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          className="absolute left-2 top-3.5 z-10"
          aria-label="إغلاق القائمة"
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
        <SidebarContent sections={sections} appName={appName} onNavigate={onClose} />
      </div>
    </div>
  );
}
