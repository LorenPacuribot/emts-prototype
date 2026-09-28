"use client";
import type { ReactNode } from "react";
import { cn } from "@/features/lib/cn";
import { AppHeader } from "@/components/Navigation";
import type { Crumb } from "./top-bar";

/**
 * One feature screen inside the replica shell: the replica's AppHeader
 * (breadcrumbs + title pill), an optional secondary sidebar, then content.
 * The replica's main Sidebar is rendered by app/layout.tsx.
 */
export function Screen({ crumbs, sidebar, children, className, bare }: { crumbs: Crumb[]; sidebar?: ReactNode; children: ReactNode; className?: string; bare?: boolean }) {
  const title = crumbs[crumbs.length - 1]?.label ?? "";
  const breadcrumbs = crumbs.slice(0, -1).map((c) => ({ label: c.label, href: c.href }));
  return (
    <>
      <AppHeader title={title} breadcrumbs={breadcrumbs} />
      <div className="flex min-w-0 flex-1 flex-col overflow-auto lg:flex-row">
        {sidebar}
        <main className={cn("min-w-0 flex-1 bg-gray-50", !bare && "px-4 py-6 md:px-8 md:py-8", className)}>{children}</main>
      </div>
    </>
  );
}

/** Page title block: "Job Management / Mission control for active projects." plus actions. */
export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 flex flex-wrap items-center gap-1.5">{eyebrow}</div>}
        <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight text-ink md:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[14px] text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2" data-tour="page-actions">{actions}</div>}
    </div>
  );
}
