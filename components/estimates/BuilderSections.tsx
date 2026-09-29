'use client';

/*
  Smaller builder sections:
  - ExtrasBlock: flat line items added from Settings > Line Items (or custom)
  - NotesSection: "Customer Notes" (shown on the proposal) and "Internal Notes"
  - LaborSummary: hours per surface, grouped by area, with a Total Hours footer
*/
import React from 'react';
import { Clock, List, Trash2 } from 'lucide-react';
import type { Estimate } from '@/lib/types';
import { Textarea } from '@/components/ui/form';
import { money } from '@/lib/utils';

const sectionIcon = (Icon: React.ComponentType<{ className?: string }>) => (
  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-primary-100 bg-primary-50">
    <Icon className="h-6 w-6 text-primary-600" />
  </div>
);

export function ExtrasBlock({
  extras, readOnly, onUpdate, onDelete,
}: {
  extras: Estimate['extras'];
  readOnly: boolean;
  onUpdate: (id: string, patch: Partial<Estimate['extras'][number]>) => void;
  onDelete: (id: string) => void;
}) {
  if (extras.length === 0) return null;
  const input = 'h-8 w-full rounded-md border border-transparent bg-transparent px-1.5 text-sm hover:border-gray-200 focus:border-primary-400 focus:bg-white focus:outline-none';
  return (
    <div>
      <div className="flex items-center gap-2 rounded-t-xl border border-gray-200 bg-gray-50 px-4 py-3">
        <List className="h-4 w-4 text-gray-500" />
        <span className="font-heading text-lg font-bold text-gray-900">Line Items</span>
      </div>
      <div className="overflow-x-auto rounded-b-xl border border-t-0 border-gray-200 bg-white">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500">
              <th className="px-4 py-2 text-left">Item</th>
              <th className="w-24 px-2 py-2 text-center">Qty</th>
              <th className="w-32 px-2 py-2 text-center">Price</th>
              <th className="w-32 px-4 py-2 text-right">Total</th>
              {!readOnly && <th className="w-10" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {extras.map((x) => (
              <tr key={x.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <input disabled={readOnly} className={`${input} font-bold`} value={x.name} onChange={(e) => onUpdate(x.id, { name: e.target.value })} aria-label="Item name" />
                </td>
                <td className="px-2 py-2">
                  <input type="number" min={0} disabled={readOnly} className={`${input} text-center`} value={x.quantity} onChange={(e) => onUpdate(x.id, { quantity: Math.max(0, Number(e.target.value) || 0) })} aria-label="Quantity" />
                </td>
                <td className="px-2 py-2">
                  <input type="number" min={0} step="0.01" disabled={readOnly} className={`${input} text-center`} value={x.unitPrice} onChange={(e) => onUpdate(x.id, { unitPrice: Math.max(0, Number(e.target.value) || 0) })} aria-label="Price" />
                </td>
                <td className="px-4 py-2 text-right text-sm font-black text-gray-900">{money(x.quantity * x.unitPrice)}</td>
                {!readOnly && (
                  <td className="px-1">
                    <button type="button" onClick={() => onDelete(x.id)} className="rounded-md p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-600" aria-label="Remove item">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function NotesSection({ notes, internal, readOnly, onChange }: { notes: string; internal: string; readOnly: boolean; onChange: (p: { notes?: string; internalNotes?: string }) => void }) {
  return (
    <section className="grid grid-cols-1 gap-8 border-b border-gray-200 pb-10 md:grid-cols-2">
      <div>
        <h3 className="mb-4 font-heading text-2xl font-bold text-gray-900">Customer Notes</h3>
        <Textarea rows={5} disabled={readOnly} placeholder="Notes visible to customer..." value={notes} onChange={(e) => onChange({ notes: e.target.value })} className="rounded-xl" />
      </div>
      <div>
        <h3 className="mb-4 font-heading text-2xl font-bold text-gray-900">Internal Notes</h3>
        <Textarea rows={5} disabled={readOnly} placeholder="Private internal notes..." value={internal} onChange={(e) => onChange({ internalNotes: e.target.value })} className="rounded-xl bg-amber-50/30" />
      </div>
    </section>
  );
}

export function LaborSummary({ estimate, paintLabel }: { estimate: Estimate; paintLabel: (id?: string) => string }) {
  const total = estimate.lineItems.reduce((s, l) => s + l.laborHours, 0);
  return (
    <section className="border-b border-gray-200 pb-10">
      <div className="mb-6 flex items-center gap-4">
        {sectionIcon(Clock)}
        <h3 className="font-heading text-2xl font-bold text-gray-900">Labor Summary</h3>
      </div>
      {estimate.lineItems.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-500">Add areas and surfaces to see labor hours.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[640px]">
            <thead className="bg-gray-50">
              <tr className="text-xs font-bold uppercase tracking-wider text-gray-500">
                <th className="px-6 py-3 text-left">Area</th>
                <th className="px-6 py-3 text-left">Item</th>
                <th className="px-6 py-3 text-center">Qty</th>
                <th className="px-6 py-3 text-center">Coats</th>
                <th className="px-6 py-3 text-left">Paint/Color</th>
                <th className="px-4 py-3 text-center">Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {estimate.areas.flatMap((a) =>
                estimate.lineItems.filter((l) => l.areaId === a.id).map((l, i) => (
                  <tr key={l.id} className="text-sm">
                    <td className="px-6 py-3 font-bold text-gray-900">{i === 0 ? a.name : ''}</td>
                    <td className="px-6 py-3 text-gray-700">{l.surfaceType}</td>
                    <td className="px-6 py-3 text-center text-gray-700">{l.quantity} <span className="text-xs text-gray-400">{l.unit}</span></td>
                    <td className="px-6 py-3 text-center text-gray-700">{l.coats}</td>
                    <td className="px-6 py-3 text-gray-700">{paintLabel(l.paintProductId) || <span className="italic text-gray-400">No paint assigned</span>}</td>
                    <td className="px-4 py-3 text-center font-bold text-gray-900">{l.laborHours.toFixed(2)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-4">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Total Hours</span>
            <span className="font-heading text-2xl font-black text-gray-900">{total.toFixed(2)} <span className="text-sm font-bold text-gray-400">hrs</span></span>
          </div>
        </div>
      )}
    </section>
  );
}
