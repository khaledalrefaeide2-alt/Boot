'use client';

import { useEffect, useRef } from 'react';
import { Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** حقل الإرسال — يكبر مع النصّ، ويُرسل بـ Enter ويُسطّر بـ Shift+Enter */
export function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  busy,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  busy: boolean;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // الارتفاع يتبع المحتوى بحدّ أقصى، فلا يبتلع الحقلُ الشاشةَ في سؤال طويل
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 200)}px`;
  }, [value]);

  return (
    <form
      className="flex items-end gap-2 border-t border-border bg-surface p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) onSubmit();
      }}
    >
      <label htmlFor="assistant-input" className="sr-only">
        اكتب سؤالك
      </label>
      <textarea
        id="assistant-input"
        ref={ref}
        rows={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (!busy && value.trim()) onSubmit();
          }
        }}
        placeholder="اسأل عن بيانات الرصد… (Enter للإرسال، Shift+Enter لسطر جديد)"
        className="max-h-50 min-h-10 flex-1 resize-none rounded-md border border-border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-subtle-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-50"
      />

      {busy ? (
        <Button type="button" variant="secondary" onClick={onStop} aria-label="إيقاف التوليد">
          <Square className="h-4 w-4" aria-hidden />
          إيقاف
        </Button>
      ) : (
        <Button type="submit" disabled={disabled || !value.trim()} aria-label="إرسال">
          <Send className="h-4 w-4" aria-hidden />
          إرسال
        </Button>
      )}
    </form>
  );
}
