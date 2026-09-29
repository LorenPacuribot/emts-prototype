'use client';

/*
  Settings > Tax Regions. Cards with sales and service tax rates and the ZIP
  codes each region covers. Search matches region names and ZIP codes.
  Estimates pick a region by the customer's ZIP (or the default region).
  Rates are stored as percents (8.25); the form takes decimals like the live
  app (0.0825). A ZIP code can belong to one region only.
*/
import React, { useMemo, useState } from 'react';
import { Map as MapIcon, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/display';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/form';
import { RowMenu } from '@/components/ui/menu';
import { ConfirmDialog, Modal } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { useCollection } from '@/lib/store';
import type { TaxRegion } from '@/lib/types';

export function TaxRegionsView() {
  const { items, update, remove } = useCollection('taxRegions');
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<TaxRegion | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<TaxRegion | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...items].sort((a, b) => Number(!!b.isDefault) - Number(!!a.isDefault) || a.name.localeCompare(b.name));
    if (!q) return sorted;
    return sorted.filter((r) => r.name.toLowerCase().includes(q) || r.zipCodes.some((z) => z.includes(q)));
  }, [items, query]);

  const makeDefault = (r: TaxRegion) => {
    items.forEach((x) => x.isDefault && x.id !== r.id && update(x.id, { isDefault: false }));
    update(r.id, { isDefault: true });
    toast(`${r.name} is now the default region`);
  };

  return (
    <SettingsPage
      title="Tax Regions"
      subtitle="Manage sales and service tax rates by geographic region."
      actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Add Region</Button>}
    >
      <div className="mb-6">
        <SearchInput value={query} onChange={setQuery} placeholder="Search regions or zip codes..." />
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-400"><MapIcon className="h-5 w-5" /></div>
          <h3 className="font-heading text-base font-bold text-gray-900">No Tax Regions Found</h3>
          <p className="mt-1 text-sm text-gray-500">{query ? 'No regions match your search.' : 'Create regions to automate tax calculation based on location.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {list.map((r) => (
            <div key={r.id} className="relative flex h-full flex-col rounded-2xl bg-white p-6 shadow-lg transition-all hover:-translate-y-1 hover:shadow-xl">
              <div className="absolute right-4 top-4">
                <RowMenu
                  items={[
                    { label: 'Edit', icon: <Pencil />, onClick: () => setEditing(r) },
                    { label: 'Set as Default', icon: <Star />, disabled: !!r.isDefault, onClick: () => makeDefault(r) },
                    { label: 'Delete', icon: <Trash2 />, danger: true, onClick: () => setToDelete(r) },
                  ]}
                />
              </div>
              <div className="mb-5 flex flex-col gap-1 pr-10">
                <h3 className="flex items-center gap-2 break-words font-heading text-lg font-bold leading-tight text-gray-900">
                  {r.name}
                  {r.isDefault && <span className="rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-xxs font-black uppercase tracking-wider text-primary-700">Default</span>}
                </h3>
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">{r.zipCodes.length} Zip Codes</span>
              </div>
              <div className="mb-5 flex divide-x divide-gray-200 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                {[['Sales Tax', r.salesTaxRate], ['Service Tax', r.serviceTaxRate]].map(([l, v]) => (
                  <div key={l as string} className="flex-1 p-3 text-center">
                    <div className="mb-1 text-xxs font-bold uppercase tracking-wider text-gray-400">{l}</div>
                    <div className="text-lg font-extrabold text-gray-900">{(v as number).toFixed(2)}%</div>
                  </div>
                ))}
              </div>
              <div className="mt-auto">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400"><MapIcon className="h-3 w-3" /> Covered Zip Codes</div>
                <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                  {r.zipCodes.slice(0, 8).map((z) => (
                    <span key={z} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-bold text-gray-600 shadow-sm">{z}</span>
                  ))}
                  {r.zipCodes.length > 8 && <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-bold text-gray-500">+{r.zipCodes.length - 8}</span>}
                  {r.zipCodes.length === 0 && <span className="text-xs italic text-gray-400">No zip codes defined.</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <RegionFormModal region={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="Delete Tax Region"
        message={toDelete ? `Are you sure you want to delete "${toDelete.name}"? All assigned ZIP codes will be freed.` : ''}
        onConfirm={() => {
          if (!toDelete) return;
          remove(toDelete.id);
          toast('Tax region deleted successfully');
        }}
      />
    </SettingsPage>
  );
}

function RegionFormModal({ region, onClose }: { region?: TaxRegion; onClose: () => void }) {
  const { items, add, update } = useCollection('taxRegions');
  const { toast } = useToast();
  const [name, setName] = useState(region?.name ?? '');
  const [sales, setSales] = useState(region ? String(+(region.salesTaxRate / 100).toFixed(6)) : '');
  const [service, setService] = useState(region ? String(+(region.serviceTaxRate / 100).toFixed(6)) : '');
  const [zips, setZips] = useState(region?.zipCodes.join(', ') ?? '');
  const [isDefault, setIsDefault] = useState(!!region?.isDefault);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = () => {
    const e: Record<string, string> = {};
    const s = sales === '' ? 0 : parseFloat(sales);
    const sv = service === '' ? 0 : parseFloat(service);
    const zipList = Array.from(new Set(zips.split(/[\s,]+/).map((z) => z.trim()).filter(Boolean)));
    if (!name.trim()) e.name = 'Region name is required';
    if (!Number.isFinite(s) || s < 0 || s > 1) e.sales = 'Enter a decimal between 0 and 1 (0.0825 = 8.25%)';
    if (!Number.isFinite(sv) || sv < 0 || sv > 1) e.service = 'Enter a decimal between 0 and 1 (0.05 = 5%)';
    const bad = zipList.filter((z) => !/^\d{5}$/.test(z));
    if (bad.length) e.zips = `Invalid ZIP code: ${bad.slice(0, 3).join(', ')}`;
    else {
      const taken = zipList.map((z) => [z, items.find((r) => r.id !== region?.id && r.zipCodes.includes(z))] as const).filter(([, r]) => r);
      if (taken.length) e.zips = `${taken[0]![0]} is already assigned to ${taken[0]![1]!.name}`;
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    const data = { name: name.trim(), salesTaxRate: +(s * 100).toFixed(4), serviceTaxRate: +(sv * 100).toFixed(4), zipCodes: zipList, isDefault };
    if (isDefault) items.forEach((x) => x.isDefault && x.id !== region?.id && update(x.id, { isDefault: false }));
    if (region) update(region.id, data);
    else add(data);
    toast(`Tax region ${region ? 'updated' : 'created'} successfully`);
    onClose();
  };

  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={region ? 'Edit Tax Region' : 'Add Tax Region'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>{region ? 'Save Changes' : 'Create Region'}</Button></>}
    >
      <div className="space-y-4">
        <Field label="Region Name" required error={errors.name}>
          <Input value={name} placeholder="e.g. Los Angeles County" invalid={!!errors.name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Sales Tax Rate" error={errors.sales} hint={sales && !errors.sales ? `${(parseFloat(sales) * 100 || 0).toFixed(2)}%` : 'Decimal, e.g. 0.0825'}>
            <Input type="number" step="0.0001" min="0" max="1" value={sales} placeholder="0.0825" invalid={!!errors.sales} onChange={(e) => setSales(e.target.value)} />
          </Field>
          <Field label="Service Tax Rate" error={errors.service} hint={service && !errors.service ? `${(parseFloat(service) * 100 || 0).toFixed(2)}%` : 'Decimal, e.g. 0.05'}>
            <Input type="number" step="0.0001" min="0" max="1" value={service} placeholder="0.05" invalid={!!errors.service} onChange={(e) => setService(e.target.value)} />
          </Field>
        </div>
        <Field label="Zip Codes (Comma Separated)" error={errors.zips}>
          <Textarea rows={3} value={zips} placeholder="10001, 10002, 10003..." invalid={!!errors.zips} onChange={(e) => setZips(e.target.value)} />
        </Field>
        <Checkbox checked={isDefault} onChange={setIsDefault} label="Use as default region when a ZIP code has no match" />
      </div>
    </Modal>
  );
}
