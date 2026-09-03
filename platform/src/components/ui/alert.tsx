import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

const TONES = {
  info: { className: 'bg-info-soft text-info border-info/25', Icon: Info },
  success: { className: 'bg-success-soft text-success border-success/25', Icon: CheckCircle2 },
  warning: { className: 'bg-warning-soft text-warning border-warning/25', Icon: TriangleAlert },
  danger: { className: 'bg-danger-soft text-danger border-danger/25', Icon: AlertCircle },
} as const;

export function Alert({
  tone = 'info',
  title,
  children,
  className,
  role,
}: {
  tone?: keyof typeof TONES;
  title?: string;
  children?: React.ReactNode;
  className?: string;
  role?: string;
}) {
  const { className: toneClass, Icon } = TONES[tone];

  return (
    <div
      className={cn('flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-sm', toneClass, className)}
      role={role ?? (tone === 'danger' ? 'alert' : 'status')}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="space-y-1 leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-current/90">{children}</div>}
      </div>
    </div>
  );
}
