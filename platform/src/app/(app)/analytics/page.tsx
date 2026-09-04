import type { Metadata } from 'next';
import { AnalyticsClient } from './analytics-client';

export const metadata: Metadata = { title: 'الإحصائيات' };

export default function AnalyticsPage() {
  return <AnalyticsClient />;
}
