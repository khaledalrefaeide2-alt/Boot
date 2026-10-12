'use client';

import type { VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { buttonVariants } from './button-variants';

type IconSize = { width: number; height: number };

/** مقاس الأيقونة يتبع مقاس الزرّ عبر رمز يضعه صنف المقاس */
const ICON_STYLE = {
  width: 'var(--btn-icon, 18px)',
  height: 'var(--btn-icon, 18px)',
} satisfies Record<string, string>;

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>,
    VariantProps<typeof buttonVariants> {
  /** أيقونة قبل النصّ — يحلّ المؤشّر الدوّار محلّها أثناء التحميل */
  startIcon?: ReactNode;
  /** أيقونة بعد النصّ */
  endIcon?: ReactNode;
  /** مظهرٌ فقط: مؤشّر دوّار و aria-busy، بلا أي منطق إضافي */
  loading?: boolean;
  children?: ReactNode;
}

const ICON_SIZES = new Set(['icon', 'icon-sm', 'icon-lg']);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    fullWidth,
    loading = false,
    startIcon,
    endIcon,
    disabled,
    children,
    ...props
  },
  ref,
) {
  const iconOnly = ICON_SIZES.has(size ?? '');

  /*
   * الزرّ الأيقوني بلا اسم مقروء زرٌّ لا يعرف قارئ الشاشة ما يفعل. والتحذير
   * في التطوير لا في الإنتاج: كسرُ الصفحة على مستخدمٍ حيّ بسبب تسمية ناقصة
   * أسوأ من التسمية الناقصة نفسها.
   */
  if (process.env.NODE_ENV !== 'production' && iconOnly && !props['aria-label']) {
    console.warn('Button: زرّ أيقوني بلا aria-label — لن يعرف قارئ الشاشة وظيفته.');
  }

  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      /*
       * العنوان يُشتقّ من aria-label حين لا يُمرَّر: المواصفة تطلب تلميحاً
       * على الزرّ الأيقوني، والاسم المقروء هو التلميح نفسه بلا تكرار.
       */
      title={props.title ?? (iconOnly ? (props['aria-label'] as string | undefined) : undefined)}
      {...props}
    >
      {loading ? (
        <Loader2 className="shrink-0 animate-spin" style={ICON_STYLE} aria-hidden />
      ) : (
        startIcon && (
          <span className="inline-flex shrink-0 items-center [&>svg]:h-[var(--btn-icon)] [&>svg]:w-[var(--btn-icon)]">
            {startIcon}
          </span>
        )
      )}

      {children}

      {endIcon && !iconOnly && (
        <span className="inline-flex shrink-0 items-center [&>svg]:h-[var(--btn-icon)] [&>svg]:w-[var(--btn-icon)]">
          {endIcon}
        </span>
      )}
    </button>
  );
});

/*
 * ولا يُعاد تصدير `buttonVariants` من هنا.
 *
 * فمن استوردها من وحدةٍ تبدأ بـ`use client` استوردها عميلاً، فتسقط عند
 * أوّل نداءٍ من الخادم. ومسارُ استيرادٍ واحدٌ (`./button-variants`) يمنع
 * الخطأ بدل أن يؤجّله إلى وقت التشغيل.
 */
export type { ButtonVariant, ButtonSize } from './button-variants';
export type { IconSize };
