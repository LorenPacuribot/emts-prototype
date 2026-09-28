import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/features/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark" | "success";
type Size = "sm" | "md" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white shadow-sm shadow-brand/30 hover:bg-brand-dark",
  secondary: "bg-white text-ink border border-line hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50",
  dark: "bg-ink text-white hover:bg-slate-800",
  success: "bg-emerald-600 text-white hover:bg-emerald-700",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-[13px] gap-2",
  icon: "h-8 w-8 justify-center",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center rounded-lg font-semibold whitespace-nowrap transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    />
  );
});
