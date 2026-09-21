'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { Button, type ButtonVariant } from './button';
import { cn } from '@/lib/utils';

/*
 * إجراءات صفّ الجدول.
 *
 * صفٌّ يحمل خمسة أزرار ليس صفّاً غنيّاً بالإجراءات بل صفّاً بلا إجراء
 * واضح: العين تمسحها كلها قبل أن تجد ما تريد، وفي كل صفّ من مئة. فيبقى
 * إجراءان ظاهرين — الأكثر استعمالاً — ويذهب الباقي إلى «المزيد».
 *
 * والقائمة تُرسم في جسم الصفحة لا داخل الصفّ: حاوية الجدول تمرّر أفقياً
 * (`overflow-x-auto`)، وهذا يجعل التمرير الرأسي محسوباً كذلك، فقائمةٌ
 * مرسومة داخلها تُقصّ عند حافّتها. والإحداثيات تُقاس من الزرّ عند الفتح.
 */

export interface RowAction {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** يظهر ظاهراً لا في القائمة — أوّل اثنين فقط */
  variant?: ButtonVariant;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  /** يُخفى تماماً — أبسط من تصفية المصفوفة في كل موضع استدعاء */
  hidden?: boolean;
}

/** كم إجراءً يبقى ظاهراً قبل أن يبدأ «المزيد» */
const INLINE_LIMIT = 2;

export function RowActions({ actions, className }: { actions: RowAction[]; className?: string }) {
  const visible = actions.filter((action) => !action.hidden);
  const inline = visible.slice(0, INLINE_LIMIT);
  const overflow = visible.slice(INLINE_LIMIT);

  return (
    <div className={cn('flex items-center justify-end gap-2', className)}>
      {inline.map((action) => (
        <Button
          key={action.key}
          size="sm"
          variant={action.variant ?? 'secondary'}
          startIcon={action.icon}
          onClick={action.onSelect}
          disabled={action.disabled}
          loading={action.loading}
          className={action.tone === 'danger' ? 'text-danger' : undefined}
        >
          {action.label}
        </Button>
      ))}

      {overflow.length > 0 && <OverflowMenu actions={overflow} />}
    </div>
  );
}

function OverflowMenu({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; insetInlineEnd: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    /*
     * الطرف المنطقي لا اليساري: في RTL تُحاذى القائمة يمين الزرّ، وفي LTR
     * يساره — وحساب `right` بالبكسل يصيب أحدهما ويخطئ الآخر.
     */
    const isRtl = document.documentElement.dir === 'rtl';
    setPosition({
      top: rect.bottom + 4,
      insetInlineEnd: isRtl ? window.innerWidth - rect.right : rect.left,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    /*
     * التمرير يُغلق ولا يُعيد الحساب: القائمة مثبّتة بإحداثيات لُقطت عند
     * الفتح، فلو بقيت مفتوحة أثناء التمرير لانفصلت عن زرّها وبدت معلّقة
     * فوق صفٍّ آخر.
     */
    const onScroll = () => setOpen(false);

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  return (
    <>
      <Button
        ref={triggerRef}
        size="icon-sm"
        variant="ghost"
        aria-label="المزيد من الإجراءات"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal aria-hidden />
      </Button>

      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="إجراءات إضافية"
            style={{ top: position.top, insetInlineEnd: position.insetInlineEnd }}
            className="fixed z-50 min-w-44 rounded-lg border border-border bg-surface p-1 shadow-elev-3"
          >
            {actions.map((action) => (
              <button
                key={action.key}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                onClick={() => {
                  setOpen(false);
                  action.onSelect();
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm font-medium',
                  'transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:bg-olive-50',
                  'disabled:cursor-not-allowed disabled:text-disabled-text',
                  action.tone === 'danger'
                    ? 'text-danger hover:bg-danger-soft'
                    : 'text-foreground hover:bg-olive-50',
                )}
              >
                {action.icon && (
                  <span className="inline-flex shrink-0 items-center [&>svg]:h-4 [&>svg]:w-4">
                    {action.icon}
                  </span>
                )}
                {action.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
