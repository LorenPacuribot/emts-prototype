'use client';

/*
  Side panels and modals for the Job Scheduling board.

  - JobDetailsPanel: right slide-over opened by clicking a job. "Details" tab
    (customer, address, crew, dates, duration, daily hours, priority, status)
    and "Notes" tab. Footer: Schedule/Reschedule, Manage crew, Cancel schedule,
    View full details. Reference: v2/components/details/JobDetailsPanel.tsx.
  - BulkRescheduleModal: shift every scheduled job starting on or after a
    date by N days (rain delay, crew out). Completed jobs are skipped.
*/
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle, Calendar, ChevronRight, Clock, Flag, Lock, MapPin, Trash2, Unlock, User, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/display';
import { Checkbox, Field, Input, NativeSelect, Textarea } from '@/components/ui/form';
import { Modal } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { JobStatusBadge, JOB_STAGE_DOT } from '@/components/jobs/JobStatusBadge';
import { useJobActions } from '@/components/jobs/useJobActions';
import { useCollection, useCurrentUser, useLookups } from '@/lib/store';
import type { Job } from '@/lib/types';
import { cn, fullName, longDate } from '@/lib/utils';
import { usText } from '@/features/lib/display-text';
import { addDays, daysInclusive, fmtDay, fmtSpan, fmtTime, workingJobDays, workingShiftDays, shiftWindow } from './schedule-utils';
import { planReschedule, planSpecificDates } from '@/lib/scheduling';

const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const;

function Row({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
      <div className="w-24 shrink-0 text-sm text-gray-500">{label}</div>
      <div className="min-w-0 flex-1 text-sm font-medium text-gray-900">{children}</div>
    </div>
  );
}
const NotScheduled = () => <span className="font-normal text-gray-500">Not scheduled</span>;

export function JobDetailsPanel({
  job, onClose, onReschedule, onManageCrew, onCancel,
}: { job: Job | null; onClose: () => void; onReschedule: () => void; onManageCrew: () => void; onCancel: () => void }) {
  const look = useLookups();
  const me = useCurrentUser();
  const { change, addNote, removeNote } = useJobActions();
  const { toast } = useToast();
  const [tab, setTab] = useState<'details' | 'notes'>('details');
  const [text, setText] = useState('');

  useEffect(() => { setTab('details'); setText(''); }, [job?.id]);
  useEffect(() => {
    if (!job) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [job, onClose]);

  if (!job) return null;
  const customer = look.customer(job.customerId);
  const days = workingJobDays(job);
  const notes = [...job.notes].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full flex-col border-l border-gray-200 bg-white shadow-2xl sm:w-[440px]">
        <div className="border-b border-gray-100 px-5 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', JOB_STAGE_DOT[job.status])} title={usText(job.status)} aria-hidden />
              <h2 className="truncate font-heading text-xl font-black text-gray-900">{job.title}</h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
          </div>
          <div className="ml-5 mt-1 text-sm font-medium text-gray-500">{job.jobNumber}</div>
          <div className="-mb-px mt-3 flex gap-5">
            {(['details', 'notes'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={cn('border-b-2 pb-2.5 text-sm font-bold capitalize', tab === t ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-600')}>
                {t}
                {t === 'notes' && notes.length > 0 && <span className="ml-1.5 inline-flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-primary-500 px-1 text-xs font-black text-white">{notes.length}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'details' ? (
            <div className="space-y-4">
              <Row icon={User} label="Customer">{fullName(customer)}{customer?.phone && <span className="font-normal text-gray-500"> · {customer.phone}</span>}</Row>
              <Row icon={MapPin} label="Address">{job.address || <span className="font-normal text-gray-500">-</span>}</Row>
              <Row icon={Users} label="Crew">
                {job.crew.length ? (
                  <div className="flex flex-col gap-1.5">
                    {job.crew.filter((c, i, all) => all.findIndex((x) => x.memberId === c.memberId) === i).map((c) => {
                      const m = look.member(c.memberId);
                      return (
                        <div key={c.memberId} className="flex items-center gap-2">
                          <Avatar name={fullName(m)} color={m?.color} size="sm" />
                          <div><div className="text-sm font-medium text-gray-700">{fullName(m)}</div><div className="text-xs font-normal text-gray-500">{c.role} · {Math.round(job.crew.filter((entry) => entry.memberId === c.memberId).reduce((n, entry) => n + entry.hours, 0) * 10) / 10}h</div></div>
                        </div>
                      );
                    })}
                  </div>
                ) : <span className="font-normal text-gray-500">No crew assigned</span>}
              </Row>
              <Row icon={Calendar} label="Start date">{job.startDate ? fmtDay(job.startDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : <NotScheduled />}</Row>
              <Row icon={Calendar} label="End date">{job.startDate ? fmtDay(job.endDate ?? job.startDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : <NotScheduled />}</Row>
              <Row icon={Clock} label="Duration">{job.startDate ? `${days.length} working day${days.length === 1 ? '' : 's'}` : <span className="font-normal text-gray-500">—</span>}</Row>
              <Row icon={Clock} label="Daily hours">
                {job.startDate && job.shifts?.length ? <div className="space-y-2">{job.shifts.flatMap((shift) => workingShiftDays(job, shift).map((day) => { const w = shiftWindow(shift, day); return <div key={shift.id + day} className="flex justify-between gap-2 text-xs"><span className="text-gray-500">{fmtDay(day, { weekday: 'short', month: 'short', day: 'numeric' })}</span><span>{fmtTime(w.startTime)} – {fmtTime(w.endTime)}</span></div>; }))}</div> : job.startDate ? (job.startTime ? `${fmtTime(job.startTime)} – ${fmtTime(job.endTime)}` : <span className="font-normal text-gray-500">Time not set</span>) : <NotScheduled />}
              </Row>
              {job.breaks.length > 0 && (
                <Row icon={Calendar} label="Pauses">
                  {job.breaks.map((b) => <div key={b.id} className="font-normal text-gray-600">{fmtSpan(b.startDate, b.endDate)} · {b.reason}</div>)}
                </Row>
              )}
              <Row icon={Flag} label="Priority">
                <NativeSelect value={job.priority ?? 'Normal'} className="h-8 text-xs"
                  onChange={(e) => { change(job.id, { priority: e.target.value as Job['priority'] }, `Priority set to ${e.target.value}`); toast('Priority updated'); }}>
                  {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                </NativeSelect>
              </Row>
              <Row icon={Activity} label="Status"><JobStatusBadge status={job.status} /></Row>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note for the crew…" className="min-h-[72px]" />
                <div className="flex justify-end">
                  <Button size="sm" disabled={!text.trim()} onClick={() => { addNote(job.id, { text: text.trim(), type: 'note', authorId: me.id }); setText(''); toast('Note added'); }}>Add note</Button>
                </div>
              </div>
              {notes.length === 0 ? <p className="text-sm text-gray-500">No notes yet.</p> : notes.map((n) => {
                const a = look.member(n.authorId);
                return (
                  <div key={n.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="mb-1 flex items-center gap-2 text-xs">
                      <span className="font-bold text-gray-900">{fullName(a)}</span>
                      <span className="text-gray-500">{longDate(n.date)}</span>
                      <button onClick={() => { removeNote(job.id, n.id); toast('Note deleted'); }} className="ml-auto text-gray-300 hover:text-red-500" aria-label="Delete note"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-gray-700">{n.text}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-2 border-t border-gray-100 p-5">
          <Button className="w-full" onClick={onReschedule}>{job.startDate ? 'View shifts' : 'Schedule Job'}</Button>
          {job.startDate && <Button variant="danger" className="w-full" onClick={onCancel}>Cancel schedule</Button>}
          <Link href={`/jobs/${job.id}`} className="flex h-10 w-full items-center justify-center rounded-lg text-sm font-semibold text-primary-600 hover:underline">
            View full details <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ---------- Bulk reschedule (patent 16, 17) ---------- */

/*
  Select the affected jobs (tick them, or narrow by date range), then either
  push them forward/back by N days or give each one a specific new start
  date. The preview shows each job's current dates next to the proposed ones
  and flags crew availability conflicts. The lock marks a job Protected: it
  keeps its date and the others move around it (leapfrog). "Confirm
  Reschedule" applies the whole plan, or nothing if any job can't fit.
*/
export function BulkRescheduleModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { items: jobs, update } = useCollection('jobs');
  const { items: team } = useCollection('team');
  const { applySchedulePlan } = useJobActions();
  const { toast } = useToast();
  const [mode, setMode] = useState<'push' | 'dates'>('push');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [shift, setShift] = useState(1);
  const [reason, setReason] = useState('Rain delay');
  const [excluded, setExcluded] = useState<string[]>([]);
  const [newDates, setNewDates] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) { setMode('push'); setFrom(new Date().toISOString().slice(0, 10)); setTo(''); setShift(1); setReason('Rain delay'); setExcluded([]); setNewDates({}); }
  }, [open]);

  const affected = useMemo(
    () => jobs.filter((j) => j.startDate && j.status !== 'Completed' && j.status !== 'Cancelled' && (j.endDate ?? j.startDate) >= from && (!to || j.startDate <= to))
      .sort((a, b) => a.startDate!.localeCompare(b.startDate!)),
    [jobs, from, to],
  );
  const chosen = affected.filter((j) => !excluded.includes(j.id) && !j.scheduleProtected);
  const plan = useMemo(() => {
    if (mode === 'push') return { ...planReschedule(jobs, team, chosen.map((j) => j.id), from, shift), rowErrors: {} as Record<string, string> };
    const moves = Object.fromEntries(chosen.map((j) => [j.id, newDates[j.id] ?? '']));
    return planSpecificDates(jobs, team, moves);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, jobs, team, from, shift, newDates, excluded.join(','), chosen.map((j) => j.id).join(',')]);

  const apply = () => {
    if (plan.error || !applySchedulePlan(plan.jobs, reason)) return;
    toast(mode === 'push'
      ? `${chosen.length} job${chosen.length === 1 ? '' : 's'} shifted ${shift} day${Math.abs(shift) === 1 ? '' : 's'} (${reason})`
      : `${chosen.length} job${chosen.length === 1 ? '' : 's'} moved to new dates (${reason})`);
    onOpenChange(false);
  };

  const protectedCount = affected.filter((j) => j.scheduleProtected).length;

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="xl" title="Bulk Reschedule" description="Move several jobs at once after rain, a delay or a change in the crew."
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-gray-500">{protectedCount ? `${protectedCount} protected job${protectedCount === 1 ? ' stays' : 's stay'} put.` : 'Lock a job to keep it on its date.'}</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={!chosen.length || !!plan.error} onClick={apply}>Confirm Reschedule{chosen.length ? ` (${chosen.length})` : ''}</Button>
          </div>
        </div>
      }>
      <div className="space-y-5">
        {plan.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{plan.error}</p>}
        <div className="flex flex-wrap gap-2 rounded-xl bg-gray-100 p-1" role="radiogroup" aria-label="Type of change">
          {([['push', 'Push forward by days'], ['dates', 'Move to specific new dates']] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)}
              className={cn('flex-1 rounded-lg px-4 py-2 text-sm font-bold', mode === k ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-800')}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Jobs from"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Jobs to (optional)"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
          {mode === 'push' ? (
            <Field label="Push forward by (days)" hint="Negative moves jobs earlier."><Input type="number" value={shift} onChange={(e) => setShift(Number(e.target.value) || 0)} aria-label="Days to push" /></Field>
          ) : <div />}
          <Field label="Reason">
            <NativeSelect value={reason} onChange={(e) => setReason(e.target.value)}>
              {['Rain delay', 'Weather', 'Job running long', 'Crew unavailable', 'Material delay', 'Holiday', 'Customer request'].map((r) => <option key={r}>{r}</option>)}
            </NativeSelect>
          </Field>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-[0.12em] text-gray-500">
            <span>Reschedule preview</span>
            {affected.length > 0 && (
              <span className="flex gap-3 normal-case tracking-normal">
                <button type="button" className="font-bold text-primary-600" onClick={() => setExcluded([])}>Select all</button>
                <button type="button" className="font-bold text-gray-500" onClick={() => setExcluded(affected.map((j) => j.id))}>Clear</button>
              </span>
            )}
          </div>
          {affected.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">No scheduled jobs in this date range.</p>
          ) : (
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
              {affected.map((j) => {
                const isProtected = !!j.scheduleProtected;
                const on = !excluded.includes(j.id) && !isProtected;
                const proposed = plan.jobs.find((p) => p.id === j.id);
                const conflicts = plan.conflicts?.[j.id] ?? [];
                const rowError = plan.rowErrors?.[j.id];
                const leapfrog = mode === 'push' && proposed && on && daysInclusive(j.startDate!, proposed.startDate!) - 1 !== shift && proposed.startDate !== j.startDate;
                return (
                  <div key={j.id} className={cn('flex flex-wrap items-center gap-3 px-3 py-2.5', isProtected && 'bg-gray-50')}>
                    <Checkbox checked={on} disabled={isProtected} onChange={(v) => setExcluded((x) => (v ? x.filter((i) => i !== j.id) : [...x, j.id]))} />
                    <button
                      type="button"
                      onClick={() => update(j.id, { scheduleProtected: !isProtected })}
                      className={cn('rounded-lg p-1.5', isProtected ? 'bg-amber-100 text-amber-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700')}
                      aria-label={isProtected ? `Unprotect ${j.jobNumber}` : `Protect ${j.jobNumber}`}
                      aria-pressed={isProtected}
                      title={isProtected ? 'Protected: keeps its date. Click to unlock.' : 'Protect: keep this job on its date'}
                    >
                      {isProtected ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-gray-900">{j.title} <span className="font-medium text-gray-500">({j.jobNumber})</span></div>
                      <div className="text-xs text-gray-500">
                        Now {fmtSpan(j.startDate, j.endDate)}
                        {isProtected ? <span className="ml-2 font-bold text-amber-700">Protected · stays on its date</span>
                          : on && proposed ? <> → <span className="font-bold text-primary-600">{fmtSpan(proposed.startDate, proposed.endDate)}</span>{leapfrog && <span className="ml-1 text-gray-500">(moved past a busy day)</span>}</>
                          : !on ? <span className="ml-2 text-gray-500">Not moving</span> : null}
                      </div>
                      {on && conflicts.length > 0 && (
                        <div className="mt-1 text-xs font-semibold text-amber-700" title={conflicts.map((c) => c.message).join('\n')}>
                          <AlertTriangle className="mr-1 inline h-3 w-3" />
                          {mode === 'push' && !leapfrog ? '' : 'On the requested dates: '}{conflicts[0]!.message}{conflicts.length > 1 ? ` (+${conflicts.length - 1} more)` : ''}
                        </div>
                      )}
                      {rowError && <div className="mt-1 text-xs font-semibold text-red-600">{rowError}</div>}
                    </div>
                    {mode === 'dates' && on && (
                      <Input type="date" value={newDates[j.id] ?? ''} onChange={(e) => setNewDates((d) => ({ ...d, [j.id]: e.target.value }))} className="h-9 w-40" aria-label={`New start date for ${j.jobNumber}`} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
