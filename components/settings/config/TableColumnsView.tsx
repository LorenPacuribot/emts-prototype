'use client';

/*
  Settings > Table Columns. The columns shown in estimate area tables.
  Click the eye to show or hide a column. The card menu can edit, move a
  column earlier or later (reorder), or delete a custom column. System columns
  can be renamed and hidden but not deleted. "Add Column" creates custom
  Hours Input, Checkbox or Quantity columns. Writes the `tableColumns` collection.
*/
import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/display';
import { Field, Input, Select } from '@/components/ui/form';
import { RowMenu } from '@/components/ui/menu';
import { ConfirmDialog, Modal } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { useCollection } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { TableColumn } from '@/lib/types';

const TYPE_BADGE: Record<TableColumn['columnType'], { label: string; cls: string }> = {
  SYSTEM: { label: 'System', cls: 'bg-gray-100 text-gray-600' },
  HOURS: { label: 'Hours Input', cls: 'bg-blue-100 text-blue-600' },
  CHECKBOX: { label: 'Checkbox', cls: 'bg-amber-100 text-amber-600' },
  QUANTITY: { label: 'Quantity', cls: 'bg-green-100 text-green-600' },
};
const UNITS = [
  { value: 'SqFt', label: 'Square Feet (SqFt)' },
  { value: 'LnFt', label: 'Linear Feet (LnFt)' },
  { value: 'Item', label: 'Item Count (Item)' },
  { value: 'Percent', label: 'Percent of the surface (%)' },
];

export function TableColumnsView() {
  const { items, update, remove, setAll } = useCollection('tableColumns');
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<TableColumn | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<TableColumn | null>(null);

  const sorted = useMemo(() => [...items].sort((a, b) => a.sortOrder - b.sortOrder), [items]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sorted.filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)) : sorted;
  }, [sorted, query]);

  /** Swap a column with its neighbour and renumber sortOrder 1..n. */
  const move = (c: TableColumn, dir: -1 | 1) => {
    const i = sorted.findIndex((x) => x.id === c.id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    const next = [...sorted];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setAll(next.map((x, k) => ({ ...x, sortOrder: k + 1 })));
  };

  return (
    <SettingsPage
      title="Table Columns"
      subtitle="Configure custom columns for the estimate area tables."
      actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Add Column</Button>}
    >
      <div className="mb-6">
        <SearchInput value={query} onChange={setQuery} placeholder="Search columns by name or ID..." />
      </div>
      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center text-sm text-gray-500">
          {query ? 'No columns match your search.' : 'No columns yet. Add a custom column to get started.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => {
            const idx = sorted.findIndex((x) => x.id === c.id);
            const badge = TYPE_BADGE[c.columnType];
            return (
              <div key={c.id} className="rounded-xl bg-white p-4 shadow-lg transition-all hover:shadow-md">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    title={c.isVisible ? 'Hide Column' : 'Show Column'}
                    aria-label={c.isVisible ? `Hide ${c.name}` : `Show ${c.name}`}
                    onClick={() => {
                      update(c.id, { isVisible: !c.isVisible });
                      toast(`${c.name} is now ${c.isVisible ? 'hidden' : 'visible'}`);
                    }}
                    className={cn('shrink-0 rounded-lg p-2 transition-colors', c.isVisible ? 'bg-primary-50 text-primary-600' : 'bg-gray-100 text-gray-400')}
                  >
                    {c.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-sm font-bold', c.isVisible ? 'text-gray-900' : 'text-gray-400')}>{c.name}</p>
                    <span className={cn('mt-1 inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium', badge.cls)}>
                      {badge.label}
                      {c.columnType === 'QUANTITY' && c.unit && <span className="ml-1">({c.unit === 'Percent' ? '%' : c.unit})</span>}
                    </span>
                    {!c.isSystem && c.columnType !== 'HOURS' && (
                      <span className="ml-1 text-[10px] text-gray-500">{c.prepRate ? `${c.prepRate} units/hr` : 'No prep rate'}</span>
                    )}
                  </div>
                  <RowMenu
                    items={[
                      { label: 'Edit', icon: <Pencil />, onClick: () => setEditing(c) },
                      { label: 'Move Up', icon: <ArrowUp />, disabled: idx === 0, onClick: () => move(c, -1) },
                      { label: 'Move Down', icon: <ArrowDown />, disabled: idx === sorted.length - 1, onClick: () => move(c, 1) },
                      ...(c.isSystem ? [] : [{ label: 'Delete', icon: <Trash2 />, danger: true, separatorBefore: true, onClick: () => setToDelete(c) }]),
                    ]}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && <ColumnFormModal column={editing === 'new' ? undefined : editing} nextSort={sorted.length + 1} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="Delete Column"
        message={toDelete ? `Are you sure you want to delete "${toDelete.name}"?` : ''}
        onConfirm={() => {
          if (!toDelete) return;
          remove(toDelete.id);
          toast('Column deleted successfully');
        }}
      />
    </SettingsPage>
  );
}

function ColumnFormModal({ column, nextSort, onClose }: { column?: TableColumn; nextSort: number; onClose: () => void }) {
  const { items, add, update } = useCollection('tableColumns');
  const { toast } = useToast();
  const [name, setName] = useState(column?.name ?? '');
  const [type, setType] = useState<Exclude<TableColumn['columnType'], 'SYSTEM'>>(column && column.columnType !== 'SYSTEM' ? column.columnType : 'HOURS');
  const [unit, setUnit] = useState(column?.unit && UNITS.some((u) => u.value === column.unit) ? column.unit : '');
  const [rate, setRate] = useState(column?.prepRate ? String(column.prepRate) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isSystem = !!column?.isSystem;

  const save = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Column title is required';
    else if (items.some((c) => c.name.toLowerCase() === name.trim().toLowerCase() && c.id !== column?.id)) e.name = 'A column with this name already exists';
    if (!isSystem && type === 'QUANTITY' && !unit) e.unit = 'Unit type is required for quantity columns';
    const prepRate = rate.trim() ? Number(rate) : undefined;
    if (prepRate !== undefined && !(prepRate > 0)) e.rate = 'Enter a rate above zero, or leave it blank';
    setErrors(e);
    if (Object.keys(e).length) return;
    const unitValue = type === 'QUANTITY' ? unit : type === 'HOURS' ? 'hr' : undefined;
    const rateValue = type === 'HOURS' ? undefined : prepRate;
    if (column) update(column.id, isSystem ? { name: name.trim() } : { name: name.trim(), columnType: type, unit: unitValue, prepRate: rateValue });
    else add({ name: name.trim(), columnType: type, unit: unitValue, prepRate: rateValue, isVisible: true, isSystem: false, sortOrder: nextSort });
    toast(`Column ${column ? 'updated' : 'added'} successfully`);
    onClose();
  };

  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={column ? 'Edit Column' : 'Add Custom Column'}
      size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>{column ? 'Save Changes' : 'Add Column'}</Button></>}
    >
      <div className="space-y-4">
        <Field label="Column Title" required error={errors.name}>
          <Input value={name} placeholder="e.g. Scuff Sanding" invalid={!!errors.name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {isSystem ? (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">System columns can be renamed or hidden, but their type cannot change.</p>
        ) : (
          <>
            <Field label="Column Type" required>
              <Select
                value={type}
                onChange={(v) => setType(v as typeof type)}
                options={[{ value: 'HOURS', label: 'Hours Input' }, { value: 'CHECKBOX', label: 'Checkbox' }, { value: 'QUANTITY', label: 'Quantity' }]}
              />
            </Field>
            {type === 'QUANTITY' && (
              <Field label="Unit Type" required error={errors.unit}>
                <Select value={unit} onChange={setUnit} placeholder="Select unit" invalid={!!errors.unit} options={UNITS} />
              </Field>
            )}
            {type !== 'HOURS' && (
              <Field
                label="Production rate (units per hour)"
                error={errors.rate}
                hint={type === 'CHECKBOX' ? 'A ticked row adds coating area ÷ rate prep hours.' : unit === 'Percent' ? 'Adds (area × %) ÷ rate prep hours.' : 'Adds quantity ÷ rate prep hours.'}
              >
                <Input type="number" min={0} value={rate} placeholder="e.g. 400" invalid={!!errors.rate} onChange={(e) => setRate(e.target.value)} />
              </Field>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
