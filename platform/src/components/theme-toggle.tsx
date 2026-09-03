'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { value: 'light', label: 'فاتح', Icon: Sun },
  { value: 'dark', label: 'داكن', Icon: Moon },
  { value: 'system', label: 'النظام', Icon: Monitor },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className={cn('h-9 w-[7.5rem] rounded-md skeleton', className)} aria-hidden />;
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-2 p-0.5',
        className,
      )}
      role="group"
      aria-label="نمط العرض"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          title={label}
          aria-pressed={theme === value}
          className={cn(
            'inline-flex h-8 w-9 items-center justify-center rounded transition-colors',
            theme === value
              ? 'bg-surface text-primary shadow-xs'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
