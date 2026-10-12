'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CHART_AXIS,
  CHART_GRID,
  ChartFrame,
  ChartLegend,
  ChartTooltip,
  axisDateFormatter,
  axisNumberFormatter,
  seriesColor,
  seriesDash,
  tooltipDateFormatter,
} from './chart-kit';
import { ChartColumn, TrendingUp } from 'lucide-react';

export interface TimelinePoint {
  date: string;
  posts: number;
  engagement: number;
}

/**
 * الخط الزمني للنشر والتفاعل.
 * محور زمني واحد فقط — لا محورين مختلفي المقياس أبداً، لذلك يُعرض
 * النشر والتفاعل في رسمين منفصلين عند الحاجة إلى الاثنين.
 */
export function TimelineChart({
  data,
  metric = 'posts',
  title,
  description,
  action,
  height = 280,
}: {
  data: TimelinePoint[];
  metric?: 'posts' | 'engagement';
  title: string;
  description?: string;
  action?: React.ReactNode;
  height?: number;
}) {
  /*
   * التفاعل بتركواز الهوية كما في المرجع، والنشر بالأزرق.
   * رسمان متجاوران بلونٍ واحد يُقرآن رسماً مكرّراً، فيفترقان لوناً.
   */
  const color = metric === 'engagement' ? seriesColor(0) : seriesColor(2);
  const label = metric === 'posts' ? 'عدد المنشورات' : 'إجمالي التفاعل';
  /*
   * النقاط على كلّ يوم حين تكون الأيام قليلة — كما في المرجع — فيُرى أين
   * تقع القيم الحقيقية بين ما يرسمه المنحنى. وتسقط حين تتزاحم: ستّون نقطة
   * على عرض بطاقة تصير خطّاً سميكاً لا نقاطاً.
   */
  const showDots = data.length <= 35;

  return (
    <ChartFrame
      title={title}
      description={description}
      action={action}
      icon={metric === 'engagement' ? TrendingUp : ChartColumn}
      isEmpty={data.length === 0}
      height={height}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
          <defs>
            <linearGradient id={`fill-${metric}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={color} stopOpacity={0.03} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />

          {/* المحور الزمني معكوس ليتدفق من اليمين إلى اليسار مع اتجاه القراءة */}
          <XAxis
            dataKey="date"
            reversed
            tickFormatter={axisDateFormatter}
            tick={{ fill: CHART_AXIS, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: CHART_GRID }}
            minTickGap={24}
          />
          <YAxis
            orientation="right"
            tickFormatter={axisNumberFormatter}
            tick={{ fill: CHART_AXIS, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={48}
          />

          <Tooltip
            content={<ChartTooltip labelFormatter={tooltipDateFormatter} />}
            cursor={{ stroke: CHART_AXIS, strokeDasharray: '3 3' }}
          />

          <Area
            type="monotone"
            dataKey={metric}
            name={label}
            stroke={color}
            strokeWidth={2.25}
            fill={`url(#fill-${metric})`}
            dot={showDots ? { r: 3, strokeWidth: 2, stroke: color, fill: 'var(--surface)' } : false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface)', fill: color }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** مقارنة عدة سلاسل زمنية — للمقارنة بين الحسابات أو المنصات */
export function MultiSeriesTimeline({
  data,
  series,
  title,
  description,
  height = 300,
}: {
  data: Record<string, string | number>[];
  series: { key: string; label: string }[];
  title: string;
  description?: string;
  height?: number;
}) {
  return (
    <ChartFrame
      title={title}
      description={description}
      isEmpty={data.length === 0 || series.length === 0}
      height={height}
      footer={
        series.length > 1 ? (
          <ChartLegend
            items={series.map((item, index) => ({
              label: item.label,
              color: seriesColor(index),
              dash: seriesDash(index) ?? '',
            }))}
          />
        ) : undefined
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            reversed
            tickFormatter={axisDateFormatter}
            tick={{ fill: CHART_AXIS, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: CHART_GRID }}
            minTickGap={24}
          />
          <YAxis
            orientation="right"
            tickFormatter={axisNumberFormatter}
            tick={{ fill: CHART_AXIS, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            content={<ChartTooltip labelFormatter={tooltipDateFormatter} />}
            cursor={{ stroke: CHART_AXIS, strokeDasharray: '3 3' }}
          />
          {series.map((item, index) => (
            <Line
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.label}
              stroke={seriesColor(index)}
              strokeDasharray={seriesDash(index)}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
