'use client';

/*
  Calendar modals.

  EventFormModal: "Schedule Estimate" (create) and "Edit Appointment" (edit).
  The live app first asks for a lead, then date, time, estimator, duration
  and notes. Here the lead is an optional picker at the top that fills in the
  title, customer and address; the other fields can still be edited.

  EventDetailsModal: "Appointment Details" with Edit, Delete (confirm) and
  "Complete & Convert", which marks the appointment done and opens a new
  estimate for the lead.
*/
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar as CalendarIcon, CheckCircle, MapPin, Pencil, Trash2, User } from 'lucide-react';
import { Modal, ConfirmDialog } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useCollection, useLogActivity, useLookups } from '@/lib/store';
import type { CalendarEvent } from '@/lib/types';
import { cn, fullName, longDate, toISODate, uid } from '@/lib/utils';
import { EVENT_TYPES, fromMinutes, time12, toMinutes } from './utils';

type Draft = Omit<CalendarEvent, 'id'>;

const DURATIONS = [
  { label: '15 Minutes', value: 15 }, { label: '30 Minutes', value: 30 }, { label: '45 Minutes', value: 45 },
  { label: '1 Hour', value: 60 }, { label: '1.5 Hours', value: 90 }, { label: '2 Hours', value: 120 },
];

function blankDraft(date?: string, time?: string): Draft {
  const start = time ?? '09:00';
  return {
    title: '', type: 'Estimate Appointment', date: date ?? toISODate(new Date()),
    startTime: start, endTime: fromMinutes(toMinutes(start) + 60), status: 'Scheduled',
  };
}

export function EventFormModal({
  open, onOpenChange, editing, initialDate, initialTime,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing?: CalendarEvent | null;
  initialDate?: string;
  initialTime?: string;
}) {
  const events = useCollection('events');
  const { items: leads } = useCollection('leads');
  const { items: customers } = useCollection('customers');
  const { items: team } = useCollection('team');
  const log = useLogActivity();
  const { toast } = useToast();
  const [d, setD] = useState<Draft>(blankDraft());
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset the form every time the modal opens
  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (editing) {
      const { id: _id, ...rest } = editing;
      void _id;
      setD(rest);
    } else setD(blankDraft(initialDate, initialTime));
  }, [open, editing, initialDate, initialTime]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((s) => ({ ...s, [k]: v }));
  const activeLeads = useMemo(() => leads.filter((l) => !['Lost', 'Archived'].includes(l.status)), [leads]);
  const staff = team.filter((t) => t.status !== 'Inactive');
  const duration = toMinutes(d.endTime) - toMinutes(d.startTime);

  const pickLead = (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return setD((s) => ({ ...s, leadId: undefined }));
    setD((s) => ({
      ...s,
      leadId: lead.id,
      customerId: lead.customerId ?? s.customerId,
      address: [lead.street, lead.city, lead.state].filter(Boolean).join(', '),
      title: s.title && !s.title.startsWith('Estimate:') ? s.title : `Estimate: ${lead.firstName} ${lead.lastName}`,
      assignedTo: s.assignedTo ?? lead.assignedTo,
    }));
  };

  const save = () => {
    const e: Record<string, string> = {};
    if (!d.title.trim()) e.title = 'Title is required';
    if (!d.date) e.date = 'Date is required';
    if (!d.startTime) e.startTime = 'Start time is required';
    if (toMinutes(d.endTime) <= toMinutes(d.startTime)) e.endTime = 'End time must be after the start time';
    if (d.type === 'Estimate Appointment' && !d.assignedTo) e.assignedTo = 'Assigned estimator is required';
    setErrors(e);
    if (Object.keys(e).length) return;
    const clean = { ...d, title: d.title.trim() };
    if (editing) {
      events.update(editing.id, clean);
      toast('Appointment updated');
    } else {
      events.add({ ...clean, id: uid('ev') });
      toast(d.type === 'Estimate Appointment' ? 'Estimate appointment scheduled' : 'Event scheduled');
      if (d.leadId) log(`${clean.title} - Appointment Scheduled`, 'lead', d.leadId);
    }
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={editing ? 'Edit Appointment' : 'Schedule Estimate'}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>{editing ? 'Save Changes' : 'Schedule Appointment'}</Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Lead" hint="Optional. Picking a lead fills in the title, customer and address.">
          <NativeSelect value={d.leadId ?? ''} onChange={(e) => pickLead(e.target.value)} aria-label="Lead">
            <option value="">No lead</option>
            {activeLeads.map((l) => (
              <option key={l.id} value={l.id}>{l.firstName} {l.lastName} · {l.leadNumber}</option>
            ))}
          </NativeSelect>
        </Field>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Title" required error={errors.title}>
            <Input value={d.title} onChange={(e) => set('title', e.target.value)} invalid={!!errors.title} placeholder="e.g. Estimate: Maria Lopez" />
          </Field>
          <Field label="Type" required>
            <NativeSelect value={d.type} onChange={(e) => set('type', e.target.value as Draft['type'])} aria-label="Type">
              {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </NativeSelect>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Date" required error={errors.date}>
            <Input type="date" value={d.date} onChange={(e) => set('date', e.target.value)} invalid={!!errors.date} />
          </Field>
          <Field label="Start Time" required error={errors.startTime}>
            <Input
              type="time"
              value={d.startTime}
              onChange={(e) => {
                const keep = Math.max(duration, 15);
                setD((s) => ({ ...s, startTime: e.target.value, endTime: fromMinutes(toMinutes(e.target.value) + keep) }));
              }}
              invalid={!!errors.startTime}
            />
          </Field>
          <Field label="End Time" required error={errors.endTime}>
            <Input type="time" value={d.endTime} onChange={(e) => set('endTime', e.target.value)} invalid={!!errors.endTime} />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => set('endTime', fromMinutes(toMinutes(d.startTime) + o.value))}
              className={cn(
                'rounded-lg border px-2.5 py-1 text-xs font-semibold',
                duration === o.value ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={d.type === 'Estimate Appointment' ? 'Assigned Estimator' : 'Assigned To'} required={d.type === 'Estimate Appointment'} error={errors.assignedTo}>
            <NativeSelect value={d.assignedTo ?? ''} onChange={(e) => set('assignedTo', e.target.value || undefined)} aria-label="Assigned to">
              <option value="">{d.type === 'Estimate Appointment' ? 'Select Estimator...' : 'Unassigned'}</option>
              {staff.map((t) => <option key={t.id} value={t.id}>{fullName(t)} ({t.role})</option>)}
            </NativeSelect>
          </Field>
          <Field label="Customer">
            <NativeSelect value={d.customerId ?? ''} onChange={(e) => set('customerId', e.target.value || undefined)} aria-label="Customer">
              <option value="">No customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
            </NativeSelect>
          </Field>
        </div>

        <Field label="Address">
          <Input value={d.address ?? ''} onChange={(e) => set('address', e.target.value)} onClear={() => set('address', '')} placeholder="Street, City, State" />
        </Field>

        <Field label="Appointment Notes">
          <Textarea rows={4} value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Entry codes, parking info, specific requests..." />
        </Field>
      </div>
    </Modal>
  );
}

export function EventDetailsModal({
  event, onOpenChange, onEdit,
}: {
  event: CalendarEvent | null;
  onOpenChange: (o: boolean) => void;
  onEdit: (ev: CalendarEvent) => void;
}) {
  const router = useRouter();
  const { update, remove } = useCollection('events');
  const look = useLookups();
  const log = useLogActivity();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState(false);
  if (!event) return null;

  const customer = look.customer(event.customerId);
  const lead = look.lead(event.leadId);
  const member = look.member(event.assignedTo);
  const status = event.status ?? 'Scheduled';
  const name = customer ? fullName(customer) : lead ? `${lead.firstName} ${lead.lastName}` : event.title;
  const isEstimate = event.type === 'Estimate Appointment';

  const complete = () => {
    update(event.id, { status: 'Completed' });
    onOpenChange(false);
    if (isEstimate && (lead || customer)) {
      if (lead) log(`${name} - Appointment Completed`, 'lead', lead.id);
      toast('Appointment completed and converted to estimate');
      const q = lead ? `leadId=${lead.id}` : `customerId=${customer!.id}`;
      router.push(`/estimates/new?${q}`);
    } else toast('Appointment marked complete');
  };

  return (
    <>
      <Modal open={!!event} onOpenChange={onOpenChange} size="lg" title="Appointment Details">
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-2xl font-bold text-gray-900">{name}</h3>
              <p className="mt-0.5 text-sm font-medium text-gray-600">{event.title} · {event.type}</p>
              <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                <CalendarIcon className="h-4 w-4" />
                {longDate(event.date)} · {time12(event.startTime)} - {time12(event.endTime)}
              </div>
            </div>
            <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-bold', status === 'Completed' ? 'border-green-200 bg-green-50 text-green-700' : 'border-blue-200 bg-blue-50 text-blue-700')}>
              {status}
            </span>
          </div>

          <div className="space-y-4 rounded-2xl border border-gray-100 bg-gray-50 p-5">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-gray-400">Location</div>
                <div className="text-sm font-bold text-gray-900">{event.address || 'No address available'}</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <User className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-gray-400">{isEstimate ? 'Assigned Estimator' : 'Assigned To'}</div>
                <div className="text-sm font-bold text-gray-900">{member ? fullName(member) : 'Unassigned'}</div>
              </div>
            </div>
            {event.notes && (
              <div className="flex items-start gap-3">
                <div className="w-5 shrink-0" />
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-gray-400">Notes</div>
                  <div className="text-sm italic text-gray-600">&ldquo;{event.notes}&rdquo;</div>
                </div>
              </div>
            )}
          </div>

          {status === 'Scheduled' ? (
            <div className="flex gap-3 border-t border-gray-100 pt-4">
              <div className="mr-auto flex gap-2">
                <button
                  type="button"
                  title="Edit Appointment"
                  aria-label="Edit Appointment"
                  onClick={() => onEdit(event)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Delete Appointment"
                  aria-label="Delete Appointment"
                  onClick={() => setConfirm(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-600 hover:bg-red-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <Button onClick={complete} className="flex-1" icon={<CheckCircle className="h-4 w-4" />}>
                {isEstimate ? 'Complete & Convert' : 'Mark Complete'}
              </Button>
            </div>
          ) : (
            <div className="flex gap-3 border-t border-gray-100 pt-4">
              <Button variant="danger-outline" onClick={() => setConfirm(true)} icon={<Trash2 className="h-4 w-4" />}>Delete</Button>
              <Button variant="secondary" className="flex-1" onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          )}
        </div>
      </Modal>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete Appointment"
        message="Are you sure you want to delete this appointment? This action cannot be undone."
        onConfirm={() => {
          remove(event.id);
          onOpenChange(false);
          toast('Appointment deleted');
        }}
      />
    </>
  );
}
