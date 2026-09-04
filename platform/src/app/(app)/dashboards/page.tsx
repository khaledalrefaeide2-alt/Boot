import type { Metadata } from 'next';
import { DashboardsClient } from './dashboards-client';

export const metadata: Metadata = { title: 'اللوحات المحفوظة' };

export default function DashboardsPage() {
  return <DashboardsClient />;
}
