'use client';

/*
  "Start New Estimate" flow, used in the modal on /estimates and on the
  /estimates/new page.

  Steps (same order as the live CreateEstimateModal, with a client step first):
    1. Client   - pick a lead, an existing contact, or add a quick new contact
    2. Type     - Interior / Exterior / Cabinets (Settings > Estimate Types)
    3. Template - blank or a template from Settings > Estimate Templates; "Create"
    4. Details  - property (the saved address fills in), project name, estimate
                  type, estimator (defaults to you), estimate date, expiration
                  date and notes; "Save" or "Save & Continue" (patent 2)

  The template pre-fills areas (from Area Templates), default paint, terms,
  profit margin and extra line items. The estimate is saved as a Draft;
  "Save & Continue" opens the builder.
*/
import React, { useMemo, useState } from 'react';
import { ArrowLeft, Box, Building2, Home, LayoutTemplate, Mail, MapPin, Phone, Search, Sun, User, UserPlus, Users } from 'lucide-react';
import type { Customer, Estimate, EstimateArea, EstimateLineItem, Lead } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/form';
import { Tabs } from '@/components/ui/display';
import { useToast } from '@/components/ui/toast';
import { useCollection, useCurrentUser, useDb, useLogActivity, useNextNumber, useSingleton } from '@/lib/store';
import { estimateTotals, round2 } from '@/lib/calculations';
import { cn, fullName, uid } from '@/lib/utils';
import { addDays, areaFromTemplate } from './estimate-utils';
import { pressable } from '@/lib/a11y';

type Step = 'client' | 'type' | 'template' | 'details';
type ClientPick = { kind: 'lead'; lead: Lead } | { kind: 'customer'; customer: Customer };

function iconFor(name: string) {
  const n = name.toLowerCase();
  if (n.includes('interior')) return Home;
  if (n.includes('exterior')) return Sun;
  if (n.includes('cabinet')) return Box;
  if (n.includes('commercial')) return Building2;
  return LayoutTemplate;
}

const addressOf = (p: { street: string; city: string; state: string }) => [p.street, p.city, p.state].filter(Boolean).join(', ');

/* ---------- Step 1: client ---------- */

function ClientStep({ onPick }: { onPick: (p: ClientPick) => void }) {
  const db = useDb();
  const customersCol = useCollection('customers');
  const { toast } = useToast();
  const [tab, setTab] = useState<'leads' | 'contacts' | 'new'>('leads');
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', street: '', city: '', state: '', zip: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const needle = q.trim().toLowerCase();
  const leads = useMemo(
    () =>
      db.collections.leads
        .filter((l) => !['Sold', 'Lost', 'Archived'].includes(l.status))
        .filter((l) => !needle || [fullName(l), addressOf(l), l.leadNumber, l.phone, l.email].join(' ').toLowerCase().includes(needle)),
    [db.collections.leads, needle],
  );
  const contacts = useMemo(
    () =>
      db.collections.customers.filter(
        (c) => !needle || [fullName(c), c.companyName ?? '', addressOf(c), c.phone, c.email].join(' ').toLowerCase().includes(needle),
      ),
    [db.collections.customers, needle],
  );

  const createContact = () => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = 'First name is required';
    if (!form.lastName.trim()) e.lastName = 'Last name is required';
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email';
    if (!form.street.trim()) e.street = 'Street is required';
    setErrors(e);
    if (Object.keys(e).length) return;
    const c = customersCol.add(
      { ...form, type: 'Contact', source: 'Other', createdAt: new Date().toISOString() } as Omit<Customer, 'id'>,
      { atStart: true },
    );
    toast('Contact created');
    onPick({ kind: 'customer', customer: c });
  };

  const card = 'cursor-pointer rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-primary-400 hover:shadow-md group';

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-500">Pick the lead or contact this estimate is for. Their saved property address fills in automatically.</p>
      <Tabs
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
        tabs={[
          { value: 'leads', label: <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />Leads</span> },
          { value: 'contacts', label: <span className="flex items-center gap-1.5"><User className="h-4 w-4" />Contacts</span> },
          { value: 'new', label: <span className="flex items-center gap-1.5"><UserPlus className="h-4 w-4" />New Contact</span> },
        ]}
      />
      {tab !== 'new' && (
        <Input
          leftIcon={<Search className="h-4 w-4" />}
          placeholder={tab === 'leads' ? 'Search by name, address, phone, email, or lead number...' : 'Search by name, company, address, phone or email...'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onClear={() => setQ('')}
          autoFocus
        />
      )}

      {tab === 'leads' && (
        <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
          {leads.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">{q ? `No leads found matching "${q}".` : 'No open leads are ready for an estimate yet.'}</p>
          ) : (
            leads.map((l) => (
              <div {...pressable(true)} key={l.id} className={card} onClick={() => onPick({ kind: 'lead', lead: l })}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h4 className="text-lg font-bold text-gray-900 group-hover:text-primary-700">{fullName(l)}</h4>
                  <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-xxs font-bold uppercase text-blue-700">{l.leadNumber}</span>
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xxs font-bold uppercase text-gray-500">{l.status}</span>
                </div>
                <div className="space-y-1.5 text-sm text-gray-600">
                  <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 shrink-0 text-gray-500" /><span className="truncate">{addressOf(l)}</span></div>
                  <div className="flex flex-wrap justify-between gap-4">
                    {l.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-gray-500" />{l.email}</div>}
                    {l.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gray-500" />{l.phone}</div>}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'contacts' && (
        <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
          {contacts.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">No contacts found matching &quot;{q}&quot;.</p>
          ) : (
            contacts.map((c) => (
              <div {...pressable(true)} key={c.id} className={card} onClick={() => onPick({ kind: 'customer', customer: c })}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h4 className="text-lg font-bold text-gray-900 group-hover:text-primary-700">{fullName(c)}</h4>
                  {c.companyName && <span className="text-sm text-gray-500">{c.companyName}</span>}
                  <span className="rounded-full border border-purple-100 bg-purple-50 px-2 py-0.5 text-xxs font-bold uppercase text-purple-700">{c.type}</span>
                </div>
                <div className="space-y-1.5 text-sm text-gray-600">
                  <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 shrink-0 text-gray-500" /><span className="truncate">{addressOf(c)}</span></div>
                  <div className="flex flex-wrap justify-between gap-4">
                    {c.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-gray-500" />{c.email}</div>}
                    {c.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gray-500" />{c.phone}</div>}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'new' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" required error={errors.firstName}>
              <Input value={form.firstName} invalid={!!errors.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </Field>
            <Field label="Last Name" required error={errors.lastName}>
              <Input value={form.lastName} invalid={!!errors.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </Field>
            <Field label="Email" error={errors.email}>
              <Input type="email" value={form.email} invalid={!!errors.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
          </div>
          <Field label="Street" required error={errors.street}>
            <Input value={form.street} invalid={!!errors.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
          </Field>
          <div className="grid grid-cols-3 gap-4">
            <Field label="City"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="State"><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></Field>
            <Field label="Zip"><Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} /></Field>
          </div>
          <div className="flex justify-end">
            <Button onClick={createContact} icon={<UserPlus className="h-4 w-4" />}>Create Contact &amp; Continue</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Wizard ---------- */

/** A property the estimate can be for: the primary address, a saved service location, or the lead's address. */
interface PropertyOption { key: string; label: string; address: string; zip: string; serviceLocationId?: string }

function propertyOptions(pick: ClientPick, customers: Customer[]): PropertyOption[] {
  const customer = pick.kind === 'customer' ? pick.customer : customers.find((c) => c.id === pick.lead.customerId);
  const out: PropertyOption[] = [];
  const add = (o: PropertyOption) => {
    if (!o.address || out.some((x) => x.address.toLowerCase() === o.address.toLowerCase())) return;
    out.push(o);
  };
  if (pick.kind === 'lead') add({ key: 'lead', label: `Lead address (${pick.lead.leadNumber})`, address: addressOf(pick.lead), zip: pick.lead.zip });
  if (customer) {
    add({ key: 'primary', label: 'Primary address', address: addressOf(customer), zip: customer.zip });
    for (const l of customer.serviceLocations ?? []) {
      add({ key: l.id, label: l.label || 'Service location', address: addressOf({ street: [l.street, l.unit].filter(Boolean).join(' '), city: l.city, state: l.state }), zip: l.zip, serviceLocationId: l.id });
    }
  }
  return out;
}

const dayInput = (iso: string) => iso.slice(0, 10);
const fromDayInput = (d: string) => new Date(`${d}T12:00:00`).toISOString();

export function CreateEstimateWizard({
  initialLeadId, initialCustomerId, initialLocationId, onCreated, onSaved, onCancel,
}: {
  initialLeadId?: string;
  initialCustomerId?: string;
  /** Pre-selects a saved service location of the customer. */
  initialLocationId?: string;
  /** "Save & Continue": open the builder. */
  onCreated: (id: string) => void;
  /** "Save": stay where you are (defaults to onCreated). */
  onSaved?: (id: string) => void;
  onCancel?: () => void;
}) {
  const db = useDb();
  const c = db.collections;
  const estimatesCol = useCollection('estimates');
  const customersCol = useCollection('customers');
  const leadsCol = useCollection('leads');
  const nextNumber = useNextNumber();
  const log = useLogActivity();
  const user = useCurrentUser();
  const [goals] = useSingleton('goalsProfit');
  const { toast } = useToast();

  const initialPick: ClientPick | null = (() => {
    const l = c.leads.find((x) => x.id === initialLeadId);
    if (l) return { kind: 'lead', lead: l };
    const cu = c.customers.find((x) => x.id === initialCustomerId);
    if (cu) return { kind: 'customer', customer: cu };
    return null;
  })();

  const [pick, setPick] = useState<ClientPick | null>(initialPick);
  const [step, setStep] = useState<Step>(initialPick ? 'type' : 'client');
  const [typeId, setTypeId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [details, setDetails] = useState<{ propertyKey: string; title: string; estimatorId: string; date: string; validUntil: string; notes: string }>({
    propertyKey: '', title: '', estimatorId: user.id, date: '', validUntil: '', notes: '',
  });
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});

  const types = [...c.estimateTypes].sort((a, b) => a.sortOrder - b.sortOrder);
  const type = types.find((t) => t.id === typeId);
  const templates = c.estimateTemplates.filter((t) => t.estimateTypeId === typeId);
  const properties = pick ? propertyOptions(pick, c.customers) : [];

  /** "Create" on the template step: fill in the details, then Save or Save & Continue. */
  const openDetails = () => {
    if (!type || !templateId) return;
    const tpl = c.estimateTemplates.find((t) => t.id === templateId);
    const now = new Date().toISOString();
    const preferred = properties.find((p) => p.serviceLocationId && p.serviceLocationId === initialLocationId) ?? properties[0];
    setDetails({
      propertyKey: preferred?.key ?? '',
      title: tpl?.name ?? `${type.name} Estimate`,
      estimatorId: user.id,
      date: dayInput(now),
      validUntil: dayInput(addDays(now, 30)),
      notes: '',
    });
    setDetailErrors({});
    setStep('details');
  };

  const create = (continueToBuilder: boolean) => {
    if (!pick || !type || !templateId) return;
    const e: Record<string, string> = {};
    if (!details.title.trim()) e.title = 'Enter a project name';
    if (!details.date) e.date = 'Choose the estimate date';
    if (!details.validUntil) e.validUntil = 'Choose the expiration date';
    else if (details.date && details.validUntil < details.date) e.validUntil = 'The expiration date is before the estimate date';
    setDetailErrors(e);
    if (Object.keys(e).length) return;
    const now = new Date().toISOString();

    // Resolve the customer (a lead without a contact gets one created).
    let customer: Customer;
    let lead: Lead | undefined;
    if (pick.kind === 'lead') {
      lead = pick.lead;
      const existing = c.customers.find((x) => x.id === lead!.customerId);
      if (existing) customer = existing;
      else {
        customer = customersCol.add({
          firstName: lead.firstName, lastName: lead.lastName, companyName: lead.companyName, email: lead.email, phone: lead.phone,
          street: lead.street, city: lead.city, state: lead.state, zip: lead.zip, type: 'Contact', source: lead.leadSource, createdAt: now,
        });
        leadsCol.update(lead.id, { customerId: customer.id });
      }
    } else customer = pick.customer;

    const tpl = c.estimateTemplates.find((t) => t.id === templateId);
    const margin = tpl?.profitMargin ?? goals.profitMargin ?? 20;
    const paint = c.paintProducts.find((p) => p.id === tpl?.defaultPaintProductId);
    const property = properties.find((p) => p.key === details.propertyKey) ?? properties[0];
    const zip = property?.zip || customer.zip;
    const tax =
      c.taxRegions.find((r) => r.zipCodes.includes(zip)) ?? c.taxRegions.find((r) => r.isDefault) ?? c.taxRegions[0];
    const areas: EstimateArea[] = [];
    const lines: EstimateLineItem[] = [];
    for (const atId of tpl?.areaTemplateIds ?? []) {
      const at = c.areaTemplates.find((a) => a.id === atId);
      if (!at) continue;
      const r = areaFromTemplate({ tpl: at, surfaceRates: c.surfaceRates, paint, laborRate: type.hourlyRate, profitMargin: margin, tiers: c.difficultyTiers, tableColumns: c.tableColumns, paints: c.paintProducts });
      areas.push(r.area);
      lines.push(...r.lines);
    }
    const extras = (tpl?.lineItemTemplateIds ?? [])
      .map((id) => c.lineItemTemplates.find((x) => x.id === id))
      .filter((x) => x && x.itemType === 'PRICED' && x.calculationType !== 'PERCENT')
      .map((x) => ({ id: uid('x'), name: x!.name, quantity: 1, unitPrice: round2(x!.defaultValue ?? 0) }));

    const number = nextNumber('ESTIMATE');
    const draft: Estimate = {
      // The number is the id, shared with the feature prototype (lib/bridge).
      id: number,
      estimateNumber: number,
      title: details.title.trim(),
      customerId: customer.id,
      leadId: lead?.id,
      estimateTemplateId: tpl?.id,
      estimateType: type.name,
      status: 'Draft',
      date: fromDayInput(details.date),
      validUntil: fromDayInput(details.validUntil),
      address: property?.address ?? addressOf(customer),
      serviceLocationId: property?.serviceLocationId,
      areas,
      lineItems: lines,
      extras,
      discountType: 'none',
      discountValue: 0,
      taxRegionId: tax?.id,
      taxRate: tax?.salesTaxRate ?? 0,
      profitMargin: margin,
      termsId: tpl?.termsId ?? c.termsConditions.find((t) => t.isDefault)?.id,
      notes: details.notes.trim(),
      internalNotes: '',
      createdBy: user.id,
      estimatorId: details.estimatorId || user.id,
      createdAt: now,
      updatedAt: now,
      signature: null,
      versions: [],
    };
    const total = estimateTotals(draft).total;
    draft.versions = [{ version: 1, date: now, total, status: 'Draft', changedBy: fullName(user), note: 'Estimate created' }];
    estimatesCol.add(draft, { atStart: true });
    if (lead) leadsCol.update(lead.id, { estimateId: draft.id, updatedAt: now });
    log(`${number} created for ${fullName(customer)}`, 'estimate', draft.id);
    toast(`Estimate ${number} saved as a draft`);
    if (continueToBuilder) onCreated(draft.id);
    else (onSaved ?? onCreated)(draft.id);
  };

  const who = pick ? (pick.kind === 'lead' ? fullName(pick.lead) : fullName(pick.customer)) : '';
  const chip = (label: string, value: string, Icon: React.ComponentType<{ className?: string }>, onChange?: () => void) => (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm"><Icon className="h-5 w-5" /></div>
      <div className="flex-1">
        <div className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</div>
        <div className="font-bold text-gray-900">{value}</div>
      </div>
      {onChange && <button type="button" onClick={onChange} className="text-xs font-bold text-primary-600 hover:underline">Change</button>}
    </div>
  );

  return (
    <div className="space-y-6">
      {step === 'client' && (
        <ClientStep
          onPick={(p) => {
            setPick(p);
            setStep('type');
          }}
        />
      )}

      {step === 'type' && (
        <div>
          {pick && chip(pick.kind === 'lead' ? 'Lead' : 'Contact', who, User, () => setStep('client'))}
          <p className="mb-6 text-gray-500">Choose the type of project you are estimating to see relevant templates.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {types.map((t) => {
              const Icon = iconFor(t.name);
              const sel = typeId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTypeId(t.id);
                    setTemplateId(null);
                    setStep('template');
                  }}
                  className={cn(
                    'flex flex-col gap-4 rounded-2xl border-2 p-6 text-left transition-all hover:shadow-lg',
                    sel ? 'border-primary-500 bg-primary-50/50 ring-2 ring-primary-200' : 'border-gray-100 bg-white hover:border-primary-200',
                  )}
                >
                  <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl', sel ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/30' : 'bg-gray-100 text-gray-500')}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="mb-1 text-lg font-bold text-gray-800">{t.name}</h4>
                    <p className="line-clamp-2 text-sm leading-snug text-gray-500">{t.description || 'Standard estimate type.'}</p>
                  </div>
                </button>
              );
            })}
          </div>
          {onCancel && (
            <div className="mt-6 flex justify-end border-t border-gray-100 pt-4">
              <Button variant="secondary" onClick={onCancel}>Cancel</Button>
            </div>
          )}
        </div>
      )}

      {step === 'template' && type && (
        <div>
          {pick && chip(pick.kind === 'lead' ? 'Lead' : 'Contact', who, User)}
          {chip('Project Type', type.name, iconFor(type.name))}
          <p className="mb-4 font-medium text-gray-500">Available Templates</p>
          <div className="max-h-[400px] space-y-3 overflow-y-auto pr-2">
            {[{ id: 'blank', name: 'Blank Estimate', description: 'Start from scratch' }, ...templates].map((t) => {
              const sel = templateId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplateId(t.id)}
                  className={cn(
                    'group flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all',
                    sel ? 'border-primary-500 bg-primary-50' : 'border-gray-200 bg-white hover:border-primary-300 hover:shadow-md',
                  )}
                >
                  <div className={cn('flex h-10 w-10 items-center justify-center rounded-full', sel ? 'bg-primary-200 text-primary-700' : 'bg-gray-100 text-gray-500 group-hover:bg-primary-50 group-hover:text-primary-600')}>
                    <LayoutTemplate className="h-5 w-5" />
                  </div>
                  <div>
                    <div className={cn('text-base font-bold', sel ? 'text-gray-900' : 'text-gray-700')}>{t.name}</div>
                    <div className="text-sm text-gray-500">{t.description || 'Custom template'}</div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-6 flex gap-3 border-t border-gray-100 pt-6">
            <Button variant="secondary" className="flex-1" onClick={() => setStep('type')} icon={<ArrowLeft className="h-4 w-4" />}>Back</Button>
            <Button className="flex-[2]" disabled={!templateId} onClick={openDetails}>Create</Button>
          </div>
        </div>
      )}

      {step === 'details' && type && pick && (
        <div className="space-y-4">
          {chip(pick.kind === 'lead' ? 'Lead' : 'Customer', who, User, () => setStep('client'))}
          <Field label="Property / Job-site address" hint={properties.length > 1 ? 'Saved addresses for this customer. Add more with "Add Service Location" on the contact.' : 'The saved address fills in automatically.'}>
            {properties.length ? (
              <NativeSelect value={details.propertyKey} onChange={(e) => setDetails({ ...details, propertyKey: e.target.value })} aria-label="Property">
                {properties.map((p) => <option key={p.key} value={p.key}>{p.address} · {p.label}</option>)}
              </NativeSelect>
            ) : (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">This customer has no address yet. Add one on the contact record.</p>
            )}
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Project Name" required error={detailErrors.title}>
              <Input value={details.title} invalid={!!detailErrors.title} onChange={(e) => setDetails({ ...details, title: e.target.value })} />
            </Field>
            <Field label="Estimate Type (Scope)">
              <NativeSelect
                value={type.id}
                onChange={(e) => { setTypeId(e.target.value); setTemplateId('blank'); }}
                aria-label="Estimate type"
              >
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Estimator">
              <NativeSelect value={details.estimatorId} onChange={(e) => setDetails({ ...details, estimatorId: e.target.value })} aria-label="Estimator">
                {c.team.filter((m) => m.status !== 'Inactive' || m.id === details.estimatorId).map((m) => (
                  <option key={m.id} value={m.id}>{fullName(m)}{m.id === user.id ? ' (you)' : ''} · {m.role}</option>
                ))}
              </NativeSelect>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Estimate Date" required error={detailErrors.date}>
                <Input type="date" value={details.date} invalid={!!detailErrors.date} onChange={(e) => setDetails({ ...details, date: e.target.value })} />
              </Field>
              <Field label="Expiration Date" required error={detailErrors.validUntil}>
                <Input type="date" value={details.validUntil} min={details.date} invalid={!!detailErrors.validUntil} onChange={(e) => setDetails({ ...details, validUntil: e.target.value })} />
              </Field>
            </div>
          </div>
          <Field label="Project Notes" hint="Shown to the customer on the proposal. Internal notes can be added in the builder.">
            <Textarea rows={3} value={details.notes} onChange={(e) => setDetails({ ...details, notes: e.target.value })} placeholder="e.g. Customer wants the work done before the holidays." />
          </Field>
          <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-5">
            <Button variant="secondary" onClick={() => setStep('template')} icon={<ArrowLeft className="h-4 w-4" />}>Back</Button>
            <div className="flex-1" />
            <Button variant="secondary" onClick={() => create(false)}>Save</Button>
            <Button onClick={() => create(true)}>Save &amp; Continue</Button>
          </div>
        </div>
      )}
    </div>
  );
}
