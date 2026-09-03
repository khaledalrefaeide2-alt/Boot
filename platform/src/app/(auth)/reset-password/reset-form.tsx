'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { api, ApiClientError } from '@/lib/api-client';

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <Card>
        <CardBody className="space-y-4">
          <Alert tone="danger" title="رابط غير صالح">
            لا يحتوي الرابط على رمز استعادة. اطلب رابطاً جديداً من مدير النظام.
          </Alert>
          <Link href="/login" className="block text-center text-xs text-primary hover:underline">
            العودة إلى تسجيل الدخول
          </Link>
        </CardBody>
      </Card>
    );
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);
    try {
      await api.post('/api/auth/reset-password', { token, password, confirmPassword });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        if (err.details) setFieldErrors(err.details);
      } else {
        setError('تعذّر الاتصال بالخادم');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader title="تعيين كلمة مرور جديدة" description="اختر كلمة مرور قوية لا تقل عن 10 محارف" />
      <CardBody>
        {done ? (
          <div className="space-y-4">
            <Alert tone="success" title="تم بنجاح">
              غُيّرت كلمة المرور وأُبطلت جلساتك السابقة. يمكنك تسجيل الدخول الآن.
            </Alert>
            <Link href="/login">
              <Button className="w-full">الانتقال إلى تسجيل الدخول</Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {error && <Alert tone="danger">{error}</Alert>}

            <Input
              label="كلمة المرور الجديدة"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={fieldErrors.password}
              hint="10 محارف على الأقل، وتحتوي على حروف ورقم"
              autoComplete="new-password"
              dir="ltr"
              className="ltr"
              required
              autoFocus
            />

            <Input
              label="تأكيد كلمة المرور"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              error={fieldErrors.confirmPassword}
              autoComplete="new-password"
              dir="ltr"
              className="ltr"
              required
            />

            <Button type="submit" className="w-full" loading={loading}>
              حفظ كلمة المرور
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
