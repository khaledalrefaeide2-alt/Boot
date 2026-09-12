import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  /** عنوان فرعي صغير فوق العنوان — يسمّي المقطع الذي تنتمي إليه الصفحة */
  eyebrow,
  action,
  className,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        /*
          الترويسة تتنفّس أكثر: هامش سفلي أوسع وخطّ فاصل أبعد عن العنوان.
          والفراغ هنا ليس ذوقاً — هو ما يفصل «عنوان الصفحة» عن «أوّل بطاقة»
          فلا يقرأهما العين كتلةً واحدة. والنموذج المرجعي كلّه مبنيّ على
          هذا: مقاطع يفصلها فراغ لا خطوط.
        */
        'mb-7 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-border pb-5',
        className,
      )}
    >
      <div className="space-y-1">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        {/*
          العنوان بوزن ثقيل وتتبّع سالب خفيف. والسالب هنا 0.015em لا 0.035em
          التي في المواصفة: تلك مقيسة على حرف لاتيني منفصل، والحرف العربي متصل
          فتضييقه يقارب النقاط ويُلصق الكاف بالميم.
        */}
        <h1 className="text-2xl font-bold tracking-[-0.015em] text-heading sm:text-[1.75rem]">
          {title}
        </h1>
        {description && <p className="max-w-prose text-sm text-muted-foreground">{description}</p>}
      </div>
      {/*
        الإجراءات تُصفّ من طرف السطر وتُحاذى أسفلَ العنوان لا أعلاه.
        محاذاة الأعلى كانت تُعلّق الأزرار في فراغ فوق سطر الوصف؛ ومحاذاة
        الأسفل تضعها على خطّ أساس واحد مع العنوان، فيبدو الصفّ مستوياً.
      */}
      {action && <div className="flex flex-wrap items-center gap-2.5 no-print">{action}</div>}
    </div>
  );
}
