'use client';

/*
  Settings > Brands.
  Paint brands used by the Paint Library. Custom brands (added by the
  company) can be edited or deleted; system brands show a lock (shield)
  instead of a menu. Deleting a brand that paint products still use is
  blocked with an error toast so products never lose their brand.
*/
import { useEffect, useMemo, useState } from 'react';
import { Building2, Plus, Shield } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog, Modal } from '@/components/Modals/Modal';
import { useCollection } from '@/lib/store';
import type { Brand } from '@/lib/types';
import { CardKebab, FormActions, LibraryCard, LibraryGrid, LibraryToolbar, NoMatches, Pill, nextSort, useLibraryCrud } from './ui';

const SORTS = [
  { label: 'Sort by Name (A-Z)', value: 'name' },
  { label: 'Sort Order', value: 'sortOrder' },
  { label: 'Recently Added', value: 'recent' },
  { label: 'Custom Only', value: 'custom' },
];

export function BrandsView() {
  const { items, add, update, remove } = useCollection('brands');
  const { items: paints } = useCollection('paintProducts');
  const { toast } = useToast();
  const crud = useLibraryCrud<Brand>();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = items.filter((b) => b.name.toLowerCase().includes(q));
    if (sort === 'custom') out = out.filter((b) => b.isCustom);
    if (sort === 'sortOrder') return [...out].sort((a, b) => a.sortOrder - b.sortOrder);
    if (sort === 'recent') return [...out].sort((a, b) => b.sortOrder - a.sortOrder);
    return [...out].sort((a, b) => a.name.localeCompare(b.name));
  }, [items, search, sort]);

  return (
    <SettingsPage
      title="Brands"
      subtitle="Manage paint brands for your organization"
      actions={<Button icon={<Plus className="h-4 w-4" />} onClick={crud.openAdd}>Add Brand</Button>}
    >
      <LibraryToolbar search={search} onSearch={setSearch} placeholder="Search brands..." sort={sort} onSort={setSort} sortOptions={SORTS} />
      <LibraryGrid>
        {list.map((b) => (
          <LibraryCard key={b.id}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50">
                  <Building2 className="h-4 w-4 text-primary-600" />
                </div>
                <h3 className="truncate font-heading text-base font-bold text-gray-900">{b.name}</h3>
              </div>
              {b.isCustom ? (
                <CardKebab onEdit={() => crud.openEdit(b)} onDelete={() => crud.askDelete(b)} />
              ) : (
                <span className="p-1.5" title="System brand">
                  <Shield className="h-4 w-4 text-gray-300" />
                </span>
              )}
            </div>
            <div className="mt-auto border-t border-gray-100 pt-3">
              {b.isCustom ? <Pill color="purple">Custom</Pill> : <Pill color="blue">System</Pill>}
            </div>
          </LibraryCard>
        ))}
        {list.length === 0 && <NoMatches>{search ? 'No brands found matching search.' : 'No brands yet. Add your first one!'}</NoMatches>}
      </LibraryGrid>

      <BrandModal
        open={crud.open}
        onOpenChange={crud.setOpen}
        brand={crud.editing}
        existing={items}
        onSave={(name) => {
          if (crud.editing) {
            update(crud.editing.id, { name });
            toast('Brand updated successfully');
          } else {
            add({ name, isCustom: true, sortOrder: nextSort(items) });
            toast('Brand added successfully');
          }
          crud.close();
        }}
      />
      <ConfirmDialog
        open={!!crud.deleting}
        onOpenChange={(o) => !o && crud.clearDelete()}
        title="Delete Brand"
        message={`Are you sure you want to delete "${crud.deleting?.name}"? This may affect paint products using this brand.`}
        onConfirm={() => {
          if (!crud.deleting) return;
          const used = paints.filter((p) => p.brandId === crud.deleting!.id).length;
          if (used) {
            toast(`Cannot delete: ${used} paint product${used > 1 ? 's use' : ' uses'} this brand`, 'error');
            return;
          }
          remove(crud.deleting.id);
          toast('Brand deleted successfully');
        }}
      />
    </SettingsPage>
  );
}

function BrandModal({
  open, onOpenChange, brand, existing, onSave,
}: { open: boolean; onOpenChange: (o: boolean) => void; brand: Brand | null; existing: Brand[]; onSave: (name: string) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) { setName(brand?.name ?? ''); setError(''); }
  }, [open, brand]);

  const submit = () => {
    const n = name.trim();
    if (!n) return setError('Brand name is required');
    if (existing.some((b) => b.id !== brand?.id && b.name.toLowerCase() === n.toLowerCase())) return setError('A brand with this name already exists');
    onSave(n);
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={brand ? 'Edit Brand' : 'Add Brand'} size="md">
      <div className="space-y-5">
        <Field label="Brand Name" required error={error}>
          <Input value={name} invalid={!!error} onChange={(e) => { setName(e.target.value); setError(''); }} placeholder="e.g. Sherwin-Williams" onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </Field>
        <div className="border-t border-gray-100 pt-3">
          <FormActions onCancel={() => onOpenChange(false)} submitLabel={brand ? 'Save Changes' : 'Add Brand'} onSubmit={submit} />
        </div>
      </div>
    </Modal>
  );
}
