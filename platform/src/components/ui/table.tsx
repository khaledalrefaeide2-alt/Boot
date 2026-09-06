import { cn } from '@/lib/utils';

/** غلاف يمنع تمرير الصفحة أفقياً — الجدول وحده يتمرر */
export function TableWrapper({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  // min-w-0 تسمح للحاوية بالانكماش فيبقى التمرير الأفقي داخل الجدول وحده
  return <div className={cn('w-full min-w-0 overflow-x-auto', className)} {...props} />;
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full min-w-max border-collapse text-sm', className)} {...props} />;
}

/*
 * الترويسة تُختم بحدّ أقوى من فواصل الصفوف. الفرق ليس زينة: في جدول بأحد
 * عشر عموداً تحتاج العين خطاً واحداً تعرف منه أين ينتهي اسم العمود ويبدأ
 * الصف الأول، وحدّ بسماكة الفواصل نفسها لا يعطيها ذلك.
 */
export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('border-b-2 border-border-strong bg-surface-2', className)} {...props} />;
}

/*
 * تخطيط الصفوف بلونين متناوبين.
 *
 * الفاصل الأفقي وحده يكفي لجدول من ثلاثة أعمدة. أما جدول الحسابات فأحد
 * عشر عموداً بعرض شاشة كاملة، والعين تقفز من اسم الحساب في أقصى اليمين
 * إلى تاريخ آخر استخراج في أقصى اليسار فتفقد السطر في الطريق. الشريط
 * الملوّن يمسك السطر بصرياً عبر العرض كله.
 */
export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={cn('divide-y divide-border [&>tr:nth-child(even)]:bg-surface-2/40', className)}
      {...props}
    />
  );
}

/*
 * لون التحويم مشتقّ من اللون الأساسي لا من لون السطح: لو كان درجةً من
 * الرمادي نفسه لصار صفٌّ محوَّم عليه شبيهاً بصفٍّ مخطّط عادي، فيضيع
 * التمييز الذي وُضع من أجله.
 */
export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('transition-colors hover:bg-primary-soft/70', className)}
      {...props}
    />
  );
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
        'whitespace-nowrap px-3 py-2.5 text-start text-xs font-semibold tracking-[0.01em] text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2.5 align-middle text-foreground', className)} {...props} />;
}
