'use client';

/*
  Estimate Template editor (/settings/estimate-templates/new and /[id]).

  A template is the starting structure for a new estimate. The live
  editor looks like the estimate builder without customer data:
    1. Toolbar: Back to Templates, Save Template, name / type / description
    2. Paint Color Card: the default paint product
    3. Area & Line Items: areas (from Area Templates, with their surfaces)
       and priced / descriptive line items (from Line Items)
    4. Customer Notes / Internal Notes
    5. Paint & Materials: materials & supplies with quantities
    6. Labor Summary: one row per area surface (hours are 0 until an
       estimate adds measurements)
    7. Finalize Estimate: pricing model, profit margin, deposit schedule,
       terms, attachments, difficulty tiers, tax and discount

  Edits stay local until "Save Template", which writes to the store.
*/
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ArrowDown, ArrowUp, CheckSquare, Clock, FileText, Grid3x3, LayoutGrid, List, Package, Palette, Plus, Save, Trash2, Upload, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Label, Select, Textarea } from '@/components/ui/form';
import { EmptyState, SearchInput } from '@/components/ui/display';
import { useToast } from '@/components/ui/toast';
import { Modal } from '@/components/Modals/Modal';
import { useCollection, useDb, useLookups } from '@/lib/store';
import type { EstimateTemplate, LineItemTemplate } from '@/lib/types';
import { cn, money } from '@/lib/utils';
import { FieldError, UNIT_LABELS, nextSort, num } from './ui';
import { LineItemModal } from './LineItemsView';

type Draft = Omit<EstimateTemplate, 'id' | 'createdAt' | 'updatedAt'>;

const blankDraft = (): Draft => ({
  name: '', description: '', estimateTypeId: '', areaTemplateIds: [], lineItemTemplateIds: [], termsId: undefined,
  defaultPaintProductId: undefined, profitMargin: 20, isDefault: false, customerNotes: '', internalNotes: '', materials: [],
  pricingModel: 'HOURLY', depositSchedule: '',
});

export function TemplateEditor({ id }: { id?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const templates = useCollection('estimateTemplates');
  const lineItems = useCollection('lineItemTemplates');
  const db = useDb();
  const lookups = useLookups();
  const c = db.collections;
  const existing = id ? templates.get(id) : undefined;

  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<string[]>([]);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  // Load the saved template once (or reset for "new").
  useEffect(() => {
    const key = id ?? 'new';
    if (loadedId === key) return;
    if (existing) {
      const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = existing;
      setDraft({ ...blankDraft(), ...structuredClone(rest) });
    } else if (!id) setDraft({ ...blankDraft(), termsId: c.termsConditions.find((t) => t.isDefault)?.id });
    setLoadedId(key);
  }, [id, existing, loadedId, c.termsConditions]);

  // Add-content modals
  const [addOpen, setAddOpen] = useState(false);
  const [pickArea, setPickArea] = useState(false);
  const [pickItem, setPickItem] = useState<LineItemTemplate['itemType'] | null>(null);
  const [createItem, setCreateItem] = useState<LineItemTemplate['itemType'] | null>(null);
  const [pickMaterial, setPickMaterial] = useState(false);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (errors[k as string]) setErrors((e) => ({ ...e, [k as string]: '' }));
  };

  const areas = draft.areaTemplateIds.map((aid) => lookups.areaTemplate(aid)).filter((a): a is NonNullable<typeof a> => !!a);
  const items = draft.lineItemTemplateIds.map((lid) => lineItems.get(lid)).filter((x): x is LineItemTemplate => !!x);
  const paint = lookups.paint(draft.defaultPaintProductId);
  const mats = (draft.materials ?? []).map((m) => ({ ...m, material: c.materials.find((x) => x.id === m.materialId) })).filter((m) => m.material);
  const materialsTotal = mats.reduce((s, m) => s + m.qty * (m.material?.unitCost ?? 0), 0);

  const move = (list: string[], i: number, dir: -1 | 1) => {
    const next = [...list];
    const j = i + dir;
    if (j < 0 || j >= next.length) return list;
    [next[i], next[j]] = [next[j]!, next[i]!];
    return next;
  };

  const save = () => {
    const e: Record<string, string> = {};
    if (!draft.name.trim()) e.name = 'Template name is required';
    if (!draft.estimateTypeId) e.estimateTypeId = 'Estimate type is required';
    if (draft.profitMargin < 0 || draft.profitMargin > 100) e.profitMargin = 'Profit margin must be between 0 and 100';
    setErrors(e);
    if (Object.keys(e).length) {
      toast('Please fix the highlighted fields', 'error');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const now = new Date().toISOString();
    const data = { ...draft, name: draft.name.trim() };
    // Only one default template at a time.
    if (data.isDefault) templates.items.forEach((t) => t.id !== id && t.isDefault && templates.update(t.id, { isDefault: false }));
    if (existing) {
      templates.update(existing.id, { ...data, updatedAt: now });
      toast('Template updated successfully');
    } else {
      templates.add({ ...data, createdAt: now, updatedAt: now });
      toast('Template created successfully');
    }
    router.push('/settings/estimate-templates');
  };

  if (id && !existing && loadedId !== null) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12">
        <EmptyState
          title="Template not found"
          message="This template may have been deleted."
          action={<Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => router.push('/settings/estimate-templates')}>Back to Templates</Button>}
        />
      </div>
    );
  }

  const typeOptions = c.estimateTypes.map((t) => ({ label: t.name, value: t.id }));
  const opt = (list: { id: string; name: string }[]) => list.map((x) => ({ label: x.name, value: x.id }));
  const selectedAreaIds = new Set(draft.areaTemplateIds);
  const availableAreas = c.areaTemplates.filter((a) => !selectedAreaIds.has(a.id)).sort((a, b) => (a.estimateTypeId === draft.estimateTypeId ? -1 : 0) - (b.estimateTypeId === draft.estimateTypeId ? -1 : 0) || a.sortOrder - b.sortOrder);

  return (
    <div className="mx-auto my-4 w-full max-w-[1000px] px-4 pb-32 md:my-6 md:px-6">
      {/* Toolbar */}
      <div className="mb-6 flex items-center justify-between">
        <button type="button" onClick={() => router.push('/settings/estimate-templates')} className="flex items-center gap-1 text-sm font-semibold text-gray-600 hover:text-primary-600">
          <ArrowLeft className="h-5 w-5" /> Back to Templates
        </button>
        <Button icon={<Save className="h-4 w-4" />} onClick={save}>Save Template</Button>
      </div>

      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 grid grid-cols-1 items-start gap-6 md:grid-cols-2">
          <Field label="Template Name" required error={errors.name}>
            <Input value={draft.name} invalid={!!errors.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Standard Exterior Repaint" />
          </Field>
          <div>
            <Field label="Estimate Type" required>
              <Select value={draft.estimateTypeId} onChange={(v) => set('estimateTypeId', v)} options={typeOptions} placeholder="Select Type..." invalid={!!errors.estimateTypeId} />
            </Field>
            <FieldError>{errors.estimateTypeId}</FieldError>
          </div>
        </div>
        <Field label="Description">
          <Textarea rows={2} className="min-h-0" value={draft.description} onChange={(e) => set('description', e.target.value)} placeholder="Describe what this template includes..." />
        </Field>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-gray-200/60">
        <div className="space-y-10 p-5 md:p-10">
          {/* Paint Color Card */}
          <Section icon={<Palette />} title="Paint Color Card">
            <div className="overflow-x-auto rounded-2xl border border-gray-200">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xxs font-extrabold uppercase tracking-wider text-gray-500">
                    <th className="w-20 px-4 py-3 text-center">Color #</th>
                    <th className="px-4 py-3">Brand</th>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Sheen</th>
                    <th className="px-4 py-3">Assigned Surfaces</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-4 py-4 text-center">
                      <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-gray-100 font-bold text-gray-700">1</div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">{paint ? lookups.brand(paint.brandId)?.name : '—'}</td>
                    <td className="px-4 py-4">
                      <Select
                        size="sm"
                        value={draft.defaultPaintProductId}
                        onChange={(v) => set('defaultPaintProductId', v)}
                        placeholder="Select default paint..."
                        options={c.paintProducts.filter((p) => p.isActive).map((p) => ({ label: `${lookups.brand(p.brandId)?.name ?? ''} · ${p.name}`, value: p.id }))}
                      />
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">{paint?.finish ?? '—'}</td>
                    <td className="px-4 py-4 text-xs text-gray-500">{paint ? `All surfaces (${areas.reduce((s, a) => s + a.surfaceRateIds.length, 0)})` : 'None'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          {/* Area & Line Items */}
          <Section icon={<Grid3x3 />} title="Area & Line Items">
            <div className="space-y-4">
              {areas.map((a, i) => (
                <div key={a.id} className="overflow-hidden rounded-xl border border-gray-200">
                  <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/60 px-4 py-3">
                    <div>
                      <div className="font-heading text-base font-bold text-gray-900">{a.name}</div>
                      <div className="text-xxs font-bold uppercase tracking-wider text-gray-400">{lookups.estimateType(a.estimateTypeId)?.name ?? 'General'} · Area</div>
                    </div>
                    <RowTools
                      onUp={i > 0 ? () => set('areaTemplateIds', move(draft.areaTemplateIds, i, -1)) : undefined}
                      onDown={i < areas.length - 1 ? () => set('areaTemplateIds', move(draft.areaTemplateIds, i, 1)) : undefined}
                      onRemove={() => { set('areaTemplateIds', draft.areaTemplateIds.filter((x) => x !== a.id)); toast('Area deleted'); }}
                    />
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-xxs font-bold uppercase tracking-wider text-gray-400">
                        <th className="px-4 py-2">Surface</th>
                        <th className="px-4 py-2">Unit</th>
                        <th className="px-4 py-2">Coats</th>
                        <th className="px-4 py-2 text-right">Rate (1st Coat)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {a.surfaceRateIds.map((sid) => {
                        const s = lookups.surfaceRate(sid);
                        if (!s) return null;
                        return (
                          <tr key={sid} className="text-sm">
                            <td className="px-4 py-2 font-semibold text-gray-800">{s.name}</td>
                            <td className="px-4 py-2"><span className="rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-xs font-bold text-gray-600">{UNIT_LABELS[s.unit]}</span></td>
                            <td className="px-4 py-2 text-gray-600">{s.defaultCoats}</td>
                            <td className="px-4 py-2 text-right text-gray-600">{s.rateCoat1} /hr</td>
                          </tr>
                        );
                      })}
                      {a.surfaceRateIds.length === 0 && (
                        <tr><td colSpan={4} className="px-4 py-4 text-center text-xs italic text-gray-400">No default surfaces</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ))}

              {items.map((li, i) => (
                <div key={li.id} className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-heading text-base font-bold text-gray-900">{li.name}</span>
                      <span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xxs font-bold uppercase text-gray-500">{li.itemType === 'PRICED' ? 'Priced' : 'Descriptive'}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{li.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {li.itemType === 'PRICED' && (
                      <span className="text-sm font-bold text-gray-900">{li.calculationType === 'PERCENT' ? `${li.defaultValue ?? 0}%` : money(li.defaultValue ?? 0)}</span>
                    )}
                    <RowTools
                      onUp={i > 0 ? () => set('lineItemTemplateIds', move(draft.lineItemTemplateIds, i, -1)) : undefined}
                      onDown={i < items.length - 1 ? () => set('lineItemTemplateIds', move(draft.lineItemTemplateIds, i, 1)) : undefined}
                      onRemove={() => { set('lineItemTemplateIds', draft.lineItemTemplateIds.filter((x) => x !== li.id)); toast('Line item removed'); }}
                    />
                  </div>
                </div>
              ))}

              <button type="button" onClick={() => setAddOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 py-3 text-sm font-bold text-gray-600 hover:border-primary-300 hover:bg-primary-50/40 hover:text-primary-700">
                Add <Plus className="h-4 w-4" />
              </button>
            </div>
          </Section>

          {/* Notes */}
          <section className="grid grid-cols-1 gap-6 border-b border-gray-100 pb-10 lg:grid-cols-2">
            <div>
              <SectionTitle icon={<FileText />} title="Customer Notes" />
              <Textarea rows={4} value={draft.customerNotes ?? ''} onChange={(e) => set('customerNotes', e.target.value)} placeholder="Notes visible to customer..." />
            </div>
            <div>
              <SectionTitle icon={<FileText />} title="Internal Notes" tone="amber" />
              <Textarea rows={4} value={draft.internalNotes ?? ''} onChange={(e) => set('internalNotes', e.target.value)} placeholder="Private internal notes..." />
            </div>
          </section>

          {/* Paint & Materials */}
          <Section icon={<Package />} title="Paint & Materials">
            <h4 className="mb-2 font-heading text-sm font-bold text-gray-900">Paint Products (Calculated)</h4>
            <div className="mb-6 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-5 text-center text-xs text-gray-500">
              No paint products calculated yet. Assign colors to areas to see requirements here.
            </div>
            <h4 className="mb-2 font-heading text-sm font-bold text-gray-900">Materials &amp; Supplies</h4>
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full min-w-[560px]">
                <thead className="bg-gray-50">
                  <tr className="text-left text-xxs font-bold uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-2.5">Item Name</th>
                    <th className="w-24 px-4 py-2.5 text-center">Qty</th>
                    <th className="w-28 px-4 py-2.5 text-right">Unit Price</th>
                    <th className="w-28 px-4 py-2.5 text-right">Total</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {mats.map((m) => (
                    <tr key={m.materialId} className="text-sm">
                      <td className="px-4 py-2 font-semibold text-gray-800">{m.material!.name} <span className="text-xs font-normal text-gray-400">/ {m.material!.unit}</span></td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          min={0}
                          className="h-8 text-center"
                          value={m.qty}
                          onChange={(e) => set('materials', (draft.materials ?? []).map((x) => (x.materialId === m.materialId ? { ...x, qty: Math.max(0, num(e.target.value)) } : x)))}
                        />
                      </td>
                      <td className="px-4 py-2 text-right text-gray-600">{money(m.material!.unitCost)}</td>
                      <td className="px-4 py-2 text-right font-bold text-gray-900">{money(m.qty * m.material!.unitCost)}</td>
                      <td className="px-2 py-2">
                        <button type="button" aria-label="Remove material" className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" onClick={() => { set('materials', (draft.materials ?? []).filter((x) => x.materialId !== m.materialId)); toast('Material removed'); }}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50/60">
                    <td colSpan={3} className="px-4 py-2.5 text-right text-xxs font-bold uppercase tracking-wider text-gray-700">Total Materials</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold text-gray-900">{money(materialsTotal)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
              <div className="p-3">
                <button type="button" onClick={() => setPickMaterial(true)} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 py-2.5 text-xs font-bold text-gray-600 hover:border-primary-300 hover:text-primary-700">
                  Add Material / Supply <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <div className="flex items-center gap-8 rounded-xl border border-gray-200 px-5 py-4 shadow-sm">
                <div>
                  <div className="text-xxs font-bold uppercase tracking-wider text-gray-600">Paint &amp; Materials Combined</div>
                  <div className="text-xs text-gray-400">Includes waste &amp; container optimization</div>
                </div>
                <div className="font-heading text-2xl font-bold text-gray-900">{money(materialsTotal)}</div>
              </div>
            </div>
          </Section>

          {/* Labor Summary */}
          <Section icon={<Clock />} title="Labor Summary" subtitle="Calculated labor hours for all areas and surfaces">
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full min-w-[560px]">
                <thead className="bg-gray-50">
                  <tr className="text-left text-xxs font-bold uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-2.5">Area</th>
                    <th className="px-4 py-2.5">Item</th>
                    <th className="px-4 py-2.5">Qty</th>
                    <th className="px-4 py-2.5">Coats</th>
                    <th className="px-4 py-2.5">Paint/Color</th>
                    <th className="px-4 py-2.5 text-right">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {areas.flatMap((a) =>
                    a.surfaceRateIds.map((sid) => {
                      const s = lookups.surfaceRate(sid);
                      return s ? (
                        <tr key={`${a.id}-${sid}`} className="text-xs text-gray-700">
                          <td className="px-4 py-2 font-semibold">{a.name}</td>
                          <td className="px-4 py-2">{s.name}</td>
                          <td className="px-4 py-2">0 {UNIT_LABELS[s.unit]}</td>
                          <td className="px-4 py-2">{s.defaultCoats}</td>
                          <td className="px-4 py-2">{paint?.name ?? '—'}</td>
                          <td className="px-4 py-2 text-right">0.00</td>
                        </tr>
                      ) : null;
                    }),
                  )}
                  {areas.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-xs text-gray-400">No labor items calculated yet.</td></tr>
                  )}
                </tbody>
              </table>
              <div className="flex items-center justify-end gap-10 border-t border-gray-100 bg-gray-50 px-6 py-3">
                <span className="text-xxs font-bold uppercase tracking-wider text-gray-700">Total Hours</span>
                <span className="text-sm font-bold text-primary-600">0.00</span>
              </div>
            </div>
          </Section>

          {/* Finalize */}
          <section>
            <SectionTitle icon={<CheckSquare />} title="Finalize Estimate" subtitle="Configure pricing, terms, and final settings" />
            <div className="space-y-5">
              <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-bold text-gray-900">Pricing Calculation Model</span>
                <div className="flex rounded-lg border border-gray-200 bg-white p-1">
                  {([['HOURLY', 'Hourly Rate'], ['OPEX', 'OpEx Rate']] as const).map(([v, l]) => (
                    <button key={v} type="button" onClick={() => set('pricingModel', v)} className={cn('rounded-md px-3 py-1.5 text-xs font-bold', (draft.pricingModel ?? 'HOURLY') === v ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900')}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <Field label="Profit Margin (%)" error={errors.profitMargin}>
                  <Input type="number" min={0} max={100} value={draft.profitMargin} invalid={!!errors.profitMargin} onChange={(e) => set('profitMargin', num(e.target.value))} />
                </Field>
                <div className="flex items-end pb-2.5">
                  <Checkbox checked={draft.isDefault} onChange={(v) => set('isDefault', v)} label="Use as the default template for new estimates" />
                </div>
              </div>
              <Field label="Deposit & Payment Schedule">
                <Textarea rows={3} value={draft.depositSchedule ?? ''} onChange={(e) => set('depositSchedule', e.target.value)} placeholder="Outline payment terms..." />
              </Field>
              <Field label="Terms and Conditions">
                <Select value={draft.termsId} onChange={(v) => set('termsId', v)} options={opt(c.termsConditions)} placeholder="Select an option" />
              </Field>
              <div>
                <Label>File Attachments</Label>
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-4 py-6 text-center hover:border-primary-300">
                  <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white"><Upload className="h-4 w-4 text-primary-600" /></span>
                  <span className="text-sm"><span className="font-semibold text-gray-900">Click to upload</span> <span className="text-gray-500">or drag and drop</span></span>
                  <span className="mt-1 text-xs text-gray-400">PDF, DOCX, JPG, PNG (Max 10MB)</span>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.docx,.jpg,.jpeg,.png"
                    className="sr-only"
                    onChange={(e) => {
                      const picked = Array.from(e.target.files ?? []);
                      const tooBig = picked.filter((f) => f.size > 10 * 1024 * 1024);
                      if (tooBig.length) toast('Files must be 10MB or smaller', 'error');
                      setFiles((f) => [...f, ...picked.filter((x) => x.size <= 10 * 1024 * 1024).map((x) => x.name)]);
                      e.target.value = '';
                    }}
                  />
                </label>
                {files.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {files.map((f, i) => (
                      <li key={`${f}-${i}`} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700">
                        {f}
                        <button type="button" aria-label={`Remove ${f}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <Field label="Access Tier (Difficulty)">
                  <Select value={draft.accessTierId} onChange={(v) => set('accessTierId', v)} options={opt(c.difficultyTiers.filter((t) => t.tierType === 'ACCESS'))} placeholder="Select an option" />
                </Field>
                <Field label="Height Tier (Difficulty)">
                  <Select value={draft.heightTierId} onChange={(v) => set('heightTierId', v)} options={opt(c.difficultyTiers.filter((t) => t.tierType === 'HEIGHT'))} placeholder="Select an option" />
                </Field>
                <Field label="Applicable Tax Rate">
                  <Select value={draft.taxRegionId} onChange={(v) => set('taxRegionId', v)} options={c.taxRegions.map((t) => ({ label: `${t.name} (${t.salesTaxRate}%)`, value: t.id }))} placeholder="Select an option" />
                </Field>
                <Field label="Project Discount">
                  <Select value={draft.projectDiscountId} onChange={(v) => set('projectDiscountId', v)} options={c.projectDiscounts.map((d) => ({ label: `${d.name} (${d.discountType === 'PERCENT' ? `${d.value}%` : money(d.value)})`, value: d.id }))} placeholder="Select an option" />
                </Field>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* "Add" chooser: New Area / Priced Item / Descriptive Item */}
      <Modal open={addOpen} onOpenChange={setAddOpen} title="What would you like to add?" size="lg">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { icon: <LayoutGrid />, title: 'New Area', text: 'Add a room or area from your area templates.', run: () => setPickArea(true) },
            { icon: <List />, title: 'Priced Item', text: 'Add a priced line item (flat price or percent).', run: () => setPickItem('PRICED') },
            { icon: <FileText />, title: 'Descriptive Item', text: 'Add a text-only item for scope details.', run: () => setPickItem('DESCRIPTIVE') },
          ].map((o) => (
            <button key={o.title} type="button" onClick={() => { setAddOpen(false); o.run(); }} className="rounded-xl border border-gray-200 p-4 text-left transition hover:border-primary-300 hover:bg-primary-50/40">
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 text-primary-600 [&>svg]:h-5 [&>svg]:w-5">{o.icon}</span>
              <h4 className="font-heading text-base font-bold text-gray-900">{o.title}</h4>
              <p className="mt-1 text-xs text-gray-500">{o.text}</p>
            </button>
          ))}
        </div>
      </Modal>

      <PickerModal
        open={pickArea}
        onOpenChange={setPickArea}
        title="Select Area Template"
        empty="No more area templates to add. Create one in Settings > Area Templates."
        options={availableAreas.map((a) => ({ id: a.id, title: a.name, sub: `${lookups.estimateType(a.estimateTypeId)?.name ?? 'General'} · ${a.surfaceRateIds.length} surfaces` }))}
        onPick={(aid) => { set('areaTemplateIds', [...draft.areaTemplateIds, aid]); toast('Area added'); }}
      />
      <PickerModal
        open={!!pickItem}
        onOpenChange={(o) => !o && setPickItem(null)}
        title={`Select ${pickItem === 'PRICED' ? 'Priced' : 'Descriptive'} Item`}
        empty="No items left to add."
        options={lineItems.items
          .filter((li) => li.itemType === pickItem && !draft.lineItemTemplateIds.includes(li.id))
          .map((li) => ({ id: li.id, title: li.name, sub: li.itemType === 'PRICED' ? (li.calculationType === 'PERCENT' ? `${li.defaultValue ?? 0}%` : money(li.defaultValue ?? 0)) : li.description }))}
        onPick={(lid) => { set('lineItemTemplateIds', [...draft.lineItemTemplateIds, lid]); toast(`${pickItem === 'PRICED' ? 'Priced' : 'Descriptive'} item added`); }}
        footer={<Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => { const t = pickItem; setPickItem(null); setCreateItem(t); }}>Create New Item</Button>}
      />
      <LineItemModal
        open={!!createItem}
        onOpenChange={(o) => !o && setCreateItem(null)}
        item={null}
        fixedType={createItem ?? undefined}
        markup={0}
        onSave={(data) => {
          const saved = lineItems.add({ ...data, sortOrder: nextSort(lineItems.items) });
          set('lineItemTemplateIds', [...draft.lineItemTemplateIds, saved.id]);
          toast('Line item template created and added');
          setCreateItem(null);
        }}
      />
      <PickerModal
        open={pickMaterial}
        onOpenChange={setPickMaterial}
        title="Select Material to Add"
        empty="All materials are already added. Create more in Settings > Materials & Supplies."
        options={c.materials
          .filter((m) => !(draft.materials ?? []).some((x) => x.materialId === m.id))
          .map((m) => ({ id: m.id, title: m.name, sub: `${m.category} · ${money(m.unitCost)} / ${m.unit}` }))}
        onPick={(mid) => { set('materials', [...(draft.materials ?? []), { materialId: mid, qty: 1 }]); toast('Material added'); }}
      />
    </div>
  );
}

/* ---------- small pieces ---------- */

function SectionTitle({ icon, title, subtitle, tone = 'primary' }: { icon: React.ReactNode; title: string; subtitle?: string; tone?: 'primary' | 'amber' }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full border [&>svg]:h-5 [&>svg]:w-5', tone === 'amber' ? 'border-amber-100 bg-amber-50 text-amber-600' : 'border-primary-100 bg-primary-50 text-primary-600')}>{icon}</div>
      <div>
        <h3 className="font-heading text-xl font-bold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
    </div>
  );
}

function Section({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-gray-100 pb-10">
      <SectionTitle icon={icon} title={title} subtitle={subtitle} />
      {children}
    </section>
  );
}

function RowTools({ onUp, onDown, onRemove }: { onUp?: () => void; onDown?: () => void; onRemove: () => void }) {
  const btn = 'rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent';
  return (
    <div className="flex items-center gap-0.5">
      <button type="button" className={btn} disabled={!onUp} onClick={onUp} aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
      <button type="button" className={btn} disabled={!onDown} onClick={onDown} aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
      <button type="button" className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" onClick={onRemove} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
    </div>
  );
}

/** Searchable list modal used to pick an area, line item or material. */
function PickerModal({
  open, onOpenChange, title, options, onPick, empty, footer,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  options: { id: string; title: string; sub?: string }[];
  onPick: (id: string) => void;
  empty: string;
  footer?: React.ReactNode;
}) {
  const [q, setQ] = useState('');
  useEffect(() => { if (open) setQ(''); }, [open]);
  const shown = useMemo(() => options.filter((o) => o.title.toLowerCase().includes(q.toLowerCase())), [options, q]);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} size="md" footer={footer}>
      <SearchInput value={q} onChange={setQ} placeholder="Search..." className="md:w-full" />
      <div className="mt-3 max-h-80 space-y-1.5 overflow-y-auto">
        {shown.map((o) => (
          <button key={o.id} type="button" onClick={() => { onPick(o.id); onOpenChange(false); }} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-left hover:border-primary-300 hover:bg-primary-50/40">
            <div className="text-sm font-semibold text-gray-900">{o.title}</div>
            {o.sub && <div className="truncate text-xs text-gray-500">{o.sub}</div>}
          </button>
        ))}
        {shown.length === 0 && <p className="py-6 text-center text-sm text-gray-400">{options.length === 0 ? empty : 'No matches.'}</p>}
      </div>
    </Modal>
  );
}
