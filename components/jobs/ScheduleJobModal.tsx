'use client';

/*
  "Schedule job" / "Reschedule job" modal.
  Used by the job detail Schedule card and by the Job Scheduling board.
  Collects start/end dates and the daily start/end time, validates them
  (end not before start, end time after start time) and shows the impact:
  how many days the job spans and whether its crew has room.
*/
import { useEffect, useMemo, useState } from 'react';
import { Briefcase, CalendarClock } from 'lucide-react';
import { Modal } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useCollection, useLookups } from '@/lib/store';
import type { Job } from '@/lib/types';
import { fullName } from '@/lib/utils';
import { useJobActions } from './useJobActions';
import {
  addDays, dayRange, daysInclusive, defaultDurationDays, fmtSpan, memberBookedHours, memberCapacity, round1, todayKey,
} from '@/components/scheduling/schedule-utils';

export function ScheduleJobModal({
  job, open, onOpenChange, initialStart,
}: { job: Job; open: boolean; onOpenChange: (v: boolean) => void; initialStart?: string }) {
  const { setSchedule } = useJobActions();
  const { items: jobs } = useCollection('jobs');
  const look = useLookups();
  const { toast } = useToast();

  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('16:30');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Re-seed the form each time it opens.
  useEffect(() => {
    if (!open) return;
    const s = initialStart ?? job.startDate ?? todayKey();
    const len = job.startDate ? daysInclusive(job.startDate, job.endDate ?? job.startDate) : defaultDurationDays(job);
    setStart(s);
    setEnd(initialStart || !job.endDate ? addDays(s, len - 1) : job.endDate);
    setStartTime(job.startTime ?? '08:00');
    setEndTime(job.endTime ?? '16:30');
    setErrors({});
  }, [open, job, initialStart]);

  const valid = !!start && !!end && end >= start;
  const days = valid ? dayRange(start, end) : [];

  // Crew room over the new dates (other jobs only).
  const crewImpact = useMemo(
    () =>
      job.crew.map((c) => {
        const m = look.member(c.memberId);
        const booked = memberBookedHours(jobs, c.memberId, days, job.id);
        const cap = m ? memberCapacity(m, days.length) : 0;
        return { name: fullName(m), booked, cap, mine: c.hours, over: booked + c.hours > cap };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [job, jobs, look, start, end],
  );

  const save = () => {
    const e: Record<string, string> = {};
    if (!start) e.start = 'Start date is required';
    if (!end) e.end = 'End date is required';
    if (start && end && end < start) e.end = 'End date cannot be before start date';
    if (startTime && endTime && endTime <= startTime) e.endTime = 'End time must be after start time';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSchedule(job.id, { startDate: start, endDate: end, startTime, endTime });
    toast(job.startDate ? 'Schedule updated successfully' : 'Job scheduled');
    onOpenChange(false);
  };

  const estHours = job.estimatedHours;
  const assigned = round1(job.crew.reduce((s, c) => s + c.hours, 0));
  const pct = estHours > 0 ? Math.min(100, Math.round((assigned / estHours) * 100)) : 0;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={job.startDate ? 'Reschedule job' : 'Schedule job'}
      description={job.title}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>{job.startDate ? 'Save Changes' : 'Schedule Job'}</Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start Date" required error={errors.start}>
            <Input type="date" value={start} invalid={!!errors.start} onChange={(e) => {
              const v = e.target.value;
              setStart(v);
              if (end && v > end) setEnd(v);
            }} />
          </Field>
          <Field label="End Date" required error={errors.end}>
            <Input type="date" value={end} min={start} invalid={!!errors.end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <Field label="Start Time">
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="End Time" error={errors.endTime}>
            <Input type="time" value={endTime} invalid={!!errors.endTime} onChange={(e) => setEndTime(e.target.value)} />
          </Field>
        </div>

        <div>
          <div className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-gray-400">Impact</div>
          <div className="space-y-3 rounded-xl border border-gray-200 p-3">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-gray-400" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Job</span>
              <span className="ml-auto text-sm font-black text-gray-900">#{job.jobNumber}</span>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-2xl font-black leading-none text-gray-900">{estHours.toFixed(1)}</div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">Total est. hours</div>
              </div>
              <div className="text-sm font-black text-primary-600">{assigned.toFixed(1)}<span className="text-xs font-bold text-gray-400"> assigned</span></div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-primary-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-gray-400" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Job schedule</span>
              <span className="ml-auto text-sm font-bold text-gray-900">
                {valid ? `${fmtSpan(start, end)} · ${days.length} day${days.length === 1 ? '' : 's'}` : '—'}
              </span>
            </div>
          </div>
        </div>

        {crewImpact.length > 0 && valid && (
          <div>
            <div className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-gray-400">Crew availability</div>
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
              {crewImpact.map((c) => (
                <div key={c.name} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="font-medium text-gray-700">{c.name}</span>
                  <span className={c.over ? 'font-bold text-red-600' : 'font-bold text-green-600'}>
                    {round1(c.booked + c.mine)} / {c.cap}h {c.over ? '· Over capacity' : '· OK'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
