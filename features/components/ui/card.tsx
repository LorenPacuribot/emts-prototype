"use client";
import { createContext, useContext, type ReactNode } from "react";
import { cn } from "@/features/lib/cn";
import { useRoomy } from "./roomy";

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("min-w-0 rounded-2xl border border-line bg-white shadow-card", className)} {...rest}>
      {children}
    </div>
  );
}

/**
 * Card title in the app's style: small icon, uppercase, wide letter-spacing
 * ("MY TASKS", "PENDING SALES"). In roomy screens it is a real 20px h2.
 */
export function CardLabel({ icon, children, right, className }: { icon?: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  const roomy = useRoomy();
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      {roomy ? (
        <h2 className="flex items-center gap-2 font-heading text-xl font-bold text-ink">
          {icon && <span className="text-brand [&>svg]:h-5 [&>svg]:w-5">{icon}</span>}
          {children}
        </h2>
      ) : (
        <div className="flex items-center gap-2 text-xxs font-bold uppercase tracking-[0.14em] text-gray-600">
          {icon && <span className="text-brand [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}
          {children}
        </div>
      )}
      {right}
    </div>
  );
}

/** Uppercase field label ("SCHEDULE", "PIPELINE VALUE"). */
export function MicroLabel({ children, className }: { children: ReactNode; className?: string }) {
  const roomy = useRoomy();
  return <div className={cn(roomy ? "text-xs" : "text-xxs", "font-bold uppercase tracking-[0.12em] text-gray-500", className)}>{children}</div>;
}

/** True inside a StatStrip, so a roomy Stat draws itself as its own card. */
const InStatStrip = createContext(false);

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "brand" | "warn" | "danger" | "good" }) {
  const roomy = useRoomy();
  const inStrip = useContext(InStatStrip);
  const color =
    tone === "brand" ? "text-brand" : tone === "warn" ? "text-amber-700" : tone === "danger" ? "text-red-600" : tone === "good" ? "text-green-700" : "text-ink";
  if (roomy && inStrip) {
    // The live StatCard look used on Time and Payroll: 13px label, 30–34px number.
    return (
      <Card className="flex min-w-0 flex-col p-4 md:p-6">
        <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-gray-500">{label}</div>
        <div className={cn("mt-2 break-words font-heading text-[26px] font-extrabold leading-tight tabular-nums md:text-[30px]", color)}>{value}</div>
        {hint && <div className="mt-2 text-sm text-gray-500">{hint}</div>}
      </Card>
    );
  }
  return (
    <div className="min-w-0">
      <MicroLabel>{label}</MicroLabel>
      <div className={cn("mt-1 font-display text-lg font-bold leading-tight", color)}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-gray-500">{hint}</div>}
    </div>
  );
}

/**
 * Horizontal strip of stats at the top of a feature screen. In roomy screens
 * each Stat is its own card, two across on phones and up to four across wide.
 */
export function StatStrip({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  const roomy = useRoomy();
  if (roomy) {
    return (
      <div data-tour="stat-strip" className={cn("grid grid-cols-2 gap-3 md:gap-5 lg:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]", className)} {...rest}>
        <InStatStrip.Provider value>{children}</InStatStrip.Provider>
      </div>
    );
  }
  return (
    <Card data-tour="stat-strip" className={cn("grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:flex lg:flex-wrap lg:gap-x-10", className)} {...rest}>
      {children}
    </Card>
  );
}
