import type { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { ExtractionsClient } from './extractions-client';

export const metadata: Metadata = { title: 'عمليات الاستخراج' };

export default async function ExtractionsPage() {
  const user = await getSession();
  return (
    <ExtractionsClient
      canRun={can(user, PERMISSIONS.EXTRACTION_RUN)}
      canCancel={can(user, PERMISSIONS.EXTRACTION_CANCEL)}
    />
  );
}
