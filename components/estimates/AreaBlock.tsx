'use client';

/*
  One area in the estimate builder ("Area & Line Items" section).

  Header: editable area name, L / W / H dimensions (amber outline when
  empty, like the live app) and a kebab menu (Table Columns, Duplicate, Delete).
  Table: one row per surface. The columns come from Settings > Table Columns
  (shown/hidden with the eye in the "Table Columns" panel); custom columns are
  preparation activities. Every edit recalculates the row at once
  (lib/estimating.ts): application hours from the per-coat rates, preparation
  hours, gallons, labour, material and price.
  The Included / Optional toggle sits at the right edge of each row.
  NEW (feature 3): the COLOR cell from the colour card (type a colour number,
  or use paint mode, where clicking a row assigns the selected colour).
*/
import React from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Columns3, Copy, Info, Plus, Trash2 } from 'lucide-react';
import type { DifficultyTier, EstimateArea, EstimateLineItem, PaintProduct, SurfaceRate, Brand, TableColumn } from '@/lib/types';
import { RowMenu } from '@/components/ui/menu';
import { cn, money } from '@/lib/utils';
import { includedLine, lineCost } from '@/lib/calculations';
import { CONDITIONS, FALLBACK_COVERAGE, SURFACE_CONDITIONS, coverageFor, prepColumns, prepSummary, usesCoverageFallback } from '@/lib/estimating';
import { pressable } from '@/lib/a11y';

export const SHEENS = ['Flat', 'Matte', 'Eggshell', 'Satin', 'Semi-Gloss', 'Gloss'];
export const UNIT_LABEL: Record<EstimateLineItem['unit'], string> = { sqft: 'sq ft', lnft: 'lin ft', each: 'each', hour: 'hour', gallon: 'gallon' };

export interface AreaBlockProps {
  area: EstimateArea;
  lines: EstimateLineItem[];
  readOnly: boolean;
  surfaceRates: SurfaceRate[];
  paints: PaintProduct[];
  brands: Brand[];
  tiers: DifficultyTier[];
  /** Settings > Table Columns (all of them; hidden ones are skipped). */
  columns: TableColumn[];
  /** Location names offered in the Location cell. */
  locations?: string[];
  onRename: (name: string) => void;
  onDimension: (key: 'length' | 'width' | 'height', value: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAddLine: () => void;
  onUpdateLine: (id: string, patch: Partial<EstimateLineItem>) => void;
  onDeleteLine: (id: string) => void;
  onOpenColumns?: () => void;
  /** NEW (feature 3): the colour card's COLOR cell per line, and paint mode (click a row to assign). */
  colourCell?: (line: EstimateLineItem) => React.ReactNode;
  painting?: boolean;
  onPaintLine?: (id: string) => void;
}

const cellInput =
  'h-8 w-full rounded-md border border-transparent bg-transparent px-1.5 text-sm text-gray-900 hover:border-gray-200 focus:border-primary-400 focus:bg-white focus:outline-none disabled:hover:border-transparent';
const cellSelect = cellInput + ' appearance-none truncate pr-1';

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/** Visible columns in their configured order. The Color column needs the colour card. */
export function visibleColumns(columns: TableColumn[], hasColourCard: boolean) {
  return [...columns]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((c) => c.isVisible && (c.id !== 'tcol_paint' || hasColourCard) && (c.isSystem ? SYSTEM_IDS.has(c.id) : true));
}

const SYSTEM_IDS = new Set([
  'tcol_location', 'tcol_surface', 'tcol_qty', 'tcol_psurface', 'tcol_coats', 'tcol_product', 'tcol_sheen', 'tcol_paint', 'tcol_prepcell',
  'tcol_difficulty', 'tcol_prephours', 'tcol_apphours', 'tcol_hours', 'tcol_gal', 'tcol_rate', 'tcol_matunit', 'tcol_laborcost', 'tcol_matcost', 'tcol_total',
]);
const NUMERIC = new Set(['tcol_prephours', 'tcol_apphours', 'tcol_hours', 'tcol_gal', 'tcol_laborcost', 'tcol_matcost', 'tcol_total']);

export function AreaBlock(p: AreaBlockProps) {
  const { area, lines, readOnly } = p;
  const inc = lines.filter(includedLine);
  const sum = (f: (l: EstimateLineItem) => number) => inc.reduce((s, l) => s + f(l), 0);
  const totalHours = sum((l) => l.laborHours);
  const prepHours = sum((l) => l.prepHours ?? 0);
  const areaTotal = sum((l) => l.total);
  const optionalTotal = lines.filter((l) => !includedLine(l)).reduce((s, l) => s + l.total, 0);
  const hasDims = !!(area.length || area.width || area.height);
  const groups = Array.from(new Set(p.surfaceRates.map((s) => s.rateGroup)));
  const height = p.tiers.filter((t) => t.tierType === 'HEIGHT').sort((a, b) => a.sortOrder - b.sortOrder);
  const access = p.tiers.filter((t) => t.tierType === 'ACCESS').sort((a, b) => a.sortOrder - b.sortOrder);
  const brandName = (id: string) => p.brands.find((b) => b.id === id)?.name ?? '';
  const cols = visibleColumns(p.columns, !!p.colourCell);
  const preps = prepColumns(p.columns);
  const listId = `loc-${area.id}`;

  const cell = (col: TableColumn, l: EstimateLineItem): React.ReactNode => {
    const up = (patch: Partial<EstimateLineItem>) => p.onUpdateLine(l.id, patch);
    const cost = lineCost(l);
    switch (col.id) {
      case 'tcol_location':
        return (
          <input list={listId} disabled={readOnly} value={l.location ?? ''} placeholder={area.name || 'Location'} onChange={(e) => up({ location: e.target.value || undefined })} className={cn(cellInput, 'min-w-[110px]')} aria-label="Location" />
        );
      case 'tcol_surface':
        return (
          <div className="min-w-[170px]">
            <select disabled={readOnly} value={l.surfaceType} onChange={(e) => up({ surfaceType: e.target.value, description: e.target.value })} className={cn(cellSelect, 'text-base font-bold')} aria-label="Surface">
              {!p.surfaceRates.some((s) => s.name === l.surfaceType) && <option value={l.surfaceType}>{l.surfaceType}</option>}
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {p.surfaceRates.filter((s) => s.rateGroup === g).map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                </optgroup>
              ))}
            </select>
            {l.unit !== 'sqft' && (
              <label className="block px-1.5 text-xs text-gray-500">
                Coating area (sq ft)
                <input type="number" min={0} aria-label="Coating area in square feet" disabled={readOnly} className={cellInput} value={l.coatingAreaSqft ?? ''} onChange={(e) => up({ coatingAreaSqft: num(e.target.value) })} />
              </label>
            )}
          </div>
        );
      case 'tcol_qty':
        return (
          <div className="flex min-w-[130px] items-center gap-1">
            <input type="number" min={0} disabled={readOnly} value={l.quantity} onChange={(e) => up({ quantity: num(e.target.value), quantityManual: true })} className={cn(cellInput, 'w-20 text-center font-semibold', !l.quantity && 'border-amber-300')} aria-label="Amount" />
            <select disabled={readOnly} value={l.unit} onChange={(e) => up({ unit: e.target.value as EstimateLineItem['unit'] })} className={cn(cellSelect, 'w-16 text-xs text-gray-500')} aria-label="Unit">
              {(['sqft', 'lnft', 'each'] as const).map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
              {(l.unit === 'hour' || l.unit === 'gallon') && <option value={l.unit}>{UNIT_LABEL[l.unit]}</option>}
            </select>
          </div>
        );
      case 'tcol_psurface':
        return (
          <select disabled={readOnly} value={l.condition ?? 'smooth'} onChange={(e) => up({ condition: e.target.value as EstimateLineItem['condition'] })} className={cn(cellSelect, 'min-w-[88px]')} aria-label="Paint surface" title="Surface characteristic: changes labor and coverage">
            {CONDITIONS.map((c) => <option key={c} value={c}>{SURFACE_CONDITIONS[c].label}</option>)}
          </select>
        );
      case 'tcol_coats':
        return (
          <select disabled={readOnly} value={l.coats} onChange={(e) => up({ coats: Number(e.target.value) })} className={cn(cellSelect, 'w-14 text-center')} aria-label="Coats">
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        );
      case 'tcol_product':
        return (
          <select disabled={readOnly} value={l.paintProductId ?? ''} onChange={(e) => up({ paintProductId: e.target.value || undefined })} className={cn(cellSelect, 'min-w-[160px]')} aria-label="Product">
            <option value="">No paint</option>
            {p.paints.filter((x) => x.isActive || x.id === l.paintProductId).map((x) => (
              <option key={x.id} value={x.id}>{x.name} ({brandName(x.brandId)})</option>
            ))}
          </select>
        );
      case 'tcol_sheen':
        return (
          <select disabled={readOnly} value={l.sheen ?? ''} onChange={(e) => up({ sheen: e.target.value || undefined })} className={cn(cellSelect, 'min-w-[96px]')} aria-label="Sheen">
            <option value="">—</option>
            {[...SHEENS, ...(l.sheen && !SHEENS.includes(l.sheen) ? [l.sheen] : [])].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        );
      case 'tcol_paint':
        return <div className="min-w-[90px] text-center">{p.colourCell?.(l)}</div>;
      case 'tcol_prepcell':
        return <PrepCell line={l} columns={preps} readOnly={readOnly} onChange={up} />;
      case 'tcol_difficulty':
        return (
          <div className="min-w-[150px]">
            <div className="flex gap-1">
              <select disabled={readOnly} value={l.heightTierId ?? ''} onChange={(e) => up({ heightTierId: e.target.value || undefined })} className={cn(cellSelect, 'text-xs')} title="Height tier" aria-label="Height tier">
                <option value="">Height —</option>
                {height.map((t) => <option key={t.id} value={t.id}>{t.name} ×{t.multiplier}</option>)}
              </select>
              <select disabled={readOnly} value={l.accessTierId ?? ''} onChange={(e) => up({ accessTierId: e.target.value || undefined })} className={cn(cellSelect, 'text-xs')} title="Access tier" aria-label="Access tier">
                <option value="">Access —</option>
                {access.map((t) => <option key={t.id} value={t.id}>{t.name} ×{t.multiplier}</option>)}
              </select>
            </div>
            {l.difficultyMultiplier !== 1 && <div className="px-1.5 text-xs font-bold text-amber-600">×{l.difficultyMultiplier}</div>}
          </div>
        );
      case 'tcol_prephours':
        return <span title="Preparation hours">{(l.prepHours ?? 0).toFixed(2)}</span>;
      case 'tcol_apphours':
        return <span title="Application hours (per-coat production rates)">{(l.applicationHours ?? l.laborHours - (l.prepHours ?? 0)).toFixed(2)}</span>;
      case 'tcol_hours':
        return <span className="font-bold text-gray-900">{l.laborHours.toFixed(2)}</span>;
      case 'tcol_gal':
        {
          const paint = coverageFor(p.paints.find((x) => x.id === l.paintProductId), p.surfaceRates.find((s) => s.name === l.surfaceType));
          return (
            <span className="inline-flex flex-col items-end">
              <span className="font-semibold text-blue-600" title="Gallons of paint">{(l.gallons ?? 0).toFixed(2)}</span>
              {usesCoverageFallback(paint) && (
                <span className="mt-0.5 whitespace-nowrap rounded bg-amber-50 px-1 text-xs font-semibold text-amber-700" title={`No coverage is set for ${paint?.name ?? 'this product'} in the Paint Library or on this surface rate, so ${FALLBACK_COVERAGE} sq ft per gallon is assumed.`}>
                  Coverage not set
                </span>
              )}
            </span>
          );
        }
      case 'tcol_rate':
        return <input type="number" min={0} disabled={readOnly} value={l.laborRate} onChange={(e) => up({ laborRate: num(e.target.value) })} className={cn(cellInput, 'w-20 text-center')} aria-label="Labor rate" />;
      case 'tcol_matunit':
        return <input type="number" min={0} step="0.01" disabled={readOnly} value={l.unitPrice} onChange={(e) => up({ unitPrice: num(e.target.value) })} className={cn(cellInput, 'w-20 text-center')} aria-label="Material price per unit" />;
      case 'tcol_laborcost':
        return <span title="Labor cost">{money(cost.labor)}</span>;
      case 'tcol_matcost':
        return <span title="Material cost">{money(cost.material)}</span>;
      case 'tcol_total':
        return <span className={cn('font-black', includedLine(l) ? 'text-gray-900' : 'text-gray-500')}>{money(l.total)}</span>;
      default:
        return <PrepInput col={col} line={l} readOnly={readOnly} onChange={up} />;
    }
  };

  return (
    <div id={`area-${area.id}`} className="group/area">
      {/* Area header */}
      <div className="flex flex-col items-start justify-between gap-3 rounded-t-xl border border-gray-200 bg-gray-50 px-4 py-2 shadow-sm md:flex-row md:items-center">
        <input
          type="text"
          disabled={readOnly}
          value={area.name}
          onChange={(e) => p.onRename(e.target.value)}
          placeholder="Area Name"
          aria-label="Area name"
          className="w-full border-b-2 border-transparent bg-transparent font-heading text-lg font-bold text-gray-900 outline-none transition-all placeholder:text-gray-400 hover:border-gray-400 focus:border-primary-400 disabled:hover:border-transparent md:w-auto md:text-xl"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xxs font-bold uppercase tracking-wider text-gray-500">L x W x H</span>
          {(['length', 'width', 'height'] as const).map((k) => (
            <label key={k} className={cn('flex items-center gap-1 rounded-md border bg-white px-2 py-0.5 shadow-sm', !area[k] && !readOnly ? 'border-amber-500/50 ring-1 ring-amber-500/20' : 'border-gray-200')}>
              <input
                type="number"
                min={0}
                disabled={readOnly}
                value={area[k] || ''}
                placeholder="0"
                onChange={(e) => p.onDimension(k, num(e.target.value))}
                className="w-12 rounded bg-transparent text-right text-sm font-bold text-gray-900 outline-none placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-primary-400/60"
                aria-label={k}
              />
              <span className="text-xxs font-bold uppercase text-gray-500">{k[0]}</span>
            </label>
          ))}
          <div className="border-l border-gray-200 pl-2">
            <RowMenu
              items={[
                ...(p.onOpenColumns ? [{ label: 'Table Columns', icon: <Columns3 />, onClick: p.onOpenColumns }] : []),
                ...(!readOnly
                  ? [
                      { label: 'Duplicate', icon: <Copy />, onClick: p.onDuplicate },
                      { label: 'Delete', icon: <Trash2 />, danger: true, separatorBefore: true, onClick: p.onDelete },
                    ]
                  : []),
              ]}
            />
          </div>
        </div>
      </div>

      <datalist id={listId}>
        {Array.from(new Set([area.name, ...(p.locations ?? [])].filter(Boolean))).map((x) => <option key={x} value={x} />)}
      </datalist>

      {/* Line items */}
      <div className="overflow-x-auto rounded-b-xl border border-t-0 border-gray-200 bg-white">
        {lines.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-gray-500">
            <Info className="h-4 w-4" /> No surfaces in this area yet.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                {cols.map((c) => (
                  <th
                    key={c.id}
                    className={cn(
                      'whitespace-nowrap px-2 py-2 text-xs font-bold uppercase tracking-wider text-gray-500',
                      c.id === 'tcol_surface' ? 'border-r-2 border-r-gray-200 px-4' : 'text-center',
                      NUMERIC.has(c.id) && 'text-right',
                      !c.isSystem && 'bg-amber-50/60 text-amber-700',
                    )}
                    title={!c.isSystem ? 'Preparation activity (Settings > Table Columns)' : undefined}
                  >
                    {c.name}
                  </th>
                ))}
                <th className="whitespace-nowrap px-2 py-2 text-center text-xs font-bold uppercase tracking-wider text-gray-500">Scope</th>
                {!readOnly && <th className="w-10" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lines.map((l) => {
                const optional = !includedLine(l);
                return (
                  <tr {...pressable(p.painting, { row: true })}
                    key={l.id}
                    onClick={p.painting ? () => p.onPaintLine?.(l.id) : undefined}
                    className={cn('group', p.painting ? 'cursor-pointer hover:bg-green-50' : 'hover:bg-gray-50', optional && 'bg-gray-50/70')}
                  >
                    {cols.map((c) => (
                      <td
                        key={c.id}
                        className={cn(
                          'px-2 py-2 text-sm text-gray-700',
                          c.id === 'tcol_surface' && 'border-r-2 border-r-gray-200 px-3',
                          NUMERIC.has(c.id) && 'whitespace-nowrap text-right',
                          !c.isSystem && 'bg-amber-50/30 text-center',
                        )}
                      >
                        {cell(c, l)}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-center">
                      <ScopeToggle line={l} readOnly={readOnly} onChange={(patch) => p.onUpdateLine(l.id, patch)} />
                    </td>
                    {!readOnly && (
                      <td className="px-1 py-2">
                        <button type="button" onClick={() => p.onDeleteLine(l.id)} className="rounded-md p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-600" aria-label="Remove line">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer: add line + totals */}
      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {!readOnly ? (
          <button
            type="button"
            onClick={p.onAddLine}
            className="flex w-fit items-center gap-2 rounded-xl border-2 border-dashed border-gray-200 px-4 py-2 text-sm font-bold text-gray-500 transition-colors hover:border-primary-300 hover:text-primary-600"
          >
            <Plus className="h-4 w-4" /> Add Line Item
          </button>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          {!hasDims && !readOnly && <span className="hidden text-xs text-amber-600 md:inline">Enter dimensions (L, W, or H) to auto-fill amounts.</span>}
          <span className="text-gray-500">Prep: <b className="text-gray-900">{prepHours.toFixed(2)} h</b></span>
          <span className="text-gray-500">Application: <b className="text-gray-900">{(totalHours - prepHours).toFixed(2)} h</b></span>
          <span className="text-gray-500">Total Hrs: <b className="text-gray-900">{totalHours.toFixed(2)}</b></span>
          {optionalTotal > 0 && <span className="text-gray-500">Optional: <b className="text-amber-700">{money(optionalTotal)}</b></span>}
          <span className="text-gray-500">Area Total: <b className="text-gray-900">{money(areaTotal)}</b></span>
        </div>
      </div>
    </div>
  );
}

/** Included / Optional control at the right edge of a row. An optional row stays fully priced. */
function ScopeToggle({ line, readOnly, onChange }: { line: EstimateLineItem; readOnly: boolean; onChange: (p: Partial<EstimateLineItem>) => void }) {
  const state = line.optional ? (line.selected ? 'selected' : 'optional') : 'included';
  const styles = { included: 'border-green-200 bg-green-50 text-green-700', optional: 'border-amber-200 bg-amber-50 text-amber-700', selected: 'border-blue-200 bg-blue-50 text-blue-700' };
  return (
    <select
      aria-label="Included or optional"
      disabled={readOnly}
      value={state}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange({ optional: e.target.value !== 'included', selected: e.target.value === 'selected' })}
      className={cn('h-7 rounded-full border px-2 text-xs font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60 disabled:opacity-80', styles[state])}
      title="Optional work stays priced but is kept out of the base total until the customer selects it"
    >
      <option value="included">Included</option>
      <option value="optional">Optional</option>
      <option value="selected">Optional — selected</option>
    </select>
  );
}

/** A preparation activity cell: checkbox, hours or quantity. */
function PrepInput({ col, line, readOnly, onChange }: { col: TableColumn; line: EstimateLineItem; readOnly: boolean; onChange: (p: Partial<EstimateLineItem>) => void }) {
  const v = line.prep?.[col.id];
  const set = (value: number | boolean | undefined) => {
    const next = { ...(line.prep ?? {}) };
    if (value === undefined || value === false || value === 0) delete next[col.id];
    else next[col.id] = value;
    onChange({ prep: next });
  };
  if (col.columnType === 'CHECKBOX') {
    return <input type="checkbox" disabled={readOnly} checked={v === true} onChange={(e) => set(e.target.checked)} className="h-4 w-4 accent-primary-600" aria-label={col.name} />;
  }
  return (
    <div className="flex items-center justify-center gap-0.5">
      <input type="number" min={0} step="0.25" disabled={readOnly} value={typeof v === 'number' ? v : ''} placeholder="0" onChange={(e) => set(num(e.target.value) || undefined)} className={cn(cellInput, 'w-16 text-center')} aria-label={col.name} />
      <span className="text-xs text-gray-500">{col.columnType === 'HOURS' ? 'h' : col.unit === 'Percent' ? '%' : col.unit}</span>
    </div>
  );
}

/** Preparation cell: surface type plus every prep activity, in one popover. */
function PrepCell({ line, columns, readOnly, onChange }: { line: EstimateLineItem; columns: TableColumn[]; readOnly: boolean; onChange: (p: Partial<EstimateLineItem>) => void }) {
  const summary = prepSummary(line, columns);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="flex min-w-[130px] max-w-[200px] items-center justify-between gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-left text-xs hover:border-primary-300"
          aria-label="Preparation"
        >
          <span className={cn('truncate', summary.length ? 'text-gray-800' : 'italic text-gray-500')}>{summary.length ? summary.join(', ') : 'No prep'}</span>
          <span className="shrink-0 font-semibold text-gray-500">{(line.prepHours ?? 0).toFixed(1)}h</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} className="z-[120] w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
          <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Surface type</div>
          <select
            disabled={readOnly}
            value={line.condition ?? 'smooth'}
            onChange={(e) => onChange({ condition: e.target.value as EstimateLineItem['condition'] })}
            className="mt-1 h-9 w-full rounded-lg border border-gray-200 px-2 text-sm"
            aria-label="Surface type"
          >
            {CONDITIONS.map((c) => <option key={c} value={c}>{SURFACE_CONDITIONS[c].label}</option>)}
          </select>
          <div className="mt-3 text-xs font-bold uppercase tracking-wide text-gray-500">Preparation</div>
          {columns.length === 0 ? (
            <p className="mt-1 text-xs text-gray-500">Add preparation activities in Settings › Table Columns.</p>
          ) : (
            <ul className="mt-1 space-y-1.5">
              {columns.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-gray-700">
                    {c.name}
                    {c.prepRate ? <span className="ml-1 text-xs text-gray-500">{c.prepRate}/h</span> : null}
                  </span>
                  <PrepInput col={c} line={line} readOnly={readOnly} onChange={onChange} />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex justify-between border-t border-gray-100 pt-2 text-xs text-gray-600">
            <span>Preparation</span>
            <b>{(line.prepHours ?? 0).toFixed(2)} h</b>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
