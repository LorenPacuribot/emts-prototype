'use client';

/*
  Settings > General Configuration. One screen for pricing defaults:
  Financial Defaults (saved when a field loses focus), Measurement & Waste,
  Project Discounts and Difficulty Tiers (same panels as their own pages).
  Writes the `generalConfig` singleton and the discount / tier collections.
  NEW (feature 18): the waste fields also drive the feature store's
  wasteSettings (saved through its action, which checks access and logs),
  plus the material-order waste rules and the container packing objective.
*/
import React, { useState } from 'react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Field, Input, Select, Switch } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useSingleton } from '@/lib/store';
import type { GeneralConfig } from '@/lib/types';
import { act, useCurrentUser, useDb } from '@/features/lib/store';
import { can } from '@/features/lib/permissions';
import { updateWasteSettings } from '@/features/lib/store/actions/settings';
import { setPackingStrategy } from '@/features/lib/store/actions/materials';
import { NewBadge } from '@/features/components/ui';
import { DiscountsPanel } from './DiscountsPanel';
import { TiersPanel } from './TiersPanel';
import { SettingsCard } from './ui';

type NumKey = 'baseLaborRate' | 'laborMargin' | 'operatingExpense' | 'defaultWastePercent';
const LIMITS: Record<NumKey, { max?: number; label: string }> = {
  baseLaborRate: { label: 'Base labor rate' },
  laborMargin: { max: 100, label: 'Labor margin' },
  operatingExpense: { max: 100, label: 'Operating expense' },
  defaultWastePercent: { max: 50, label: 'Waste percentage' }, // same limit as updateWasteSettings
};

/** Feature 18: material demand uses the single highest matching rule (features/lib/rules/materials.ts wasteAllowance). */
const WASTE_RULES: [string, string][] = [['Interior repaint', '5%'], ['Exterior, or any spray application', '10%'], ['Rough surface', '15%']];
const PACKING_OPTIONS = [
  { label: 'Least leftover', value: 'least_leftover' },
  { label: 'Lowest price', value: 'lowest_price' },
];

export function GeneralConfigView() {
  const [cfg, setCfg] = useSingleton('generalConfig');
  const { toast } = useToast();
  const featureUser = useCurrentUser();
  const packing = useDb((d) => d.procurementSettings?.packingStrategy) ?? 'least_leftover';
  const canEditWaste = can(featureUser, 'settings.masterData');
  const [draft, setDraft] = useState<Record<NumKey, string>>({
    baseLaborRate: String(cfg.baseLaborRate),
    laborMargin: String(cfg.laborMargin),
    operatingExpense: String(cfg.operatingExpense),
    defaultWastePercent: String(cfg.defaultWastePercent),
  });
  const [errors, setErrors] = useState<Partial<Record<NumKey, string>>>({});

  /** Validate and save one field (on blur, like the live app). */
  const commit = (k: NumKey) => {
    const raw = draft[k].trim();
    const n = parseFloat(raw);
    const lim = LIMITS[k];
    let err = '';
    if (raw === '' || !Number.isFinite(n)) err = `${lim.label} is required`;
    else if (n < 0) err = `${lim.label} must be positive`;
    else if (lim.max !== undefined && n > lim.max) err = `${lim.label} cannot exceed ${lim.max}%`;
    if (!err && k === 'defaultWastePercent' && n !== cfg[k]) {
      // Same value drives the feature store's waste settings (access check + activity log).
      const r = act(updateWasteSettings, { defaultWastePercent: n });
      if (!r.ok) err = r.error;
    }
    setErrors((e) => ({ ...e, [k]: err }));
    if (err || n === cfg[k]) return;
    setCfg({ [k]: n } as Partial<GeneralConfig>);
    toast(k === 'defaultWastePercent' ? 'Waste settings updated successfully' : 'Financial defaults updated successfully');
  };

  const numField = (k: NumKey, label: string, hint?: string) => (
    <Field label={label} hint={hint} error={errors[k]}>
      <Input
        type="number"
        step="any"
        value={draft[k]}
        invalid={!!errors[k]}
        disabled={k === 'defaultWastePercent' && !canEditWaste}
        onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
        onBlur={() => commit(k)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        onClear={() => setDraft((d) => ({ ...d, [k]: '' }))}
      />
    </Field>
  );

  return (
    <SettingsPage title="General Configuration" subtitle="Manage financial defaults, multiplier tiers, and material calculation rules.">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <SettingsCard>
            <h3 className="mb-4 border-b border-gray-100 pb-3 font-heading text-lg font-bold text-gray-900">Financial Defaults</h3>
            <div className="space-y-4">
              {numField('baseLaborRate', 'Base Labor Rate ($/hr)', 'Applied when no specific rate override exists.')}
              {numField('laborMargin', 'Labor Margin (%)', 'Applied when "Labor Rate" pricing is selected.')}
              {numField('operatingExpense', 'Operating Expense (%)', 'A general operating expense, which is a percentage.')}
            </div>
          </SettingsCard>
          <SettingsCard>
            <h3 className="mb-4 border-b border-gray-100 pb-3 font-heading text-lg font-bold text-gray-900">Measurement &amp; Waste</h3>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-900">Calculate Waste</span>
              <Switch
                checked={cfg.calculateWaste}
                disabled={!canEditWaste}
                onChange={(v) => {
                  if (!act(updateWasteSettings, { calculateWaste: v }).ok) return;
                  setCfg({ calculateWaste: v });
                  toast('Waste settings updated successfully');
                }}
                label="Calculate waste"
              />
            </div>
            {cfg.calculateWaste && <div className="mt-4">{numField('defaultWastePercent', 'Waste Percentage', 'Extra paint added to each estimate to cover waste.')}</div>}

            <div className="mt-5 rounded-xl border border-green-200 bg-green-50/40 p-4">
              <div className="mb-1.5 flex items-center gap-2 text-sm font-bold text-gray-900">Waste rules for material orders <NewBadge feature={18} /></div>
              <p className="mb-3 text-xs text-gray-500">Material demand on the work order uses the single highest rule that matches a specification. Allowances are never added together.</p>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-green-100">
                  {WASTE_RULES.map(([rule, pct]) => (
                    <tr key={rule}>
                      <td className="py-1.5 text-gray-700">{rule}</td>
                      <td className="py-1.5 text-right font-bold text-gray-900">{pct}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 rounded-xl border border-green-200 bg-green-50/40 p-4">
              <div className="mb-1.5 flex items-center gap-2 text-sm font-bold text-gray-900">Container packing objective <NewBadge feature={18} /></div>
              <p className="mb-3 text-xs text-gray-500">How gallons are packed into quarts, gallons and 5-gallon pails on a paint order.</p>
              <div className="w-full max-w-60">
                <Select
                  value={packing}
                  disabled={!can(featureUser, 'catalog.edit')}
                  options={PACKING_OPTIONS}
                  onChange={(v) => act(setPackingStrategy, v as 'least_leftover' | 'lowest_price').ok && toast('Packing objective changed')}
                />
              </div>
            </div>
          </SettingsCard>
        </div>

        <DiscountsPanel />

        <SettingsCard>
          <h3 className="mb-5 border-b border-gray-100 pb-4 font-heading text-lg font-bold text-gray-900">Difficulty Tiers</h3>
          <TiersPanel />
        </SettingsCard>
      </div>
    </SettingsPage>
  );
}
