'use client';

/*
  The cards that make up the job detail page (/jobs/[id]).
  Layout follows the live job detail template: Financials and Schedule on the
  left, Job Progress and Work Order details on the right. Crew, pause periods,
  notes/daily log and history are extra cards the brief asks for, styled the
  same way.
*/
import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight, Briefcase, Calendar, Check, ClipboardList, Clock, DollarSign, Edit2, History, MapPin, Mail, NotebookPen,
  Lock, PauseCircle, Phone, Plus, Trash2, Unlock, User, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, EmptyState, ProgressBar } from '@/components/ui/display';
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { useCollection, useCurrentUser, useLookups } from '@/lib/store';
import type { Customer, Job, JobNote, JobStatus, WorkOrder } from '@/lib/types';
import { cn, fullName, longDate, money, shortDate } from '@/lib/utils';
import { useJobActions } from './useJobActions';
import { CrewModal } from './CrewModal';
import { fmtDay, fmtTime, jobDays, loadTone, memberBookedHours, memberCapacity, weekDays } from '@/components/scheduling/schedule-utils';

const card = 'rounded-2xl border border-gray-200 bg-white p-6 shadow-sm';
const cardTitle = 'flex items-center gap-2 text-lg font-bold text-gray-900';

/* ---------- Financials ---------- */

export function FinancialsCard({ job }: { job: Job }) {
  const { items: invoices } = useCollection('invoices');
  const mine = invoices.filter((i) => i.jobId === job.id && i.status !== 'Void');
  const paid = mine.reduce((s, i) => s + i.payments.reduce((a, p) => a + p.amount, 0), 0);
  const balance = Math.max(0, job.value - paid);
  return (
    <div className={card}>
      <div className="mb-6 flex items-center justify-between">
        <h3 className={cardTitle}><DollarSign className="h-5 w-5 text-green-600" /> Financials</h3>
        {mine[0] ? (
          <Link href={`/invoices/${mine[0].id}`}><Button variant="secondary" size="sm">View Invoice</Button></Link>
        ) : (
          <Link href={`/invoices/new?jobId=${job.id}`}><Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />}>Create Invoice</Button></Link>
        )}
      </div>
      <div className="space-y-4">
        <Row label="Total Price" value={money(job.value)} />
        <Row label="Paid to Date" value={money(paid)} valueClass="text-green-600" />
        <div className="flex items-center justify-between py-2">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Balance Due</span>
          <span className={cn('text-xl font-black', balance > 0 ? 'text-red-600' : 'text-gray-900')}>{money(balance)}</span>
        </div>
        {mine.length > 1 && <p className="text-xs text-gray-500">{mine.length} invoices linked to this job.</p>}
      </div>
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-2">
      <span className="text-sm font-medium text-gray-500">{label}</span>
      <span className={cn('text-lg font-bold text-gray-900', valueClass)}>{value}</span>
    </div>
  );
}

/* ---------- Customer ---------- */

export function CustomerCard({ job, customer }: { job: Job; customer?: Customer }) {
  return (
    <div className={card}>
      <h3 className={cn(cardTitle, 'mb-5')}><User className="h-5 w-5 text-blue-600" /> Customer</h3>
      {customer ? (
        <Link href={`/contacts/${customer.id}`} className="block rounded-xl p-3 -m-3 hover:bg-blue-50/50">
          <div className="text-lg font-bold text-gray-900">{fullName(customer)}</div>
          {customer.companyName && <div className="text-sm text-gray-500">{customer.companyName}</div>}
          <div className="mt-2 space-y-1 text-sm text-gray-500">
            {customer.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> {customer.email}</div>}
            {customer.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {customer.phone}</div>}
          </div>
        </Link>
      ) : (
        <p className="text-sm text-gray-400">No customer linked.</p>
      )}
      <div className="mt-5 flex items-start gap-2 border-t border-gray-100 pt-4 text-sm text-gray-600">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        {job.address || 'No address set'}
      </div>
    </div>
  );
}

/* ---------- Schedule ---------- */

/** Without `onCancel` there is no Cancel schedule link (a twinned job that is already in production). */
export function ScheduleCard({ job, onEdit, onCancel, onToggleProtected }: { job: Job; onEdit: () => void; onCancel?: () => void; onToggleProtected?: (v: boolean) => void }) {
  const fmt = (k: string) => fmtDay(k, { weekday: 'short', month: 'long', day: 'numeric' });
  return (
    <div className={cn(card, 'flex min-h-[240px] flex-col')}>
      <div className="mb-6 flex items-center justify-between">
        <h3 className={cardTitle}><Calendar className="h-5 w-5 text-blue-600" /> Schedule</h3>
        <button type="button" onClick={onEdit} className="text-gray-400 hover:text-gray-600" aria-label="Edit schedule">
          <Edit2 className="h-4 w-4" />
        </button>
      </div>
      {job.startDate ? (
        <div className="space-y-2">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="mb-1 text-xs font-bold uppercase tracking-widest text-blue-600">Start Date</div>
            <div className="text-lg font-bold text-blue-900">{fmt(job.startDate)}</div>
            {job.startTime && <div className="text-xs font-medium text-blue-700">{fmtTime(job.startTime)} – {fmtTime(job.endTime)}</div>}
          </div>
          {job.endDate && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="mb-1 text-xs font-bold uppercase tracking-widest text-gray-500">End Date</div>
              <div className="text-lg font-bold text-gray-700">{fmt(job.endDate)}</div>
            </div>
          )}
          {onToggleProtected && (
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-gray-200 p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 cursor-pointer accent-amber-600"
                checked={!!job.scheduleProtected}
                onChange={(e) => onToggleProtected(e.target.checked)}
              />
              <span>
                <span className="flex items-center gap-1 font-bold text-gray-900">
                  {job.scheduleProtected ? <Lock className="h-3.5 w-3.5 text-amber-600" /> : <Unlock className="h-3.5 w-3.5 text-gray-400" />}
                  Protect this date
                </span>
                <span className="block text-xs text-gray-500">
                  {job.scheduleProtected ? 'Stays on its date when other jobs are bulk rescheduled.' : 'Bulk rescheduling can move this job.'}
                </span>
              </span>
            </label>
          )}
          {onCancel && <button onClick={onCancel} className="pt-1 text-xs font-semibold text-red-600 hover:underline">Cancel schedule</button>}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center space-y-4 text-center">
          <p className="text-sm font-medium text-gray-500">No dates scheduled yet.</p>
          <Button variant="secondary" onClick={onEdit}>Schedule Job</Button>
        </div>
      )}
    </div>
  );
}

/* ---------- Job progress stepper ---------- */

export const PROGRESS_STAGES: JobStatus[] = ['Confirmed', 'Scheduled', 'In Production', 'Touch Up', 'Ready for Inspection', 'Completed', 'Marketing'];
const STAGE_LABELS: Partial<Record<JobStatus, string>> = { 'In Production': 'Production', 'Ready for Inspection': 'Inspection' };

export function JobProgress({ status, onChange }: { status: JobStatus; onChange: (s: JobStatus) => void }) {
  const idx = PROGRESS_STAGES.indexOf(status);
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
      <h3 className="mb-8 text-lg font-bold text-gray-900">Job Progress</h3>
      <div className="relative px-2">
        <div className="absolute left-0 top-[15px] h-1 w-full rounded-full bg-gray-100" />
        <div className="absolute left-0 top-[15px] h-1 rounded-full bg-primary-600 transition-all duration-500"
          style={{ width: `${idx >= 0 ? (idx / (PROGRESS_STAGES.length - 1)) * 100 : 0}%` }} />
        <div className="relative z-10 flex w-full justify-between overflow-x-auto pb-2">
          {PROGRESS_STAGES.map((s, i) => {
            const done = i <= idx;
            const current = i === idx;
            return (
              <button key={s} type="button" onClick={() => onChange(s)} className="group flex min-w-[60px] flex-col items-center gap-3 focus:outline-none">
                <div className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border-4 transition-all',
                  current ? 'scale-110 border-white bg-primary-600 text-white shadow-lg ring-2 ring-primary-600'
                    : done ? 'border-primary-600 bg-white text-primary-600 group-hover:bg-primary-50'
                      : 'border-gray-200 bg-white text-gray-300 group-hover:border-gray-300',
                )}>
                  {done ? <Check className="h-3.5 w-3.5 stroke-[4]" /> : <div className="h-2 w-2 rounded-full bg-gray-200" />}
                </div>
                <span className={cn('max-w-[80px] text-center text-[9px] font-black uppercase tracking-wider', current ? 'text-primary-700' : 'text-gray-400 group-hover:text-gray-600')}>
                  {STAGE_LABELS[s] ?? s}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {idx === -1 && <p className="mt-4 text-sm text-gray-500">Current status: <span className="font-bold text-gray-700">{status}</span></p>}
    </div>
  );
}

/* ---------- Work orders ---------- */

/** `statusOf` returns the live status label of a work order with a prototype twin (e.g. Pending Deposit). */
export function WorkOrdersCard({ job, workOrders, onCreate, statusOf }: { job: Job; workOrders: WorkOrder[]; onCreate: () => void; statusOf?: (wo: WorkOrder) => string | undefined }) {
  const assigned = job.crew.reduce((s, c) => s + c.hours, 0);
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600"><Briefcase className="h-5 w-5" /></div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Work Order Details</h3>
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-gray-400">{workOrders.length} linked</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Assigned</div>
            <div className="text-xl font-black text-primary-600">{assigned.toFixed(2)} hrs</div>
          </div>
          <div className="hidden h-8 w-px bg-gray-100 sm:block" />
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Total Hours</div>
            <div className="text-xl font-black text-gray-900">{job.estimatedHours.toFixed(2)} hrs</div>
          </div>
        </div>
      </div>
      {workOrders.length === 0 ? (
        <div className="flex flex-col items-center p-10 text-center">
          <p className="mb-4 text-sm text-gray-400">Work order has not been generated yet.</p>
          <Button variant="secondary" icon={<ClipboardList className="h-4 w-4" />} onClick={onCreate}>Create Work Order</Button>
        </div>
      ) : (
        <>
          <div className="divide-y divide-gray-100">
            {workOrders.map((wo) => {
              const done = wo.tasks.filter((t) => t.done).length;
              return (
                <Link key={wo.id} href={`/work-orders/${wo.id}`} className="flex items-center justify-between gap-4 p-5 hover:bg-gray-50">
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-gray-400">{wo.workOrderNumber}</span>
                      <span className="text-xs font-bold text-purple-600">{statusOf?.(wo) ?? wo.status}</span>
                    </div>
                    <div className="truncate text-sm font-bold text-gray-900">{wo.title}</div>
                    <div className="text-xs text-gray-500">Due {shortDate(wo.dueDate)} · {done}/{wo.tasks.length} tasks done</div>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-primary-600">Open <ArrowRight className="h-4 w-4" /></span>
                </Link>
              );
            })}
          </div>
          <div className="border-t border-gray-100 p-4 text-center">
            <button onClick={onCreate} className="text-sm font-bold text-primary-600 hover:underline">+ Create another work order</button>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Crew ---------- */

export function CrewCard({ job }: { job: Job }) {
  const look = useLookups();
  const { items: jobs } = useCollection('jobs');
  const { setCrew } = useJobActions();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const days = job.startDate ? jobDays(job) : weekDays(new Date());

  return (
    <div className={card}>
      <div className="mb-5 flex items-center justify-between">
        <h3 className={cardTitle}><Users className="h-5 w-5 text-purple-600" /> Crew</h3>
        <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>Assign Crew</Button>
      </div>
      {job.crew.length === 0 ? (
        <EmptyState icon={<Users />} message="No crew assigned yet." className="py-8" />
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Workload over {job.startDate ? `the job dates (${days.length} days)` : 'this week'}, across all overlapping jobs.
          </p>
          {job.crew.map((c) => {
            const m = look.member(c.memberId);
            const booked = memberBookedHours(jobs, c.memberId, days);
            const cap = m ? memberCapacity(m, days.length) : 0;
            const load = job.startDate ? booked : booked + c.hours;
            const tone = loadTone(load, cap);
            return (
              <div key={c.memberId} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                <div className="flex items-center gap-3">
                  <Avatar name={fullName(m)} color={m?.color} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-gray-900">{fullName(m)}</div>
                    <div className="text-[11px] text-gray-500">{c.role} · {c.hours}h on this job</div>
                  </div>
                  <button
                    onClick={() => { setCrew(job.id, job.crew.filter((x) => x.memberId !== c.memberId), `${fullName(m)} removed from crew`); toast('Crew member removed'); }}
                    className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500" aria-label={`Remove ${fullName(m)}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className={cn('font-bold', tone.text)}>{load} / {cap}h booked</span>
                  <span className="text-gray-400">{load > cap ? `${Math.round((load - cap) * 10) / 10}h over` : `${Math.round((cap - load) * 10) / 10}h free`}</span>
                </div>
                <ProgressBar value={cap ? (load / cap) * 100 : 0} className="mt-1 h-1.5" barClassName={tone.bar} />
              </div>
            );
          })}
        </div>
      )}
      <CrewModal job={job} open={open} onOpenChange={setOpen} />
    </div>
  );
}

/* ---------- Breaks / pause periods ---------- */

export function BreaksCard({ job }: { job: Job }) {
  const { addBreak, removeBreak } = useJobActions();
  const { toast } = useToast();
  const [form, setForm] = useState({ startDate: '', endDate: '', reason: '' });
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const save = () => {
    if (!form.startDate || !form.endDate || !form.reason.trim()) return setError('Start date, end date and reason are required.');
    if (form.endDate < form.startDate) return setError('End date cannot be before start date.');
    if (!addBreak(job.id, { ...form, reason: form.reason.trim() })) return;
    setForm({ startDate: '', endDate: '', reason: '' });
    setError('');
    setAdding(false);
    toast('Pause period added');
  };

  return (
    <div className={card}>
      <div className="mb-5 flex items-center justify-between">
        <h3 className={cardTitle}><PauseCircle className="h-5 w-5 text-amber-500" /> Breaks & Pause Periods</h3>
        {!adding && <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAdding(true)}>Add Pause</Button>}
      </div>
      {adding && (
        <div className="mb-4 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="From"><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
            <Field label="To"><Input type="date" value={form.endDate} min={form.startDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
            <Field label="Reason"><Input value={form.reason} placeholder="Rain delay" onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setAdding(false); setError(''); }}>Cancel</Button>
            <Button size="sm" onClick={save}>Save Pause</Button>
          </div>
        </div>
      )}
      {job.breaks.length === 0 ? (
        !adding && <p className="text-sm text-gray-400">No pauses. Add one for rain delays, holidays or material holds.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {job.breaks.map((b) => (
            <div key={b.id} className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm font-bold text-gray-900">{b.reason}</div>
                <div className="text-xs text-gray-500">{shortDate(b.startDate)} – {shortDate(b.endDate)}</div>
              </div>
              <button onClick={() => { if (removeBreak(job.id, b.id)) toast('Pause period removed'); }} className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500" aria-label="Remove pause">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Notes & daily log ---------- */

export function NotesCard({ job }: { job: Job }) {
  const me = useCurrentUser();
  const look = useLookups();
  const { addNote, removeNote } = useJobActions();
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [type, setType] = useState<JobNote['type']>('note');
  const [filter, setFilter] = useState<'all' | JobNote['type']>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const notes = [...job.notes].filter((n) => filter === 'all' || n.type === filter).sort((a, b) => b.date.localeCompare(a.date));

  const add = () => {
    if (!text.trim()) return;
    addNote(job.id, { text: text.trim(), type, authorId: me.id });
    setText('');
    toast(type === 'daily-log' ? 'Daily log added' : 'Note added');
  };

  return (
    <div className={card}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h3 className={cardTitle}><NotebookPen className="h-5 w-5 text-primary-600" /> Notes & Daily Log</h3>
        <div className="w-36">
          <NativeSelect value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="h-9 text-xs">
            <option value="all">All entries</option>
            <option value="note">Notes</option>
            <option value="daily-log">Daily logs</option>
          </NativeSelect>
        </div>
      </div>
      <div className="mb-5 space-y-2">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note or today's progress…" className="min-h-[72px]" />
        <div className="flex items-center justify-between gap-2">
          <div className="flex rounded-lg border border-gray-200 bg-gray-100 p-0.5">
            {(['note', 'daily-log'] as const).map((t) => (
              <button key={t} onClick={() => setType(t)} className={cn('rounded-md px-3 py-1 text-xs font-bold', type === t ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500')}>
                {t === 'note' ? 'Note' : 'Daily Log'}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={add} disabled={!text.trim()}>Add Entry</Button>
        </div>
      </div>
      {notes.length === 0 ? (
        <p className="text-sm text-gray-400">No entries yet.</p>
      ) : (
        <div className="space-y-4">
          {notes.map((n) => {
            const a = look.member(n.authorId);
            return (
              <div key={n.id} className="flex gap-3">
                <Avatar name={fullName(a)} color={a?.color} size="sm" />
                <div className="min-w-0 flex-1 rounded-2xl border border-gray-100 bg-gray-50 p-3">
                  <div className="mb-1 flex items-center gap-2 text-xs">
                    <span className="font-bold text-gray-900">{fullName(a)}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider', n.type === 'daily-log' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700')}>
                      {n.type === 'daily-log' ? 'Daily Log' : 'Note'}
                    </span>
                    <span className="text-gray-400">{longDate(n.date)}</span>
                    <button onClick={() => setDeleteId(n.id)} className="ml-auto text-gray-300 hover:text-red-500" aria-label="Delete entry"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-gray-700">{n.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ConfirmDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)} title="Delete entry?"
        onConfirm={() => { if (deleteId) removeNote(job.id, deleteId); toast('Entry deleted'); }} />
    </div>
  );
}

/* ---------- History ---------- */

export function HistoryCard({ job }: { job: Job }) {
  const items = [...job.history].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className={card}>
      <h3 className={cn(cardTitle, 'mb-5')}><History className="h-5 w-5 text-gray-500" /> Job History</h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">No history yet.</p>
      ) : (
        <ol className="relative ml-2 space-y-4 border-l border-gray-200 pl-5">
          {items.map((h, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[26px] top-1 flex h-3 w-3 items-center justify-center rounded-full border-2 border-white bg-primary-500 ring-1 ring-primary-200" />
              <div className="text-sm font-medium text-gray-800">{h.text}</div>
              <div className="flex items-center gap-1 text-xs text-gray-400"><Clock className="h-3 w-3" /> {longDate(h.date)}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
