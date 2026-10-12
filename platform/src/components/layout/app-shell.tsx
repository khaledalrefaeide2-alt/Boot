'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, ChevronDown, LogOut, PanelRightClose, PanelRightOpen, Settings, User as UserIcon } from 'lucide-react';
import { Sidebar, MobileSidebar } from './sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { ROLE_LABELS } from '@/lib/auth/rbac';
import type { NavSection } from '@/lib/domain/navigation';
import { PermissionsProvider } from '@/lib/auth/permissions-client';
import type { Permission } from '@/lib/auth/rbac';
import type { Role } from '@/generated/prisma';
import { cn } from '@/lib/utils';

/** مفتاح تفضيل طيّ الشريط الجانبي في تخزين المتصفح */
const SIDEBAR_KEY = 'mm:sidebar';

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
  permissions,
  children,
}: {
  user: ShellUser;
  sections: NavSection[];
  appName: string;
  unreadCount: number;
  canAccessAdmin: boolean;
  isAdminArea: boolean;
  /** صلاحيات المستخدم — تُتاح لمكوّنات العميل لتُخفي ما لا يقود إلى شيء */
  permissions: Permission[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  /*
   * طيّ الشريط الجانبي على الشاشات الكبيرة.
   *
   * يبدأ مفروداً دائماً ثم يُقرأ الاختيار المحفوظ بعد التركيب. والسبب أن
   * الخادم لا يرى localStorage: لو بدأ من القيمة المحفوظة لاختلف ما صيّره
   * الخادم عمّا يرسمه العميل في أول إطار، وهو تعارض ترطيب يُسقط الصفحة في
   * React 19 لا يُصلحه بهدوء.
   *
   * والاختيار يُحفظ لأنه تفضيل عمل لا حالة لحظية: من يطوي الشريط ليقرأ
   * جدولاً بأحد عشر عموداً يريده مطوياً في الصفحة التالية أيضاً، لا أن
   * يطويه من جديد مع كل تنقّل.
   */
  const [desktopOpen, setDesktopOpen] = useState(true);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(SIDEBAR_KEY) === 'closed') setDesktopOpen(false);
    } catch {
      // التخزين قد يكون محجوباً (نافذة خاصة، سياسة نطاق) — يبقى الافتراضي
    }
  }, []);

  /*
   * زرّ واحد لسلوكين: درج منبثق على الضيّقة، وطيّ في التدفّق على الواسعة.
   *
   * والتفريق بقياس العرض وقت النقر لا بحالة محفوظة: عرض النافذة يتغيّر بلا
   * إعادة تركيب (تدوير الجهاز، تقسيم الشاشة)، فحالة محسوبة مرة واحدة تصير
   * كاذبة بلا أن يعلم أحد.
   */
  const toggleNav = useCallback(() => {
    const wide = window.matchMedia('(min-width: 1024px)').matches;
    if (!wide) {
      setMobileOpen(true);
      return;
    }
    setDesktopOpen((open) => {
      const next = !open;
      try {
        window.localStorage.setItem(SIDEBAR_KEY, next ? 'open' : 'closed');
      } catch {
        // التخزين محجوب — الطيّ يعمل لهذه الجلسة ولا يُحفظ
      }
      return next;
    });
  }, []);

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
    <div className="relative flex min-h-dvh bg-background">
      <Sidebar sections={sections} appName={appName} open={desktopOpen} />
      <MobileSidebar
        sections={sections}
        appName={appName}
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/*
          الشريط العلوي أبيضُ معتم بحدٍّ سفلي — لا زجاج.

          الزجاج يُظهر ما تحته ممرّراً، فيصير الشريط في جدولٍ طويل لوحةً
          تتبدّل ألوانها مع كلّ صفّ. والمعتم ثابت: أدواته تُقرأ في مكانها
          دائماً.

          الترتيب كما في المرجع: في البداية (يمين) زرّ القائمة ولوحة
          الإدارة، وفي النهاية (يسار) التنبيهات والسمة ثم بطاقة المستخدم.
        */}
        <header className="sticky top-0 z-30 flex h-[4.25rem] items-center gap-2 border-b border-border bg-surface px-3 sm:px-6 no-print">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleNav}
            aria-label={desktopOpen ? 'طيّ قائمة التنقّل' : 'إظهار قائمة التنقّل'}
            aria-expanded={desktopOpen}
            aria-controls="main-nav"
            title={desktopOpen ? 'طيّ القائمة' : 'إظهار القائمة'}
          >
            {desktopOpen ? <PanelRightClose aria-hidden /> : <PanelRightOpen aria-hidden />}
          </Button>

          {canAccessAdmin && (
            <Link
              href={isAdminArea ? '/' : '/admin'}
              className={buttonVariants({ variant: isAdminArea ? 'tonal' : 'secondary', size: 'sm' })}
            >
              <Settings aria-hidden />
              <span className="max-sm:sr-only">
                {isAdminArea ? 'العودة إلى لوحة العرض' : 'لوحة الإدارة'}
              </span>
            </Link>
          )}

          <div className="flex-1" />

          <Link
            href="/notifications"
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'relative')}
            aria-label={
              unreadCount > 0 ? `التنبيهات — ${unreadCount} غير مقروءة` : 'التنبيهات'
            }
          >
            <Bell aria-hidden />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 start-6 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-surface bg-danger px-1 text-2xs font-semibold leading-none text-danger-foreground">
                <span className="num">{unreadCount > 99 ? '99+' : unreadCount}</span>
              </span>
            )}
          </Link>

          <ThemeToggle className="hidden sm:inline-flex" />

          <div className="relative ms-1">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-control items-center gap-2.5 rounded-control px-2 text-start transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--ring)]"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label={`حساب ${user.name}`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-3 text-sm font-semibold text-foreground">
                {user.name.trim().charAt(0).toUpperCase()}
              </div>
              <div className="hidden leading-tight sm:block">
                <p className="max-w-36 truncate text-sm font-semibold text-foreground">{user.name}</p>
                <p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
              </div>
              <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
                <div
                  className="enter-stagger absolute left-0 top-full z-20 mt-2 w-64 rounded-card border border-border bg-surface p-1.5 shadow-elev-3"
                  role="menu"
                >
                  <div className="border-b border-border px-3 py-2.5">
                    <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
                    <p className="ltr truncate text-xs text-muted-foreground">{user.email}</p>
                    <Badge tone="primary" size="sm" className="mt-2">
                      {ROLE_LABELS[user.role]}
                    </Badge>
                  </div>

                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="mt-1 flex h-11 items-center gap-2.5 rounded-control px-3 text-sm text-foreground transition-colors hover:bg-surface-2"
                    role="menuitem"
                  >
                    <UserIcon className="h-5 w-5 text-muted-foreground" aria-hidden />
                    الملف الشخصي
                  </Link>

                  <div className="px-3 py-2 sm:hidden">
                    <ThemeToggle />
                  </div>

                  <button
                    type="button"
                    onClick={onLogout}
                    disabled={loggingOut}
                    className={cn(
                      'flex h-11 w-full items-center gap-2.5 rounded-control px-3 text-sm text-danger transition-colors hover:bg-danger-soft',
                      loggingOut && 'opacity-60',
                    )}
                    role="menuitem"
                  >
                    <LogOut className="h-5 w-5" aria-hidden />
                    {loggingOut ? 'جارٍ تسجيل الخروج…' : 'تسجيل الخروج'}
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        {/* الحشوة 16px على الجوال و24px على سطح المكتب — كما في المواصفة */}
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <PermissionsProvider permissions={permissions}>{children}</PermissionsProvider>
        </main>
      </div>
    </div>
  );
}
