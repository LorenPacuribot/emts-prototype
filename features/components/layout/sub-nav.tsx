"use client";
import type { LucideIcon } from "lucide-react";
import { AppLink, useNav } from "@/features/lib/navigation";
import { cn } from "@/features/lib/cn";

export interface SubNavGroup {
  title?: string;
  items: { href: string; label: string; icon: LucideIcon; badge?: number | string; match?: string }[];
}

/**
 * Secondary sidebar, styled like the Settings sidebar (ORGANIZATION /
 * CONFIGURATION / LIBRARIES). Used for the job submenu, Procurement,
 * Properties and Service.
 */
export function SubNav({ groups, header }: { groups: SubNavGroup[]; header?: React.ReactNode }) {
  const { pathname } = useNav();
  return (
    <aside data-tour="subnav" className="no-print w-full shrink-0 border-b border-line bg-white lg:sticky lg:top-0 lg:self-start lg:h-[calc(100vh-5rem)] lg:w-[220px] lg:overflow-y-auto lg:border-b-0 lg:border-r">
      {header && <div className="border-b border-line px-5 py-4">{header}</div>}
      <nav className="flex gap-1 overflow-x-auto px-3 py-3 lg:block lg:space-y-6 lg:px-4 lg:py-6">
        {groups.map((g, gi) => (
          <div key={gi} className="flex gap-1 lg:block lg:space-y-0.5">
            {g.title && <div className="hidden px-2 pb-2 text-[9.5px] font-bold uppercase tracking-[0.16em] text-slate-400 lg:block">{g.title}</div>}
            {g.items.map((item) => {
              const base = item.match ?? item.href.split("?")[0];
              const active = pathname === base;
              const Icon = item.icon;
              return (
                <AppLink
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 whitespace-nowrap rounded-lg border px-2.5 py-2 text-[12.5px] font-medium transition-colors",
                    active ? "border-blue-100 bg-brand-soft text-brand" : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-ink",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="flex-1">{item.label}</span>
                  {item.badge !== undefined && item.badge !== 0 && (
                    <span className={cn("rounded-full px-1.5 text-[10px] font-bold", active ? "bg-brand text-white" : "bg-slate-100 text-slate-500")}>{item.badge}</span>
                  )}
                </AppLink>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
