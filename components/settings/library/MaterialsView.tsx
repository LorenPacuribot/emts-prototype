'use client';

/*
  Settings > Materials & Supplies.
  Consumables (tape, caulk, brushes...) with a category, unit and unit
  cost. Favorites are added to new estimates by default. Estimate
  templates can add these to their Materials & Supplies table.
*/
import { useEffect, useMemo, useState } from 'react';
import { DollarSign, Package, Plus, Star } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { Field, Input, Label, Select, Switch } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog, Modal } from '@/components/Modals/Modal';
import { useCollection } from '@/lib/store';
import type { Material } from '@/lib/types';
import { cn, money } from '@/lib/utils';
import { CardKebab, FieldError, FormActions, LibraryCard, LibraryGrid, LibraryToolbar, NoMatches, Pill, SectionHeading, nextSort, num, useLibraryCrud } from './ui';

const SORTS = [
  { label: 'Sort by Name (A-Z)', value: 'name' },
  { label: 'Favorites', value: 'favorites' },
  { label: 'Recently Used', value: 'recently-used' },
];

const BASE_CATEGORIES = ['Masking', 'Caulk & Patch', 'Sundries', 'Solvents', 'Tool', 'Safety'];
const UNITS = ['each', 'roll', 'tube', 'quart', 'gallon', 'bag', 'box', 'sheet', 'item'];

export function MaterialsView() {
  const { items, add, update, remove } = useCollection('materials');
  const { toast } = useToast();
  const crud = useLibraryCrud<Material>();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');

  const categories = useMemo(() => Array.from(new Set([...BASE_CATEGORIES, ...items.map((m) => m.category)])), [items]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = items.filter((m) => m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q));
    if (sort === 'favorites') out = out.filter((m) => m.isFavorite);
    if (sort === 'recently-used') return [...out].sort((a, b) => b.sortOrder - a.sortOrder);
    return [...out].sort((a, b) => a.name.localeCompare(b.name));
  }, [items, search, sort]);

  return (
    <SettingsPage
      title="Materials & Supplies"
      subtitle="Manage consumables"
      actions={<Button icon={<Plus className="h-4 w-4" />} onClick={crud.openAdd}>Add Item</Button>}
    >
      <LibraryToolbar search={search} onSearch={setSearch} placeholder="Search items..." sort={sort} onSort={setSort} sortOptions={SORTS} />
      <LibraryGrid>
        {list.map((m) => (
          <LibraryCard key={m.id}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="min-w-0 flex-1 break-words pt-1 font-heading text-base font-bold leading-tight text-gray-900">{m.name}</h3>
              <div className="-mr-1 flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => {
                    update(m.id, { isFavorite: !m.isFavorite });
                    toast(m.isFavorite ? 'Removed from favorites' : 'Added to favorites');
                  }}
                  className={cn('rounded-lg p-1.5 transition-all', m.isFavorite ? 'bg-amber-50 text-amber-400 hover:bg-amber-100' : 'text-gray-300 hover:bg-gray-50 hover:text-gray-500')}
                  aria-label={m.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Star className={cn('h-4 w-4', m.isFavorite && 'fill-current')} />
                </button>
                <CardKebab onEdit={() => crud.openEdit(m)} onDelete={() => crud.askDelete(m)} />
              </div>
            </div>
            <div className="mt-auto flex flex-wrap gap-1.5 border-t border-gray-100 pt-3">
              <Pill>{m.category}</Pill>
              <Pill color="blue" className="capitalize">{m.unit}</Pill>
              <Pill color="green">{money(m.unitCost)}</Pill>
            </div>
          </LibraryCard>
        ))}
        {list.length === 0 && <NoMatches>{search || sort === 'favorites' ? 'No items found matching search.' : 'No materials yet. Add your first one!'}</NoMatches>}
      </LibraryGrid>

      <MaterialModal
        open={crud.open}
        onOpenChange={crud.setOpen}
        material={crud.editing}
        categories={categories}
        onSave={(data) => {
          if (crud.editing) {
            update(crud.editing.id, data);
            toast('Material updated successfully');
          } else {
            add({ ...data, sortOrder: nextSort(items) });
            toast('Material added successfully');
          }
          crud.close();
        }}
      />
      <ConfirmDialog
        open={!!crud.deleting}
        onOpenChange={(o) => !o && crud.clearDelete()}
        title="Delete Material"
        message={`Are you sure you want to delete "${crud.deleting?.name}"?`}
        onConfirm={() => {
          if (crud.deleting) remove(crud.deleting.id);
          toast('Material deleted successfully');
        }}
      />
    </SettingsPage>
  );
}

type MatForm = Omit<Material, 'id' | 'sortOrder'>;

function MaterialModal({
  open, onOpenChange, material, categories, onSave,
}: { open: boolean; onOpenChange: (o: boolean) => void; material: Material | null; categories: string[]; onSave: (d: MatForm) => void }) {
  const [form, setForm] = useState<MatForm>({ name: '', category: '', unit: '', unitCost: 0, isFavorite: false });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setForm(material ? { name: material.name, category: material.category, unit: material.unit, unitCost: material.unitCost, isFavorite: material.isFavorite } : { name: '', category: '', unit: '', unitCost: 0, isFavorite: false });
    setErrors({});
  }, [open, material]);

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Item name is required';
    if (!form.category) e.category = 'Category is required';
    if (!form.unit) e.unit = 'Unit type is required';
    if (form.unitCost < 0) e.unitCost = 'Unit cost cannot be negative';
    setErrors(e);
    if (Object.keys(e).length) return;
    onSave({ ...form, name: form.name.trim() });
  };

  const unitOptions = Array.from(new Set([...UNITS, form.unit].filter(Boolean))).map((u) => ({ label: u[0]!.toUpperCase() + u.slice(1), value: u }));

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={material ? 'Edit Material Item' : 'Add Material Item'} size="md">
      <div className="space-y-4">
        <div className="space-y-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
          <SectionHeading icon={<Package />}>Item Details</SectionHeading>
          <Field label="Item Name" required error={errors.name}>
            <Input value={form.name} invalid={!!errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Blue Painter's Tape (1.5 inch)" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Field label="Category" required>
                <Select value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={categories.map((c) => ({ label: c, value: c }))} placeholder="Select category..." invalid={!!errors.category} />
              </Field>
              <FieldError>{errors.category}</FieldError>
            </div>
            <div>
              <Field label="Unit Type" required>
                <Select value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} options={unitOptions} placeholder="Select unit..." invalid={!!errors.unit} />
              </Field>
              <FieldError>{errors.unit}</FieldError>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-50">
              <DollarSign className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">Unit Cost</div>
              <div className="text-xs text-gray-500">Price per {form.unit || 'item'}</div>
            </div>
          </div>
          <div className="w-28">
            <Input type="number" min={0} step="0.01" value={form.unitCost} invalid={!!errors.unitCost} onChange={(e) => setForm({ ...form, unitCost: num(e.target.value) })} onClear={() => setForm({ ...form, unitCost: 0 })} placeholder="0.00" />
          </div>
        </div>
        <FieldError>{errors.unitCost}</FieldError>

        <div className="border-t border-gray-100 pt-3">
          <FormActions
            onCancel={() => onOpenChange(false)}
            submitLabel="Save Item"
            onSubmit={submit}
            left={
              <label className="flex items-center gap-2">
                <Switch checked={form.isFavorite} onChange={(v) => setForm({ ...form, isFavorite: v })} label="Add to Favorites / Defaults" />
                <Label className="mb-0 normal-case tracking-normal text-gray-700">Add to Favorites / Defaults</Label>
              </label>
            }
          />
        </div>
      </div>
    </Modal>
  );
}
