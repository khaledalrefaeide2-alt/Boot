import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ResetPasswordForm } from './reset-form';
import { LoadingState } from '@/components/ui/states';

export const metadata: Metadata = { title: 'تعيين كلمة مرور جديدة' };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
