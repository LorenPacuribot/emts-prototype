import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/features/lib/cn";

/*
  Matches the live kit (components/ui/button.tsx): same colours, sizes,
  radius, font size and shadow. Two differences are kept on purpose so
  existing calls do not change meaning:
  - the default variant is still "secondary";
  - "danger" is still the red outline. Use "danger-solid" for a filled
    red destructive confirmation (the live kit's "danger").
*/
type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "danger-solid" | "dark" | "success";
type Size = "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";

const variants: Record<Variant, string> = {
  primary: "bg-primary-600 text-white hover:bg-primary-700 shadow-md shadow-primary-500/20 border border-primary-600",
  secondary: "bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 shadow-sm",
  outline: "bg-transparent text-primary-700 hover:bg-primary-50 border border-primary-200",
  ghost: "bg-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-100 border border-transparent",
  danger: "bg-white text-red-600 hover:bg-red-50 border border-red-200",
  "danger-solid": "bg-red-600 text-white hover:bg-red-700 border border-red-600 shadow-md shadow-red-500/20",
  dark: "bg-gray-900 text-white hover:bg-gray-800 border border-gray-900",
  success: "bg-green-600 text-white hover:bg-green-700 border border-green-600",
};

const sizes: Record<Size, string> = {
  xs: "h-7 px-2.5 text-xs gap-1",
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
  icon: "h-9 w-9 justify-center",
  "icon-sm": "h-7 w-7 justify-center",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and disables the button while a save is running. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, className, type = "button", disabled, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-semibold whitespace-nowrap transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
