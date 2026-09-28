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
import type { CrewAssignment, Job, JobBreak, JobNote, JobStatus } from '@/lib/types';
import { shortDate, uid } from '@/lib/utils';

export interface ScheduleInput {
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
}

export function useJobActions() {
  const { get, update, remove } = useCollection('jobs');
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
      const patch: Partial<Job> = { ...s };
      if (job.status === 'Unscheduled' || job.status === 'Confirmed') patch.status = 'Scheduled';
      const verb = job.startDate ? 'Rescheduled' : 'Scheduled';
      change(id, patch, `${verb} for ${shortDate(s.startDate)} - ${shortDate(s.endDate)}`);
      log(`${job.jobNumber} ${verb.toLowerCase()} for ${shortDate(s.startDate)}`, 'job', id);
    },
    [get, change, log],
  );

  /** Clears dates and moves the job back to the Unscheduled backlog. */
  const cancelSchedule = useCallback(
    (id: string) => {
      const job = get(id);
      if (!job) return;
      change(
        id,
        { startDate: undefined, endDate: undefined, startTime: undefined, endTime: undefined, status: 'Unscheduled' },
        'Schedule cancelled — moved back to Unscheduled',
      );
      log(`${job.jobNumber} schedule cancelled`, 'job', id);
    },
    [get, change, log],
  );

  const setCrew = useCallback(
    (id: string, crew: CrewAssignment[], text = 'Crew updated') => change(id, { crew }, text),
    [change],
  );

  const addBreak = useCallback(
    (id: string, b: Omit<JobBreak, 'id'>) => {
      const job = get(id);
      if (!job) return;
      change(id, { breaks: [...job.breaks, { ...b, id: uid('jb') }] }, `Paused ${shortDate(b.startDate)} - ${shortDate(b.endDate)} (${b.reason})`);
    },
    [get, change],
  );

  const removeBreak = useCallback(
    (id: string, breakId: string) => {
      const job = get(id);
      if (!job) return;
      change(id, { breaks: job.breaks.filter((b) => b.id !== breakId) }, 'Pause period removed');
    },
    [get, change],
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

  return { change, setStatus, setSchedule, cancelSchedule, setCrew, addBreak, removeBreak, addNote, removeNote, deleteJob };
}
