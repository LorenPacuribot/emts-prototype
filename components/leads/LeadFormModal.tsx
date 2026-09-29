'use client';

/*
  Add New Lead / Edit Lead modal (live: features/(main)/leads/listings/modals/lead-form.tsx).

  Two ways to add a lead:
  1. Fresh lead: type the person's details. A new Customer (type "Lead") is created too.
  2. "Select Existing Client": pick a contact. Their details are used and the lead
     links to that customer. Only the service address can change.

  Validation matches the live schema: first name, phone, email, lead source and
  the full address are required; email, phone and ZIP must be valid formats.
*/
import React, { useEffect, useMemo, useState } from 'react';
import { Mail, MapPin, Phone, Search, Star, UserCheck, X } from 'lucide-react';
import type { Customer, Lead } from '@/lib/types';
import { useCollection, useLogActivity, useNextNumber } from '@/lib/store';
import { Modal } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { SERVICE_TYPES } from '@/lib/constants';
import { cn, fullName } from '@/lib/utils';
import { COMMON_SOURCES, EMAIL_RE, ZIP_RE, appendNote, formatPhone, formatPhoneInput, isValidPhone } from './leadHelpers';
import { useLeadActions } from './useLeadActions';

interface FormState {
  firstName: string; lastName: string; companyName: string;
  phone: string; email: string; secondaryPhone: string; secondaryEmail: string;
  securityCode: string; leadSource: string;
  street: string; city: string; state: string; zip: string;
  serviceType: string; estimatedValue: string; notes: string; qualityRating: number; assignedTo: string;
}

const EMPTY: FormState = {
  firstName: '', lastName: '', companyName: '', phone: '', email: '', secondaryPhone: '', secondaryEmail: '',
  securityCode: '', leadSource: '', street: '', city: '', state: '', zip: '',
  serviceType: 'Interior', estimatedValue: '', notes: '', qualityRating: 0, assignedTo: '',
};

const OTHER = 'OTHER_CUSTOM';

export function LeadFormModal({
  open, onOpenChange, lead, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass a lead to edit it; leave empty to add a new one. */
  lead?: Lead | null;
  onSaved?: (lead: Lead) => void;
}) {
  const mode = lead ? 'edit' : 'add';
  const leads = useCollection('leads');
  const customers = useCollection('customers');
  const team = useCollection('team');
  const nextNumber = useNextNumber();
  const log = useLogActivity();
  const { toast } = useToast();
  const { sendStageMessages } = useLeadActions();

  const [s, setS] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [customSource, setCustomSource] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [picking, setPicking] = useState(false);

  // Reset the form each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setPicking(false);
    if (lead) {
      setS({
        firstName: lead.firstName, lastName: lead.lastName, companyName: lead.companyName ?? '',
        phone: formatPhoneInput(lead.phone), email: lead.email,
        secondaryPhone: formatPhoneInput(lead.secondaryPhone ?? ''), secondaryEmail: lead.secondaryEmail ?? '',
        securityCode: lead.securityCode ?? '', leadSource: lead.leadSource,
        street: lead.street, city: lead.city, state: lead.state, zip: lead.zip,
        serviceType: lead.serviceType || 'Interior', estimatedValue: lead.estimatedValue ? String(lead.estimatedValue) : '',
        notes: '', qualityRating: lead.qualityRating ?? 0, assignedTo: lead.assignedTo ?? '',
      });
      setCustomSource(!!lead.leadSource && !COMMON_SOURCES.includes(lead.leadSource) && lead.leadSource !== 'Existing Client');
      setSelected(null);
    } else {
      setS(EMPTY);
      setCustomSource(false);
      setSelected(null);
    }
  }, [open, lead]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setS((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const pickClient = (c: Customer) => {
    setSelected(c);
    setPicking(false);
    setCustomSource(false);
    setErrors({});
    setS((p) => ({
      ...p,
      firstName: c.firstName, lastName: c.lastName, companyName: c.companyName ?? '',
      phone: formatPhoneInput(c.phone), email: c.email,
      secondaryPhone: formatPhoneInput(c.secondaryPhone ?? ''), secondaryEmail: c.secondaryEmail ?? '',
      leadSource: 'Existing Client', street: c.street, city: c.city, state: c.state, zip: c.zip,
    }));
  };

  const clearClient = () => {
    setSelected(null);
    setS(EMPTY);
    setErrors({});
  };

  const validate = () => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!selected) {
      if (!s.firstName.trim()) e.firstName = 'First name is required';
      if (!s.phone.trim()) e.phone = 'Phone is required';
      else if (!isValidPhone(s.phone)) e.phone = 'Enter a valid 10-digit phone number';
      if (!s.email.trim()) e.email = 'Email is required';
      else if (!EMAIL_RE.test(s.email.trim())) e.email = 'Invalid email address';
      if (s.secondaryPhone && !isValidPhone(s.secondaryPhone)) e.secondaryPhone = 'Enter a valid 10-digit phone number';
      else if (s.secondaryPhone && s.secondaryPhone.replace(/\D/g, '') === s.phone.replace(/\D/g, '')) e.secondaryPhone = 'Secondary phone must be different from primary phone';
      if (s.secondaryEmail && !EMAIL_RE.test(s.secondaryEmail.trim())) e.secondaryEmail = 'Invalid email address';
      else if (s.secondaryEmail && s.secondaryEmail.trim().toLowerCase() === s.email.trim().toLowerCase()) e.secondaryEmail = 'Secondary email must be different from primary email';
      if (!s.leadSource.trim()) e.leadSource = 'Lead source is required';
    }
    if (!s.street.trim()) e.street = 'Street is required';
    if (!s.city.trim()) e.city = 'City is required';
    if (!s.state.trim()) e.state = 'State is required';
    else if (s.state.trim().length !== 2) e.state = 'State must be 2 characters';
    if (!s.zip.trim()) e.zip = 'Zip is required';
    else if (!ZIP_RE.test(s.zip.trim())) e.zip = 'ZIP code must be in format 12345 or 12345-6789';
    if (s.estimatedValue && (isNaN(Number(s.estimatedValue)) || Number(s.estimatedValue) < 0)) e.estimatedValue = 'Enter a valid amount';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = () => {
    if (!validate()) return;
    const now = new Date().toISOString();
    const digits = (v: string) => (v ? formatPhone(v.replace(/\D/g, '')) : '');
    const contact = {
      firstName: s.firstName.trim(), lastName: s.lastName.trim(), companyName: s.companyName.trim() || undefined,
      phone: digits(s.phone), email: s.email.trim(),
      secondaryPhone: digits(s.secondaryPhone) || undefined, secondaryEmail: s.secondaryEmail.trim() || undefined,
    };
    const address = { street: s.street.trim(), city: s.city.trim(), state: s.state.trim().toUpperCase(), zip: s.zip.trim() };
    const details = {
      securityCode: s.securityCode.trim() || undefined,
      leadSource: s.leadSource.trim(),
      serviceType: s.serviceType,
      estimatedValue: Number(s.estimatedValue) || 0,
      qualityRating: s.qualityRating || undefined,
      assignedTo: s.assignedTo || undefined,
    };

    if (lead) {
      const patch: Partial<Lead> = { ...contact, ...address, ...details, updatedAt: now };
      if (s.notes.trim()) patch.notes = appendNote(lead.notes, s.notes);
      leads.update(lead.id, patch);
      // Keep the linked contact's details in step with the lead.
      if (lead.customerId && customers.get(lead.customerId)) customers.update(lead.customerId, { ...contact, ...address });
      log(`Lead ${lead.leadNumber} updated`, 'lead', lead.id);
      toast('Lead updated successfully');
      onSaved?.({ ...lead, ...patch });
    } else {
      // Link to the chosen client, or create a new contact record of type "Lead".
      const customer =
        selected ??
        customers.add(
          { ...contact, ...address, type: 'Lead', source: details.leadSource, createdAt: now },
          { atStart: true },
        );
      const leadNumber = nextNumber('LEAD');
      const created = leads.add(
        {
          id: leadNumber,
          leadNumber,
          ...contact, ...address, ...details,
          status: 'New', date: now, createdAt: now, updatedAt: now,
          notes: s.notes.trim() ? appendNote(undefined, s.notes) : undefined,
          customerId: customer.id,
          contactType: 'LEAD',
          appointment: null,
        },
        { atStart: true },
      );
      log(`New lead ${created.leadNumber} added for ${fullName(created)}`, 'lead', created.id);
      toast('Lead created successfully');
      // The "New Leads" stage message (Settings > Automated Messages), once per lead.
      sendStageMessages(created, 'New');
      onSaved?.(created);
    }
    onOpenChange(false);
  };

  const estimators = team.items.filter((t) => t.status === 'Active' && !t.isCrew);
  const sourceSelectValue = COMMON_SOURCES.includes(s.leadSource) || s.leadSource === 'Existing Client' ? s.leadSource : s.leadSource ? OTHER : '';
  const upperLabel = 'mb-3 text-xs font-bold uppercase tracking-widest text-gray-500';

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={mode === 'add' ? 'Add New Lead' : 'Edit Lead'}
      footer={
        <div className="grid w-full grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>{mode === 'add' ? 'Save Lead' : 'Save Changes'}</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {mode === 'add' && !selected && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="group flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white py-3 font-bold text-gray-500 shadow-sm transition-all hover:border-primary-300 hover:bg-primary-50 hover:text-primary-600"
          >
            <Search className="h-4 w-4 text-gray-500 group-hover:text-primary-500" /> Select Existing Client
          </button>
        )}

        {selected ? (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-primary-100 bg-primary-50 px-4 py-2.5">
              <span className="flex items-center gap-2 text-sm font-bold text-primary-700"><UserCheck className="h-4 w-4 text-primary-600" /> Existing Client</span>
              <button aria-label="Clear selection" type="button" onClick={clearClient} className="rounded-lg p-1 text-primary-500 hover:bg-primary-100" title="Clear selection"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-lg font-bold text-primary-700">{selected.firstName.charAt(0)}</div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-gray-900">{selected.firstName} {selected.lastName}</p>
                <span className="text-xs text-gray-500">Lead Source: Existing Client</span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-sm text-gray-600">
                <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-gray-500" />{formatPhone(selected.phone) || '-'}</span>
                <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-gray-500" /><span className="max-w-44 truncate">{selected.email || '-'}</span></span>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="First Name" required error={errors.firstName}>
                <Input value={s.firstName} onChange={(e) => set('firstName', e.target.value)} placeholder="Jane" invalid={!!errors.firstName} />
              </Field>
              <Field label="Last Name">
                <Input value={s.lastName} onChange={(e) => set('lastName', e.target.value)} placeholder="Doe" />
              </Field>
              <Field label="Phone" required error={errors.phone}>
                <Input value={s.phone} onChange={(e) => set('phone', formatPhoneInput(e.target.value))} placeholder="(555) 123-4567" invalid={!!errors.phone} inputMode="tel" />
              </Field>
              <Field label="Email" required error={errors.email}>
                <Input type="email" value={s.email} onChange={(e) => set('email', e.target.value)} placeholder="jane@example.com" invalid={!!errors.email} />
              </Field>
              <Field label="Secondary Phone" error={errors.secondaryPhone}>
                <Input value={s.secondaryPhone} onChange={(e) => set('secondaryPhone', formatPhoneInput(e.target.value))} placeholder="(555) 987-6543" invalid={!!errors.secondaryPhone} inputMode="tel" />
              </Field>
              <Field label="Secondary Email" error={errors.secondaryEmail}>
                <Input type="email" value={s.secondaryEmail} onChange={(e) => set('secondaryEmail', e.target.value)} placeholder="john.alt@example.com" invalid={!!errors.secondaryEmail} />
              </Field>
              <Field label="Security Code">
                <Input value={s.securityCode} onChange={(e) => set('securityCode', e.target.value)} placeholder="1234#" />
              </Field>
              <Field label="Lead Source" required error={errors.leadSource}>
                {customSource ? (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Input autoFocus value={s.leadSource} onChange={(e) => set('leadSource', e.target.value)} placeholder="Type source (e.g. Billboard)..." invalid={!!errors.leadSource} />
                    </div>
                    <button aria-label="Cancel custom input" type="button" title="Cancel custom input" onClick={() => { setCustomSource(false); set('leadSource', ''); }} className="rounded-lg bg-gray-100 px-3 text-gray-500 hover:bg-gray-200">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                ) : (
                  <NativeSelect
                    value={sourceSelectValue}
                    onChange={(e) => {
                      if (e.target.value === OTHER) { setCustomSource(true); set('leadSource', ''); } else set('leadSource', e.target.value);
                    }}
                    className={cn(errors.leadSource && 'border-red-400', !s.leadSource && 'text-gray-500')}
                  >
                    <option value="">Select Source...</option>
                    {COMMON_SOURCES.map((o) => <option key={o} value={o}>{o}</option>)}
                    <option value="Existing Client">Existing Client</option>
                    <option value={OTHER}>Other (Type...)</option>
                  </NativeSelect>
                )}
              </Field>
            </div>
            <Field label="Company Name">
              <Input value={s.companyName} onChange={(e) => set('companyName', e.target.value)} placeholder="Acme Painting Co." />
            </Field>
          </>
        )}

        {/* Service address */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <h3 className={upperLabel}>Service Address</h3>
          <div className="space-y-4">
            <Field label="Street Address" required error={errors.street}>
              <Input value={s.street} onChange={(e) => set('street', e.target.value)} placeholder="123 Main St" invalid={!!errors.street} />
            </Field>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="City" required error={errors.city}>
                <Input value={s.city} onChange={(e) => set('city', e.target.value)} placeholder="City" invalid={!!errors.city} />
              </Field>
              <Field label="State" required error={errors.state}>
                <Input value={s.state} maxLength={2} onChange={(e) => set('state', e.target.value.toUpperCase())} placeholder="ST" invalid={!!errors.state} />
              </Field>
              <Field label="Zip" required error={errors.zip}>
                <Input value={s.zip} onChange={(e) => set('zip', e.target.value)} placeholder="12345" invalid={!!errors.zip} />
              </Field>
            </div>
          </div>
        </div>

        {/* Lead details */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <h3 className={upperLabel}>Lead Details</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Service Type">
              <NativeSelect value={s.serviceType} onChange={(e) => set('serviceType', e.target.value)}>
                {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Estimated Value ($)" error={errors.estimatedValue}>
              <Input type="number" min={0} step="0.01" value={s.estimatedValue} onChange={(e) => set('estimatedValue', e.target.value)} placeholder="0.00" invalid={!!errors.estimatedValue} />
            </Field>
            <Field label="Assigned Estimator">
              <NativeSelect value={s.assignedTo} onChange={(e) => set('assignedTo', e.target.value)}>
                <option value="">Unassigned</option>
                {estimators.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Quality Rating">
              <div className="flex h-10 items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button aria-label={`${n} star${n > 1 ? 's' : ''}`} key={n} type="button" onClick={() => set('qualityRating', s.qualityRating === n ? 0 : n)} title={`${n} star${n > 1 ? 's' : ''}`}>
                    <Star className={cn('h-6 w-6 transition-colors', s.qualityRating >= n ? 'fill-amber-400 text-amber-400' : 'text-gray-300 hover:text-amber-200')} />
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <Field label={mode === 'add' ? 'Notes' : 'Add a Note'} className="mt-4">
            <Textarea rows={3} value={s.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Anything the estimator should know..." />
          </Field>
        </div>
      </div>

      <ClientPicker open={picking} onOpenChange={setPicking} customers={customers.items} onSelect={pickClient} />
    </Modal>
  );
}

/** "Select Client" search list (live: modals/contact-selection.tsx). */
function ClientPicker({
  open, onOpenChange, customers, onSelect,
}: { open: boolean; onOpenChange: (o: boolean) => void; customers: Customer[]; onSelect: (c: Customer) => void }) {
  const [q, setQ] = useState('');
  useEffect(() => { if (open) setQ(''); }, [open]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const digits = t.replace(/\D/g, '');
    return customers.filter((c) =>
      !t ||
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(t) ||
      c.email.toLowerCase().includes(t) ||
      (digits.length > 0 && c.phone.replace(/\D/g, '').includes(digits)),
    );
  }, [customers, q]);

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Select Client" size="lg">
      <div className="flex flex-col gap-4">
        <Input autoFocus leftIcon={<Search className="h-4 w-4" />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email, or phone..." />
        <div className="max-h-[55vh] space-y-3 overflow-y-auto">
          {list.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">{q ? `No clients found matching "${q}".` : 'No clients found.'}</p>
          ) : (
            list.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c)}
                className="group block w-full rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-primary-400 hover:shadow-md"
              >
                <div className="mb-2 flex items-center gap-2">
                  <h4 className="text-lg font-bold text-gray-900 group-hover:text-primary-700">{c.firstName} {c.lastName}</h4>
                  <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-xxs font-bold uppercase text-blue-700">{c.type}</span>
                </div>
                <div className="space-y-1.5 text-sm text-gray-600">
                  <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 shrink-0 text-gray-500" /><span className="truncate">{c.street}, {c.city}, {c.state} {c.zip}</span></div>
                  <div className="flex flex-wrap justify-between gap-4">
                    <span className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-gray-500" />{c.email}</span>
                    <span className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gray-500" />{formatPhone(c.phone)}</span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
