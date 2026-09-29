"use client";
import type { LucideIcon } from "lucide-react";
import { AppLink, useNav } from "@/features/lib/navigation";
import { cn } from "@/features/lib/cn";

export interface SubNavGroup {
  title?: string;
  items: { href: string; label: string; icon: LucideIcon; badge?: number | string; match?: string }[];
}

/**
 * Secondary sidebar, styled like the Settings sidebar
 * (components/settings/SettingsSidebar.tsx): same group headings, dividers,
 * item size, icon size and active colours (N3). Used by Time, Supplier
 * Orders, Repaint Alerts, Accounting and Marketing. Below lg it becomes a
 * horizontal bar that scrolls, like the Settings bar on a phone.
 */
export function SubNav({ groups, header }: { groups: SubNavGroup[]; header?: React.ReactNode }) {
  const { pathname } = useNav();
  return (
    <aside data-tour="subnav" className="no-print w-full shrink-0 border-b border-gray-200 bg-white shadow-sm lg:sticky lg:top-0 lg:h-[calc(100vh-5rem)] lg:w-64 lg:self-start lg:overflow-y-auto lg:border-b-0 lg:border-r lg:shadow-none lg:custom-scrollbar">
      {header && <div className="hidden border-b border-gray-100 px-6 py-5 lg:block">{header}</div>}
      <nav className="flex items-center gap-2 overflow-x-auto p-2 custom-scrollbar lg:flex-col lg:items-stretch lg:gap-1.5 lg:overflow-visible lg:px-4 lg:py-6">
        {groups.map((g, gi) => (
          <div key={gi} className="contents">
            {gi > 0 && <div className="my-4 hidden h-px w-full bg-gray-100 lg:block" />}
            {g.title && <h2 className="mb-2 mt-1 hidden px-2 text-xxs font-black uppercase tracking-[0.2em] text-gray-400 lg:block">{g.title}</h2>}
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
                    "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-4 py-3 transition-all lg:w-full lg:gap-3 lg:whitespace-normal",
                    active
                      ? "border-primary-100 bg-primary-50 font-bold text-primary-900 shadow-sm"
                      : "border-transparent bg-transparent font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900",
                  )}
                >
                  <Icon className={cn("h-5 w-5 shrink-0", active ? "text-primary-600" : "text-gray-400")} strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 text-sm leading-tight">{item.label}</span>
                  {item.badge !== undefined && item.badge !== 0 && (
                    <span className={cn("shrink-0 rounded-full px-1.5 text-xs font-bold", active ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600")}>{item.badge}</span>
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
