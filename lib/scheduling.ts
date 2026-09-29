import type { Job, TeamMember } from './types';
import {
  addDays, dayRange, daysInclusive, entryDays, memberDayHours, parseKey, weekDays, workingJobDays, workingShiftDays,
} from '@/components/scheduling/schedule-utils';

export function assignedHours(job: Job, memberId: string, day: string): number {
  if (job.status === 'Cancelled' || job.status === 'Completed') return 0;
  return memberDayHours(job, memberId, day);
}

const clock = (value?: string) => value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) + Number(value.slice(3)) / 60 : NaN;
const isDay = (value?: string) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parseKey(value).getTime());
const sundayKey = (day: string) => addDays(day, -parseKey(day).getDay());
export const memberName = (m: TeamMember) => `${m.firstName} ${m.lastName}`.trim();

/**
 * What a member can work on one day: time off and non-working days give 0.
 * A saved week schedule (Settings → Team → Schedule Availability) sets that
 * day's hours; otherwise a fifth of the weekly capacity, on the member's
 * default working days (every day when none are set).
 */
export function memberDayAvailability(member: TeamMember, day: string): { hours: number; reason?: string } {
  const off = member.timeOff?.find((t) => day >= t.startDate && day <= t.endDate);
  if (off) return { hours: 0, reason: `time off${off.reason ? ` (${off.reason})` : ''}` };
  const saved = member.schedule?.[sundayKey(day)]?.[parseKey(day).getDay()];
  if (saved) {
    if (!saved.working) return { hours: 0, reason: 'not a working day' };
    const hours = clock(saved.end) - clock(saved.start);
    return { hours: hours > 0 ? hours : 0 };
  }
  if (member.workingDays && !member.workingDays.includes(parseKey(day).getDay())) return { hours: 0, reason: 'not a working day' };
  return { hours: member.capacityHours / 5 };
}

export type ConflictKind = 'time_off' | 'not_working' | 'capacity' | 'window' | 'weekly';
export interface ScheduleConflict { memberId: string; day: string; kind: ConflictKind; message: string }

/** Every member/day problem with a candidate job against the other jobs (none = fits). */
export function scheduleConflicts(candidate: Job, jobs: Job[], team: TeamMember[]): ScheduleConflict[] {
  const out: ScheduleConflict[] = [];
  if (!candidate.startDate || candidate.status === 'Cancelled' || candidate.status === 'Completed') return out;
  const others = jobs.filter((j) => j.id !== candidate.id);
  const jobWindow = clock(candidate.endTime ?? '16:00') - clock(candidate.startTime ?? '08:00');
  for (const memberId of [...new Set(candidate.crew.map((c) => c.memberId))]) {
    const member = team.find((m) => m.id === memberId);
    if (!member) continue;
    const name = memberName(member);
    const entries = candidate.crew.filter((c) => c.memberId === memberId);
    const days = [...new Set(entries.flatMap((c) => entryDays(candidate, c)))].sort();
    const weeksSeen = new Set<string>();
    for (const day of days) {
      const hours = assignedHours(candidate, memberId, day);
      if (hours <= 0.00001) continue;
      const other = others.reduce((sum, j) => sum + assignedHours(j, memberId, day), 0);
      const avail = memberDayAvailability(member, day);
      if (avail.reason) {
        out.push({ memberId, day, kind: avail.reason.startsWith('time off') ? 'time_off' : 'not_working', message: `${name}: ${day} is ${avail.reason}; ${hours.toFixed(2)} hours requested.` });
        continue;
      }
      // Each shift (and the job's own hours) must fit its daily window.
      for (const scope of [...new Set(entries.map((c) => c.shiftId ?? ''))]) {
        const shift = scope ? candidate.shifts?.find((s) => s.id === scope) : undefined;
        const window = shift ? clock(shift.endTime) - clock(shift.startTime) : jobWindow;
        const inScope = memberDayHours({ ...candidate, crew: entries.filter((c) => (c.shiftId ?? '') === scope) }, memberId, day);
        if (inScope > window + 0.00001) out.push({ memberId, day, kind: 'window', message: `${name}: ${day} has ${Math.max(0, window).toFixed(2)} hours in the ${shift ? `"${shift.name || 'Unnamed'}" shift` : 'daily'} window; ${inScope.toFixed(2)} requested.` });
      }
      if (hours + other > avail.hours + 0.00001) {
        out.push({ memberId, day, kind: 'capacity', message: `${name}: ${day} has ${Math.max(0, avail.hours - other).toFixed(2)} hours available; ${hours.toFixed(2)} requested.` });
      }
      const week = weekDays(parseKey(day));
      if (weeksSeen.has(week[0]!)) continue;
      weeksSeen.add(week[0]!);
      const weekly = week.reduce((sum, date) => sum + assignedHours(candidate, memberId, date) + others.reduce((n, j) => n + assignedHours(j, memberId, date), 0), 0);
      if (weekly > member.capacityHours + 0.00001) out.push({ memberId, day, kind: 'weekly', message: `${name}: week of ${week[0]} exceeds ${member.capacityHours} available hours.` });
    }
  }
  return out;
}

/** Validate every affected day before committing a single job or a batch. */
export function scheduleError(candidate: Job, jobs: Job[], team: TeamMember[]): string | undefined {
  if (!candidate.startDate) return undefined;
  const end = candidate.endDate ?? candidate.startDate;
  const duration = daysInclusive(candidate.startDate, end);
  if (!Number.isFinite(duration) || duration < 1 || duration > 3660) return 'Choose a valid date range of at most ten years.';
  const window = clock(candidate.endTime ?? '16:00') - clock(candidate.startTime ?? '08:00');
  if (!(window > 0)) return 'The shift end must be after its start.';
  for (const shift of candidate.shifts ?? []) {
    const label = `Shift "${shift.name || 'Unnamed'}"`;
    if (!isDay(shift.startDate) || !isDay(shift.endDate) || shift.endDate < shift.startDate) return `${label}: choose valid dates.`;
    if (!(clock(shift.endTime) - clock(shift.startTime) > 0)) return `${label}: the end time must be after the start time.`;
    if (shift.startDate < candidate.startDate || shift.endDate > end) return `${label} falls outside the job dates.`;
  }
  const days = workingJobDays(candidate);
  for (const c of candidate.crew) {
    const member = team.find((m) => m.id === c.memberId);
    if (!member || member.status === 'Inactive') return 'Choose an active crew member.';
    if (!Number.isFinite(c.hours) || c.hours < 0) return 'Crew hours must be a non-negative number.';
    const shift = c.shiftId ? candidate.shifts?.find((s) => s.id === c.shiftId) : undefined;
    if (c.shiftId && !shift) return `Hours for ${member.firstName} belong to a shift that no longer exists.`;
    if (shift && !shift.memberIds.includes(c.memberId)) return `${member.firstName} is not on the "${shift.name || 'Unnamed'}" shift.`;
    const scope = shift ? workingShiftDays(candidate, shift) : days;
    if (c.date && !scope.includes(c.date)) return `The assigned day for ${member.firstName} is outside the working schedule.`;
    if (c.hours > 0 && !scope.length) return 'The schedule has no working days.';
  }
  return scheduleConflicts(candidate, jobs, team)[0]?.message;
}

/** Move a job by `offset` days. A job already running on `from` keeps its start and past days. */
export function moveJob(job: Job, offset: number, from?: string): Job {
  const running = !!from && !!job.startDate && job.startDate < from;
  const keep = (day: string) => running && day < from!;
  const shift = (day: string) => (keep(day) ? day : addDays(day, offset));
  return {
    ...job,
    startDate: job.startDate && shift(job.startDate),
    endDate: addDays(job.endDate ?? job.startDate!, offset),
    crew: job.crew.map((c) => ({ ...c, date: c.date && shift(c.date) })),
    breaks: job.breaks.map((b) => ({ ...b, startDate: shift(b.startDate), endDate: shift(b.endDate) })),
    shifts: job.shifts?.map((s) => ({ ...s, startDate: shift(s.startDate), endDate: addDays(s.endDate, keep(s.endDate) ? 0 : offset) })),
  };
}

export interface SchedulePlan {
  jobs: Job[];
  error?: string;
  /** Crew conflicts per job on the requested dates (before any automatic leapfrog). */
  conflicts?: Record<string, ScheduleConflict[]>;
}

const movable = (j: Job) => !j.scheduleProtected && j.status !== 'Completed' && j.status !== 'Cancelled' && !!j.startDate;

/** Keep excluded/protected jobs anchored and search for capacity for each moving job. */
export function planReschedule(jobs: Job[], team: TeamMember[], ids: string[], from: string, shift: number): SchedulePlan {
  if (!isDay(from)) return { jobs: [], error: 'Choose a valid starting date.' };
  if (!Number.isInteger(shift) || shift === 0 || Math.abs(shift) > 366) return { jobs: [], error: 'Choose a whole-day shift between -366 and 366.' };
  const moving = jobs.filter((j) => ids.includes(j.id) && movable(j)).sort((a, b) => a.startDate!.localeCompare(b.startDate!));
  if (shift < 0) moving.reverse();
  const reserved = jobs.filter((j) => !moving.some((m) => m.id === j.id));
  const planned: Job[] = [];
  const conflicts: Record<string, ScheduleConflict[]> = {};
  for (const job of moving) {
    const running = job.startDate! < from;
    let offset = shift;
    let candidate = moveJob(job, offset, from);
    conflicts[job.id] = scheduleConflicts(candidate, reserved, team);
    let error = scheduleError(candidate, reserved, team);
    for (let attempt = 0; error && !running && attempt < 366; attempt++) {
      offset += Math.sign(shift);
      candidate = moveJob(job, offset, from);
      error = scheduleError(candidate, reserved, team);
    }
    if (error) return { jobs: [], error: `${job.jobNumber}: ${error}`, conflicts };
    planned.push(candidate);
    reserved.push(candidate);
  }
  return { jobs: planned, conflicts };
}

/** Move each job to its own new start date. Nothing leapfrogs: every conflict is reported on its row. */
export function planSpecificDates(jobs: Job[], team: TeamMember[], moves: Record<string, string>): SchedulePlan & { rowErrors: Record<string, string> } {
  const rowErrors: Record<string, string> = {};
  const conflicts: Record<string, ScheduleConflict[]> = {};
  const moving = jobs.filter((j) => j.id in moves);
  for (const j of moving) {
    if (!movable(j)) rowErrors[j.id] = j.scheduleProtected ? 'Protected: unprotect it to move it.' : 'This job cannot be moved.';
    else if (!isDay(moves[j.id])) rowErrors[j.id] = 'Choose a new start date.';
  }
  const ok = moving.filter((j) => !rowErrors[j.id]).sort((a, b) => moves[a.id]!.localeCompare(moves[b.id]!));
  const reserved = jobs.filter((j) => !ok.some((m) => m.id === j.id));
  const planned: Job[] = [];
  for (const job of ok) {
    const candidate = moveJob(job, daysInclusive(job.startDate!, moves[job.id]!) - 1);
    conflicts[job.id] = scheduleConflicts(candidate, reserved, team);
    const error = scheduleError(candidate, reserved, team);
    planned.push(candidate);
    // A row that can't move stays where it is, so later rows are checked against its current dates.
    if (error) {
      rowErrors[job.id] = error;
      reserved.push(job);
    } else reserved.push(candidate);
  }
  const first = Object.entries(rowErrors)[0];
  const jobNumber = (id: string) => jobs.find((j) => j.id === id)?.jobNumber ?? id;
  return first ? { jobs: [], error: `${jobNumber(first[0])}: ${first[1]}`, conflicts, rowErrors } : { jobs: planned, conflicts, rowErrors };
}

/** Required hours changed since the schedule was planned (approved change order or amended estimate). */
export function requiredHoursChange(job: Pick<Job, 'estimatedHours' | 'scheduleBasisHours'>): { from: number; to: number; diff: number } | undefined {
  const from = job.scheduleBasisHours;
  if (from === undefined || !Number.isFinite(from) || Math.abs(from - job.estimatedHours) < 0.005) return undefined;
  return { from, to: job.estimatedHours, diff: Math.round((job.estimatedHours - from) * 100) / 100 };
}

/** Member-day availability problems over a span, for flags that are independent of other jobs. */
export function availabilityConflicts(member: TeamMember, start: string, end: string): { day: string; reason: string }[] {
  if (!isDay(start) || !isDay(end) || end < start || daysInclusive(start, end) > 3660) return [];
  return dayRange(start, end).map((day) => ({ day, reason: memberDayAvailability(member, day).reason })).filter((x): x is { day: string; reason: string } => !!x.reason);
}
