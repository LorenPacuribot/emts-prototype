import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { Check } from "lucide-react";
import { cn } from "@/features/lib/cn";

const base =
  "w-full rounded-lg border bg-white px-3 text-[13px] text-ink placeholder:text-slate-400 transition-colors " +
  "focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand disabled:bg-slate-50 disabled:text-slate-400";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(base, "h-10", invalid ? "border-red-400" : "border-line", className)} aria-invalid={invalid || undefined} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea(
  { className, invalid, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cn(base, "min-h-20 py-2", invalid ? "border-red-400" : "border-line", className)} aria-invalid={invalid || undefined} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select(
  { className, invalid, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(base, "h-10 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%222%22><path d=%22m4 6 4 4 4-4%22/></svg>')] bg-[right_10px_center] bg-no-repeat pr-8", invalid ? "border-red-400" : "border-line", className)}
      aria-invalid={invalid || undefined}
      {...rest}
    >
      {children}
    </select>
  );
});

/** Label + control + hint/error. */
export function Field({ label, htmlFor, required, error, hint, children, className }: {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-[12px] font-semibold text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {error ? <p className="text-[11.5px] font-medium text-red-600">{error}</p> : hint ? <p className="text-[11.5px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({ checked, onCheckedChange, disabled, id, label }: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  id?: string;
  label?: ReactNode;
}) {
  return (
    <label className={cn("inline-flex items-center gap-2 text-[13px]", disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
      <CheckboxPrimitive.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-300 bg-white data-[state=checked]:border-brand data-[state=checked]:bg-brand"
      >
        <CheckboxPrimitive.Indicator>
          <Check className="h-3 w-3 text-white" strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label}
    </label>
  );
}

export function Switch({ checked, onCheckedChange, disabled, label }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; label?: ReactNode }) {
  return (
    <label className={cn("inline-flex items-center gap-2 text-[13px]", disabled && "opacity-50")}>
      <SwitchPrimitive.Root
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className="relative h-5 w-9 rounded-full bg-slate-200 transition-colors data-[state=checked]:bg-brand"
      >
        <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
      </SwitchPrimitive.Root>
      {label}
    </label>
  );
}
