"use client";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/features/lib/cn";
import { AppLink } from "@/features/lib/navigation";

export type SectionTab = { href: string; label: string; icon: LucideIcon; badge?: number | string; active?: boolean };

/**
 * A module's sections as an underline tab row, shown under the page title in
 * place of a second sidebar (Time, Supplier Orders, Repaint Alerts, Accounting,
 * Marketing). Groups are separated by a thin divider. On phones the row
 * scrolls sideways; on wide screens a long row wraps onto a second line.
 * Keeps data-tour="subnav" so product-tour stops still land.
 */
export function SectionTabs({ groups, label, note }: { groups: SectionTab[][]; label: string; note?: ReactNode }) {
  const visible = groups.filter((g) => g.length > 0);
  return (
    <>
    <nav data-tour="subnav" aria-label={label} className="no-print -mx-4 flex items-stretch gap-x-6 overflow-x-auto border-b border-gray-200 px-4 no-scrollbar md:mx-0 md:px-0 lg:flex-wrap lg:gap-y-1 lg:overflow-visible">
      {visible.map((group, gi) => (
        <div key={gi} className="flex shrink-0 items-stretch gap-x-6 lg:contents">
          {gi > 0 && <span className="my-2 w-px shrink-0 self-stretch bg-gray-200" aria-hidden />}
          {group.map((t) => (
            <AppLink
              key={t.href}
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 pb-3 pt-1 text-[15px] font-semibold transition-colors",
                t.active ? "border-primary-600 text-primary-700" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800",
              )}
            >
              <t.icon className="h-4 w-4" aria-hidden />
              {t.label}
              {t.badge !== undefined && t.badge !== 0 && t.badge !== "" && (
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", t.active ? "bg-primary-100 text-primary-700" : "bg-gray-100 text-gray-600")}>{t.badge}</span>
              )}
            </AppLink>
          ))}
        </div>
      ))}
    </nav>
    {/* A module-wide fact that used to sit in the sidebar header ("Internal only", "Sandbox"). */}
    {note && <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-gray-500">{note}</div>}
    </>
  );
}
