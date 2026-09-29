'use client';

/*
  Building blocks of the customer output (patent 11), shared by the standard
  proposal (ProposalDocument) and the estimate blocks of Presentation Builder
  templates (PresentationCanvas):
    ProposalCustomer   property / customer info
    ProposalScope      surface-by-surface scope: location, surface, quantity,
                       colour, product, sheen, coats, preparation, price
    ProposalSpecs      paint specifications (the project colour card)
    ProposalOptional   optional items, separate from the base scope
    ProposalPricing    totals
  Every block follows Estimate.presentation (lib/proposal.ts). With
  `onSettings`, each scope row gets a ⋯ menu to hide the line or parts of it.
*/
import React from 'react';
import * as DM from '@radix-ui/react-dropdown-menu';
import { Check, EyeOff, Grid, ListPlus, MoreHorizontal, Palette } from 'lucide-react';
import type { Estimate, EstimateLineItem, EstimatePresentationSettings, ProposalLinePart } from '@/lib/types';
import { estimateTotals } from '@/lib/calculations';
import { prepSummary } from '@/lib/estimating';
import {
  LINE_PARTS, customerLines, lineShown, onlyLinePart, optionalLines, partShown, sectionShown, settingsOf, showWholeLine, toggleLine, toggleLinePart,
} from '@/lib/proposal';
import { useDb, useLookups } from '@/lib/store';
import { cn, fullName, longDate, money } from '@/lib/utils';
import { useLineColours, type CardColour, type LineColour } from './FeatureSections';

type OnSettings = (s: EstimatePresentationSettings) => void;

export function useProposalData(e: Estimate) {
  const look = useLookups();
  const db = useDb();
  const colours = useLineColours(e.id);
  return {
    settings: settingsOf(e),
    totals: estimateTotals(e),
    customer: look.customer(e.customerId),
    estimator: look.member(e.estimatorId ?? e.createdBy),
    terms: look.terms(e.termsId),
    region: db.collections.taxRegions.find((r) => r.id === e.taxRegionId),
    columns: db.collections.tableColumns,
    colourOf: (lineId: string): LineColour | undefined => colours.colours.get(lineId),
    card: colours.card as CardColour[],
    paintLabel: (id?: string) => {
      const p = look.paint(id);
      return p ? `${look.brand(p.brandId)?.name ?? ''} ${p.name}`.trim() : '';
    },
  };
}
type Data = ReturnType<typeof useProposalData>;

const label = 'mb-2 text-xs font-bold uppercase tracking-widest text-gray-400';

export function SectionTitle({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600"><Icon className="h-5 w-5" /></div>
      <h3 className="font-heading text-xl font-bold text-gray-900">{children}</h3>
    </div>
  );
}

/* ---------- Property / customer ---------- */

export function ProposalCustomer({ e, d }: { e: Estimate; d: Data }) {
  const c = d.customer;
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-3 print:grid-cols-3">
      <div>
        <div className={label}>Prepared For</div>
        <div className="text-lg font-bold text-gray-900">{fullName(c)}</div>
        {c?.companyName && <div className="text-sm text-gray-600">{c.companyName}</div>}
        {c?.email && <div className="text-sm text-gray-500">{c.email}</div>}
        {c?.phone && <div className="text-sm text-gray-500">{c.phone}</div>}
      </div>
      <div>
        <div className={label}>Job Site</div>
        <div className="text-sm font-semibold text-gray-800">{e.address || '—'}</div>
        <div className="mt-2 text-xs text-gray-500">{e.estimateType} · {e.title}</div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className={label}>Date</div>
          <div className="text-sm font-bold text-gray-900">{longDate(e.date)}</div>
        </div>
        <div>
          <div className={label}>Valid Until</div>
          <div className="text-sm font-bold text-gray-900">{longDate(e.validUntil)}</div>
        </div>
      </div>
    </div>
  );
}

/* ---------- One scope line ---------- */

function partCell(e: Estimate, l: EstimateLineItem, d: Data, part: ProposalLinePart): React.ReactNode {
  switch (part) {
    case 'location': return l.location || e.areas.find((a) => a.id === l.areaId)?.name || '—';
    case 'quantity': return `${l.quantity} ${l.unit === 'sqft' ? 'sq ft' : l.unit === 'lnft' ? 'lin ft' : l.unit}`;
    case 'colour': {
      const c = d.colourOf(l.id);
      return c ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-gray-300" style={{ backgroundColor: c.hex }} />
          {c.name} <span className="text-gray-400">#{c.number}</span>
        </span>
      ) : '—';
    }
    case 'product': return d.paintLabel(l.paintProductId) || '—';
    case 'sheen': return l.sheen || '—';
    case 'coats': return String(l.coats);
    case 'prep': return prepSummary(l, d.columns).join(', ') || '—';
    case 'price': return money(l.total);
  }
}

const COLS: ProposalLinePart[] = ['location', 'quantity', 'colour', 'product', 'sheen', 'coats', 'prep', 'price'];
const HEAD: Record<ProposalLinePart, string> = { location: 'Location', quantity: 'Amount', colour: 'Colour', product: 'Product', sheen: 'Sheen', coats: 'Coats', prep: 'Preparation', price: 'Price' };

function LineMenu({ l, s, onSettings }: { l: EstimateLineItem; s: EstimatePresentationSettings; onSettings: OnSettings }) {
  const item = 'flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-1.5 text-sm outline-none data-[highlighted]:bg-gray-100';
  const hiddenLine = !lineShown(s, l.id);
  return (
    <DM.Root modal={false}>
      <DM.Trigger asChild>
        <button type="button" className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 print:hidden" aria-label={`Show or hide parts of ${l.description || l.surfaceType}`}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" sideOffset={4} className="z-[160] min-w-[220px] rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
          <DM.Item className={item} onSelect={() => onSettings(toggleLine(s, l.id))}>
            <EyeOff className="h-4 w-4" /> {hiddenLine ? 'Show this line' : 'Hide this line'}
          </DM.Item>
          <DM.Separator className="my-1 h-px bg-gray-100" />
          <DM.Label className="px-3 py-1 text-xxs font-bold uppercase tracking-wider text-gray-400">Show on this line</DM.Label>
          {LINE_PARTS.map((p) => {
            const shown = partShown(s, l.id, p.key);
            return (
              <DM.Item key={p.key} className={item} onSelect={(ev) => { ev.preventDefault(); onSettings(toggleLinePart(s, l.id, p.key)); }}>
                <span className={cn('flex h-4 w-4 items-center justify-center rounded border', shown ? 'border-primary-500 bg-primary-500 text-white' : 'border-gray-300')}>{shown && <Check className="h-3 w-3" />}</span>
                {p.label}
              </DM.Item>
            );
          })}
          <DM.Separator className="my-1 h-px bg-gray-100" />
          <DM.Item className={item} onSelect={() => onSettings(onlyLinePart(s, l.id, 'price'))}>Show only the price</DM.Item>
          <DM.Item className={item} onSelect={() => onSettings(showWholeLine(s, l.id))}>Show everything</DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

function LineTable({ e, lines, d, onSettings, priceColumn }: { e: Estimate; lines: EstimateLineItem[]; d: Data; onSettings?: OnSettings; priceColumn: boolean }) {
  const s = d.settings;
  // Only columns that at least one line shows.
  const cols = COLS.filter((c) => (c !== 'price' || priceColumn) && lines.some((l) => partShown(s, l.id, c)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-bold uppercase tracking-wider text-gray-400">
            <th className="py-2 pr-3">Surface</th>
            {cols.map((c) => <th key={c} className={cn('px-2 py-2', c === 'price' && 'text-right')}>{HEAD[c]}</th>)}
            {onSettings && <th className="w-8 print:hidden" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {lines.map((l) => (
            <tr key={l.id} className={cn(!lineShown(s, l.id) && 'opacity-40')}>
              <td className="py-2 pr-3 font-semibold text-gray-800">
                {l.description || l.surfaceType}
                {!lineShown(s, l.id) && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xxs font-bold uppercase text-gray-500">Hidden</span>}
              </td>
              {cols.map((c) => (
                <td key={c} className={cn('px-2 py-2 text-gray-600', c === 'price' && 'whitespace-nowrap text-right font-semibold text-gray-900')}>
                  {partShown(s, l.id, c) ? partCell(e, l, d, c) : ''}
                </td>
              ))}
              {onSettings && <td className="py-2 text-right print:hidden"><LineMenu l={l} s={s} onSettings={onSettings} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Scope ---------- */

/** `bare`: inside a presentation block, which has its own heading. */
export function ProposalScope({ e, d, onSettings, bare }: { e: Estimate; d: Data; onSettings?: OnSettings; bare?: boolean }) {
  const s = d.settings;
  // While editing, hidden lines stay visible (dimmed) so they can be shown again.
  const linesFor = (areaId: string) => (onSettings ? e.lineItems.filter((l) => l.areaId === areaId && (!l.optional || l.selected)) : customerLines(e, areaId));
  return (
    <div>
      {!bare && <SectionTitle icon={Grid}>Scope of Work</SectionTitle>}
      {e.areas.length === 0 && e.extras.length === 0 && <p className="text-sm text-gray-500">No work items have been added yet.</p>}
      <div className="space-y-8">
        {e.areas.map((a) => {
          const lines = linesFor(a.id);
          if (!lines.length) return null;
          const total = lines.filter((l) => lineShown(s, l.id)).reduce((sum, l) => sum + l.total, 0);
          return (
            <div key={a.id} className="break-inside-avoid">
              <div className="mb-2 flex items-end justify-between border-b-2 border-gray-900 pb-2">
                <h4 className="font-heading text-lg font-bold text-gray-900">{a.name}</h4>
                {sectionShown(s, 'areaTotals') && <span className="text-sm font-bold text-gray-900">{money(total)}</span>}
              </div>
              <LineTable e={e} lines={lines} d={d} onSettings={onSettings} priceColumn={sectionShown(s, 'linePrices')} />
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
                    {sectionShown(s, 'linePrices') && <td className="py-2 text-right font-bold text-gray-900">{money(x.quantity * x.unitPrice)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Paint specifications ---------- */

export function ProposalSpecs({ e, d, bare }: { e: Estimate; d: Data; bare?: boolean }) {
  // The colour card when there is one, else the products on the included lines.
  const products = Array.from(new Set(customerLines(e).map((l) => [d.paintLabel(l.paintProductId), l.sheen ?? ''].join('|')).filter((x) => x !== '|')));
  if (!d.card.length && !products.length) return bare ? <p className="text-sm text-gray-500">Paint specifications will be listed once colours are chosen.</p> : null;
  return (
    <div className="break-inside-avoid">
      {!bare && <SectionTitle icon={Palette}>Paint Specifications</SectionTitle>}
      {d.card.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {d.card.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3">
              <span className="h-10 w-10 shrink-0 rounded-lg border border-gray-200" style={{ backgroundColor: c.hex }} />
              <div className="min-w-0 text-sm">
                <div className="font-bold text-gray-900">#{c.number} {c.name}</div>
                <div className="text-gray-500">{[c.manufacturer, c.product || c.productLine, c.sheen, c.coats ? `${c.coats} coats` : ''].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {products.map((p) => {
            const [name, sheen] = p.split('|');
            return <li key={p} className="rounded-lg border border-gray-200 px-3 py-2"><b className="text-gray-900">{name || 'Paint'}</b>{sheen ? <span className="text-gray-500"> · {sheen}</span> : null}</li>;
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------- Optional items ---------- */

export function ProposalOptional({ e, d, onSettings, bare }: { e: Estimate; d: Data; onSettings?: OnSettings; bare?: boolean }) {
  const lines = onSettings ? e.lineItems.filter((l) => l.optional && !l.selected) : optionalLines(e);
  if (!lines.length) return bare ? <p className="text-sm text-gray-500">No optional items on this estimate.</p> : null;
  const subtotal = lines.filter((l) => lineShown(d.settings, l.id)).reduce((s, l) => s + l.total, 0);
  return (
    <div className={cn('break-inside-avoid', !bare && 'rounded-2xl border border-amber-200 bg-amber-50/40 p-6')}>
      {!bare && <SectionTitle icon={ListPlus}>Optional Items</SectionTitle>}
      <p className={cn('mb-4 text-sm text-gray-600', !bare && '-mt-3')}>Not included in the base price. Prices are before tax and discount; choose any you want when you accept.</p>
      <LineTable e={e} lines={lines} d={d} onSettings={onSettings} priceColumn />
      <p className="mt-3 text-right text-sm font-bold text-gray-900">Optional items: {money(subtotal)}</p>
    </div>
  );
}

/* ---------- Pricing ---------- */

export function ProposalPricing({ e, d }: { e: Estimate; d: Data }) {
  const t = d.totals;
  return (
    <div className="flex justify-end">
      <div className="w-full space-y-3 md:w-1/2 lg:w-1/3 print:w-1/2">
        <div className="flex justify-between text-sm text-gray-600"><span className="font-medium">Base scope</span><span className="font-bold text-gray-900">{money(t.subtotal)}</span></div>
        {t.discount > 0 && <div className="flex justify-between text-sm text-green-600"><span className="font-medium">Discount</span><span className="font-bold">-{money(t.discount)}</span></div>}
        {t.tax > 0 && <div className="flex justify-between text-sm text-gray-600"><span className="font-medium">Tax{d.region ? ` (${d.region.name})` : ''}</span><span className="font-bold text-gray-900">{money(t.tax)}</span></div>}
        <div className="my-4 h-px bg-gray-200" />
        <div className="flex items-end justify-between">
          <span className="text-lg font-bold text-gray-900">Total</span>
          <span className="text-3xl font-extrabold text-primary-600">{money(t.total)}</span>
        </div>
        {t.optionalSubtotal > 0 && sectionShown(d.settings, 'optional') && (
          <div className="text-right text-xs text-gray-500">Optional items available: {money(t.optionalSubtotal)}</div>
        )}
      </div>
    </div>
  );
}
