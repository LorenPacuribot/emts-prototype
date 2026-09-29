'use client';

/*
  Difficulty tiers: two lists (Height Tiers, Access Tiers) with "Add +",
  and an Add/Edit modal. Used on General Configuration and the Difficulty
  Tiers page. Records live in the `difficultyTiers` collection; the estimate
  builder multiplies labor by the selected tiers.
*/
import React, { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { RowMenu } from '@/components/ui/menu';
import { ConfirmDialog, Modal } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { useCollection } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { DifficultyTier } from '@/lib/types';
import { SegmentedToggle } from './ui';

export function TiersPanel() {
  const { items, remove } = useCollection('difficultyTiers');
  const { toast } = useToast();
  const [editing, setEditing] = useState<{ tier?: DifficultyTier; type: DifficultyTier['tierType'] } | null>(null);
  const [toDelete, setToDelete] = useState<DifficultyTier | null>(null);

  const column = (type: DifficultyTier['tierType'], title: string) => {
    const list = items.filter((t) => t.tierType === type).sort((a, b) => a.sortOrder - b.sortOrder);
    return (
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h4 className="font-heading text-base font-bold text-gray-900">{title}</h4>
          <button type="button" onClick={() => setEditing({ type })} className="flex items-center gap-0.5 text-xs font-bold text-primary-600 hover:underline">
            Add <Plus className="h-3 w-3" />
          </button>
        </div>
        {list.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 py-6 text-center text-xs text-gray-500">No {title.toLowerCase()} yet.</p>
        ) : (
          <div className="space-y-2.5">
            {list.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{t.name}</span>
                  <span className={cn('rounded-full border px-1.5 py-0.5 text-xs font-bold', type === 'HEIGHT' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-amber-200 bg-amber-50 text-amber-700')}>
                    x{+t.multiplier.toFixed(3)}
                  </span>
                </div>
                <RowMenu
                  items={[
                    { label: 'Edit', icon: <Pencil />, onClick: () => setEditing({ tier: t, type }) },
                    { label: 'Delete', icon: <Trash2 />, danger: true, onClick: () => setToDelete(t) },
                  ]}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-7 md:grid-cols-2">
        {column('HEIGHT', 'Height Tiers')}
        {column('ACCESS', 'Access Tiers')}
      </div>
      {editing && <TierFormModal tier={editing.tier} defaultType={editing.type} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="Delete Tier"
        message={toDelete ? `Are you sure you want to delete "${toDelete.name}"?` : ''}
        onConfirm={() => {
          if (!toDelete) return;
          remove(toDelete.id);
          toast('Difficulty tier deleted successfully');
        }}
      />
    </>
  );
}

function TierFormModal({ tier, defaultType, onClose }: { tier?: DifficultyTier; defaultType: DifficultyTier['tierType']; onClose: () => void }) {
  const { items, add, update } = useCollection('difficultyTiers');
  const { toast } = useToast();
  const [name, setName] = useState(tier?.name ?? '');
  const [type, setType] = useState<DifficultyTier['tierType']>(tier?.tierType ?? defaultType);
  const [mult, setMult] = useState(tier ? String(tier.multiplier) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = () => {
    const e: Record<string, string> = {};
    const m = parseFloat(mult);
    if (!name.trim()) e.name = 'Tier name is required';
    if (!Number.isFinite(m) || m < 0.1) e.multiplier = 'Multiplier must be at least 0.1';
    else if (m > 10) e.multiplier = 'Multiplier cannot exceed 10';
    setErrors(e);
    if (Object.keys(e).length) return;
    if (tier) update(tier.id, { name: name.trim(), tierType: type, multiplier: m });
    else add({ name: name.trim(), tierType: type, multiplier: m, sortOrder: items.filter((t) => t.tierType === type).length + 1 });
    toast(`Difficulty tier ${tier ? 'updated' : 'created'} successfully`);
    onClose();
  };

  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={tier ? 'Edit Difficulty Tier' : 'Add Difficulty Tier'} size="sm">
      <div className="space-y-5">
        <Field label="Name" required error={errors.name}>
          <Input value={name} placeholder="e.g. Standard (8-9ft)" invalid={!!errors.name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div>
          <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-gray-600">Tier Type</div>
          <SegmentedToggle value={type} onChange={setType} options={[{ value: 'HEIGHT', label: 'Height' }, { value: 'ACCESS', label: 'Access' }]} />
        </div>
        <Field label="Multiplier" required error={errors.multiplier} hint="1 = no change, 1.2 = 20% more labor">
          <Input type="number" step="0.05" min="0.1" max="10" value={mult} placeholder="e.g. 1.2" invalid={!!errors.multiplier} onChange={(e) => setMult(e.target.value)} />
        </Field>
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={save}>{tier ? 'Save Changes' : 'Add Tier'}</Button>
        </div>
      </div>
    </Modal>
  );
}
