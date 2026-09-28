'use client';

/*
  NEW dashboard cards, embedded from the feature prototype (features/).
  They read the prototype store (kept in sync with ours by the bridge) and
  follow the prototype's access rules for the current demo user:
    - Time to Approve (22)            time.approve
    - Change Order Exceptions (24)    co.exceptions, opens the daily list in a drawer
    - Supplier Order Exceptions (19)  supplier.submit
    - Repaint Alerts (27, 29)         alerts.queue
  Plus the prototype-only "Demo journey" card with the journey steps and
  Start / Resume product tour. It carries data-tour="walkthrough" (tour stop 1).
*/
import React from 'react';
import Link from 'next/link';
import { AlertTriangle, BellRing, Compass, FileDiff, PackageSearch, Sparkles, Timer } from 'lucide-react';
import type { Database } from '@/features/types';
import { useCurrentUser, useDb as useFeatureDb } from '@/features/lib/store';
import { can } from '@/features/lib/permissions';
import { byId, propertyAddress } from '@/features/lib/selectors';
import { now } from '@/features/lib/clock';
import { ackException } from '@/features/lib/rules/procurement';
import { alertQueueState } from '@/features/lib/rules/alerts';
import { canResume, useTour } from '@/features/lib/tour';
import { useStartTour } from '@/features/components/tour/product-tour';
import { Drawer, NewBadge } from '@/features/components/ui';
import { ChangeOrderExceptionsPanel } from '@/features/components/features/change-orders/exceptions-panel';
import { ALSO_NEW, JOURNEY } from '@/features/components/features/dashboard/dashboard-screen';
import { EmptyLine, SectionHeader } from './SectionHeader';

export type FeatureCardId = 'time-to-approve' | 'co-exceptions' | 'po-exceptions' | 'repaint-alerts';

export const FEATURE_CARD_TITLES: Record<FeatureCardId, string> = {
  'time-to-approve': 'Time to Approve',
  'co-exceptions': 'Change Order Exceptions',
  'po-exceptions': 'Supplier Order Exceptions',
  'repaint-alerts': 'Repaint Alerts',
};

/** Which NEW cards the current demo user may see. */
export function useFeatureCardAccess(): Record<FeatureCardId, boolean> {
  const user = useCurrentUser();
  return {
    'time-to-approve': can(user, 'time.approve'),
    'co-exceptions': can(user, 'co.exceptions'),
    'po-exceptions': can(user, 'supplier.submit'),
    'repaint-alerts': can(user, 'alerts.queue'),
  };
}

function coExceptions(db: Database) {
  return db.changeOrders.filter((c) => !c.isColourReapproval && (Object.values(c.downstream).includes('failed') || (c.emergency && !c.emergency.writtenConfirmedAt)));
}


function Big({ children }: { children: React.ReactNode }) {
  return <div className="text-3xl font-black leading-none text-gray-900">{children}</div>;
}

/* ---------- Time to Approve (22) ---------- */

export function TimeToApproveWidget() {
  const db = useFeatureDb((d) => d);
  const count = db.timeEntries.filter((e) => e.state === 'submitted').length;
  return (
    <div className="flex h-full flex-col" data-tour="widget-time">
      <SectionHeader title="Time to Approve" icon={Timer} colorClass="text-primary-600" href="/time" right={<NewBadge feature={22} />} />
      <Big>{count}</Big>
      <p className="mt-2 text-xs text-gray-500">submitted crew days waiting for approval. Only approved hours reach payroll and job cost.</p>
    </div>
  );
}

/* ---------- Change Order Exceptions (24) ---------- */

export function ChangeOrderExceptionsWidget({ onOpen }: { onOpen: () => void }) {
  const db = useFeatureDb((d) => d);
  const count = coExceptions(db).length;
  return (
    <div className="flex h-full flex-col" data-tour="widget-co-exceptions">
      <SectionHeader title="Change Order Exceptions" icon={FileDiff} colorClass="text-amber-600" right={<NewBadge feature={24} />} />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Big>{count}</Big>
          <p className="mt-2 text-xs text-gray-500">failed downstream updates or emergency work waiting for written confirmation (checked daily at 7 a.m.)</p>
        </div>
        <button
          onClick={onOpen}
          className="shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 shadow-sm hover:border-primary-300 hover:text-primary-700"
        >
          Open list
        </button>
      </div>
    </div>
  );
}

export function ChangeOrderExceptionsDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="max-w-4xl"
      title={<span className="inline-flex items-center gap-2">Change Order Exceptions <NewBadge feature={24} /></span>}
      subtitle="Daily 7 a.m. list for the office manager"
    >
      {open && <ChangeOrderExceptionsPanel />}
    </Drawer>
  );
}

/* ---------- Supplier Order Exceptions (19) ---------- */

export function SupplierOrderExceptionsWidget() {
  const db = useFeatureDb((d) => d);
  const nowIso = now();
  const list = db.purchaseOrders.filter((p) => ackException(p, db.users, nowIso)?.overdue || p.uncertainSend || p.status === 'problem');
  return (
    <div className="flex h-full flex-col">
      <SectionHeader title="Supplier Order Exceptions" icon={PackageSearch} colorClass="text-red-600" href="/supplier-orders?view=exceptions" right={<NewBadge feature={19} />} />
      <div className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {list.length === 0 ? (
          <EmptyLine>No supplier exceptions.</EmptyLine>
        ) : (
          list.slice(0, 4).map((p) => (
            <Link key={p.id} href={`/supplier-orders?po=${p.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm hover:border-primary-200">
              <span className="inline-flex min-w-0 items-center gap-1.5 truncate font-bold text-gray-900"><AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />{p.id}</span>
              <span className="shrink-0 text-xs text-gray-400">{p.uncertainSend ? 'Send uncertain' : p.status === 'problem' ? 'Problem' : 'Not acknowledged'}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

/* ---------- Repaint Alerts (27, 29) ---------- */

export function RepaintAlertsWidget() {
  const db = useFeatureDb((d) => d);
  const nowIso = now();
  const alerts = db.repaintAlerts.filter((a) => alertQueueState(db, a, nowIso).state === 'live');
  return (
    <div className="flex h-full flex-col" data-tour="widget-repaint-alerts">
      <SectionHeader title="Repaint Alerts" icon={BellRing} colorClass="text-amber-600" href="/repaint-alerts" right={<NewBadge feature={[27, 29]} />} />
      <Big>{alerts.length}</Big>
      <p className="mb-3 mt-1 text-xs text-gray-500">alerts due in the queue</p>
      <div className="custom-scrollbar min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {alerts.slice(0, 3).map((a) => (
          <Link key={a.id} href={`/repaint-alerts?alert=${a.id}`} className="block truncate text-sm font-semibold text-gray-800 hover:text-primary-700">
            {propertyAddress(byId(db.properties, a.propertyId))}
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ---------- Demo journey (prototype only) ---------- */

export function DemoWalkthroughCard() {
  const startTour = useStartTour();
  const tourStop = useTour((s) => s.stop);
  const resumable = useTour((s) => !s.active && canResume(s));
  const btn = 'inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold shadow-sm transition-colors';
  return (
    <div className="mb-6 rounded-2xl border border-dashed border-emerald-300 bg-gradient-to-r from-emerald-50/80 to-white p-5" data-tour="walkthrough">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-emerald-800">
          <Sparkles className="h-4 w-4" /> Demo journey
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] tracking-wider">Prototype only</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {resumable && (
            <button onClick={() => startTour(true)} className={`${btn} border border-gray-200 bg-white text-gray-700 hover:border-gray-300`}>
              Resume at stop {tourStop + 1}
            </button>
          )}
          <button onClick={() => startTour(false)} className={`${btn} bg-primary-600 text-white hover:bg-primary-700`}>
            <Compass className="h-3.5 w-3.5" /> {resumable ? 'Start over' : 'Start product tour'}
          </button>
        </div>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {JOURNEY.map((j, i) => (
          <li key={j.title}>
            <Link href={j.href} className="group flex h-full items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 hover:border-primary-300">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[11px] font-bold text-white">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-gray-900 group-hover:text-primary-700">
                  {j.title}
                  {j.features && <span className="font-medium text-gray-400"> · F{j.features}</span>}
                </span>
                <span className="block text-xs text-gray-500">{j.body}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-bold text-gray-500">Also new:</span>
        {ALSO_NEW.map((a) => (
          <Link key={a.label} href={a.href} className="rounded-full border border-gray-200 bg-white px-2.5 py-1 font-semibold text-gray-700 hover:border-primary-300">
            {a.label}
          </Link>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-500">Switch roles, pin the clock to business hours or reset the demo data in the Prototype bar (bottom left).</p>
    </div>
  );
}
