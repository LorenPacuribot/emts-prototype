'use client';

/*
  Modals used by the estimate builder:
  - AddToEstimateModal: "Add to Estimate" -> an Area (from Area Templates or a
    custom name) or a Line Item (from Settings > Line Items, or custom).
  - SurfacePickerModal: "Add Line Item" inside an area -> pick a surface
    from Settings > Surface Rates.
*/
import React, { useMemo, useState } from 'react';
import { Grid3x3, LayoutTemplate, List, Plus, Search } from 'lucide-react';
import type { AreaTemplate, EstimateType, LineItemTemplate, SurfaceRate } from '@/lib/types';
import { Modal } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Tabs } from '@/components/ui/display';
import { cn, money } from '@/lib/utils';

export function AddToEstimateModal({
  open, onOpenChange, areaTemplates, estimateTypes, currentTypeName, surfaceRates, lineItems, onAddArea, onAddCustomArea, onAddExtra,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  areaTemplates: AreaTemplate[];
  estimateTypes: EstimateType[];
  currentTypeName: string;
  surfaceRates: SurfaceRate[];
  lineItems: LineItemTemplate[];
  onAddArea: (tpl: AreaTemplate) => void;
  onAddCustomArea: (name: string) => void;
  onAddExtra: (x: { name: string; quantity: number; unitPrice: number; percent?: number }) => void;
}) {
  const [tab, setTab] = useState<'area' | 'line'>('area');
  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState('');
  const [custom, setCustom] = useState('');
  const [line, setLine] = useState({ name: '', quantity: 1, unitPrice: 0 });
  const [error, setError] = useState('');

  const currentType = estimateTypes.find((t) => t.name === currentTypeName);
  const areas = useMemo(
    () =>
      [...areaTemplates]
        .filter((a) => showAll || !currentType || a.estimateTypeId === currentType.id)
        .filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [areaTemplates, showAll, currentType, q],
  );
  const lib = [...lineItems].sort((a, b) => a.sortOrder - b.sortOrder).filter((x) => !q || x.name.toLowerCase().includes(q.toLowerCase()));
  const srName = (id: string) => surfaceRates.find((s) => s.id === id)?.name;
  const typeName = (id: string) => estimateTypes.find((t) => t.id === id)?.name ?? '';

  const close = () => {
    setQ('');
    setCustom('');
    setLine({ name: '', quantity: 1, unitPrice: 0 });
    setError('');
    onOpenChange(false);
  };

  return (
    <Modal open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())} title="Add to Estimate" size="lg">
      <Tabs
        value={tab}
        onChange={(v) => setTab(v as 'area' | 'line')}
        className="mb-4"
        tabs={[
          { value: 'area', label: <span className="flex items-center gap-1.5"><Grid3x3 className="h-4 w-4" />New Area</span> },
          { value: 'line', label: <span className="flex items-center gap-1.5"><List className="h-4 w-4" />Line Item</span> },
        ]}
      />
      <Input leftIcon={<Search className="h-4 w-4" />} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} />

      {tab === 'area' ? (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500">Area Template</p>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show all scopes
            </label>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {(!q || 'blank area'.includes(q.toLowerCase())) && (
              <button
                type="button"
                onClick={() => {
                  onAddCustomArea('New Area');
                  close();
                }}
                className="flex w-full items-center gap-4 rounded-xl border border-dashed border-gray-300 bg-white p-3 text-left hover:border-primary-300 hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-400"><Plus className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-gray-800">Blank Area</div>
                  <div className="truncate text-xs text-gray-500">An empty area: name it, enter L x W x H, then add line items.</div>
                </div>
              </button>
            )}
            {areas.length === 0 && q && <p className="py-6 text-center text-sm text-gray-500">No area templates found.</p>}
            {areas.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  onAddArea(a);
                  close();
                }}
                className="flex w-full items-center gap-4 rounded-xl border border-gray-200 bg-white p-3 text-left hover:border-primary-300 hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-400"><LayoutTemplate className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-gray-800">{a.name} <span className="ml-1 text-xs font-medium text-gray-400">{typeName(a.estimateTypeId)}</span></div>
                  <div className="truncate text-xs text-gray-500">{a.surfaceRateIds.map(srName).filter(Boolean).join(', ') || 'No surfaces'}</div>
                </div>
                <Plus className="h-4 w-4 text-gray-400" />
              </button>
            ))}
          </div>
          <div className="border-t border-gray-100 pt-4">
            <Field label="Or add a custom area" error={error}>
              <div className="flex gap-2">
                <div className="flex-1"><Input value={custom} placeholder="e.g. Guest Bedroom" invalid={!!error} onChange={(e) => setCustom(e.target.value)} /></div>
                <Button
                  onClick={() => {
                    if (!custom.trim()) return setError('Enter an area name');
                    onAddCustomArea(custom.trim());
                    close();
                  }}
                >
                  Add Area
                </Button>
              </div>
            </Field>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <p className="text-sm font-medium text-gray-500">Line Items Library</p>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {lib.length === 0 && <p className="py-6 text-center text-sm text-gray-500">No line items found.</p>}
            {lib.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => {
                  onAddExtra({
                    name: x.name,
                    quantity: 1,
                    unitPrice: x.itemType === 'PRICED' && x.calculationType === 'FLAT_PRICE' ? x.defaultValue ?? 0 : 0,
                    percent: x.itemType === 'PRICED' && x.calculationType === 'PERCENT' ? x.defaultValue : undefined,
                  });
                  close();
                }}
                className="flex w-full items-center gap-4 rounded-xl border border-gray-200 bg-white p-3 text-left hover:border-primary-300 hover:shadow-md"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-gray-800">{x.name}</div>
                  <div className="truncate text-xs text-gray-500">{x.description}</div>
                </div>
                <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold', x.itemType === 'PRICED' ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-gray-500')}>
                  {x.itemType === 'DESCRIPTIVE' ? 'Descriptive' : x.calculationType === 'PERCENT' ? `${x.defaultValue}%` : money(x.defaultValue ?? 0)}
                </span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_80px_110px_auto] items-end gap-2 border-t border-gray-100 pt-4">
            <Field label="Custom item" error={error}>
              <Input value={line.name} invalid={!!error} placeholder="Description" onChange={(e) => setLine({ ...line, name: e.target.value })} />
            </Field>
            <Field label="Qty"><Input type="number" min={0} value={line.quantity} onChange={(e) => setLine({ ...line, quantity: Number(e.target.value) || 0 })} /></Field>
            <Field label="Price"><Input type="number" min={0} value={line.unitPrice} onChange={(e) => setLine({ ...line, unitPrice: Number(e.target.value) || 0 })} /></Field>
            <Button
              onClick={() => {
                if (!line.name.trim()) return setError('Enter a description');
                onAddExtra({ ...line, name: line.name.trim() });
                close();
              }}
            >
              Add
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function SurfacePickerModal({
  open, onOpenChange, surfaceRates, onPick,
}: { open: boolean; onOpenChange: (o: boolean) => void; surfaceRates: SurfaceRate[]; onPick: (sr: SurfaceRate) => void }) {
  const [q, setQ] = useState('');
  const list = surfaceRates.filter((s) => !q || `${s.name} ${s.rateGroup}`.toLowerCase().includes(q.toLowerCase()));
  const groups = Array.from(new Set(list.map((s) => s.rateGroup)));
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Select Item to Add" description="Choose the surface to add. Rates and coats come from Settings › Surface Rates." size="md">
      <Input leftIcon={<Search className="h-4 w-4" />} placeholder="Search surfaces…" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} />
      <div className="mt-4 max-h-96 space-y-4 overflow-y-auto pr-1">
        {groups.length === 0 && <p className="py-6 text-center text-sm text-gray-500">No surfaces found.</p>}
        {groups.map((g) => (
          <div key={g}>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">{g}</div>
            <div className="space-y-1.5">
              {list.filter((s) => s.rateGroup === g).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onPick(s);
                    onOpenChange(false);
                    setQ('');
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:border-primary-300 hover:bg-primary-50/40"
                >
                  <span className="font-semibold text-gray-800">{s.name}</span>
                  <span className="text-xs text-gray-500">{[s.rateCoat1, s.rateCoat2, s.rateCoat3, s.rateCoat4].filter((r) => r > 0).join(' / ')} {s.unit}/hr · {s.defaultCoats} coats</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
