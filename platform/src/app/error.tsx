'use client';

import Link from 'next/link';
import { RotateCcw } from 'lucide-react';
import { PageMessage } from '@/components/ui/states';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';

/**
 * حدُّ الخطأ الأعلى — ولم يكن موجوداً، فكانت صفحة Next الإنجليزية.
 *
 * ★ ولمَ زرُّ إعادةٍ لا رسالةُ اعتذار؟
 *
 *   أكثرُ ما يسقط صفحةً في هذا النظام عارضٌ لا عيب: القاعدة مشغولة
 *   لحظةَ ذروة، أو الشبكة انقطعت بين التطبيق وقاعدته. و`reset` تُعيد
 *   بناء ما سقط وحده دون إعادة تحميل الصفحة كلّها — فيعود الموظّف إلى
 *   عمله في ثانية، ولا يفقد ما في الحقول حوله.
 *
 * ★ ولا تُذكر رسالةُ الخطأ.
 *
 *   هذا الحدّ يقع فوق المجموعات كلّها، فهو يُعرض لمن لم يُصادَق عليه
 *   بعد — خطأٌ في شاشة الدخول يظهر هنا. ورسالةُ الخطأ قد تحمل مساراً
 *   على الخادم أو اسمَ عمود. فيُذكر رقمُ الحادثة وحده، وهو بصمةٌ يجد
 *   بها المشغّلُ السطرَ في السجلّ.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageMessage
      title="تعذّر إكمال هذه الصفحة"
      description="حدث خطأ غير متوقّع أثناء التحضير. أعد المحاولة — وإن تكرّر فأبلغ مشغّل النظام برقم الحادثة أدناه."
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
