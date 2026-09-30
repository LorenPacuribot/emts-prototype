import type { ReactNode } from "react";
import { cn } from "@/features/lib/cn";

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("min-w-0 rounded-2xl border border-line bg-white shadow-card", className)} {...rest}>
      {children}
    </div>
  );
}

/**
 * Card title in the app's style: small icon, uppercase, wide letter-spacing
 * ("MY TASKS", "PENDING SALES").
 */
export function CardLabel({ icon, children, right, className }: { icon?: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="flex items-center gap-2 text-xxs font-bold uppercase tracking-[0.14em] text-gray-600">
        {icon && <span className="text-brand [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}
        {children}
      </div>
      {right}
    </div>
  );
}

/** Uppercase field label ("SCHEDULE", "PIPELINE VALUE"). */
export function MicroLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-xxs font-bold uppercase tracking-[0.12em] text-gray-500", className)}>{children}</div>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "brand" | "warn" | "danger" | "good" }) {
  const color =
    tone === "brand" ? "text-brand" : tone === "warn" ? "text-amber-700" : tone === "danger" ? "text-red-600" : tone === "good" ? "text-green-700" : "text-ink";
  return (
    <div className="min-w-0">
      <MicroLabel>{label}</MicroLabel>
      <div className={cn("mt-1 font-display text-lg font-bold leading-tight", color)}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-gray-500">{hint}</div>}
    </div>
  );
}

/** Horizontal strip of stats at the top of a feature screen. */
export function StatStrip({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Card data-tour="stat-strip" className={cn("grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:flex lg:flex-wrap lg:gap-x-10", className)} {...rest}>
      {children}
    </Card>
  );
}
