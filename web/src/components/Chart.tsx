'use client';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

/** Thin wrapper around ECharts with a consistent height + empty guard. */
export function Chart({ option, height = 280, loading }: { option: EChartsOption; height?: number; loading?: boolean }) {
  if (loading)
    return (
      <div
        className="relative w-full overflow-hidden rounded-xl bg-black/5 dark:bg-white/5"
        style={{ height }}
      />
    );
  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'canvas' }}
      notMerge
    />
  );
}
