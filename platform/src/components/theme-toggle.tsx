'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Segmented } from '@/components/ui/button-group';
import { cn } from '@/lib/utils';

/*
 * مبدّل السمة مجموعةٌ مجزّأة لا ثلاثة أزرار.
 *
 * الفرق ليس شكلياً: الزرّ يفعل شيئاً، وهذه تختار حالةً واحدة من ثلاث.
 * وبـ`role="radiogroup"` يسمع مستخدم قارئ الشاشة «واحد من ثلاثة» بدل
 * ثلاثة أزرار منفصلة لا يعرف أنّها تستبعد بعضها.
 */

const OPTIONS = [
  { value: 'light', label: 'فاتح', Icon: Sun },
  { value: 'dark', label: 'داكن', Icon: Moon },
  { value: 'system', label: 'النظام', Icon: Monitor },
] as const;

type ThemeValue = (typeof OPTIONS)[number]['value'];

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className={cn('h-8 w-[7.5rem] rounded-lg skeleton', className)} aria-hidden />;
  }

  return (
    <Segmented<ThemeValue>
      className={className}
      size="sm"
      label="نمط العرض"
      value={(OPTIONS.find((option) => option.value === theme)?.value ?? 'system') as ThemeValue}
      onChange={setTheme}
      options={OPTIONS.map(({ value, label, Icon }) => ({
        value,
        label: (
          <>
            <Icon className="h-4 w-4" aria-hidden />
            <span className="sr-only">{label}</span>
          </>
        ),
      }))}
    />
  );
}
