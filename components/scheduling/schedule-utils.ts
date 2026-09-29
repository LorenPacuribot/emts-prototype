/*
  Date and workload helpers shared by Jobs, Job Scheduling and Work Orders.

  Why this exists: several screens need the same answers ("which days does
  this job cover?", "how many hours is Mike booked this week?"). Keeping the
  math here means the board, the job detail page and the crew modal always
  agree.

  Conventions
  - Day keys are local 'YYYY-MM-DD' strings. Weeks run Monday to Sunday.
  - Weekends are schedulable (the live app treats all 7 days as work days).
  - A crew assignment's `hours` is the member's total hours on that job. It is
    spread evenly over the job's days when we need per-day or per-week numbers.
*/
import type { CrewAssignment, Job, JobShift, JobStatus, TeamMember } from '@/lib/types';
import { toISODate } from '@/lib/utils';

/* ---------- Day keys ---------- */

export const todayKey = () => toISODate(new Date());

/** 'YYYY-MM-DD' -> Date at local noon (avoids DST/timezone edge cases). */
export function parseKey(key: string): Date {
  return new Date(`${key.slice(0, 10)}T12:00:00`);
}

export function addDays(key: string, n: number): string {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Inclusive number of days from a to b (1 when a === b). */
export function daysInclusive(a: string, b: string): number {
  return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86_400_000) + 1;
}

/** Every day key from start to end, inclusive. */
export function dayRange(start: string, end: string): string[] {
  const out: string[] = [];
  const n = Math.max(1, daysInclusive(start, end));
  for (let i = 0; i < n; i++) out.push(addDays(start, i));
  return out;
}

/** The 7 Monday-to-Sunday day keys of the week `ref` falls in. */
export function weekDays(ref: Date): string[] {
  const monday = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 12);
  const back = monday.getDay() === 0 ? 6 : monday.getDay() - 1;
  monday.setDate(monday.getDate() - back);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toISODate(d);
  });
}

/** Monday-to-Sunday rows that cover the month `ref` is in. */
export function monthWeeks(ref: Date): string[][] {
  const first = new Date(ref.getFullYear(), ref.getMonth(), 1, 12);
  const last = toISODate(new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 12));
  const rows: string[][] = [];
  let week = weekDays(first);
  while (week[0]! <= last) {
    rows.push(week);
    week = week.map((k) => addDays(k, 7));
  }
  return rows;
}

export type ScheduleRange = 'day' | 'week' | 'month';

/** Move the reference date one day, week or month forward/back. */
export function stepDate(ref: Date, range: ScheduleRange, dir: -1 | 1): Date {
  const next = new Date(ref);
  if (range === 'day') next.setDate(next.getDate() + dir);
  else if (range === 'week') next.setDate(next.getDate() + dir * 7);
  else next.setMonth(next.getMonth() + dir);
  return next;
}

/** "Mon", "Sep 29", "Tue, Sep 29, 2026" style labels for a day key. */
export function fmtDay(key: string, opts: Intl.DateTimeFormatOptions) {
  return parseKey(key).toLocaleDateString('en-US', opts);
}

/** "8:00 AM" from "08:00". Empty string when missing. */
export function fmtTime(hhmm?: string) {
  if (!hhmm) return '';
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** "Sep 29 – Oct 3" (or a single day). */
export function fmtSpan(start?: string, end?: string) {
  if (!start) return '—';
  const a = fmtDay(start, { month: 'short', day: 'numeric' });
  const b = fmtDay(end ?? start, { month: 'short', day: 'numeric' });
  return a === b ? a : `${a} – ${b}`;
}

/* ---------- Jobs ---------- */

/** Statuses that count as "on the board" (have or can have dates). */
export const ACTIVE_JOB_STATUSES: JobStatus[] = [
  'Unscheduled', 'Confirmed', 'Scheduled', 'In Production', 'Touch Up', 'Ready for Inspection',
];

export const isScheduled = (j: Job) => !!j.startDate && j.status !== 'Cancelled';

/** Day keys a job covers (empty when unscheduled). */
export function jobDays(j: Job): string[] {
  if (!j.startDate) return [];
  return dayRange(j.startDate, j.endDate ?? j.startDate);
}

/** Days the crew actually works: job days minus any break/pause periods. */
export function workingJobDays(j: Job): string[] {
  const off = new Set(j.breaks.flatMap((b) => dayRange(b.startDate, b.endDate)));
  return jobDays(j).filter((d) => !off.has(d));
}

/** Days a shift (portion) covers, minus the job's break periods. */
export function workingShiftDays(j: Job, shift: JobShift): string[] {
  const off = new Set(j.breaks.flatMap((b) => dayRange(b.startDate, b.endDate)));
  return dayRange(shift.startDate, shift.endDate).filter((d) => !off.has(d));
}

/** The days one crew entry's hours are spread over: its shift's days, else the job's. */
export function entryDays(j: Job, c: CrewAssignment): string[] {
  const shift = c.shiftId ? j.shifts?.find((s) => s.id === c.shiftId) : undefined;
  return shift ? workingShiftDays(j, shift) : workingJobDays(j);
}

/** Hours one member works on one day of a job: dated entries count on their day, undated ones spread evenly. */
export function memberDayHours(j: Job, memberId: string, day: string): number {
  return j.crew.filter((c) => c.memberId === memberId).reduce((sum, c) => {
    const days = entryDays(j, c);
    if (!days.includes(day)) return sum;
    return sum + (c.date ? (c.date === day ? c.hours : 0) : c.hours / days.length);
  }, 0);
}

/** Total hours assigned to a job across every crew entry. */
export const assignedTotal = (j: Pick<Job, 'crew'>) => round1(j.crew.reduce((s, c) => s + (Number.isFinite(c.hours) ? c.hours : 0), 0));

/** Average hours per working day for one crew member on one job. */
export function memberHoursPerDay(j: Job, memberId: string): number {
  const days = workingJobDays(j);
  if (!days.length) return 0;
  return days.reduce((s, d) => s + memberDayHours(j, memberId, d), 0) / days.length;
}

/** Hours a member is booked on the given days across all scheduled jobs. */
export function memberBookedHours(jobs: Job[], memberId: string, dayKeys: string[], excludeJobId?: string): number {
  const set = new Set(dayKeys);
  let total = 0;
  for (const j of jobs) {
    if (j.id === excludeJobId || !isScheduled(j) || j.status === 'Completed') continue;
    if (!j.crew.some((c) => c.memberId === memberId)) continue;
    for (const d of set) total += memberDayHours(j, memberId, d);
  }
  return round1(total);
}

/** Capacity (hours) a member has over a set of days, from weekly capacityHours. */
export function memberCapacity(m: TeamMember, dayCount: number): number {
  return round1(Math.min(m.capacityHours, (m.capacityHours / 5) * dayCount));
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Default job length in days when first scheduling (8h crew-days, at least 1). */
export function defaultDurationDays(j: Job): number {
  const crewSize = Math.max(1, j.crew.length);
  return Math.max(1, Math.ceil(j.estimatedHours / (8 * crewSize)));
}

/** Board color for a job: its first crew member's color, else gray. */
export function jobColor(j: Job, member: (id?: string) => TeamMember | undefined): string {
  return member(j.crew[0]?.memberId)?.color ?? '#6B7280';
}

/* ---------- Board lanes ---------- */

export interface Lane<T> {
  item: T;
  startCol: number;
  span: number;
  row: number;
}

/**
 * Places date ranges onto visible day columns as spanning bars.
 * Overlapping bars are packed onto separate rows so they never collide.
 */
export function buildLanes<T>(items: T[], dayKeys: string[], range: (t: T) => [string, string] | null, name: (t: T) => string): Lane<T>[] {
  const lanes: Lane<T>[] = [];
  for (const item of items) {
    const r = range(item);
    if (!r) continue;
    const idxs = dayKeys.map((k, i) => (k >= r[0] && k <= r[1] ? i : -1)).filter((i) => i >= 0);
    if (!idxs.length) continue;
    lanes.push({ item, startCol: idxs[0]!, span: idxs[idxs.length - 1]! - idxs[0]! + 1, row: 0 });
  }
  lanes.sort((a, b) => a.startCol - b.startCol || name(a.item).localeCompare(name(b.item)));
  const rowEnds: number[] = [];
  for (const l of lanes) {
    let row = rowEnds.findIndex((end) => end < l.startCol);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(-1);
    }
    rowEnds[row] = l.startCol + l.span - 1;
    l.row = row;
  }
  return lanes;
}

/** Capacity bar colors: green under 80%, amber to 100%, red over. */
export function loadTone(used: number, cap: number) {
  if (cap <= 0) return { bar: 'bg-gray-300', text: 'text-gray-500' };
  const pct = used / cap;
  if (pct > 1) return { bar: 'bg-red-500', text: 'text-red-600' };
  if (pct >= 0.8) return { bar: 'bg-amber-500', text: 'text-amber-600' };
  return { bar: 'bg-green-500', text: 'text-green-600' };
}
