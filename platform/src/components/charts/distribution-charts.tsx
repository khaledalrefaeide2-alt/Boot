'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  ChartFrame,
  ChartLegend,
  ChartTooltip,
  SENTIMENT_COLORS,
  seriesColor,
} from './chart-kit';
import { formatNumber, formatPercent } from '@/lib/utils';

/**
 * أعمدة مقارنة أفقية بتنفيذ HTML بدل SVG.
 * السبب: الأسماء العربية الطويلة تُقطع في محاور SVG، بينما ينساب النص هنا
 * مع اتجاه الصفحة، وتظهر القيمة بجانب كل عمود مباشرة (تسمية مباشرة تفي
 * بشرط الوضوح للألوان منخفضة التباين على الأرضية الفاتحة).
 */
export function ComparisonBars({
  data,
  title,
  description,
  valueLabel = 'العدد',
  height,
  colorByIndex = false,
  onItemClick,
}: {
  data: { label: string; value: number; color?: string }[];
  title: string;
  description?: string;
  valueLabel?: string;
  height?: number;
  colorByIndex?: boolean;
  onItemClick?: (label: string) => void;
}) {
  const max = Math.max(1, ...data.map((item) => item.value));
  const computedHeight = height ?? Math.max(200, Math.min(data.length * 38 + 16, 420));

  return (
    <ChartFrame
      title={title}
      description={description}
      isEmpty={data.length === 0}
      height={computedHeight}
    >
      <ul className="h-full space-y-2 overflow-y-auto px-2 py-1">
        {data.map((item, index) => {
          const color = item.color ?? (colorByIndex ? seriesColor(index) : seriesColor(0));
          const width = (item.value / max) * 100;
          const Row = (
            <>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="truncate text-xs text-foreground" title={item.label}>
                  {item.label}
                </span>
                <span className="num shrink-0 text-xs font-semibold tabular-nums text-foreground">
                  {formatNumber(item.value)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-sm bg-surface-2">
                <div
                  className="h-full rounded-sm transition-[width] duration-300"
                  style={{ width: `${Math.max(width, 1.5)}%`, backgroundColor: color }}
                />
              </div>
            </>
          );

          return (
            <li key={item.label} title={`${item.label}: ${formatNumber(item.value)} ${valueLabel}`}>
              {onItemClick ? (
                <button
                  type="button"
                  onClick={() => onItemClick(item.label)}
                  className="w-full rounded px-1 py-0.5 text-start transition-colors hover:bg-surface-2/60"
                >
                  {Row}
                </button>
              ) : (
                <div className="px-1 py-0.5">{Row}</div>
              )}
            </li>
          );
        })}
      </ul>
    </ChartFrame>
  );
}

/** دائرة نسبية — للتوزيعات القليلة الفئات */
export function DonutChart({
  data,
  title,
  description,
  height = 260,
}: {
  data: { label: string; value: number; color?: string }[];
  title: string;
  description?: string;
  height?: number;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const withColors = data.map((item, index) => ({
    ...item,
    color: item.color ?? seriesColor(index),
  }));

  return (
    <ChartFrame
      title={title}
      description={description}
      isEmpty={total === 0}
      height={height}
      footer={
        <ChartLegend
          items={withColors.map((item) => ({
            label: `${item.label} — ${formatPercent(total > 0 ? (item.value / total) * 100 : 0)}`,
            color: item.color,
            value: item.value,
          }))}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={withColors}
            dataKey="value"
            nameKey="label"
            innerRadius="58%"
            outerRadius="86%"
            paddingAngle={2}
            stroke="var(--surface)"
            strokeWidth={2}
          >
            {withColors.map((entry) => (
              <Cell key={entry.label} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** توزيع المشاعر — ألوان حالة محجوزة مع تسميات عربية دائماً */
export function SentimentChart({
  data,
  labels,
  title = 'المشاعر العامة',
  description,
}: {
  data: { sentiment: string; posts: number }[];
  labels: Record<string, string>;
  title?: string;
  description?: string;
}) {
  return (
    <DonutChart
      title={title}
      description={description}
      data={data.map((item) => ({
        label: labels[item.sentiment] ?? item.sentiment,
        value: item.posts,
        color: SENTIMENT_COLORS[item.sentiment] ?? SENTIMENT_COLORS.UNKNOWN,
      }))}
    />
  );
}

/** خريطة حرارية للكلمات — الحجم والعتامة يعكسان التكرار */
export function WordCloud({
  words,
  title = 'أكثر الكلمات تكراراً',
  description,
  onWordClick,
}: {
  words: { word: string; count: number }[];
  title?: string;
  description?: string;
  onWordClick?: (word: string) => void;
}) {
  const max = words[0]?.count ?? 1;

  return (
    <ChartFrame title={title} description={description} isEmpty={words.length === 0} height={280}>
      <div className="flex h-full flex-wrap content-start items-center gap-x-2.5 gap-y-1 overflow-y-auto px-2 py-1">
        {words.map((item) => {
          const weight = item.count / max;
          const fontSize = 0.75 + weight * 0.85;
          return (
            <button
              key={item.word}
              type="button"
              onClick={() => onWordClick?.(item.word)}
              title={`${item.word}: ${formatNumber(item.count)} مرة`}
              className="rounded px-1 transition-colors hover:bg-surface-2"
              style={{
                fontSize: `${fontSize}rem`,
                color: 'var(--chart-1)',
                opacity: 0.55 + weight * 0.45,
                fontWeight: weight > 0.6 ? 700 : weight > 0.3 ? 600 : 500,
                cursor: onWordClick ? 'pointer' : 'default',
              }}
            >
              {item.word}
            </button>
          );
        })}
      </div>
    </ChartFrame>
  );
}
