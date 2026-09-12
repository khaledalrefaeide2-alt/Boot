'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/*
 * الأزرار.
 *
 * تغيّران عن السابق:
 *
 * ١) الانتقال يشمل box-shadow و transform لا الألوان وحدها، فيحمل الزرّ
 *    الأساسي هالته عند التحويم بدل أن تقفز دفعةً واحدة.
 *
 * ٢) active:scale-[.98] — ارتداد ضغط بمقدار 2%. أقلّ منه لا يُحسّ، وأكثر
 *    منه يُحرّك النص داخل الزر فيبدو مطاطياً لا مضغوطاً. وهو التغذية
 *    الراجعة الوحيدة المتاحة للمس، حيث لا تحويم أصلاً.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-[background-color,color,box-shadow,transform,border-color] duration-200 active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring whitespace-nowrap',
  {
    variants: {
      variant: {
        /*
          الهالة تُكتب بقيمة صريحة لا بصنف `hover:glow`: الأصناف المعرَّفة
          داخل @layer utilities في Tailwind v4 أصناف ساكنة لا تولّد صيغاً
          للحالات، فـ hover:glow لا يُنتج قاعدةً أصلاً ويسقط بصمت.
        */
        primary:
          'bg-primary text-primary-foreground hover:bg-primary-hover shadow-elev-1 hover:shadow-[var(--glow-primary,var(--elev-2))]',
        secondary:
          'bg-surface text-foreground border border-border hover:border-border-strong hover:bg-surface-2 shadow-elev-1',
        soft: 'bg-primary-soft text-primary-soft-foreground hover:brightness-110',
        ghost: 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
        danger: 'bg-danger text-white hover:brightness-110 shadow-elev-1',
        'danger-soft': 'bg-danger-soft text-danger hover:brightness-110',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 px-4 text-sm',
        lg: 'h-11 px-6 text-base',
        icon: 'h-9 w-9',
        'icon-sm': 'h-8 w-8',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export { buttonVariants };
