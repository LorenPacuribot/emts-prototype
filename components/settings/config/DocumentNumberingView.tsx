'use client';

/*
  Settings > Document Numbering. One card per document type (Lead, Estimate,
  Job, Work Order, Invoice): pick a format, see a live preview of the next
  number (formatDocNumber from lib/store, the same function that creates
  numbers), and set a starting number once (for moving from an offline system).
  Writes the `documentNumbering` collection.
*/
import React, { useState } from 'react';
import { Hash, Lock } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { formatDocNumber, useCollection } from '@/lib/store';
import type { DocumentNumbering } from '@/lib/types';

const ORDER: DocumentNumbering['entityType'][] = ['LEAD', 'ESTIMATE', 'JOB', 'WORK_ORDER', 'INVOICE'];
const LABELS: Record<DocumentNumbering['entityType'], { title: string; noun: string }> = {
  LEAD: { title: 'Lead (LEAD)', noun: 'lead' },
  ESTIMATE: { title: 'Estimate (EST)', noun: 'estimate' },
  JOB: { title: 'Job (JOB)', noun: 'job' },
  WORK_ORDER: { title: 'Work Order (WO)', noun: 'work order' },
  INVOICE: { title: 'Invoice (INV)', noun: 'invoice' },
};
const formatOptions = (prefix: string) => [
  { value: 'PREFIX_YEAR_MONTH_SERIAL', label: `${prefix}-{YYYY}{MM}-1` },
  { value: 'PREFIX_YEAR_SERIAL', label: `${prefix}-{YYYY}-1` },
  { value: 'PREFIX_SERIAL', label: `${prefix}-1` },
  { value: 'CUSTOM_SERIAL', label: '{CUSTOM_PREFIX}-1' },
];

export function DocumentNumberingView() {
  const { items } = useCollection('documentNumbering');
  const list = ORDER.map((t) => items.find((i) => i.entityType === t)).filter((x): x is DocumentNumbering => !!x);
  return (
    <SettingsPage wide title="Document Numbering" subtitle="Configure auto-numbering formats for leads, estimates, jobs, work orders, and invoices.">
      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-500">No numbering configurations found.</p>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {list.map((cfg) => <NumberingCard key={cfg.id} cfg={cfg} />)}
        </div>
      )}
    </SettingsPage>
  );
}

function NumberingCard({ cfg }: { cfg: DocumentNumbering }) {
  const { update } = useCollection('documentNumbering');
  const { toast } = useToast();
  const [formatType, setFormatType] = useState(cfg.formatType);
  const [customPrefix, setCustomPrefix] = useState(cfg.customPrefix ?? '');
  const [prefixError, setPrefixError] = useState('');
  const [start, setStart] = useState('');
  const [startError, setStartError] = useState('');
  const [confirm, setConfirm] = useState<number | null>(null);
  const label = LABELS[cfg.entityType];

  const dirty = formatType !== cfg.formatType || (formatType === 'CUSTOM_SERIAL' && customPrefix !== (cfg.customPrefix ?? ''));
  const preview = formatDocNumber({ ...cfg, formatType, customPrefix: customPrefix || '???' });

  const save = () => {
    if (formatType === 'CUSTOM_SERIAL' && !/^[A-Z0-9]{1,10}$/.test(customPrefix)) {
      setPrefixError('Custom prefix is required (uppercase alphanumeric, 1-10 characters)');
      return;
    }
    update(cfg.id, { formatType, customPrefix: formatType === 'CUSTOM_SERIAL' ? customPrefix : cfg.customPrefix });
    toast(`${label.title} numbering updated successfully`);
  };

  const askSet = () => {
    const n = Number(start);
    if (!start || !Number.isInteger(n)) return setStartError('Must be a whole number');
    if (n < 1) return setStartError('Starting number must be at least 1');
    if (n < cfg.nextSerial - 1) return setStartError(`Must be at least ${cfg.nextSerial - 1} (numbers already used)`);
    setStartError('');
    setConfirm(n);
  };

  return (
    <div className="flex flex-col rounded-2xl bg-white p-6 shadow-lg">
      <h3 className="font-heading text-xl font-bold text-gray-900">{label.title}</h3>
      <p className="mt-1 text-xs text-gray-500">Configure numbering format for {label.noun} documents.</p>
      <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
        <Field label="Format Type" required>
          <Select value={formatType} onChange={(v) => setFormatType(v as DocumentNumbering['formatType'])} options={formatOptions(cfg.prefix)} placeholder="Select format..." />
        </Field>
        {formatType === 'CUSTOM_SERIAL' && (
          <Field label="Custom Prefix" required error={prefixError}>
            <Input value={customPrefix} maxLength={10} placeholder="e.g. ACME" invalid={!!prefixError} onChange={(e) => { setCustomPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setPrefixError(''); }} />
          </Field>
        )}
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3" title="Changes will apply to newly created documents. Existing document numbers will not be affected.">
          <p className="mb-1 text-xxs font-bold uppercase tracking-wider text-gray-500">Preview</p>
          <p className="font-mono text-base font-bold text-primary-600">{preview}</p>
        </div>
      </div>
      <div className="mt-4 border-t border-gray-100 pt-4">
        {cfg.startingSet ? (
          <div className="flex items-start gap-2">
            <Lock className="mt-0.5 h-3.5 w-3.5 text-gray-500" />
            <div>
              <p className="text-xxs font-bold uppercase tracking-wider text-gray-500">Starting Number Set</p>
              <p className="text-xs text-gray-500">Next document will be #{cfg.nextSerial}. This was a one-time setting.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-1 flex items-center gap-2 text-xxs font-bold uppercase tracking-wider text-gray-500"><Hash className="h-3.5 w-3.5" /> Set Starting Number</div>
            <p className="mb-2 text-xs text-gray-500">One-time only. Useful for migrating from offline systems.</p>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input type="number" min="1" step="1" value={start} placeholder="e.g. 100" invalid={!!startError} onChange={(e) => { setStart(e.target.value); setStartError(''); }} />
              </div>
              <Button variant="secondary" disabled={!start} onClick={askSet}>Set</Button>
            </div>
            {startError && <p className="mt-1 text-xs text-red-600">{startError}</p>}
          </>
        )}
      </div>
      <div className="mt-auto pt-5">
        <Button className="w-full" disabled={!dirty} onClick={save}>Save Changes</Button>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(v) => !v && setConfirm(null)}
        variant="primary"
        title="Set Starting Number"
        confirmLabel="Set Number"
        message={`This can only be done once. The next ${label.noun} will be numbered ${confirm !== null ? confirm + 1 : ''}.`}
        onConfirm={() => {
          if (confirm === null) return;
          update(cfg.id, { nextSerial: confirm + 1, startingSet: true });
          setStart('');
          toast(`Starting number set for ${label.title}. Next document will be ${confirm + 1}.`);
        }}
      />
    </div>
  );
}
