'use client';

/*
  Calendar boards for Job Scheduling (reference: job-scheduling/v2/components).

  - ScheduleToolbar: prev / "WEEK OF ..." / next, Today, Day-Week-Month tabs, Bulk Reschedule.
  - JobBoard: day columns with jobs as spanning bars (Job view, Day and Week).
  - MonthBoard: Mon-Sun month grid with bars per week row.
  - CrewBoard: one row per crew member, jobs as bars in the member's color,
    plus a weekly load bar (booked vs capacity) next to each name.
  - CrewHoursGrid: per-member, per-day hours chips with capacity totals,
    plus the NEW clocked / approved hours per day (feature 22).
  - UnscheduledPanel: backlog cards you can drag onto a day or click.

  Drag and drop uses plain HTML5 DnD: dropping a job on a day moves its start
  to that day and keeps its length.
*/
import { useEffect, useState, type DragEvent } from 'react';
import { CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Clock, GripVertical, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/display';
import type { Job, TeamMember } from '@/lib/types';
import { cn, fullName } from '@/lib/utils';
import {
  buildLanes, fmtDay, loadTone, memberBookedHours, memberCapacity, memberHoursPerDay, round1, todayKey, workingJobDays,
  type ScheduleRange,
} from './schedule-utils';
import { CrewActualChip, CrewActualLegend } from './CrewActualHours';
import { calendarSegments } from './shift-draft';

export const JOB_DND = 'application/x-emts-job';
const isJobDrag = (e: DragEvent) => Array.from(e.dataTransfer.types).includes(JOB_DND);

/** Clears drag highlight when any drag ends, even if cancelled with Esc. */
function useDragState() {
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    const end = () => { setDragging(false); setHover(null); };
    window.addEventListener('dragend', end);
    window.addEventListener('drop', end);
    return () => { window.removeEventListener('dragend', end); window.removeEventListener('drop', end); };
  }, []);
  return { dragging, setDragging, hover, setHover };
}

const jobRange = (j: Job): [string, string] | null => (j.startDate ? [j.startDate, j.endDate ?? j.startDate] : null);
const jobName = (j: Job) => j.title;
const canDrag = (j: Job) => j.status !== 'Completed';

/* ---------- Toolbar ---------- */

const track = 'flex rounded-xl border border-gray-200 bg-gray-100 p-1';
export const tabCls = (active: boolean) =>
  cn('rounded-lg px-4 py-2 text-sm font-bold capitalize transition-all', active ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-900');

export function ScheduleToolbar({
  range, onRange, refDate, onStep, onToday, onBulk,
}: { range: ScheduleRange; onRange: (r: ScheduleRange) => void; refDate: Date; onStep: (d: -1 | 1) => void; onToday: () => void; onBulk: () => void }) {
  const eyebrow = range === 'month' ? 'Month' : range === 'day' ? 'Day' : 'Week Of';
  const label =
    range === 'day'
      ? refDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : range === 'month'
        ? refDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : (() => {
            const d = new Date(refDate);
            d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
            return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          })();
  const arrow = 'rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100';
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <button type="button" onClick={() => onStep(-1)} aria-label="Previous" className={arrow}><ChevronLeft className="h-6 w-6" /></button>
      <div className="flex-1 text-center">
        <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-gray-500">{eyebrow}</span>
        <h3 className="text-xl font-bold text-gray-900">{label}</h3>
      </div>
      <button type="button" onClick={() => onStep(1)} aria-label="Next" className={arrow}><ChevronRight className="h-6 w-6" /></button>
      <Button variant="secondary" onClick={onToday}>Today</Button>
      <div className={track}>
        {(['day', 'week', 'month'] as const).map((r) => (
          <button key={r} type="button" onClick={() => onRange(r)} className={tabCls(range === r)}>{r}</button>
        ))}
      </div>
      <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
        <Button variant="secondary" icon={<CalendarClock className="h-4 w-4" />} onClick={onBulk}>Bulk Reschedule</Button>
      </div>
    </div>
  );
}

/* ---------- Day header ---------- */

function DayHeader({ day, extra }: { day: string; extra?: React.ReactNode }) {
  const isToday = day === todayKey();
  return (
    <div className="p-3 text-center">
      <div className={cn('text-xxs font-bold uppercase tracking-wide', isToday ? 'text-primary-600' : 'text-gray-500')}>{fmtDay(day, { weekday: 'short' })}</div>
      <div className={cn('mx-auto flex h-8 w-8 items-center justify-center rounded-full text-lg font-black', isToday ? 'bg-primary-600 text-white' : 'text-gray-900')}>
        {fmtDay(day, { day: 'numeric' })}
      </div>
      {extra}
    </div>
  );
}

/* ---------- Job bar ---------- */

function JobBar({ job, color, days, onSelect, compact }: { job: Job & { shiftLabel?: string }; color: string; days: number; onSelect: (id: string) => void; compact?: boolean }) {
  const drag = canDrag(job);
  return (
    <div
      draggable={drag}
      onDragStart={drag ? (e) => { e.dataTransfer.setData(JOB_DND, job.id); e.dataTransfer.effectAllowed = 'move'; } : undefined}
      onClick={() => onSelect(job.id)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(job.id)}
      role="button"
      tabIndex={0}
      title={`${job.title} (${job.jobNumber})${job.scheduleProtected ? ' · Protected: stays on its date in bulk reschedules' : ''}`}
      className={cn(
        'relative flex h-full w-full select-none flex-col justify-center overflow-hidden rounded-lg px-2 py-1 text-xs font-bold text-white shadow-sm hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80',
        drag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer opacity-75',
      )}
      style={{ backgroundColor: color }}
    >
      {!compact && <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs font-black opacity-90">{days}d</span>}
      <span className="flex items-center gap-1 truncate pr-6">
        {job.scheduleProtected && <Lock className="h-3 w-3 shrink-0" aria-label="Protected" />}
        <span className="truncate">{job.title} <span className="font-medium text-white/80">({job.jobNumber})</span></span>
      </span>
      {!compact && job.startTime && <span className="truncate pr-6 text-xs font-semibold opacity-80">{job.shiftLabel && <>{job.shiftLabel} · </>}{fmtTimeShort(job.startTime)} – {fmtTimeShort(job.endTime)}</span>}
    </div>
  );
}

function fmtTimeShort(t?: string) {
  if (!t) return '';
  const [h = 0, m = 0] = t.split(':').map(Number);
  const p = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${p}` : `${h12} ${p}`;
}

/* ---------- Job board (day / week columns) ---------- */

interface BoardProps {
  jobs: Job[];
  colorOf: (j: Job) => string;
  onSelect: (id: string) => void;
  onDrop: (jobId: string, day: string) => void;
}

const ROW = 56;

export function JobBoard({ jobs, dayKeys, colorOf, onSelect, onDrop }: BoardProps & { dayKeys: string[] }) {
  const lanes = buildLanes(calendarSegments(jobs), dayKeys, jobRange, jobName);
  const tracks = lanes.reduce((m, l) => Math.max(m, l.row + 1), 0);
  const cols = dayKeys.length;
  const { dragging, setDragging, hover, setHover } = useDragState();

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm" onDragEnter={(e) => isJobDrag(e) && setDragging(true)}>
      <div className={cols > 1 ? 'min-w-[900px]' : ''}>
        <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {dayKeys.map((d) => <div key={d} className="border-l border-gray-100 first:border-l-0"><DayHeader day={d} /></div>)}
        </div>
        <div className="relative" style={{ height: Math.max(3, tracks) * ROW + 12 }}>
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {dayKeys.map((d) => (
              <div
                key={d}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setHover(d); }}
                onDragLeave={() => setHover((p) => (p === d ? null : p))}
                onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData(JOB_DND); if (id) onDrop(id, d); }}
                className={cn('border-l border-gray-100 first:border-l-0 transition-colors', d === todayKey() && 'bg-primary-50/30', hover === d && 'bg-primary-100 ring-1 ring-inset ring-primary-300')}
              />
            ))}
          </div>
          <div className={cn('absolute inset-0', dragging && 'pointer-events-none')}>
            {lanes.length === 0 && (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">No jobs scheduled in this period. Drag an unscheduled job onto a day.</div>
            )}
            {lanes.map(({ item: j, startCol, span, row }) => (
              <div key={j.segmentId} className="absolute px-1.5" style={{ left: `${(startCol / cols) * 100}%`, width: `${(span / cols) * 100}%`, top: row * ROW + 6, height: ROW - 12 }}>
                <JobBar job={j} color={colorOf(j)} days={workingJobDays(j).length} onSelect={onSelect} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Month board ---------- */

const DATE_BAND = 26;
const BAR = 26;

export function MonthBoard({ jobs, weeks, month, colorOf, onSelect, onDrop }: BoardProps & { weeks: string[][]; month: number }) {
  const { dragging, setDragging, hover, setHover } = useDragState();
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm" onDragEnter={(e) => isJobDrag(e) && setDragging(true)}>
      <div className="grid grid-cols-7 border-b border-gray-100">
        {(weeks[0] ?? []).map((k) => (
          <div key={k} className="border-l border-gray-100 p-2 text-center text-xxs font-black uppercase tracking-widest text-gray-500 first:border-l-0">{fmtDay(k, { weekday: 'short' })}</div>
        ))}
      </div>
      {weeks.map((week, wi) => {
        const lanes = buildLanes(calendarSegments(jobs), week, jobRange, jobName);
        const tracks = lanes.reduce((m, l) => Math.max(m, l.row + 1), 0);
        return (
          <div key={wi} className="relative border-b border-gray-100 last:border-b-0" style={{ minHeight: DATE_BAND + Math.max(2, tracks) * BAR + 6 }}>
            <div className="absolute inset-0 grid grid-cols-7">
              {week.map((k) => {
                const inMonth = Number(k.slice(5, 7)) - 1 === month;
                return (
                  <div
                    key={k}
                    onDragOver={(e) => { e.preventDefault(); setHover(k); }}
                    onDragLeave={() => setHover((p) => (p === k ? null : p))}
                    onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData(JOB_DND); if (id) onDrop(id, k); }}
                    className={cn('border-l border-gray-100 first:border-l-0', !inMonth && 'bg-gray-50/60', hover === k && 'bg-primary-100 ring-1 ring-inset ring-primary-300')}
                  >
                    <div className={cn('p-1.5 text-right text-xs font-bold', inMonth ? 'text-gray-700' : 'text-gray-300')}>
                      <span className={cn(k === todayKey() && 'rounded-full bg-primary-600 px-1.5 py-0.5 text-white')}>{Number(k.slice(8))}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={cn('absolute inset-x-0', dragging && 'pointer-events-none')} style={{ top: DATE_BAND }}>
              {lanes.map(({ item: j, startCol, span, row }) => (
                <button
                  key={j.segmentId}
                  type="button"
                  draggable={canDrag(j)}
                  onDragStart={(e) => { e.dataTransfer.setData(JOB_DND, j.id); setDragging(true); }}
                  onClick={() => onSelect(j.id)}
                  title={`${j.title} (${j.jobNumber})`}
                  className="absolute truncate rounded-md px-2 text-left text-xs font-bold text-white shadow-sm hover:brightness-110"
                  style={{ left: `calc(${(startCol / 7) * 100}% + 2px)`, width: `calc(${(span / 7) * 100}% - 4px)`, top: row * BAR, height: BAR - 4, lineHeight: `${BAR - 4}px`, backgroundColor: colorOf(j) }}
                >
                  {j.title} <span className="font-medium text-white/80">({j.jobNumber})</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Crew board (rows = crew, columns = days) ---------- */

function LoadCell({ member, jobs, dayKeys }: { member: TeamMember; jobs: Job[]; dayKeys: string[] }) {
  const used = memberBookedHours(jobs, member.id, dayKeys);
  const cap = memberCapacity(member, dayKeys.length);
  const tone = loadTone(used, cap);
  return (
    <div className="mt-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className={cn('font-bold tabular-nums', tone.text)}>{used} / {cap}h</span>
        <span className={used > cap ? 'font-bold text-red-500' : 'text-gray-500'}>{used > cap ? `${round1(used - cap)}h over` : `${round1(cap - used)}h free`}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div className={cn('h-full rounded-full', tone.bar)} style={{ width: `${cap ? Math.min(100, (used / cap) * 100) : 0}%` }} />
      </div>
    </div>
  );
}

export function CrewBoard({ jobs, crew, dayKeys, availability, onSelect, onDrop }: Omit<BoardProps, 'colorOf'> & { crew: TeamMember[]; dayKeys: string[]; availability: boolean }) {
  const cols = dayKeys.length;
  const template = `220px repeat(${cols}, minmax(110px, 1fr))`;
  const { dragging, setDragging, hover, setHover } = useDragState();

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm" onDragEnter={(e) => isJobDrag(e) && setDragging(true)}>
      <div className="grid" style={{ gridTemplateColumns: template, minWidth: 220 + cols * 110 }}>
        <div className="border-b border-r border-gray-100 px-4 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Crew</div>
        {dayKeys.map((d) => <div key={d} className="border-b border-l border-gray-100"><DayHeader day={d} /></div>)}

        {crew.length === 0 && <div className="col-span-full p-8 text-center text-sm text-gray-500">No crew members. Mark team members as crew in Settings.</div>}

        {crew.map((m) => {
          const mine = calendarSegments(jobs).filter((j) => j.crew.some((c) => c.memberId === m.id));
          const lanes = buildLanes(mine, dayKeys, jobRange, jobName);
          const tracks = Math.max(1, lanes.reduce((x, l) => Math.max(x, l.row + 1), 0));
          const h = tracks * ROW;
          return (
            <div key={m.id} className="contents">
              <div className="sticky left-0 z-10 border-b border-r border-gray-100 bg-white px-4 py-3" style={{ minHeight: h }}>
                <div className="flex items-center gap-2">
                  <Avatar name={fullName(m)} color={m.color} size="sm" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-gray-800">{fullName(m)}</div>
                    <div className="truncate text-xs text-gray-500">{m.role}</div>
                  </div>
                </div>
                {availability && <LoadCell member={m} jobs={jobs} dayKeys={dayKeys} />}
              </div>
              <div className="relative border-b border-gray-100" style={{ gridColumn: '2 / -1', minHeight: h }}>
                <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                  {dayKeys.map((d) => {
                    const hrs = round1(memberBookedHours(jobs, m.id, [d]));
                    const cap = memberCapacity(m, 1);
                    return (
                      <div
                        key={d}
                        onDragOver={(e) => { e.preventDefault(); setHover(`${m.id}:${d}`); }}
                        onDragLeave={() => setHover((p) => (p === `${m.id}:${d}` ? null : p))}
                        onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData(JOB_DND); if (id) onDrop(id, d); }}
                        className={cn('relative border-l border-gray-100 first:border-l-0', hover === `${m.id}:${d}` && 'bg-primary-100 ring-1 ring-inset ring-primary-300')}
                      >
                        {availability && hrs === 0 && <div className="absolute bottom-1 left-1.5 text-xxs font-semibold uppercase tracking-wide text-gray-300">Free</div>}
                        {availability && hrs > cap && <div className="absolute bottom-1 left-1.5 text-xs font-bold text-red-500">{hrs}h</div>}
                      </div>
                    );
                  })}
                </div>
                <div className={cn('absolute inset-0', dragging && 'pointer-events-none')}>
                  {lanes.map(({ item: j, startCol, span, row }) => (
                    <div key={j.segmentId} className="absolute px-1" style={{ left: `${(startCol / cols) * 100}%`, width: `${(span / cols) * 100}%`, top: row * ROW + 6, height: ROW - 18 }}>
                      <JobBar job={j} color={m.color} days={workingJobDays(j).length} onSelect={onSelect} compact />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Crew hours grid ---------- */

export function CrewHoursGrid({ jobs, crew, dayKeys, onSelect }: { jobs: Job[]; crew: TeamMember[]; dayKeys: string[]; onSelect: (id: string) => void }) {
  const cols = dayKeys.length;
  const dayTotals = dayKeys.map((d) => round1(crew.reduce((s, m) => s + memberBookedHours(jobs, m.id, [d]), 0)));
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm" data-tour="crew-hours">
      <CrewActualLegend />
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="border-b border-gray-200 px-5 py-3 text-left text-xs font-bold uppercase tracking-widest text-gray-500">Member</th>
            <th className="w-48 border-b border-r border-gray-200 px-5 py-3 text-left text-xs font-bold uppercase tracking-widest text-gray-500">Capacity</th>
            {dayKeys.map((d, i) => (
              <th key={d} className="border-b border-gray-200 font-normal">
                <DayHeader day={d} extra={<div className="text-xs font-bold text-gray-500">{dayTotals[i]}h</div>} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {crew.map((m) => (
            <tr key={m.id} className="border-b border-gray-100 last:border-b-0">
              <td className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <Avatar name={fullName(m)} color={m.color} size="sm" />
                  <div><div className="font-bold text-gray-900">{fullName(m)}</div><div className="text-xs text-gray-500">{m.role}</div></div>
                </div>
              </td>
              <td className="border-r border-gray-100 px-5 py-4"><LoadCell member={m} jobs={jobs} dayKeys={dayKeys} /></td>
              {dayKeys.map((d) => {
                const chips = jobs
                  .filter((j) => j.status !== 'Completed' && workingJobDays(j).includes(d) && j.crew.some((c) => c.memberId === m.id))
                  .map((j) => ({ j, h: round1(memberHoursPerDay(j, m.id)) }));
                return (
                  <td key={d} className="px-2 py-3 align-top">
                    <div className="space-y-1.5">
                      {chips.map(({ j, h }) => (
                        <button key={j.id} onClick={() => onSelect(j.id)} title={`${j.title} (${j.jobNumber})`}
                          className="flex w-full items-center justify-between gap-1 rounded-md px-2 py-1 text-xs font-bold text-white hover:brightness-110" style={{ backgroundColor: m.color }}>
                          <span className="truncate">{j.jobNumber.replace('JOB-', '')}</span><span>{h}h</span>
                        </button>
                      ))}
                      <CrewActualChip memberId={m.id} day={d} />
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {cols === 0 && null}
    </div>
  );
}

/* ---------- Unscheduled backlog ---------- */

export function UnscheduledPanel({ jobs, customerName, onSelect }: { jobs: Job[]; customerName: (j: Job) => string; onSelect: (id: string) => void }) {
  return (
    <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-500">Unscheduled Jobs</h3>
      {jobs.length === 0 ? (
        <p className="flex items-center gap-2 text-sm font-medium text-green-600"><CheckCircle2 className="h-4 w-4" /> All jobs are scheduled.</p>
      ) : (
        <div className="grid max-h-80 grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((j) => (
            <div
              key={j.id}
              draggable
              onDragStart={(e) => { e.dataTransfer.setData(JOB_DND, j.id); e.dataTransfer.effectAllowed = 'move'; }}
              onClick={() => onSelect(j.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(j.id)}
              role="button"
              tabIndex={0}
              title={`Drag to schedule ${j.jobNumber} — ${j.title}`}
              className="group relative cursor-grab rounded-xl border border-gray-200 bg-gray-50/60 p-3 pl-4 transition-all hover:border-gray-300 hover:shadow-md active:cursor-grabbing"
            >
              <span className="absolute bottom-2 left-0 top-2 w-1.5 rounded-full bg-gray-400" />
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-gray-900">{j.title}</div>
                  <div className="truncate text-xs text-gray-500">{j.jobNumber} · {customerName(j)}</div>
                </div>
                <GripVertical className="h-4 w-4 shrink-0 text-gray-300 group-hover:text-gray-400" />
              </div>
              {j.estimatedHours > 0 && (
                <div className="mt-2 flex items-center gap-1 text-xs text-gray-500"><Clock className="h-3.5 w-3.5" /> {j.estimatedHours.toFixed(1)}h est.</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
