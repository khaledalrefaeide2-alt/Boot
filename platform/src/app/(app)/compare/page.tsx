import type { Metadata } from 'next';
import { CompareClient } from './compare-client';

export const metadata: Metadata = { title: 'مقارنة الحسابات' };

export default function ComparePage() {
  return <CompareClient />;
}
