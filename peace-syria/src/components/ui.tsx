import type { ReactNode } from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { cx } from '../lib/utils';

/* ------------------------------------------------------------------ */
/* Spinner + loading states                                            */
/* ------------------------------------------------------------------ */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('h-4 w-4 animate-spin', className)} aria-hidden />;
}

export function LoadingBlock({ label = 'جارٍ التحميل…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-200 bg-white/60 py-16 text-slate-500">
      <Spinner className="h-6 w-6 text-teal-600" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="card space-y-4 p-6">
          <div className="skeleton h-5 w-24" />
          <div className="skeleton h-6 w-3/4" />
          <div className="space-y-2">
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-11/12" />
            <div className="skeleton h-3 w-8/12" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Empty + error states                                                */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-300 bg-white/70 px-6 py-16 text-center">
      {icon ? (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">{icon}</div>
      ) : null}
      <h3 className="text-base font-bold text-slate-800">{title}</h3>
      {description ? <p className="max-w-sm text-sm leading-7 text-slate-500">{description}</p> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-red-200 bg-red-50 px-6 py-12 text-center">
      <AlertCircle className="h-8 w-8 text-red-500" aria-hidden />
      <p className="max-w-md text-sm font-medium leading-7 text-red-800">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="btn-secondary mt-1">
          <RefreshCw className="h-4 w-4" aria-hidden />
          إعادة المحاولة
        </button>
      ) : null}
    </div>
  );
}

export function InlineAlert({
  variant = 'info',
  children,
}: {
  variant?: 'info' | 'success' | 'warning' | 'error';
  children: ReactNode;
}) {
  const tone = {
    info: 'border-slate-200 bg-slate-50 text-slate-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-red-200 bg-red-50 text-red-800',
  }[variant];

  return (
    <div className={cx('flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm leading-7', tone)}>{children}</div>
  );
}

/* ------------------------------------------------------------------ */
/* Badges, headers, toggles                                            */
/* ------------------------------------------------------------------ */

export function Badge({
  children,
  tone = 'slate',
  className,
}: {
  children: ReactNode;
  tone?: 'slate' | 'teal' | 'emerald' | 'amber' | 'red';
  className?: string;
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    teal: 'bg-teal-100 text-teal-800',
    emerald: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-900',
    red: 'bg-red-100 text-red-800',
  } as const;

  return <span className={cx('chip', tones[tone], className)}>{children}</span>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1.5">
        {eyebrow ? <p className="text-xs font-bold uppercase tracking-wide text-teal-600">{eyebrow}</p> : null}
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        {description ? <p className="max-w-2xl text-sm leading-7 text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  tone = 'teal',
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  tone?: 'teal' | 'red';
}) {
  const activeColor = tone === 'red' ? 'bg-red-600' : 'bg-teal-600';

  return (
    <label className="flex cursor-pointer items-center gap-4">
      <span className="flex-1">
        <span className="block text-sm font-bold text-slate-800">{label}</span>
        {description ? <span className="mt-0.5 block text-xs leading-6 text-slate-500">{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-7 w-14 shrink-0 rounded-full transition-colors duration-200',
          checked ? activeColor : 'bg-slate-300',
        )}
      >
        {/* RTL: the knob rests at the start (right) when off and slides to the end (left) when on. */}
        <span
          className={cx(
            'absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all duration-200',
            checked ? 'right-8' : 'right-1',
          )}
        />
      </button>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Score visualisations                                                */
/* ------------------------------------------------------------------ */

export function CircularProgress({
  value,
  size = 132,
  stroke = 12,
  ringClass = 'stroke-teal-500',
  label,
  caption,
}: {
  value: number;
  size?: number;
  stroke?: number;
  ringClass?: string;
  label?: string;
  caption?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`${label ?? 'النتيجة'}: ${clamped}%`}>
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} className="fill-none stroke-slate-200" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cx('fill-none transition-[stroke-dashoffset] duration-700 ease-out', ringClass)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="nums text-3xl font-extrabold tracking-tight text-slate-900">{clamped}</span>
        {caption ? <span className="mt-0.5 text-[11px] font-semibold text-slate-500">{caption}</span> : null}
      </div>
    </div>
  );
}

export function ScoreBar({ value, tone = 'bg-teal-500' }: { value: number; tone?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className={cx('h-full rounded-full transition-[width] duration-700 ease-out', tone)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
