'use client';

/*
  Customer-facing proposal. Used by the Preview page (printable) and the
  Client View (approval page), so the customer sees the same document the
  estimator previewed.

  Sections, in live-app order: header (company, title, estimator), customer
  info, scope of work by area, extra line items, notes, totals, terms and
  the signature / acceptance block.
*/
import React from 'react';
import { FileText, Grid } from 'lucide-react';
import type { Estimate } from '@/lib/types';
import { estimateTotals } from '@/lib/calculations';
import { useDb, useLookups, useSingleton } from '@/lib/store';
import { cn, fullName, longDate, money, shortDate } from '@/lib/utils';
import { CompanyBlock } from './EstimateInfo';

export function ProposalDocument({ estimate: e, className }: { estimate: Estimate; className?: string }) {
  const [bp] = useSingleton('businessProfile');
  const look = useLookups();
  const db = useDb();
  const t = estimateTotals(e);
  const customer = look.customer(e.customerId);
  const estimator = look.member(e.estimatorId ?? e.createdBy);
  const terms = look.terms(e.termsId);
  const region = db.collections.taxRegions.find((r) => r.id === e.taxRegionId);
  const paintLabel = (id?: string) => {
    const p = look.paint(id);
    return p ? `${look.brand(p.brandId)?.name ?? ''} ${p.name}`.trim() : '—';
  };

  return (
    <div className={cn('overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl print:rounded-none print:border-0 print:shadow-none', className)}>
      {/* Header */}
      <div className="relative p-8 pb-8 md:p-12">
        <div className="mb-8 text-center md:mb-10">
          <h2 className="mb-2 font-heading text-3xl font-extrabold tracking-tight text-gray-900 md:text-5xl">{e.estimateType} Estimate</h2>
          <p className="text-sm font-medium text-gray-400 md:text-lg">Detailed Proposal &amp; Scope of Work</p>
        </div>
        <div className="flex flex-col items-center justify-between gap-8 lg:flex-row print:flex-row">
          <CompanyBlock bp={bp} />
          <div className="flex flex-col items-center lg:items-end print:items-end">
            <div className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">Estimator</div>
            {estimator ? (
              <div className="rounded-2xl border border-gray-200 bg-white px-5 py-2 text-right shadow-sm">
                <div className="font-bold text-gray-900">{fullName(estimator)}</div>
                <div className="text-sm text-gray-500">{estimator.phone || estimator.email}</div>
              </div>
            ) : (
              <div className="text-sm font-medium italic text-gray-400">Not assigned</div>
            )}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Est #</span>
          <span className="font-mono text-sm font-bold text-gray-600">{e.estimateNumber}</span>
        </div>
      </div>

      {/* Customer */}
      <div className="grid grid-cols-1 gap-8 border-y border-gray-100 bg-gray-50/60 px-8 py-8 md:grid-cols-3 md:px-12 print:grid-cols-3">
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">Prepared For</div>
          <div className="text-lg font-bold text-gray-900">{fullName(customer)}</div>
          {customer?.companyName && <div className="text-sm text-gray-600">{customer.companyName}</div>}
          {customer?.email && <div className="text-sm text-gray-500">{customer.email}</div>}
          {customer?.phone && <div className="text-sm text-gray-500">{customer.phone}</div>}
        </div>
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">Job Site</div>
          <div className="text-sm font-semibold text-gray-800">{e.address || '—'}</div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">Date</div>
            <div className="text-sm font-bold text-gray-900">{longDate(e.date)}</div>
          </div>
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">Valid Until</div>
            <div className="text-sm font-bold text-gray-900">{longDate(e.validUntil)}</div>
          </div>
        </div>
      </div>

      {/* Scope of work */}
      <div className="px-8 py-10 md:px-12">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600"><Grid className="h-5 w-5" /></div>
          <h3 className="font-heading text-xl font-bold text-gray-900">Scope of Work</h3>
        </div>
        {e.areas.length === 0 && e.extras.length === 0 && <p className="text-sm text-gray-500">No work items have been added yet.</p>}
        <div className="space-y-8">
          {e.areas.map((a) => {
            const lines = e.lineItems.filter((l) => l.areaId === a.id);
            const total = lines.reduce((s, l) => s + l.total, 0);
            return (
              <div key={a.id} className="break-inside-avoid">
                <div className="mb-2 flex items-end justify-between border-b-2 border-gray-900 pb-2">
                  <h4 className="font-heading text-lg font-bold text-gray-900">{a.name}</h4>
                  <span className="text-sm font-bold text-gray-900">{money(total)}</span>
                </div>
                {lines.length === 0 ? (
                  <p className="py-2 text-sm text-gray-400">No surfaces listed.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-gray-400">
                        <th className="py-2">Surface</th>
                        <th className="py-2 text-center">Amount</th>
                        <th className="py-2 text-center">Coats</th>
                        <th className="py-2">Product</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lines.map((l) => (
                        <tr key={l.id}>
                          <td className="py-2 font-semibold text-gray-800">{l.description || l.surfaceType}</td>
                          <td className="py-2 text-center text-gray-600">{l.quantity} {l.unit}</td>
                          <td className="py-2 text-center text-gray-600">{l.coats}</td>
                          <td className="py-2 text-gray-600">{paintLabel(l.paintProductId)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
          {e.extras.length > 0 && (
            <div className="break-inside-avoid">
              <div className="mb-2 border-b-2 border-gray-900 pb-2">
                <h4 className="font-heading text-lg font-bold text-gray-900">Additional Items</h4>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {e.extras.map((x) => (
                    <tr key={x.id}>
                      <td className="py-2 font-semibold text-gray-800">{x.name}</td>
                      <td className="py-2 text-center text-gray-600">{x.quantity > 1 ? `× ${x.quantity}` : ''}</td>
                      <td className="py-2 text-right font-bold text-gray-900">{money(x.quantity * x.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {e.notes && (
          <div className="mt-10 rounded-xl border border-gray-100 bg-gray-50 p-5">
            <div className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">Notes</div>
            <p className="whitespace-pre-wrap text-sm text-gray-700">{e.notes}</p>
          </div>
        )}
        {e.depositTerms && (
          <div className="mt-6 rounded-xl border border-gray-100 p-5">
            <div className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">Deposit &amp; Payment Schedule</div>
            <p className="whitespace-pre-wrap text-sm text-gray-700">{e.depositTerms}</p>
          </div>
        )}
      </div>

      {/* Terms */}
      {terms && (
        <div className="break-inside-avoid border-t border-gray-100 px-8 py-10 md:px-12">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600"><FileText className="h-5 w-5" /></div>
            <h3 className="font-heading text-xl font-bold text-gray-900">{terms.name || 'Terms & Conditions'}</h3>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-600">{terms.content}</p>
        </div>
      )}

      {/* Totals + signature */}
      <div className="break-inside-avoid border-t border-gray-200 bg-gray-50 p-6 md:p-12">
        <div className="flex justify-end">
          <div className="w-full space-y-3 md:w-1/2 lg:w-1/3 print:w-1/2">
            <div className="flex justify-between text-sm text-gray-600"><span className="font-medium">Subtotal</span><span className="font-bold text-gray-900">{money(t.subtotal)}</span></div>
            {t.discount > 0 && (
              <div className="flex justify-between text-sm text-green-600"><span className="font-medium">Discount</span><span className="font-bold">-{money(t.discount)}</span></div>
            )}
            {t.tax > 0 && (
              <div className="flex justify-between text-sm text-gray-600"><span className="font-medium">Tax{region ? ` (${region.name})` : ''}</span><span className="font-bold text-gray-900">{money(t.tax)}</span></div>
            )}
            <div className="my-4 h-px bg-gray-200" />
            <div className="flex items-end justify-between">
              <span className="text-lg font-bold text-gray-900">Total</span>
              <span className="text-3xl font-extrabold text-primary-600">{money(t.total)}</span>
            </div>
          </div>
        </div>
        <div className="mt-12 grid grid-cols-2 gap-12 border-t border-gray-200 pt-8">
          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">Contractor</h4>
            <div className="mt-8 border-b border-gray-300" />
            <div className="mt-2 flex justify-between text-xs">
              <span className="font-bold text-gray-900">{estimator ? fullName(estimator) : bp.companyName}</span>
              <span className="text-gray-500">{bp.companyName}</span>
            </div>
          </div>
          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">Acceptance</h4>
            {e.signature ? (
              <div>
                <div className="mt-4 font-[cursive] text-3xl italic text-gray-800">{e.signature.name}</div>
                <div className="mb-2 border-b border-gray-300" />
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-gray-900">{e.signature.name}</span>
                  <span className="text-gray-500">{shortDate(e.signature.date)}</span>
                </div>
              </div>
            ) : (
              <div className="mt-8">
                <div className="mb-2 border-b border-gray-300" />
                <div className="flex justify-between text-xs uppercase text-gray-400"><span>Signature</span><span>Date</span></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
