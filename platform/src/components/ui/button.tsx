'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/*
 * نظام الأزرار.
 *
 * الأساس واحد لكل زرّ: inline-flex، توسيط، وزن 600، حدّ 1px شفاف يحجز
 * مكانه فلا يقفز النصّ حين يظهر حدُّ نوعٍ آخر، زاوية 8px، ارتفاع سطر 1
 * (لأن ارتفاع الزرّ مضبوطٌ بالارتفاع لا بالحشوة الرأسية)، وبلا التفاف.
 *
 * الأنواع الستة مرتّبة بالأولوية لا بالذوق: أساسيٌّ واحد في السياق، ثم
 * ثانوي، ثم شبح. والمتدرّج (tonal) للإجراء المتكرّر في أشرطة الأدوات —
 * يُرى بلا أن يزاحم الأساسي.
 */

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center whitespace-nowrap',
    'rounded-lg border border-transparent font-semibold leading-none',
    'transition-[background-color,color,box-shadow,border-color] duration-150',
    'active:scale-[.98]',
    /*
     * حلقة التركيز حلقتان: بيضاء تفصل الزرّ عمّا تحته، ثم زيتونية تُرى.
     * وحلقةٌ واحدة على زرّ ممتلئ داكن تلتصق بحافّته فلا تكاد تُميَّز.
     */
    'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--olive-500)]',
    'disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100',
  ].join(' '),
  {
    variants: {
      variant: {
        primary: [
          'bg-olive-700 text-white shadow-elev-1',
          'hover:bg-olive-800 active:bg-olive-900',
          'disabled:bg-disabled-bg disabled:text-disabled-text',
        ].join(' '),
        secondary: [
          'bg-surface text-olive-800 border-olive-400 shadow-elev-1',
          'hover:bg-olive-50 hover:border-olive-500 active:bg-olive-100',
          'disabled:bg-disabled-bg disabled:text-disabled-text disabled:border-transparent',
        ].join(' '),
        tonal: [
          'bg-olive-100 text-olive-900',
          'hover:bg-olive-200 active:bg-olive-300',
          'disabled:bg-disabled-bg disabled:text-disabled-text',
        ].join(' '),
        ghost: [
          'bg-transparent text-olive-700',
          'hover:bg-olive-50 active:bg-olive-100',
          // الشبح والرابط يفقدان النصّ وحده — خلفيةٌ رمادية عليهما تخترع سطحاً لم يكن
          'disabled:bg-transparent disabled:text-disabled-text',
        ].join(' '),
        danger: [
          'bg-danger text-danger-foreground shadow-elev-1',
          'hover:bg-danger-hover active:bg-danger-active',
          'disabled:bg-disabled-bg disabled:text-disabled-text',
        ].join(' '),
        link: [
          'bg-transparent text-olive-700 underline underline-offset-4',
          'hover:text-olive-800 active:text-olive-900',
          'disabled:bg-transparent disabled:text-disabled-text disabled:no-underline',
        ].join(' '),
      },
      size: {
        sm: 'h-8 min-w-16 gap-1.5 px-3 text-[13px] [--btn-icon:16px]',
        md: 'h-10 min-w-22 gap-2 px-4 text-sm [--btn-icon:18px]',
        lg: 'h-12 min-w-30 gap-2 px-5 text-base [--btn-icon:20px]',
        'icon-sm': 'h-8 w-8 min-w-0 p-0 [--btn-icon:16px]',
        icon: 'h-10 w-10 min-w-0 p-0 [--btn-icon:18px]',
        'icon-lg': 'h-12 w-12 min-w-0 p-0 [--btn-icon:20px]',
      },
      fullWidth: { true: 'w-full', false: '' },
    },
    /*
     * الرابط بلا حشوة ولا عرض أدنى ولا ارتفاع: هو نصٌّ في جملة لا صندوق،
     * وإعطاؤه صندوقاً يجعله يفتح فجوةً في السطر الذي يقع فيه.
     */
    compoundVariants: [
      { variant: 'link', size: 'sm', class: 'h-auto min-w-0 px-0' },
      { variant: 'link', size: 'md', class: 'h-auto min-w-0 px-0' },
      { variant: 'link', size: 'lg', class: 'h-auto min-w-0 px-0' },
    ],
    defaultVariants: { variant: 'primary', size: 'md', fullWidth: false },
  },
);

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

export { buttonVariants };
export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;
export type { IconSize };
