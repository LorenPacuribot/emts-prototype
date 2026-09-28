/**
 * Header for a panel inside the NEW Paint History tab. It takes the same
 * props as PageHeader, so the moved property screens keep their bodies.
 */
import type { ReactNode } from "react";

export function PanelHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  // A container query, not a viewport breakpoint: panels sit in narrow columns (contact tabs, report tabs).
  return (
    <div className="@container mb-5">
    <div className="flex flex-col gap-3 @3xl:flex-row @3xl:items-start @3xl:justify-between">
      <div className="min-w-0 @3xl:flex-1">
        {eyebrow && <div className="mb-1.5 flex flex-wrap items-center gap-1.5">{eyebrow}</div>}
        <h3 className="font-heading text-xl font-bold text-gray-900">{title}</h3>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2" data-tour="page-actions">{actions}</div>}
    </div>
    </div>
  );
}
