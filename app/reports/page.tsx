'use client';

/*
  Reports & Analytics (/reports)

  Purpose: performance numbers and logs for the business, in six tabs that
  match the live app: Estimates Log, Jobs Sold, Sales Goal, Jobs To Do,
  Stats and Activity Log. Every tab reads live from the store, has a date
  range filter (Stats is yearly) and exports its rows to CSV.

  NEW tabs (green NEW badge, from features/): Job Performance (21) next to
  Jobs To Do, Estimating Feedback (30) and the finance reports Job Margin,
  Income & Expense, Aged Receivables (33, needs client confirmation; only
  for finance roles). See components/reports/FeatureTabs.tsx.

  The active tab is kept in the URL (?tab=estimates|jobs_sold|sales|production|job_performance|summary|activity|
  estimating_feedback|job_margin|income_expense|aged_receivables) so dashboard links and the product tour can open a
  specific tab. The tab is read from the URL on every render, so a link to
  another tab works while the page is already open.
*/
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Activity, BarChart3, Briefcase, ClipboardList, Clock3, Coins, FileSpreadsheet, Gauge, Landmark, Target, TrendingUp } from 'lucide-react';
import { PageShell } from '@/components/Navigation';
import { TabButton } from '@/components/reports/shared';
import { EstimatesLogTab, JobsSoldTab, JobsToDoTab } from '@/components/reports/TableTabs';
import { SalesGoalTab, StatsTab } from '@/components/reports/GoalTabs';
import { ActivityLogTab } from '@/components/reports/ActivityTab';
import { FeatureTabBody, FINANCE_TABS, NewTabBadge, useCanSeeFinanceReports, type FeatureTabKey } from '@/components/reports/FeatureTabs';
import type { DateRange } from '@/components/reports/data';

const TABS = [
  { key: 'estimates', label: 'Estimates Log', icon: FileSpreadsheet },
  { key: 'jobs_sold', label: 'Jobs Sold', icon: Briefcase },
  { key: 'sales', label: 'Sales Goal', icon: TrendingUp },
  { key: 'production', label: 'Jobs To Do', icon: ClipboardList },
  { key: 'job_performance', label: 'Job Performance', icon: BarChart3, isNew: true },
  { key: 'summary', label: 'Stats', icon: Target },
  { key: 'activity', label: 'Activity Log', icon: Activity },
  { key: 'estimating_feedback', label: 'Estimating Feedback', icon: Gauge, isNew: true },
  { key: 'job_margin', label: 'Job Margin', icon: Landmark, isNew: true },
  { key: 'income_expense', label: 'Income & Expense', icon: Coins, isNew: true },
  { key: 'aged_receivables', label: 'Aged Receivables', icon: Clock3, isNew: true },
] as const;
type TabKey = (typeof TABS)[number]['key'];

function ReportsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const finance = useCanSeeFinanceReports();
  const param = params.get('tab');
  const tab: TabKey = TABS.some((t) => t.key === param) ? (param as TabKey) : 'estimates';
  const [range, setRange] = useState<DateRange>({ start: '', end: '' });
  const year = new Date().getFullYear();
  const trackRef = useRef<HTMLDivElement>(null);
  // Deep links (e.g. ?tab=estimating_feedback on a phone) bring the active tab into view in the scrolling track.
  useEffect(() => {
    const track = trackRef.current;
    const el = track?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (track && el && track.scrollWidth > track.clientWidth) track.scrollLeft = el.offsetLeft - track.offsetLeft - 8;
  }, [tab]);
  const visible = TABS.filter((t) => finance || !FINANCE_TABS.includes(t.key as FeatureTabKey));

  const setTab = useCallback(
    (t: TabKey) => {
      const q = new URLSearchParams(params.toString());
      q.set('tab', t);
      q.delete('rate');
      router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    },
    [params, router, pathname],
  );

  return (
    <PageShell title="Reports" contentClassName="min-h-full bg-gray-50/50 px-4 py-8 pb-32 md:px-8 lg:px-12">
      <div className="mb-10 flex flex-col items-start justify-between gap-6">
        <div>
          <h1 className="mb-2 font-heading text-3xl font-black tracking-tight text-gray-900 md:text-4xl">Reports &amp; Analytics</h1>
          <p className="text-base font-medium text-gray-500 md:text-lg">Performance metrics, job logs, and financial forecasting.</p>
        </div>
        <div ref={trackRef} role="tablist" className="flex w-full max-w-full overflow-x-auto lg:flex-wrap rounded-xl border border-gray-200 bg-gray-100 p-1.5 md:w-auto">
          {visible.map((t) => (
            <TabButton
              key={t.key}
              active={tab === t.key}
              onClick={() => setTab(t.key)}
              icon={t.icon}
              label={t.label}
              badge={'isNew' in t && t.isNew ? <NewTabBadge tab={t.key as FeatureTabKey} /> : undefined}
            />
          ))}
        </div>
      </div>

      {tab === 'estimates' && <EstimatesLogTab year={year} range={range} setRange={setRange} />}
      {tab === 'jobs_sold' && <JobsSoldTab year={year} range={range} setRange={setRange} />}
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
