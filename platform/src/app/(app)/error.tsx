'use client';

import Link from 'next/link';
import { RotateCcw } from 'lucide-react';
import { PageMessage } from '@/components/ui/states';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';

/**
 * حدُّ الخطأ داخل غلاف التطبيق — فتبقى القائمة الجانبية.
 *
 * ★ ولمَ حدٌّ ثانٍ وفوقه حدٌّ يكفي؟
 *
 *   الحدُّ الأعلى يقع فوق الغلاف، فسقوطُ صفحةٍ واحدةٍ عنده يُخلي الشاشة
 *   من القائمة والترويسة معاً — فيجد الموظّف نفسه أمام صفحةٍ عارية لا
 *   طريق منها إلا زرٌّ واحد. وهذا الحدّ داخل الغلاف، فالصفحةُ وحدها
 *   تسقط ويبقى ما حولها: يذهب إلى قسمٍ آخر بنقرة، ولا يخرج من النظام
 *   لأنّ شاشةً فيه تعطّلت.
 *
 *   ويُصاب الاثنان بما لا يُصاب به الآخر: ما يسقط في الغلاف نفسه
 *   (الجلسة، الصلاحيات، اسمُ النظام) لا يُمسكه هذا بل الذي فوقه.
 */
export default function AppSectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageMessage
      title="تعذّر تحميل هذا القسم"
      description="حدث خطأ غير متوقّع أثناء تحضير هذه الصفحة. بقيّة الأقسام تعمل — أعد المحاولة أو انتقل إلى قسم آخر من القائمة."
      digest={error.digest}
    >
      <Button size="lg" onClick={reset} startIcon={<RotateCcw aria-hidden />}>
        إعادة المحاولة
      </Button>
      <Link href="/" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
        اللوحة الرئيسية
      </Link>
    </PageMessage>
  );
}
