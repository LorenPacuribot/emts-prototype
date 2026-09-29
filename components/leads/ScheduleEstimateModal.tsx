'use client';

/*
  Schedule / Reschedule Estimate modal (live: features/(main)/leads/details/modals/schedule-estimate.tsx).
  Saving:
  - adds (or updates) an "Estimate Appointment" event in the calendar ('events'),
  - stores the appointment on the lead,
  - moves the lead to Scheduled when it is still New or Contacted.
*/
import React, { useEffect, useState } from 'react';
import { MapPin, User } from 'lucide-react';
import type { Lead } from '@/lib/types';
import { useCollection, useLogActivity } from '@/lib/store';
import { Modal } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { fullName, longDate, toISODate } from '@/lib/utils';
import { DURATION_OPTIONS, addMinutes, time12 } from './leadHelpers';
import { useLeadActions } from './useLeadActions';

export function ScheduleEstimateModal({ open, onOpenChange, lead }: { open: boolean; onOpenChange: (o: boolean) => void; lead: Lead }) {
  const isReschedule = !!lead.appointment;
  const team = useCollection('team');
  const events = useCollection('events');
  const leads = useCollection('leads');
  const { changeStatus } = useLeadActions();
  const log = useLogActivity();
  const { toast } = useToast();

  const [s, setS] = useState({ date: '', time: '09:00', estimatorId: '', duration: '60', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Default to tomorrow at 9:00, or the current appointment when rescheduling.
  useEffect(() => {
    if (!open) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const a = lead.appointment;
    setS({
      date: a?.date ?? toISODate(tomorrow),
      time: a?.time ?? '09:00',
      estimatorId: a?.estimatorId ?? lead.assignedTo ?? '',
      duration: String(lead.appointmentDuration ?? 60),
      notes: '',
    });
    setErrors({});
  }, [open, lead]);

  const set = (k: keyof typeof s, v: string) => {
    setS((p) => ({ ...p, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const estimators = team.items.filter((t) => t.status === 'Active' && !t.isCrew);
  const address = [lead.street, lead.city, lead.state, lead.zip].filter(Boolean).join(', ');
  const currentEstimator = team.get(lead.appointment?.estimatorId);

  const submit = () => {
    const e: Record<string, string> = {};
    const today = toISODate(new Date());
    if (!s.date) e.date = 'Date is required';
    else if (s.date < today) e.date = 'Date cannot be in the past';
    if (!s.time) e.time = 'Time is required';
    else if (s.date === today) {
      const now = new Date();
      const [h = 0, m = 0] = s.time.split(':').map(Number);
      if (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes())) e.time = "Time must be in the future for today's date";
    }
    if (!s.estimatorId) e.estimatorId = 'Please select an estimator';
    if (!s.duration) e.duration = 'Duration is required';
    setErrors(e);
    if (Object.keys(e).length) return;

    const endTime = addMinutes(s.time, Number(s.duration));
    const eventData = {
      title: `Estimate: ${fullName(lead)}`,
      type: 'Estimate Appointment' as const,
      date: s.date,
      startTime: s.time,
      endTime,
      leadId: lead.id,
      customerId: lead.customerId,
      assignedTo: s.estimatorId,
      address,
      notes: s.notes.trim() || undefined,
    };
    const existing = events.get(lead.appointmentEventId) ?? events.items.find((ev) => ev.leadId === lead.id && ev.type === 'Estimate Appointment');
    let eventId = existing?.id;
    if (existing) events.update(existing.id, eventData);
    else eventId = events.add(eventData).id;

    leads.update(lead.id, {
      appointment: { date: s.date, time: s.time, estimatorId: s.estimatorId },
      appointmentEventId: eventId,
      appointmentDuration: Number(s.duration),
      assignedTo: s.estimatorId,
      updatedAt: new Date().toISOString(),
    });
    if (lead.status === 'New' || lead.status === 'Contacted') changeStatus(lead, 'Scheduled', { silent: true });
    const who = team.get(s.estimatorId);
    log(`Estimate appointment ${isReschedule ? 'rescheduled' : 'scheduled'} for ${fullName(lead)} on ${longDate(s.date)} with ${fullName(who)}`, 'lead', lead.id);
    toast(isReschedule ? 'Estimate appointment rescheduled successfully' : 'Estimate appointment scheduled');
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={isReschedule ? 'Reschedule Estimate' : 'Schedule Estimate'}
      footer={
        <div className="grid w-full grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>{isReschedule ? 'Reschedule' : 'Schedule'}</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100"><User className="h-5 w-5 text-blue-600" /></div>
          <div>
            <p className="font-semibold text-gray-900">{isReschedule ? 'Reschedule for ' : ''}{lead.firstName} {lead.lastName}</p>
            {address && <p className="mt-0.5 flex items-center gap-1 text-sm text-blue-600"><MapPin className="h-3.5 w-3.5" /> {address}</p>}
            {isReschedule && lead.appointment && (
              <p className="mt-1 text-xs text-gray-500">
                Current: {longDate(lead.appointment.date)} at {time12(lead.appointment.time)}
                {currentEstimator && ` with ${fullName(currentEstimator)}`}
              </p>
            )}
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
          <Field label="Duration" required error={errors.duration}>
            <NativeSelect value={s.duration} onChange={(e) => set('duration', e.target.value)}>
              {DURATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </NativeSelect>
          </Field>
        </div>

        <Field label={isReschedule ? 'Reschedule Notes' : 'Appointment Notes'}>
          <Textarea
            rows={isReschedule ? 3 : 4}
            value={s.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder={isReschedule ? 'Reason for rescheduling...' : 'Entry codes, parking info, specific requests...'}
          />
        </Field>
        <p className="-mt-2 text-center text-xs text-gray-500">This will sync to Google Calendar and queue client reminders.</p>
      </div>
    </Modal>
  );
}
