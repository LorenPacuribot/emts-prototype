'use client';

/*
  Scheduling panel: "Schedule Job" (patent 14).
  Used by the job detail Schedule card, the work order page and the Job
  Scheduling board.

  1. Date range and the default daily window.
  2. Required Hours (from the work order / approved scope) against Assigned
     Hours, updated as hours are typed. A changed requirement since the
     schedule was planned (change order, amendment) is flagged (patent 15).
  3. Shifts: "+ Add Shift" sets a portion of the job with its own dates and
     start/end time; "+ Add Crew Member" puts painters on it and each gets
     hours per day.
  4. Every member/day is checked against their availability (time off,
     working days, saved schedules, hours already booked on other jobs, the
     shift window and weekly capacity). "Save Shift" is refused while any
     check fails, and the message shows the hours still available.
  Crew hours that aren't in a shift (the older "Assign Crew" entries) stay,
  spread over the job's working days.
*/
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Plus, Trash2, Users } from 'lucide-react';
import { Modal } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/display';
import { Field, Input, NativeSelect } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useCollection, useLookups } from '@/lib/store';
import type { CrewAssignment, Job, JobShift } from '@/lib/types';
import { cn, fullName, uid } from '@/lib/utils';
import { memberDayAvailability, requiredHoursChange, scheduleConflicts, type ScheduleConflict } from '@/lib/scheduling';
import { useJobActions } from './useJobActions';
import { useJobTwin } from './JobFeatures';
import { useCan } from '@/components/work-orders/WoFeatures';
import { act } from '@/features/lib/store';
import { setWorkOrderStatus } from '@/features/lib/store/actions/work-orders';
import {
  addDays, daysInclusive, defaultDurationDays, fmtDay, fmtSpan, memberDayHours, round1, todayKey, workingShiftDays,
} from '@/components/scheduling/schedule-utils';

const clockHours = (a: string, b: string) => {
  const t = (v: string) => (/^\d{2}:\d{2}$/.test(v) ? Number(v.slice(0, 2)) + Number(v.slice(3)) / 60 : NaN);
  return t(b) - t(a);
};

export function ScheduleJobModal({
  job, open, onOpenChange, initialStart,
}: { job: Job; open: boolean; onOpenChange: (v: boolean) => void; initialStart?: string }) {
  const { saveSchedule } = useJobActions();
  const { items: jobs } = useCollection('jobs');
  const { items: team } = useCollection('team');
  const look = useLookups();
  const { toast } = useToast();

  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('16:30');
  const [shifts, setShifts] = useState<JobShift[]>([]);
  const [crew, setCrew] = useState<CrewAssignment[]>([]);
  const [adding, setAdding] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Re-seed the form each time it opens.
  useEffect(() => {
    if (!open) return;
    const s = initialStart ?? job.startDate ?? todayKey();
    const len = job.startDate ? daysInclusive(job.startDate, job.endDate ?? job.startDate) : defaultDurationDays(job);
    const e = initialStart || !job.endDate ? addDays(s, len - 1) : job.endDate;
    const offset = job.startDate && initialStart ? daysInclusive(job.startDate, initialStart) - 1 : 0;
    setStart(s);
    setEnd(e);
    setStartTime(job.startTime ?? '08:00');
    setEndTime(job.endTime ?? '16:30');
    // Dropping a scheduled job on a new day moves its shifts and dated hours with it.
    setShifts((job.shifts ?? []).map((x) => ({ ...x, memberIds: [...x.memberIds], startDate: addDays(x.startDate, offset), endDate: addDays(x.endDate, offset) })));
    setCrew(job.crew.map((c) => ({ ...c, date: c.date ? addDays(c.date, offset) : undefined })));
    setAdding({});
    setErrors({});
  }, [open, job, initialStart]);

  const crewPool = team.filter((t) => t.isCrew && t.status !== 'Inactive');
  const valid = !!start && !!end && end >= start && clockHours(startTime, endTime) > 0;
  const candidate: Job = { ...job, startDate: start, endDate: end, startTime, endTime, shifts, crew };
  const others = useMemo(() => jobs.filter((j) => j.id !== job.id), [jobs, job.id]);
  const conflicts = useMemo(
    () => (valid ? scheduleConflicts(candidate, others, team) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [valid, start, end, startTime, endTime, shifts, crew, others, team],
  );
  const conflictAt = (memberId: string, day: string) => conflicts.find((c) => c.memberId === memberId && c.day === day && c.kind !== 'weekly');

  // The work order must have its deposit confirmed before it can be scheduled (prototype rule).
  const twin = useJobTwin(job.id);
  const canManage = useCan('workOrder.updateStatus');
  const awaitingDeposit = twin?.wo?.status === 'PENDING_DEPOSIT';
  const confirmDeposit = () => {
    if (twin?.wo && act(setWorkOrderStatus, twin.wo.id, 'UNSCHEDULED').ok) toast('Deposit confirmed: the work order can be scheduled');
  };

  const required = job.estimatedHours;
  const assigned = round1(crew.reduce((s, c) => s + (Number.isFinite(c.hours) ? c.hours : 0), 0));
  const pct = required > 0 ? Math.min(100, Math.round((assigned / required) * 100)) : 0;
  const changed = requiredHoursChange(job);
  const loose = crew.filter((c) => !c.shiftId);

  /* ---------- shift editing ---------- */

  const addShift = () => {
    const n = shifts.length + 1;
    setShifts((s) => [...s, { id: uid('sh'), name: `Shift ${n}`, startDate: start || todayKey(), endDate: end || start || todayKey(), startTime, endTime, memberIds: [] }]);
  };
  const patchShift = (id: string, p: Partial<JobShift>) => setShifts((s) => s.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const removeShift = (id: string) => {
    setShifts((s) => s.filter((x) => x.id !== id));
    setCrew((c) => c.filter((x) => x.shiftId !== id));
  };
  /** Adds a member to a shift with default hours on each working day (up to the shift window). */
  const addMember = (shift: JobShift, memberId: string) => {
    if (!memberId || shift.memberIds.includes(memberId)) return;
    const m = team.find((t) => t.id === memberId);
    const window = Math.max(0, clockHours(shift.startTime, shift.endTime));
    const days = workingShiftDays(candidate, shift);
    const entries = days.map((d) => {
      const free = m ? memberDayAvailability(m, d).hours - others.reduce((s, j) => s + (j.status === 'Completed' || j.status === 'Cancelled' ? 0 : memberDayHours(j, memberId, d)), 0) : 0;
      return { memberId, role: m?.role === 'Crew Lead' ? 'Crew Lead' : 'Painter', hours: round1(Math.max(0, Math.min(window, free, 8))), date: d, shiftId: shift.id };
    });
    patchShift(shift.id, { memberIds: [...shift.memberIds, memberId] });
    setCrew((c) => [...c, ...entries]);
    setAdding((a) => ({ ...a, [shift.id]: '' }));
  };
  const removeMember = (shift: JobShift, memberId: string) => {
    patchShift(shift.id, { memberIds: shift.memberIds.filter((x) => x !== memberId) });
    setCrew((c) => c.filter((x) => !(x.shiftId === shift.id && x.memberId === memberId)));
  };
  const setHours = (shiftId: string, memberId: string, day: string, hours: number) => {
    setCrew((c) => {
      const i = c.findIndex((x) => x.shiftId === shiftId && x.memberId === memberId && x.date === day);
      if (i >= 0) return c.map((x, k) => (k === i ? { ...x, hours } : x));
      const role = c.find((x) => x.memberId === memberId)?.role ?? 'Painter';
      return [...c, { memberId, role, hours, date: day, shiftId }];
    });
  };

  // Keep each shift's dated hours inside its (possibly edited) dates.
  useEffect(() => {
    setCrew((c) => c.filter((x) => {
      if (!x.shiftId || !x.date) return true;
      const s = shifts.find((y) => y.id === x.shiftId);
      return !!s && x.date >= s.startDate && x.date <= s.endDate;
    }));
  }, [shifts]);

  const save = () => {
    if (awaitingDeposit) {
      toast('Confirm the deposit before scheduling this job.', 'error');
      return;
    }
    const e: Record<string, string> = {};
    if (!start) e.start = 'Start date is required';
    if (!end) e.end = 'End date is required';
    if (start && end && end < start) e.end = 'End date cannot be before start date';
    if (!(clockHours(startTime, endTime) > 0)) e.endTime = 'End time must be after start time';
    setErrors(e);
    if (Object.keys(e).length) return;
    // Zero-hour days are left out; a member stays on the shift.
    const cleaned = crew.filter((c) => c.hours > 0 || !c.date);
    if (!saveSchedule(job.id, { startDate: start, endDate: end, startTime, endTime, shifts, crew: cleaned })) return;
    toast(job.startDate ? 'Schedule updated' : 'Job scheduled');
    onOpenChange(false);
  };

  const conflictText = (c: ScheduleConflict) => c.message;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={job.startDate ? 'Reschedule Job' : 'Schedule Job'}
      description={`${job.jobNumber} · ${job.title}`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className={cn('text-sm font-semibold', conflicts.length ? 'text-red-600' : 'text-green-700')}>
            {conflicts.length ? `${conflicts.length} availability problem${conflicts.length === 1 ? '' : 's'}` : valid ? 'Crew availability checked' : ''}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={awaitingDeposit} title={awaitingDeposit ? 'Confirm the deposit first' : undefined}>Save Shift</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {awaitingDeposit && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span><b>Waiting for the deposit.</b> The work order can be scheduled once the customer&apos;s deposit is confirmed.</span>
            {canManage && <Button size="sm" onClick={confirmDeposit}>Confirm Deposit</Button>}
          </div>
        )}
        {/* Required vs assigned */}
        <div className="rounded-xl border border-gray-200 p-4" aria-live="polite">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Required Hours</div>
              <div className="text-2xl font-black text-gray-900">{required.toFixed(1)}</div>
              <div className="text-[11px] text-gray-400">From the work order (approved scope)</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Assigned Hours</div>
              <div className={cn('text-2xl font-black', assigned >= required && required > 0 ? 'text-green-600' : 'text-primary-600')}>{assigned.toFixed(1)}</div>
              <div className="text-[11px] text-gray-400">
                {required > 0 ? (assigned >= required ? 'Requirement covered' : `${round1(required - assigned)} h still to assign`) : 'No requirement'}
              </div>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
            <div className={cn('h-full rounded-full', assigned >= required ? 'bg-green-500' : 'bg-primary-500')} style={{ width: `${pct}%` }} />
          </div>
          {changed && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Required hours changed from {changed.from.toFixed(1)} to {changed.to.toFixed(1)} ({changed.diff > 0 ? '+' : ''}{changed.diff.toFixed(1)} h) since this schedule was planned. The schedule was not moved; adjust the crew hours here.
            </p>
          )}
        </div>

        {/* Date range */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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
        {valid && (
          <p className="-mt-3 flex items-center gap-2 text-xs text-gray-500">
            <CalendarClock className="h-4 w-4" /> {fmtSpan(start, end)} · {daysInclusive(start, end)} day{daysInclusive(start, end) === 1 ? '' : 's'}
          </p>
        )}

        {/* Shifts */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] font-black uppercase tracking-[0.12em] text-gray-400">Shifts &amp; crew</div>
            <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={addShift} disabled={!valid}>Add Shift</Button>
          </div>
          {shifts.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-200 p-5 text-center text-sm text-gray-500">
              Add a shift, then add crew members and their hours for each day.
            </p>
          )}
          <div className="space-y-4">
            {shifts.map((sh) => {
              const days = workingShiftDays(candidate, sh);
              const window = clockHours(sh.startTime, sh.endTime);
              const outside = sh.startDate < start || sh.endDate > end;
              return (
                <div key={sh.id} className="rounded-xl border border-gray-200">
                  <div className="grid grid-cols-2 gap-3 border-b border-gray-100 bg-gray-50/60 p-3 md:grid-cols-[1.3fr_1fr_1fr_0.8fr_0.8fr_auto]">
                    <Field label="Shift name"><Input value={sh.name ?? ''} onChange={(e) => patchShift(sh.id, { name: e.target.value })} aria-label="Shift name" /></Field>
                    <Field label="From"><Input type="date" value={sh.startDate} min={start} max={end} onChange={(e) => patchShift(sh.id, { startDate: e.target.value, endDate: e.target.value > sh.endDate ? e.target.value : sh.endDate })} aria-label="Shift start date" /></Field>
                    <Field label="To"><Input type="date" value={sh.endDate} min={sh.startDate} max={end} onChange={(e) => patchShift(sh.id, { endDate: e.target.value })} aria-label="Shift end date" /></Field>
                    <Field label="Start time"><Input type="time" value={sh.startTime} onChange={(e) => patchShift(sh.id, { startTime: e.target.value })} aria-label="Shift start time" /></Field>
                    <Field label="End time"><Input type="time" value={sh.endTime} onChange={(e) => patchShift(sh.id, { endTime: e.target.value })} aria-label="Shift end time" /></Field>
                    <div className="flex items-end justify-end">
                      <button type="button" onClick={() => removeShift(sh.id)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${sh.name || 'shift'}`}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  {outside && <p className="px-3 pt-2 text-xs font-semibold text-red-600">This shift falls outside the job dates.</p>}
                  {!(window > 0) && <p className="px-3 pt-2 text-xs font-semibold text-red-600">The shift end time must be after its start time.</p>}
                  <div className="overflow-x-auto p-3">
                    {sh.memberIds.length > 0 && (
                      <table className="mb-3 w-full text-sm">
                        <thead>
                          <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">
                            <th className="py-1 pr-3">Crew member</th>
                            {days.map((d) => <th key={d} className="px-1 py-1 text-center">{fmtDay(d, { weekday: 'short', month: 'numeric', day: 'numeric' })}</th>)}
                            <th className="px-2 py-1 text-right">Total</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {sh.memberIds.map((mid) => {
                            const m = team.find((t) => t.id === mid);
                            const total = round1(crew.filter((c) => c.shiftId === sh.id && c.memberId === mid).reduce((s, c) => s + c.hours, 0));
                            return (
                              <tr key={mid}>
                                <td className="py-1.5 pr-3">
                                  <span className="flex items-center gap-2 whitespace-nowrap font-medium text-gray-800"><Avatar name={fullName(m)} color={m?.color} size="sm" />{fullName(m)}</span>
                                </td>
                                {days.map((d) => {
                                  const entry = crew.find((c) => c.shiftId === sh.id && c.memberId === mid && c.date === d);
                                  const problem = conflictAt(mid, d);
                                  const off = m ? memberDayAvailability(m, d) : undefined;
                                  return (
                                    <td key={d} className="px-1 py-1.5 text-center">
                                      <input
                                        type="number"
                                        min={0}
                                        step={0.5}
                                        value={entry?.hours ?? 0}
                                        onChange={(e) => setHours(sh.id, mid, d, Math.max(0, Number(e.target.value) || 0))}
                                        aria-label={`${fullName(m)} hours on ${d}`}
                                        title={problem?.message ?? (off?.reason ? `${d}: ${off.reason}` : `${d}: ${round1(off?.hours ?? 0)} h available before other jobs`)}
                                        className={cn(
                                          'h-8 w-14 rounded-md border px-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-primary-300',
                                          problem ? 'border-red-400 bg-red-50 text-red-700' : off?.reason ? 'border-gray-200 bg-gray-100 text-gray-400' : 'border-gray-200',
                                        )}
                                      />
                                    </td>
                                  );
                                })}
                                <td className="px-2 py-1.5 text-right font-bold text-gray-900">{total}h</td>
                                <td className="py-1.5 text-right">
                                  <button type="button" onClick={() => removeMember(sh, mid)} className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500" aria-label={`Remove ${fullName(m)} from ${sh.name || 'shift'}`}><Trash2 className="h-4 w-4" /></button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <NativeSelect
                        value={adding[sh.id] ?? ''}
                        onChange={(e) => addMember(sh, e.target.value)}
                        aria-label={`Add crew member to ${sh.name || 'shift'}`}
                        className="h-9 w-auto min-w-[240px]"
                      >
                        <option value="">+ Add Crew Member…</option>
                        {crewPool.filter((m) => !sh.memberIds.includes(m.id)).map((m) => {
                          const free = round1(days.reduce((s, d) => s + Math.max(0, memberDayAvailability(m, d).hours - others.reduce((n, j) => n + (j.status === 'Completed' || j.status === 'Cancelled' ? 0 : memberDayHours(j, m.id, d)), 0)), 0));
                          return <option key={m.id} value={m.id}>{fullName(m)} · {free}h free on these days</option>;
                        })}
                      </NativeSelect>
                      <span className="text-xs text-gray-400">{days.length} working day{days.length === 1 ? '' : 's'} · {window > 0 ? `${round1(window)} h window` : 'no window'}</span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      &quot;Free&quot; is each member&apos;s available hours on these days (set in Settings › Team Access) minus hours already booked on other jobs. Saving is refused when a day goes over. Hover a day&apos;s hours to see what&apos;s left.
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {loose.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-gray-400"><Users className="h-3.5 w-3.5" /> Crew hours spread over the job</div>
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
              {loose.map((c, i) => {
                const m = look.member(c.memberId);
                return (
                  <div key={`${c.memberId}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <Avatar name={fullName(m)} color={m?.color} size="sm" />
                    <span className="flex-1 font-medium text-gray-700">{fullName(m)} <span className="text-xs text-gray-400">· {c.role}{c.date ? ` · ${c.date}` : ''}</span></span>
                    <Input
                      type="number"
                      min={0}
                      value={c.hours}
                      suffix="hrs"
                      className="h-8 w-28"
                      aria-label={`${fullName(m)} total hours`}
                      onChange={(e) => setCrew((all) => all.map((x) => (x === c ? { ...x, hours: Math.max(0, Number(e.target.value) || 0) } : x)))}
                    />
                    <button type="button" onClick={() => setCrew((all) => all.filter((x) => x !== c))} className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500" aria-label={`Remove ${fullName(m)}`}><Trash2 className="h-4 w-4" /></button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {conflicts.length > 0 ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <div className="mb-1 flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4" /> Not enough availability — this schedule can&apos;t be saved yet</div>
            <ul className="list-disc space-y-0.5 pl-5">
              {conflicts.slice(0, 8).map((c, i) => <li key={i}>{conflictText(c)}</li>)}
              {conflicts.length > 8 && <li>…and {conflicts.length - 8} more</li>}
            </ul>
          </div>
        ) : valid && crew.some((c) => c.hours > 0) ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-green-700"><CheckCircle2 className="h-4 w-4" /> Every crew member has room for these hours.</p>
        ) : null}
      </div>
    </Modal>
  );
}
