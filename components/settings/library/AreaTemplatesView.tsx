'use client';

/*
  Settings > Area Templates.
  Reusable rooms / areas (Bedroom, Front Elevation...) with the surfaces
  they include by default. Each belongs to one estimate type. The
  Estimate Templates editor and the Create Estimate wizard pull areas
  from here. Search by name, sort by name or estimate type, and filter
  by estimate type.
*/
import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog, Modal } from '@/components/Modals/Modal';
import { useCollection, useLookups } from '@/lib/store';
import type { AreaTemplate } from '@/lib/types';
import {
  CardKebab, EmptyBox, FieldError, FormActions, LibraryCard, LibraryGrid, LibraryToolbar, NoMatches, nextSort, useLibraryCrud,
} from './ui';

const SORTS = [
  { label: 'Sort by Name (A-Z)', value: 'name' },
  { label: 'Sort by Estimate Type', value: 'estimateType' },
];

export function AreaTemplatesView() {
  const { items, add, update, remove } = useCollection('areaTemplates');
  const { items: types } = useCollection('estimateTypes');
  const { items: surfaces } = useCollection('surfaceRates');
  const lookups = useLookups();
  const { toast } = useToast();
  const crud = useLibraryCrud<AreaTemplate>();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const [typeFilter, setTypeFilter] = useState('all');

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = items.filter((t) => t.name.toLowerCase().includes(q) && (typeFilter === 'all' || t.estimateTypeId === typeFilter));
    const typeName = (t: AreaTemplate) => lookups.estimateType(t.estimateTypeId)?.name ?? '';
    return [...out].sort((a, b) => (sort === 'estimateType' ? typeName(a).localeCompare(typeName(b)) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)));
  }, [items, search, sort, typeFilter, lookups]);

  return (
    <SettingsPage
      title="Area Templates"
      subtitle="Define reusable rooms or areas with default surfaces."
      actions={<Button icon={<Plus className="h-4 w-4" />} onClick={crud.openAdd}>Add Template</Button>}
    >
      <LibraryToolbar search={search} onSearch={setSearch} placeholder="Search templates..." sort={sort} onSort={setSort} sortOptions={SORTS}>
        <div className="w-full md:w-auto md:min-w-[150px]">
          <Select
            size="sm"
            className="h-8 text-[10px]"
            value={typeFilter}
            onChange={setTypeFilter}
            options={[{ label: 'All Estimate Types', value: 'all' }, ...types.map((t) => ({ label: t.name, value: t.id }))]}
          />
        </div>
      </LibraryToolbar>

      {list.length === 0 ? (
        search ? (
          <NoMatches>No templates found matching &quot;{search}&quot;.</NoMatches>
        ) : (
          <EmptyBox>No area templates yet. Click &quot;Add Template&quot; to create one.</EmptyBox>
        )
      ) : (
        <LibraryGrid>
          {list.map((t) => {
            const surfs = t.surfaceRateIds.map((id) => lookups.surfaceRate(id)).filter(Boolean);
            return (
              <LibraryCard key={t.id}>
                <div className="absolute right-4 top-4">
                  <CardKebab onEdit={() => crud.openEdit(t)} onDelete={() => crud.askDelete(t)} />
                </div>
                <div className="mb-5 pr-10 pt-2">
                  <h3 className="mb-1 font-heading text-base font-bold text-gray-900">{t.name}</h3>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{lookups.estimateType(t.estimateTypeId)?.name || 'General'}</span>
                </div>
                <div className="mt-auto flex flex-wrap gap-1.5">
                  {surfs.map((s) => (
                    <span key={s!.id} className="rounded-lg border border-gray-200 bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-700">{s!.name}</span>
                  ))}
                  {surfs.length === 0 && <span className="text-xs italic text-gray-400">No default surfaces</span>}
                </div>
              </LibraryCard>
            );
          })}
        </LibraryGrid>
      )}

      <AreaTemplateModal
        open={crud.open}
        onOpenChange={crud.setOpen}
        template={crud.editing}
        defaultSort={nextSort(items)}
        types={types.map((t) => ({ label: t.name, value: t.id }))}
        surfaces={surfaces}
        onSave={(data) => {
          if (crud.editing) {
            update(crud.editing.id, data);
            toast('Area template updated successfully');
          } else {
            add(data);
            toast('Area template created successfully');
          }
          crud.close();
        }}
      />
      <ConfirmDialog
        open={!!crud.deleting}
        onOpenChange={(o) => !o && crud.clearDelete()}
        title="Delete Area Template"
        message={`Are you sure you want to delete "${crud.deleting?.name}"?`}
        onConfirm={() => {
          if (crud.deleting) remove(crud.deleting.id);
          toast('Area template deleted successfully');
        }}
      />
    </SettingsPage>
  );
}

type FormData = Omit<AreaTemplate, 'id'>;

function AreaTemplateModal({
  open, onOpenChange, template, defaultSort, types, surfaces, onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template: AreaTemplate | null;
  defaultSort: number;
  types: { label: string; value: string }[];
  surfaces: { id: string; name: string }[];
  onSave: (d: FormData) => void;
}) {
  const blank: FormData = { name: '', estimateTypeId: '', surfaceRateIds: [], sortOrder: defaultSort };
  const [form, setForm] = useState<FormData>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setForm(template ? { name: template.name, estimateTypeId: template.estimateTypeId, surfaceRateIds: [...template.surfaceRateIds], sortOrder: template.sortOrder } : blank);
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template]);

  const toggle = (id: string, on: boolean) =>
    setForm((f) => ({ ...f, surfaceRateIds: on ? [...f.surfaceRateIds, id] : f.surfaceRateIds.filter((x) => x !== id) }));

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Template name is required';
    if (!form.estimateTypeId) e.estimateTypeId = 'Estimate type is required';
    if (form.surfaceRateIds.length === 0) e.surfaceRateIds = 'At least one surface must be selected';
    if (!(form.sortOrder >= 1)) e.sortOrder = 'Sort order must be at least 1';
    setErrors(e);
    if (Object.keys(e).length) return;
    onSave({ ...form, name: form.name.trim() });
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={template ? 'Edit Area Template' : 'Add Area Template'} size="md">
      <div className="space-y-5">
        <Field label="Template Name" required error={errors.name}>
          <Input value={form.name} invalid={!!errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Master Bedroom" />
        </Field>
        <div>
          <Field label="Estimate Type" required>
            <Select value={form.estimateTypeId} onChange={(v) => setForm({ ...form, estimateTypeId: v })} options={types} placeholder="Select an estimate type..." invalid={!!errors.estimateTypeId} />
          </Field>
          <FieldError>{errors.estimateTypeId}</FieldError>
        </div>
        <div>
          <div className="max-h-60 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50 p-3">
            <span className="mb-3 block text-[10px] font-bold uppercase tracking-widest text-gray-500">Default Surfaces Included</span>
            {surfaces.length === 0 ? (
              <p className="text-sm italic text-gray-500">No surface rates available</p>
            ) : (
              <div className="space-y-1.5">
                {surfaces.map((s) => (
                  <div key={s.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2 hover:border-primary-300">
                    <Checkbox checked={form.surfaceRateIds.includes(s.id)} onChange={(v) => toggle(s.id, v)} label={<span className="text-xs font-medium text-gray-700">{s.name}</span>} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <FieldError>{errors.surfaceRateIds}</FieldError>
        </div>
        <Field label="Sort Order" required error={errors.sortOrder} hint="Order in which this template appears in lists">
          <Input type="number" min={1} step={1} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 1 })} />
        </Field>
        <FormActions full onCancel={() => onOpenChange(false)} submitLabel={template ? 'Save Changes' : 'Add Template'} onSubmit={submit} />
      </div>
    </Modal>
  );
}
