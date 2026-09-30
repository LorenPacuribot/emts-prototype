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
import { Activity, BarChart3, Briefcase, ClipboardList, Clock3, Coins, FileSpreadsheet, Gauge, Landmark, Target, TrendingUp, type LucideIcon } from "lucide-react";
import { useCurrentUser } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { reportsHref } from "@/features/lib/hrefs";
import { Screen } from "@/features/components/layout/screen";
import { AreaNav, type Area } from "@/features/components/layout/area-nav";
import { ConfirmBadge } from "@/features/components/ui";

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

/** The Reports navigation's areas (L2). Activity Log is a link on the right. */
const REPORT_AREAS: { key: string; label: string; tabs: ReportTabKey[] }[] = [
  { key: "sales", label: "Sales", tabs: ["estimates", "jobs_sold", "sales", "summary"] },
  { key: "production", label: "Production", tabs: ["production", "job_performance", "estimating_feedback"] },
  { key: "finance", label: "Finance", tabs: ["job_margin", "income_expense", "aged_receivables"] },
];

/** Icon components for the navigation (REPORT_TABS holds rendered icons). */
const TAB_ICON: Record<ReportTabKey, LucideIcon> = {
  estimates: FileSpreadsheet, jobs_sold: Briefcase, sales: TrendingUp, production: ClipboardList, job_performance: BarChart3, summary: Target,
  activity: Activity, estimating_feedback: Gauge, job_margin: Landmark, income_expense: Coins, aged_receivables: Clock3,
};

export function ReportsFrame({ tab, children }: { tab: ReportTabKey; children: ReactNode }) {
  const user = useCurrentUser();
  const meta = REPORT_TABS.find((t) => t.key === tab)!;
  const finance = can(user, "finance.reports");
  // The tab stays in ?tab= (reportsHref). Finance reports are hidden, as before, for roles without finance.
  const hidden = (k: ReportTabKey) => { const t = REPORT_TABS.find((x) => x.key === k)!; return "finance" in t && t.finance && !finance; };
  const areas: Area[] = REPORT_AREAS.map((a) => ({
    key: a.key, label: a.label,
    pages: a.tabs.filter((k) => !hidden(k)).map((k) => ({ href: reportsHref(k), label: REPORT_TABS.find((t) => t.key === k)!.label, icon: TAB_ICON[k], active: k === tab })),
  }));
  return (
    <Screen crumbs={[{ label: "Reports" }]} bare>
      <div className="w-full overflow-auto bg-gray-50/50 px-4 py-8 pb-32 md:px-8 lg:px-12">
        <div className="mx-auto w-full max-w-[1440px]">
          <h1 className="mb-2 font-heading text-3xl font-black tracking-tight text-gray-900 md:text-4xl">Reports &amp; Analytics</h1>
          <p className="mb-6 text-gray-500">Performance metrics, job logs, and financial forecasting.</p>
          <div className="mb-8">
            <AreaNav label="Report areas" areas={areas} elsewhere={[{ href: reportsHref("activity"), label: "Activity Log", active: tab === "activity" }]} />
          </div>
          {"finance" in meta && meta.finance && <div className="-mt-5 mb-5"><ConfirmBadge /></div>}
          {children}
        </div>
      </div>
    </Screen>
  );
}
