import type { Job, TeamMember } from './types';
import { addDays, daysInclusive, parseKey, weekDays, workingJobDays } from '@/components/scheduling/schedule-utils';

export function assignedHours(job: Job, memberId: string, day: string): number {
  const days = workingJobDays(job);
  if (!days.includes(day) || job.status === 'Cancelled' || job.status === 'Completed') return 0;
  return job.crew.filter((c) => c.memberId === memberId).reduce((sum, c) =>
    sum + (c.date ? (c.date === day ? c.hours : 0) : c.hours / days.length), 0);
}

/** Validate every affected day before committing a single job or a batch. */
export function scheduleError(candidate: Job, jobs: Job[], team: TeamMember[]): string | undefined {
  if (!candidate.startDate) return undefined;
  const end = candidate.endDate ?? candidate.startDate;
  const duration = daysInclusive(candidate.startDate, end);
  if (!Number.isFinite(duration) || duration < 1 || duration > 3660) return 'Choose a valid date range of at most ten years.';
  const clock = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) + Number(value.slice(3)) / 60 : NaN;
  const window = clock(candidate.endTime ?? '16:00') - clock(candidate.startTime ?? '08:00');
  if (!(window > 0)) return 'The shift end must be after its start.';
  const days = workingJobDays(candidate);
  for (const c of candidate.crew) {
    const member = team.find((m) => m.id === c.memberId);
    if (!member || member.status === 'Inactive') return 'Choose an active crew member.';
    if (!Number.isFinite(c.hours) || c.hours < 0) return 'Crew hours must be a non-negative number.';
    if (c.date && !days.includes(c.date)) return `The assigned day for ${member.firstName} is outside the working schedule.`;
    if (c.hours > 0 && !days.length) return 'The schedule has no working days.';
    for (const day of days) {
      const hours = assignedHours(candidate, c.memberId, day);
      const other = jobs.filter((j) => j.id !== candidate.id).reduce((sum, j) => sum + assignedHours(j, c.memberId, day), 0);
      // A normal five-day work week supplies the daily limit; weekends remain schedulable.
      const capacity = member.capacityHours / 5;
      if (hours > window + 0.00001 || hours + other > capacity + 0.00001) {
        return `${member.firstName} ${member.lastName}: ${day} has ${Math.max(0, Math.min(window, capacity - other)).toFixed(2)} hours available; ${hours.toFixed(2)} requested.`;
      }
      const week = weekDays(parseKey(day));
      const weekly = week.reduce((sum, date) => sum + assignedHours(candidate, c.memberId, date)
        + jobs.filter((j) => j.id !== candidate.id).reduce((n, j) => n + assignedHours(j, c.memberId, date), 0), 0);
      if (weekly > member.capacityHours + 0.00001) return `${member.firstName} ${member.lastName}: week of ${week[0]} exceeds ${member.capacityHours} available hours.`;
    }
  }
}

export interface SchedulePlan { jobs: Job[]; error?: string }

/** Keep excluded/protected jobs anchored and search for capacity for each moving job. */
export function planReschedule(jobs: Job[], team: TeamMember[], ids: string[], from: string, shift: number): SchedulePlan {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !Number.isFinite(parseKey(from).getTime())) return { jobs: [], error: 'Choose a valid starting date.' };
  if (!Number.isInteger(shift) || shift === 0 || Math.abs(shift) > 366) return { jobs: [], error: 'Choose a whole-day shift between -366 and 366.' };
  const moving = jobs.filter((j) => ids.includes(j.id) && !j.scheduleProtected && j.status !== 'Completed' && j.status !== 'Cancelled' && j.startDate)
    .sort((a, b) => a.startDate!.localeCompare(b.startDate!));
  if (shift < 0) moving.reverse();
  const reserved = jobs.filter((j) => !moving.some((m) => m.id === j.id));
  const planned: Job[] = [];
  for (const job of moving) {
    const running = job.startDate! < from;
    const moveBy = (offset: number): Job => ({ ...job,
      startDate: running ? job.startDate : addDays(job.startDate!, offset),
      endDate: addDays(job.endDate ?? job.startDate!, offset),
      crew: job.crew.map((c) => ({ ...c, date: c.date && (!running || c.date >= from) ? addDays(c.date, offset) : c.date })),
      breaks: job.breaks.map((b) => ({ ...b,
        startDate: !running || b.startDate >= from ? addDays(b.startDate, offset) : b.startDate,
        endDate: !running || b.endDate >= from ? addDays(b.endDate, offset) : b.endDate,
      })),
    });
    let offset = shift;
    let candidate = moveBy(offset);
    let error = scheduleError(candidate, reserved, team);
    for (let attempt = 0; error && !running && attempt < 366; attempt++) {
      offset += Math.sign(shift);
      candidate = moveBy(offset);
      error = scheduleError(candidate, reserved, team);
    }
    if (error) return { jobs: [], error: `${job.jobNumber}: ${error}` };
    planned.push(candidate);
    reserved.push(candidate);
  }
  return { jobs: planned };
}
