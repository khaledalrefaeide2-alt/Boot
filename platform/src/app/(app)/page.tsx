import type { Metadata } from 'next';
import { OverviewClient } from './overview-client';

export const metadata: Metadata = { title: 'النظرة العامة' };

export default function OverviewPage() {
  return <OverviewClient />;
}
