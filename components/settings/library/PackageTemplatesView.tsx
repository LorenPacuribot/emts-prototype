'use client';

/*
  Settings > Package Templates.
  Reusable Good / Better / Best package descriptions that estimates can
  offer as options. Each package has a tier, a description, an optional
  paint product, a price adjustment (% over the base price) and a list
  of included features.
*/
import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { Field, Input, Label, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog, Modal } from '@/components/Modals/Modal';
import { useCollection, useLookups } from '@/lib/store';
import type { PackageTemplate } from '@/lib/types';
import { CardKebab, FieldError, FormActions, LibraryCard, LibraryGrid, LibraryToolbar, Pill, num, useLibraryCrud } from './ui';
import { RichContent, RichTextEditor } from './RichText';

const TIERS: PackageTemplate['tier'][] = ['Good', 'Better', 'Best'];
const TIER_COLOR = { Good: 'gray', Better: 'blue', Best: 'purple' } as const;

export function PackageTemplatesView() {
  const { items, add, update, remove } = useCollection('packageTemplates');
  const { items: paints } = useCollection('paintProducts');
  const lookups = useLookups();
  const { toast } = useToast();
  const crud = useLibraryCrud<PackageTemplate>();
  const [search, setSearch] = useState('');

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
      .sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier));
  }, [items, search]);

  return (
    <SettingsPage
      title="Package Templates"
      subtitle="Manage reusable package descriptions for estimates."
      actions={<Button icon={<Plus className="h-4 w-4" />} onClick={crud.openAdd}>Add Package</Button>}
    >
      <LibraryToolbar search={search} onSearch={setSearch} placeholder="Search packages..." />
      {list.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white py-14 text-center">
          <h3 className="font-heading text-lg font-bold text-gray-900">No Packages Found</h3>
          <p className="mt-2 text-gray-500">{search ? 'Try adjusting your search.' : 'Create your first package template to get started.'}</p>
        </div>
      ) : (
        <LibraryGrid>
          {list.map((p) => {
            const paint = lookups.paint(p.paintProductId);
            return (
              <LibraryCard key={p.id}>
                <div className="absolute right-4 top-4">
                  <CardKebab onEdit={() => crud.openEdit(p)} onDelete={() => crud.askDelete(p)} />
                </div>
                <div className="mb-3 flex items-center gap-2 pr-10 pt-1">
                  <h3 className="font-heading text-base font-bold text-gray-900">{p.name}</h3>
                  <Pill color={TIER_COLOR[p.tier]}>{p.tier}</Pill>
                </div>
                <div className="border-t border-gray-100 pt-3">
                  <RichContent text={p.description} className="text-sm leading-relaxed text-gray-600" />
                  {p.features.length > 0 && (
                    <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-gray-600">
                      {p.features.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  )}
                </div>
                <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
                  {paint && <Pill color="blue">{paint.name}</Pill>}
                  <Pill color="green">{p.priceAdjustment > 0 ? `+${p.priceAdjustment}%` : 'Base price'}</Pill>
                </div>
              </LibraryCard>
            );
          })}
        </LibraryGrid>
      )}

      <PackageModal
        open={crud.open}
        onOpenChange={crud.setOpen}
        pkg={crud.editing}
        paintOptions={paints.filter((p) => p.isActive).map((p) => ({ label: `${lookups.brand(p.brandId)?.name ?? ''} ${p.name}`.trim(), value: p.id }))}
        onSave={(data) => {
          if (crud.editing) {
            update(crud.editing.id, data);
            toast('Package template updated successfully');
          } else {
            add(data);
            toast('Package template created successfully');
          }
          crud.close();
        }}
      />
      <ConfirmDialog
        open={!!crud.deleting}
        onOpenChange={(o) => !o && crud.clearDelete()}
        title="Delete Package Template"
        message={`Are you sure you want to delete "${crud.deleting?.name}"?`}
        onConfirm={() => {
          if (crud.deleting) remove(crud.deleting.id);
          toast('Package template deleted successfully');
        }}
      />
    </SettingsPage>
  );
}

type Form = Omit<PackageTemplate, 'id'>;

function PackageModal({
  open, onOpenChange, pkg, paintOptions, onSave,
}: { open: boolean; onOpenChange: (o: boolean) => void; pkg: PackageTemplate | null; paintOptions: { label: string; value: string }[]; onSave: (d: Form) => void }) {
  const blank: Form = { name: '', description: '', tier: 'Good', paintProductId: undefined, priceAdjustment: 0, features: [] };
  const [form, setForm] = useState<Form>(blank);
  const [feature, setFeature] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setForm(pkg ? { name: pkg.name, description: pkg.description, tier: pkg.tier, paintProductId: pkg.paintProductId, priceAdjustment: pkg.priceAdjustment, features: [...pkg.features] } : blank);
    setFeature('');
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pkg]);

  const addFeature = () => {
    if (!feature.trim()) return;
    setForm((f) => ({ ...f, features: [...f.features, feature.trim()] }));
    setFeature('');
  };

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Package name is required';
    if (!form.description.trim()) e.description = 'Description is required';
    setErrors(e);
    if (Object.keys(e).length) return;
    onSave({ ...form, name: form.name.trim(), description: form.description.trim() });
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={pkg ? 'Edit Package Template' : 'Add Package Template'} size="lg">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Package Name" required error={errors.name}>
            <Input value={form.name} invalid={!!errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Tier" required>
            <Select value={form.tier} onChange={(v) => setForm({ ...form, tier: v as Form['tier'] })} options={TIERS.map((t) => ({ label: t, value: t }))} />
          </Field>
        </div>
        <div>
          <Label required>Package Description</Label>
          <RichTextEditor rows={4} value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="Describe what this package includes..." invalid={!!errors.description} />
          <FieldError>{errors.description}</FieldError>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Paint Product">
            <Select value={form.paintProductId} onChange={(v) => setForm({ ...form, paintProductId: v })} options={paintOptions} placeholder="Select a product..." />
          </Field>
          <Field label="Price Adjustment (%)" hint="Added on top of the base estimate price">
            <Input type="number" step="0.5" value={form.priceAdjustment} onChange={(e) => setForm({ ...form, priceAdjustment: num(e.target.value) })} />
          </Field>
        </div>
        <div>
          <Label>Included Features</Label>
          <div className="space-y-2">
            {form.features.map((f, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                <span className="flex-1">{f}</span>
                <button type="button" aria-label={`Remove ${f}`} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" onClick={() => setForm({ ...form, features: form.features.filter((_, j) => j !== i) })}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <div className="flex-1"><Input value={feature} onChange={(e) => setFeature(e.target.value)} placeholder="e.g. 2 finish coats" onKeyDown={(e) => e.key === 'Enter' && addFeature()} /></div>
              <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={addFeature} disabled={!feature.trim()}>Add</Button>
            </div>
          </div>
        </div>
        <FormActions full onCancel={() => onOpenChange(false)} submitLabel={pkg ? 'Save Changes' : 'Add Package'} onSubmit={submit} />
      </div>
    </Modal>
  );
}
