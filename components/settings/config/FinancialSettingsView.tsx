'use client';

/*
  Settings > Financial Settings. Profit markup for miscellaneous line items
  and the deposit percentage required before a job can proceed.
  "Save Changes" is enabled only when something changed. Writes the
  `financialSettings` singleton (invoices read depositPercent).
  NEW (feature 33): the same deposit percentage creates the deposit invoice
  when an estimate is accepted. Saving goes through the feature store's
  updateFinancialSettings first (access check + activity log), so one
  control drives both stores.
*/
import React, { useState } from 'react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { Field, Input, Switch } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useSingleton } from '@/lib/store';
import { act, useCurrentUser } from '@/features/lib/store';
import { can } from '@/features/lib/permissions';
import { updateFinancialSettings } from '@/features/lib/store/actions/settings';
import { NewBadge } from '@/features/components/ui';
import { NoteBox, SettingsCard } from './ui';

export function FinancialSettingsView() {
  const [fin, setFin] = useSingleton('financialSettings');
  const { toast } = useToast();
  const canEdit = can(useCurrentUser(), 'settings.masterData');
  const initial = { apply: fin.applyProfitToMiscLineItems, margin: String(fin.miscLineItemProfitMargin), deposit: String(fin.depositPercent) };
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  const save = () => {
    const e: Record<string, string> = {};
    const margin = form.margin === '' ? 0 : parseFloat(form.margin);
    const deposit = form.deposit === '' ? 0 : parseFloat(form.deposit);
    if (form.apply && (!Number.isFinite(margin) || margin < 0 || margin > 100)) e.margin = 'Margin must be between 0 and 100';
    if (!Number.isFinite(deposit) || deposit < 0 || deposit > 100) e.deposit = 'Deposit must be between 0 and 100';
    setErrors(e);
    if (Object.keys(e).length) return;
    const r = act(updateFinancialSettings, { applyProfitToMiscLineItems: form.apply, miscLineItemProfitMargin: margin, depositPercent: deposit });
    if (!r.ok) {
      if (r.field === 'depositPercent') setErrors({ deposit: r.error });
      else if (r.field === 'miscLineItemProfitMargin') setErrors({ margin: r.error });
      return;
    }
    setFin({ applyProfitToMiscLineItems: form.apply, miscLineItemProfitMargin: margin, depositPercent: deposit });
    const next = { apply: form.apply, margin: String(margin), deposit: String(deposit) };
    setForm(next);
    setSaved(next);
    toast('Financial settings saved successfully');
  };

  return (
    <SettingsPage title="Financial Settings" subtitle="Configure payment methods, deposits, and terms." actions={<Button onClick={save} disabled={!dirty || !canEdit}>Save Changes</Button>}>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <SettingsCard title="Profit Markup" subtitle="Apply a profit margin to miscellaneous line items in estimates.">
          <div className="space-y-4 border-t border-gray-100 pt-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-900">Apply Profit to Misc Line Items</span>
              <Switch checked={form.apply} onChange={(v) => setForm({ ...form, apply: v })} label="Apply profit to misc line items" />
            </div>
            <Field label="Misc Line Item Profit Margin (%)" hint="Percentage markup applied to miscellaneous line items." error={errors.margin}>
              <Input type="number" min="0" max="100" step="any" value={form.margin} placeholder="0" disabled={!form.apply} invalid={!!errors.margin} suffix="%" onChange={(e) => setForm({ ...form, margin: e.target.value })} />
            </Field>
            <NoteBox>When enabled, all miscellaneous line items will have this margin applied to their unit price.</NoteBox>
          </div>
        </SettingsCard>
        <SettingsCard title="Deposit Requirements" subtitle="Set the deposit percentage required before a job can proceed.">
          <div className="space-y-4 border-t border-gray-100 pt-5">
            <Field label="Deposit Percentage (%)" hint="Percentage of estimate total required as deposit before job creation." error={errors.deposit}>
              <Input type="number" min="0" max="100" step="any" value={form.deposit} placeholder="0" invalid={!!errors.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} onClear={() => setForm({ ...form, deposit: '' })} />
            </Field>
            <NoteBox>Set to 0 to disable deposit requirement. Work orders will skip the pending deposit status.</NoteBox>
            <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50/40 px-3 py-2 text-xs text-gray-600">
              <NewBadge feature={33} className="mt-px" />
              <span>Accepting an estimate creates its deposit invoice as a draft at this percentage of the estimate total. A re-signed amendment updates that draft.</span>
            </div>
          </div>
        </SettingsCard>
      </div>
    </SettingsPage>
  );
}
