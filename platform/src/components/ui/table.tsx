import { cn } from '@/lib/utils';

/** غلاف يمنع تمرير الصفحة أفقياً — الجدول وحده يتمرر */
export function TableWrapper({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  // min-w-0 تسمح للحاوية بالانكماش فيبقى التمرير الأفقي داخل الجدول وحده
  return <div className={cn('w-full min-w-0 overflow-x-auto', className)} {...props} />;
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full min-w-max border-collapse text-sm', className)} {...props} />;
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-surface-2', className)} {...props} />;
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-border', className)} {...props} />;
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('transition-colors hover:bg-surface-2/60', className)} {...props} />;
}

/*
 * `scope="col"` ليس تزييناً: بدونه يحسب المتصفح خلية الترويسة «خلية» عادية
 * لا «ترويسة عمود»، فلا يُعلن قارئ الشاشة اسم العمود مع كل قيمة في الجدول.
 * افتراضٌ يمكن تجاوزه بتمرير scope آخر لترويسة صف.
 */
export function TH({ className, scope = 'col', ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope={scope}
      className={cn(
        'whitespace-nowrap px-3 py-2.5 text-start text-xs font-semibold text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2.5 align-middle text-foreground', className)} {...props} />;
}
