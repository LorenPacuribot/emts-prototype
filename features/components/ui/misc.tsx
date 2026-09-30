"use client";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert, X } from "lucide-react";
import { cn } from "@/features/lib/cn";
import { useToasts } from "@/features/lib/toast";
import { usText } from "@/features/lib/display-text";
import { useRoomy } from "./roomy";

/**
 * One component for tabs and filters, two looks (H4, S5):
 * - kind="view": top-level views of a screen, underline tabs;
 * - default ("filter"): filters and choices inside a view, small outline chips.
 * A view row and a filter row never look the same.
 */
export function PillTabs<T extends string>({ options, value, onChange, className, kind = "filter" }: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  kind?: "view" | "filter";
}) {
  const roomy = useRoomy();
  if (kind === "view") {
    return (
      <div className={cn("flex gap-1 overflow-x-auto border-b border-gray-200 custom-scrollbar", roomy && "gap-3", className)} role="tablist" data-tour="pill-tabs">
        {options.map((o) => (
          <button
            key={o.value}
            role="tab"
            aria-selected={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "-mb-px inline-flex h-11 shrink-0 items-center border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60",
              roomy && "h-12",
              value === o.value ? "border-primary-600 text-primary-700" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900",
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={cn("ml-1.5 rounded-full px-1.5 text-xs", value === o.value ? "bg-primary-100 text-primary-700" : "bg-gray-100 text-gray-600")}>{o.count}</span>
            )}
          </button>
        ))}
      </div>
    );
  }
  if (roomy) {
    // The Time and Payroll chips: 40px (44px on phones), one sideways-scrolling row on phones.
    return (
      <div className={cn("flex gap-2 overflow-x-auto no-scrollbar md:flex-wrap md:overflow-visible", className)} role="tablist" data-tour="pill-tabs">
        {options.map((o) => (
          <button
            key={o.value}
            role="tab"
            aria-selected={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60 md:h-10",
              value === o.value ? "border-primary-300 bg-primary-50 text-primary-700" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900",
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold tabular-nums", value === o.value ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600")}>{o.count}</span>
            )}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)} role="tablist" data-tour="pill-tabs">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60",
            value === o.value ? "border-primary-300 bg-primary-50 text-primary-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900",
          )}
        >
          {o.label}
          {o.count !== undefined && (
            <span className={cn("ml-1.5 rounded-full px-1.5 text-xs", value === o.value ? "bg-primary-100 text-primary-700" : "bg-gray-100 text-gray-600")}>{o.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 px-6 py-10 text-center", className)}>
      {icon && <div className="mb-3 text-gray-300 [&>svg]:h-8 [&>svg]:w-8">{icon}</div>}
      <p className="text-sm font-semibold text-gray-600">{title}</p>
      {body && <p className="mt-1 max-w-sm text-xs italic text-gray-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-gray-100", className)} />;
}

type BannerTone = "info" | "warn" | "danger" | "success";

export function Banner({ tone = "info", title, children, action, className }: { tone?: BannerTone; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const styles: Record<BannerTone, string> = {
    info: "border-blue-200 bg-blue-50 text-blue-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-900",
    success: "border-green-200 bg-green-50 text-green-900",
  };
  const Icon = { info: Info, warn: AlertTriangle, danger: OctagonAlert, success: CheckCircle2 }[tone];
  const roomy = useRoomy();
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border", roomy ? "px-5 py-3.5 text-sm" : "px-4 py-3 text-xs", styles[tone], className)} role={tone === "danger" ? "alert" : "status"}>
      <Icon className={cn("shrink-0", roomy ? "mt-0.5 h-5 w-5" : "mt-0.5 h-4 w-4")} />
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Swatch({ hex, size = "md", className }: { hex: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const s = { sm: "h-4 w-4 rounded", md: "h-8 w-8 rounded-lg", lg: "h-14 w-14 rounded-xl" }[size];
  return <span className={cn("inline-block shrink-0 border border-black/10 shadow-inner", s, className)} style={{ backgroundColor: hex }} aria-hidden />;
}

export function Toaster() {
  const { items, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[calc(100vw-32px)] max-w-sm flex-col gap-2" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-xl animate-in-pop",
            t.kind === "error" ? "border-red-200" : t.kind === "success" ? "border-green-200" : "border-line",
          )}
        >
          {t.kind === "error" ? (
            <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          ) : t.kind === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">{usText(t.title)}</p>
            {t.body && <p className="mt-0.5 text-xs text-gray-500">{usText(t.body)}</p>}
          </div>
          <button onClick={() => dismiss(t.id)} className="text-gray-300 hover:text-gray-600" aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Key/value row list used in detail panels. */
export function KV({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[minmax(96px,40%)_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-gray-500">{k}</dt>
          <dd className="min-w-0 break-words font-medium text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
