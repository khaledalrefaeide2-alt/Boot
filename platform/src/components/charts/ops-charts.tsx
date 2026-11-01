'use client';

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_AXIS, CHART_GRID, ChartLegend, ChartTooltip, axisNumberFormatter } from './chart-kit';
import { cn, formatCompactNumber, formatNumber, formatPercent } from '@/lib/utils';
import { localizeHeat } from '@/lib/domain/ops-aggregate';

/*
 * لبنات غرفة العمليات.
 *
 * مكتوبةٌ على مواصفةٍ واحدة لا على ذوق كلّ رسم:
 *   • الأعمدة ≤ 24 بكسل، وطرف البيانات مدوّرٌ 4 بكسل والقاعدة مربّعة.
 *   • الشبكة خطٌّ شعريّ متّصل لا متقطّع — المتقطّع يُقرأ «توقّعاً» أو «عتبة».
 *   • بين الكتل المتلاصقة فجوةٌ بلون السطح، لا حدٌّ مرسوم حولها.
 *   • النصّ بألوان النصّ دائماً، واللون للعلامة وحدها.
 *   • لكلّ رسمٍ جدول بياناته — التلميح يُحسّن ولا يحجب.
 */

export type TimeBucket = 'hour' | 'day';

const dayFormat = new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayLong = new Intl.DateTimeFormat('ar', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const hourFormat = new Intl.DateTimeFormat('ar', { hour: 'numeric' });
const hourLong = new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit', weekday: 'long' });

/**
 * تسمية الدلو الزمني.
 *
 * الأيام بالتوقيت العالمي — مفاتيحها أيامٌ عالمية، وتحويلها إلى منطقة
 * القارئ يُزيح «الأحد» إلى «السبت» عند من توقيته خلف غرينتش. والساعات
 * بتوقيت القارئ: «الثالثة» تعني ساعته هو لا ساعة الخادم.
 */
export function bucketLabel(iso: string, bucket: TimeBucket, long = false): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  if (bucket === 'hour') return (long ? hourLong : hourFormat).format(date);
  return (long ? dayLong : dayFormat).format(date);
}

/** جدول البيانات تحت الرسم — مطويٌّ، وكاملٌ لمن فتحه أو لقارئ الشاشة */
export function DataTable({
  columns,
  rows,
  caption,
}: {
  columns: string[];
  rows: (string | number)[][];
  caption: string;
}) {
  if (rows.length === 0) return null;
  return (
    <details className="group text-xs no-print">
      <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
        عرض البيانات كجدول
      </summary>
      <div className="mt-2 max-h-64 overflow-auto">
        <table className="w-full border-collapse text-start">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" className="border-b border-border px-2 py-1.5 text-start font-semibold text-foreground">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-border/60 last:border-0">
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={cn('px-2 py-1 text-muted-foreground', typeof cell === 'number' && 'num tabular-nums text-foreground')}
                  >
                    {typeof cell === 'number' ? formatNumber(cell) : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export interface RankedRow {
  key: string;
  label: string;
  value: number;
  /** علامة قبل الاسم — شعار منصة أو نقطة نوع */
  swatch?: React.ReactNode;
  /** لون الشريط — حين يحمل الشريط هويةً (نوع الكيان) لا مقداراً وحده */
  color?: string;
}

/**
 * أشرطة مرتّبة أفقية — للمقارنة بين أجزاء.
 *
 * ★ لونٌ واحد لكلّ الأشرطة ما لم يحمل اللون هوية.
 *
 *   تلوين الشريط الأطول بالأغمق يُنفق القناة الوحيدة الحرّة على ما يقوله
 *   الطول أصلاً. والأسماء ليست مرتّبة بطبيعتها (منصات، حسابات، وسوم)،
 *   فتأخذ كلّها اللون الأول، والعنوان يقول ما هي.
 *
 * والقيمة على طرف الشريط دائماً — فلا تلميح يحجبها، ولا جدول يلزم لقراءتها.
 */
export function RankedBars({
  rows,
  color = 'var(--chart-1)',
  format = formatNumber,
  unit,
}: {
  rows: RankedRow[];
  color?: string;
  format?: (value: number) => string;
  /** اسم الوحدة لقارئ الشاشة: «منشوراً» */
  unit?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ol className="space-y-2.5">
      {rows.map((row) => {
        const share = (row.value / max) * 100;
        return (
          <li
            key={row.key}
            className="grid grid-cols-[minmax(0,42%)_minmax(0,1fr)] items-center gap-3"
            aria-label={`${row.label}: ${formatNumber(row.value)}${unit ? ` ${unit}` : ''}`}
          >
            <span className="flex min-w-0 items-center gap-1.5 text-sm text-foreground" title={row.label}>
              {row.swatch}
              <span className="truncate">{row.label}</span>
            </span>
            <span className="flex min-w-0 items-center gap-2" aria-hidden>
              <span
                className="h-3.5 shrink-0 rounded-e-[4px] transition-[width] duration-500 ease-out"
                style={{
                  width: row.value > 0 ? `max(3px, calc(${share}% - 3.5rem))` : 0,
                  backgroundColor: row.color ?? color,
                }}
              />
              <span className="num shrink-0 text-xs font-semibold text-foreground">{format(row.value)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export interface TimeSeriesDef {
  key: string;
  label: string;
  color: string;
}

/**
 * أعمدة زمنية — مفردةً أو مكدّسة.
 *
 * والمكدّس يجمع ما هو أجزاءٌ من كلٍّ واحد (إعجاب وتعليق ومشاركة = تفاعل)،
 * ولا يجمع مقياسين من مقامين: المشاهدات بمئات الآلاف بجوار التعليقات
 * بالعشرات تُسطّح الثانية إلى خطّ — فلها رسمها.
 */
export function TimeBars({
  data,
  series,
  bucket,
  height = 240,
}: {
  data: Record<string, string | number>[];
  series: TimeSeriesDef[];
  bucket: TimeBucket;
  height?: number;
}) {
  const stacked = series.length > 1;
  return (
    <div className="flex h-full flex-col gap-2">
      {stacked && (
        <ChartLegend items={series.map((item) => ({ label: item.label, color: item.color }))} />
      )}
      <div style={{ height }} className="min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barCategoryGap="22%">
            <CartesianGrid stroke={CHART_GRID} vertical={false} />
            {/* الزمن يجري من اليمين إلى اليسار مع اتجاه القراءة */}
            <XAxis
              dataKey="date"
              reversed
              tickFormatter={(value: string) => bucketLabel(value, bucket)}
              tick={{ fill: CHART_AXIS, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: CHART_GRID }}
              minTickGap={18}
            />
            <YAxis
              orientation="right"
              tickFormatter={axisNumberFormatter}
              tick={{ fill: CHART_AXIS, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={62}
              allowDecimals={false}
            />
            <Tooltip
              content={<ChartTooltip labelFormatter={(value) => bucketLabel(String(value), bucket, true)} />}
              cursor={{ fill: 'var(--surface-2)' }}
            />
            {series.map((item, index) => (
              <Bar
                key={item.key}
                dataKey={item.key}
                name={item.label}
                fill={item.color}
                stackId={stacked ? 'stack' : undefined}
                maxBarSize={24}
                // الطرف المدوّر للأعلى في الكومة وحده؛ والقاعدة مربّعة
                radius={index === series.length - 1 ? [4, 4, 0, 0] : 0}
                stroke={stacked ? 'var(--surface)' : undefined}
                strokeWidth={stacked ? 2 : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** مساحةٌ زمنية لسلسلةٍ واحدة — خطّ 2 بكسل وغسلةٌ خفيفة تحته */
export function TimeArea({
  data,
  dataKey,
  label,
  bucket,
  color = 'var(--chart-1)',
  height = 240,
}: {
  data: Record<string, string | number>[];
  dataKey: string;
  label: string;
  bucket: TimeBucket;
  color?: string;
  height?: number;
}) {
  const showDots = data.length <= 35;
  return (
    <div style={{ height }} className="min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={CHART_GRID} vertical={false} />
          <XAxis
            dataKey="date"
            reversed
            tickFormatter={(value: string) => bucketLabel(value, bucket)}
            tick={{ fill: CHART_AXIS, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: CHART_GRID }}
            minTickGap={18}
          />
          <YAxis
            orientation="right"
            tickFormatter={axisNumberFormatter}
            tick={{ fill: CHART_AXIS, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={62}
          />
          <Tooltip
            content={<ChartTooltip labelFormatter={(value) => bucketLabel(String(value), bucket, true)} />}
            cursor={{ stroke: CHART_AXIS, strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            name={label}
            stroke={color}
            strokeWidth={2}
            fill={color}
            fillOpacity={0.1}
            dot={showDots ? { r: 4, strokeWidth: 2, stroke: 'var(--surface)', fill: color } : false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface)', fill: color }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const HEAT_STEPS = ['var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)', 'var(--heat-5)'];


/**
 * خريطة حرارية: أيام الأسبوع × ساعات اليوم.
 *
 * درجاتٌ خمس من لونٍ واحد، والخانة الفارغة بلون السطح لا بأفتح الدرجات.
 * والدرجة بالحصّة من الأعلى لا بالعدد المطلق، فتبقى الخريطة مقروءة في
 * يومٍ هادئ وفي أسبوعٍ صاخب معاً — والعدد الحقيقي في التلميح والجدول.
 */
export function WeekHeatmap({ heat }: { heat: number[][] }) {
  const local = useMemo(() => localizeHeat(heat), [heat]);
  const max = Math.max(1, ...local.flat());
  const step = (count: number) =>
    count === 0 ? 'var(--surface-2)' : HEAT_STEPS[Math.min(4, Math.floor((count / max) * 5 - 1e-9))];

  return (
    <div className="space-y-3">
      <div
        role="table"
        aria-label="توزيع النشر على أيام الأسبوع وساعات اليوم"
        className="grid items-center gap-[2px]"
        style={{ gridTemplateColumns: 'auto repeat(24, minmax(0, 1fr))' }}
      >
        {local.map((hours, day) => (
          <div key={day} role="row" className="contents">
            <span role="rowheader" className="pe-2 text-2xs text-muted-foreground whitespace-nowrap">
              {WEEKDAYS[day]}
            </span>
            {hours.map((count, hour) => (
              <span
                key={hour}
                role="cell"
                title={`${WEEKDAYS[day]}، الساعة ${hour}:00 — ${formatNumber(count)} منشوراً`}
                aria-label={`${WEEKDAYS[day]} الساعة ${hour}: ${formatNumber(count)}`}
                className="aspect-square min-h-2 rounded-[3px] transition-transform hover:scale-125 hover:ring-2 hover:ring-[var(--surface)]"
                style={{ backgroundColor: step(count) }}
              />
            ))}
          </div>
        ))}
        <span aria-hidden />
        {Array.from({ length: 24 }, (_, hour) => (
          <span key={hour} aria-hidden className="text-center text-2xs text-subtle-foreground">
            {hour % 3 === 0 ? hour : ''}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-end gap-1.5 text-2xs text-muted-foreground" aria-hidden>
        <span>أقل</span>
        <span className="h-2.5 w-4 rounded-[3px] bg-surface-2 ring-1 ring-border" />
        {HEAT_STEPS.map((color) => (
          <span key={color} className="h-2.5 w-4 rounded-[3px]" style={{ backgroundColor: color }} />
        ))}
        <span>أكثر</span>
      </div>
    </div>
  );
}

export interface SegmentPart {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * شريطٌ مقسّم طويل — كلٌّ واحد يُقرأ في لمحة.
 *
 * بدل الحلقة والفطيرة: العين تقارن الأطوال على خطٍّ واحد أدقّ من الزوايا.
 * والنسبة مكتوبةٌ داخل الكتلة إن اتّسعت لها، وإلا تُركت للتلميح والجدول
 * — لا تُقصّ نصفَ رقم. والدليل يسمّي الأجزاء بترتيبها ولا يكرّر الأرقام.
 */
export function SegmentedBar({ parts, unit = 'منشوراً' }: { parts: SegmentPart[]; unit?: string }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const visible = parts.filter((part) => part.value > 0);
  const name = visible
    .map((part) => `${part.label}: ${formatNumber(part.value)} (${formatPercent((part.value / total) * 100, 0)})`)
    .join('، ');

  return (
    <div className="space-y-3">
      <div role="img" aria-label={name} className="flex h-7 w-full gap-[2px]">
        {visible.map((part) => {
          const share = (part.value / total) * 100;
          return (
            <div
              key={part.key}
              title={`${part.label}: ${formatNumber(part.value)} ${unit} (${formatPercent(share, 1)})`}
              className="flex min-w-[3px] items-center overflow-visible rounded-[4px] px-2"
              style={{ flexGrow: part.value, flexBasis: 0, backgroundColor: part.color }}
            >
              {share >= 11 && (
                <span className="num whitespace-nowrap text-xs font-semibold" style={{ color: 'var(--viz-on-fill)' }}>
                  {formatPercent(share, 0)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-hidden>
        {parts.map((part) => (
          <li key={part.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: part.color }} />
            {part.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * أعمدة ترتيبية — درجاتٌ لها ترتيبٌ طبيعي (الخطورة ١→٥).
 *
 * لونٌ واحد يغمق مع الدرجة، فيُرى الترتيب في اللون قبل قراءة التسمية.
 * والقيمة على رأس العمود، والتسمية تحته.
 */
export function OrdinalColumns({
  items,
  height = 170,
}: {
  items: { key: string; short: string; label: string; value: number; color: string }[];
  height?: number;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="flex items-end justify-around gap-3" style={{ height }}>
      {items.map((item) => (
        <div
          key={item.key}
          className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
          aria-label={`${item.label}: ${formatNumber(item.value)}`}
          role="img"
        >
          <span className="num text-xs font-semibold text-foreground">{formatCompactNumber(item.value)}</span>
          <span
            className="w-full max-w-6 rounded-t-[4px] transition-[height] duration-500 ease-out"
            style={{
              height: item.value > 0 ? `max(3px, calc(${(item.value / max) * 100}% - 3.25rem))` : 0,
              backgroundColor: item.color,
            }}
          />
          <span className="num text-sm font-bold text-foreground">{item.short}</span>
          <span className="line-clamp-1 text-center text-2xs text-muted-foreground" title={item.label}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
