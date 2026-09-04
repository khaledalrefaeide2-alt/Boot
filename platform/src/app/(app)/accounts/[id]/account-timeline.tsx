'use client';

import { TimelineChart } from '@/components/charts/timeline-chart';

/** غلاف عميل لرسم الخط الزمني داخل صفحة خادمية */
export function AccountTimeline({
  data,
}: {
  data: { date: string; posts: number; engagement: number }[];
}) {
  return (
    <TimelineChart
      title="نشاط النشر"
      description="عدد المنشورات في كل يوم لهذا الحساب"
      data={data}
      metric="posts"
      height={220}
    />
  );
}
