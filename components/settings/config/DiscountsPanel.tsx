'use client';

/*
  Project discounts list + Add/Edit modal. Used on General Configuration and
  on the Project Discounts page. Records live in the `projectDiscounts`
  collection; percent discounts are stored as whole numbers (10 = 10%), while
  the form takes a decimal like the live app ("0.10 = 10%").
*/
import React, { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { RowMenu } from '@/components/ui/menu';
import { ConfirmDialog, Modal } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { useCollection } from '@/lib/store';
import { money } from '@/lib/utils';
import type { ProjectDiscount } from '@/lib/types';
import { SegmentedToggle } from './ui';

export const discountLabel = (d: ProjectDiscount) => (d.discountType === 'PERCENT' ? `${+d.value.toFixed(2)}% Off` : `${money(d.value)} Flat`);

export function DiscountsPanel({ title = 'Project Discounts' }: { title?: string }) {
  const { items, remove } = useCollection('projectDiscounts');
  const { toast } = useToast();
  const [editing, setEditing] = useState<ProjectDiscount | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<ProjectDiscount | null>(null);
  const list = [...items].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <section className="rounded-2xl bg-white p-6 shadow-lg shadow-gray-200/60 md:p-7">
      <div className="mb-5 flex items-center justify-between border-b border-gray-100 pb-4">
        <h3 className="font-heading text-lg font-bold text-gray-900">{title}</h3>
        <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Add Discount</Button>
      </div>
      {list.length === 0 ? (
        <p className="py-8 text-center text-sm italic text-gray-400">No discounts configured.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div>
                <div className="text-sm font-bold text-gray-900">{d.name}</div>
                <div className="text-[11px] text-gray-500">{discountLabel(d)}</div>
              </div>
              <RowMenu
                items={[
                  { label: 'Edit', icon: <Pencil />, onClick: () => setEditing(d) },
                  { label: 'Delete', icon: <Trash2 />, danger: true, onClick: () => setToDelete(d) },
                ]}
              />
            </div>
          ))}
        </div>
      )}

      {editing && <DiscountFormModal discount={editing === 'new' ? undefined : editing} nextSort={list.length + 1} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="Delete Discount"
        message={toDelete ? `Are you sure you want to delete "${toDelete.name}"?` : ''}
        onConfirm={() => {
          if (!toDelete) return;
          remove(toDelete.id);
          toast('Discount deleted successfully');
        }}
      />
    </section>
  );
}

function DiscountFormModal({ discount, nextSort, onClose }: { discount?: ProjectDiscount; nextSort: number; onClose: () => void }) {
  const { items, add, update } = useCollection('projectDiscounts');
  const { toast } = useToast();
  const [name, setName] = useState(discount?.name ?? '');
  const [type, setType] = useState<ProjectDiscount['discountType']>(discount?.discountType ?? 'PERCENT');
  const [value, setValue] = useState(discount ? String(discount.discountType === 'PERCENT' ? +(discount.value / 100).toFixed(4) : discount.value) : '0');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = () => {
    const e: Record<string, string> = {};
    const n = parseFloat(value);
    if (!name.trim()) e.name = 'Discount name is required';
    else if (items.some((d) => d.name.toLowerCase() === name.trim().toLowerCase() && d.id !== discount?.id)) e.name = 'A discount with this name already exists';
    if (!Number.isFinite(n) || n <= 0) e.value = 'Value must be greater than 0';
    else if (type === 'PERCENT' && n > 1) e.value = 'Enter as decimal: 1 = 100% is the maximum';
    setErrors(e);
    if (Object.keys(e).length) return;
    const stored = type === 'PERCENT' ? +(n * 100).toFixed(2) : n;
    if (discount) update(discount.id, { name: name.trim(), discountType: type, value: stored });
    else add({ name: name.trim(), discountType: type, value: stored, sortOrder: nextSort });
    toast(`Discount ${discount ? 'updated' : 'created'} successfully`);
    onClose();
  };

  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={discount ? 'Edit Discount' : 'Add New Discount'} size="sm">
      <div className="space-y-5">
        <Field label="Name" required error={errors.name}>
          <Input value={name} placeholder="e.g., Senior Discount, Winter Special" invalid={!!errors.name} onChange={(e) => { setName(e.target.value); setErrors({ ...errors, name: '' }); }} />
        </Field>
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-600">Type</div>
          <SegmentedToggle value={type} onChange={setType} options={[{ value: 'PERCENT', label: 'Percentage' }, { value: 'FLAT_PRICE', label: 'Flat Amount' }]} />
        </div>
        <Field
          label={type === 'PERCENT' ? 'Value (0.10 = 10%)' : 'Value ($)'}
          required
          error={errors.value}
          hint={type === 'PERCENT' ? 'Enter as decimal (0.05 = 5%, 0.10 = 10%)' : 'Fixed dollar amount taken off the project total'}
        >
          <Input type="number" step="0.01" min="0" value={value} invalid={!!errors.value} onChange={(e) => { setValue(e.target.value); setErrors({ ...errors, value: '' }); }} onClear={() => setValue('')} />
        </Field>
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={save}>Save Discount</Button>
        </div>
      </div>
    </Modal>
  );
}
