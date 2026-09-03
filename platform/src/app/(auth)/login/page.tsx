import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from './login-form';
import { LoadingState } from '@/components/ui/states';

export const metadata: Metadata = { title: 'تسجيل الدخول' };

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <LoginForm />
    </Suspense>
  );
}
