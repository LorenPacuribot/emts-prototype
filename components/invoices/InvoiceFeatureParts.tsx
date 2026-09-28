'use client';

/*
  NEW invoice pieces, embedded from the feature prototype
  (features/components/features/invoices/invoice-screens.tsx):
    - QuickBooks exchange state (feature 33, needs client confirmation):
      a column on the Invoices list and a card on the invoice, for finance
      roles only (finance.access).
    - Invoice type chip for supplemental invoices and credit notes raised
      from a change order (feature 24), linking to that change order.
  They read the invoice's prototype twin (same id). An invoice with no twin
  (e.g. created on /invoices/new for a job the prototype doesn't know)
  simply shows "Not sent" / no chip.
*/
import React from 'react';
import Link from 'next/link';
import { FileDiff, Landmark } from 'lucide-react';
import type { Database } from '@/features/types';
import { useCurrentUser, useDb as useFeatureDb } from '@/features/lib/store';
import { can } from '@/features/lib/permissions';
import { dateTime } from '@/features/lib/format';
import { coHref } from '@/features/components/features/change-orders/shared';
import { ConfirmBadge, NewBadge, StatusPill } from '@/features/components/ui';

type Tone = 'green' | 'red' | 'gray' | 'amber';

/** The invoice's latest QuickBooks exchange state (prototype useQbo). */
function qboState(db: Database, invoiceId: string) {
  const rec = db.financeRecords.find((r) => r.type === 'invoice' && r.invoiceId === invoiceId);
  const items = rec ? db.exchangeQueue.filter((q) => q.recordId === rec.id).sort((a, b) => b.version - a.version) : [];
  const latest = items[0];
  const state = !rec
    ? 'Not sent'
    : rec.deletedInQbo
      ? 'Deleted in QuickBooks'
      : latest?.status === 'accepted'
        ? 'Accepted'
        : latest?.status === 'rejected'
          ? 'Rejected'
          : latest?.status === 'sent'
            ? 'Sent'
            : 'Queued';
  const tone: Tone = state === 'Accepted' ? 'green' : state === 'Rejected' || state.startsWith('Deleted') ? 'red' : state === 'Not sent' ? 'gray' : 'amber';
  return { rec, items, state, tone };
}

/** Finance roles see the QuickBooks column and card. */
export function useShowQuickBooks() {
  return can(useCurrentUser(), 'finance.access');
}

/** List note above the rows: marks the NEW QuickBooks column. */
export function QuickBooksColumnNote() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
      QuickBooks column <NewBadge feature={33} /> <ConfirmBadge />
    </div>
  );
}

/** QuickBooks state for one invoice row. */
export function QuickBooksCell({ invoiceId }: { invoiceId: string }) {
  const db = useFeatureDb((d) => d);
  const q = qboState(db, invoiceId);
  return (
    <div className="md:w-40" onClick={(e) => e.stopPropagation()}>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">QuickBooks</div>
      <StatusPill tone={q.tone}>{q.state}</StatusPill>
    </div>
  );
}

/** Supplemental / Credit note chip, linking to the change order it came from. */
export function InvoiceKindChip({ invoiceId, withLink = false }: { invoiceId: string; withLink?: boolean }) {
  const db = useFeatureDb((d) => d);
  const inv = db.invoices.find((i) => i.id === invoiceId);
  if (!inv || inv.kind === 'standard') return null;
  const label = inv.kind === 'credit_note' ? 'Credit note' : 'Supplemental';
  const co = inv.changeOrderId ? db.changeOrders.find((c) => c.id === inv.changeOrderId) : undefined;
  const chip = <span className="rounded-md bg-purple-50 px-1.5 py-0.5 text-xs font-bold text-purple-700">{label}</span>;
  if (!withLink || !co) return chip;
  return (
    <span className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      {chip}
      <Link href={coHref(db, co)} className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-white px-2 py-0.5 text-xs font-bold text-purple-700 hover:bg-purple-50">
        <FileDiff className="h-3 w-3" /> {co.id}
      </Link>
      <NewBadge feature={24} />
    </span>
  );
}

/** The "QuickBooks exchange" card on the invoice (finance roles). */
export function QuickBooksCard({ invoiceId }: { invoiceId: string }) {
  const db = useFeatureDb((d) => d);
  const q = qboState(db, invoiceId);
  return (
    <div className="mx-auto mt-6 max-w-[8.5in] rounded-lg border border-emerald-300 bg-white p-8 shadow-sm ring-1 ring-emerald-100 print:hidden" data-tour="invoice-qbo">
      <h4 className="mb-3 flex flex-wrap items-center gap-2 text-lg font-bold text-gray-900">
        <Landmark className="h-5 w-5 text-gray-400" /> QuickBooks exchange <NewBadge feature={33} /> <ConfirmBadge />
      </h4>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <StatusPill tone={q.tone}>{q.state}</StatusPill>
        {q.rec?.externalRef && <span className="font-mono text-xs text-gray-500">{q.rec.externalRef}</span>}
        {q.rec?.variance && !q.rec.variance.reviewedAt && <span className="text-xs font-semibold text-amber-700">Edited in QuickBooks: variance to review</span>}
      </div>
      {q.items.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-gray-600">
          {q.items.map((i) => (
            <li key={i.id}>
              {i.id} · version {i.version} · {i.status} · queued {dateTime(i.queuedAt)}
              {i.attempts.length ? ` · ${i.attempts.length} attempt(s)` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-gray-500">Sent to QuickBooks when the invoice is sent. QuickBooks owns the ledger; payments here are recorded, not charged.</p>
      )}
      <Link href="/accounting/transfer-queue" className="mt-3 inline-block text-xs font-bold text-primary-700 hover:underline">
        Open the transfer queue →
      </Link>
    </div>
  );
}
