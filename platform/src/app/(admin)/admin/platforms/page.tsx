import type { Metadata } from 'next';
import { PlatformsAdminClient } from './platforms-client';

export const metadata: Metadata = { title: 'إدارة المنصات' };

export default function AdminPlatformsPage() {
  return <PlatformsAdminClient />;
}
