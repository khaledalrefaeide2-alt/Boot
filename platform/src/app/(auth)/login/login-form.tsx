'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogIn } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { api, ApiClientError } from '@/lib/api-client';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);

    try {
      const result = await api.post<{ redirectTo: string }>('/api/auth/login', { email, password });
      const target = nextPath && nextPath.startsWith('/') ? nextPath : result.redirectTo;
      router.replace(target);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        if (err.details) setFieldErrors(err.details);
      } else {
        setError('تعذّر الاتصال بالخادم، تحقق من الشبكة وحاول مجدداً');
      }
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="تسجيل الدخول"
        description="أدخل بيانات حسابك للوصول إلى لوحة الرصد"
      />
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && <Alert tone="danger">{error}</Alert>}

          <Input
            label="البريد الإلكتروني"
            type="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={fieldErrors.email}
            autoComplete="username"
            dir="ltr"
            className="ltr"
            placeholder="name@example.com"
            required
            autoFocus
          />

          <Input
            label="كلمة المرور"
            type="password"
            name="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldErrors.password}
            autoComplete="current-password"
            dir="ltr"
            className="ltr"
            required
          />

          <Button type="submit" className="w-full" loading={loading} size="lg">
            {!loading && <LogIn className="h-4 w-4" aria-hidden />}
            دخول
          </Button>

          <div className="flex items-center justify-between pt-1 text-xs">
            <Link href="/forgot-password" className="text-primary hover:underline">
              نسيت كلمة المرور؟
            </Link>
            <span className="text-muted-foreground">لا يوجد تسجيل ذاتي — الحسابات تُنشأ من الإدارة</span>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
