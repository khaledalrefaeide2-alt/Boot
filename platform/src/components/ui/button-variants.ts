/*
 * أنواعُ الزرّ مفصولةٌ عن مكوّنه — لأنّ الخادم يحتاجها والمكوّن للعميل.
 *
 * ★ والسبب خطأٌ حقيقيّ لا تنظيم.
 *
 *   `button.tsx` يبدأ بـ`use client`، فكلُّ ما فيه مكوّنٌ عميل. ودالّةٌ
 *   في وحدةٍ كهذه لا تُنادى من الخادم أبداً: Next يرفضها وقتَ التشغيل
 *   بـ«Attempted to call buttonVariants() from the server». ولا يُكشف
 *   ذلك بالأنواع ولا بالبناء — بل بفتح الصفحة.
 *
 *   وصفحةُ «غير موجود» مكوّنُ خادم، وفيها رابطٌ بهيئة زرّ. فتُفصل
 *   الأنواع إلى وحدةٍ محايدة يقرأها الاثنان، ويبقى المكوّن كما كان.
 */
import { cva, type VariantProps } from 'class-variance-authority';

/*
 * نظام الأزرار.
 *
 * الأساس واحد لكلّ زرّ: inline-flex، توسيط، وزن 600، حدّ 1px شفاف يحجز
 * مكانه فلا يقفز النصّ حين يظهر حدُّ نوعٍ آخر، زاوية 10px، ارتفاع سطر 1
 * (لأنّ ارتفاع الزرّ مضبوطٌ بالارتفاع لا بالحشوة الرأسية)، وبلا التفاف.
 *
 * ★ والأيقونة يضبطها الزرّ لا من يكتبها.
 *
 *   كانت كلّ شاشةٍ تكتب مقاس أيقونتها (`h-4 w-4`، `h-3.5 w-3.5`…)، فصار
 *   في صفٍّ واحد زرّان بأيقونتين مختلفتين. والآن يفرض الزرّ مقاسها من
 *   رمزٍ يضعه صنف المقاس (`--btn-icon`): 20px في القياسي والكبير، و18px
 *   في المضغوط — أيّاً كان ما كُتب على الأيقونة نفسها.
 *
 * الأنواع مرتّبة بالأولوية لا بالذوق: رئيسيٌّ واحد في السياق، ثم ثانوي،
 * ثم شبح. و«المحدَّد» (outline) زرٌّ ثانويٌّ يحمل لون الهوية — لمفتاحٍ
 * يُفتح ويُغلق كـ«فلاتر إضافية». و«المتدرّج» (tonal) للإجراء المتكرّر في
 * أشرطة الأدوات: يُرى بلا أن يزاحم الرئيسي.
 */

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center whitespace-nowrap',
    'rounded-control border border-transparent font-semibold leading-none',
    'transition-[background-color,color,box-shadow,border-color] duration-150 ease-out',
    'active:scale-[.98]',
    '[&_svg]:shrink-0 [&_svg]:size-[var(--btn-icon)]',
    /*
     * حلقة التركيز حلقتان: بلون السطح تفصل الزرّ عمّا تحته، ثم تركوازية
     * تُرى. وحلقةٌ واحدة على زرٍّ ممتلئ داكن تلتصق بحافّته فلا تكاد تُميَّز.
     */
    'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--ring)]',
    'disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100',
  ].join(' '),
  {
    variants: {
      variant: {
        primary: [
          'bg-brand-700 text-primary-foreground shadow-elev-1',
          'hover:bg-brand-800 active:bg-brand-900',
          'disabled:bg-disabled-bg disabled:text-disabled-text',
        ].join(' '),
        /*
         * الثانوي أبيضُ بحدٍّ محايد ونصٍّ بلون المتن — كزرّ «طباعة» في
         * المرجع. والحدّ بنسبة 3:1 لا شعرة: خلفيّتُه خلفيّةُ البطاقة
         * نفسها، فالحدُّ هو الدليل الوحيد على أنّ هنا زرّاً.
         */
        secondary: [
          'bg-surface text-foreground border-border-input shadow-elev-1',
          'hover:bg-surface-2 active:bg-surface-3',
          'disabled:bg-disabled-bg disabled:text-disabled-text disabled:border-transparent',
        ].join(' '),
        outline: [
          'bg-surface text-primary-text border-brand-700',
          'hover:bg-brand-50 active:bg-brand-100',
          'disabled:bg-disabled-bg disabled:text-disabled-text disabled:border-transparent',
        ].join(' '),
        tonal: [
          'bg-brand-100 text-brand-900',
          'hover:bg-brand-200 active:bg-brand-300',
          'disabled:bg-disabled-bg disabled:text-disabled-text',
        ].join(' '),
        /*
         * الشبح محايد: أدوات الشريط العلوي وإجراءات الصفوف تقف بالعشرات،
         * ولو حمل كلٌّ منها لون الهوية لضاع الإجراء الرئيسي بينها.
         */
        ghost: [
          'bg-transparent text-muted-foreground',
          'hover:bg-surface-2 hover:text-foreground active:bg-surface-3',
          // الشبح والرابط يفقدان النصّ وحده — خلفيةٌ رمادية عليهما تخترع سطحاً لم يكن
          'disabled:bg-transparent disabled:text-disabled-text',
        ].join(' '),
        danger: [
          'bg-danger text-danger-foreground shadow-elev-1',
          'hover:bg-danger-hover active:bg-danger-active',
          'disabled:bg-disabled-bg disabled:text-disabled-text',
        ].join(' '),
        link: [
          'bg-transparent text-primary-text underline underline-offset-4',
          'hover:text-brand-900 active:text-brand-900',
          'disabled:bg-transparent disabled:text-disabled-text disabled:no-underline',
        ].join(' '),
      },
      /*
       * المقاسات من المواصفة: ارتفاع | حشوة أفقية | خطّ | أيقونة | فجوة.
       *
       *   القياسي  44 | 16 | 14 | 20 | 8 — إجراءات الصفحات والنماذج والفلاتر
       *   المضغوط  36 | 12 | 14 | 18 | 8 — الجداول والمناطق الكثيفة
       *   الكبير   48 | 20 | 16 | 20 | 8 — الإجراء البارز كالدخول
       *   الأيقوني 44 × 44 بأيقونة 20 — ومعه اسمٌ مقروء إلزاماً
       *
       * والارتفاع من رموز التحكّم (`h-control`…) لا رقمٌ هنا: الحقل
       * والقائمة المنسدلة يقرآن الرمز نفسه، فيستوي الصفّ بلا تنسيق.
       */
      size: {
        sm: 'h-control-compact min-w-16 gap-2 px-3 text-sm [--btn-icon:18px]',
        md: 'h-control min-w-22 gap-2 px-4 text-sm [--btn-icon:20px]',
        lg: 'h-control-lg min-w-30 gap-2 px-5 text-base [--btn-icon:20px]',
        'icon-sm': 'size-control-compact min-w-0 p-0 [--btn-icon:18px]',
        icon: 'size-control min-w-0 p-0 [--btn-icon:20px]',
        'icon-lg': 'size-control-lg min-w-0 p-0 [--btn-icon:20px]',
      },
      fullWidth: { true: 'w-full', false: '' },
    },
    /*
     * الرابط بلا حشوة ولا عرض أدنى ولا ارتفاع: هو نصٌّ في جملة لا صندوق،
     * وإعطاؤه صندوقاً يجعله يفتح فجوةً في السطر الذي يقع فيه.
     */
    compoundVariants: [
      { variant: 'link', size: 'sm', class: 'h-auto min-w-0 px-0' },
      { variant: 'link', size: 'md', class: 'h-auto min-w-0 px-0' },
      { variant: 'link', size: 'lg', class: 'h-auto min-w-0 px-0' },
    ],
    defaultVariants: { variant: 'primary', size: 'md', fullWidth: false },
  },
);

export { buttonVariants };
export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;
