"use client";
/**
 * Reports — live route /reports?tab= (features/(main)/reports/listings).
 *
 * The live page: "Reports & Analytics" with the REPORT_TABS track. The tab
 * is kept in ?tab= like the live `router.replace`.
 * Live tabs: Estimates Log, Jobs Sold, Sales Goal, Jobs To Do, Stats, Activity Log.
 * NEW tabs: Job Performance (21) next to Jobs To Do, Estimating Feedback (30),
 * and the finance reports Job Margin, Income & Expense, Aged Receivables
 * (33, needs client confirmation).
 */
import type { ReactNode } from "react";
import { Activity, BarChart3, Briefcase, ClipboardList, Clock3, Coins, FileSpreadsheet, Gauge, Landmark, Target, TrendingUp } from "lucide-react";
import { useCurrentUser } from "@/features/lib/store";
import { useNav } from "@/features/lib/navigation";
import { can } from "@/features/lib/permissions";
import { reportsHref } from "@/features/lib/hrefs";
import { Screen } from "@/features/components/layout/screen";
import { ConfirmBadge, LiveTabs } from "@/features/components/ui";

export const REPORT_TABS = [
  { key: "estimates", label: "Estimates Log", icon: <FileSpreadsheet /> },
  { key: "jobs_sold", label: "Jobs Sold", icon: <Briefcase /> },
  { key: "sales", label: "Sales Goal", icon: <TrendingUp /> },
  { key: "production", label: "Jobs To Do", icon: <ClipboardList /> },
  { key: "job_performance", label: "Job Performance", icon: <BarChart3 />, isNew: true, feature: 21 },
  { key: "summary", label: "Stats", icon: <Target /> },
  { key: "activity", label: "Activity Log", icon: <Activity /> },
  { key: "estimating_feedback", label: "Estimating Feedback", icon: <Gauge />, isNew: true, feature: 30 },
  { key: "job_margin", label: "Job Margin", icon: <Landmark />, isNew: true, feature: 33, finance: true },
  { key: "income_expense", label: "Income & Expense", icon: <Coins />, isNew: true, feature: 33, finance: true },
  { key: "aged_receivables", label: "Aged Receivables", icon: <Clock3 />, isNew: true, feature: 33, finance: true },
] as const;

export type ReportTabKey = (typeof REPORT_TABS)[number]["key"];

export function ReportsFrame({ tab, children }: { tab: ReportTabKey; children: ReactNode }) {
  const user = useCurrentUser();
  const nav = useNav();
  const meta = REPORT_TABS.find((t) => t.key === tab)!;
  const finance = can(user, "finance.reports");
  return (
    <Screen crumbs={[{ label: "Reports" }]} bare>
      <div className="w-full overflow-auto bg-gray-50/50 px-4 py-8 pb-32 md:px-8 lg:px-12">
        <h1 className="mb-2 font-heading text-3xl font-black tracking-tight text-gray-900 md:text-4xl">Reports &amp; Analytics</h1>
        <p className="mb-6 text-gray-500">Performance metrics, job logs, and financial forecasting.</p>
        <LiveTabs<ReportTabKey>
          variant="track"
          className="mb-8"
          value={tab}
          onChange={(k) => nav.push(reportsHref(k))}
          tabs={REPORT_TABS.map((t) => ({ key: t.key, label: t.label, icon: t.icon, isNew: "isNew" in t && t.isNew, feature: "feature" in t ? t.feature : undefined, hidden: "finance" in t && t.finance && !finance }))}
        />
        {"finance" in meta && meta.finance && <div className="-mt-5 mb-5"><ConfirmBadge /></div>}
        {children}
      </div>
    </Screen>
  );
}
