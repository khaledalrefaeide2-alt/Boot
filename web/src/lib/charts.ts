import type { EChartsOption } from 'echarts';

// A limited, accessible categorical palette anchored on the brand blue.
// Consistent hue order keeps series colors stable across every chart.
export const PALETTE = [
  '#2563EB', // brand blue
  '#0EA5E9', // sky
  '#8B5CF6', // violet
  '#F59E0B', // amber
  '#10B981', // emerald
  '#EF4444', // red
  '#EC4899', // pink
  '#14B8A6', // teal
];

interface ThemeTokens {
  text: string;
  muted: string;
  grid: string;
  card: string;
}

function tokens(dark: boolean): ThemeTokens {
  return dark
    ? { text: '#e2e8f0', muted: '#94a3b8', grid: '#1e293b', card: '#111a2e' }
    : { text: '#0f172a', muted: '#64748b', grid: '#e2e8f0', card: '#ffffff' };
}

const baseTooltip = (t: ThemeTokens) => ({
  backgroundColor: t.card,
  borderColor: t.grid,
  textStyle: { color: t.text, fontSize: 12 },
  extraCssText: 'border-radius:12px;box-shadow:0 10px 30px -12px rgba(15,23,42,.25);',
});

/** Area/line trend chart. */
export function lineOption(
  dark: boolean,
  categories: string[],
  series: { name: string; data: number[] }[]
): EChartsOption {
  const t = tokens(dark);
  return {
    color: PALETTE,
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', ...baseTooltip(t) },
    legend: series.length > 1 ? { top: 0, textStyle: { color: t.muted }, icon: 'roundRect' } : undefined,
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: categories,
      axisLine: { lineStyle: { color: t.grid } },
      axisLabel: { color: t.muted, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: t.grid } },
      axisLabel: { color: t.muted, fontSize: 11, formatter: (v: number) => compact(v) },
    },
    series: series.map((s, i) => ({
      name: s.name,
      type: 'line',
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 2.5 },
      areaStyle: series.length === 1
        ? { color: gradient(PALETTE[i % PALETTE.length]) }
        : undefined,
      data: s.data,
    })),
  };
}

/** Vertical bar chart. */
export function barOption(
  dark: boolean,
  categories: string[],
  data: number[],
  name = ''
): EChartsOption {
  const t = tokens(dark);
  return {
    color: PALETTE,
    grid: { left: 8, right: 16, top: 20, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', ...baseTooltip(t) },
    xAxis: {
      type: 'category',
      data: categories,
      axisLine: { lineStyle: { color: t.grid } },
      axisLabel: { color: t.muted, fontSize: 11, interval: 0, rotate: categories.length > 6 ? 30 : 0 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: t.grid } },
      axisLabel: { color: t.muted, fontSize: 11, formatter: (v: number) => compact(v) },
    },
    series: [{ name, type: 'bar', data, barMaxWidth: 36, itemStyle: { borderRadius: [6, 6, 0, 0] } }],
  };
}

/** Donut chart. */
export function donutOption(
  dark: boolean,
  items: { name: string; value: number }[]
): EChartsOption {
  const t = tokens(dark);
  return {
    color: PALETTE,
    tooltip: { trigger: 'item', ...baseTooltip(t) },
    legend: { bottom: 0, textStyle: { color: t.muted }, icon: 'circle' },
    series: [
      {
        type: 'pie',
        radius: ['55%', '78%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: t.card, borderWidth: 2, borderRadius: 6 },
        label: { show: false },
        data: items,
      },
    ],
  };
}

/** Radar chart for competitor comparison. */
export function radarOption(
  dark: boolean,
  indicators: { name: string; max: number }[],
  series: { name: string; value: number[] }[]
): EChartsOption {
  const t = tokens(dark);
  return {
    color: PALETTE,
    tooltip: { ...baseTooltip(t) },
    legend: { top: 0, textStyle: { color: t.muted }, icon: 'roundRect' },
    radar: {
      indicator: indicators,
      axisName: { color: t.muted, fontSize: 11 },
      splitLine: { lineStyle: { color: t.grid } },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: t.grid } },
    },
    series: [
      {
        type: 'radar',
        data: series.map((s) => ({ name: s.name, value: s.value, areaStyle: { opacity: 0.12 } })),
      },
    ],
  };
}

/** Calendar heatmap for activity. */
export function heatmapOption(
  dark: boolean,
  data: [string, number][]
): EChartsOption {
  const t = tokens(dark);
  const max = Math.max(1, ...data.map((d) => d[1]));
  const year = data.length ? data[data.length - 1][0].slice(0, 4) : `${new Date().getFullYear()}`;
  return {
    tooltip: { ...baseTooltip(t), formatter: (p: any) => `${p.value[0]}: ${p.value[1]}` },
    visualMap: {
      min: 0,
      max,
      show: false,
      inRange: { color: dark ? ['#0b1220', '#2563EB'] : ['#e0edff', '#1d4ed8'] },
    },
    calendar: {
      top: 20,
      left: 30,
      right: 10,
      cellSize: ['auto', 14],
      range: year,
      itemStyle: { color: 'transparent', borderColor: t.grid, borderWidth: 1 },
      splitLine: { show: false },
      dayLabel: { color: t.muted, fontSize: 10 },
      monthLabel: { color: t.muted, fontSize: 10 },
      yearLabel: { show: false },
    },
    series: [{ type: 'heatmap', coordinateSystem: 'calendar', data }],
  };
}

function gradient(hex: string) {
  return {
    type: 'linear' as const,
    x: 0, y: 0, x2: 0, y2: 1,
    colorStops: [
      { offset: 0, color: hex + '55' },
      { offset: 1, color: hex + '05' },
    ],
  };
}

function compact(v: number): string {
  return Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}
