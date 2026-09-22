'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Segmented } from '@/components/ui/button-group';
import { GuidanceClient } from './guidance-client';
import { RunsClient } from './runs-client';

type Tab = 'runs' | 'guidance';

const TABS = [
  { value: 'runs' as const, label: 'جولات التحليل' },
  { value: 'guidance' as const, label: 'التوجيهات' },
];

/**
 * شاشة واحدة للتحليل بوجهين.
 *
 * التوجيه يقول للنموذج كيف يصنّف، والجولة تُطبّق ذلك على ما مضى. وهما
 * حركتان في عمل واحد: من يُضيف توجيهاً يريد غالباً إعادة تصنيف ما سبق به.
 * وشاشتان منفصلتان تجعلان الخطوة الثانية تُنسى، فيبقى التوجيه الجديد
 * سارياً على الجديد وحده بينما الأرشيف مصنَّف بالقاعدة القديمة.
 */
export function AnalysisClient() {
  const [tab, setTab] = useState<Tab>('runs');

  return (
    <>
      <PageHeader
        eyebrow="تحليل"
        title="التحليل بالذكاء الاصطناعي"
        description="شغّل جولة تحليل على المنشورات، واضبط القواعد التي يقرأ بها النموذج."
      />

      <Segmented
        label="أقسام التحليل"
        value={tab}
        onChange={setTab}
        options={TABS}
        className="mb-5"
      />

      {tab === 'runs' ? <RunsClient /> : <GuidanceClient />}
    </>
  );
}
