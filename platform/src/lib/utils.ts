import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const AR_LOCALE = 'ar';

/** تنسيق الأعداد بالأرقام العربية الغربية مع فواصل الآلاف */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat(AR_LOCALE, { useGrouping: true }).format(value);
}

/** اختصار الأعداد الكبيرة: 12.4 ألف / 3.1 مليون */
export function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (Math.abs(value) < 1000) return formatNumber(value);
  if (Math.abs(value) < 1_000_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')} ألف`;
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')} مليون`;
}

/** نسبة مئوية بمنزلة عشرية واحدة */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits).replace(/\.0$/, '')}٪`;
}

const dateFormatter = new Intl.DateTimeFormat(AR_LOCALE, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat(AR_LOCALE, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const shortDateFormatter = new Intl.DateTimeFormat(AR_LOCALE, {
  month: 'short',
  day: 'numeric',
});

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormatter.format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return dateTimeFormatter.format(date);
}

export function formatShortDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return shortDateFormatter.format(date);
}

/** فارق زمني نسبي بالعربية: قبل 5 دقائق */
export function formatRelativeTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat(AR_LOCALE, { numeric: 'auto' });

  if (abs < 60) return rtf.format(Math.round(diffSeconds), 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSeconds / 3600), 'hour');
  if (abs < 2592000) return rtf.format(Math.round(diffSeconds / 86400), 'day');
  if (abs < 31536000) return rtf.format(Math.round(diffSeconds / 2592000), 'month');
  return rtf.format(Math.round(diffSeconds / 31536000), 'year');
}

/** مدة بالميلي ثانية إلى صيغة عربية مقروءة */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms < 0) return '—';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${formatNumber(seconds)} ثانية`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes} د ${rest} ث` : `${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  return `${hours} س ${minutes % 60} د`;
}

/** اقتطاع النص مع الحفاظ على الكلمات */
export function truncate(text: string | null | undefined, maxLength = 160): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).replace(/\s+\S*$/, '')}…`;
}

/** بداية اليوم بتوقيت UTC — مفتاح جداول الإحصاءات اليومية */
export function startOfUtcDay(date: Date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** إضافة أيام إلى تاريخ */
export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
