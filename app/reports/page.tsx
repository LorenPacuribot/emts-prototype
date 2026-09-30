'use client';

/*
  Reports & Analytics (/reports)

  Purpose: performance numbers and logs for the business, in six tabs that
  match the live app: Estimates Log, Jobs Sold, Sales Goal, Jobs To Do,
  Stats and Activity Log. Every tab reads live from the store, has a date
  range filter (Stats is yearly) and exports its rows to CSV.

  NEW tabs (green NEW badge, from features/): Estimated vs Actual (21) next to
  Jobs To Do, Estimating Feedback (30) and the finance reports Job Margin,
  Income & Expense, Aged Receivables (33, needs client confirmation; only
  for finance roles). See components/reports/FeatureTabs.tsx.

  The active tab is kept in the URL (?tab=estimates|jobs_sold|sales|production|job_performance|summary|activity|
  estimating_feedback|job_margin|income_expense|aged_receivables) so dashboard links and the product tour can open a
  specific tab. The tab is read from the URL on every render, so a link to
  another tab works while the page is already open.
*/
import React, { Suspense, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Activity, BarChart3, Briefcase, ClipboardList, Clock3, Coins, FileSpreadsheet, Gauge, Landmark, Target, TrendingUp, Users } from 'lucide-react';
import { PageShell } from '@/components/Navigation';
import { AreaNav, type Area } from '@/features/components/layout/area-nav';
import { EstimatesLogTab, JobsSoldTab, JobsToDoTab, SalesByEstimatorTab } from '@/components/reports/TableTabs';
import { NewBadge, VersionBadge, VersionScreenGate } from '@/features/components/ui';
import { isVisible, useVersion } from '@/features/lib/prototype-version';
import { SalesGoalTab, StatsTab } from '@/components/reports/GoalTabs';
import { ActivityLogTab } from '@/components/reports/ActivityTab';
import { FeatureTabBody, FINANCE_TABS, NewTabBadge, useCanSeeFinanceReports, type FeatureTabKey } from '@/components/reports/FeatureTabs';
import type { DateRange } from '@/components/reports/data';

const TABS = [
  { key: 'estimates', label: 'Estimates Log', icon: FileSpreadsheet },
  { key: 'jobs_sold', label: 'Jobs Sold', icon: Briefcase },
  { key: 'sales_estimator', label: 'Sales by Estimator', icon: Users, item: 'RP-C2' },
  { key: 'sales', label: 'Sales Goal', icon: TrendingUp },
  { key: 'production', label: 'Jobs To Do', icon: ClipboardList },
  { key: 'job_performance', label: 'Estimated vs Actual', icon: BarChart3, isNew: true },
  { key: 'summary', label: 'Stats', icon: Target },
  { key: 'activity', label: 'Activity Log', icon: Activity },
  { key: 'estimating_feedback', label: 'Estimating Feedback', icon: Gauge, isNew: true },
  { key: 'job_margin', label: 'Job Margin', icon: Landmark, isNew: true },
  { key: 'income_expense', label: 'Income & Expense', icon: Coins, isNew: true },
  { key: 'aged_receivables', label: 'Aged Receivables', icon: Clock3, isNew: true },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/** The report areas (L2). Activity Log sits on the right as a link. */
const REPORT_AREAS: { key: string; label: string; tabs: TabKey[] }[] = [
  { key: 'sales', label: 'Sales', tabs: ['estimates', 'jobs_sold', 'sales_estimator', 'sales', 'summary'] },
  { key: 'production', label: 'Production', tabs: ['production', 'job_performance', 'estimating_feedback'] },
  { key: 'finance', label: 'Finance', tabs: ['job_margin', 'income_expense', 'aged_receivables'] },
];

function ReportsInner() {
  const params = useSearchParams();
  const pathname = usePathname();
  const finance = useCanSeeFinanceReports();
  const param = params.get('tab');
  const tab: TabKey = TABS.some((t) => t.key === param) ? (param as TabKey) : 'estimates';
  const [range, setRange] = useState<DateRange>({ start: '', end: '' });
  const year = new Date().getFullYear();
  const version = useVersion((s) => s.version);
  // Complete-only tabs (30 Sep call items) are left out of the Minimal version.
  const visible = TABS.filter((t) => (finance || !FINANCE_TABS.includes(t.key as FeatureTabKey)) && (!('item' in t) || isVisible(t.item, version)));

  // Same URL as before: ?tab= set, ?rate= dropped, replaced (no new history entry), no scroll.
  const hrefFor = (t: TabKey) => {
    const q = new URLSearchParams(params.toString());
    q.set('tab', t);
    q.delete('rate');
    return `${pathname}?${q.toString()}`;
  };
  // Two levels (L1, L2): Sales, Production and Finance, then the chosen area's reports.
  // Finance only for roles that see finance reports, as before. Activity Log is a link on the right.
  const page = (key: TabKey) => {
    const t = TABS.find((x) => x.key === key)!;
    return { href: hrefFor(key), label: t.label, icon: t.icon, active: tab === key, marker: 'isNew' in t && t.isNew ? <NewTabBadge tab={key as FeatureTabKey} /> : 'item' in t ? <><NewBadge /><VersionBadge item={t.item} /></> : undefined };
  };
  const areas: Area[] = REPORT_AREAS.map((a) => ({ key: a.key, label: a.label, pages: a.tabs.filter((k) => visible.some((t) => t.key === k)).map(page) }));

  return (
    <PageShell title="Reports" contentClassName="min-h-full bg-gray-50/50 px-4 py-8 pb-32 md:px-8 lg:px-12">
      <div className="mb-10 flex flex-col gap-6">
        <div>
          <h1 className="mb-2 font-heading text-3xl font-black tracking-tight text-gray-900 md:text-4xl">Reports &amp; Analytics</h1>
          <p className="text-base font-medium text-gray-500 md:text-lg">Performance metrics, job logs, and financial forecasting.</p>
        </div>
        <AreaNav label="Report areas" replace areas={areas} elsewhere={[{ href: hrefFor('activity'), label: 'Activity Log', active: tab === 'activity' }]} />
      </div>

      {tab === 'estimates' && <EstimatesLogTab year={year} range={range} setRange={setRange} />}
      {tab === 'jobs_sold' && <JobsSoldTab year={year} range={range} setRange={setRange} />}
      {tab === 'sales_estimator' && (
        <VersionScreenGate item="RP-C2">
          <SalesByEstimatorTab year={year} range={range} setRange={setRange} />
        </VersionScreenGate>
      )}
      {tab === 'sales' && <SalesGoalTab year={year} range={range} setRange={setRange} />}
      {tab === 'production' && <JobsToDoTab year={year} range={range} setRange={setRange} />}
      {tab === 'summary' && <StatsTab year={year} />}
      {tab === 'activity' && <ActivityLogTab range={range} setRange={setRange} />}
      {TABS.find((t) => t.key === tab && 'isNew' in t) && <FeatureTabBody key={tab} tab={tab as FeatureTabKey} />}
    </PageShell>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <ReportsInner />
    </Suspense>
  );
}
