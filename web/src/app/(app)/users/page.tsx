'use client';
import { useState } from 'react';
import { Icon } from '@/components/icons';
import { Badge, Card, CardTitle, EmptyState, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useFetch } from '@/hooks/useFetch';
import { relTime } from '@/lib/format';

const ROLE_COLOR: Record<string, string> = { admin: '#EF4444', editor: '#2563EB', viewer: '#94a3b8' };

export default function UsersPage() {
  const { user } = useAuth();
  const { data, error, refetch } = useFetch<any>('/users');
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'viewer' });

  if (user?.role !== 'admin') {
    return (
      <div>
        <PageHeader title="User Management" />
        <Card><EmptyState title="Admins only" hint="You need the admin role to manage users." /></Card>
      </div>
    );
  }

  const create = async () => {
    await api.post('/users', form);
    setForm({ email: '', name: '', password: '', role: 'viewer' });
    refetch();
  };
  const update = async (id: number, patch: any) => {
    await api.patch(`/users/${id}`, patch);
    refetch();
  };
  const remove = async (id: number) => {
    await api.delete(`/users/${id}`);
    refetch();
  };

  return (
    <div>
      <PageHeader title="User Management" subtitle="Manage roles and access: Admin, Editor and Viewer." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle>Invite user</CardTitle>
          <div className="space-y-3">
            <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="label">Email</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className="label">Temp password</label><input className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div><label className="label">Role</label>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {['viewer', 'editor', 'admin'].map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <button className="btn-primary w-full" onClick={create}><Icon.plus width={16} /> Create user</button>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle>Team</CardTitle>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="divide-y divide-[var(--border)]">
            {(data?.users || []).map((u: any) => (
              <div key={u.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 text-white text-xs font-semibold">
                    {u.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{u.name} {u.id === user.id && <span className="text-xs text-[var(--muted)]">(you)</span>}</div>
                    <div className="text-xs text-[var(--muted)]">{u.email} · joined {relTime(u.createdAt)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select className="input !py-1 !w-28 text-xs" value={u.role} onChange={(e) => update(u.id, { role: e.target.value })} disabled={u.id === user.id}>
                    {['viewer', 'editor', 'admin'].map((r) => <option key={r}>{r}</option>)}
                  </select>
                  <Badge color={u.status === 'active' ? '#10B981' : '#94a3b8'}>{u.status}</Badge>
                  {u.id !== user.id && (
                    <>
                      <button className="btn-ghost !p-1.5" title="Toggle status" onClick={() => update(u.id, { status: u.status === 'active' ? 'disabled' : 'active' })}>
                        <Icon.check width={14} />
                      </button>
                      <button className="btn-ghost !p-1.5 text-red-500" onClick={() => remove(u.id)}><Icon.trash width={14} /></button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
