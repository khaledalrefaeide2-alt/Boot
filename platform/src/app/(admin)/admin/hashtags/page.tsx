import type { Metadata } from 'next';
import { HashtagsClient } from './hashtags-client';

export const metadata: Metadata = { title: 'الهاشتاغات' };

export default function HashtagsPage() {
  return <HashtagsClient />;
}
