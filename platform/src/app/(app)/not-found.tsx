import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { PageMessage } from '@/components/ui/states';
import { buttonVariants } from '@/components/ui/button-variants';

/**
 * ٤٠٤ داخل الغلاف — فتبقى القائمة الجانبية.
 *
 * وهذا هو الـ٤٠٤ الذي يُعرض فعلاً في عمل الموظّف اليومي: `notFound()`
 * تُستدعى من صفحة منشورٍ أو كيانٍ أو قصّةٍ حُذف، أو من معرّفٍ خارج نطاق
 * حساباته. وأن يبقى ما حوله يعني أنّه يعود إلى القائمة بنقرةٍ واحدة —
 * وهو ما يفعله في الحالتين.
 */
export default function AppNotFound() {
  return (
    <PageMessage
      icon={FileQuestion}
      tone="neutral"
      title="لم نجد هذا العنصر"
      description="قد يكون محذوفاً، أو الرابط قديماً، أو خارج نطاق الحسابات المتاحة لك. وإن وصلك الرابط من زميل فاطلب منه إعادة إرساله من داخل النظام."
    >
      <Link href="/posts" className={buttonVariants({ variant: 'primary', size: 'lg' })}>
        الذهاب إلى المنشورات
      </Link>
      <Link href="/" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
        اللوحة الرئيسية
      </Link>
    </PageMessage>
  );
}
