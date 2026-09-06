'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, LogOut, Menu, Shield, User as UserIcon } from 'lucide-react';
import { Sidebar, MobileSidebar } from './sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { ROLE_LABELS } from '@/lib/auth/rbac';
import type { NavSection } from '@/lib/domain/navigation';
import type { Role } from '@/generated/prisma';
import { cn } from '@/lib/utils';

export interface ShellUser {
  name: string;
  email: string;
  role: Role;
}

export function AppShell({
  user,
  sections,
  appName,
  unreadCount,
  canAccessAdmin,
  isAdminArea,
  children,
}: {
  user: ShellUser;
  sections: NavSection[];
  appName: string;
  unreadCount: number;
  canAccessAdmin: boolean;
  isAdminArea: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function onLogout() {
    setLoggingOut(true);
    try {
      await api.post('/api/auth/logout');
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar sections={sections} appName={appName} />
      <MobileSidebar
        sections={sections}
        appName={appName}
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface/95 px-3 backdrop-blur sm:px-4 no-print">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="فتح القائمة"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </Button>

          {canAccessAdmin && (
            <Link href={isAdminArea ? '/' : '/admin'}>
              <Button variant={isAdminArea ? 'soft' : 'secondary'} size="sm">
                <Shield className="h-3.5 w-3.5" aria-hidden />
                {isAdminArea ? 'العودة إلى لوحة العرض' : 'لوحة الإدارة'}
              </Button>
            </Link>
          )}

          <div className="flex-1" />

          <Link href="/notifications" className="relative">
            <Button variant="ghost" size="icon" aria-label="التنبيهات">
              <Bell className="h-4.5 w-4.5" aria-hidden />
            </Button>
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 left-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-2xs font-semibold text-white">
                <span className="num">{unreadCount > 99 ? '99+' : unreadCount}</span>
              </span>
            )}
          </Link>

          <ThemeToggle className="hidden sm:inline-flex" />

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5 text-start transition-colors hover:bg-surface-2"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-foreground">
                {user.name.trim().charAt(0)}
              </div>
              <div className="hidden leading-tight sm:block">
                <p className="max-w-32 truncate text-xs font-medium text-foreground">{user.name}</p>
                <p className="text-2xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
              </div>
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
                <div
                  className="absolute left-0 top-full z-20 mt-1.5 w-60 rounded-md border border-border bg-surface p-1.5 shadow-elev-3"
                  role="menu"
                >
                  <div className="border-b border-border px-2.5 py-2">
                    <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
                    <p className="ltr truncate text-xs text-muted-foreground">{user.email}</p>
                    <Badge tone="primary" size="sm" className="mt-1.5">
                      {ROLE_LABELS[user.role]}
                    </Badge>
                  </div>

                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="mt-1 flex items-center gap-2 rounded px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                    role="menuitem"
                  >
                    <UserIcon className="h-4 w-4" aria-hidden />
                    الملف الشخصي
                  </Link>

                  <div className="px-2.5 py-2 sm:hidden">
                    <ThemeToggle />
                  </div>

                  <button
                    type="button"
                    onClick={onLogout}
                    disabled={loggingOut}
                    className={cn(
                      'flex w-full items-center gap-2 rounded px-2.5 py-2 text-sm text-danger transition-colors hover:bg-danger-soft',
                      loggingOut && 'opacity-60',
                    )}
                    role="menuitem"
                  >
                    <LogOut className="h-4 w-4" aria-hidden />
                    {loggingOut ? 'جارٍ تسجيل الخروج…' : 'تسجيل الخروج'}
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
