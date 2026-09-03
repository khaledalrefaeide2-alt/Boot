import Link from 'next/link';
import { cn, formatCompactNumber, formatNumber } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

/**
 * بطاقة إحصاء — رقم عنوان واحد مع سياقه.
 * ليست رسماً بيانياً: قيمة واحدة تُقرأ فوراً، ولا تحمل تفاعلاً زائداً.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  compact = false,
  tone = 'default',
  className,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon?: LucideIcon;
  href?: string;
  compact?: boolean;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  const tones = {
    default: 'text-foreground',
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
  } as const;

  const display =
    typeof value === 'number' ? (compact ? formatCompactNumber(value) : formatNumber(value)) : value;

  const content = (
    <div
      className={cn(
        'flex h-full items-start gap-3 rounded-lg border border-border bg-surface p-4 shadow-xs transition-colors print-avoid-break',
        href && 'hover:border-border-strong hover:bg-surface-2/40',
        className,
      )}
    >
      {Icon && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-soft">
          <Icon className="h-4.5 w-4.5 text-primary-soft-foreground" aria-hidden />
        </div>
      )}
      <div className="min-w-0 space-y-0.5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('num text-xl font-bold tabular-nums sm:text-2xl', tones[tone])}>{display}</p>
        {hint && <p className="truncate text-xs text-subtle-foreground">{hint}</p>}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  ) : (
    content
  );
}

/** بطاقة نصية لعرض عنصر بارز مثل أكثر منشور تفاعلاً */
export function HighlightCard({
  label,
  title,
  meta,
  value,
  valueLabel,
  href,
  className,
}: {
  label: string;
  title: string;
  meta?: string;
  value?: number;
  valueLabel?: string;
  href?: string;
  className?: string;
}) {
  const content = (
    <div
      className={cn(
        'flex h-full flex-col justify-between gap-2 rounded-lg border border-border bg-surface p-4 shadow-xs print-avoid-break',
        href && 'transition-colors hover:border-border-strong hover:bg-surface-2/40',
        className,
      )}
    >
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="line-clamp-2 text-sm font-medium leading-relaxed text-foreground">{title}</p>
      </div>
      <div className="flex items-end justify-between gap-2">
        {meta && <p className="truncate text-xs text-subtle-foreground">{meta}</p>}
        {value !== undefined && (
          <p className="shrink-0 text-end">
            <span className="num text-lg font-bold text-primary">{formatCompactNumber(value)}</span>
            {valueLabel && <span className="ms-1 text-xs text-muted-foreground">{valueLabel}</span>}
          </p>
        )}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  ) : (
    content
  );
}
