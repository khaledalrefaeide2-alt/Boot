'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

/*
 * مبدّل السمة — اختيارُ حالةٍ واحدة من ثلاث، لا ثلاثة أزرار.
 *
 * الزرّ يفعل شيئاً، وهذه تختار حالة. وبـ`role="radiogroup"` يسمع مستخدم
 * قارئ الشاشة «واحد من ثلاثة» بدل ثلاثة أزرار لا يعرف أنّها تستبعد بعضها.
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

  /*
   * قبل التركيب يُحجز المكان بالمقاس نفسه، ولا يُرسم اختيار.
   * الخادم لا يعرف السمة المحفوظة، فرسمُ اختيارٍ هنا يكذب لحظةً ثم يقفز.
   */
  if (!mounted) {
    return <div className={cn('h-control w-[8.25rem]', className)} aria-hidden />;
  }

  const current = (OPTIONS.find((option) => option.value === theme)?.value ?? 'system') as ThemeValue;

  /*
   * ثلاث أيقونات متجاورة بلا حاوية — كما في المرجع.
   *
   * والدلالة كما كانت: مجموعةُ اختيارٍ واحد (`radiogroup`) لا ثلاثة
   * أزرار، فيسمع قارئ الشاشة «واحد من ثلاثة». والمختار يحمل لون الهوية
   * على رقاقةٍ خفيفة، فيُعرف بلا قراءة.
   */
  return (
    <div role="radiogroup" aria-label="نمط العرض" className={cn('inline-flex items-center gap-0.5', className)}>
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = value === current;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              'flex size-control items-center justify-center rounded-control transition-colors duration-150',
              'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--ring)]',
              active
                ? 'bg-brand-50 text-primary-text'
                : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
