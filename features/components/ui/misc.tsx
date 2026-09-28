"use client";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert, X } from "lucide-react";
import { cn } from "@/features/lib/cn";
import { useToasts } from "@/features/lib/toast";

/** Filter pills, as on the Jobs page ("All Active", "Unscheduled", ...). Active pill is black. */
export function PillTabs<T extends string>({ options, value, onChange, className }: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="tablist" data-tour="pill-tabs">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 rounded-xl border px-3.5 text-[12.5px] font-semibold transition-colors",
            value === o.value ? "border-ink bg-ink text-white" : "border-line bg-white text-slate-700 hover:bg-slate-50",
          )}
        >
          {o.label}
          {o.count !== undefined && (
            <span className={cn("ml-1.5 rounded-full px-1.5 text-[10.5px]", value === o.value ? "bg-white/20" : "bg-slate-100 text-slate-500")}>{o.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-6 py-10 text-center", className)}>
      {icon && <div className="mb-3 text-slate-300 [&>svg]:h-8 [&>svg]:w-8">{icon}</div>}
      <p className="text-[13px] font-semibold text-slate-600">{title}</p>
      {body && <p className="mt-1 max-w-sm text-[12.5px] italic text-slate-400">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-slate-100", className)} />;
}

type BannerTone = "info" | "warn" | "danger" | "success";

export function Banner({ tone = "info", title, children, action, className }: { tone?: BannerTone; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const styles: Record<BannerTone, string> = {
    info: "border-blue-200 bg-blue-50 text-blue-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  const Icon = { info: Info, warn: AlertTriangle, danger: OctagonAlert, success: CheckCircle2 }[tone];
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-[12.5px]", styles[tone], className)} role={tone === "danger" ? "alert" : "status"}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
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
            t.kind === "error" ? "border-red-200" : t.kind === "success" ? "border-emerald-200" : "border-line",
          )}
        >
          {t.kind === "error" ? (
            <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          ) : t.kind === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-ink">{t.title}</p>
            {t.body && <p className="mt-0.5 text-[12px] text-slate-500">{t.body}</p>}
          </div>
          <button onClick={() => dismiss(t.id)} className="text-slate-300 hover:text-slate-600" aria-label="Dismiss">
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
    <dl className={cn("grid grid-cols-[minmax(96px,40%)_minmax(0,1fr)] gap-x-4 gap-y-2 text-[12.5px]", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-slate-500">{k}</dt>
          <dd className="min-w-0 break-words font-medium text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
