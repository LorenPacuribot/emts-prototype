'use client';

/*
  The printable invoice "paper" (live InvoiceDocument): title, invoice number,
  business branding with balance due and status, Client / Job Site / Dates,
  itemized lines, payments received, totals, terms and acceptance line.
  Used by the invoice detail page, the preview/print page and the pay page.
*/
import type { Invoice } from '@/lib/types';
import { derivedInvoiceStatus, invoiceTotals } from '@/lib/calculations';
import { useLookups, useSingleton } from '@/lib/store';
import { cn, fullName, initials, shortDate } from '@/lib/utils';
import { INVOICE_BADGE, INVOICE_STATUS_LABEL, methodLabel, usd } from './invoice-utils';

export function InvoiceDocument({ invoice, className }: { invoice: Invoice; className?: string }) {
  const look = useLookups();
  const [biz] = useSingleton('businessProfile');
  const customer = look.customer(invoice.customerId);
  const estimate = look.estimate(invoice.estimateId);
  const job = look.job(invoice.jobId);
  const lead = look.lead(invoice.leadId ?? estimate?.leadId ?? job?.leadId);
  const terms = look.terms(invoice.termsId);
  const t = invoiceTotals(invoice);
  const status = derivedInvoiceStatus(invoice);
  const title = estimate?.title ?? job?.title ?? 'Invoice';
  const jobSite = job?.address ?? estimate?.address ?? (customer ? `${customer.street}, ${customer.city}, ${customer.state} ${customer.zip}` : '');

  return (
    <div className={cn('mx-auto flex min-h-[11in] max-w-[8.5in] flex-col overflow-hidden rounded-sm border border-gray-200 bg-white shadow-2xl print:max-w-none print:border-none print:shadow-none', className)}>
      {/* 1. Title */}
      <div className="px-12 pb-8 pt-12 text-center">
        <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-gray-900 md:text-5xl">{title}</h1>
        <p className="text-lg font-medium text-gray-400">Invoice #{invoice.invoiceNumber}</p>
        {(job || estimate || lead) && (
          <p className="mt-1 text-sm font-medium text-gray-400">
            {[job && `Job ${job.jobNumber}`, estimate && `Estimate ${estimate.estimateNumber}`, lead && `Lead ${lead.leadNumber}`].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      {/* 2. Branding + balance */}
      <div className="flex flex-col items-center justify-between gap-6 px-8 pb-8 md:flex-row md:items-end md:px-12">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl font-heading text-xl font-black text-white" style={{ backgroundColor: biz.brandColor }}>
            {initials(biz.companyName)}
          </div>
          <div className="ml-2 space-y-0.5 text-xs font-medium text-gray-500 md:text-sm">
            <p className="font-bold text-gray-900">{biz.companyName}</p>
            <p>{[biz.street, biz.city, biz.state].filter(Boolean).join(', ')}</p>
            {biz.licenseNumber && <p className="text-gray-400">license #{biz.licenseNumber}</p>}
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-col items-center md:w-auto md:items-end">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 md:text-xs">Balance Due</div>
          <div className="text-4xl font-black tracking-tighter text-gray-900">{usd(t.balance)}</div>
          <div className="mt-2">
            <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold', INVOICE_BADGE[status])}>{INVOICE_STATUS_LABEL[status]}</span>
          </div>
        </div>
      </div>

      <div className="px-8 md:px-12"><div className="h-px w-full bg-gray-100" /></div>

      {/* 3. Info grid */}
      <div className="grid grid-cols-1 gap-8 p-8 md:grid-cols-3 md:gap-12 md:p-12">
        <div>
          <h4 className="mb-3 border-b border-gray-100 pb-2 text-xs font-bold uppercase tracking-widest text-gray-400">Client</h4>
          <div className="mb-1 text-xl font-bold text-gray-900">{fullName(customer)}</div>
          <div className="space-y-0.5 pt-2 text-sm text-gray-500">
            {customer?.email && <div>{customer.email}</div>}
            {customer?.phone && <div>{customer.phone}</div>}
          </div>
        </div>
        <div>
          <h4 className="mb-3 border-b border-gray-100 pb-2 text-xs font-bold uppercase tracking-widest text-gray-400">Job Site</h4>
          {jobSite ? (
            <div className="text-sm font-medium leading-relaxed text-gray-600">{jobSite}</div>
          ) : (
            <div className="text-sm italic text-gray-400">No job address specified</div>
          )}
        </div>
        <div>
          <h4 className="mb-3 border-b border-gray-100 pb-2 text-xs font-bold uppercase tracking-widest text-gray-400">Dates</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase text-gray-400">Invoice Date</div>
              <div className="font-bold text-gray-900">{shortDate(invoice.date)}</div>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase text-gray-400">Due Date</div>
              <div className="font-bold text-gray-900">{invoice.dueDate ? shortDate(invoice.dueDate) : 'N/A'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Items */}
      <div className="min-h-[100px] pb-4">
        <div className="mb-2 flex items-baseline justify-between border-b-2 border-gray-100 px-8 pb-2 pt-2 md:px-12">
          <h3 className="text-lg font-bold text-gray-900">Items</h3>
          <div className="text-lg font-bold text-gray-900">{usd(t.subtotal)}</div>
        </div>
        {invoice.lineItems.length === 0 ? (
          <div className="px-8 py-8 text-center italic text-gray-400 md:px-12">No items available.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-gray-400">
              <tr>
                <th className="py-2 pl-5 pr-2 sm:pl-8 sm:pr-4 text-xs font-bold uppercase md:pl-12">Item</th>
                <th className="px-2 py-2 sm:px-4 text-center text-xs font-bold uppercase">Qty</th>
                <th className="px-2 py-2 sm:px-4 text-right text-xs font-bold uppercase">Rate</th>
                <th className="py-2 pl-2 pr-5 sm:pl-4 sm:pr-8 text-right text-xs font-bold uppercase md:pr-12">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 border-b border-gray-50">
              {invoice.lineItems.map((l) => (
                <tr key={l.id}>
                  <td className="py-4 pl-5 pr-2 sm:pl-8 sm:pr-4 align-top text-base font-bold text-gray-800 md:pl-12">{l.description || 'Item'}</td>
                  <td className="px-2 py-4 sm:px-4 text-center align-top font-bold text-gray-700">{l.quantity}</td>
                  <td className="px-2 py-4 sm:px-4 text-right align-top text-gray-700">{usd(l.rate)}</td>
                  <td className="py-4 pl-2 pr-5 sm:pl-4 sm:pr-8 text-right align-top text-base font-bold text-gray-900 md:pr-12">{usd(l.quantity * l.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Payments received */}
      {invoice.payments.length > 0 && (
        <div className="mb-8">
          <div className="mb-2 flex items-baseline justify-between border-b-2 border-gray-100 px-8 pb-2 pt-2 md:px-12">
            <h3 className="text-lg font-bold text-gray-900">Payments Received</h3>
            <div className="text-lg font-bold text-green-700">-{usd(t.paid)}</div>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-gray-50">
              {invoice.payments.map((p) => (
                <tr key={p.id}>
                  <td className="py-3 pl-5 pr-2 sm:pl-8 sm:pr-4 text-gray-700 md:pl-12">{shortDate(p.date)}</td>
                  <td className="px-2 py-3 sm:px-4 text-gray-600">{methodLabel(p.method)}{p.reference ? ` • ${p.reference}` : ''}{p.note ? ` • ${p.note}` : ''}</td>
                  <td className="py-3 pl-2 pr-5 sm:pl-4 sm:pr-8 text-right font-bold text-green-700 md:pr-12">{usd(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* 6. Totals */}
      <div className="mt-auto break-inside-avoid border-t border-gray-200 bg-gray-50 p-8 md:p-12">
        <div className="flex justify-end">
          <div className="w-full space-y-4 md:w-1/2 lg:w-5/12">
            <Row label="Subtotal" value={usd(t.subtotal)} />
            {t.discount > 0 && <Row label="Discount" value={`-${usd(t.discount)}`} valueClass="text-green-600" />}
            {t.tax > 0 && <Row label={`Tax (${invoice.taxRate}%)`} value={usd(t.tax)} />}
            <div className="my-2 h-px bg-gray-200" />
            <div className="flex items-end justify-between pt-2">
              <span className="pb-1 text-[10px] font-black uppercase tracking-widest text-gray-900">Total</span>
              <span className="text-4xl font-black tracking-tighter text-primary-600">{usd(t.total)}</span>
            </div>
            {t.paid > 0 && (
              <>
                <Row label="Amount Paid" value={`-${usd(t.paid)}`} valueClass="text-green-600" />
                <Row label="Balance Due" value={usd(t.balance)} />
              </>
            )}
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-12 border-t border-gray-200 pt-8 md:grid-cols-2">
          <div>
            <h4 className="mb-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Terms & Conditions</h4>
            <p className="whitespace-pre-line text-[11px] leading-relaxed text-gray-500">{terms?.content || invoice.notes || 'Standard terms apply.'}</p>
            {terms && invoice.notes && <p className="mt-3 whitespace-pre-line text-[11px] leading-relaxed text-gray-500">{invoice.notes}</p>}
          </div>
          <div>
            <h4 className="mb-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Acceptance</h4>
            <div className="mb-2 h-12" />
            <div className="mb-2 border-b border-gray-300" />
            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-gray-400">
              <span>Signature</span>
              <span>Date</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-gray-500">
      <span>{label}</span>
      <span className={cn('text-sm font-bold text-gray-900', valueClass)}>{value}</span>
    </div>
  );
}
