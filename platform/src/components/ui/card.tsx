import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-border bg-surface shadow-xs', className)}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  title,
  description,
  action,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5',
        className,
      )}
      {...props}
    >
      <div className="space-y-0.5">
        {title && <h2 className="text-sm font-semibold text-foreground sm:text-base">{title}</h2>}
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 py-4 sm:px-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('border-t border-border bg-surface-2/50 px-4 py-3 sm:px-5', className)}
      {...props}
    />
  );
}
