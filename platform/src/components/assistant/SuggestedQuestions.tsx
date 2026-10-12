'use client';

import { Sparkles } from 'lucide-react';

const QUESTIONS = [
  'ما أهم المواضيع اليوم؟',
  'لخّص لي آخر 24 ساعة',
  'هل توجد أزمة محتملة؟',
  'ما أهم المنشورات السلبية؟',
  'ما سبب ارتفاع السلبية؟',
  'ما التوصيات؟',
  'أعطني ملخصًا تنفيذيًا',
];

/** أسئلة جاهزة — تُختصر أول خطوة على من لا يعرف ما يسأل */
export function SuggestedQuestions({ onPick }: { onPick: (question: string) => void }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div
        className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground"
        aria-hidden
      >
        <Sparkles className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-bold text-heading">اسأل عن بيانات الرصد</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        يجيب المساعد من المنشورات المخزَّنة في نطاقك أنت وحده، ولا يخترع أرقاماً.
      </p>

      <ul className="mt-6 flex flex-wrap justify-center gap-2">
        {QUESTIONS.map((question) => (
          <li key={question}>
            <button
              type="button"
              onClick={() => onPick(question)}
              className="min-h-control-compact rounded-full border border-border bg-surface px-4 py-1 text-sm text-muted-foreground shadow-elev-1 transition-colors hover:border-brand-700 hover:bg-brand-50 hover:text-primary-text focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--ring)]"
            >
              {question}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
