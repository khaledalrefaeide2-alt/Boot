'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  } as const;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-4 no-print">
      <div
        className="fixed inset-0 bg-[#0b1320]/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative z-10 w-full rounded-t-modal border border-border bg-surface shadow-elev-4 outline-none sm:rounded-modal',
          sizes[size],
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div className="space-y-0.5">
            <h2 className="text-lg font-bold text-heading">{title}</h2>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="إغلاق" className="-me-2 -mt-1">
            <X aria-hidden />
          </Button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          /*
            الترتيب في RTL: الإجراء الرئيسي أولاً من جهة البداية ثم الثانوي
            بجانبه.

            و`flex-row-reverse` مع `justify-end` هو ما يحقّقه دون لمس ترتيب
            الأزرار في كل نافذة: التذييلات كلها تكتب «إلغاء» ثم الإجراء،
            فيبقى ترتيب التنقّل بلوحة المفاتيح على «إلغاء» أولاً — وهو
            الأسلم في حوار تأكيد — ويصير الترتيب البصري على المواصفة.
          */
          <div className="flex flex-row-reverse flex-wrap items-center justify-end gap-2 rounded-b-modal border-t border-border bg-surface-2/60 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** حوار تأكيد للعمليات الخطرة */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  tone = 'danger',
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>
    </Modal>
  );
}
