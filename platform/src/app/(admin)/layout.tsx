import { ProtectedShell } from '@/components/layout/protected-shell';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedShell area="admin">{children}</ProtectedShell>;
}
