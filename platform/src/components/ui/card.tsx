import { cn } from '@/lib/utils';

/**
 * البطاقة أساس كل الأقسام في الواجهة.
 *
 * `min-w-0` ضرورية لا تجميلية: عنصر الشبكة أو الفليكس عرضه الأدنى هو عرض
 * محتواه الطبيعي افتراضياً، فبطاقة تحوي جدولاً عريضاً ترفض الانكماش،
 * فيتمدد الجدول خارج الشاشة ويظهر تمرير أفقي في الصفحة كلها بدل أن ينحصر
 * التمرير داخل الجدول وحده.
 */
export function Card({
  className,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  /**
   * بطاقة تُنقر أو تحمل رابطاً — تُضيء حدّها وترتفع قليلاً عند التحويم.
   *
   * صريحة لا مستنتجة: التحويم وعدٌ بأن شيئاً سيحدث عند النقر، ووضعه على
   * بطاقة عرض ساكنة يجعل المستخدم ينقرها ولا يحدث شيء — وهو أسوأ من بطاقة
   * لا تتحرك أصلاً.
   */
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-card border border-border bg-surface shadow-elev-1',
        interactive && 'card-interactive',
        className,
      )}
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
        'flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5',
        className,
      )}
      {...props}
    >
      <div className="space-y-0.5">
        {title && (
          <h2 className="text-base font-bold text-heading">
            {title}
          </h2>
        )}
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {/*
        الإجراءات تلتفّ ولا تفيض: بطاقةٌ في عمودٍ ضيّق (ثلث الشاشة على
        1024px) لا تتّسع لزرّين بجانب العنوان، فيدفعان حافّتها خارج الصفحة.
      */}
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4 sm:p-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-b-card border-t border-border bg-surface-2/60 px-4 py-3 sm:px-5', className)}
      {...props}
    />
  );
}
