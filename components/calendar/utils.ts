/*
  Calendar helpers: turns store records into one "calendar item" shape,
  plus date and time math used by the month, week, day and dispatch views.

  Two sources, matching the live app's two tabs:
    - Estimates tab (Sales): calendar events from the 'events' collection.
    - Production tab: scheduled jobs, shown across their start..end dates.
*/
import type { CalendarEvent, Customer, Job, TeamMember } from '@/lib/types';
import { fullName, toISODate } from '@/lib/utils';

export type CalendarTab = 'Sales' | 'Production';
export type ViewRange = 'Month' | 'Week' | 'Day';

export const EVENT_TYPES: CalendarEvent['type'][] = ['Estimate Appointment', 'Follow Up', 'Meeting', 'Job'];

export interface CalItem {
  id: string;
  kind: 'event' | 'job';
  title: string;
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string;
  /** HH:mm, only for events */
  startTime?: string;
  endTime?: string;
  status: string;
  type: string;
  assignees: string[];
  address?: string;
  event?: CalendarEvent;
  job?: Job;
}

/* Colors per team member (same palette as the live calendar). */
export const PERSON_COLORS = [
  'bg-violet-50 border-violet-500 text-violet-900',
  'bg-sky-50 border-sky-500 text-sky-900',
  'bg-rose-50 border-rose-500 text-rose-900',
  'bg-amber-50 border-amber-500 text-amber-900',
  'bg-teal-50 border-teal-500 text-teal-900',
  'bg-fuchsia-50 border-fuchsia-500 text-fuchsia-900',
  'bg-cyan-50 border-cyan-500 text-cyan-900',
  'bg-orange-50 border-orange-500 text-orange-900',
  'bg-lime-50 border-lime-500 text-lime-900',
  'bg-indigo-50 border-indigo-500 text-indigo-900',
];
export const PERSON_SWATCHES = [
  'bg-violet-500', 'bg-sky-500', 'bg-rose-500', 'bg-amber-500', 'bg-teal-500',
  'bg-fuchsia-500', 'bg-cyan-500', 'bg-orange-500', 'bg-lime-500', 'bg-indigo-500',
];
const COMPLETED = 'bg-green-50 border-green-500 text-green-900';
const IN_PROGRESS = 'bg-yellow-50 border-yellow-500 text-yellow-900';
const DEFAULT_JOB = 'bg-blue-50 border-blue-500 text-blue-900';

export function colorFor(item: CalItem, staffIndex: Record<string, number>) {
  if (item.status === 'Completed') return COMPLETED;
  if (item.kind === 'job') {
    if (item.status === 'In Production') return IN_PROGRESS;
    const first = item.assignees[0];
    return first !== undefined && staffIndex[first] !== undefined ? PERSON_COLORS[staffIndex[first]! % PERSON_COLORS.length]! : DEFAULT_JOB;
  }
  const a = item.assignees[0];
  return a !== undefined && staffIndex[a] !== undefined ? PERSON_COLORS[staffIndex[a]! % PERSON_COLORS.length]! : 'bg-purple-50 border-purple-500 text-purple-900';
}

export function eventToItem(ev: CalendarEvent): CalItem {
  return {
    id: ev.id, kind: 'event', title: ev.title, startDate: ev.date, endDate: ev.date,
    startTime: ev.startTime, endTime: ev.endTime, status: ev.status ?? 'Scheduled', type: ev.type,
    assignees: ev.assignedTo ? [ev.assignedTo] : [], address: ev.address, event: ev,
  };
}

export function jobToItem(job: Job, customer?: Customer): CalItem | null {
  if (!job.startDate || job.status === 'Cancelled') return null;
  return {
    id: `job_${job.id}`, kind: 'job', title: `${job.jobNumber} ${fullName(customer)}`,
    startDate: job.startDate, endDate: job.endDate ?? job.startDate,
    startTime: job.startTime, endTime: job.endTime, status: job.status, type: 'Job',
    assignees: [...new Set(job.crew.map((c) => c.memberId))], address: job.address, job,
  };
}

/* ---------- Dates ---------- */

export const parseDay = (iso: string) => new Date(iso + 'T12:00:00');
export const dayKey = (d: Date) => toISODate(d);
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);

/** Sunday-start week, as the live month grid and week view use. */
export function weekDays(d: Date) {
  const start = addDays(d, -d.getDay());
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function itemOnDay(item: CalItem, key: string) {
  return item.startDate <= key && item.endDate >= key;
}

/* ---------- Times ---------- */

export const toMinutes = (hhmm?: string) => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const fromMinutes = (mins: number) => {
  const m = Math.max(0, Math.min(24 * 60 - 1, mins));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export function time12(hhmm?: string) {
  if (!hhmm) return '';
  const mins = toMinutes(hhmm);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export const hourLabel = (h: number) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);

/**
 * Side-by-side layout for overlapping timed items in one day column.
 * Returns column index and column count for each item id.
 */
export function overlapLayout(items: CalItem[]) {
  const sorted = [...items].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  const result: Record<string, { col: number; cols: number }> = {};
  let group: CalItem[] = [];
  let groupEnd = -1;
  const flush = () => {
    const colEnds: number[] = [];
    const assigned: [string, number][] = [];
    for (const it of group) {
      const s = toMinutes(it.startTime);
      let col = colEnds.findIndex((end) => end <= s);
      if (col === -1) col = colEnds.length;
      colEnds[col] = Math.max(toMinutes(it.endTime), s + 15);
      assigned.push([it.id, col]);
    }
    for (const [id, col] of assigned) result[id] = { col, cols: colEnds.length };
    group = [];
    groupEnd = -1;
  };
  for (const it of sorted) {
    const s = toMinutes(it.startTime);
    if (group.length && s >= groupEnd) flush();
    group.push(it);
    groupEnd = Math.max(groupEnd, Math.max(toMinutes(it.endTime), s + 15));
  }
  if (group.length) flush();
  return result;
}

export function staffIndexMap(team: TeamMember[]) {
  const map: Record<string, number> = {};
  team.forEach((t, i) => (map[t.id] = i));
  return map;
}
