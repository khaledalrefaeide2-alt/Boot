import type { Metadata } from 'next';
import { KeywordsClient } from './keywords-client';

export const metadata: Metadata = { title: 'الكلمات المفتاحية' };

export default function KeywordsPage() {
  return <KeywordsClient />;
}
