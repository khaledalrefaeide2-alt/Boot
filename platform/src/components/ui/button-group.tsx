'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/*
 * توزيع الأزرار.
 *
 * المسافة ليست تجميلاً بل تصنيف: 8px تقول «هذان إجراءان من عائلة واحدة»،
 * و16px تقول «هاتان مجموعتان مختلفتان». وحين تتساوى المسافتان تصير صفّاً
 * من الأزرار بلا بنية، فيقرؤه المستخدم واحداً واحداً بدل أن يقرأه مجموعات.
 */

export interface ButtonGroupProps {
  children: ReactNode;
  className?: string;
  /**
   * التكديس على الجوال.
   *
   * أزرار الإجراءات على شاشة ضيّقة تتزاحم فتصير أهدافاً أصغر من 44px،
   * فتُكدَّس بعرض كامل والأساسيُّ أعلاها — وهو أقرب ما يكون إلى الإبهام.
   * أما أزرار شريط الأدوات فلا تُكدَّس: صفٌّ من ستة مرشِّحات مكدَّس يملأ
   * الشاشة قبل أن يصل المحتوى.
   */
  stack?: boolean;
  align?: 'start' | 'end' | 'between';
}

/** مجموعة إجراءات متجاورة — 8px بينها */
export function ButtonGroup({ children, className, stack = false, align = 'start' }: ButtonGroupProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2',
        align === 'end' && 'justify-end',
        align === 'between' && 'justify-between',
        /*
           التكديس يقلب الترتيب البصري لا ترتيب الشيفرة: الأساسيّ يُكتب
           أولاً في DOM ليأخذه التنقّل بلوحة المفاتيح أولاً، ويظهر أعلى
           الكومة على الجوال — فيتطابق الترتيبان بدل أن يتعارضا.
        */
        stack && 'max-sm:flex-col max-sm:items-stretch max-sm:[&>*]:w-full',
        className,
      )}
    >
      {children}
    </div>
  );
}

/*
 * شريط إجراءات بمجموعتين: البانية على جهة البداية، والهادمة معزولة في
 * الطرف المقابل.
 *
 * العزل ليس ترتيباً جمالياً: «حذف» بجوار «حفظ» بمقاسٍ واحد ولون قريب
 * يُضغط سهواً، والمسافة هي ما يمنع ذلك حين تخطئ اليد لا حين ينتبه الذهن.
 */
export function ActionBar({
  children,
  destructive,
  className,
  stack = true,
}: {
  children: ReactNode;
  destructive?: ReactNode;
  className?: string;
  stack?: boolean;
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-4', className)}>
      <ButtonGroup stack={stack}>{children}</ButtonGroup>
      {destructive && <div className="flex items-center">{destructive}</div>}
    </div>
  );
}

/**
 * تذييل نموذج أو نافذة: فاصل علوي، حشوة 16px، وأزرار md.
 *
 * الفاصل يقول إن ما تحته قرارٌ لا حقلٌ آخر. وبدونه يبدو زرّ «حفظ» حقلاً
 * أخيراً في النموذج فيُتجاوز بالنظر.
 */
export function FormFooter({
  children,
  destructive,
  className,
}: {
  children: ReactNode;
  destructive?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mt-4 border-t border-border pt-4', className)}>
      <ActionBar destructive={destructive}>{children}</ActionBar>
    </div>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

/**
 * المجموعة المجزّأة — تبديل بين خيارات يستبعد بعضها بعضاً.
 *
 * ليست أزراراً: الزرّ يفعل شيئاً، وهذه تختار حالة. ولذلك `role="radiogroup"`
 * لا مجموعة أزرار — الفرق يسمعه مستخدم قارئ الشاشة، فيُقال له «واحد من
 * ثلاثة» لا «زرّ… زرّ… زرّ».
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  size = 'md',
  variant = 'panel',
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  label: string;
  className?: string;
  size?: 'sm' | 'md';
  /**
   * `panel` — حاوية بحدّ والخيار النشط أبيض داخلها. لخيارين أو ثلاثة.
   *
   * `pills` — بلا حاوية، والخيار النشط وحده ممتلئ. لصفٍّ طويل من الخيارات
   * يلتفّ على الشاشات الضيّقة: حاويةٌ تلتفّ حول عشرة خيارات تصير مستطيلاً
   * غريباً، أما الأقراص فتلتفّ كما يلتفّ النصّ.
   */
  variant?: 'panel' | 'pills';
}) {
  const pills = variant === 'pills';

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        pills
          ? 'flex flex-wrap items-center gap-2'
          : cn(
              'inline-flex items-stretch rounded-control border border-border bg-surface-2',
              size === 'sm' ? 'h-control-compact p-0.5' : 'h-control p-1',
            ),
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center justify-center gap-2 font-semibold leading-none whitespace-nowrap',
              'transition-[background-color,color,box-shadow] duration-150 ease-out',
              '[&_svg]:size-[18px] [&_svg]:shrink-0',
              'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--ring)]',
              /*
               * الأقراص بارتفاع الزرّ المضغوط، والمجزّأة تملأ حاويتها: الحاوية
               * هي التي تحمل الارتفاع (44 أو 36) فيستوي الصفّ مع الحقول.
               */
              pills
                ? 'h-control-compact rounded-full px-4 text-sm'
                : cn('rounded-[0.5rem] text-sm', size === 'sm' ? 'px-3' : 'px-4'),
              pills
                ? active
                  ? 'bg-brand-700 text-primary-foreground shadow-elev-1'
                  : 'bg-transparent text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                : active
                  ? 'bg-surface text-primary-text shadow-elev-1'
                  : 'bg-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
