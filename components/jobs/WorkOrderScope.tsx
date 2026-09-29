'use client';

/*
  Work Order tab on a job (patent 13): the approved scope in a production
  layout. It reads the same estimate lines the customer approved; optional
  items the customer didn't select are left out. Each surface shows where it
  is, how much, the colour, product, sheen, coats, preparation and the
  estimated hours (preparation + application). Links go back to the estimate
  and the lead, and "Schedule" opens the scheduling panel.
*/
import React from 'react';
import Link from 'next/link';
import { CalendarPlus, ClipboardList, ExternalLink, FileText, Users } from 'lucide-react';
import type { Estimate, Job, Lead, WorkOrder } from '@/lib/types';
import { includedLine, round2 } from '@/lib/calculations';
import { prepSummary } from '@/lib/estimating';
import { useDb, useLookups } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { RefChip } from '@/components/ui/display';
import { useLineColours } from '@/components/estimates/FeatureSections';
import { useDb as useFeatureDb } from '@/features/lib/store';
import { jobHref } from '@/features/lib/hrefs';
import { appliedChangeOrderLines, changeOrderHours, lineLabourHours } from '@/features/lib/rules/change-order-effects';

export function WorkOrderScope({ job, estimate, lead, workOrder, onSchedule }: {
  job: Job;
  estimate?: Estimate;
  lead?: Lead;
  workOrder?: WorkOrder;
  onSchedule: () => void;
}) {
  const db = useDb();
  const look = useLookups();
  const colours = useLineColours(estimate?.id ?? '');
  const fdb = useFeatureDb((d) => d);
  const coLines = appliedChangeOrderLines(fdb, job.id, 'work_order');
  const coHours = changeOrderHours(fdb, job.id);
  const lines = estimate ? estimate.lineItems.filter(includedLine) : [];
  const prep = round2(lines.reduce((s, l) => s + (l.prepHours ?? 0), 0));
  const total = round2(lines.reduce((s, l) => s + l.laborHours, 0));
  const gallons = round2(lines.reduce((s, l) => s + (l.gallons ?? 0), 0));
  const paint = (id?: string) => {
    const p = look.paint(id);
    return p ? `${look.brand(p.brandId)?.name ?? ''} ${p.name}`.trim() : '—';
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-5">
        <div>
          <h3 className="flex items-center gap-2 font-heading text-lg font-bold text-gray-900"><ClipboardList className="h-5 w-5 text-primary-600" /> Work Order {workOrder?.workOrderNumber ?? ''}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            From the approved scope
            {estimate && <RefChip href={`/estimates/${estimate.id}`}><FileText className="h-3 w-3" />{estimate.estimateNumber}</RefChip>}
            {lead && <RefChip kind="lead" href={`/leads/${lead.id}`}>{lead.leadNumber}</RefChip>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {workOrder && (
            <Link href={`/work-orders/${workOrder.id}`}>
              <Button variant="secondary" size="sm" icon={<ExternalLink className="h-4 w-4" />}>Open Work Order</Button>
            </Link>
          )}
          <Button size="sm" icon={<CalendarPlus className="h-4 w-4" />} onClick={onSchedule}>{job.startDate ? 'Reschedule' : 'Schedule'}</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-b border-gray-100 p-5 sm:grid-cols-4">
        {[
          ['Estimated hours', `${total.toFixed(2)} h`],
          ['Preparation', `${prep.toFixed(2)} h`],
          ['Application', `${round2(total - prep).toFixed(2)} h`],
          ['Paint', `${gallons.toFixed(2)} gal`],
        ].map(([label, value]) => (
          <div key={label}>
            <div className="text-xxs font-bold uppercase tracking-widest text-gray-400">{label}</div>
            <div className="font-heading text-xl font-black text-gray-900">{value}</div>
          </div>
        ))}
      </div>

      {!estimate ? (
        <p className="p-6 text-sm text-gray-500">This job has no linked estimate, so there is no approved scope to show.</p>
      ) : lines.length === 0 ? (
        <p className="p-6 text-sm text-gray-500">The approved estimate has no surfaces.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
              <tr>
                {['Location', 'Surface', 'Amount', 'Colour', 'Product', 'Sheen', 'Coats', 'Preparation', 'Est. hours'].map((h) => (
                  <th key={h} className={`px-4 py-2.5 ${h === 'Est. hours' ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {estimate.areas.flatMap((a) =>
                lines.filter((l) => l.areaId === a.id).map((l) => {
                  const c = colours.colours.get(l.id);
                  return (
                    <tr key={l.id}>
                      <td className="px-4 py-2.5 text-gray-600">{l.location || a.name}</td>
                      <td className="px-4 py-2.5 font-semibold text-gray-900">{l.description || l.surfaceType}</td>
                      <td className="px-4 py-2.5 text-gray-600">{l.quantity} {l.unit === 'sqft' ? 'sq ft' : l.unit === 'lnft' ? 'lin ft' : l.unit}</td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {c ? <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full border border-gray-300" style={{ backgroundColor: c.hex }} />{c.name} <span className="text-gray-400">#{c.number}</span></span> : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{paint(l.paintProductId)}</td>
                      <td className="px-4 py-2.5 text-gray-600">{l.sheen || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{l.coats}</td>
                      <td className="px-4 py-2.5 text-gray-600">{prepSummary(l, db.collections.tableColumns).join(', ') || '—'}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-gray-900">{l.laborHours.toFixed(2)}</td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      )}
      {coLines.length > 0 && (
        <div className="border-t border-gray-100">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
            <h4 className="text-sm font-bold text-gray-900">Added by change orders</h4>
            <span className="text-xs text-gray-500">{coHours >= 0 ? '+' : ''}{coHours.toFixed(2)} h included in the required hours</span>
          </div>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full min-w-[700px] text-sm">
              <thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
                <tr>{['Change order', 'Work', 'Amount', 'Colour', 'Product', 'Est. hours'].map((h) => <th key={h} className={`px-4 py-2.5 ${h === 'Est. hours' ? 'text-right' : ''}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {coLines.map((l) => {
                  const h = lineLabourHours(fdb, l);
                  return (
                    <tr key={`${l.coId}-${l.id}`} className={l.kind === 'remove' ? 'text-gray-500' : ''}>
                      <td className="px-4 py-2.5"><RefChip href={jobHref(job.id, 'change-orders')}>{l.coId}</RefChip></td>
                      <td className="px-4 py-2.5 font-semibold text-gray-900">{l.kind === 'remove' ? <span className="mr-1 rounded bg-red-50 px-1.5 py-0.5 text-xxs font-bold uppercase text-red-700">Removed</span> : null}{l.description}</td>
                      <td className="px-4 py-2.5 text-gray-600">{l.sqft ? `${l.kind === 'remove' ? '−' : ''}${l.sqft} sq ft` : '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{l.colour || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{l.product || '—'}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-gray-900">{h ? h.toFixed(2) : <span className="font-normal text-gray-400" title="Add labor hours to this change-order line to include it in the required hours">Not given</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {estimate && estimate.lineItems.some((l) => !includedLine(l)) && (
        <p className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500">Optional items the customer didn&apos;t select are not part of this work order.</p>
      )}
      <p className="flex items-center gap-2 border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
        <Users className="h-3.5 w-3.5" /> Required hours for scheduling: <b className="text-gray-800">{job.estimatedHours.toFixed(1)} h</b>
      </p>
    </div>
  );
}
