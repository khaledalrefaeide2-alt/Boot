'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastTone = 'info' | 'success' | 'warning' | 'danger';

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastContextValue {
  notify: (toast: Omit<Toast, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, { className: string; Icon: typeof Info }> = {
  info: { className: 'border-info/30 bg-info-soft text-info', Icon: Info },
  success: { className: 'border-success/30 bg-success-soft text-success', Icon: CheckCircle2 },
  warning: { className: 'border-warning/30 bg-warning-soft text-warning', Icon: TriangleAlert },
  danger: { className: 'border-danger/30 bg-danger-soft text-danger', Icon: AlertCircle },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = Date.now() + Math.random();
      setToasts((current) => [...current.slice(-3), { ...toast, id }]);
      setTimeout(() => dismiss(id), toast.tone === 'danger' ? 8000 : 4500);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      notify,
      success: (title, description) => notify({ tone: 'success', title, description }),
      error: (title, description) => notify({ tone: 'danger', title, description }),
      info: (title, description) => notify({ tone: 'info', title, description }),
    }),
    [notify],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 left-4 z-100 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 no-print"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => {
          const { className, Icon } = TONE_STYLES[toast.tone];
          return (
            <div
              key={toast.id}
              className={cn(
                'pointer-events-auto flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-sm shadow-elev-3',
                className,
              )}
              role={toast.tone === 'danger' ? 'alert' : 'status'}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-semibold">{toast.title}</p>
                {toast.description && (
                  <p className="text-xs leading-relaxed text-current/85">{toast.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"
                aria-label="إغلاق التنبيه"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast يجب أن يُستخدم داخل ToastProvider');
  return context;
}
