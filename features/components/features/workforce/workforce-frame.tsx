"use client";
/**
 * Wraps every Workforce screen (feature 22): top bar and the Workforce
 * section tabs, shown under each page title. Tabs are filtered by role: employees see only their own time,
 * crew leads see crew hours without pay, and payroll detail is for the
 * owner and office manager. Per-employee cost is bookkeeper and owner only.
 */
import type { ReactNode } from "react";
import { Car, ClipboardList, FileSpreadsheet, Lock, Smartphone, UserRound, Users, Wallet } from "lucide-react";
import type { User } from "@/features/types";
import { useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { cn } from "@/features/lib/cn";
import { AppLink } from "@/features/lib/navigation";
import { PageHeaderBelow, Screen } from "@/features/components/layout/screen";
import { EmptyState } from "@/features/components/ui";
import { entryConflicts, weekEntries } from "@/features/lib/store/actions/workforce";
import { addDaysToDay, localDay, weekStartOf } from "@/features/lib/rules/payroll";

export const WORKFORCE_TABS = [
  { key: "review", label: "Time and Payroll", path: "/time", icon: ClipboardList },
  { key: "clock", label: "Mobile Clock", path: "/time/clock", icon: Smartphone },
  { key: "my-time", label: "My Time", path: "/time/my-time", icon: UserRound },
  { key: "batches", label: "Export Batches", path: "/time/batches", icon: FileSpreadsheet },
  { key: "labour", label: "Labor Cost", path: "/time/labour-cost", icon: Wallet },
  { key: "mileage", label: "Mileage", path: "/time/mileage", icon: Car },
  { key: "employees", label: "Employees & Crews", path: "/time/employees", icon: Users },
] as const;

export type WorkforceTabKey = (typeof WORKFORCE_TABS)[number]["key"];

export function canSeeTab(user: User, key: WorkforceTabKey): boolean {
  switch (key) {
    case "review":
    case "employees":
      return can(user, "time.viewCrew");
    case "clock":
      return can(user, "time.clock");
    case "my-time":
    case "mileage":
      return true;
    case "batches":
      return can(user, "time.payrollDetail") || can(user, "payroll.results");
    case "labour":
      return can(user, "labour.seeEmployeeTotals") || can(user, "labour.reconcile") || can(user, "labour.setBurden");
  }
}

export function WorkforceFrame({ tab, children }: { tab: WorkforceTabKey; children: ReactNode }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const meta = WORKFORCE_TABS.find((t) => t.key === tab)!;
  const lastWeek = addDaysToDay(weekStartOf(localDay(new Date(now()))), -7);
  const review = weekEntries(db, lastWeek).filter((e) => e.state === "submitted").length;
  const conflicts = weekEntries(db, lastWeek).filter((e) => entryConflicts(db, e).length).length;
  const queued = db.timeSegments.filter((s) => s.queued).length;
  const open = db.payrollBatches.filter((b) => !b.paidAt).length;
  const badgeFor = (key: WorkforceTabKey) =>
    key === "review" ? review + conflicts || undefined : key === "clock" ? queued || undefined : key === "batches" ? open || undefined : undefined;

  // The module's sections, as an underline tab row under the page title (no second sidebar).
  const tabs = (
    <nav data-tour="subnav" aria-label="Time sections" className="no-print -mx-4 flex gap-6 overflow-x-auto border-b border-gray-200 px-4 no-scrollbar md:mx-0 md:px-0">
      {WORKFORCE_TABS.filter((t) => canSeeTab(user, t.key)).map((t) => {
        const active = t.key === tab;
        const badge = badgeFor(t.key);
        return (
          <AppLink
            key={t.key}
            href={t.path}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 pb-3 pt-1 text-[15px] font-semibold transition-colors",
              active ? "border-primary-600 text-primary-700" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800",
            )}
          >
            <t.icon className="h-4 w-4" aria-hidden />
            {t.label}
            {badge !== undefined && (
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", active ? "bg-primary-100 text-primary-700" : "bg-gray-100 text-gray-600")}>{badge}</span>
            )}
          </AppLink>
        );
      })}
    </nav>
  );

  return (
    <Screen crumbs={[{ label: "Time", href: "/time" }, { label: meta.label }]}>
      {canSeeTab(user, tab) ? (
        <PageHeaderBelow.Provider value={tabs}>{children}</PageHeaderBelow.Provider>
      ) : (
        <>
          <div className="mb-6">{tabs}</div>
          <EmptyState icon={<Lock />} title="Not available for your role" body="Employees see their own time under My Time. Crew leads see crew hours without pay. Payroll detail is for the office manager and business owner." />
        </>
      )}
    </Screen>
  );
}
