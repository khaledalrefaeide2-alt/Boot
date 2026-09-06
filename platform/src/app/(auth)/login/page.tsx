import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from './login-form';
import { HeroPanel } from './hero-panel';
import { LoadingState } from '@/components/ui/states';

export const metadata: Metadata = { title: 'تسجيل الدخول' };

export default function LoginPage() {
  /*
   * النموذج أولاً في ترتيب المستند، فيقع في بداية السطر — أي يمين الشاشة
   * في الاتجاه العربي — واللوحة التعريفية يساره.
   *
   * وهذا مقصود: من يفتح هذه الصفحة موظف يدخل يومياً لا زائر يُقنَع، فأول
   * ما تقع عليه العين في مسار القراءة يجب أن يكون حقل البريد لا التعريف.
   * واللوحة سياق مساند إلى جانبه.
   *
   * وترتيب المستند هذا هو ما يُبقي النموذج في أول شاشة على الجوال بلا
   * تمرير، حتى لو تغيّرت نقاط التوقف لاحقاً.
   */
  return (
    <div className="grid items-stretch gap-8 lg:grid-cols-2">
      <div className="mx-auto w-full max-w-md lg:mx-0 lg:self-center">
        <Suspense fallback={<LoadingState />}>
          <LoginForm />
        </Suspense>
      </div>
      <HeroPanel />
    </div>
  );
}
