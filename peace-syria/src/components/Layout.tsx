import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BookOpen,
  Flag,
  Gauge,
  HeartHandshake,
  LayoutDashboard,
  MoreHorizontal,
  Newspaper,
  ShieldAlert,
  Siren,
  X,
} from 'lucide-react';
import { cx, useScrollLock } from '../lib/utils';
import { useStatus } from '../lib/status';

export interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: typeof Gauge;
  description: string;
}

export const navItems: NavItem[] = [
  { to: '/meter', label: 'مقياس لغة السلام', short: 'المقياس', icon: Gauge, description: 'افحص نصّك قبل نشره' },
  { to: '/today', label: 'منشورات اليوم', short: 'اليوم', icon: Newspaper, description: 'محتوى يومي جاهز للنشر' },
  { to: '/rumors', label: 'شائعة وتصحيح', short: 'الشائعات', icon: ShieldAlert, description: 'تحقّق وفنّد الشائعات' },
  { to: '/stories', label: 'قصص إيجابية', short: 'القصص', icon: HeartHandshake, description: 'قصص من المجتمع' },
  { to: '/guidelines', label: 'إرشادات عامة', short: 'الإرشادات', icon: BookOpen, description: 'دليل الأمان الرقمي' },
  { to: '/report', label: 'الإبلاغ عن كراهية', short: 'إبلاغ', icon: Flag, description: 'بلّغ عن محتوى تحريضي' },
  { to: '/dashboard', label: 'لوحة التحكم', short: 'اللوحة', icon: LayoutDashboard, description: 'مراجعة واعتماد المحتوى' },
];

const primaryMobile = navItems.slice(0, 4);
const secondaryMobile = navItems.slice(4);

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-xl shadow-lg shadow-teal-600/20">
        <span aria-hidden>🕊️</span>
      </div>
      {!compact ? (
        <div className="leading-tight">
          <p className="text-base font-extrabold tracking-tight text-slate-900">سلام في سوريا</p>
          <p className="text-xs font-medium text-slate-500">منصة بناء السلام الرقمي</p>
        </div>
      ) : null}
    </div>
  );
}

function CrisisPill() {
  const { status } = useStatus();
  if (!status) return null;

  return status.crisisMode ? (
    <span className="chip gap-1.5 bg-red-100 text-red-700">
      <Siren className="h-3.5 w-3.5" aria-hidden />
      وضع الأزمة مُفعّل
    </span>
  ) : (
    <span className="chip gap-1.5 bg-emerald-100 text-emerald-700">
      <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
      الوضع الاعتيادي
    </span>
  );
}

function NavBadge({ to }: { to: string }) {
  const { status } = useStatus();
  if (to !== '/dashboard' || !status) return null;
  const pending = status.counts.pendingPosts + status.counts.pendingStories;
  if (!pending) return null;

  return (
    <span className="nums mr-auto rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold text-amber-800">
      {pending}
    </span>
  );
}

function Sidebar() {
  return (
    <aside className="fixed inset-y-0 right-0 hidden w-72 flex-col border-l border-slate-200 bg-white/80 backdrop-blur-xl lg:flex">
      <div className="px-6 py-6">
        <Brand />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-4 pb-6">
        {navItems.map(({ to, label, icon: Icon, description }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cx(
                'group flex items-start gap-3 rounded-2xl px-3 py-3 transition',
                isActive ? 'bg-teal-50 text-teal-800 shadow-sm' : 'text-slate-600 hover:bg-slate-100',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cx(
                    'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition',
                    isActive ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-white',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-bold">{label}</span>
                    <NavBadge to={to} />
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-400">{description}</span>
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-100 px-6 py-4">
        <CrisisPill />
        <p className="mt-3 text-[11px] leading-5 text-slate-400">
          منصة تجريبية لبناء السلام الرقمي. المحتوى المولَّد بالذكاء الاصطناعي يخضع لمراجعة بشرية قبل النشر.
        </p>
      </div>
    </aside>
  );
}

function MobileMoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useScrollLock(open);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 animate-fade-in rounded-t-3xl bg-white p-5 pb-8 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-slate-900">أقسام إضافية</h2>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100" aria-label="إغلاق">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {secondaryMobile.map(({ to, label, icon: Icon, description }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-2xl border px-4 py-3 transition',
                  isActive ? 'border-teal-200 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-700',
                )
              }
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              <span>
                <span className="block text-sm font-bold">{label}</span>
                <span className="block text-xs text-slate-400">{description}</span>
              </span>
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}

function MobileNav({ onOpenMore }: { onOpenMore: () => void }) {
  const location = useLocation();
  const moreActive = secondaryMobile.some((item) => location.pathname.startsWith(item.to));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-2xl items-stretch justify-between px-2">
        {primaryMobile.map(({ to, short, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cx(
                'flex flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2.5 text-[11px] font-bold transition',
                isActive ? 'text-teal-700' : 'text-slate-400',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className={cx('rounded-xl px-3 py-1 transition', isActive && 'bg-teal-50')}>
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                {short}
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={onOpenMore}
          className={cx(
            'flex flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2.5 text-[11px] font-bold transition',
            moreActive ? 'text-teal-700' : 'text-slate-400',
          )}
        >
          <span className={cx('rounded-xl px-3 py-1 transition', moreActive && 'bg-teal-50')}>
            <MoreHorizontal className="h-5 w-5" aria-hidden />
          </span>
          المزيد
        </button>
      </div>
    </nav>
  );
}

export function Layout() {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();

  // New route → back to the top, and never leave the sheet open behind a page change.
  useEffect(() => {
    setMoreOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-slate-50 lg:pr-72">
      <Sidebar />

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Brand />
          <CrisisPill />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-16 lg:pt-10">
        <Outlet />
      </main>

      <MobileNav onOpenMore={() => setMoreOpen(true)} />
      <MobileMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  );
}
