"use client";
/**
 * Wraps every Service screen: top bar + the Service section tabs under each page title
 * (Repaint Alerts, Follow-Ups, Lifespan Library, Run Log, Monthly Measures).
 * Service is staff-only. Crew leads have no access to this module.
 */
import type { ReactNode } from "react";
import { BarChart3, BellRing, BookOpen, History, Lock, PhoneCall } from "lucide-react";
import { useCurrentUser, useDb } from "@/features/lib/store";
import { now } from "@/features/lib/clock";
import { PageHeaderBelow, Screen } from "@/features/components/layout/screen";
import { SectionTabs } from "@/features/components/layout/section-tabs";
import { EmptyState } from "@/features/components/ui";
import { SettingsShell } from "@/features/components/features/settings/settings-shell";
import { alertQueueState, followUpFlags } from "@/features/lib/rules/alerts";

export const SERVICE_TABS = [
  { key: "alerts", label: "Repaint Alerts", path: "/repaint-alerts", icon: BellRing },
  { key: "follow-ups", label: "Follow-Ups", path: "/repaint-alerts/follow-ups", icon: PhoneCall },
  { key: "library", label: "Lifespan Library", path: "/settings/repaint-intervals", icon: BookOpen },
  { key: "run-log", label: "Run Log", path: "/repaint-alerts/run-log", icon: History },
  { key: "measures", label: "Monthly Measures", path: "/repaint-alerts/monthly-measures", icon: BarChart3 },
] as const;

export type ServiceTabKey = (typeof SERVICE_TABS)[number]["key"];

export function ServiceFrame({ tab, children }: { tab: ServiceTabKey; children: ReactNode }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const meta = SERVICE_TABS.find((t) => t.key === tab)!;
  const t = now();
  const liveCount = db.repaintAlerts.filter((a) => ["live"].includes(alertQueueState(db, a, t).state)).length;
  const fuCount = db.followUps.filter((f) => {
    const x = followUpFlags(db, f, t);
    return x.overdue || x.escalated || x.unassigned;
  }).length;
  const lastFailed = db.runLog[0]?.failed ? "!" : undefined;

  // NEW (27): the lifespan library is the Settings › Repaint Intervals page.
  if (tab === "library") {
    return (
      <SettingsShell page="repaint-intervals" subtitle="Paint life by room type, product tier and exposure. Sets each surface's repaint date.">
        {children}
      </SettingsShell>
    );
  }

  // Sections as an underline tab row under the page title (no second sidebar).
  const tabs = (
    <SectionTabs
      label="Repaint Alerts sections"
      note={<>Repaint timing and follow-up. Internal only: nothing here is shown to customers.</>}
      groups={[SERVICE_TABS.filter((s) => s.key !== "library").map((s) => ({
        href: s.path, label: s.label, icon: s.icon, active: s.key === tab,
        badge: s.key === "alerts" ? liveCount : s.key === "follow-ups" ? fuCount : s.key === "run-log" ? lastFailed : undefined,
      }))]}
    />
  );

  return (
    <Screen roomy crumbs={[{ label: "Repaint Alerts", href: "/repaint-alerts" }, { label: meta.label }]}>
      {user.role === "crew_lead" ? (
        <>
          <div className="mb-6">{tabs}</div>
          <EmptyState icon={<Lock />} title="Service is for office and estimating staff" body="Repaint alerts and follow-ups are internal sales tools. Ask the office manager if you need something from here." />
        </>
      ) : (
        <PageHeaderBelow.Provider value={tabs}>{children}</PageHeaderBelow.Provider>
      )}
    </Screen>
  );
}
