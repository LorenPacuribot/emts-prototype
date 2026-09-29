'use client';

/*
  Settings > Paint Library.
  Paints, primers and stains the company uses. Each card shows the brand,
  product name, category, finish (sheen) and smooth-surface coverage.
  The star toggles a favorite. The add/edit modal groups fields the way
  the live app does: Product Identity, Finish & Type, Coverage & Pricing,
  plus a Colors list used by the estimate Paint Color Card.
  NEW: below the cards, the product catalogue the colour card, material
  demand and container packing use (field rate, available pack sizes and
  their costs) — features/components/features/settings/paint-library-screen.tsx.
*/
import { useEffect, useMemo, useState } from 'react';
import { Droplets, PaintBucket, Plus, Star, Tag, Trash2, Wand2 } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { Field, Input, Label, Select, Switch } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog, Modal } from '@/components/Modals/Modal';
import { useCollection, useLookups } from '@/lib/store';
import type { PaintProduct } from '@/lib/types';
import { cn } from '@/lib/utils';
import { PaintCatalogSection } from '@/features/components/features/settings/paint-library-screen';
import { CardKebab, FieldError, FormActions, LibraryCard, LibraryGrid, LibraryToolbar, NoMatches, Pill, SectionHeading, num, useLibraryCrud } from './ui';

const SORTS = [
  { label: 'Sort by Name (A-Z)', value: 'name' },
  { label: 'Sort by Price (Low-High)', value: 'price' },
  { label: 'Favorites', value: 'favorites' },
  { label: 'Recently Used', value: 'recently-used' },
];

export const PAINT_CATEGORIES = ['Paint', 'Primer', 'Stain', 'Sealer', 'Specialty'];
export const PAINT_FINISHES = ['Flat', 'Matte', 'Eggshell', 'Satin', 'Semi-Gloss', 'Gloss', 'High-Gloss'];

export function PaintLibraryView() {
  const { items, add, update, remove } = useCollection('paintProducts');
  const { items: brands } = useCollection('brands');
  const lookups = useLookups();
  const { toast } = useToast();
  const crud = useLibraryCrud<PaintProduct>();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = items.filter((p) => [p.name, lookups.brand(p.brandId)?.name ?? '', p.category].some((s) => s.toLowerCase().includes(q)));
    if (sort === 'favorites') out = out.filter((p) => p.isFavorite);
    if (sort === 'price') return [...out].sort((a, b) => a.pricePerGallon - b.pricePerGallon);
    if (sort === 'recently-used') return out; // store order = most recently added/used first
    return [...out].sort((a, b) => a.name.localeCompare(b.name));
  }, [items, search, sort, lookups]);

  return (
    <SettingsPage
      title="Paint Library"
      subtitle="Manage paints, primers, and stains"
      actions={<Button icon={<Plus className="h-4 w-4" />} onClick={crud.openAdd}>Add Item</Button>}
    >
      <LibraryToolbar search={search} onSearch={setSearch} placeholder="Search items..." sort={sort} onSort={setSort} sortOptions={SORTS} />
      <LibraryGrid>
        {list.map((p) => (
          <LibraryCard key={p.id} className={cn(!p.isActive && 'opacity-60')}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 truncate text-xxs font-bold uppercase tracking-widest text-gray-500">{lookups.brand(p.brandId)?.name ?? 'Unknown brand'}</div>
                <h3 className="break-words font-heading text-base font-bold leading-tight text-gray-900">{p.name}</h3>
                <span className="mt-1 inline-block rounded border border-gray-100 bg-gray-50 px-1.5 py-0.5 text-xs font-bold text-gray-500">{p.category}</span>
                {!p.isActive && <span className="ml-1 inline-block rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-xs font-bold text-gray-500">Inactive</span>}
              </div>
              <div className="-mr-1 flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => {
                    update(p.id, { isFavorite: !p.isFavorite });
                    toast(p.isFavorite ? 'Removed from favorites' : 'Added to favorites');
                  }}
                  className={cn('rounded-lg p-1.5 transition-all', p.isFavorite ? 'bg-amber-50 text-amber-400 hover:bg-amber-100' : 'text-gray-300 hover:bg-gray-50 hover:text-gray-500')}
                  title={p.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                  aria-label={p.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Star className={cn('h-4 w-4', p.isFavorite && 'fill-current')} />
                </button>
                <CardKebab onEdit={() => crud.openEdit(p)} onDelete={() => crud.askDelete(p)} />
              </div>
            </div>
            <div className="mt-auto flex min-h-[1.5rem] flex-wrap gap-1.5 border-t border-gray-100 pt-3">
              {p.finish && <Pill color="blue">{p.finish}</Pill>}
              {p.coverageCoat1 > 0 && <Pill color="green">{p.coverageCoat1} sqft/gal</Pill>}
            </div>
          </LibraryCard>
        ))}
        {list.length === 0 && <NoMatches>{search || sort === 'favorites' ? 'No items found matching search.' : 'No paint products yet. Add your first one!'}</NoMatches>}
      </LibraryGrid>

      <PaintCatalogSection />

      <PaintModal
        open={crud.open}
        onOpenChange={crud.setOpen}
        paint={crud.editing}
        brandOptions={[...brands].sort((a, b) => a.name.localeCompare(b.name)).map((b) => ({ label: b.name, value: b.id }))}
        onSave={(data) => {
          if (crud.editing) {
            update(crud.editing.id, data);
            toast('Paint product updated successfully');
          } else {
            add({ ...data, isFavorite: false }, { atStart: true });
            toast('Paint product added successfully');
          }
          crud.close();
        }}
      />
      <ConfirmDialog
        open={!!crud.deleting}
        onOpenChange={(o) => !o && crud.clearDelete()}
        title="Delete Paint Product"
        message={`Are you sure you want to delete "${crud.deleting?.name}"?`}
        onConfirm={() => {
          if (crud.deleting) remove(crud.deleting.id);
          toast('Paint product deleted successfully');
        }}
      />
    </SettingsPage>
  );
}

type PaintForm = Omit<PaintProduct, 'id' | 'isFavorite'>;
type Color = NonNullable<PaintProduct['colors']>[number];

const blankPaint = (): PaintForm => ({
  name: '', brandId: '', category: '', finish: '', coverageCoat1: 350, coverageCoat2: 0,
  pricePerGallon: 0, pricePer5Gallon: undefined, isActive: true, colors: [],
});

function PaintModal({
  open, onOpenChange, paint, brandOptions, onSave,
}: { open: boolean; onOpenChange: (o: boolean) => void; paint: PaintProduct | null; brandOptions: { label: string; value: string }[]; onSave: (d: PaintForm) => void }) {
  const [form, setForm] = useState<PaintForm>(blankPaint());
  const [coat2, setCoat2] = useState('');
  const [multOn, setMultOn] = useState(false);
  const [mult, setMult] = useState(1.5);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newColor, setNewColor] = useState<Color>({ name: '', code: '', hex: '#ffffff' });

  useEffect(() => {
    if (!open) return;
    if (paint) {
      const { id: _id, isFavorite: _fav, ...rest } = paint;
      setForm({ ...rest, colors: [...(paint.colors ?? [])] });
      setCoat2(paint.coverageCoat2 ? String(paint.coverageCoat2) : '');
    } else {
      setForm(blankPaint());
      setCoat2('');
    }
    setMultOn(false);
    setErrors({});
    setNewColor({ name: '', code: '', hex: '#ffffff' });
  }, [open, paint]);

  const set = <K extends keyof PaintForm>(k: K, v: PaintForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.brandId) e.brandId = 'Brand is required';
    if (!form.name.trim()) e.name = 'Product name is required';
    if (!form.category) e.category = 'Category is required';
    if (!form.finish) e.finish = 'Finish is required';
    if (!(form.coverageCoat1 > 0)) e.coverageCoat1 = 'Coverage for coat 1 is required';
    if (!(form.pricePerGallon > 0)) e.pricePerGallon = 'Price must be greater than 0';
    setErrors(e);
    if (Object.keys(e).length) return;
    const c2 = multOn ? Math.round(form.coverageCoat1 * mult) : num(coat2, form.coverageCoat1);
    onSave({ ...form, name: form.name.trim(), coverageCoat2: c2 });
  };

  const addColor = () => {
    if (!newColor.name.trim()) return;
    set('colors', [...(form.colors ?? []), { ...newColor, name: newColor.name.trim(), code: newColor.code.trim() }]);
    setNewColor({ name: '', code: '', hex: '#ffffff' });
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={paint ? 'Edit Paint Product' : 'Add Paint Product'} size="lg">
      <div className="space-y-6">
        {/* Product identity */}
        <div className="space-y-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
          <SectionHeading icon={<Tag />}>Product Identity</SectionHeading>
          <div>
            <Field label="Brand" required>
              <Select value={form.brandId} onChange={(v) => set('brandId', v)} options={brandOptions} placeholder="Select Brand..." invalid={!!errors.brandId} />
            </Field>
            <FieldError>{errors.brandId}</FieldError>
          </div>
          <Field label="Product Name" required error={errors.name}>
            <Input value={form.name} invalid={!!errors.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Emerald Urethane Trim Enamel" />
          </Field>
        </div>

        {/* Finish & type */}
        <div>
          <SectionHeading icon={<PaintBucket />}>Finish &amp; Type</SectionHeading>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Field label="Category" required>
                <Select value={form.category} onChange={(v) => set('category', v)} options={PAINT_CATEGORIES.map((c) => ({ label: c, value: c }))} placeholder="Select Category..." invalid={!!errors.category} />
              </Field>
              <FieldError>{errors.category}</FieldError>
            </div>
            <div>
              <Field label="Sheen / Finish" required>
                <Select value={form.finish} onChange={(v) => set('finish', v)} options={PAINT_FINISHES.map((c) => ({ label: c, value: c }))} placeholder="Select Sheen..." invalid={!!errors.finish} />
              </Field>
              <FieldError>{errors.finish}</FieldError>
            </div>
          </div>
        </div>

        {/* Coverage & pricing */}
        <div className="space-y-3">
          <SectionHeading
            icon={<Droplets />}
            right={
              <span className="flex items-center gap-2">
                <Wand2 className={cn('h-3 w-3', multOn ? 'text-indigo-600' : 'text-gray-500')} />
                <span className="text-xs font-medium text-gray-600">Multipliers</span>
                <Switch checked={multOn} onChange={setMultOn} label="Use multipliers" />
              </span>
            }
          >
            Coverage &amp; Pricing
          </SectionHeading>
          <div className="rounded-xl border border-gray-200 p-3">
            <div className="mb-2 text-xxs font-bold uppercase tracking-wider text-gray-500">Smooth</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label required>Coat 1 (Base)</Label>
                <Input type="number" min={0} value={form.coverageCoat1 || ''} invalid={!!errors.coverageCoat1} onChange={(e) => set('coverageCoat1', num(e.target.value))} placeholder="350" />
              </div>
              {multOn ? (
                <div>
                  <Label>Coat 2 Mult.</Label>
                  <Input type="number" step={0.05} value={mult} onChange={(e) => setMult(num(e.target.value, 1))} />
                  <div className="mt-1 text-xs font-bold text-indigo-700">= {Math.round(form.coverageCoat1 * mult)}</div>
                </div>
              ) : (
                <div>
                  <Label>Coat 2</Label>
                  <Input type="number" min={0} value={coat2} onChange={(e) => setCoat2(e.target.value)} placeholder="Optional" />
                </div>
              )}
            </div>
            <FieldError>{errors.coverageCoat1}</FieldError>
          </div>
          <p className="text-xs text-gray-500">Enter sqft per gallon for each coat. Leave blank to use base coverage for subsequent coats.</p>

          <div>
            <Label required>Available Sizes &amp; Prices</Label>
            <div className="space-y-2">
              {[
                { label: '1 Gallon', value: form.pricePerGallon || '', onChange: (v: string) => set('pricePerGallon', num(v)), invalid: !!errors.pricePerGallon, badge: 'Default' },
                { label: '5 Gallon', value: form.pricePer5Gallon ?? '', onChange: (v: string) => set('pricePer5Gallon', v === '' ? undefined : num(v)), invalid: false },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <span className="flex-1 text-sm font-medium text-gray-700">
                    {row.label}
                    {row.badge && <span className="ml-2 rounded border border-primary-200 bg-primary-100 px-1.5 py-0.5 text-xs text-primary-600">{row.badge}</span>}
                  </span>
                  <div className="w-32">
                    <Input type="number" min={0} step="0.01" value={row.value} invalid={row.invalid} onChange={(e) => row.onChange(e.target.value)} leftIcon={<span className="text-xs font-bold">$</span>} placeholder="0.00" />
                  </div>
                </div>
              ))}
            </div>
            <FieldError>{errors.pricePerGallon}</FieldError>
          </div>
        </div>

        {/* Colors */}
        <div>
          <SectionHeading>Colors</SectionHeading>
          <div className="space-y-2">
            {(form.colors ?? []).map((c, i) => (
              <div key={`${c.name}-${i}`} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                <span className="h-6 w-6 shrink-0 rounded-md border border-gray-200" style={{ backgroundColor: c.hex }} />
                <span className="flex-1 text-sm font-semibold text-gray-800">{c.name}</span>
                <span className="text-xs text-gray-500">{c.code}</span>
                <button type="button" className="rounded p-1 text-gray-500 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${c.name}`} onClick={() => set('colors', (form.colors ?? []).filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {(form.colors ?? []).length === 0 && <p className="text-xs italic text-gray-500">No colors added yet.</p>}
            <div className="flex items-center gap-2">
              <input type="color" value={newColor.hex} onChange={(e) => setNewColor({ ...newColor, hex: e.target.value })} className="h-10 w-10 shrink-0 cursor-pointer rounded-lg border border-gray-200 bg-white p-1" aria-label="Color swatch" />
              <div className="flex-1"><Input value={newColor.name} onChange={(e) => setNewColor({ ...newColor, name: e.target.value })} placeholder="Color name" onKeyDown={(e) => e.key === 'Enter' && addColor()} /></div>
              <div className="w-28"><Input value={newColor.code} onChange={(e) => setNewColor({ ...newColor, code: e.target.value })} placeholder="Code" onKeyDown={(e) => e.key === 'Enter' && addColor()} /></div>
              <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={addColor} disabled={!newColor.name.trim()}>Add</Button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-gray-800">Active</div>
            <div className="text-xs text-gray-500">Inactive products are hidden when building estimates.</div>
          </div>
          <Switch checked={form.isActive} onChange={(v) => set('isActive', v)} label="Active" />
        </div>

        <FormActions onCancel={() => onOpenChange(false)} submitLabel={paint ? 'Save Changes' : 'Add Product'} onSubmit={submit} />
      </div>
    </Modal>
  );
}
