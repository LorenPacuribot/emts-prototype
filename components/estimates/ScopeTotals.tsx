'use client';

/*
  Running totals under the Area & Line Items grid. They update with every
  edit, before saving (patent 9). Included work makes the Base Scope Total;
  optional rows stay fully priced but add to the Optional Scope Total
  instead, and Total Potential is both together (patent 10).
*/
import React from 'react';
import type { Estimate } from '@/lib/types';
import type { EstimateTotals } from '@/lib/calculations';
import { includedLine, round2 } from '@/lib/calculations';
import { money } from '@/lib/utils';

export function scopeHours(e: Pick<Estimate, 'lineItems'>) {
  const inc = e.lineItems.filter(includedLine);
  const prep = round2(inc.reduce((s, l) => s + (l.prepHours ?? 0), 0));
  const total = round2(inc.reduce((s, l) => s + l.laborHours, 0));
  return { prep, application: round2(total - prep), total, gallons: round2(inc.reduce((s, l) => s + (l.gallons ?? 0), 0)) };
}

export function ScopeTotals({ estimate, totals }: { estimate: Estimate; totals: EstimateTotals }) {
  const h = scopeHours(estimate);
  const optionalCount = estimate.lineItems.filter((l) => !includedLine(l)).length;
  const stat = (label: string, value: React.ReactNode, tone = 'text-gray-900') => (
    <div className="min-w-0">
      <div className="text-xxs font-bold uppercase tracking-widest text-gray-500">{label}</div>
      <div className={`font-heading text-lg font-black ${tone}`}>{value}</div>
    </div>
  );
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 md:p-5" aria-live="polite">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
        {stat('Prep Hours', h.prep.toFixed(2))}
        {stat('Application Hours', h.application.toFixed(2))}
        {stat('Total Hours', h.total.toFixed(2))}
        {stat('Paint (gal)', h.gallons.toFixed(2), 'text-blue-600')}
        {stat('Labor', money(totals.laborCost))}
        {stat('Material', money(totals.materialCost))}
        {stat('Base Scope Total', money(totals.subtotal), 'text-primary-700')}
        {stat(`Optional Scope Total${optionalCount ? ` (${optionalCount})` : ''}`, money(totals.optionalSubtotal), 'text-amber-700')}
      </div>
      {totals.optionalSubtotal > 0 && (
        <p className="mt-3 text-xs text-gray-500">
          Total potential with every optional item: <b className="text-gray-800">{money(round2(totals.subtotal + totals.optionalSubtotal))}</b> before discount and tax.
        </p>
      )}
    </div>
  );
}
