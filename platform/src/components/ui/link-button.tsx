import Link from 'next/link';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { buttonVariants, type ButtonSize, type ButtonVariant } from './button-variants';

/**
 * رابطٌ بهيئة زرّ — عنصرٌ واحد لا زرٌّ داخل رابط.
 *
 * ★ كان النمط في الواجهة `<Link><Button/></Link>` في اثنين وثلاثين موضعاً.
 *
 *   وهو عنصران تفاعليان متداخلان: لوحةُ المفاتيح تقف على الرابط ثم على
 *   الزرّ داخله فتحتاج ضغطتين لتعبر إجراءً واحداً، وقارئ الشاشة يُعلن
 *   «رابط، زرّ» فلا يُعرف أيُّهما يُفعَّل. والمعيار يمنعه صراحةً.
 *
 *   فالرابط هنا يحمل هيئة الزرّ (`buttonVariants`) بنفسه: مقاساته وألوانه
 *   وحلقة تركيزه — ويبقى رابطاً واحداً يُفتح في تبويبٍ جديد كأيّ رابط.
 *
 * والمكوّن بلا `use client`: يُستعمل في صفحات الخادم كما في العميل.
 * و`as="a"` للتنزيل وللروابط الخارجية، حيث لا معنى للتنقّل الداخلي.
 */
export function LinkButton({
  href,
  variant,
  size,
  fullWidth,
  as = 'link',
  className,
  children,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** `a` للتنزيل والروابط الخارجية */
  as?: 'link' | 'a';
  children: ReactNode;
}) {
  const classes = cn(buttonVariants({ variant, size, fullWidth }), className);
  if (as === 'a') {
    return (
      <a href={href} className={classes} {...props}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...props}>
      {children}
    </Link>
  );
}
