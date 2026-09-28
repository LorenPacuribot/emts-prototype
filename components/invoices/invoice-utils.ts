/*
  Helpers shared by the invoice screens.
  - Status labels and badge colors (match the live app's INVOICE_STATUS_MAP).
  - Building invoice line items from an estimate (one line per area + extras).
  - A small hook that saves an invoice change and adds a history entry.
*/
import { useCallback } from 'react';
import type { Estimate, Invoice, InvoiceLineItem, InvoiceStatus, Payment } from '@/lib/types';
import { derivedInvoiceStatus, round2 } from '@/lib/calculations';
import { useCollection } from '@/lib/store';
import { toISODate, uid } from '@/lib/utils';

/** Label shown in the UI for each status (live: "Partially Paid", "Cancelled"). */
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  Draft: 'Draft',
  Sent: 'Sent',
  Unpaid: 'Unpaid',
  Partial: 'Partially Paid',
  Paid: 'Paid',
  Overdue: 'Overdue',
  Void: 'Void',
};

/** Badge colors copied from the live app (Sent is amber, Partial is blue). */
export const INVOICE_BADGE: Record<InvoiceStatus, string> = {
  Draft: 'bg-gray-100 text-gray-700 border-gray-200',
  Sent: 'bg-amber-100 text-amber-700 border-amber-200',
  Unpaid: 'bg-amber-50 text-amber-700 border-amber-200',
  Partial: 'bg-blue-100 text-blue-700 border-blue-200',
  Paid: 'bg-green-100 text-green-700 border-green-200',
  Overdue: 'bg-red-100 text-red-700 border-red-200',
  Void: 'bg-gray-100 text-gray-500 border-gray-200',
};

/** Options for the status filter on the list ("All" first). */
export const INVOICE_FILTER_OPTIONS: ('All' | InvoiceStatus)[] = ['All', 'Draft', 'Sent', 'Unpaid', 'Partial', 'Paid', 'Overdue', 'Void'];

/** Offline methods shown as tabs in Record Payment (plus Credit Card). */
export const PAYMENT_TABS = [
  { label: 'Credit Card', value: 'Credit Card' },
  { label: 'Check', value: 'Check' },
  { label: 'Cash', value: 'Cash' },
  { label: 'Bank Transfer', value: 'ACH' },
] as const;

/** Display name for a stored payment method ("ACH" shows as Bank Transfer). */
export function methodLabel(m: string) {
  return m === 'ACH' ? 'Bank Transfer' : m;
}

/** $4,992.90 without the currency style quirks (always 2 decimals). */
export function usd(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** One line per estimate area (sum of its line totals) plus each extra item. */
export function linesFromEstimate(e: Estimate, fraction = 1): InvoiceLineItem[] {
  const items: InvoiceLineItem[] = e.areas.map((a) => ({
    id: uid('il'),
    description: `${a.name} — ${e.title}`,
    quantity: 1,
    rate: round2(e.lineItems.filter((l) => l.areaId === a.id).reduce((s, l) => s + l.total, 0) * fraction),
  }));
  for (const x of e.extras) items.push({ id: uid('il'), description: x.name, quantity: x.quantity, rate: round2(x.unitPrice * fraction) });
  return items;
}

/** Due date = invoice date + payment terms (days). */
export function addDays(isoDate: string, days: number) {
  const d = new Date(isoDate + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Returns save(id, patch, historyText?) that also appends to invoice.history. */
export function useInvoiceSaver() {
  const { get, update } = useCollection('invoices');
  return useCallback(
    (id: string, patch: Partial<Invoice>, historyText?: string) => {
      const inv = get(id);
      if (!inv) return;
      const history = historyText ? [...inv.history, { date: new Date().toISOString(), text: historyText }] : inv.history;
      update(id, { ...patch, history });
    },
    [get, update],
  );
}

/**
 * Status to store after the payment list changes. A Draft that receives a
 * payment is treated as issued, so it can become Partial or Paid.
 */
export function statusAfterPayments(inv: Invoice, payments: Payment[]): InvoiceStatus {
  if (inv.status === 'Void') return 'Void';
  const base: InvoiceStatus = inv.status === 'Draft' ? (payments.length ? 'Unpaid' : 'Draft') : inv.status === 'Paid' || inv.status === 'Partial' ? (inv.sentAt ? 'Sent' : 'Unpaid') : inv.status;
  return derivedInvoiceStatus({ ...inv, status: base, payments });
}
