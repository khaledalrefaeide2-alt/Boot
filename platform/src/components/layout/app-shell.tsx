'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, LogOut, PanelRightClose, PanelRightOpen, Shield, User as UserIcon } from 'lucide-react';
import { Sidebar, MobileSidebar } from './sidebar';
import { AmbientBackground } from './ambient-background';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { ROLE_LABELS } from '@/lib/auth/rbac';
import type { NavSection } from '@/lib/domain/navigation';
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
      {/*
        الخلفية أولاً في ترتيب المستند وفي طبقة مستقلة تحت الجميع. والشريط
        الجانبي وعمود المحتوى يرتفعان فوقها بـ z-10 صراحةً: بدونها يقرّر
        ترتيب المستند وحده أيّهما فوق، فتغطّي الهالةُ المحتوى في المتصفحات
        التي تُنشئ سياق تكديس جديداً عند التحويل.
      */}
      <AmbientBackground />
      <Sidebar sections={sections} appName={appName} open={desktopOpen} />
      <MobileSidebar
        sections={sections}
        appName={appName}
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/*
          الشريط العلوي زجاجي لا معتم: المحتوى يمرّ تحته فيبقى الإحساس بأن
          الصفحة طبقة واحدة تتحرك خلف لوح ثابت، لا شريطٌ يقصّ ما تحته. ولذلك
          رُفع ارتفاعه إلى 4rem — الزجاج يحتاج مساحة ليُقرأ زجاجاً.
        */}
        <header className="glass sticky top-0 z-30 flex h-16 items-center gap-2 border-0 border-b border-border px-3 sm:px-4 no-print">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleNav}
            aria-label={desktopOpen ? 'طيّ قائمة التنقّل' : 'إظهار قائمة التنقّل'}
            aria-expanded={desktopOpen}
            aria-controls="main-nav"
            title={desktopOpen ? 'طيّ القائمة' : 'إظهار القائمة'}
          >
            {desktopOpen ? (
              <PanelRightClose className="h-5 w-5" aria-hidden />
            ) : (
              <PanelRightOpen className="h-5 w-5" aria-hidden />
            )}
          </Button>

          {canAccessAdmin && (
            <Link href={isAdminArea ? '/' : '/admin'}>
              {/*
                زرّ تنقّل لا زرّ إجراء، فنغمته واحدة في الاتجاهين.
                كان يلبس النغمة المصبوغة داخل الإدارة، فيظهر في أعلى كلّ
                شاشة إدارية مصبوغاً فوق زرّ الإجراء الحقيقي أسفله — لونان
                متنافسان على انتباه واحد. والعين تتبع اللون، فكانت تتبع
                «العودة» لا «حساب جديد».
              */}
              <Button variant="secondary" size="sm">
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
              <span className="absolute -top-0.5 left-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-2xs font-semibold text-white shadow-[0_0_12px_-2px_var(--danger)]">
                <span className="num">{unreadCount > 99 ? '99+' : unreadCount}</span>
              </span>
            )}
          </Link>

          <ThemeToggle className="hidden sm:inline-flex" />

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface/60 px-2 py-1.5 text-start transition-colors hover:border-border-strong hover:bg-surface-2"
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
                  className="glass-panel enter-stagger absolute left-0 top-full z-20 mt-2 w-60 rounded-xl p-1.5 shadow-elev-3"
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

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-10 xl:px-10">{children}</main>
      </div>
    </div>
  );
}
