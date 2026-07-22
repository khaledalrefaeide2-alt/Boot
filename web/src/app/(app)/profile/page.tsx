'use client';
import { Badge, Card, CardTitle, PageHeader } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';

export default function ProfilePage() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <div>
      <PageHeader title="Profile" subtitle="Your account details and role." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-600 text-white text-xl font-bold">
              {user.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="text-lg font-semibold">{user.name}</div>
              <div className="text-sm text-[var(--muted)]">{user.email}</div>
              <div className="mt-1"><Badge color="#2563EB">{user.role}</Badge></div>
            </div>
          </div>
          <div className="mt-6 border-t border-[var(--border)] pt-4 text-sm space-y-2">
            <Row label="User ID" value={`#${user.id}`} />
            <Row label="Role" value={user.role} />
            <Row label="Permissions" value={PERMS[user.role]} />
          </div>
        </Card>
        <Card>
          <CardTitle>Session</CardTitle>
          <p className="text-sm text-[var(--muted)] mb-4">Sign out of your current session on this device.</p>
          <button className="btn-ghost text-red-500 w-full" onClick={logout}>Log out</button>
        </Card>
      </div>
    </div>
  );
}

const PERMS: Record<string, string> = {
  admin: 'Full access · manage users, database & settings',
  editor: 'Create & edit content, run analyses, manage API',
  viewer: 'Read-only access to dashboards & reports',
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
