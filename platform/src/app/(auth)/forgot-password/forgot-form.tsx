'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { api, ApiClientError } from '@/lib/api-client';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const result = await api.post<{ message: string }>('/api/auth/forgot-password', { email });
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'تعذّر إرسال الطلب');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="استعادة كلمة المرور"
        description="أدخل بريدك وسيتم إبلاغ مدير النظام لتسليمك رابط الاستعادة"
      />
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {message && <Alert tone="success">{message}</Alert>}
          {error && <Alert tone="danger">{error}</Alert>}

          <Input
            label="البريد الإلكتروني"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            dir="ltr"
            className="ltr"
            placeholder="name@example.com"
            required
            autoFocus
          />

          <Button type="submit" className="w-full" loading={loading}>
            إرسال الطلب
          </Button>

          <Link
            href="/login"
            className="flex items-center justify-center gap-1 pt-1 text-xs text-primary hover:underline"
          >
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            العودة إلى تسجيل الدخول
          </Link>
        </form>
      </CardBody>
    </Card>
  );
}
