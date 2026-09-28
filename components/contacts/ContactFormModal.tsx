'use client';

/*
  Add New Contact / Edit Contact modal (live: features/(main)/contacts/listings/modals/contact-form.tsx).
  Required: first name, phone, email, street, city, 2-letter state and ZIP.
  Editing a contact also updates the name, phone and email on their open leads.
*/
import React, { useEffect, useState } from 'react';
import type { ContactType, Customer } from '@/lib/types';
import { useCollection } from '@/lib/store';
import { Modal } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { Field, Input, NativeSelect } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { COMMON_SOURCES, EMAIL_RE, ZIP_RE, formatPhone, formatPhoneInput, isValidPhone } from '@/components/leads/leadHelpers';

const EMPTY = {
  firstName: '', lastName: '', phone: '', email: '', secondaryPhone: '', companyName: '',
  street: '', city: '', state: '', zip: '', type: 'Contact' as ContactType, source: 'Website',
};
type State = typeof EMPTY;

export function ContactFormModal({
  open, onOpenChange, customer, onSaved,
}: { open: boolean; onOpenChange: (o: boolean) => void; customer?: Customer | null; onSaved?: (c: Customer) => void }) {
  const customers = useCollection('customers');
  const leads = useCollection('leads');
  const { toast } = useToast();
  const [s, setS] = useState<State>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof State, string>>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setS(
      customer
        ? {
            firstName: customer.firstName, lastName: customer.lastName, phone: formatPhoneInput(customer.phone), email: customer.email,
            secondaryPhone: formatPhoneInput(customer.secondaryPhone ?? ''), companyName: customer.companyName ?? '',
            street: customer.street, city: customer.city, state: customer.state, zip: customer.zip, type: customer.type, source: customer.source,
          }
        : EMPTY,
    );
  }, [open, customer]);

  const set = <K extends keyof State>(k: K, v: State[K]) => {
    setS((p) => ({ ...p, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = () => {
    const e: Partial<Record<keyof State, string>> = {};
    if (!s.firstName.trim()) e.firstName = 'First name is required';
    if (!s.phone.trim()) e.phone = 'Phone is required';
    else if (!isValidPhone(s.phone)) e.phone = 'Enter a valid 10-digit phone number';
    if (!s.email.trim()) e.email = 'Email is required';
    else if (!EMAIL_RE.test(s.email.trim())) e.email = 'Invalid email address';
    if (s.secondaryPhone && !isValidPhone(s.secondaryPhone)) e.secondaryPhone = 'Enter a valid 10-digit phone number';
    if (!s.street.trim()) e.street = 'Street address is required';
    if (!s.city.trim()) e.city = 'City is required';
    if (s.state.trim().length !== 2) e.state = s.state.trim() ? 'State must be 2 characters' : 'State is required';
    if (!ZIP_RE.test(s.zip.trim())) e.zip = s.zip.trim() ? 'ZIP code must be in format 12345 or 12345-6789' : 'ZIP code is required';
    setErrors(e);
    if (Object.keys(e).length) return;

    const data = {
      firstName: s.firstName.trim(), lastName: s.lastName.trim(),
      phone: formatPhone(s.phone.replace(/\D/g, '')), email: s.email.trim(),
      secondaryPhone: s.secondaryPhone ? formatPhone(s.secondaryPhone.replace(/\D/g, '')) : undefined,
      companyName: s.companyName.trim() || undefined,
      street: s.street.trim(), city: s.city.trim(), state: s.state.trim().toUpperCase(), zip: s.zip.trim(),
      type: s.type, source: s.source,
    };

    if (customer) {
      customers.update(customer.id, data);
      // Keep open leads for this person in sync with their contact details.
      leads.items
        .filter((l) => l.customerId === customer.id && l.status !== 'Sold' && l.status !== 'Archived')
        .forEach((l) => leads.update(l.id, { firstName: data.firstName, lastName: data.lastName, phone: data.phone, email: data.email }));
      toast('Contact updated successfully');
      onSaved?.({ ...customer, ...data });
    } else {
      const c = customers.add({ ...data, createdAt: new Date().toISOString() }, { atStart: true });
      toast('Contact created successfully');
      onSaved?.(c);
    }
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={customer ? 'Edit Contact' : 'Add New Contact'}
      footer={
        <div className="grid w-full grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>{customer ? 'Save Changes' : 'Create Contact'}</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
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
            <Input value={s.secondaryPhone} onChange={(e) => set('secondaryPhone', formatPhoneInput(e.target.value))} placeholder="(555) 987-6543" invalid={!!errors.secondaryPhone} />
          </Field>
          <Field label="Company Name (Optional)">
            <Input value={s.companyName} onChange={(e) => set('companyName', e.target.value)} placeholder="Doe Enterprises" />
          </Field>
          <Field label="Contact Type">
            <NativeSelect value={s.type} onChange={(e) => set('type', e.target.value as ContactType)}>
              <option value="Lead">Lead</option>
              <option value="Contact">Contact</option>
              <option value="Client">Client</option>
            </NativeSelect>
          </Field>
          <Field label="Source">
            <NativeSelect value={s.source} onChange={(e) => set('source', e.target.value)}>
              {Array.from(new Set([...COMMON_SOURCES, 'Existing Customer', s.source])).filter(Boolean).map((o) => <option key={o} value={o}>{o}</option>)}
            </NativeSelect>
          </Field>
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-500">Primary Service Location</h3>
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
      </div>
    </Modal>
  );
}
