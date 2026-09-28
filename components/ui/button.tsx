'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/*
  Button styles from the live app:
  - primary: solid blue with a soft blue shadow ("Create New Estimate")
  - secondary: white with gray border ("View Archived", "Customize")
  - danger: solid red for destructive actions
  - dark: near-black (active filter pill on Jobs)
  - ghost: no border, gray text (icon buttons, kebab menus)
*/
const VARIANTS = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 shadow-md shadow-primary-500/20 border border-primary-600',
  secondary: 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 shadow-sm',
  outline: 'bg-transparent text-primary-700 hover:bg-primary-50 border border-primary-200',
  danger: 'bg-red-600 text-white hover:bg-red-700 border border-red-600 shadow-md shadow-red-500/20',
  'danger-outline': 'bg-white text-red-600 hover:bg-red-50 border border-red-200',
  dark: 'bg-gray-900 text-white hover:bg-gray-800 border border-gray-900',
  ghost: 'bg-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-100 border border-transparent',
  success: 'bg-green-600 text-white hover:bg-green-700 border border-green-600',
} as const;

const SIZES = {
  xs: 'h-7 px-2.5 text-xs gap-1 rounded-md',
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-5 text-base gap-2 rounded-xl',
  icon: 'h-9 w-9 justify-center rounded-lg',
  'icon-sm': 'h-7 w-7 justify-center rounded-md',
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-semibold whitespace-nowrap transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});
