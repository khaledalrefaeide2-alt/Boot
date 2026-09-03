import { AlertTriangle, Inbox, Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** حالة التحميل — تُستخدم داخل البطاقات والجداول */
export function LoadingState({
  message = 'جارٍ التحميل…',
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

/** حالة الفراغ — لا توجد بيانات بعد */
export function EmptyState({
  title = 'لا توجد بيانات',
  description,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 px-6 py-14 text-center', className)}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
        <Icon className="h-5 w-5 text-subtle-foreground" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="max-w-md text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** حالة الخطأ */
export function ErrorState({
  title = 'تعذّر تحميل البيانات',
  description,
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 px-6 py-14 text-center', className)}
      role="alert"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft">
        <AlertTriangle className="h-5 w-5 text-danger" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="max-w-md text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** هيكل تحميل بعدد أسطر */
export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2 p-4', className)} aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton h-9 w-full" />
      ))}
    </div>
  );
}

/** هيكل تحميل لبطاقات الإحصاء */
export function SkeletonCards({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-4', className)} aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="skeleton h-24 w-full" />
      ))}
    </div>
  );
}
