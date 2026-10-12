import type { Metadata } from 'next';
import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { PageMessage } from '@/components/ui/states';
import { buttonVariants } from '@/components/ui/button-variants';

export const metadata: Metadata = { title: 'الصفحة غير موجودة' };

/**
 * ٤٠٤ — ولم تكن موجودةً أصلاً، فكانت صفحة Next الإنجليزية.
 *
 * ★ وفي نظامٍ داخليٍّ ليس «٤٠٤» خطأً مطبعياً غالباً.
 *
 *   الزائر على الإنترنت يُخطئ كتابة العنوان. أمّا الموظّف فيصل إلى هنا
 *   من رابطٍ أرسله له زميل، أو من صفحةٍ محفوظة في مفضّلته، أو من تنبيهٍ
 *   قديم — فالسبب الأغلب أنّ ما يطلبه **حُذف** أو أنّه خارج نطاق
 *   حساباته. وقولُ «غير موجودة» وحدها يتركه يُعيد المحاولة ويُعيد.
 *
 *   فتُذكر الاحتمالات الثلاثة باسمها. ومن حُذف منشوره يعرف أنّه حُذف،
 *   ومن كان خارج نطاقه يعرف أن يسأل عن الصلاحية لا أن يصلح الرابط.
 */
export default function NotFound() {
  return (
    <PageMessage
      icon={FileQuestion}
      tone="neutral"
      title="لم نجد هذه الصفحة"
      description="قد يكون العنصر محذوفاً، أو الرابط قديماً، أو خارج نطاق الحسابات المتاحة لك. وإن وصلك الرابط من زميل فاطلب منه إعادة إرساله من داخل النظام."
    >
      <Link href="/" className={buttonVariants({ variant: 'primary', size: 'lg' })}>
        العودة إلى اللوحة الرئيسية
      </Link>
    </PageMessage>
  );
}
