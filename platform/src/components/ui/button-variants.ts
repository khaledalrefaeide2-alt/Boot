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
 * الأساس واحد لكل زرّ: inline-flex، توسيط، وزن 600، حدّ 1px شفاف يحجز
 * مكانه فلا يقفز النصّ حين يظهر حدُّ نوعٍ آخر، زاوية 8px، ارتفاع سطر 1
 * (لأن ارتفاع الزرّ مضبوطٌ بالارتفاع لا بالحشوة الرأسية)، وبلا التفاف.
 *
 * الأنواع الستة مرتّبة بالأولوية لا بالذوق: أساسيٌّ واحد في السياق، ثم
 * ثانوي، ثم شبح. والمتدرّج (tonal) للإجراء المتكرّر في أشرطة الأدوات —
 * يُرى بلا أن يزاحم الأساسي.
 */

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center whitespace-nowrap',
    'rounded-lg border border-transparent font-semibold leading-none',
    'transition-[background-color,color,box-shadow,border-color] duration-150',
    'active:scale-[.98]',
    /*
     * حلقة التركيز حلقتان: بيضاء تفصل الزرّ عمّا تحته، ثم زيتونية تُرى.
     * وحلقةٌ واحدة على زرّ ممتلئ داكن تلتصق بحافّته فلا تكاد تُميَّز.
     */
    'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--olive-500)]',
    'disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100',
  ].join(' '),
  {
    variants: {
      variant: {
        primary: [
          'bg-olive-700 text-white shadow-elev-1',
          'hover:bg-olive-800 active:bg-olive-900',
          'disabled:bg-disabled-bg disabled:text-disabled-text',
        ].join(' '),
        secondary: [
          'bg-surface text-olive-800 border-olive-400 shadow-elev-1',
          'hover:bg-olive-50 hover:border-olive-500 active:bg-olive-100',
          'disabled:bg-disabled-bg disabled:text-disabled-text disabled:border-transparent',
        ].join(' '),
        tonal: [
          'bg-olive-100 text-olive-900',
          'hover:bg-olive-200 active:bg-olive-300',
          'disabled:bg-disabled-bg disabled:text-disabled-text',
        ].join(' '),
        ghost: [
          'bg-transparent text-olive-700',
          'hover:bg-olive-50 active:bg-olive-100',
          // الشبح والرابط يفقدان النصّ وحده — خلفيةٌ رمادية عليهما تخترع سطحاً لم يكن
          'disabled:bg-transparent disabled:text-disabled-text',
        ].join(' '),
        danger: [
          'bg-danger text-danger-foreground shadow-elev-1',
          'hover:bg-danger-hover active:bg-danger-active',
          'disabled:bg-disabled-bg disabled:text-disabled-text',
        ].join(' '),
        link: [
          'bg-transparent text-olive-700 underline underline-offset-4',
          'hover:text-olive-800 active:text-olive-900',
          'disabled:bg-transparent disabled:text-disabled-text disabled:no-underline',
        ].join(' '),
      },
      size: {
        sm: 'h-8 min-w-16 gap-1.5 px-3 text-[13px] [--btn-icon:16px]',
        md: 'h-10 min-w-22 gap-2 px-4 text-sm [--btn-icon:18px]',
        lg: 'h-12 min-w-30 gap-2 px-5 text-base [--btn-icon:20px]',
        'icon-sm': 'h-8 w-8 min-w-0 p-0 [--btn-icon:16px]',
        icon: 'h-10 w-10 min-w-0 p-0 [--btn-icon:18px]',
        'icon-lg': 'h-12 w-12 min-w-0 p-0 [--btn-icon:20px]',
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
