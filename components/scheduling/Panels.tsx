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
import { Activity, Calendar, ChevronRight, Clock, Flag, MapPin, Trash2, User, Users, X } from 'lucide-react';
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
import { addDays, fmtDay, fmtSpan, fmtTime, workingJobDays } from './schedule-utils';

const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const;

function Row({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
      <div className="w-24 shrink-0 text-sm text-gray-500">{label}</div>
      <div className="min-w-0 flex-1 text-sm font-medium text-gray-900">{children}</div>
    </div>
  );
}
const NotScheduled = () => <span className="font-normal text-gray-400">Not scheduled</span>;

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
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', JOB_STAGE_DOT[job.status])} />
              <h2 className="truncate font-heading text-xl font-black text-gray-900">{job.title}</h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
          </div>
          <div className="ml-5 mt-1 text-sm font-medium text-gray-400">{job.jobNumber}</div>
          <div className="-mb-px mt-3 flex gap-5">
            {(['details', 'notes'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={cn('border-b-2 pb-2.5 text-sm font-bold capitalize', tab === t ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-400 hover:text-gray-600')}>
                {t}
                {t === 'notes' && notes.length > 0 && <span className="ml-1.5 inline-flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-primary-500 px-1 text-[10px] font-black text-white">{notes.length}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'details' ? (
            <div className="space-y-4">
              <Row icon={User} label="Customer">{fullName(customer)}{customer?.phone && <span className="font-normal text-gray-500"> · {customer.phone}</span>}</Row>
              <Row icon={MapPin} label="Address">{job.address || <span className="font-normal text-gray-400">-</span>}</Row>
              <Row icon={Users} label="Crew">
                {job.crew.length ? (
                  <div className="flex flex-col gap-1.5">
                    {job.crew.map((c) => {
                      const m = look.member(c.memberId);
                      return (
                        <div key={c.memberId} className="flex items-center gap-2">
                          <Avatar name={fullName(m)} color={m?.color} size="sm" />
                          <div><div className="text-sm font-medium text-gray-700">{fullName(m)}</div><div className="text-[11px] font-normal text-gray-400">{c.role} · {c.hours}h</div></div>
                        </div>
                      );
                    })}
                  </div>
                ) : <span className="font-normal text-gray-400">No crew assigned</span>}
              </Row>
              <Row icon={Calendar} label="Start date">{job.startDate ? fmtDay(job.startDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : <NotScheduled />}</Row>
              <Row icon={Calendar} label="End date">{job.startDate ? fmtDay(job.endDate ?? job.startDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : <NotScheduled />}</Row>
              <Row icon={Clock} label="Duration">{job.startDate ? `${days.length} working day${days.length === 1 ? '' : 's'}` : <span className="font-normal text-gray-400">—</span>}</Row>
              <Row icon={Clock} label="Daily hours">
                {job.startDate ? (job.startTime ? `${fmtTime(job.startTime)} – ${fmtTime(job.endTime)}` : <span className="font-normal text-gray-400">Time not set</span>) : <NotScheduled />}
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
              {notes.length === 0 ? <p className="text-sm text-gray-400">No notes yet.</p> : notes.map((n) => {
                const a = look.member(n.authorId);
                return (
                  <div key={n.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="mb-1 flex items-center gap-2 text-xs">
                      <span className="font-bold text-gray-900">{fullName(a)}</span>
                      <span className="text-gray-400">{longDate(n.date)}</span>
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
          <Button className="w-full" onClick={onReschedule}>{job.startDate ? 'Reschedule job' : 'Schedule job'}</Button>
          <Button variant="secondary" className="w-full" onClick={onManageCrew}>Manage crew</Button>
          {job.startDate && <Button variant="danger" className="w-full" onClick={onCancel}>Cancel schedule</Button>}
          <Link href={`/jobs/${job.id}`} className="flex h-10 w-full items-center justify-center rounded-lg text-sm font-semibold text-primary-600 hover:underline">
            View full details <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ---------- Bulk reschedule ---------- */

export function BulkRescheduleModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { items: jobs } = useCollection('jobs');
  const { setSchedule } = useJobActions();
  const { toast } = useToast();
  const [from, setFrom] = useState('');
  const [shift, setShift] = useState(1);
  const [reason, setReason] = useState('Rain delay');
  const [excluded, setExcluded] = useState<string[]>([]);

  useEffect(() => {
    if (open) { setFrom(new Date().toISOString().slice(0, 10)); setShift(1); setReason('Rain delay'); setExcluded([]); }
  }, [open]);

  const affected = useMemo(
    () => jobs.filter((j) => j.startDate && j.status !== 'Completed' && j.status !== 'Cancelled' && (j.endDate ?? j.startDate) >= from)
      .sort((a, b) => a.startDate!.localeCompare(b.startDate!)),
    [jobs, from],
  );
  const chosen = affected.filter((j) => !excluded.includes(j.id));

  const apply = () => {
    for (const j of chosen) {
      // Jobs already running only have their end pushed; later jobs move whole.
      const start = j.startDate! >= from ? addDays(j.startDate!, shift) : j.startDate!;
      setSchedule(j.id, { startDate: start, endDate: addDays(j.endDate ?? j.startDate!, shift), startTime: j.startTime, endTime: j.endTime });
    }
    toast(`${chosen.length} job${chosen.length === 1 ? '' : 's'} shifted ${shift} day${Math.abs(shift) === 1 ? '' : 's'} (${reason})`);
    onOpenChange(false);
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" title="Bulk Reschedule" description="Shift scheduled jobs forward or back by a number of days."
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!chosen.length || !shift} onClick={apply}>Apply to {chosen.length} job{chosen.length === 1 ? '' : 's'}</Button></>}>
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <Field label="From date"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Shift (days)"><Input type="number" value={shift} onChange={(e) => setShift(Number(e.target.value) || 0)} /></Field>
          <Field label="Reason">
            <NativeSelect value={reason} onChange={(e) => setReason(e.target.value)}>
              {['Rain delay', 'Holiday', 'Crew unavailable', 'Material delay', 'Customer request'].map((r) => <option key={r}>{r}</option>)}
            </NativeSelect>
          </Field>
        </div>
        <div>
          <div className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-gray-400">Reschedule preview</div>
          {affected.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">No scheduled jobs on or after this date.</p>
          ) : (
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
              {affected.map((j) => {
                const on = !excluded.includes(j.id);
                const ns = j.startDate! >= from ? addDays(j.startDate!, shift) : j.startDate!;
                return (
                  <div key={j.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Checkbox checked={on} onChange={(v) => setExcluded((x) => (v ? x.filter((i) => i !== j.id) : [...x, j.id]))} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-gray-900">{j.title} <span className="font-medium text-gray-400">({j.jobNumber})</span></div>
                      <div className="text-xs text-gray-500">
                        {fmtSpan(j.startDate, j.endDate)} → <span className={on ? 'font-bold text-primary-600' : ''}>{fmtSpan(ns, addDays(j.endDate ?? j.startDate!, shift))}</span>
                      </div>
                    </div>
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
