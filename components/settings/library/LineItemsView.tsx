'use client';

/*
  Settings > Line Items.
  Reusable line items for estimates. Two kinds:
  - PRICED: has a calculation (flat price or percent) and a default value.
  - DESCRIPTIVE: text only (e.g. "Daily Cleanup"), no price.
  Filter pills: All / Priced / Descriptive.

  The live app does not apply the misc line item profit markup here yet
  (it is hard-coded off), so Total Client Price equals the default value.
  The modal still supports a markup (used as "Base Cost") if one is passed.
*/
import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { Field, Input, Label, Select, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog, Modal } from '@/components/Modals/Modal';
import { useCollection } from '@/lib/store';
import type { LineItemTemplate } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CardKebab, LibraryCard, LibraryGrid, LibraryToolbar, NoMatches, nextSort, num, useLibraryCrud } from './ui';

type Filter = 'all' | 'PRICED' | 'DESCRIPTIVE';

/** Segmented pill control used for All / Priced / Descriptive and in the modal. */
export function Segmented<T extends string>({ value, onChange, options, className, full }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string; full?: boolean }) {
  return (
    <div className={cn('flex rounded-lg border border-gray-200 bg-white p-1', full && 'border-0 bg-gray-100', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-bold transition-all',
            full && 'flex-1 py-2',
            value === o.value ? (full ? 'bg-white text-gray-900 shadow-sm' : 'bg-gray-100 text-gray-900') : 'text-gray-500 hover:text-gray-800',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function LineItemsView() {
  const { items, add, update, remove } = useCollection('lineItemTemplates');
  const { toast } = useToast();
  const crud = useLibraryCrud<LineItemTemplate>();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const markup = 0; // matches live: applyProfit is off on this screen

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...items]
      .filter((t) => (filter === 'all' || t.itemType === filter) && (t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [items, search, filter]);

  return (
    <SettingsPage
      title="Line Items"
      subtitle="Manage descriptive and priced templates for estimates."
      actions={<Button icon={<Plus className="h-4 w-4" />} onClick={crud.openAdd}>Add Template</Button>}
    >
      <LibraryToolbar search={search} onSearch={setSearch} placeholder="Search templates...">
        <Segmented<Filter> value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'PRICED', label: 'Priced' }, { value: 'DESCRIPTIVE', label: 'Descriptive' }]} />
      </LibraryToolbar>

      <LibraryGrid cols={2}>
        {list.map((t) => {
          const isPercent = t.calculationType === 'PERCENT';
          const value = t.defaultValue ?? 0;
          const client = isPercent ? value : value * (1 + markup / 100);
          return (
            <LibraryCard key={t.id}>
              <div className="absolute right-4 top-4">
                <CardKebab onEdit={() => crud.openEdit(t)} onDelete={() => crud.askDelete(t)} />
              </div>
              <h3 className="mb-3 pr-10 pt-1 font-heading text-base font-bold text-gray-900">{t.name}</h3>
              {t.itemType === 'DESCRIPTIVE' ? (
                <div className="whitespace-pre-line border-t border-gray-100 pt-3 text-sm leading-relaxed text-gray-600">{t.description}</div>
              ) : (
                <>
                  <p className="mb-5 whitespace-pre-line border-b border-gray-100 pb-5 text-sm text-gray-600">{t.description}</p>
                  <div className="mt-auto flex items-center justify-between gap-4">
                    <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 shadow-sm">
                      <span className="text-xxs font-bold uppercase text-gray-500">{isPercent ? 'Percent' : 'Unit Price'}</span>
                      <span className="text-sm font-bold text-gray-900">{isPercent ? `${value}%` : `$${value}`}</span>
                    </div>
                    <div className="text-right">
                      <div className="mb-0.5 text-xxs font-bold uppercase text-gray-500">Total Client Price</div>
                      <div className="font-heading text-2xl font-bold leading-none text-gray-900">{isPercent ? `${value}%` : `$${client.toFixed(2)}`}</div>
                    </div>
                  </div>
                </>
              )}
            </LibraryCard>
          );
        })}
        {list.length === 0 && <NoMatches>{search ? 'No templates found matching search.' : 'No line item templates yet. Click "Add Template" to create one.'}</NoMatches>}
      </LibraryGrid>

      <LineItemModal
        open={crud.open}
        onOpenChange={crud.setOpen}
        item={crud.editing}
        markup={markup}
        onSave={(data) => {
          if (crud.editing) {
            update(crud.editing.id, data);
            toast('Line item updated successfully');
          } else {
            add({ ...data, sortOrder: nextSort(items) });
            toast('Line item created successfully');
          }
          crud.close();
        }}
      />
      <ConfirmDialog
        open={!!crud.deleting}
        onOpenChange={(o) => !o && crud.clearDelete()}
        title="Delete Line Item"
        message={`Are you sure you want to delete "${crud.deleting?.name}"?`}
        onConfirm={() => {
          if (crud.deleting) remove(crud.deleting.id);
          toast('Line item deleted successfully');
        }}
      />
    </SettingsPage>
  );
}

type Form = Omit<LineItemTemplate, 'id' | 'sortOrder'>;

/** Add / edit modal. Exported so the Estimate Template editor can create items inline. */
export function LineItemModal({
  open, onOpenChange, item, markup, onSave, fixedType,
}: { open: boolean; onOpenChange: (o: boolean) => void; item: LineItemTemplate | null; markup: number; onSave: (d: Form) => void; fixedType?: LineItemTemplate['itemType'] }) {
  const blank: Form = { name: '', description: '', itemType: fixedType ?? 'PRICED', calculationType: 'FLAT_PRICE', defaultValue: 0 };
  const [form, setForm] = useState<Form>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setForm(item ? { name: item.name, description: item.description, itemType: item.itemType, calculationType: item.calculationType ?? 'FLAT_PRICE', defaultValue: item.defaultValue ?? 0 } : blank);
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item]);

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Template name is required';
    if (!form.description.trim()) e.description = 'Description is required';
    if (form.itemType === 'PRICED' && (form.defaultValue ?? 0) < 0) e.defaultValue = 'Value cannot be negative';
    setErrors(e);
    if (Object.keys(e).length) return;
    onSave(
      form.itemType === 'DESCRIPTIVE'
        ? { name: form.name.trim(), description: form.description.trim(), itemType: 'DESCRIPTIVE' }
        : { ...form, name: form.name.trim(), description: form.description.trim() },
    );
  };

  const flat = form.calculationType !== 'PERCENT';

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={item ? 'Edit Line Item Template' : 'Add Line Item Template'} size="md">
      <div className="space-y-5">
        {!fixedType && (
          <div>
            <Label>Item Type</Label>
            <Segmented full value={form.itemType} onChange={(v) => setForm({ ...form, itemType: v })} options={[{ value: 'PRICED', label: 'Priced Item' }, { value: 'DESCRIPTIVE', label: 'Descriptive' }]} />
          </div>
        )}
        <Field label="Template Name" required error={errors.name}>
          <Input value={form.name} invalid={!!errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Description Content" required error={errors.description}>
          <Textarea rows={3} value={form.description} invalid={!!errors.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        {form.itemType === 'PRICED' && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Calculation">
              <Select value={form.calculationType} onChange={(v) => setForm({ ...form, calculationType: v as Form['calculationType'] })} options={[{ label: 'Flat Price', value: 'FLAT_PRICE' }, { label: 'Percent', value: 'PERCENT' }]} />
            </Field>
            <Field
              label={flat && markup ? 'Base Cost' : 'Default Value'}
              error={errors.defaultValue}
              hint={flat && markup ? `Client price: $${((form.defaultValue ?? 0) * (1 + markup / 100)).toFixed(2)} (+${markup}% profit)` : undefined}
            >
              <Input type="number" step="0.01" value={form.defaultValue ?? 0} onChange={(e) => setForm({ ...form, defaultValue: num(e.target.value) })} onClear={() => setForm({ ...form, defaultValue: 0 })} />
            </Field>
          </div>
        )}
        <Button className="w-full justify-center" onClick={submit}>Save Template</Button>
      </div>
    </Modal>
  );
}
