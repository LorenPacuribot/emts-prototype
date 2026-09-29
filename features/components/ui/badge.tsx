import type { ReactNode } from "react";
import { cn } from "@/features/lib/cn";

export type Tone = "gray" | "blue" | "purple" | "green" | "amber" | "red" | "indigo" | "pink" | "dark";

const tones: Record<Tone, string> = {
  gray: "bg-gray-50 text-gray-600 border-gray-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
  green: "bg-green-50 text-green-700 border-green-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  pink: "bg-pink-50 text-pink-700 border-pink-200",
  dark: "bg-ink text-white border-ink",
};

/** Rounded status badge, as used on the Jobs list ("Unscheduled", "Scheduled"). */
export function Badge({ tone = "gray", icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap", tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

/** Small square ID chip ("JOB-2026-4", "EST-2026-8"). */
export function IdChip({ children, tone = "gray", icon }: { children: ReactNode; tone?: "gray" | "blue"; icon?: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold tracking-wide whitespace-nowrap",
        tone === "gray" ? "bg-gray-100 text-gray-500" : "bg-blue-50 text-blue-700 border border-blue-100",
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Tiny uppercase pill used on dashboard lists ("WEBSITE", "REFERRAL"). */
export function MicroPill({ children, tone = "blue" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-xxs font-bold uppercase tracking-wider", tones[tone])}>{children}</span>
  );
}
