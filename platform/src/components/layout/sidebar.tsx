'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NavSection } from '@/lib/domain/navigation';
import { navIcon } from '@/lib/domain/nav-icons';
import { Button } from '@/components/ui/button';
import { STAGGER_MS } from '@/lib/motion';

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarContent({
  sections,
  appName,
  onNavigate,
  stagger = false,
}: {
  sections: NavSection[];
  appName: string;
  onNavigate?: () => void;
  /** دخول متتابع — للدرج المنبثق وحده، لا للشريط الثابت */
  stagger?: boolean;
}) {
  const pathname = usePathname();
  let order = 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-4">
        {/*
          العلامة تحمل الهالة وحدها في كامل الشريط. الهالة تُقرأ «هنا المركز»،
          وتكرارها على كل أيقونة يُلغي معناها ويحوّل الشريط إلى لوحة إعلانات.
        */}
        <div className="glow flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ShieldCheck className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-bold tracking-[-0.01em] text-foreground">{appName}</p>
          <p className="overline overline-latin mt-0.5">Media Monitoring</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="التنقل الرئيسي">
        {sections.map((section) => (
          <div key={section.title} className="space-y-1">
            <p className="overline px-2.5 pb-1.5">{section.title}</p>
            {section.items.map((item) => {
              const active = isActive(pathname, item.href, item.exact);
              const Icon = navIcon(item.icon);
              const delay = stagger ? `${order++ * (STAGGER_MS / 2)}ms` : undefined;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  style={delay ? ({ '--stagger': delay } as React.CSSProperties) : undefined}
                  className={cn(
                    'relative flex items-center gap-2.5 rounded-lg py-2 pe-2.5 ps-3.5 text-sm transition-[background-color,color] duration-200',
                    stagger && 'enter-stagger',
                    active
                      ? 'nav-indicator bg-primary-soft/70 font-semibold text-primary-soft-foreground'
                      : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                  )}
                >
                  <Icon
                    className={cn('h-4 w-4 shrink-0', active && 'text-primary')}
                    aria-hidden
                  />
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
      {/*
        الحجاب معتم ومطموس معاً: العتمة وحدها تُبقي النص خلفه مقروءاً فيتنافس
        مع الدرج على الانتباه، والطمس وحده لا يكفي لخفض السطوع على شاشة فاتحة.
      */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="glass-panel fixed inset-y-0 right-0 w-72 max-w-[85vw] border-0 border-l border-border shadow-elev-4">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          className="absolute left-2 top-3.5 z-10"
          aria-label="إغلاق القائمة"
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
        <SidebarContent sections={sections} appName={appName} onNavigate={onClose} stagger />
      </div>
    </div>
  );
}
