'use client';

/*
  "Finalize Estimate" section at the bottom of the builder.

  Left: deposit text, Terms & Conditions picker, difficulty tiers (applied
  to every line), tax region, project discount and profit margin.
  Right: the live Summary card (labor, materials, markup, extras, discount,
  tax, Base Bid Total) and the green profit analysis. All numbers come from
  estimateTotals() so they match the list, preview and invoices.
*/
import React, { useState } from 'react';
import { CheckSquare, Eye, EyeOff, TrendingUp } from 'lucide-react';
import type { DifficultyTier, Estimate, ProjectDiscount, TaxRegion, TermsCondition } from '@/lib/types';
import type { EstimateTotals } from '@/lib/calculations';
import { Field, Input, Label, NativeSelect, Textarea } from '@/components/ui/form';
import { money } from '@/lib/utils';

export function FinalizeSection({
  estimate: e, totals: t, readOnly, tiers, discounts, taxRegions, terms, onChange, onApplyTiers, onMargin,
}: {
  estimate: Estimate;
  totals: EstimateTotals;
  readOnly: boolean;
  tiers: DifficultyTier[];
  discounts: ProjectDiscount[];
  taxRegions: TaxRegion[];
  terms: TermsCondition[];
  onChange: (patch: Partial<Estimate>) => void;
  onApplyTiers: (heightTierId?: string, accessTierId?: string) => void;
  onMargin: (margin: number) => void;
}) {
  const [showProfit, setShowProfit] = useState(true);
  const height = tiers.filter((x) => x.tierType === 'HEIGHT').sort((a, b) => a.sortOrder - b.sortOrder);
  const access = tiers.filter((x) => x.tierType === 'ACCESS').sort((a, b) => a.sortOrder - b.sortOrder);
  const linesSum = e.lineItems.reduce((s, l) => s + l.total, 0);
  const extrasSum = e.extras.reduce((s, x) => s + x.quantity * x.unitPrice, 0);
  const markup = linesSum - t.cost;
  const region = taxRegions.find((r) => r.id === e.taxRegionId);
  const selectedTerms = terms.find((x) => x.id === e.termsId);
  const discountKey = e.discountId ?? (e.discountType === 'none' ? '' : 'custom');

  const row = (label: string, value: string, strong = false) => (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className={strong ? 'font-bold text-gray-900' : 'font-bold text-gray-900'}>{value}</span>
    </div>
  );

  return (
    <section id="section-summary" className="grid grid-cols-1 gap-8 pt-10 md:gap-12 lg:grid-cols-3">
      <div className="space-y-8 lg:col-span-2">
        <div className="mb-4 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-primary-100 bg-primary-50">
            <CheckSquare className="h-6 w-6 text-primary-600" />
          </div>
          <div>
            <h3 className="font-heading text-2xl font-bold text-gray-900">Finalize Estimate</h3>
            <p className="mt-1 text-sm text-gray-500">Configure pricing, terms, and final settings</p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <Label>Deposit &amp; Payment Schedule</Label>
            <Textarea
              rows={4}
              disabled={readOnly}
              placeholder="Outline payment terms..."
              value={e.depositTerms ?? ''}
              onChange={(ev) => onChange({ depositTerms: ev.target.value })}
              className="rounded-xl"
            />
          </div>
          <div>
            <Label>Terms and Conditions</Label>
            <NativeSelect disabled={readOnly} value={e.termsId ?? ''} onChange={(ev) => onChange({ termsId: ev.target.value || undefined })}>
              <option value="">No terms</option>
              {terms.map((x) => <option key={x.id} value={x.id}>{x.name}{x.isDefault ? ' (Default)' : ''}</option>)}
            </NativeSelect>
            {selectedTerms && (
              <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs leading-relaxed text-gray-500">
                {selectedTerms.content}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 pt-4 md:grid-cols-2">
          <Field label="Access Tier (Difficulty)" hint="Applies to every line item">
            <NativeSelect
              disabled={readOnly}
              value={e.accessTierId ?? ''}
              onChange={(ev) => onApplyTiers(e.heightTierId, ev.target.value || undefined)}
            >
              <option value="">None</option>
              {access.map((x) => <option key={x.id} value={x.id}>{x.name} (×{x.multiplier})</option>)}
            </NativeSelect>
          </Field>
          <Field label="Height Tier (Difficulty)" hint="Applies to every line item">
            <NativeSelect
              disabled={readOnly}
              value={e.heightTierId ?? ''}
              onChange={(ev) => onApplyTiers(ev.target.value || undefined, e.accessTierId)}
            >
              <option value="">None</option>
              {height.map((x) => <option key={x.id} value={x.id}>{x.name} (×{x.multiplier})</option>)}
            </NativeSelect>
          </Field>
          <Field label="Applicable Tax Rate">
            <NativeSelect
              disabled={readOnly}
              value={e.taxRegionId ?? ''}
              onChange={(ev) => {
                const r = taxRegions.find((x) => x.id === ev.target.value);
                onChange({ taxRegionId: r?.id, taxRate: r?.salesTaxRate ?? 0 });
              }}
            >
              <option value="">No tax (0%)</option>
              {taxRegions.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.salesTaxRate}%)</option>)}
            </NativeSelect>
          </Field>
          <Field label="Project Discount">
            <NativeSelect
              disabled={readOnly}
              value={discountKey}
              onChange={(ev) => {
                const v = ev.target.value;
                if (!v) return onChange({ discountId: undefined, discountType: 'none', discountValue: 0 });
                if (v === 'custom') return onChange({ discountId: undefined, discountType: 'percent', discountValue: e.discountValue || 0 });
                const d = discounts.find((x) => x.id === v)!;
                onChange({ discountId: d.id, discountType: d.discountType === 'PERCENT' ? 'percent' : 'flat', discountValue: d.value });
              }}
            >
              <option value="">No discount</option>
              {discounts.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.discountType === 'PERCENT' ? `${d.value}%` : money(d.value)})</option>
              ))}
              <option value="custom">Custom discount…</option>
            </NativeSelect>
          </Field>
          {discountKey === 'custom' && (
            <div className="grid grid-cols-2 gap-3 md:col-span-2">
              <Field label="Discount Type">
                <NativeSelect disabled={readOnly} value={e.discountType} onChange={(ev) => onChange({ discountType: ev.target.value as 'percent' | 'flat' })}>
                  <option value="percent">Percent (%)</option>
                  <option value="flat">Flat amount ($)</option>
                </NativeSelect>
              </Field>
              <Field label="Discount Value">
                <Input type="number" min={0} disabled={readOnly} value={e.discountValue} onChange={(ev) => onChange({ discountValue: Math.max(0, Number(ev.target.value) || 0) })} />
              </Field>
            </div>
          )}
          <Field label="Profit Margin (%)" hint="Markup added on top of labor and material cost">
            <Input type="number" min={0} max={200} disabled={readOnly} value={e.profitMargin} onChange={(ev) => onMargin(Math.max(0, Number(ev.target.value) || 0))} suffix="%" />
          </Field>
        </div>
      </div>

      {/* Summary card */}
      <div className="lg:col-span-1">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-xl shadow-gray-200/50 md:p-8 lg:sticky lg:top-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-heading text-2xl font-bold text-gray-900">Summary</h3>
            <div className="rounded bg-gray-100 px-2 py-1 text-xs font-bold uppercase tracking-wider text-gray-500">Hourly Model</div>
          </div>
          <p className="mb-6 text-sm leading-relaxed text-gray-500">Review final base bid and calculation logic.</p>

          <div className="mb-6 space-y-3">
            {row(`Labor (${t.laborHours.toFixed(2)}h)`, money(t.laborCost))}
            {row('+ Paint & Materials', money(t.materialCost))}
            {row(`+ Markup (${e.profitMargin}%)`, money(markup))}
            {row('+ Misc Line Items', money(extrasSum))}
            <div className="my-2 border-t border-gray-100" />
            <div className="-mx-2 flex items-center justify-between rounded-lg bg-gray-50 p-2 text-sm">
              <span className="font-bold text-gray-700">Subtotal</span>
              <span className="font-bold text-gray-900">{money(t.subtotal)}</span>
            </div>
          </div>

          <div className="mb-6 rounded-xl border border-green-100 bg-green-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-green-800">
                <TrendingUp className="h-4 w-4" /> Estimated Profit
              </span>
              <button type="button" onClick={() => setShowProfit((v) => !v)} className="rounded-md bg-green-100 p-1 text-green-600 hover:text-green-800" aria-label="Toggle profit">
                {showProfit ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
            </div>
            {showProfit ? (
              <>
                <div className="mb-4 text-3xl font-black tracking-tight text-green-700">{money(t.profit)}</div>
                <div className="space-y-2 border-t border-green-200/50 pt-3 text-xs text-green-900/70">
                  <div className="flex justify-between"><span>Est. Revenue</span><span className="font-medium text-green-900">{money(t.taxable)}</span></div>
                  <div className="flex justify-between"><span>Labor Cost</span><span>-{money(t.laborCost)}</span></div>
                  <div className="flex justify-between"><span>Materials</span><span>-{money(t.materialCost)}</span></div>
                  <div className="mt-2 flex justify-between border-t border-green-200/50 pt-2 font-bold text-green-900"><span>Net Margin</span><span>{t.margin.toFixed(1)}%</span></div>
                </div>
              </>
            ) : (
              <div className="text-sm text-green-700">Hidden</div>
            )}
          </div>

          <div className="mb-6 space-y-3">
            {t.discount > 0 && (
              <div className="flex items-center justify-between text-sm text-red-600">
                <span className="font-medium">Discount Applied</span>
                <span className="font-bold">-{money(t.discount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm text-gray-700">
              <span className="font-medium">Tax{region ? ` (${region.name}, ${e.taxRate}%)` : ''}</span>
              <span className="font-bold text-gray-900">+{money(t.tax)}</span>
            </div>
          </div>
          <div className="my-6 border-t border-dashed border-gray-200" />
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Base Bid Total</span>
            <div className="mt-1 font-heading text-4xl font-black tracking-tight text-gray-900">{money(t.total)}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
