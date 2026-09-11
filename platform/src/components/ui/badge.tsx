import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/*
 * الشارات حبّات (rounded-full) لا مستطيلات مدوّرة، ولكلٍّ حدّ بلون نصّها
 * بشفافية منخفضة.
 *
 * الحدّ ليس زخرفاً: أرضيات النغمات الداكنة قريبة جداً من أرضية البطاقة
 * (فرق أقلّ من 1.2:1)، فالشارة بلا حدّ تذوب في سطحها ويبقى النص طافياً بلا
 * حاوية. والحدّ بلون النص نفسه يربط الاثنين بصرياً بدل إدخال لون ثالث.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-2 text-muted-foreground border-border',
        primary: 'bg-primary-soft text-primary-soft-foreground border-primary/25',
        success: 'bg-success-soft text-success border-success/25',
        warning: 'bg-warning-soft text-warning border-warning/25',
        danger: 'bg-danger-soft text-danger border-danger/25',
        info: 'bg-info-soft text-info border-info/25',
      },
      size: {
        sm: 'px-2 py-0 text-2xs',
        md: 'px-2.5 py-0.5 text-xs',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export function Badge({
  className,
  tone,
  size,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}

/** نقطة حالة ملوّنة قبل النص */
export function StatusDot({ tone = 'neutral' }: { tone?: BadgeTone }) {
  const colors: Record<BadgeTone, string> = {
    neutral: 'bg-subtle-foreground',
    primary: 'bg-primary',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
  };
  return <span className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', colors[tone])} aria-hidden />;
}
