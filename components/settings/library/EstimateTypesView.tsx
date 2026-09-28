'use client';

/*
  Settings > Estimate Types (Scopes).
  Scopes like Interior / Exterior / Cabinets, each with a default hourly
  rate. Cards sorted by sortOrder; add / edit in a modal; delete confirms.
*/
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog, Modal } from '@/components/Modals/Modal';
import { useCollection } from '@/lib/store';
import type { EstimateType } from '@/lib/types';
import { CardKebab, EmptyBox, FormActions, LibraryCard, LibraryGrid, nextSort, num, useLibraryCrud } from './ui';

export function EstimateTypesView() {
  const { items, add, update, remove } = useCollection('estimateTypes');
  const { toast } = useToast();
  const crud = useLibraryCrud<EstimateType>();
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <SettingsPage
      title="Estimate Types"
      subtitle="Define specific Estimate Types (e.g., Interior, Exterior) and hourly rates."
      actions={<Button icon={<Plus className="h-4 w-4" />} onClick={crud.openAdd}>Add Type</Button>}
    >
      {sorted.length === 0 ? (
        <EmptyBox>No estimate types yet. Click &quot;Add Type&quot; to create one.</EmptyBox>
      ) : (
        <LibraryGrid>
          {sorted.map((t) => (
            <LibraryCard key={t.id}>
              <div className="absolute right-4 top-4">
                <CardKebab onEdit={() => crud.openEdit(t)} onDelete={() => crud.askDelete(t)} />
              </div>
              <h3 className="mb-2 pr-10 pt-2 font-heading text-base font-bold text-gray-900">{t.name}</h3>
              <p className="mb-6 min-h-[40px] text-xs leading-relaxed text-gray-500 line-clamp-3">{t.description || 'No description provided.'}</p>
              <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-5 text-xs">
                <span className="text-gray-500">Hourly Rate</span>
                <span className="font-bold text-gray-900">${t.hourlyRate.toFixed(2)}/hr</span>
              </div>
            </LibraryCard>
          ))}
        </LibraryGrid>
      )}

      <EstimateTypeModal
        open={crud.open}
        onOpenChange={crud.setOpen}
        type={crud.editing}
        onSave={(data) => {
          if (crud.editing) {
            update(crud.editing.id, data);
            toast('Estimate type updated successfully');
          } else {
            add({ ...data, sortOrder: nextSort(items) });
            toast('Estimate type created successfully');
          }
          crud.close();
        }}
      />
      <ConfirmDialog
        open={!!crud.deleting}
        onOpenChange={(o) => !o && crud.clearDelete()}
        title="Delete Estimate Type"
        message={`Are you sure you want to delete "${crud.deleting?.name}"?`}
        onConfirm={() => {
          if (crud.deleting) remove(crud.deleting.id);
          toast('Estimate type deleted successfully');
        }}
      />
    </SettingsPage>
  );
}

type FormData = Pick<EstimateType, 'name' | 'description' | 'hourlyRate'>;

function EstimateTypeModal({
  open, onOpenChange, type, onSave,
}: { open: boolean; onOpenChange: (o: boolean) => void; type: EstimateType | null; onSave: (d: FormData) => void }) {
  const [form, setForm] = useState<FormData>({ name: '', description: '', hourlyRate: 65 });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  useEffect(() => {
    if (!open) return;
    setForm(type ? { name: type.name, description: type.description, hourlyRate: type.hourlyRate } : { name: '', description: '', hourlyRate: 65 });
    setErrors({});
  }, [open, type]);

  const submit = () => {
    const e: typeof errors = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.description.trim()) e.description = 'Description is required';
    if (!(form.hourlyRate > 0)) e.hourlyRate = 'Hourly rate must be greater than 0';
    setErrors(e);
    if (Object.keys(e).length) return;
    onSave({ ...form, name: form.name.trim(), description: form.description.trim() });
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={type ? 'Edit Estimate Type' : 'Add Estimate Type'} size="lg">
      <div className="space-y-5">
        <Field label="Name" required error={errors.name}>
          <Input value={form.name} invalid={!!errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onClear={() => setForm({ ...form, name: '' })} placeholder="e.g. Interior" />
        </Field>
        <Field label="Description" required error={errors.description}>
          <Input value={form.description} invalid={!!errors.description} onChange={(e) => setForm({ ...form, description: e.target.value })} onClear={() => setForm({ ...form, description: '' })} placeholder="e.g. Standard interior painting (walls, ceilings, trim)" />
        </Field>
        <Field label="Hourly Rate ($)" required error={errors.hourlyRate} hint="Default hourly rate for this estimate type">
          <Input type="number" step="0.01" min="0.01" value={form.hourlyRate} invalid={!!errors.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: num(e.target.value) })} placeholder="e.g. 65.00" />
        </Field>
        <FormActions full onCancel={() => onOpenChange(false)} submitLabel={type ? 'Save Changes' : 'Add Type'} onSubmit={submit} />
      </div>
    </Modal>
  );
}
