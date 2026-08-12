import { useCallback, useEffect, useState } from 'react';

/** Tailwind-friendly class joiner. */
export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

const arabicDate = new Intl.DateTimeFormat('ar', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  numberingSystem: 'latn',
});

const arabicTime = new Intl.DateTimeFormat('ar', {
  hour: '2-digit',
  minute: '2-digit',
  numberingSystem: 'latn',
});

export const formatDate = (value: string | Date) => arabicDate.format(new Date(value));
export const formatTime = (value: string | Date) => arabicTime.format(new Date(value));

/** "منذ ٣ ساعات" style relative label. */
export function timeAgo(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.round(hours / 24);
  if (days < 30) return `قبل ${days} يوم`;
  return formatDate(value);
}

/** Copies text and reports success — falls back to a hidden textarea on old browsers. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** State backed by localStorage, resilient to private-mode failures. */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable — keep working in memory */
    }
  }, [key, value]);

  return [value, setValue] as const;
}

export function useBookmarks(key = 'salam:bookmarks') {
  const [ids, setIds] = useLocalStorage<string[]>(key, []);

  const toggle = useCallback(
    (id: string) => {
      let added = false;
      setIds((current) => {
        added = !current.includes(id);
        return added ? [...current, id] : current.filter((item) => item !== id);
      });
      return added;
    },
    [setIds],
  );

  return { ids, toggle, has: (id: string) => ids.includes(id) };
}

/** Debounced mirror of a fast-changing value (search inputs). */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export type FontSize = 'sm' | 'md' | 'lg';

export const fontSizeClass: Record<FontSize, string> = {
  sm: 'text-sm leading-7',
  md: 'text-base leading-8',
  lg: 'text-lg leading-9',
};

export const fontSizeLabel: Record<FontSize, string> = {
  sm: 'صغير',
  md: 'متوسط',
  lg: 'كبير',
};

/** Score → palette used by meters, badges and progress rings. */
export function scoreTone(score: number) {
  if (score >= 80) return { text: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'stroke-emerald-500', border: 'border-emerald-200', label: 'ممتازة' };
  if (score >= 60) return { text: 'text-teal-700', bg: 'bg-teal-50', ring: 'stroke-teal-500', border: 'border-teal-200', label: 'جيدة' };
  if (score >= 35) return { text: 'text-amber-700', bg: 'bg-amber-50', ring: 'stroke-amber-500', border: 'border-amber-200', label: 'تحتاج مراجعة' };
  return { text: 'text-red-700', bg: 'bg-red-50', ring: 'stroke-red-500', border: 'border-red-200', label: 'خطرة' };
}

/** Locks body scroll while a modal is open. */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}
