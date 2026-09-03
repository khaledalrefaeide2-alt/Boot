'use client';

import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, useId } from 'react';
import { cn } from '@/lib/utils';

const controlBase =
  'w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground transition-colors placeholder:text-subtle-foreground focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-70';

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
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, wrapperClassName, id, required, ...props },
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
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(controlBase, 'h-9', error && 'border-danger', className)}
        {...props}
      />
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
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className, wrapperClassName, id, required, children, ...props },
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
      <select
        ref={ref}
        id={selectId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(controlBase, 'h-9 cursor-pointer', error && 'border-danger', className)}
        {...props}
      >
        {children}
      </select>
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
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border-strong text-primary accent-[var(--primary)]"
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
