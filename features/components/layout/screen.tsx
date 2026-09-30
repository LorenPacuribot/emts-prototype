"use client";
import { createContext, useContext, type ReactNode } from "react";
import { cn } from "@/features/lib/cn";
import { AppHeader } from "@/components/Navigation";
import { RoomyContext, useRoomy } from "@/features/components/ui/roomy";
import type { Crumb } from "./top-bar";
import { useHowThisWorks } from "./how-this-works";

/**
 * One feature screen inside the replica shell: the replica's AppHeader
 * (breadcrumbs + title pill), an optional secondary sidebar, then content.
 * The replica's main Sidebar is rendered by app/layout.tsx.
 * `roomy` turns on the calmer module layout (see features/components/ui/roomy.tsx).
 */
export function Screen({ crumbs, sidebar, children, className, bare, roomy }: { crumbs: Crumb[]; sidebar?: ReactNode; children: ReactNode; className?: string; bare?: boolean; roomy?: boolean }) {
  const { title, breadcrumbs } = headerCrumbs(crumbs);
  return (
    <>
      <AppHeader title={title} breadcrumbs={breadcrumbs} />
      <div className="flex min-w-0 flex-1 flex-col overflow-auto lg:flex-row">
        {sidebar}
        <main className={cn("readable min-w-0 flex-1 bg-gray-50", !bare && "px-4 py-6 md:px-8 md:py-8", roomy && "roomy", className)}>
          <RoomyContext.Provider value={!!roomy}>
            {/* L7: on very wide screens the page stops at 1440px instead of spreading edge to edge. */}
            {bare ? children : <div className="mx-auto w-full max-w-[1440px]">{children}</div>}
          </RoomyContext.Provider>
        </main>
      </div>
    </>
  );
}

const sameLabel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Header crumbs without repeats (N1, H5). The last crumb is the title pill.
 * A crumb that repeats the one before it, or the title, is dropped, so a
 * module's landing page reads "Supplier Orders" (not "Supplier Orders |
 * Supplier Orders") and a sub-page reads "Supplier Orders | Returns".
 */
export function headerCrumbs(crumbs: Crumb[]) {
  const title = crumbs[crumbs.length - 1]?.label ?? "";
  const breadcrumbs = crumbs
    .slice(0, -1)
    .filter((c, i, all) => !sameLabel(c.label, title) && (i === 0 || !sameLabel(c.label, all[i - 1]!.label)))
    .map((c) => ({ label: c.label, href: c.href }));
  return { title, breadcrumbs };
}

/**
 * Content a module frame shows directly under every page title in it, such
 * as the Workforce section tabs (see WorkforceFrame).
 */
export const PageHeaderBelow = createContext<ReactNode>(null);

/**
 * Page title block: "Job Management / Mission control for active projects." plus actions.
 * `lead` sets the subtitle at 16–18px, like the live Contacts page (on by default in roomy screens).
 * The subtitle is one sentence (L4); `details` holds the rules and detail, behind a
 * "How this works" button beside the title.
 */
export function PageHeader({ title, subtitle, actions, eyebrow, lead, details }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; lead?: boolean; details?: ReactNode }) {
  const below = useContext(PageHeaderBelow);
  const roomy = useRoomy();
  const large = lead ?? roomy;
  const how = useHowThisWorks(details);
  return (
    <div className="mb-6">
      {/* Title and actions share a row; the one-sentence subtitle gets the full width below, so it fits on one line. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <div className="mb-2 flex flex-wrap items-center gap-1.5">{eyebrow}</div>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="font-heading text-3xl font-bold leading-tight tracking-tight text-balance text-ink md:text-4xl">{title}</h1>
            {how.button}
          </div>
        </div>
        {actions && <div className={cn("no-print flex flex-wrap items-center gap-2", roomy && "sm:max-w-[60%] sm:shrink-0 sm:justify-end")} data-tour="page-actions">{actions}</div>}
      </div>
      {subtitle && <p className={large ? "mt-2 max-w-[90ch] text-base text-gray-500 md:text-lg" : "mt-1.5 max-w-[90ch] text-sm text-gray-500"}>{subtitle}</p>}
      {how.panel}
      {below && <div className="mt-6">{below}</div>}
    </div>
  );
}
