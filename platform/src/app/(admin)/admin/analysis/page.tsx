import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { AnalysisClient } from './analysis-client';

export const metadata: Metadata = { title: 'التحليل بالذكاء الاصطناعي' };

export default async function AnalysisPage() {
  const user = await getSession();
  if (!can(user, PERMISSIONS.TAXONOMY_MANAGE)) notFound();
  return <AnalysisClient />;
}
