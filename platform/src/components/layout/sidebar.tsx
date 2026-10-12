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
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/*
        العلامة في البداية (يمين) والاسم يليها — كما في المرجع.
        والاسم من الإعدادات (`appName`) لا نصٌّ ثابت: هو اسم المنصّة الذي
        ضبطه المشغّل، وتغييره لا يمرّ بالشيفرة.
      */}
      <div className="flex items-center gap-3 px-5 pb-5 pt-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card bg-sidebar-active text-sidebar-active-foreground shadow-elev-1">
          <ShieldCheck className="h-6 w-6" aria-hidden />
        </div>
        <div className="min-w-0 leading-tight">
          {/*
            الاسم يلتفّ سطرين ولا يُقصّ: «منصة رصد وتحليل…» تحذف من اسم
            المنصّة ما يميّزها. والاسم القصير يبقى سطراً واحداً بالمقاس نفسه.
          */}
          <p className="line-clamp-2 text-base font-bold leading-snug text-sidebar-heading" title={appName}>
            {appName}
          </p>
          <p className="eyebrow eyebrow-latin mt-1 text-[0.6875rem] text-sidebar-muted">
            Media Monitoring
          </p>
        </div>
      </div>

      {/*
        المجموعات مفصولةٌ بخطٍّ خفيف لا بمسافةٍ وحدها.

        المسافة تُقرأ فراغاً قد يكون عرضياً، والخطّ يُقرأ حدّاً مقصوداً:
        «هنا ينتهي الرصد ويبدأ ما يُرصد منه». والعنوان بتركوازٍ فاتح —
        اللون الوحيد في القائمة غيرُ العنصر النشط — فيُقرأ عنواناً لا
        عنصراً يُنقر.
      */}
      <nav
        id="main-nav"
        className="sidebar-scroll flex-1 overflow-y-auto px-3 pb-6"
        aria-label="التنقل الرئيسي"
      >
        {sections.map((section, index) => (
          <div
            key={section.title}
            className={cn('space-y-1 py-4', index > 0 && 'border-t border-sidebar-border')}
          >
            <p className="px-3 pb-2 text-xs font-semibold text-sidebar-section">{section.title}</p>
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
                    'flex h-11 items-center gap-3 rounded-control px-3 text-sm transition-[background-color,color] duration-150',
                    'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--sidebar-heading)]',
                    stagger && 'enter-stagger',
                    active
                      ? 'bg-sidebar-active font-semibold text-sidebar-active-foreground shadow-elev-1'
                      : 'font-medium text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-heading',
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden />
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

export function Sidebar({
  sections,
  appName,
  open,
}: {
  sections: NavSection[];
  appName: string;
  /** مطوي أم مفرود — على الشاشات الكبيرة وحدها */
  open: boolean;
}) {
  return (
    /*
     * الشريط يبقى في تدفّق الصفحة ويطوى بالعرض لا بالإزاحة: الطيّ بالإزاحة
     * (translate) يُبقي مكانه محجوزاً فلا يكسب المحتوى شيئاً، وكسب العرض هو
     * الغرض كله — جدول الحسابات أحد عشر عموداً، و240 بكسل إضافية تعني عمودين
     * بلا تمرير أفقي.
     *
     * والانتقال على العرض وحده لا على كل شيء: هو الخاصية الوحيدة المتغيّرة،
     * وتعميم transition-all يُحرّك الألوان والحدود معها بلا داعٍ.
     *
     * inert حين يُطوى — وهي ليست تفصيلاً: العنصر المطوي عرضه صفر ومقصوص،
     * لكن روابطه تبقى في ترتيب الجدولة. فمن يتنقّل بلوحة المفاتيح يمرّ على
     * ثلاثة عشر رابطاً لا يراها أحد قبل أن يصل إلى المحتوى.
     */
    <aside
      inert={!open || undefined}
      aria-hidden={!open || undefined}
      className={cn(
        'relative z-10 hidden shrink-0 overflow-hidden bg-sidebar transition-[width] duration-200 ease-out lg:block no-print',
        open ? 'w-sidebar' : 'w-0',
      )}
    >
      {/* عرض ثابت داخلي: بدونه ينضغط المحتوى مع العرض فيتشوّه أثناء الطيّ */}
      <div className="sticky top-0 h-dvh w-sidebar">
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
        className="fixed inset-0 bg-[#0b1320]/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-y-0 right-0 w-[17rem] max-w-[85vw] bg-sidebar shadow-elev-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="absolute left-2 top-5 z-10 text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-heading"
          aria-label="إغلاق القائمة"
        >
          <X aria-hidden />
        </Button>
        <SidebarContent sections={sections} appName={appName} onNavigate={onClose} stagger />
      </div>
    </div>
  );
}
