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
      className="flex flex-wrap items-end gap-2 border-t border-border bg-surface p-3 sm:p-4"
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
        aria-describedby="assistant-input-hint"
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
        placeholder="اسأل عن بيانات الرصد…"
        className="max-h-50 min-h-control flex-1 resize-none rounded-control border border-border-input bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-foreground transition-[border-color,box-shadow] duration-150 placeholder:text-subtle-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_var(--primary),0_0_0_4px_var(--primary-soft)] disabled:opacity-50"
      />

      {busy ? (
        <Button type="button" variant="secondary" onClick={onStop} aria-label="إيقاف التوليد">
          <Square aria-hidden />
          إيقاف
        </Button>
      ) : (
        <Button type="submit" disabled={disabled || !value.trim()} aria-label="إرسال">
          <Send aria-hidden />
          إرسال
        </Button>
      )}

      {/*
        تعليمات لوحة المفاتيح سطرٌ تحت الحقل لا داخل نصّه الإرشادي.

        كانت في النصّ الإرشادي فالتفّ على الشاشة الضيّقة سطرين، والحقل
        يتمدّد مع محتواه — فبدأ الحقل الفارغ بارتفاع 66 بدل 44 وكأنّ فيه
        كلاماً. والسطر هنا مربوطٌ بالحقل (`aria-describedby`) فيُقرأ معه.
      */}
      <p id="assistant-input-hint" className="w-full text-xs text-subtle-foreground max-sm:sr-only">
        Enter للإرسال · Shift+Enter لسطر جديد
      </p>
    </form>
  );
}
