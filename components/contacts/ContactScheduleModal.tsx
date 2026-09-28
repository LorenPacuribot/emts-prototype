'use client';

/*
  "Schedule Estimate" from a contact's page. The live app books an appointment
  for the customer at one of their service locations. Here that means:
  - a new lead (source "Existing Client", status Scheduled) linked to the contact,
  - an "Estimate Appointment" calendar event for that lead.
*/
import React, { useEffect, useState } from 'react';
import { MapPin, User } from 'lucide-react';
import type { Customer } from '@/lib/types';
import { useCollection, useLogActivity, useNextNumber } from '@/lib/store';
import { Modal } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { SERVICE_TYPES } from '@/lib/constants';
import { fullName, longDate, toISODate } from '@/lib/utils';
import { DURATION_OPTIONS, addMinutes, appendNote, customerTypeFor } from '@/components/leads/leadHelpers';

export function ContactScheduleModal({ open, onOpenChange, customer }: { open: boolean; onOpenChange: (o: boolean) => void; customer: Customer }) {
  const team = useCollection('team');
  const leads = useCollection('leads');
  const events = useCollection('events');
  const customers = useCollection('customers');
  const nextNumber = useNextNumber();
  const log = useLogActivity();
  const { toast } = useToast();
  const [s, setS] = useState({ date: '', time: '09:00', estimatorId: '', duration: '60', serviceType: 'Interior', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const t = new Date();
    t.setDate(t.getDate() + 1);
    setS({ date: toISODate(t), time: '09:00', estimatorId: '', duration: '60', serviceType: 'Interior', notes: '' });
    setErrors({});
  }, [open]);

  const set = (k: keyof typeof s, v: string) => { setS((p) => ({ ...p, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };
  const estimators = team.items.filter((t) => t.status === 'Active' && !t.isCrew);
  const address = [customer.street, customer.city, customer.state, customer.zip].filter(Boolean).join(', ');

  const submit = () => {
    const e: Record<string, string> = {};
    const today = toISODate(new Date());
    if (!s.date) e.date = 'Date is required';
    else if (s.date < today) e.date = 'Date cannot be in the past';
    if (!s.time) e.time = 'Time is required';
    if (!s.estimatorId) e.estimatorId = 'Please select an estimator';
    setErrors(e);
    if (Object.keys(e).length) return;

    const now = new Date().toISOString();
    const leadNumber = nextNumber('LEAD');
    const lead = leads.add(
      {
        id: leadNumber,
        leadNumber,
        firstName: customer.firstName, lastName: customer.lastName, companyName: customer.companyName,
        phone: customer.phone, email: customer.email, secondaryPhone: customer.secondaryPhone, secondaryEmail: customer.secondaryEmail,
        street: customer.street, city: customer.city, state: customer.state, zip: customer.zip,
        leadSource: 'Existing Client', serviceType: s.serviceType, status: 'Scheduled', estimatedValue: 0,
        date: now, createdAt: now, updatedAt: now, customerId: customer.id, contactType: 'CONTACT',
        assignedTo: s.estimatorId, appointment: { date: s.date, time: s.time, estimatorId: s.estimatorId },
        appointmentDuration: Number(s.duration),
        notes: s.notes.trim() ? appendNote(undefined, s.notes) : undefined,
      },
      { atStart: true },
    );
    const ev = events.add({
      title: `Estimate: ${fullName(customer)}`, type: 'Estimate Appointment', date: s.date, startTime: s.time,
      endTime: addMinutes(s.time, Number(s.duration)), leadId: lead.id, customerId: customer.id, assignedTo: s.estimatorId,
      address, notes: s.notes.trim() || undefined,
    });
    leads.update(lead.id, { appointmentEventId: ev.id });
    const type = customerTypeFor('Scheduled', customer.type);
    if (type !== customer.type) customers.update(customer.id, { type });
    log(`Estimate appointment scheduled for ${fullName(customer)} on ${longDate(s.date)}`, 'lead', lead.id);
    toast('Estimate appointment scheduled');
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Schedule Estimate"
      footer={
        <div className="grid w-full grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>Schedule</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100"><User className="h-5 w-5 text-blue-600" /></div>
          <div>
            <p className="font-semibold text-gray-900">{fullName(customer)}</p>
            {address && <p className="mt-0.5 flex items-center gap-1 text-sm text-blue-600"><MapPin className="h-3.5 w-3.5" /> {address}</p>}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Date" required error={errors.date}>
            <Input type="date" min={toISODate(new Date())} value={s.date} onChange={(e) => set('date', e.target.value)} invalid={!!errors.date} />
          </Field>
          <Field label="Time" required error={errors.time}>
            <Input type="time" value={s.time} onChange={(e) => set('time', e.target.value)} invalid={!!errors.time} />
          </Field>
          <Field label="Assigned Estimator" required error={errors.estimatorId}>
            <NativeSelect value={s.estimatorId} onChange={(e) => set('estimatorId', e.target.value)} className={errors.estimatorId ? 'border-red-400' : undefined}>
              <option value="">Select Estimator...</option>
              {estimators.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Duration" required>
            <NativeSelect value={s.duration} onChange={(e) => set('duration', e.target.value)}>
              {DURATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Service Type">
            <NativeSelect value={s.serviceType} onChange={(e) => set('serviceType', e.target.value)}>
              {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </NativeSelect>
          </Field>
        </div>
        <Field label="Appointment Notes">
          <Textarea rows={3} value={s.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Entry codes, parking info, specific requests..." />
        </Field>
      </div>
    </Modal>
  );
}
