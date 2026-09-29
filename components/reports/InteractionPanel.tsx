'use client';

/*
  Customer Interaction (Reports > Activity Log, patent 12).
  One row per estimate sent to a customer: status, when it was sent, when the
  customer first opened it, how many times they came back, and the last open.
  The status filter (Pending, Viewed, Approved, Declined) builds the day's
  follow-up list; clicking a row shows the full interaction timeline.
  Opens come from both customer pages (the replica client view and the
  prototype's public page), merged with viewSummary() so one open counts once.
*/
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Eye } from 'lucide-react';
import type { Estimate } from '@/lib/types';
import { useDb } from '@/lib/store';
import { useDb as useFeatureDb } from '@/features/lib/store';
import { estimateTotals } from '@/lib/calculations';
import { viewLogOf, viewSummary } from '@/lib/estimate-views';
import { cn, fullName, money } from '@/lib/utils';
import { Modal } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { TD, TH } from './shared';
import { pressable } from '@/lib/a11y';

type Filter = 'all' | 'pending' | 'viewed' | 'approved' | 'declined';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All sent' },
  { key: 'pending', label: 'Pending' },
  { key: 'viewed', label: 'Viewed' },
  { key: 'approved', label: 'Approved' },
  { key: 'declined', label: 'Declined' },
];

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

/** Pending = sent and not yet opened. */
function stage(e: Estimate, opens: number): Exclude<Filter, 'all'> {
  if (e.status === 'Approved') return 'approved';
  if (e.status === 'Rejected') return 'declined';
  return opens > 0 || e.status === 'Viewed' ? 'viewed' : 'pending';
}

export function InteractionPanel() {
  const db = useDb();
  const protoEstimates = useFeatureDb((d) => d.estimates);
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const byId = new Map(protoEstimates.map((p) => [p.id, p]));
    return db.collections.estimates
      .filter((e) => e.sentAt || ['Sent', 'Viewed', 'Approved', 'Rejected'].includes(e.status))
      .map((e) => {
        const p = byId.get(e.id);
        const views = viewSummary(viewLogOf(e), p ? viewLogOf({ viewLog: p.viewLog, viewedAt: p.viewedAt }) : []);
        const customer = db.collections.customers.find((c) => c.id === e.customerId);
        return { e, views, customer: fullName(customer) || '—', stage: stage(e, views.count), total: estimateTotals(e).total };
      })
      .sort((a, b) => (b.views.lastAt ?? b.e.sentAt ?? b.e.updatedAt).localeCompare(a.views.lastAt ?? a.e.sentAt ?? a.e.updatedAt));
  }, [db, protoEstimates]);

  const shown = rows.filter((r) => filter === 'all' || r.stage === filter);
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, f.key === 'all' ? rows.length : rows.filter((r) => r.stage === f.key).length]));
  const selected = rows.find((r) => r.e.id === open);

  const timeline = selected
    ? [
        { at: selected.e.createdAt, text: 'Estimate created' },
        ...(selected.e.sentAt ? [{ at: selected.e.sentAt, text: 'Sent to the customer' }] : []),
        ...selected.views.all.map((at, i) => ({ at, text: i === 0 ? 'Opened by the customer (first view)' : `Opened again (return visit ${i})` })),
        ...(selected.e.approvedAt ? [{ at: selected.e.approvedAt, text: `Accepted${selected.e.signature?.name ? ` and signed by ${selected.e.signature.name}` : ''}` }] : []),
        ...(selected.e.status === 'Rejected' ? [{ at: selected.e.updatedAt, text: `Declined${selected.e.declineReason ? `: ${selected.e.declineReason}` : ''}` }] : []),
      ].sort((a, b) => a.at.localeCompare(b.at))
    : [];

  return (
    <div className="border-b border-gray-200">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900"><Eye className="h-5 w-5 text-primary-600" /> Customer Interaction</h3>
          <p className="text-sm text-gray-500">When each customer first opened their estimate and how often they came back.</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1" role="tablist" aria-label="Estimate status">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn('rounded-lg px-3 py-1.5 text-xs font-bold', filter === f.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800')}
            >
              {f.label} <span className="ml-0.5 text-gray-500">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="rtable overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-y border-gray-200 bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500">
              <th className={TH}>Estimate</th><th className={TH}>Customer</th><th className={TH}>Status</th><th className={TH}>Sent</th>
              <th className={TH}>First opened</th><th className={TH}>Returns</th><th className={TH}>Last opened</th><th className={cn(TH, 'text-right')}>Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.map((r) => (
              <tr {...pressable(true, { row: true })} key={r.e.id} onClick={() => setOpen(r.e.id)} className="cursor-pointer hover:bg-gray-50/80" aria-label={`Interaction timeline for ${r.e.estimateNumber}`}>
                <td className={cn(TD, 'font-bold text-gray-900')}>{r.e.estimateNumber}</td>
                <td className={TD}>{r.customer}</td>
                <td className={TD}>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold capitalize', {
                    pending: 'bg-amber-50 text-amber-700', viewed: 'bg-blue-50 text-blue-700', approved: 'bg-green-50 text-green-700', declined: 'bg-red-50 text-red-700',
                  }[r.stage])}>{r.stage}</span>
                </td>
                <td className={cn(TD, 'text-gray-600')}>{when(r.e.sentAt)}</td>
                <td className={cn(TD, 'text-gray-600')}>{r.views.count ? when(r.views.firstAt) : <span className="italic text-gray-500">Not opened yet</span>}</td>
                <td className={cn(TD, 'font-semibold text-gray-900')}>{r.views.returns}</td>
                <td className={cn(TD, 'text-gray-600')}>{when(r.views.lastAt)}</td>
                <td className={cn(TD, 'text-right font-semibold')}>{money(r.total)}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={8} className="px-6 py-8 text-center text-sm italic text-gray-500">No estimates in this list.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={!!selected} onOpenChange={(v) => !v && setOpen(null)} title={selected ? `${selected.e.estimateNumber} · Interaction timeline` : ''} description={selected ? `${selected.customer} · ${selected.views.count} open${selected.views.count === 1 ? '' : 's'}, ${selected.views.returns} return${selected.views.returns === 1 ? '' : 's'}` : undefined}>
        {selected && (
          <div className="space-y-4">
            <ol className="relative space-y-4 border-l-2 border-gray-100 pl-5">
              {timeline.map((t, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-primary-500" />
                  <div className="text-sm font-semibold text-gray-900">{t.text}</div>
                  <div className="text-xs text-gray-500">{new Date(t.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                </li>
              ))}
            </ol>
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <Link href={`/estimates/${selected.e.id}`}><Button variant="outline" size="sm">Open Estimate</Button></Link>
              <Button variant="secondary" size="sm" onClick={() => setOpen(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
