'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/*
 * الأزرار — على لغة النموذج المرجعي.
 *
 * أربعة قرارات تشرح الشكل:
 *
 * ١) مسطّحة بلا ظلّ. الظلّ في هذا النظام يقول «هذا السطح يرتفع عن ذاك»،
 *    وهي جملة تخصّ البطاقات والنوافذ لا الأزرار. زرٌّ بظلّ داخل بطاقة
 *    بظلّ يجعل الارتفاعين يتنافسان فلا يبقى لأيّهما معنى. والنموذج
 *    المرجعي كلّه مسطّح، وهذا سبب هدوئه.
 *
 * ٢) حشوة أفقية واسعة ونصّ صغير. هذه هي النسبة التي تجعل الزرّ يبدو
 *    مقصوداً لا منفوخاً: الفراغ حول الكلمة هو ما يعطيها الوزن، لا حجم
 *    الحرف. ولذلك كبرت الحشوة وبقي النصّ عند حدّه.
 *
 * ٣) بلا تباعد أحرف. النموذج المرجعي يباعد حروف عناوين أزراره، وهي حيلة
 *    لاتينية بحتة: العربية خطٌّ متّصل، وأيّ تباعد موجب يفكّ وصل الحروف
 *    فتقرأ «ت ص د ي ر» بدل «تصدير». فالوزن هنا يأتي من الحشوة والثخانة.
 *
 * ٤) active:scale-[.98] — ارتداد ضغط بمقدار 2%. أقلّ منه لا يُحسّ، وأكثر
 *    منه يُحرّك النص داخل الزر فيبدو مطاطياً لا مضغوطاً. وهو التغذية
 *    الراجعة الوحيدة المتاحة للمس، حيث لا تحويم أصلاً.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-sm font-semibold transition-[background-color,color,border-color,opacity] duration-200 active:scale-[.98] disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring whitespace-nowrap',
  {
    variants: {
      variant: {
        /*
          نصّ الزرّ الأساسي رمزٌ لا لونٌ مكتوب: الطين في السمة الداكنة
          فاتح فيحمل حبراً داكناً، وفي الفاتحة داكن فيحمل أبيض. ولو كُتب
          «أبيض» هنا لسقط أحدهما إلى 2:1 بلا أن يظهر في أيّ فحص تصريف.
        */
        primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        /*
          الثانوي إطارٌ على الفراغ لا سطحٌ مملوء — وهو ما يجعل الأساسي
          يبدو أساسياً. وعند التحويم يتلوّن الإطار والنصّ معاً بلون
          التفاعل، فيُقرأ التحويم بلا أن يتغيّر وزن الزرّ في الصفّ.
        */
        secondary:
          'border border-border-strong bg-transparent text-foreground hover:border-primary hover:text-primary',
        soft: 'bg-primary-soft text-primary-soft-foreground hover:brightness-110',
        ghost: 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
        danger: 'bg-danger text-danger-foreground hover:brightness-110',
        'danger-soft': 'bg-danger-soft text-danger hover:brightness-110',
        /*
          خطرٌ هادئ لصفوف الجداول.
          كان كلّ زرّ حذف في الشاشات يُكتب `ghost` ثمّ يُصبغ بـ
          `className="text-danger"` — تسع مرّات، كلٌّ منها نسخة يدوية
          تنكسر وحدها. صار للنغمة اسم، فتتبع النظام لا التذكّر.
        */
        'danger-ghost': 'text-danger hover:bg-danger-soft',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3.5 text-xs',
        md: 'h-10 px-5 text-sm',
        /*
          الكبير عند 48 بكسل لا 44: حدّ اللمس المريح 44، وهذا يتجاوزه
          بهامش، وهو مقاس الزرّ الوحيد في الشاشة العامّة حيث لا شيء
          يزاحمه على الانتباه.
        */
        lg: 'h-12 px-8 text-sm',
        icon: 'h-10 w-10',
        'icon-sm': 'h-8 w-8',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export { buttonVariants };
