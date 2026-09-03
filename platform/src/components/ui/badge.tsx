import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-2 text-muted-foreground border border-border',
        primary: 'bg-primary-soft text-primary-soft-foreground',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning',
        danger: 'bg-danger-soft text-danger',
        info: 'bg-info-soft text-info',
      },
      size: {
        sm: 'px-1.5 py-0 text-[0.6875rem]',
        md: 'px-2 py-0.5 text-xs',
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
