'use client';

/*
  Form controls: Label, Field (label + hint + error wrapper), Input,
  Textarea, NativeSelect, Select (Radix), Switch, Checkbox.
  The live app uses small uppercase labels ("BASE LABOR RATE ($/HR)") and
  inputs with a clear (x) button.
*/
import React from 'react';
import * as RSelect from '@radix-ui/react-select';
import * as RSwitch from '@radix-ui/react-switch';
import * as RCheckbox from '@radix-ui/react-checkbox';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Label({ children, required, className, htmlFor }: { children: React.ReactNode; required?: boolean; className?: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn('block text-[11px] font-bold uppercase tracking-wide text-gray-600 mb-1.5', className)}>
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

export function Field({
  label, required, hint, error, children, className,
}: { label?: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && <Label required={required}>{label}</Label>}
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

const inputBase =
  'w-full h-10 rounded-lg border bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-primary-400/40 focus:border-primary-400 disabled:bg-gray-50 disabled:text-gray-500';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  /** Shows an (x) that clears the value, like the live settings forms */
  onClear?: () => void;
  leftIcon?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, onClear, leftIcon, suffix, ...rest },
  ref,
) {
  const hasValue = rest.value !== undefined && rest.value !== '' && rest.value !== null;
  return (
    <div className="relative">
      {leftIcon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{leftIcon}</span>}
      <input
        ref={ref}
        className={cn(
          inputBase,
          invalid ? 'border-red-400 focus:ring-red-300/40 focus:border-red-400' : 'border-gray-200',
          leftIcon && 'pl-9',
          (onClear || suffix) && 'pr-9',
          className,
        )}
        aria-invalid={invalid || undefined}
        {...rest}
      />
      {onClear && hasValue && !rest.disabled && (
        <button type="button" onClick={onClear} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700" aria-label="Clear">
          <X className="w-4 h-4" />
        </button>
      )}
      {suffix && !onClear && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{suffix}</span>}
    </div>
  );
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(inputBase, 'h-auto min-h-[96px] py-2', invalid ? 'border-red-400' : 'border-gray-200', className)}
        {...rest}
      />
    );
  },
);

/** Plain <select>, handy inside tables where a popover would be clumsy. */
export function NativeSelect({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(inputBase, 'border-gray-200 appearance-none pr-8', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
    </div>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

/** Radix select. Pass options and value; onChange gets the new value. */
export function Select({
  value, onChange, options, placeholder = 'Select…', className, icon, disabled, invalid, size = 'md',
}: {
  value?: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  invalid?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <RSelect.Root value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <RSelect.Trigger
        className={cn(
          'inline-flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 text-sm text-gray-800 shadow-sm',
          'focus:outline-none focus:ring-2 focus:ring-primary-400/40 data-[placeholder]:text-gray-400 disabled:opacity-60',
          invalid ? 'border-red-400' : 'border-gray-200',
          size === 'sm' ? 'h-9 text-xs font-semibold' : 'h-10',
          className,
        )}
      >
        <span className="flex items-center gap-2 truncate">
          {icon}
          <RSelect.Value placeholder={placeholder} />
        </span>
        <RSelect.Icon>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content position="popper" sideOffset={4} className="z-[200] min-w-[var(--radix-select-trigger-width)] max-h-72 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
          <RSelect.Viewport className="p-1">
            {options.map((o) => (
              <RSelect.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer select-none items-center rounded-md py-2 pl-8 pr-3 text-sm text-gray-700 outline-none data-[highlighted]:bg-primary-50 data-[highlighted]:text-primary-800"
              >
                <RSelect.ItemIndicator className="absolute left-2">
                  <Check className="w-4 h-4 text-primary-600" />
                </RSelect.ItemIndicator>
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <RSwitch.Root
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={label}
      className="relative h-5 w-9 shrink-0 rounded-full bg-gray-200 transition-colors data-[state=checked]:bg-primary-600 disabled:opacity-50"
    >
      <RSwitch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </RSwitch.Root>
  );
}

export function Checkbox({ checked, onChange, disabled, label, id }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: React.ReactNode; id?: string }) {
  return (
    <label className={cn('inline-flex items-center gap-2 text-sm text-gray-700', disabled ? 'opacity-50' : 'cursor-pointer')}>
      <RCheckbox.Root
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        disabled={disabled}
        className="flex h-4 w-4 items-center justify-center rounded border border-gray-300 bg-white data-[state=checked]:border-primary-600 data-[state=checked]:bg-primary-600"
      >
        <RCheckbox.Indicator>
          <Check className="h-3 w-3 text-white" strokeWidth={3} />
        </RCheckbox.Indicator>
      </RCheckbox.Root>
      {label}
    </label>
  );
}
