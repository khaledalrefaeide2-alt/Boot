'use client';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Icon } from '@/components/icons';

export default function LoginPage() {
  const { login, register } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ email: 'admin@fbintel.local', name: '', password: 'Admin123!' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register(form.email, form.name, form.password);
      router.replace('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-ink p-12 text-white">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-600 font-bold">fb</div>
          <div className="text-lg font-semibold">FB Intel</div>
        </div>
        <div className="relative">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Facebook analytics &<br />social intelligence,<br />
            <span className="text-brand-400">at enterprise scale.</span>
          </h1>
          <p className="mt-4 max-w-md text-white/70">
            Monitor hashtags and keywords, discover viral content, track engagement over time, and
            export professional reports — all from one premium dashboard.
          </p>
          <div className="mt-8 flex flex-wrap gap-2 text-sm">
            {['Hashtag monitoring', 'Trend discovery', 'Competitor analysis', 'Report exports'].map((t) => (
              <span key={t} className="rounded-full border border-white/15 bg-white/5 px-3 py-1">
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="relative text-xs text-white/40">© {new Date().getFullYear()} FB Intel Platform</div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white font-bold">fb</div>
            <div className="text-lg font-semibold">FB Intel</div>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {mode === 'login' ? 'Sign in to your analytics workspace.' : 'The first account becomes the admin.'}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === 'register' && (
              <div>
                <label className="label">Full name</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
            )}
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </div>
            {error && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</div>}
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
              {!busy && <Icon.logout width={16} height={16} />}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--muted)]">
            {mode === 'login' ? "Don't have an account? " : 'Already registered? '}
            <button
              className="font-medium text-brand-600 hover:underline"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError('');
              }}
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
          {mode === 'login' && (
            <p className="mt-4 rounded-lg bg-brand-50 dark:bg-brand-900/20 px-3 py-2 text-center text-xs text-[var(--muted)]">
              Demo: admin@fbintel.local / Admin123!
            </p>
          )}
        </motion.div>
      </div>
    </div>
  );
}
