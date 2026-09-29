'use client';

/*
  One place for every change we make to a job.

  The job detail page, the scheduling board and the work order screens all
  change jobs. Each change also has side effects: a line in the job's history
  timeline and (for important ones) a line in the dashboard Activity feed.
  Routing every change through this hook keeps those side effects consistent.
*/
import { useCallback } from 'react';
import { useCollection, useLogActivity } from '@/lib/store';
import type { CrewAssignment, Job, JobBreak, JobNote, JobShift, JobStatus } from '@/lib/types';
import { shortDate, uid } from '@/lib/utils';
import { scheduleError } from '@/lib/scheduling';
import { useToast } from '@/components/ui/toast';

export interface ScheduleInput {
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
}

export function useJobActions() {
  const { items, get, update, remove, setAll } = useCollection('jobs');
  const { items: team } = useCollection('team');
  const { toast } = useToast();
  const log = useLogActivity();

  /** Applies a patch and appends a history line. */
  const change = useCallback(
    (id: string, patch: Partial<Job>, historyText?: string) => {
      const job = get(id);
      if (!job) return;
      const history = historyText ? [...job.history, { date: new Date().toISOString(), text: historyText }] : job.history;
      update(id, { ...patch, history });
    },
    [get, update],
  );

  const setStatus = useCallback(
    (id: string, status: JobStatus) => {
      const job = get(id);
      if (!job || job.status === status) return;
      const patch: Partial<Job> = { status };
      // Completed stamps the finish time; leaving Completed clears it.
      if (status === 'Completed') patch.completedAt = new Date().toISOString();
      else if (job.completedAt) patch.completedAt = undefined;
      change(id, patch, `Status changed to ${status}`);
      log(`${job.jobNumber} moved to ${status}`, 'job', id);
    },
    [get, change, log],
  );

  /** Sets dates/times. An Unscheduled or Confirmed job becomes Scheduled. */
  const setSchedule = useCallback(
    (id: string, s: ScheduleInput) => {
      const job = get(id);
      if (!job) return;
      // The required hours this schedule is planned against (patent 15 shows later changes).
      const patch: Partial<Job> = { ...s, scheduleBasisHours: job.scheduleBasisHours ?? job.estimatedHours };
      if (job.scheduleProtected) { toast('Unprotect the schedule before moving this job', 'error'); return false; }
      const error = scheduleError({ ...job, ...patch }, items, team);
      if (error) { toast(error, 'error'); return false; }
      if (job.status === 'Unscheduled' || job.status === 'Confirmed') patch.status = 'Scheduled';
      const verb = job.startDate ? 'Rescheduled' : 'Scheduled';
      change(id, patch, `${verb} for ${shortDate(s.startDate)} - ${shortDate(s.endDate)}`);
      log(`${job.jobNumber} ${verb.toLowerCase()} for ${shortDate(s.startDate)}`, 'job', id);
      return true;
    },
    [get, change, log, items, team, toast],
  );

  /**
   * The scheduling panel's "Save Shift": dates, shifts and per-day crew hours
   * together, checked against every member's availability before saving
   * (lib/scheduling scheduleError). The schedule basis is the current required
   * hours, so a later change order shows up as a change (patent 15).
   */
  const saveSchedule = useCallback(
    (id: string, s: ScheduleInput & { shifts: JobShift[]; crew: CrewAssignment[] }) => {
      const job = get(id);
      if (!job) return false;
      if (job.scheduleProtected && (job.startDate !== s.startDate || job.endDate !== s.endDate)) {
        toast('Unprotect the schedule before moving this job', 'error');
        return false;
      }
      const patch: Partial<Job> = { ...s, scheduleBasisHours: job.estimatedHours };
      const error = scheduleError({ ...job, ...patch }, items, team);
      if (error) { toast(error, 'error'); return false; }
      if (job.status === 'Unscheduled' || job.status === 'Confirmed') patch.status = 'Scheduled';
      const hours = s.crew.reduce((n, c) => n + c.hours, 0);
      change(id, patch, `Scheduled ${shortDate(s.startDate)} - ${shortDate(s.endDate)}: ${s.shifts.length} shift${s.shifts.length === 1 ? '' : 's'}, ${Math.round(hours * 10) / 10} crew hours`);
      log(`${job.jobNumber} ${job.startDate ? 'rescheduled' : 'scheduled'} for ${shortDate(s.startDate)}`, 'job', id);
      return true;
    },
    [get, change, log, items, team, toast],
  );

  /** Clears dates and moves the job back to the Unscheduled backlog. */
  const cancelSchedule = useCallback(
    (id: string) => {
      const job = get(id);
      if (!job) return;
      if (job.scheduleProtected) { toast('Unprotect the schedule before canceling it', 'error'); return false; }
      change(
        id,
        { startDate: undefined, endDate: undefined, startTime: undefined, endTime: undefined, status: 'Unscheduled' },
        'Schedule cancelled — moved back to Unscheduled',
      );
      log(`${job.jobNumber} schedule cancelled`, 'job', id);
    },
    [get, change, log, toast],
  );

  const setCrew = useCallback(
    (id: string, crew: CrewAssignment[], text = 'Crew updated') => {
      const job = get(id);
      if (!job) return false;
      const error = scheduleError({ ...job, crew }, items, team);
      if (error) { toast(error, 'error'); return false; }
      change(id, { crew }, text);
      return true;
    },
    [change, get, items, team, toast],
  );

  const applySchedulePlan = (planned: Job[], reason: string) => {
    const candidates = items.map((j) => planned.find((p) => p.id === j.id) ?? j);
    for (const job of planned) {
      if (get(job.id)?.scheduleProtected) { toast('A selected job is protected', 'error'); return false; }
      const error = scheduleError(job, candidates, team);
      if (error) { toast(error, 'error'); return false; }
    }
    setAll(candidates.map((j) => planned.some((p) => p.id === j.id) ? { ...j, history: [...j.history, { date: new Date().toISOString(), text: `Bulk rescheduled: ${reason}` }] } : j));
    log(`${planned.length} jobs rescheduled: ${reason}`);
    return true;
  };

  const addBreak = useCallback(
    (id: string, b: Omit<JobBreak, 'id'>) => {
      const job = get(id);
      if (!job) return false;
      const breaks = [...job.breaks, { ...b, id: uid('jb') }];
      const error = scheduleError({ ...job, breaks }, items, team);
      if (error) { toast(error, 'error'); return false; }
      change(id, { breaks }, `Paused ${shortDate(b.startDate)} - ${shortDate(b.endDate)} (${b.reason})`);
      return true;
    },
    [get, change, items, team, toast],
  );

  const removeBreak = useCallback(
    (id: string, breakId: string) => {
      const job = get(id);
      if (!job) return false;
      const breaks = job.breaks.filter((b) => b.id !== breakId);
      const error = scheduleError({ ...job, breaks }, items, team);
      if (error) { toast(error, 'error'); return false; }
      change(id, { breaks }, 'Pause period removed');
      return true;
    },
    [get, change, items, team, toast],
  );

  const addNote = useCallback(
    (id: string, note: Omit<JobNote, 'id' | 'date'>) => {
      const job = get(id);
      if (!job) return;
      const full: JobNote = { ...note, id: uid('jn'), date: new Date().toISOString() };
      update(id, { notes: [...job.notes, full] });
    },
    [get, update],
  );

  const removeNote = useCallback(
    (id: string, noteId: string) => {
      const job = get(id);
      if (!job) return;
      update(id, { notes: job.notes.filter((n) => n.id !== noteId) });
    },
    [get, update],
  );

  const deleteJob = useCallback(
    (id: string) => {
      const job = get(id);
      remove(id);
      if (job) log(`${job.jobNumber} deleted`, 'job', id);
    },
    [get, remove, log],
  );

  return { change, setStatus, setSchedule, saveSchedule, applySchedulePlan, cancelSchedule, setCrew, addBreak, removeBreak, addNote, removeNote, deleteJob };
}
