import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  /** عنوان فرعي صغير فوق العنوان — يسمّي المقطع الذي تنتمي إليه الصفحة */
  eyebrow,
  /** عنصر يتصدّر العنوان — صورة حساب أو أيقونة قسم */
  leading,
  action,
  /**
   * شريطٌ استعراضي خلف الترويسة — للشاشة الأولى وحدها.
   *
   * ★ ولا صورة فيه.
   *
   *   المنصة داخلية وقد تعمل على شبكة معزولة، وصورةٌ في الترويسة تعني
   *   طلباً ثقيلاً في أوّل ما يُفتح، وتعني أنّ تغيير الهوية يمرّ بمصمّم
   *   لا بملفّ رموز. والتدرّج يعطي الأثر نفسه بلا بايتٍ واحد، ويتبع
   *   السمتين تلقائياً.
   *
   *   ولا يُستعمل في شاشات العمل: الكثافة هناك مقصودة، وشريطٌ استعراضي
   *   فوق كلّ جدول يدفع الصفّ الأوّل خارج الشاشة في عملٍ يُقرأ ساعات.
   */
  hero = false,
  className,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  leading?: React.ReactNode;
  action?: React.ReactNode;
  hero?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-5 flex flex-wrap items-start justify-between gap-3',
        hero
          ? [
              'relative overflow-hidden rounded-2xl px-5 py-6 sm:px-6',
              'bg-gradient-to-bl from-olive-100 via-surface to-surface',
              'dark:from-olive-100 dark:via-surface dark:to-surface dark:border dark:border-border',
            ]
          : 'border-b border-border pb-4',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        <div className="min-w-0 space-y-1">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        {/*
          العنوان بوزن ثقيل وتتبّع سالب خفيف. والسالب هنا 0.015em لا 0.035em
          التي في المواصفة: تلك مقيسة على حرف لاتيني منفصل، والحرف العربي متصل
          فتضييقه يقارب النقاط ويُلصق الكاف بالميم.
        */}
        <h1
          className={cn(
            'font-bold tracking-[-0.015em] text-heading',
            hero ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl',
          )}
        >
          {title}
        </h1>
          {description && (
            <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="flex flex-wrap items-center gap-2 no-print">{action}</div>}
    </div>
  );
}
