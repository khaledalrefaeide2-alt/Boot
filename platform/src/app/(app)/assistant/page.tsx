import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { isAssistantConfigured } from '@/lib/assistant/config';
import { ChatWindow } from '@/components/assistant/ChatWindow';

export const metadata: Metadata = { title: 'المساعد الذكي' };

export default async function AssistantPage() {
  const user = await getSession();
  if (!can(user, PERMISSIONS.ASSISTANT_USE)) notFound();

  /*
   * حالة التهيئة تُقرأ في الخادم وتُمرَّر كقيمة منطقية واحدة.
   *
   * ولا يُقرأ المفتاح هنا ولا يُمرَّر شيء منه: المكوّن الذي يستقبلها
   * مكوّن عميل، وكلّ ما يصله يُحزَم في حمولة الصفحة ويُقرأ من المتصفّح.
   * فالمعلومة المنقولة «هل ضُبط؟» لا «ما هو؟».
   */
  return (
    <>
      <PageHeader
        eyebrow="تحليل"
        title="المساعد الذكي"
        description="اسأل عن بيانات الرصد ضمن نطاقك — الإجابات مبنية على المنشورات المخزَّنة."
      />
      <ChatWindow configured={isAssistantConfigured()} />
    </>
  );
}
