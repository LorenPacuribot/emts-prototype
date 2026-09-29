import type { Job, JobShift } from '@/lib/types';
import { addDays, daysInclusive, memberDayHours, todayKey, workingShiftDays } from './schedule-utils';

/** Convert legacy assignments into a first shift without changing their hours. */
export function scheduleDraft(job: Job, initialStart?: string): Job {
  const start = initialStart ?? job.startDate ?? todayKey();
  const offset = job.startDate ? daysInclusive(job.startDate, start) - 1 : 0;
  const end = job.endDate ? addDays(job.endDate, offset) : start;
  let draft: Job = structuredClone({ ...job, startDate: start, endDate: end, startTime: job.startTime ?? '08:00', endTime: job.endTime ?? '17:00' });
  if (draft.shifts?.length) draft = moveShifts(draft, draft.shifts.map((s) => s.id), offset);
  const loose = draft.crew.filter((c) => !c.shiftId);
  if (loose.length || !draft.shifts?.length && job.startDate) {
    const id = `legacy-${job.id}`;
    const shift: JobShift = { id, name: `Shift ${(draft.shifts?.length ?? 0) + 1}`, startDate: start, endDate: end, startTime: draft.startTime!, endTime: draft.endTime!, memberIds: [...new Set(loose.map((c) => c.memberId))] };
    draft.shifts = [...draft.shifts ?? [], shift];
    draft.crew = draft.crew.map((c) => c.shiftId ? c : { ...c, shiftId: id, date: c.date ? addDays(c.date, offset) : undefined });
  }
  return draft;
}

export function boundSchedule(job: Job): Job {
  if (!job.shifts?.length) return job;
  return { ...job, startDate: job.shifts.map((s) => s.startDate).sort()[0], endDate: job.shifts.map((s) => s.endDate).sort().at(-1), startTime: job.shifts[0]!.startTime, endTime: job.shifts[0]!.endTime };
}

/** All seven calendar days are schedulable, as in the source scheduler. */
export function moveShifts(job: Job, ids: string[], offset: number): Job {
  return boundSchedule({ ...job,
    shifts: job.shifts?.map((s) => !ids.includes(s.id) ? s : { ...s, startDate: addDays(s.startDate, offset), endDate: addDays(s.endDate, offset), dailyHours: s.dailyHours && Object.fromEntries(Object.entries(s.dailyHours).map(([d, v]) => [addDays(d, offset), v])) }),
    crew: job.crew.map((c) => c.shiftId && ids.includes(c.shiftId) && c.date ? { ...c, date: addDays(c.date, offset) } : c),
  });
}

/** Split a calendar into contiguous shift bars, preserving gaps and daily overrides. */
export function calendarSegments(jobs: Job[]): (Job & { segmentId: string; shiftLabel?: string })[] {
  return jobs.flatMap((job) => {
    if (!job.shifts?.length) return [{ ...job, segmentId: job.id }];
    return job.shifts.flatMap((s) => {
      const days = workingShiftDays(job, s);
      const groups: string[][] = [];
      for (const day of days) {
        const last = groups.at(-1);
        if (last && addDays(last.at(-1)!, 1) === day && JSON.stringify(s.dailyHours?.[day]) === JSON.stringify(s.dailyHours?.[last.at(-1)!])) last.push(day);
        else groups.push([day]);
      }
      return groups.map((days) => ({ ...job, segmentId: `${job.id}-${s.id}-${days[0]}`, shiftLabel: s.name ?? 'Shift', startDate: days[0], endDate: days.at(-1), startTime: s.dailyHours?.[days[0]!] ?.startTime ?? s.startTime, endTime: s.dailyHours?.[days[0]!] ?.endTime ?? s.endTime, shifts: [s], crew: job.crew.filter((c) => c.shiftId === s.id || !c.shiftId && s.memberIds.includes(c.memberId)) }));
    });
  });
}

export function datedShiftCrew(job: Job, shift: JobShift) {
  const scoped = { ...job, crew: job.crew.filter((c) => c.shiftId === shift.id) };
  return shift.memberIds.flatMap((memberId) => workingShiftDays(job, shift).map((date) => ({ memberId, shiftId: shift.id, date, role: scoped.crew.find((c) => c.memberId === memberId)?.role ?? 'Painter', hours: memberDayHours(scoped, memberId, date) })));
}
