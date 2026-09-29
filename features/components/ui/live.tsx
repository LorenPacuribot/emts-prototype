/**
 * Building blocks copied from the live app's markup, plus the NEW marker.
 *
 * Existing parts of a host screen use these classes with no badge. Every
 * part the 14 features add carries <NewBadge />, so the client and the
 * developers can see exactly what is new.
 */
import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/features/lib/cn";
import { Tooltip } from "./menu";

/** Small "NEW" marker for a section, tab, button, column or field added by a feature. */
export function NewBadge({ feature, className }: { feature?: number | number[]; className?: string }) {
  const list = feature === undefined ? [] : Array.isArray(feature) ? feature : [feature];
  const badge = (
    <span
      data-new-badge
      className={cn(
        "inline-flex shrink-0 items-center rounded-md bg-emerald-500 px-1.5 py-px text-xxs font-black uppercase leading-4 tracking-wider text-white align-middle",
        className,
      )}
    >
      New
    </span>
  );
  if (!list.length) return badge;
  return <Tooltip content={`Added by feature ${list.join(", ")}`}>{badge}</Tooltip>;
}

/** Marker for features 33 and 34, whose hosts are suggestions not in the client's walkthrough. */
export function ConfirmBadge({ className }: { className?: string }) {
  return (
    <Tooltip content="Not in the client's walkthrough. The host screen is a suggestion that needs client confirmation.">
      <span className={cn("inline-flex shrink-0 items-center rounded-md border border-amber-300 bg-amber-50 px-1.5 py-px text-xxs font-bold uppercase leading-4 tracking-wider text-amber-800", className)}>
        Needs client confirmation
      </span>
    </Tooltip>
  );
}

/**
 * Estimate-page section header: 48px round icon + text-2xl heading
 * (estimates/details/components/paint-colors.tsx).
 */
export function SectionHeader({ icon, title, badge, right, subtitle, className }: {
  icon: ReactNode;
  title: ReactNode;
  badge?: ReactNode;
  right?: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between md:mb-8", className)}>
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-primary-100 bg-primary-50 shadow-sm [&>svg]:h-6 [&>svg]:w-6 [&>svg]:text-primary-600">
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 font-heading text-xl font-bold text-gray-900 md:text-2xl">
            {title}
            {badge}
          </h3>
          {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

/** Estimate-page section wrapper (`border-b pb-12 mb-12 scroll-mt-24`). */
export function EstimateSection({ id, children, isNew, className }: { id?: string; children: ReactNode; isNew?: boolean; className?: string }) {
  return (
    <section id={id} className={cn("scroll-mt-24 border-b border-gray-200 pb-10 mb-10 last:mb-0 last:border-0 last:pb-0 md:pb-12 md:mb-12", isNew && "rounded-2xl ring-1 ring-green-200 ring-offset-8", className)}>
      {children}
    </section>
  );
}

/** Work-order / job page card (`bg-white rounded-2xl shadow-sm border p-6 md:p-8`). */
export function LiveCard({ children, className, isNew, ...rest }: { children: ReactNode; className?: string; isNew?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:p-8", isNew && "border-green-300 ring-1 ring-green-100", className)} {...rest}>
      {children}
    </div>
  );
}

/** Card header with the small icon chip (`p-1.5 bg-primary-100 rounded-lg text-primary-700`) and an h3. */
export function CardTitle({ icon, children, badge, right, className }: { icon?: ReactNode; children: ReactNode; badge?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="rounded-lg bg-primary-100 p-1.5 text-primary-700 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
        <h3 className="flex flex-wrap items-center gap-2 font-heading text-lg font-bold text-gray-900">
          {children}
          {badge}
        </h3>
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

/** Small label used across the live app (`text-xxs font-bold text-gray-400 uppercase tracking-widest`). */
export function LiveLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-xxs font-bold uppercase tracking-widest text-gray-400", className)}>{children}</div>;
}

/** Live page title block for list and settings pages (`text-3xl md:text-4xl font-bold`). */
export function LivePageTitle({ title, subtitle, actions, badge }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; badge?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-5 md:mb-10 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h2 className="flex flex-wrap items-center gap-3 font-heading text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
          {title}
          {badge}
        </h2>
        {subtitle && <p className="mt-2 text-base text-gray-500 md:mt-3 md:text-lg">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2" data-tour="page-actions">{actions}</div>}
    </div>
  );
}

/** Contact-details / reports style tab pills. `variant="pill"` = contacts, `"track"` = reports. */
export function LiveTabs<T extends string>({ tabs, value, onChange, variant = "pill", className }: {
  tabs: { key: T; label: ReactNode; icon?: ReactNode; isNew?: boolean; feature?: number | number[]; hidden?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  variant?: "pill" | "track";
  className?: string;
}) {
  const visible = tabs.filter((t) => !t.hidden);
  if (variant === "track") {
    return (
      <div className={cn("no-scrollbar flex overflow-x-auto rounded-xl border border-gray-200 bg-gray-100 p-1.5", className)} role="tablist">
        {visible.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={value === t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold md:px-5 md:py-2.5 md:text-sm",
              value === t.key ? "bg-white text-primary-700 shadow-sm ring-1 ring-black/5" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900",
            )}
          >
            {t.icon && <span className={cn("[&>svg]:h-3.5 [&>svg]:w-3.5 md:[&>svg]:h-4 md:[&>svg]:w-4", value === t.key ? "text-primary-600" : "text-gray-400")}>{t.icon}</span>}
            {t.label}
            {t.isNew && <NewBadge feature={t.feature} />}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className={cn("no-scrollbar -mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1", className)} role="tablist">
      {visible.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-bold transition-colors",
            value === t.key ? "bg-primary-600 text-white shadow-lg shadow-primary-500/20" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
          )}
        >
          {t.label}
          {t.isNew && <NewBadge feature={t.feature} />}
        </button>
      ))}
    </div>
  );
}

/** Status pill with the live colour families (JOB_HISTORY_STATUS_DISPLAY style). */
export function StatusPill({ tone = "gray", children, dot, className }: { tone?: "gray" | "blue" | "green" | "amber" | "red" | "purple" | "indigo"; children: ReactNode; dot?: boolean; className?: string }) {
  const t = {
    gray: "bg-gray-100 text-gray-700 border-gray-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    green: "bg-green-50 text-green-700 border-green-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-600 border-red-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold", t, className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Mono number chip used for record numbers (`#EST-2026-1`). */
export function NumberChip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 font-mono text-xs font-bold text-gray-600", className)}>{children}</span>;
}

/** Live table header cell (`px-6 py-4 text-xs font-extrabold text-gray-500 uppercase tracking-wider`). */
export function LiveTH({ className, children, isNew, feature, ...rest }: React.ThHTMLAttributes<HTMLTableCellElement> & { isNew?: boolean; feature?: number | number[] }) {
  return (
    <th className={cn("whitespace-nowrap px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wider text-gray-500 md:px-6 md:py-4", className)} {...rest}>
      <span className="inline-flex items-center gap-1.5">
        {children}
        {isNew && <NewBadge feature={feature} />}
      </span>
    </th>
  );
}

export function LiveTD({ className, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 align-middle text-sm text-gray-700 md:px-6 md:py-4", className)} {...rest} />;
}
