'use client';

import { usePathname } from 'next/navigation';
import { ADMIN_NAV, VIEWER_NAV } from '@/lib/domain/navigation';
import { navIcon } from '@/lib/domain/nav-icons';

/*
 * أيقونة الصفحة — تُشتقّ من التنقّل لا تُكتب في كلّ صفحة.
 *
 * ★ لماذا لا يمرّرها كلّ عنوانٍ بنفسه؟
 *
 *   ثمانٍ وثلاثون صفحة، ولكلٍّ أيقونتُها في القائمة الجانبية أصلاً. فلو
 *   كُتبت في العنوان مرّةً ثانية لافترقت عن أيقونة القائمة عند أوّل
 *   تعديل، فيرى الموظّف في القائمة شكلاً وفي العنوان شكلاً آخر للصفحة
 *   نفسها. والاشتقاق يجعلهما شيئاً واحداً — ومن يضيف صفحةً غداً يحصل
 *   على أيقونتها بلا سطر.
 *
 * والمطابقة على أطول بادئة: `/posts/123` تأخذ أيقونة `/posts`، و
 * `/admin/users` تأخذ أيقونتها لا أيقونة `/admin`.
 */
const ITEMS = [...VIEWER_NAV, ...ADMIN_NAV].flatMap((section) => section.items);

export function PageIcon() {
  const pathname = usePathname();

  const match = ITEMS.filter((item) =>
    item.exact
      ? pathname === item.href
      : item.href === '/'
        ? pathname === '/'
        : pathname === item.href || pathname.startsWith(`${item.href}/`),
  ).sort((a, b) => b.href.length - a.href.length)[0];

  if (!match) return null;
  const Icon = navIcon(match.icon);

  return (
    <span
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card border border-border bg-surface text-primary-text shadow-elev-1"
      aria-hidden
    >
      <Icon className="h-6 w-6" />
    </span>
  );
}
