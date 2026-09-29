'use client';

/*
  Settings > Surface Rates.
  Labor production rates (units painted per hour) for each surface,
  grouped by category ("Interior Walls", "Trim & Molding"...). Each group
  is a card with a table: Item Name, Unit, Base Rate (1st coat), Actions.

  Groups live in the `rateGroups` collection so empty groups persist.
  A surface rate links to its group by name (SurfaceRate.rateGroup), so
  renaming a group also renames it on every rate in that group.

  NEW (feature 30): below the groups, the rate versions that Estimating
  Feedback maintains (features/components/features/settings/rate-versions-section.tsx).
*/
import { useEffect, useMemo, useState } from 'react';
import { Edit2, Plus, Trash2, Wand2 } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { Field, Input, Label, Select, Switch } from '@/components/ui/form';
import { RowMenu } from '@/components/ui/menu';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog, Modal } from '@/components/Modals/Modal';
import { useCollection } from '@/lib/store';
import type { RateGroup, SurfaceRate } from '@/lib/types';
import { cn } from '@/lib/utils';
import { round2 } from '@/lib/calculations';
import { hoursPer100, unitsPerHourFromHours } from '@/lib/estimating';
import { RateVersionsSection } from '@/features/components/features/settings/rate-versions-section';
import { CardKebab, FieldError, LibraryToolbar, NoMatches, UNIT_LABELS, nextSort, num } from './ui';

const SORTS = [
  { label: 'Sort by Name (A-Z)', value: 'name' },
  { label: 'Sort by Unit Type', value: 'unitType' },
  { label: 'Sort by Category', value: 'category' },
];

const UNIT_OPTIONS = [
  { label: 'SqFt', value: 'sqft' },
  { label: 'LnFt', value: 'lnft' },
  { label: 'Item', value: 'each' },
];

export const FORMULA_OPTIONS = [
  { label: 'L × H — single wall', value: 'LENGTH_X_HEIGHT' },
  { label: 'L × W — ceiling, floor', value: 'LENGTH_X_WIDTH' },
  { label: '2(L+W) × H — all walls in a room', value: 'PERIMETER_X_HEIGHT' },
  { label: '2(L+W) — baseboard, crown molding', value: 'PERIMETER' },
  { label: 'L — single linear element (trim)', value: 'LENGTH' },
  { label: 'No auto-calculation (manual entry)', value: 'NONE' },
];

export function SurfaceRatesView() {
  const rates = useCollection('surfaceRates');
  const groups = useCollection('rateGroups');
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');

  // Rate modal state
  const [rateOpen, setRateOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<SurfaceRate | null>(null);
  const [defaultGroup, setDefaultGroup] = useState<string | undefined>();
  const [deletingRate, setDeletingRate] = useState<SurfaceRate | null>(null);
  // Group modal state
  const [groupOpen, setGroupOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<RateGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<RateGroup | null>(null);

  // Any rate whose group name has no matching group record shows under that name too.
  const allGroups = useMemo(() => {
    const list = [...groups.items].sort((a, b) => a.sortOrder - b.sortOrder);
    const names = new Set(list.map((g) => g.name));
    rates.items.forEach((r) => {
      const name = r.rateGroup || 'Ungrouped';
      if (!names.has(name)) {
        names.add(name);
        list.push({ id: `orphan_${name}`, name, sortOrder: 999 });
      }
    });
    return list;
  }, [groups.items, rates.items]);

  const itemsFor = (group: RateGroup) => {
    const q = search.trim().toLowerCase();
    const list = rates.items.filter((r) => (r.rateGroup || 'Ungrouped') === group.name && r.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => (sort === 'unitType' ? a.unit.localeCompare(b.unit) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)));
  };

  const orderedGroups = sort === 'category' ? [...allGroups].sort((a, b) => a.name.localeCompare(b.name)) : allGroups;
  const hasResults = orderedGroups.some((g) => itemsFor(g).length > 0);

  const openAddRate = (groupName?: string) => {
    setEditingRate(null);
    setDefaultGroup(groupName);
    setRateOpen(true);
  };

  const saveGroup = (name: string) => {
    const clash = allGroups.find((g) => g.name.toLowerCase() === name.toLowerCase() && g.id !== editingGroup?.id);
    if (clash) return 'A group with this name already exists';
    if (editingGroup) {
      const old = editingGroup.name;
      if (editingGroup.id.startsWith('orphan_')) groups.add({ name, sortOrder: nextSort(groups.items) });
      else groups.update(editingGroup.id, { name });
      rates.items.filter((r) => r.rateGroup === old).forEach((r) => rates.update(r.id, { rateGroup: name }));
      toast('Group updated successfully');
    } else {
      groups.add({ name, sortOrder: nextSort(groups.items) });
      toast('Group created successfully');
    }
    setGroupOpen(false);
    return undefined;
  };

  return (
    <SettingsPage
      title="Surface Rates"
      subtitle="Define your labor efficiency organized by category."
      actions={
        <>
          <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => { setEditingGroup(null); setGroupOpen(true); }}>Add Group</Button>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => openAddRate()}>Add Surface Rate</Button>
        </>
      }
    >
      <LibraryToolbar search={search} onSearch={setSearch} placeholder="Search surface rates..." sort={sort} onSort={setSort} sortOptions={SORTS} />

      {allGroups.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center">
          <Plus className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <h3 className="mb-2 text-lg font-semibold text-gray-900">No Surface Rates Yet</h3>
          <p className="mb-6 text-gray-500">Start by adding a group to organize your surface rates.</p>
          <div className="flex justify-center gap-3">
            <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => { setEditingGroup(null); setGroupOpen(true); }}>Add Group</Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => openAddRate()}>Add Surface Rate</Button>
          </div>
        </div>
      ) : search && !hasResults ? (
        <NoMatches>No surface rates found matching &quot;{search}&quot;.</NoMatches>
      ) : (
        <div className="space-y-7">
          {orderedGroups.map((group) => {
            const list = itemsFor(group);
            if (search && list.length === 0) return null;
            return (
              <section key={group.id} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg shadow-gray-200/70">
                <div className="flex items-center justify-between gap-4 border-b border-gray-100 bg-gray-50/50 px-6 py-4">
                  <h3 className="font-heading text-base font-bold text-gray-900">{group.name}</h3>
                  <div className="flex items-center gap-2">
                    <Button size="xs" variant="secondary" icon={<Plus className="h-3 w-3" />} className="text-xs" onClick={() => openAddRate(group.name)}>Add Item</Button>
                    <RowMenu
                      items={[
                        { label: 'Edit Group', icon: <Edit2 />, onClick: () => { setEditingGroup(group); setGroupOpen(true); } },
                        { label: 'Delete Group', icon: <Trash2 />, danger: true, onClick: () => setDeletingGroup(group) },
                      ]}
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px]">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xxs font-bold uppercase tracking-wider text-gray-500">
                        <th className="w-1/3 px-6 py-3">Item Name</th>
                        <th className="px-6 py-3">Unit</th>
                        <th className="px-6 py-3">Base Rate (1st Coat)</th>
                        <th className="px-6 py-3">Coats 2 / 3 / 4</th>
                        <th className="px-6 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {list.map((r) => (
                        <tr key={r.id} className="transition-colors hover:bg-primary-50/20">
                          <td className="px-6 py-4 text-sm font-bold text-gray-900">
                            {r.name}
                            {r.feedback && (
                              <span
                                className="mt-1 block w-fit rounded-md bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700"
                                title={`Coat 1 was ${r.feedback.previous.rateCoat1}/hr before ${r.feedback.rateId} v${r.feedback.version}`}
                              >
                                Updated from feedback {new Date(r.feedback.at).toLocaleDateString()} ({r.feedback.pct >= 0 ? '+' : ''}{r.feedback.pct}%)
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className="rounded-md border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-600">{UNIT_LABELS[r.unit] ?? r.unit}</span>
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">
                            {r.rateCoat1 || 0} <span className="text-xs text-gray-400">/hr</span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-700" title="A blank coat uses the nearest earlier coat's rate">
                            {[r.rateCoat2, r.rateCoat3, r.rateCoat4].map((v, i) => (
                              <span key={i}>
                                {i > 0 && <span className="text-gray-300"> / </span>}
                                {v ? v : <span className="text-xs italic text-gray-400">= coat {coatRateSource([r.rateCoat1, r.rateCoat2, r.rateCoat3, r.rateCoat4], i + 2)}</span>}
                              </span>
                            ))}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <CardKebab onEdit={() => { setEditingRate(r); setRateOpen(true); }} onDelete={() => setDeletingRate(r)} />
                          </td>
                        </tr>
                      ))}
                      {list.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-8 text-center text-sm italic text-gray-400">No surface rates found in this group.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <RateVersionsSection />

      <SurfaceRateModal
        open={rateOpen}
        onOpenChange={setRateOpen}
        rate={editingRate}
        groupNames={allGroups.map((g) => g.name)}
        defaultGroup={defaultGroup}
        onSave={(data) => {
          if (editingRate) {
            // A rate changed by hand is no longer the feedback value, so its label goes.
            const byHand = (['rateCoat1', 'rateCoat2', 'rateCoat3', 'rateCoat4'] as const).some((k) => data[k] !== editingRate[k]);
            rates.update(editingRate.id, byHand ? { ...data, feedback: undefined } : data);
            toast('Surface rate updated successfully');
          } else {
            rates.add({ ...data, sortOrder: nextSort(rates.items) });
            toast('Surface rate created successfully');
          }
          setRateOpen(false);
        }}
        onDelete={editingRate ? () => { setRateOpen(false); setDeletingRate(editingRate); } : undefined}
      />
      <GroupModal open={groupOpen} onOpenChange={setGroupOpen} group={editingGroup} onSave={saveGroup} />

      <ConfirmDialog
        open={!!deletingRate}
        onOpenChange={(o) => !o && setDeletingRate(null)}
        title="Delete Surface Rate"
        message={`Are you sure you want to delete "${deletingRate?.name}"? This action cannot be undone.`}
        onConfirm={() => {
          if (deletingRate) rates.remove(deletingRate.id);
          toast('Surface rate deleted successfully');
        }}
      />
      <ConfirmDialog
        open={!!deletingGroup}
        onOpenChange={(o) => !o && setDeletingGroup(null)}
        title="Delete Group"
        message={`Are you sure you want to delete "${deletingGroup?.name}"? All surface rates in this group will also be deleted. This action cannot be undone.`}
        onConfirm={() => {
          if (!deletingGroup) return;
          rates.items.filter((r) => (r.rateGroup || 'Ungrouped') === deletingGroup.name).forEach((r) => rates.remove(r.id));
          if (!deletingGroup.id.startsWith('orphan_')) groups.remove(deletingGroup.id);
          toast('Group deleted successfully');
        }}
      />
    </SettingsPage>
  );
}

/* ---------- Group modal ---------- */

function GroupModal({ open, onOpenChange, group, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; group: RateGroup | null; onSave: (name: string) => string | undefined }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) { setName(group?.name ?? ''); setError(''); }
  }, [open, group]);
  const submit = () => {
    if (!name.trim()) return setError('Category name is required');
    const err = onSave(name.trim());
    if (err) setError(err);
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={group ? 'Edit Group' : 'Add Group'} size="md">
      <div className="space-y-5">
        <Field label="Category Name" required error={error}>
          <Input value={name} invalid={!!error} onChange={(e) => { setName(e.target.value); setError(''); }} placeholder="e.g. Metal Surfaces" onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </Field>
        <Button className="w-full justify-center" onClick={submit}>{group ? 'Update Group' : 'Create Group'}</Button>
      </div>
    </Modal>
  );
}

/* ---------- Surface rate modal ---------- */

type RateForm = Omit<SurfaceRate, 'id' | 'sortOrder'>;

function SurfaceRateModal({
  open, onOpenChange, rate, groupNames, defaultGroup, onSave, onDelete,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rate: SurfaceRate | null;
  groupNames: string[];
  defaultGroup?: string;
  onSave: (d: RateForm) => void;
  onDelete?: () => void;
}) {
  // Coats 2-4 are optional in the form; empty means "same as the previous coat".
  const [form, setForm] = useState<RateForm>(blankRate(''));
  const [coats, setCoats] = useState<(string)[]>(['', '', '']);
  const [multOn, setMultOn] = useState(false);
  const [mult, setMult] = useState({ coat2: 1.25, coat3: 1.35, coat4: 1.5 });
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Patent 8: rates can be typed as units per hour or hours per 100 units; always stored as units per hour.
  const [entry, setEntry] = useState<'rate' | 'hours'>('rate');
  const [hoursText, setHoursText] = useState<string[]>(['', '', '', '']);

  useEffect(() => {
    if (!open) return;
    setEntry('rate');
    if (rate) {
      setForm({ ...rate, amountFormula: rate.amountFormula ?? 'LENGTH_X_HEIGHT' });
      setCoats([rate.rateCoat2, rate.rateCoat3, rate.rateCoat4].map((n) => (n ? String(n) : '')));
    } else {
      setForm(blankRate(defaultGroup ?? groupNames[0] ?? ''));
      setCoats(['', '', '']);
    }
    setMultOn(false);
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rate]);

  const unit = UNIT_LABELS[form.unit] ?? 'SqFt';

  const applyMult = (base: number, m = mult) => {
    setForm((f) => ({ ...f, rateCoat1: base }));
    setCoats([m.coat2, m.coat3, m.coat4].map((x) => String(Math.round(base * x))));
  };

  const switchEntry = (next: 'rate' | 'hours') => {
    if (next === 'hours') setHoursText([form.rateCoat1, ...coats.map((c) => num(c, 0))].map((r) => (r > 0 ? String(hoursPer100(r)) : '')));
    setEntry(next);
  };
  const setHours = (i: number, text: string) => {
    setHoursText((h) => h.map((x, j) => (j === i ? text : x)));
    const r = unitsPerHourFromHours(num(text, 0));
    if (i === 0) setForm((f) => ({ ...f, rateCoat1: r }));
    else setCoats((c) => c.map((x, j) => (j === i - 1 ? (r ? String(r) : '') : x)));
  };

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.rateGroup) e.rateGroup = 'Rate group is required';
    if (!(form.defaultCoats >= 1 && form.defaultCoats <= 4)) e.defaultCoats = 'Default coats must be between 1 and 4';
    if (!(form.rateCoat1 > 0)) e.rateCoat1 = 'Rate must be greater than 0';
    if ((form.coverageOverrides ?? []).some((o) => !(o.coverageCoat1 > 0) || (o.coverageCoat2 !== undefined && !(o.coverageCoat2 > 0)))) e.coverage = 'Enter a coverage above 0 sq ft per gallon, or remove the product';
    setErrors(e);
    if (Object.keys(e).length) return;
    // A blank coat stays 0: estimates then use the nearest earlier coat's rate (lib/estimating.ts coatRate).
    const [c2, c3, c4] = coats.map((c) => num(c!, 0));
    onSave({ ...form, name: form.name.trim(), rateCoat2: c2!, rateCoat3: c3!, rateCoat4: c4!, useMultipliers: form.useMultipliers });
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={rate ? 'Edit Surface Rate' : 'Add Surface Rate'} size="lg">
      <div className="space-y-5">
        <Field label="Surface Rate Name" required error={errors.name}>
          <Input value={form.name} invalid={!!errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Enter name..." />
        </Field>
        <div>
          <Field label="Category" required>
            <Select value={form.rateGroup} onChange={(v) => setForm({ ...form, rateGroup: v })} options={groupNames.map((g) => ({ label: g, value: g }))} placeholder="Select a category..." invalid={!!errors.rateGroup} />
          </Field>
          <FieldError>{errors.rateGroup}</FieldError>
        </div>
        <Field label="Formula" required>
          <Select value={form.amountFormula} onChange={(v) => setForm({ ...form, amountFormula: v })} options={FORMULA_OPTIONS} placeholder="Select a formula..." />
        </Field>
        <div className="grid grid-cols-2 gap-5">
          <Field label="Unit Type" required>
            <Select value={form.unit} onChange={(v) => setForm({ ...form, unit: v as SurfaceRate['unit'] })} options={UNIT_OPTIONS} />
          </Field>
          <Field label="Default Coats" required error={errors.defaultCoats}>
            <Input type="number" min={1} max={4} value={form.defaultCoats} onChange={(e) => setForm({ ...form, defaultCoats: parseInt(e.target.value) || 2 })} />
          </Field>
        </div>

        <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xxs font-bold uppercase tracking-widest text-gray-500">Production Rates ({entry === 'hours' ? `labor hours per 100 ${unit}` : `${unit} per labor hour`})</span>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {!multOn && (
                <div role="radiogroup" aria-label="Enter rates as" className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs font-bold">
                  {([['rate', `${unit} / hr`], ['hours', `Hrs / 100 ${unit}`]] as const).map(([v, label]) => (
                    <button key={v} type="button" role="radio" aria-checked={entry === v} onClick={() => switchEntry(v)} className={cn('rounded-md px-2 py-1', entry === v ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50')}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
              <Wand2 className={cn('h-3 w-3', multOn ? 'text-indigo-600' : 'text-gray-400')} />
              <span className={cn('text-xxs font-bold uppercase tracking-wider', multOn ? 'text-indigo-600' : 'text-gray-400')}>Multiplier</span>
              <Switch
                checked={multOn}
                label="Use multipliers"
                onChange={(v) => {
                  setMultOn(v);
                  setForm((f) => ({ ...f, useMultipliers: v }));
                  if (v) {
                    setEntry('rate');
                    applyMult(form.rateCoat1);
                  }
                }}
              />
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            {entry === 'hours' ? <>How many labor hours 100 {unit} takes. Saved as {unit} per hour.</> : <>How many {unit} one painter covers in an hour.</>}
            {form.rateCoat1 > 0 && (entry === 'hours'
              ? <> {hoursText[0]} hrs per 100 {unit} is {form.rateCoat1} {unit}/hr for the 1st coat.</>
              : <> At {form.rateCoat1} {unit}/hr, the 1st coat takes {round2(100 / form.rateCoat1)} hrs per 100 {unit}.</>)}
          </p>

          {multOn ? (
            <div className="space-y-4 rounded-xl border border-indigo-100 bg-indigo-50 p-3">
              <Field label="Coat 1 (Base Rate)">
                <Input type="number" min={0} value={form.rateCoat1} onChange={(e) => applyMult(num(e.target.value))} />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                {(['coat2', 'coat3', 'coat4'] as const).map((k, i) => (
                  <div key={k}>
                    <Label>{`Coat ${i + 2}${i === 2 ? '+' : ''} Mult.`}</Label>
                    <Input
                      type="number"
                      step={0.05}
                      value={mult[k]}
                      onChange={(e) => {
                        const next = { ...mult, [k]: num(e.target.value, 1) };
                        setMult(next);
                        applyMult(form.rateCoat1, next);
                      }}
                    />
                    <div className="mt-1 text-xs font-bold text-indigo-700">= {Math.round(form.rateCoat1 * mult[k])}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : entry === 'hours' ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {['1st Coat', '2nd Coat', '3rd Coat', '4th Coat'].map((label, i) => {
                const r = i === 0 ? form.rateCoat1 : num(coats[i - 1] ?? '', 0);
                return (
                  <div key={label}>
                    <Label required={i === 0}>{label}</Label>
                    <Input type="number" min={0} step={0.05} value={hoursText[i]} invalid={i === 0 && !!errors.rateCoat1} onChange={(e) => setHours(i, e.target.value)} placeholder={i === 0 ? 'Required' : `Same as coat ${i}`} aria-label={`${label} hours per 100 ${unit}`} />
                    {r > 0 && <div className="mt-1 text-xs font-semibold text-gray-500">= {r} {unit}/hr</div>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <Label required>1st Coat</Label>
                <Input type="number" min={0} value={form.rateCoat1 || ''} invalid={!!errors.rateCoat1} onChange={(e) => setForm({ ...form, rateCoat1: num(e.target.value) })} onClear={() => setForm({ ...form, rateCoat1: 0 })} placeholder="Required" />
              </div>
              {['2nd Coat', '3rd Coat', '4th Coat'].map((label, i) => (
                <div key={label}>
                  <Label>{label}</Label>
                  <Input type="number" min={0} value={coats[i]} onChange={(e) => setCoats((c) => c.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Same as coat ${i + 1}`} aria-label={`${label} rate`} />
                </div>
              ))}
            </div>
          )}
          <FieldError>{errors.rateCoat1}</FieldError>
        </div>

        <CoverageOverrides
          rows={form.coverageOverrides ?? []}
          error={errors.coverage}
          onChange={(coverageOverrides) => setForm((f) => ({ ...f, coverageOverrides: coverageOverrides.length ? coverageOverrides : undefined }))}
        />

        <div className="flex gap-3 pt-1">
          {onDelete && (
            <Button variant="danger" className="px-4" onClick={onDelete} aria-label="Delete rate">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button className="flex-1 justify-center" onClick={submit}>Save Surface Rate</Button>
        </div>
      </div>
    </Modal>
  );
}

/** Patent 8: coverage for a particular product on this surface, ahead of the product's own coverage. */
function CoverageOverrides({ rows, error, onChange }: {
  rows: NonNullable<SurfaceRate['coverageOverrides']>;
  error?: string;
  onChange: (rows: NonNullable<SurfaceRate['coverageOverrides']>) => void;
}) {
  const paints = useCollection('paintProducts').items;
  const [pick, setPick] = useState('');
  const name = (id: string) => paints.find((p) => p.id === id)?.name ?? 'Removed product';
  const available = paints.filter((p) => !rows.some((r) => r.paintProductId === p.id));
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="text-xxs font-bold uppercase tracking-widest text-gray-500">Coverage for specific products (sq ft per gallon)</div>
      <p className="text-xs text-gray-500">Optional. When a line on this surface uses one of these products, this coverage is used instead of the product&apos;s own coverage in the Paint Library.</p>
      {rows.map((r, i) => {
        const paint = paints.find((p) => p.id === r.paintProductId);
        return (
          <div key={r.paintProductId} className="grid grid-cols-[minmax(0,1fr)_7rem_7rem_auto] items-end gap-2">
            <div className="min-w-0 truncate pb-2 text-sm font-semibold text-gray-800" title={name(r.paintProductId)}>{name(r.paintProductId)}</div>
            <div>
              <Label>1st coat</Label>
              <Input type="number" min={0} value={r.coverageCoat1 || ''} onChange={(e) => set(i, { coverageCoat1: num(e.target.value) })} placeholder={paint?.coverageCoat1 ? String(paint.coverageCoat1) : 'Required'} aria-label={`${name(r.paintProductId)} first coat coverage`} />
            </div>
            <div>
              <Label>Later coats</Label>
              <Input type="number" min={0} value={r.coverageCoat2 ?? ''} onChange={(e) => set(i, { coverageCoat2: e.target.value === '' ? undefined : num(e.target.value) })} placeholder="Same as 1st" aria-label={`${name(r.paintProductId)} later coat coverage`} />
            </div>
            <Button variant="ghost" className="mb-0.5 px-2" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={`Remove ${name(r.paintProductId)}`}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <div className="min-w-0 flex-1">
          <Select value={pick} onChange={setPick} options={available.map((p) => ({ label: p.name, value: p.id }))} placeholder="Add a product..." />
        </div>
        <Button
          variant="secondary"
          disabled={!pick}
          onClick={() => {
            const p = paints.find((x) => x.id === pick);
            onChange([...rows, { paintProductId: pick, coverageCoat1: p?.coverageCoat1 || 0 }]);
            setPick('');
          }}
        >
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}

/** Which coat's rate a blank coat falls back to (1-based). */
function coatRateSource(rates: number[], coat: number) {
  for (let i = coat - 2; i >= 0; i--) if (rates[i]! > 0) return i + 1;
  return 1;
}

function blankRate(group: string): RateForm {
  return {
    name: '', rateGroup: group, unit: 'sqft', defaultCoats: 2,
    rateCoat1: 150, rateCoat2: 0, rateCoat3: 0, rateCoat4: 0, useMultipliers: false, amountFormula: 'LENGTH_X_HEIGHT',
  };
}
