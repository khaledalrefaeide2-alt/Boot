'use client';

import { cn, formatCompactNumber, formatNumber } from '@/lib/utils';
import { ChartNoAxesColumn, type LucideIcon } from 'lucide-react';

/**
 * لبنات مشتركة للرسوم البيانية.
 * الألوان تُمرَّر كمتغيرات CSS فتتبدّل مع الوضع الفاتح والداكن تلقائياً
 * دون إعادة رسم أو منطق إضافي.
 */

/** ترتيب ثابت لألوان السلاسل — لا يُدوَّر ولا يتغير بتغيّر عدد السلاسل */
export const SERIES_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
] as const;

/** ألوان المشاعر — ألوان حالة محجوزة، تُرافق دائماً بتسمية عربية */
export const SENTIMENT_COLORS: Record<string, string> = {
  POSITIVE: 'var(--chart-positive)',
  NEUTRAL: 'var(--chart-neutral)',
  NEGATIVE: 'var(--chart-negative)',
  MIXED: 'var(--chart-mixed)',
  UNKNOWN: 'var(--chart-neutral)',
};

export const CHART_GRID = 'var(--chart-grid)';
export const CHART_AXIS = 'var(--chart-axis)';

/*
 * أنماط الخطوط، بترتيب السلاسل نفسه.
 *
 * ستّ سلاسل لا يمكن جعلها متمايزة باللون وحده لمن لا يميّز الأحمر أو
 * الأخضر: مجال الألوان الذي يراه ينهار إلى محور واحد تقريباً. اللوحة هنا
 * مُشتقّة لتبلغ أقصى تمايز ممكن (أدنى فرق 20.4 بعد المحاكاة)، لكن «ممكن»
 * ليست «مريحة». فيحمل كل خط نمطه أيضاً، ويصير اللون تأكيداً لا شرطاً.
 */
export const SERIES_DASH = [
  undefined,   // متصل
  '6 3',       // متقطّع
  '2 3',       // منقّط
  '10 4',      // شرطات طويلة
  '6 3 2 3',   // شرطة ونقطة
  '1 4',       // نقاط متباعدة
] as const;

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length] as string;
}

export function seriesDash(index: number): string | undefined {
  return SERIES_DASH[index % SERIES_DASH.length];
}

/**
 * إطار موحّد لكلّ رسم: عنوان، وصف، حالة فراغ، ومنطقة الرسم.
 *
 * ★ بطاقةٌ بيضاء بلا خطٍّ تحت العنوان — كما في المرجع.
 *
 *   الخطُّ يقسم البطاقة لوحين، والعنوانُ والرسم شيءٌ واحد. فيُفصلان
 *   بالمسافة وحدها، ويحمل العنوانُ أيقونته في البداية فيُعرف نوعُ الرسم
 *   قبل قراءة اسمه.
 */
export function ChartFrame({
  title,
  description,
  action,
  icon: Icon,
  isEmpty,
  emptyMessage = 'لا توجد بيانات في هذه الفترة',
  height = 280,
  children,
  className,
  footer,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** أيقونة بجانب العنوان */
  icon?: LucideIcon;
  isEmpty?: boolean;
  emptyMessage?: string;
  height?: number;
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
}) {
  return (
    <figure
      className={cn(
        /*
         * `h-full` وعمودٌ مرن: بطاقتان في صفٍّ واحد تتساويان ارتفاعاً،
         * والأقصرُ محتوىً تتمدّد منطقةُ رسمها لا يبقى تحتها فراغ.
         */
        'flex h-full min-w-0 flex-col rounded-card border border-border bg-surface shadow-elev-1 print-avoid-break',
        className,
      )}
    >
      <figcaption className="flex flex-wrap items-start justify-between gap-3 px-5 pb-2 pt-5">
        <div className="flex min-w-0 items-start gap-2.5">
          {Icon && <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary-text" aria-hidden />}
          <div className="min-w-0 space-y-0.5">
            <h3 className="text-base font-bold text-heading">{title}</h3>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action}
      </figcaption>

      <div className="flex flex-1 flex-col justify-center px-3 pb-4 pt-2 sm:px-4">
        {isEmpty ? (
          /*
           * الفراغ يُقال ولا يُرسم محاوراً فارغة.
           *
           * محورٌ بلا خطٍّ يُقرأ «صفر» — وهو قولٌ عن البيانات لم يُقل.
           * والرسالة تقول ما حدث فعلاً: لا بيانات في هذه الفترة.
           */
          <div
            className="flex flex-col items-center justify-center gap-3 text-center"
            style={{ height }}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2">
              <ChartNoAxesColumn className="h-5 w-5 text-subtle-foreground" aria-hidden />
            </span>
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </div>
        ) : (
          <div style={{ height }}>{children}</div>
        )}
      </div>

      {footer && <div className="border-t border-border px-5 py-3">{footer}</div>}
    </figure>
  );
}

/** وسيلة إيضاح — حاضرة دائماً عند وجود سلسلتين فأكثر */
export function ChartLegend({
  items,
  className,
}: {
  items: { label: string; color: string; value?: number; dash?: string }[];
  className?: string;
}) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {/*
            الدليل يعرض الخط بنمطه لا مربّعاً ملوّناً، وإلا وصف شيئاً غير
            الذي في الرسم: من يميّز السلاسل بالنمط لن يجد في الدليل ما يربط
            «متقطّع» باسمه.
          */}
          {item.dash !== undefined ? (
            <svg className="h-2.5 w-6 shrink-0" viewBox="0 0 24 10" aria-hidden>
              <line
                x1="0"
                y1="5"
                x2="24"
                y2="5"
                stroke={item.color}
                strokeWidth="2.5"
                strokeDasharray={item.dash || undefined}
              />
            </svg>
          ) : (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
          )}
          <span>{item.label}</span>
          {item.value !== undefined && (
            <span className="num font-medium text-foreground">{formatNumber(item.value)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** تلميح موحّد يظهر عند المرور بالمؤشر */
export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string; dataKey?: string }[];
  label?: string | number;
  labelFormatter?: (value: string | number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="pointer-events-none rounded-md border border-border bg-surface px-3 py-2 shadow-elev-3">
      {label !== undefined && (
        <p className="mb-1.5 border-b border-border pb-1.5 text-xs font-medium text-foreground">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      <ul className="space-y-1">
        {payload.map((entry, index) => (
          <li key={`${entry.dataKey}-${index}`} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-sm"
              style={{ backgroundColor: entry.color }}
              aria-hidden
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="num me-auto font-semibold text-foreground">
              {typeof entry.value === 'number' ? formatNumber(entry.value) : entry.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** تنسيق قيم المحاور بشكل مختصر */
export function axisNumberFormatter(value: number): string {
  return formatCompactNumber(value);
}

/** تنسيق تواريخ المحور الزمني */
export function axisDateFormatter(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ar', { month: 'short', day: 'numeric' }).format(date);
}

/** تاريخ كامل في التلميح */
export function tooltipDateFormatter(value: string | number): string {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('ar', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}
