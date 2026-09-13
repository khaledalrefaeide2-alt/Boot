import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { GuidanceClient } from './guidance-client';

export const metadata: Metadata = { title: 'توجيهات التحليل' };

export default async function AnalysisGuidancePage() {
  const user = await getSession();
  if (!can(user, PERMISSIONS.TAXONOMY_MANAGE)) notFound();
  return <GuidanceClient />;
}
