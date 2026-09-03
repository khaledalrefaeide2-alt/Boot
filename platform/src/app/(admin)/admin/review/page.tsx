import type { Metadata } from 'next';
import { ReviewClient } from './review-client';

export const metadata: Metadata = { title: 'مراجعة البيانات' };

export default function ReviewPage() {
  return <ReviewClient />;
}
