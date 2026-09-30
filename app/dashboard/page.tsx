'use client';

/*
  Dashboard (/dashboard)

  Purpose: the home screen. It greets the user and shows 14 cards that sum up
  sales, schedule, jobs and money at a glance. Every number is computed live
  from the local store (components/dashboard/metrics.ts).

  Layout: three columns on large screens, like the live app's default grid
  (left 3/12, center 6/12, right 3/12). Card heights follow the live grid
  rows (80px rows, 16px gaps). On small screens the cards stack.

  Customize: turns on edit mode. Each card gets a "hide" button, and hidden
  cards can be shown again from the bar at the top. The choice is saved in
  localStorage (per browser), so it survives a refresh.

  NEW (feature prototype, components/dashboard/FeatureWidgets.tsx): the
  Demo journey card above the grid (Start / Resume product tour) and the
  Time to Approve (22), Change Order Exceptions (24), Supplier Order
  Exceptions (19) and Repaint Alerts (27, 29) cards, each shown only to the
  roles the prototype allows. ?open=co-exceptions opens the exception list.
  The greeting names the current demo user (Prototype bar), not the profile.
*/
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Eye, EyeOff, RotateCcw, Settings2 } from 'lucide-react';
import { PageShell } from '@/components/Navigation';
import { useCurrentUser, useDb } from '@/lib/store';
import { cn } from '@/lib/utils';
import { computeDashboard, type PeriodValue } from '@/components/dashboard/metrics';
import { useSalesExtra } from '@/components/reports/useSalesExtra';
import { CreateMenu, PeriodFilter } from '@/components/dashboard/HeaderControls';
import { ActivityWidget, JobsToDoWidget, MessagesWidget, RecentLeadsWidget, TasksWidget } from '@/components/dashboard/LeftWidgets';
import { InvoicesDueWidget, PendingSalesWidget, RevenueWidget, ScheduleAgendaWidget, WinRateWidget } from '@/components/dashboard/CenterWidgets';
import { ActiveJobsWidget, EstimateStatusWidget, MonthlyGoalWidget, PipelineWidget } from '@/components/dashboard/RightWidgets';
import {
  ChangeOrderExceptionsDrawer, ChangeOrderExceptionsWidget, DemoWalkthroughCard, FEATURE_CARD_TITLES, RepaintAlertsWidget, SupplierOrderExceptionsWidget,
  TimeToApproveWidget, useFeatureCardAccess, type FeatureCardId,
} from '@/components/dashboard/FeatureWidgets';
import { useVisibility } from '@/features/lib/feature-visibility';
import { NewFeaturesPanel } from '@/components/dashboard/NewFeaturesPanel';

const HIDDEN_KEY = 'emts-dashboard-hidden-cards-v1';

type CardId =
  | 'tasks' | 'messages' | 'recent-leads' | 'jobs-to-do' | 'activity'
  | 'pending-sales' | 'win-rate' | 'revenue' | 'schedule-agenda' | 'invoices-due'
  | 'estimate-status' | 'monthly-goal' | 'active-jobs' | 'pipeline'
  | FeatureCardId;

/** Card titles, used in the Customize bar. */
const CARD_TITLES: Record<CardId, string> = {
  tasks: 'My Tasks', messages: 'Messages', 'recent-leads': 'Recent Leads', 'jobs-to-do': 'Jobs To Do', activity: 'Activity',
  'pending-sales': 'Pending Sales', 'win-rate': 'Win Rate', revenue: 'Revenue', 'schedule-agenda': 'Schedule Agenda',
  'invoices-due': 'Invoices Due', 'estimate-status': 'Estimate Status', 'monthly-goal': 'Monthly Goal', 'active-jobs': 'Active Jobs', pipeline: 'Pipeline',
  ...FEATURE_CARD_TITLES,
};

/** Grid row heights from the live layout: h3 = 272px, h4 = 368px, h5 = 464px. */
const H = { 2: 'lg:h-[176px]', 3: 'lg:h-[272px]', 4: 'lg:h-[368px]', 5: 'lg:h-[464px]' } as const;

function loadHidden(): CardId[] {
  try {
    const raw = window.localStorage.getItem(HIDDEN_KEY);
    return raw ? (JSON.parse(raw) as CardId[]) : [];
  } catch {
    return [];
  }
}

function DashboardInner() {
  const db = useDb();
  const user = useCurrentUser();
  const access = useFeatureCardAccess();
  // The green NEW outline follows "Show NEW badges on screens" (New Features).
  const showBadges = useVisibility((s) => s.showBadges);
  const [coPanel, setCoPanel] = useState(useSearchParams().get('open') === 'co-exceptions');
  const [period, setPeriod] = useState<PeriodValue>({ preset: 'this_month' });
  const [editMode, setEditMode] = useState(false);
  const [hidden, setHidden] = useState<CardId[]>([]);

  useEffect(() => setHidden(loadHidden()), []);
  const saveHidden = (next: CardId[]) => {
    setHidden(next);
    try {
      window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    } catch {
      /* storage blocked: keep it for this visit only */
    }
  };

  const salesExtra = useSalesExtra();
  const data = useMemo(() => computeDashboard(db, period, salesExtra), [db, period, salesExtra]);
  // The current demo user (switched in the Prototype bar), synced from the feature store.
  const userName = `${user.firstName} ${user.lastName}`.trim();

  /** Wraps a widget in the white card, with the hide button in edit mode. */
  const card = (id: CardId, height: keyof typeof H, padding: string, content: React.ReactNode, extra = '') => {
    if (hidden.includes(id)) return null;
    const isNew = id in FEATURE_CARD_TITLES;
    if (isNew && !access[id as FeatureCardId]) return null;
    return (
      <div key={id} className={cn('group/card relative', H[height], extra)}>
        {editMode && (
          <>
            <button
              onClick={() => saveHidden([...hidden, id])}
              className="absolute -top-2 right-2 z-10 rounded-full border border-gray-200 bg-white p-1.5 text-gray-500 shadow-md transition-colors hover:text-red-500"
              title={`Hide ${CARD_TITLES[id]}`}
              aria-label={`Hide ${CARD_TITLES[id]}`}
            >
              <EyeOff className="h-3.5 w-3.5" />
            </button>
            <div className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-dashed ring-gray-300" />
          </>
        )}
        <div className={cn('h-full overflow-hidden rounded-2xl bg-white shadow-sm', isNew && showBadges && 'border border-green-300 ring-1 ring-green-100', padding)}>{content}</div>
      </div>
    );
  };

  const winRate = card('win-rate', 5, 'p-6 flex flex-col items-center', <WinRateWidget data={data.winRate} />, 'flex-1 min-w-0');
  const revenue = card('revenue', 5, 'p-4 lg:p-8 flex flex-col justify-center', <RevenueWidget data={data.revenue} />, 'flex-1 min-w-0');

  const left = [
    card('tasks', 3, 'p-5', <TasksWidget />),
    card('time-to-approve', 2, 'p-5', <TimeToApproveWidget />),
    card('messages', 3, 'p-5', <MessagesWidget items={data.messages} />),
    card('recent-leads', 3, 'p-5', <RecentLeadsWidget leads={data.recentLeads} />),
    card('jobs-to-do', 4, 'p-4', <JobsToDoWidget jobs={data.jobsToDo} />),
    card('activity', 3, 'p-5', <ActivityWidget items={data.activity} />),
  ];
  const center = [
    card('pending-sales', 4, 'p-6', <PendingSalesWidget rows={data.pending} pipelineValue={data.pipelineValue} />),
    winRate || revenue ? (
      <div key="row" className="flex flex-col gap-4 md:flex-row">
        {winRate}
        {revenue}
      </div>
    ) : null,
    card('co-exceptions', 2, 'p-5', <ChangeOrderExceptionsWidget onOpen={() => setCoPanel(true)} />),
    card('po-exceptions', 3, 'p-5', <SupplierOrderExceptionsWidget />),
    card('schedule-agenda', 4, 'p-6', <ScheduleAgendaWidget items={data.agenda} />),
    card('invoices-due', 3, 'p-6 flex flex-col', <InvoicesDueWidget invoices={data.invoicesDue} />),
  ];
  const right = [
    card('repaint-alerts', 3, 'p-5', <RepaintAlertsWidget />),
    card('estimate-status', 4, 'p-6', <EstimateStatusWidget data={data.estimateStatus} />),
    card('monthly-goal', 4, 'p-6', <MonthlyGoalWidget data={data.goal} />),
    card('active-jobs', 4, 'p-5', <ActiveJobsWidget jobs={data.activeJobs} />),
    card('pipeline', 4, 'p-4', <PipelineWidget stages={data.stages} />),
  ];

  return (
    <PageShell title="Dashboard" breadcrumbs={['Home']} contentClassName="bg-gray-100 min-h-full px-4 py-8 md:px-8 lg:px-12">
      {/* Header */}
      <div className="mb-6 flex flex-col items-start justify-between gap-4 md:mb-8 lg:flex-row lg:items-center">
        <div>
          <h1 className="font-heading text-3xl font-black leading-none tracking-tighter text-gray-900">{userName ? `Hi, ${userName}` : 'Dashboard'}</h1>
          <p className="mt-1 font-medium text-gray-500">
            Here&apos;s what&apos;s happening with your <span className="font-bold text-primary-600">projects</span> today.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {editMode && hidden.length > 0 && (
            <button
              onClick={() => saveHidden([])}
              title="Restore default layout"
              aria-label="Restore default layout"
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-700 shadow-sm hover:border-gray-300 md:h-12 md:w-12"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => setEditMode((e) => !e)}
            className={cn(
              'flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-bold shadow-sm transition-colors md:h-12',
              editMode ? 'border-primary-700 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
            )}
          >
            <Settings2 className="h-4 w-4" />
            {editMode ? 'Done' : 'Customize'}
          </button>
          <PeriodFilter value={period} onChange={setPeriod} />
          <CreateMenu />
        </div>
      </div>

      {/* Hidden cards bar (edit mode only) */}
      {editMode && (
        <div className="mb-6 rounded-2xl border border-dashed border-gray-300 bg-white/70 p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-gray-500">Hidden cards</p>
          {hidden.length === 0 ? (
            <p className="text-xs italic text-gray-500">All cards are showing. Use the eye button on a card to hide it.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {hidden.filter((id) => !(id in FEATURE_CARD_TITLES) || access[id as FeatureCardId]).map((id) => (
                <button
                  key={id}
                  onClick={() => saveHidden(hidden.filter((h) => h !== id))}
                  className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:border-primary-300 hover:text-primary-700"
                >
                  <Eye className="h-3.5 w-3.5" /> {CARD_TITLES[id]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Prototype only: switch new features on or off (#new-features). */}
      <NewFeaturesPanel />

      {/* NEW: prototype-only demo journey + product tour */}
      <DemoWalkthroughCard />

      {/* Card grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-3">{left}</div>
        <div className="flex flex-col gap-4 lg:col-span-6">{center}</div>
        <div className="flex flex-col gap-4 lg:col-span-3">{right}</div>
      </div>

      {editMode && (
        <div className="mt-4 text-center text-xs font-medium text-gray-500">
          Use the eye button to hide a card. Click &quot;Done&quot; when finished.
        </div>
      )}
      <ChangeOrderExceptionsDrawer open={coPanel} onOpenChange={setCoPanel} />
    </PageShell>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-100" />}>
      <DashboardInner />
    </Suspense>
  );
}
