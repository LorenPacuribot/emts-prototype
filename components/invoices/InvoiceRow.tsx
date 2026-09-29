'use client';

/*
  One invoice card on the Invoices list (matches the live InvoiceRow):
  INV number, status badge, EST/LEAD chips and date on the first line,
  customer name and JOB number below, Balance Due and Total on the right.
  NEW: the Supplemental / Credit note chip (24) and, for finance roles, the
  QuickBooks state column (33) — see InvoiceFeatureParts.tsx.
*/
import { useRouter } from 'next/navigation';
import type { Invoice } from '@/lib/types';
import { derivedInvoiceStatus, invoiceTotals } from '@/lib/calculations';
import { useLookups } from '@/lib/store';
import { cn, fullName, moneyCompact, shortDate } from '@/lib/utils';
import { RefChip } from '@/components/ui/display';
import { INVOICE_BADGE, INVOICE_STATUS_LABEL } from './invoice-utils';
import { InvoiceKindChip, QuickBooksCell } from './InvoiceFeatureParts';

export function InvoiceRow({ invoice, showQuickBooks = false }: { invoice: Invoice; showQuickBooks?: boolean }) {
  const router = useRouter();
  const look = useLookups();
  const status = derivedInvoiceStatus(invoice);
  const t = invoiceTotals(invoice);
  const customer = look.customer(invoice.customerId);
  const est = look.estimate(invoice.estimateId);
  const lead = look.lead(invoice.leadId);
  const job = look.job(invoice.jobId);

  return (
    // A div (not a Link) because the EST/LEAD chips inside are links themselves.
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/invoices/${invoice.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && router.push(`/invoices/${invoice.id}`)}
      className="group block cursor-pointer rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-primary-300 hover:shadow-md"
    >
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-3">
            <span className="rounded border border-gray-100 bg-gray-50 px-2 py-1 font-mono text-xs font-bold text-gray-500">{invoice.invoiceNumber}</span>
            <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-bold', INVOICE_BADGE[status])}>{INVOICE_STATUS_LABEL[status]}</span>
            <InvoiceKindChip invoiceId={invoice.id} />
            {est && <RefChip href={`/estimates/${est.id}`}>{est.estimateNumber}</RefChip>}
            {lead && <RefChip kind="lead" href={`/leads/${lead.id}`}>{lead.leadNumber}</RefChip>}
            <span className="hidden text-xs font-medium text-gray-500 sm:inline-block">• {shortDate(invoice.date)}</span>
          </div>
          <h3 className="text-lg font-bold text-gray-900 transition-colors group-hover:text-primary-700">{fullName(customer)}</h3>
          <div className="text-sm text-gray-500">{job?.jobNumber ?? '—'}</div>
        </div>
        {showQuickBooks && <QuickBooksCell invoiceId={invoice.id} />}
        <div className="flex min-w-[120px] flex-col text-left md:items-end md:text-right">
          <div className="mb-1 text-sm text-gray-500">Balance Due</div>
          <div className="text-xl font-black text-gray-900">{moneyCompact(t.balance)}</div>
          <div className="mt-1 text-xs text-gray-500">Total: {moneyCompact(t.total)}</div>
        </div>
      </div>
    </div>
  );
}
