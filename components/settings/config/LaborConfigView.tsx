'use client';

/*
  Settings > Labor Config. Base wage plus payroll taxes and benefits, with live
  burden math on the right (total burden %, true cost per hour).
  Custom burdens can be added and removed. "Save Changes" is enabled only
  when the form differs from what is saved. Writes the `laborConfig` singleton.
*/
import React, { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { ConfirmDialog, Modal } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { useSingleton } from '@/lib/store';
import { uid } from '@/lib/utils';
import type { LaborBurden, LaborConfig } from '@/lib/types';
import { SettingsCard } from './ui';
import { TrueCostCard } from './GoalsProfitView';

type TaxKey = 'socialSecurity' | 'medicareFuta' | 'stateUnemp' | 'workmansComp' | 'otherLiability' | 'benefits';
const TAXES: { key: TaxKey; label: string }[] = [
  { key: 'socialSecurity', label: 'Social Security' },
  { key: 'medicareFuta', label: 'Medicare/FUTA' },
  { key: 'stateUnemp', label: 'State Unemp.' },
  { key: 'workmansComp', label: "Workman's Comp" },
  { key: 'otherLiability', label: 'Other/Liability' },
  { key: 'benefits', label: 'Benefits' },
];

type Form = Record<'baseHourlyRate' | TaxKey, string> & { customBurdens: LaborBurden[] };
const toForm = (c: LaborConfig): Form => ({
  baseHourlyRate: String(c.baseHourlyRate),
  ...(Object.fromEntries(TAXES.map((t) => [t.key, String(c[t.key])])) as Record<TaxKey, string>),
  customBurdens: c.customBurdens,
});
const num = (v: string) => (v === '' ? 0 : Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);

export function LaborConfigView() {
  const [cfg, setCfg] = useSingleton('laborConfig');
  const { toast } = useToast();
  const [form, setForm] = useState<Form>(() => toForm(cfg));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [toDelete, setToDelete] = useState<LaborBurden | null>(null);

  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(cfg));
  const base = num(form.baseHourlyRate);
  const burdenPercent = useMemo(
    () => TAXES.reduce((s, t) => s + num(form[t.key]), 0) + form.customBurdens.reduce((s, b) => s + b.percentage, 0),
    [form],
  );
  const trueCost = base * (1 + burdenPercent / 100);

  const set = (k: 'baseHourlyRate' | TaxKey, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const save = () => {
    const e: Record<string, string> = {};
    if (base < 0 || form.baseHourlyRate === '') e.baseHourlyRate = 'Base hourly rate must be positive';
    TAXES.forEach((t) => {
      const n = num(form[t.key]);
      if (n < 0) e[t.key] = `${t.label} must be positive`;
      else if (n > 100) e[t.key] = 'Cannot exceed 100%';
    });
    setErrors(e);
    if (Object.keys(e).length) return;
    setCfg({
      baseHourlyRate: base,
      ...(Object.fromEntries(TAXES.map((t) => [t.key, num(form[t.key])])) as Record<TaxKey, number>),
      customBurdens: form.customBurdens,
    });
    toast('Labor configuration saved successfully');
  };

  const persistBurdens = (list: LaborBurden[]) => {
    setForm((f) => ({ ...f, customBurdens: list }));
    setCfg({ customBurdens: list }); // custom burdens save right away, like the live app
  };

  return (
    <SettingsPage title="Labor Configuration" subtitle="Manage hourly rates and payroll burden breakdown." actions={<Button onClick={save} disabled={!dirty}>Save Changes</Button>}>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <SettingsCard title="Base Wages">
            <Field label="Average Base Hourly Pay ($)" hint="The average hourly wage paid to employees before taxes/benefits." error={errors.baseHourlyRate}>
              <Input type="number" step="0.01" min="0" value={form.baseHourlyRate} invalid={!!errors.baseHourlyRate} onChange={(e) => set('baseHourlyRate', e.target.value)} onClear={() => set('baseHourlyRate', '')} />
            </Field>
          </SettingsCard>
          <SettingsCard title="Taxes & Benefits (%)" actions={<Button size="sm" variant="secondary" icon={<Plus className="h-3 w-3" />} onClick={() => setAddOpen(true)}>Add Custom</Button>}>
            <div className="grid grid-cols-2 gap-x-5 gap-y-4">
              {TAXES.map((t) => (
                <Field key={t.key} label={t.label} error={errors[t.key]}>
                  <Input type="number" step="any" min="0" max="100" value={form[t.key]} invalid={!!errors[t.key]} onChange={(e) => set(t.key, e.target.value)} onClear={() => set(t.key, '')} />
                </Field>
              ))}
            </div>
            {form.customBurdens.length > 0 && (
              <div className="mt-6 space-y-3 border-t border-gray-200 pt-4">
                {[...form.customBurdens].map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-2">
                    <span className="pl-2 text-sm font-bold text-gray-700">{b.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-gray-900">{b.percentage.toFixed(2)}%</span>
                      <button type="button" onClick={() => setToDelete(b)} className="p-1 text-gray-500 hover:text-red-500" aria-label={`Delete ${b.name}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SettingsCard>
        </div>

        <div className="flex flex-col items-center space-y-6 lg:pt-2">
          <div className="text-center">
            <div className="mb-1 text-xs font-bold uppercase tracking-widest text-gray-500">Total Burden Rate</div>
            <div className="text-3xl font-black text-gray-900">{burdenPercent.toFixed(2)}%</div>
          </div>
          <TrueCostCard base={base} burdenPercent={burdenPercent} total={trueCost} label="True Cost Per Hour" />
          <p className="max-w-[16rem] text-center text-xs leading-relaxed text-gray-500">This is what it costs your business every hour an employee is on the clock.</p>
        </div>
      </div>

      <AddBurdenModal
        open={addOpen}
        onOpenChange={setAddOpen}
        existing={form.customBurdens}
        onAdd={(b) => {
          persistBurdens([...form.customBurdens, b]);
          toast('Custom burden added successfully');
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="Delete Burden"
        message={toDelete ? `Are you sure you want to delete "${toDelete.name}"?` : ''}
        onConfirm={() => {
          if (!toDelete) return;
          persistBurdens(form.customBurdens.filter((b) => b.id !== toDelete.id));
          toast('Custom burden deleted successfully');
        }}
      />
    </SettingsPage>
  );
}

function AddBurdenModal({ open, onOpenChange, existing, onAdd }: { open: boolean; onOpenChange: (v: boolean) => void; existing: LaborBurden[]; onAdd: (b: LaborBurden) => void }) {
  const [name, setName] = useState('');
  const [pct, setPct] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const close = (v: boolean) => {
    if (!v) {
      setName('');
      setPct('');
      setErrors({});
    }
    onOpenChange(v);
  };
  const submit = () => {
    const e: Record<string, string> = {};
    const p = parseFloat(pct);
    if (!name.trim()) e.name = 'Item name is required';
    else if (existing.some((b) => b.name.toLowerCase() === name.trim().toLowerCase())) e.name = 'An item with this name already exists';
    if (!Number.isFinite(p) || p < 0) e.percentage = 'Percentage must be positive';
    else if (p > 100) e.percentage = 'Cannot exceed 100%';
    setErrors(e);
    if (Object.keys(e).length) return;
    onAdd({ id: uid('lb'), name: name.trim(), percentage: p });
    close(false);
  };
  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="Add Custom Burden"
      size="sm"
      footer={<><Button variant="secondary" onClick={() => close(false)}>Cancel</Button><Button onClick={submit}>Add Item</Button></>}
    >
      <div className="space-y-4">
        <Field label="Item Name" required error={errors.name}>
          <Input value={name} placeholder="e.g. Union Dues" invalid={!!errors.name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Percentage (%)" error={errors.percentage}>
          <Input type="number" step="any" min="0" max="100" value={pct} placeholder="0" invalid={!!errors.percentage} onChange={(e) => setPct(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
