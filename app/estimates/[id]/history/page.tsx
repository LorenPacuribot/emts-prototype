'use client';

/*
  /estimates/[id]/history - every saved version of an estimate, newest first
  (live: estimates/history). Each card shows what happened, the status at
  that time, who made the change, when, and the total. The total change
  from the previous version is shown with the old value struck through.
  NEW (feature 24): the change-order events of the estimate's prototype
  twin (created, sent, approved, rejected) appear in the same timeline.
*/
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CheckCircle2, Eye, FileDiff, FilePlus, FilePlus2, FileQuestion, History, Save, Send, XCircle } from 'lucide-react';
import type { EstimateVersion } from '@/lib/types';
import { PageShell } from '@/components/Navigation';
import { EmptyState, ListSkeleton } from '@/components/ui/display';
import { useCollection } from '@/lib/store';
import { cn, money } from '@/lib/utils';
import { EstimateStatusBadge } from '@/components/estimates/StatusBadge';
import { useProtoEstimate } from '@/components/estimates/FeatureSections';
import { coPricing, jobChangeOrders } from '@/features/lib/store/actions/change-orders';
import { byId } from '@/features/lib/selectors';
import { NewBadge } from '@/features/components/ui';

/** NEW (24): change-order triggers, as on the live history (EstimateHistoryEntry.trigger). */
const CO_TRIGGER = {
  CHANGE_ORDER_CREATED: { label: 'Change order created', Icon: FilePlus2 },
  CHANGE_ORDER_SENT: { label: 'Change order sent', Icon: Send },
  CHANGE_ORDER_APPROVED: { label: 'Change order approved', Icon: FileDiff },
  CHANGE_ORDER_REJECTED: { label: 'Change order rejected', Icon: XCircle },
  // Amendments opened from the prototype toolbar actions (Amend Estimate, rule D4).
  AMENDMENT_OPENED: { label: 'Amendment opened', Icon: Save },
  SENT_FOR_REAPPROVAL: { label: 'Sent for re-approval', Icon: Send },
} as const;

/** A history event from the prototype twin: a change order (24) or an amendment. */
interface CoEvent { key: string; coId?: string; amendment?: number; trigger: keyof typeof CO_TRIGGER; date: string; actor: string; total: number }

function iconFor(v: EstimateVersion) {
  const n = v.note.toLowerCase();
  if (n.includes('created') || n.includes('duplicated')) return FilePlus;
  if (n.includes('sent')) return Send;
  if (n.includes('viewed')) return Eye;
  if (v.status === 'Approved' || n.includes('signed')) return CheckCircle2;
  if (v.status === 'Rejected') return XCircle;
  return Save;
}

export default function EstimateHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const { get } = useCollection('estimates');
  const e = get(id);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const versions = [...(e?.versions ?? [])].sort((a, b) => b.version - a.version);

  // NEW (24): change-order events from the prototype twin's change orders.
  const { db, job } = useProtoEstimate(id);
  const coEvents: CoEvent[] = [];
  for (const co of job ? jobChangeOrders(db, job.id) : []) {
    const total = coPricing(db, co).total;
    const by = byId(db.users, co.createdBy)?.name ?? 'Team member';
    coEvents.push({ key: co.id + '-c', coId: co.id, trigger: 'CHANGE_ORDER_CREATED', date: co.createdAt, actor: by, total });
    if (co.sentAt) coEvents.push({ key: co.id + '-s', coId: co.id, trigger: 'CHANGE_ORDER_SENT', date: co.sentAt, actor: by, total });
    if (co.decidedAt && co.status === 'approved') coEvents.push({ key: co.id + '-a', coId: co.id, trigger: 'CHANGE_ORDER_APPROVED', date: co.decidedAt, actor: co.signer ?? 'Customer', total });
    if (co.rejection) coEvents.push({ key: co.id + '-r', coId: co.id, trigger: 'CHANGE_ORDER_REJECTED', date: co.rejection.at, actor: co.rejection.signer ?? 'Customer', total });
  }
  for (const h of db.estimateHistory.filter((x) => x.estimateId === id && (x.trigger === 'AMENDMENT_OPENED' || x.trigger === 'SENT_FOR_REAPPROVAL'))) {
    coEvents.push({ key: h.id, amendment: h.amendmentNumber, trigger: h.trigger as 'AMENDMENT_OPENED', date: h.createdAt, actor: byId(db.users, h.userId)?.name ?? 'Team member', total: h.grandTotal });
  }
  type Row = { kind: 'version'; date: string; i: number } | { kind: 'co'; date: string; ev: CoEvent };
  const rows: Row[] = [...versions.map((v, i) => ({ kind: 'version' as const, date: v.date, i })), ...coEvents.map((ev) => ({ kind: 'co' as const, date: ev.date, ev }))]
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <PageShell
      title="Estimate History"
      breadcrumbs={[{ label: 'Estimates', href: '/estimates' }, ...(e ? [{ label: e.estimateNumber, href: `/estimates/${e.id}` }] : [])]}
      backHref={e ? `/estimates/${e.id}` : '/estimates'}
    >
      <div className="mx-auto w-full max-w-4xl">
        {!mounted ? (
          <ListSkeleton rows={4} />
        ) : !e ? (
          <EmptyState icon={<FileQuestion />} title="Estimate not found" message="This estimate may have been deleted." action={<Link href="/estimates" className="text-sm font-bold text-primary-600 hover:underline">Back to Estimates</Link>} />
        ) : (
          <>
            <div className="mb-6">
              <h1 className="font-heading text-2xl font-bold text-gray-900">{e.title}</h1>
              <p className="mt-1 text-sm text-gray-500">
                {e.estimateNumber} · {versions.length} version{versions.length === 1 ? '' : 's'}
                {coEvents.length > 0 && <> · {coEvents.length} change-order and amendment event{coEvents.length === 1 ? '' : 's'}</>}
              </p>
            </div>
            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-white py-20">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-50 text-gray-400"><History className="h-8 w-8" /></div>
                <h3 className="text-lg font-bold text-gray-900">No history yet</h3>
                <p className="text-gray-500">Changes to this estimate will show up here.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {rows.map((r) => {
                  if (r.kind === 'co') return <CoEventCard key={r.ev.key} ev={r.ev} />;
                  const i = r.i;
                  const v = versions[i];
                  const Icon = iconFor(v);
                  const prev = versions[i + 1];
                  const changed = prev && Math.abs(prev.total - v.total) >= 0.01;
                  return (
                    <div key={v.version} className="flex gap-4 rounded-xl border border-gray-200 bg-white p-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600"><Icon className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold text-gray-900">{v.note}</p>
                            <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-bold text-gray-500">v{v.version}</span>
                            <EstimateStatusBadge status={v.status} />
                          </div>
                          <span className="whitespace-nowrap text-xs text-gray-400">
                            {new Date(v.date).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-4">
                          <p className="text-xs text-gray-500">{v.changedBy}</p>
                          <p className="text-sm font-bold text-gray-900">
                            {changed && <span className="mr-1.5 font-medium text-gray-400 line-through">{money(prev.total)}</span>}
                            {money(v.total)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}

function CoEventCard({ ev }: { ev: CoEvent }) {
  const { label, Icon } = CO_TRIGGER[ev.trigger];
  return (
    <div className={cn('flex gap-4 rounded-xl border bg-white p-4', ev.coId ? 'border-green-200' : 'border-gray-200')}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600"><Icon className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-gray-900">{label}</p>
            {ev.coId && <NewBadge feature={24} />}
            {ev.coId && <span className="rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-xs font-bold text-blue-700">{ev.coId}</span>}
            {!!ev.amendment && <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">Amendment #{ev.amendment}</span>}
          </div>
          <span className="whitespace-nowrap text-xs text-gray-400">
            {new Date(ev.date).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-gray-500">{ev.actor}</p>
          <p className="text-sm font-bold text-gray-900">{ev.coId ? 'CO total ' : ''}{money(ev.total)}</p>
        </div>
      </div>
    </div>
  );
}
