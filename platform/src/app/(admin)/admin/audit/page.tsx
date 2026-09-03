import type { Metadata } from 'next';
import { AuditClient } from './audit-client';

export const metadata: Metadata = { title: 'السجلات والنشاطات' };

export default function AuditPage() {
  return <AuditClient />;
}
