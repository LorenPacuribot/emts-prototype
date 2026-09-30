"use client";
/**
 * Header for a panel inside the NEW Paint History tab. It takes the same
 * props as PageHeader, so the moved property screens keep their bodies.
 */
import type { ReactNode } from "react";
import { useHowThisWorks } from "@/features/components/layout/how-this-works";

export function PanelHeader({ title, subtitle, actions, eyebrow, details }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; details?: ReactNode }) {
  const how = useHowThisWorks(details);
  // A container query, not a viewport breakpoint: panels sit in narrow columns (contact tabs, report tabs).
  return (
    <div className="@container mb-5">
    <div className="flex flex-col gap-3 @3xl:flex-row @3xl:items-start @3xl:justify-between">
      <div className="min-w-0 @3xl:flex-1">
        {eyebrow && <div className="mb-1.5 flex flex-wrap items-center gap-1.5">{eyebrow}</div>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 className="font-heading text-xl font-bold text-gray-900">{title}</h3>
          {how.button}
        </div>
        {subtitle && <p className="mt-1 max-w-[90ch] text-sm text-gray-500">{subtitle}</p>}
        {how.panel}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2" data-tour="page-actions">{actions}</div>}
    </div>
    </div>
  );
}
