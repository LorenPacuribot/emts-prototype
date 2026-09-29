'use client';

/*
  Customer-facing proposal (the standard Client Preview output). Used by the
  Client Preview page (printable / PDF) and the Client View (approval page),
  so the customer sees the same document the estimator previewed.

  Sections, in live-app order: header (company, title, estimator), property &
  customer info, scope of work by area (location, surface, amount, colour,
  product, sheen, coats, preparation, price), paint specifications, optional
  items (separate from the base scope), notes, totals, terms and the
  signature block. The gear panel in Client Preview hides sections and the
  ⋯ menu on a line hides parts of it (Estimate.presentation, lib/proposal.ts).
*/
import React from 'react';
import { FileText } from 'lucide-react';
import type { Estimate, EstimatePresentationSettings } from '@/lib/types';
import { sectionShown } from '@/lib/proposal';
import { useSingleton } from '@/lib/store';
import { cn, fullName, shortDate } from '@/lib/utils';
import { CompanyBlock } from './EstimateInfo';
import { ProposalCustomer, ProposalOptional, ProposalPricing, ProposalScope, ProposalSpecs, SectionTitle, useProposalData } from './ProposalParts';

export function ProposalDocument({ estimate: e, className, onSettings }: {
  estimate: Estimate;
  className?: string;
  /** Client Preview: edit what the customer sees (per-line ⋯ menus). */
  onSettings?: (s: EstimatePresentationSettings) => void;
}) {
  const [bp] = useSingleton('businessProfile');
  const d = useProposalData(e);
  const s = d.settings;
  const show = (k: string) => sectionShown(s, k);

  return (
    <div className={cn('overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl print:rounded-none print:border-0 print:shadow-none', className)}>
      {/* Header */}
      <div className="relative p-8 pb-8 md:p-12">
        <div className="mb-8 text-center md:mb-10">
          <h2 className="mb-2 font-heading text-3xl font-extrabold tracking-tight text-gray-900 md:text-5xl">{e.estimateType} Estimate</h2>
          <p className="text-sm font-medium text-gray-500 md:text-lg">Detailed Proposal &amp; Scope of Work</p>
        </div>
        <div className="flex flex-col items-center justify-between gap-8 lg:flex-row print:flex-row">
          <CompanyBlock bp={bp} />
          <div className="flex flex-col items-center lg:items-end print:items-end">
            <div className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">Estimator</div>
            {d.estimator ? (
              <div className="rounded-2xl border border-gray-200 bg-white px-5 py-2 text-right shadow-sm">
                <div className="font-bold text-gray-900">{fullName(d.estimator)}</div>
                <div className="text-sm text-gray-500">{d.estimator.phone || d.estimator.email}</div>
              </div>
            ) : (
              <div className="text-sm font-medium italic text-gray-500">Not assigned</div>
            )}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Est #</span>
          <span className="font-mono text-sm font-bold text-gray-600">{e.estimateNumber}</span>
        </div>
      </div>

      {show('customer') && (
        <div className="border-y border-gray-100 bg-gray-50/60 px-8 py-8 md:px-12">
          <ProposalCustomer e={e} d={d} />
        </div>
      )}

      {show('scope') && (
        <div className="px-8 py-10 md:px-12">
          <ProposalScope e={e} d={d} onSettings={onSettings} />
        </div>
      )}

      {show('specs') && (
        <div className="border-t border-gray-100 px-8 py-8 md:px-12 empty:hidden">
          <ProposalSpecs e={e} d={d} />
        </div>
      )}

      {show('optional') && (
        <div className="px-8 pb-8 md:px-12 empty:hidden">
          <ProposalOptional e={e} d={d} onSettings={onSettings} />
        </div>
      )}

      {show('notes') && (e.notes || e.depositTerms) && (
        <div className="px-8 pb-10 md:px-12">
          {e.notes && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-5">
              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">Notes</div>
              <p className="whitespace-pre-wrap text-sm text-gray-700">{e.notes}</p>
            </div>
          )}
          {e.depositTerms && (
            <div className="mt-6 rounded-xl border border-gray-100 p-5">
              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">Deposit &amp; Payment Schedule</div>
              <p className="whitespace-pre-wrap text-sm text-gray-700">{e.depositTerms}</p>
            </div>
          )}
        </div>
      )}

      {show('terms') && d.terms && (
        <div className="break-inside-avoid border-t border-gray-100 px-8 py-10 md:px-12">
          <SectionTitle icon={FileText}>{d.terms.name || 'Terms & Conditions'}</SectionTitle>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-600">{d.terms.content}</p>
        </div>
      )}

      {(show('pricing') || show('signature')) && (
        <div className="break-inside-avoid border-t border-gray-200 bg-gray-50 p-6 md:p-12">
          {show('pricing') && <ProposalPricing e={e} d={d} />}
          {show('signature') && (
            <div className="mt-12 grid grid-cols-2 gap-12 border-t border-gray-200 pt-8">
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">Contractor</h4>
                <div className="mt-8 border-b border-gray-300" />
                <div className="mt-2 flex justify-between text-xs">
                  <span className="font-bold text-gray-900">{d.estimator ? fullName(d.estimator) : bp.companyName}</span>
                  <span className="text-gray-500">{bp.companyName}</span>
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">Acceptance</h4>
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
                    <div className="flex justify-between text-xs uppercase text-gray-500"><span>Signature</span><span>Date</span></div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
