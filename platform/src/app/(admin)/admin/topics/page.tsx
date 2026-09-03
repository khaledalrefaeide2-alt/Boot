import type { Metadata } from 'next';
import { TopicsClient } from './topics-client';

export const metadata: Metadata = { title: 'التصنيفات' };

export default function TopicsPage() {
  return <TopicsClient />;
}
