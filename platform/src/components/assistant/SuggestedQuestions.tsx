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
              className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {question}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
