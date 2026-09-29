"use client";
/**
 * Wraps every Workforce screen (feature 22): top bar and the Workforce
 * submenu. Tabs are filtered by role: employees see only their own time,
 * crew leads see crew hours without pay, and payroll detail is for the
 * owner and office manager. Per-employee cost is bookkeeper and owner only.
 */
import type { ReactNode } from "react";
import { Car, ClipboardList, Clock, FileSpreadsheet, Lock, Smartphone, UserRound, Users, Wallet } from "lucide-react";
import type { User } from "@/features/types";
import { useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { Screen } from "@/features/components/layout/screen";
import { SubNav } from "@/features/components/layout/sub-nav";
import { EmptyState } from "@/features/components/ui";
import { entryConflicts, weekEntries } from "@/features/lib/store/actions/workforce";
import { addDaysToDay, localDay, weekStartOf } from "@/features/lib/rules/payroll";

export const WORKFORCE_TABS = [
  { key: "review", label: "Time And Payroll", path: "/time", icon: ClipboardList },
  { key: "clock", label: "Mobile Clock", path: "/time/clock", icon: Smartphone },
  { key: "my-time", label: "My Time", path: "/time/my-time", icon: UserRound },
  { key: "batches", label: "Export Batches", path: "/time/batches", icon: FileSpreadsheet },
  { key: "labour", label: "Labour Cost", path: "/time/labour-cost", icon: Wallet },
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

  return (
    <Screen
      crumbs={[{ label: "Time", href: "/time" }, { label: meta.label }]}
      sidebar={
        <SubNav
          header={
            <div className="hidden lg:block">
              <div className="flex items-center gap-2 font-display text-sm font-bold text-ink"><Clock className="h-4 w-4 text-brand" /> Time</div>
              <div className="mt-0.5 text-xs text-gray-500">Time is recorded and classified here. Gusto runs payroll — no pay rates are held in Estimate Master.</div>
            </div>
          }
          groups={[
            {
              title: "Time",
              items: WORKFORCE_TABS.filter((t) => canSeeTab(user, t.key)).map((t) => ({
                href: t.path, label: t.label, icon: t.icon,
                badge: t.key === "review" ? review + conflicts || undefined : t.key === "clock" ? queued || undefined : t.key === "batches" ? open || undefined : undefined,
              })),
            },
          ]}
        />
      }
    >
      {canSeeTab(user, tab) ? (
        children
      ) : (
        <EmptyState icon={<Lock />} title="Not available for your role" body="Employees see their own time under My Time. Crew leads see crew hours without pay. Payroll detail is for the office manager and business owner." />
      )}
    </Screen>
  );
}
