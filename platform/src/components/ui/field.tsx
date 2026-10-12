'use client';

import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, useId } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/*
 * أساسُ كلّ عنصر إدخال: ارتفاع 44px وزاوية 10px — كالزرّ تماماً.
 *
 * ★ والتساوي شرطٌ لا تجميل.
 *
 *   شريط الفلاتر يضع حقل البحث وأربع قوائم وزرّاً في صفٍّ واحد. فإن كان
 *   الحقل 40 والزرّ 44 انكسر خطُّ الصفّ الأسفل، وقرأته العين عناصرَ
 *   متفرّقة لا شريطاً واحداً. والرمزان (`h-control` و`rounded-control`)
 *   هما ما يقرؤه الزرّ أيضاً، فلا يفترقان.
 */
const controlBase =
  'w-full rounded-control border border-border-input bg-surface px-3 text-sm text-foreground transition-[border-color,box-shadow] duration-150 placeholder:text-subtle-foreground hover:border-subtle-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_var(--primary),0_0_0_4px_var(--primary-soft)] disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-70';

/** أيقونةٌ في بداية الحقل — مقاسها ثابت وموضعها منطقيّ (يمين في العربية) */
function LeadingIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <Icon
      className="pointer-events-none absolute start-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-subtle-foreground"
      aria-hidden
    />
  );
}

export interface FieldWrapperProps {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
  htmlFor?: string;
}

export function FieldWrapper({
  label,
  hint,
  error,
  required,
  className,
  children,
  htmlFor,
}: FieldWrapperProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
          {label}
          {required && (
            <span className="text-danger" aria-hidden>
              {' '}
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string | null;
  wrapperClassName?: string;
  /** أيقونة في بداية الحقل — بحثٌ، تاريخٌ… */
  icon?: LucideIcon;
  /**
   * أزرارٌ داخل الحقل في نهايته — كزرّ البحث وزرّ التوسيع.
   *
   * داخلُه لا بجانبه: زرّان بجانب الحقل يأخذان مئة بكسل من صفّ الفلاتر،
   * فيُنزلان آخر عنصرٍ فيه إلى سطرٍ وحده. وداخلُه يُبقي الصفّ صفّاً،
   * والزرّان بارتفاع 36 داخل حقلٍ بارتفاع 44.
   */
  trailing?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, wrapperClassName, id, required, icon, trailing, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <FieldWrapper
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={wrapperClassName}
      htmlFor={inputId}
    >
      <div className="relative">
        {icon && <LeadingIcon icon={icon} />}
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          className={cn(controlBase, 'h-control', icon && 'ps-10', error && 'border-danger', className)}
          {...props}
        />
        {trailing && (
          <div className="absolute inset-y-1 end-1 flex items-center gap-0.5">{trailing}</div>
        )}
      </div>
    </FieldWrapper>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string | null;
  wrapperClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, wrapperClassName, id, required, ...props },
  ref,
) {
  const generatedId = useId();
  const areaId = id ?? generatedId;

  return (
    <FieldWrapper
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={wrapperClassName}
      htmlFor={areaId}
    >
      <textarea
        ref={ref}
        id={areaId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(controlBase, 'min-h-20 py-2 leading-relaxed', error && 'border-danger', className)}
        {...props}
      />
    </FieldWrapper>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string | null;
  wrapperClassName?: string;
  /** أيقونة في بداية القائمة — تقول نوع ما يُختار قبل قراءته */
  icon?: LucideIcon;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className, wrapperClassName, id, required, children, icon, ...props },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <FieldWrapper
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={wrapperClassName}
      htmlFor={selectId}
    >
      {/*
        السهم مرسومٌ لا سهمُ المتصفّح.

        سهمُ المتصفّح يختلف بين النظامين، ويقع في الجهة الفيزيائية لا
        المنطقية في بعضها — فيلتصق بالنصّ العربي. والسهم المرسوم في نهاية
        القائمة (يسارها في العربية) كما في المرجع، وبلون النصّ الثانوي.
      */}
      <div className="relative">
        {icon && <LeadingIcon icon={icon} />}
        <select
          ref={ref}
          id={selectId}
          required={required}
          aria-invalid={error ? true : undefined}
          className={cn(
            controlBase,
            'h-control cursor-pointer appearance-none pe-9',
            icon && 'ps-10',
            error && 'border-danger',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground"
          aria-hidden
        />
      </div>
    </FieldWrapper>
  );
});

export function Checkbox({
  label,
  description,
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  const generatedId = useId();
  const boxId = id ?? generatedId;

  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <input
        type="checkbox"
        id={boxId}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border-input text-primary-text accent-[var(--primary)]"
        {...props}
      />
      <div className="space-y-0.5">
        <label htmlFor={boxId} className="cursor-pointer text-sm font-medium text-foreground">
          {label}
        </label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}
