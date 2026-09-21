import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  /** عنوان فرعي صغير فوق العنوان — يسمّي المقطع الذي تنتمي إليه الصفحة */
  eyebrow,
  /** عنصر يتصدّر العنوان — صورة حساب أو أيقونة قسم */
  leading,
  action,
  className,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  leading?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4',
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
        <h1 className="text-xl font-bold tracking-[-0.015em] text-heading sm:text-2xl">{title}</h1>
          {description && (
            <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="flex flex-wrap items-center gap-2 no-print">{action}</div>}
    </div>
  );
}
