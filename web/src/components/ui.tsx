'use client';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { ReactNode } from 'react';
import { compact, pct } from '@/lib/format';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-[var(--muted)] mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('card p-5', className)}>{children}</div>;
}

export function CardTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide">{children}</h3>
      {right}
    </div>
  );
}

export function Kpi({
  label,
  value,
  delta,
  icon,
  accent = '#2563EB',
  index = 0,
}: {
  label: string;
  value: string | number;
  delta?: number;
  icon?: ReactNode;
  accent?: string;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35 }}
      className="card p-5 relative overflow-hidden"
    >
      <div className="absolute right-0 top-0 h-24 w-24 rounded-full blur-2xl opacity-10" style={{ background: accent }} />
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--muted)]">{label}</span>
        {icon && (
          <span className="grid place-items-center h-8 w-8 rounded-lg" style={{ background: `${accent}1a`, color: accent }}>
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">
        {typeof value === 'number' ? compact(value) : value}
      </div>
      {delta !== undefined && (
        <div className={clsx('mt-1 text-xs font-medium', delta >= 0 ? 'text-emerald-500' : 'text-red-500')}>
          {pct(delta)} vs prev.
        </div>
      )}
    </motion.div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={clsx('relative overflow-hidden rounded-xl bg-black/5 dark:bg-white/5', className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center py-16">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-xs text-[var(--muted)] mt-1">{hint}</p>}
    </div>
  );
}

export function Badge({ children, color = '#2563EB' }: { children: ReactNode; color?: string }) {
  return (
    <span className="chip" style={{ color, borderColor: `${color}55`, background: `${color}12` }}>
      {children}
    </span>
  );
}
