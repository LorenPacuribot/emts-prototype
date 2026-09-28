'use client';

/*
  One area in the estimate builder ("Area & Line Items" section).

  Header: editable area name, L / W / H dimensions (amber outline when
  empty, like the live app) and a kebab menu (Duplicate, Delete).
  Table: one row per surface. Labor hours are calculated from the surface's
  production rate; the line total comes from lineTotal() in lib/calculations.
  NEW (feature 3): an optional COLOR column from the colour card, and paint
  mode, where clicking a row assigns the selected colour to that surface.
*/
import React from 'react';
import { Copy, Info, Plus, Trash2 } from 'lucide-react';
import type { DifficultyTier, EstimateArea, EstimateLineItem, PaintProduct, SurfaceRate, Brand } from '@/lib/types';
import { RowMenu } from '@/components/ui/menu';
import { cn, money } from '@/lib/utils';

export interface AreaBlockProps {
  area: EstimateArea;
  lines: EstimateLineItem[];
  readOnly: boolean;
  surfaceRates: SurfaceRate[];
  paints: PaintProduct[];
  brands: Brand[];
  tiers: DifficultyTier[];
  onRename: (name: string) => void;
  onDimension: (key: 'length' | 'width' | 'height', value: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAddLine: () => void;
  onUpdateLine: (id: string, patch: Partial<EstimateLineItem>) => void;
  onDeleteLine: (id: string) => void;
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

export function AreaBlock(p: AreaBlockProps) {
  const { area, lines, readOnly } = p;
  const totalHours = lines.reduce((s, l) => s + l.laborHours, 0);
  const areaTotal = lines.reduce((s, l) => s + l.total, 0);
  const hasDims = !!(area.length || area.width || area.height);
  const groups = Array.from(new Set(p.surfaceRates.map((s) => s.rateGroup)));
  const height = p.tiers.filter((t) => t.tierType === 'HEIGHT').sort((a, b) => a.sortOrder - b.sortOrder);
  const access = p.tiers.filter((t) => t.tierType === 'ACCESS').sort((a, b) => a.sortOrder - b.sortOrder);
  const brandName = (id: string) => p.brands.find((b) => b.id === id)?.name ?? '';

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
          {(['length', 'width', 'height'] as const).map((k) => (
            <label
              key={k}
              className={cn(
                'flex items-center gap-1 rounded-md border bg-white px-2 py-0.5 shadow-sm',
                !area[k] && !readOnly ? 'border-amber-500/50 ring-1 ring-amber-500/20' : 'border-gray-200',
              )}
            >
              <input
                type="number"
                min={0}
                disabled={readOnly}
                value={area[k] || ''}
                placeholder="0"
                onChange={(e) => p.onDimension(k, num(e.target.value))}
                className="w-12 bg-transparent text-right text-sm font-bold text-gray-900 outline-none placeholder:text-gray-400"
                aria-label={k}
              />
              <span className="text-[9px] font-bold uppercase text-gray-500">{k[0]}</span>
            </label>
          ))}
          {!readOnly && (
            <div className="border-l border-gray-200 pl-2">
              <RowMenu
                items={[
                  { label: 'Duplicate', icon: <Copy />, onClick: p.onDuplicate },
                  { label: 'Delete', icon: <Trash2 />, danger: true, separatorBefore: true, onClick: p.onDelete },
                ]}
              />
            </div>
          )}
        </div>
      </div>

      {/* Line items */}
      <div className="overflow-x-auto rounded-b-xl border border-t-0 border-gray-200 bg-white">
        {lines.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-gray-500">
            <Info className="h-4 w-4" /> No surfaces in this area yet.
          </div>
        ) : (
          <table className="min-w-[1000px] w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                {['Item', 'Amount', 'Coats', 'Paint', ...(p.colourCell ? ['Color'] : []), 'Difficulty', 'Hours', 'Rate', 'Mat./Unit', 'Total'].map((h, i, all) => (
                  <th
                    key={h}
                    className={cn(
                      'px-2 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500',
                      i === 0 ? 'min-w-[180px] border-r-2 border-r-gray-200 px-4' : 'text-center',
                      i === all.length - 1 && 'text-right',
                    )}
                  >
                    {h}
                  </th>
                ))}
                {!readOnly && <th className="w-10" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lines.map((l) => (
                <tr
                  key={l.id}
                  onClick={p.painting ? () => p.onPaintLine?.(l.id) : undefined}
                  className={cn('group', p.painting ? 'cursor-pointer hover:bg-green-50' : 'hover:bg-gray-50')}
                >
                  <td className="border-r-2 border-r-gray-200 px-3 py-2">
                    <select
                      disabled={readOnly}
                      value={l.surfaceType}
                      onChange={(e) => p.onUpdateLine(l.id, { surfaceType: e.target.value, description: e.target.value })}
                      className={cn(cellSelect, 'text-base font-bold')}
                      aria-label="Surface"
                    >
                      {!p.surfaceRates.some((s) => s.name === l.surfaceType) && <option value={l.surfaceType}>{l.surfaceType}</option>}
                      {groups.map((g) => (
                        <optgroup key={g} label={g}>
                          {p.surfaceRates.filter((s) => s.rateGroup === g).map((s) => (
                            <option key={s.id} value={s.name}>{s.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <div className="px-1.5 text-[10px] uppercase tracking-wider text-gray-400">{l.unit}</div>
                  </td>
                  <td className="w-24 px-2 py-2">
                    <input
                      type="number"
                      min={0}
                      disabled={readOnly}
                      value={l.quantity}
                      onChange={(e) => p.onUpdateLine(l.id, { quantity: num(e.target.value), quantityManual: true })}
                      className={cn(cellInput, 'text-center font-semibold', !l.quantity && 'border-amber-300')}
                      aria-label="Amount"
                    />
                  </td>
                  <td className="w-16 px-2 py-2">
                    <select
                      disabled={readOnly}
                      value={l.coats}
                      onChange={(e) => p.onUpdateLine(l.id, { coats: Number(e.target.value) })}
                      className={cn(cellSelect, 'text-center')}
                      aria-label="Coats"
                    >
                      {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </td>
                  <td className="w-44 px-2 py-2">
                    <select
                      disabled={readOnly}
                      value={l.paintProductId ?? ''}
                      onChange={(e) => p.onUpdateLine(l.id, { paintProductId: e.target.value || undefined })}
                      className={cellSelect}
                      aria-label="Paint"
                    >
                      <option value="">No paint</option>
                      {p.paints.filter((x) => x.isActive || x.id === l.paintProductId).map((x) => (
                        <option key={x.id} value={x.id}>{x.name} ({brandName(x.brandId)})</option>
                      ))}
                    </select>
                  </td>
                  {p.colourCell && <td className="w-24 px-2 py-2 text-center">{p.colourCell(l)}</td>}
                  <td className="w-40 px-2 py-2">
                    <div className="flex gap-1">
                      <select
                        disabled={readOnly}
                        value={l.heightTierId ?? ''}
                        onChange={(e) => p.onUpdateLine(l.id, { heightTierId: e.target.value || undefined })}
                        className={cn(cellSelect, 'text-xs')}
                        title="Height tier"
                        aria-label="Height tier"
                      >
                        <option value="">Height —</option>
                        {height.map((t) => <option key={t.id} value={t.id}>{t.name} ×{t.multiplier}</option>)}
                      </select>
                      <select
                        disabled={readOnly}
                        value={l.accessTierId ?? ''}
                        onChange={(e) => p.onUpdateLine(l.id, { accessTierId: e.target.value || undefined })}
                        className={cn(cellSelect, 'text-xs')}
                        title="Access tier"
                        aria-label="Access tier"
                      >
                        <option value="">Access —</option>
                        {access.map((t) => <option key={t.id} value={t.id}>{t.name} ×{t.multiplier}</option>)}
                      </select>
                    </div>
                    {l.difficultyMultiplier !== 1 && (
                      <div className="px-1.5 text-[10px] font-bold text-amber-600">×{l.difficultyMultiplier}</div>
                    )}
                  </td>
                  <td className="w-16 px-2 py-2 text-center text-sm font-semibold text-gray-700">{l.laborHours.toFixed(2)}</td>
                  <td className="w-20 px-2 py-2">
                    <input
                      type="number"
                      min={0}
                      disabled={readOnly}
                      value={l.laborRate}
                      onChange={(e) => p.onUpdateLine(l.id, { laborRate: num(e.target.value) })}
                      className={cn(cellInput, 'text-center')}
                      aria-label="Labor rate"
                    />
                  </td>
                  <td className="w-20 px-2 py-2">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      disabled={readOnly}
                      value={l.unitPrice}
                      onChange={(e) => p.onUpdateLine(l.id, { unitPrice: num(e.target.value) })}
                      className={cn(cellInput, 'text-center')}
                      aria-label="Material price per unit"
                    />
                  </td>
                  <td className="w-28 px-3 py-2 text-right text-sm font-black text-gray-900">{money(l.total)}</td>
                  {!readOnly && (
                    <td className="px-1 py-2">
                      <button
                        type="button"
                        onClick={() => p.onDeleteLine(l.id)}
                        className="rounded-md p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-600"
                        aria-label="Remove line"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer: add line + totals */}
      <div className="mt-4 flex items-center justify-between">
        {!readOnly ? (
          <button
            type="button"
            onClick={p.onAddLine}
            className="flex items-center gap-2 rounded-xl border-2 border-dashed border-gray-200 px-4 py-2 text-sm font-bold text-gray-500 transition-colors hover:border-primary-300 hover:text-primary-600"
          >
            <Plus className="h-4 w-4" /> Add Line Item
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-5 text-sm">
          {!hasDims && !readOnly && <span className="hidden text-xs text-amber-600 md:inline">Enter dimensions (L, W, or H) to auto-fill amounts.</span>}
          <span className="text-gray-500">Total Hrs: <b className="text-gray-900">{totalHours.toFixed(2)}</b></span>
          <span className="text-gray-500">Area Total: <b className="text-gray-900">{money(areaTotal)}</b></span>
        </div>
      </div>
    </div>
  );
}
