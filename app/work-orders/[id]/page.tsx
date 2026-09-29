'use client';

/*
  Work order detail (/work-orders/[id]). Follows the live WO detail template:
  header (status, number, chips, job name, customer, Total/Assigned/Rendered
  hours, the next status action, kebab menu), Client + Schedule row, Location
  and Crew cards side by side, Instructions, then the checklist of tasks.
  Status flow: Unscheduled -> Scheduled -> In Progress -> Completed. The
  schedule lives on the linked job, so "Edit Schedule" edits the job dates.

  A work order with a feature-prototype twin (same id, lib/bridge) runs the
  live flow from the prototype instead (components/work-orders/WoFeatures):
  Pending Deposit -> Unscheduled -> Scheduled -> In Progress -> closeout, and
  shows the NEW sections (paint colour card, materials, paint orders, crew
  clock, time log, field notes with "Use in marketing").
*/
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Calendar, CheckCircle2, Clock, Edit2, ExternalLink, Mail, MapPin, Pencil, Phone, PlayCircle, Plus, Printer,
  RotateCcw, Share2, Trash2, Users,
} from 'lucide-react';
import { PageShell } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Avatar, ProgressBar, RefChip } from '@/components/ui/display';
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/form';
import { RowMenu } from '@/components/ui/menu';
import { ConfirmDialog, Modal } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { ScheduleJobModal } from '@/components/jobs/ScheduleJobModal';
import { useJobActions } from '@/components/jobs/useJobActions';
import { WO_STATUS_STYLE, woDisplayStatus } from '@/components/work-orders/wo-utils';
import {
  WoFieldSections, WoMaterialSections, WoTwinActions, WoTwinChips, WoTwinDialogs, twinHours, useCan, useCanSchedule, useWoDialog, useWoTwin,
} from '@/components/work-orders/WoFeatures';
import { useCollection, useLogActivity, useLookups } from '@/lib/store';
import { useCurrentUser as useFeatureUser } from '@/features/lib/store';
import { SectionIndex } from '@/components/ui/SectionIndex';
import type { WorkOrder } from '@/lib/types';
import { cn, fullName, shortDate, uid } from '@/lib/utils';

const card = 'rounded-2xl border border-gray-200 bg-white shadow-sm';

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { get, update, remove } = useCollection('workOrders');
  const { items: team } = useCollection('team');
  const look = useLookups();
  const jobActions = useJobActions();
  const log = useLogActivity();
  const { toast } = useToast();

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmUnschedule, setConfirmUnschedule] = useState(false);
  const [editingInstr, setEditingInstr] = useState(false);
  const [instr, setInstr] = useState('');
  const [newTask, setNewTask] = useState('');
  const [addMember, setAddMember] = useState('');

  const wo = get(id);
  const twin = useWoTwin(id);
  const [dialog, setDialog] = useWoDialog();
  const canSchedule = useCanSchedule(twin);
  const canManageCrew = useCan('workOrder.manageCrew');
  // Crew leads open a work order to clock the crew in: their crew and time sections come first (C5).
  const crewFirst = useFeatureUser().role === 'crew_lead';
  // ?closeout=1 (from the job page's Mark Complete) opens the closeout drawer.
  const twinInProgress = twin?.wo.status === 'IN_PROGRESS';
  useEffect(() => {
    if (twinInProgress && new URLSearchParams(window.location.search).get('closeout') === '1') setDialog('closeout');
  }, [twinInProgress, setDialog]);
  useEffect(() => { if (wo) setInstr(wo.instructions); }, [wo?.instructions]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!wo) {
    return (
      <PageShell title="Work Order Details" breadcrumbs={[{ label: 'Work Orders', href: '/work-orders' }]} backHref="/work-orders">
        <div className="py-20 text-center">
          <h2 className="mb-2 text-xl font-bold text-gray-900">Work Order Not Found</h2>
          <p className="text-gray-500">The work order you are looking for does not exist.</p>
        </div>
      </PageShell>
    );
  }

  const job = look.job(wo.jobId);
  const customer = look.customer(job?.customerId);
  const est = look.estimate(job?.estimateId);
  const lead = look.lead(job?.leadId);
  const status = woDisplayStatus(wo, job, twin?.wo.status);
  const done = wo.tasks.filter((t) => t.done).length;
  const twinH = twin && twinHours(twin);
  const totalHours = twinH?.total ?? job?.estimatedHours ?? 0;
  const assigned = twinH?.assigned ?? job?.crew.filter((c) => wo.assignedTo.includes(c.memberId)).reduce((s, c) => s + c.hours, 0) ?? 0;
  // "Rendered" = hours logged on the twin, else the share of estimated hours covered by finished tasks.
  const rendered = twinH?.rendered ?? (wo.tasks.length ? (totalHours * done) / wo.tasks.length : 0);

  const patch = (p: Partial<WorkOrder>, msg?: string) => { update(wo.id, p); if (msg) toast(msg); };
  // With a twin the schedule is edited through the prototype, so its rules apply.
  const openSchedule = () => (twin ? setDialog('schedule') : setScheduleOpen(true));
  const scheduleDisabled = twin ? !canSchedule : !job;
  /** Crew edits on a twinned work order go through the job crew; the bridge syncs it to the shift. */
  const setCrew = (ids: string[], msg: string) => {
    patch({ assignedTo: ids }, msg);
    if (twin && job) jobActions.setCrew(job.id, ids.map((m, i) => job.crew.find((c) => c.memberId === m) ?? { memberId: m, role: i === 0 ? 'Crew Lead' : 'Painter', hours: 0 }));
  };
  const setStatus = (s: WorkOrder['status'], msg: string) => {
    patch({ status: s }, msg);
    log(`${wo.workOrderNumber} ${s === 'Completed' ? 'completed' : s === 'In Progress' ? 'started' : 'reopened'}`, 'job', wo.jobId);
    if (job && s === 'In Progress' && ['Unscheduled', 'Confirmed', 'Scheduled'].includes(job.status)) jobActions.setStatus(job.id, 'In Production');
  };

  const primaryAction = () => {
    if (status === 'Unscheduled') return <Button className="h-11 px-5 font-black" icon={<Calendar className="h-4 w-4" />} onClick={() => setScheduleOpen(true)} disabled={!job}>Schedule</Button>;
    if (status === 'Scheduled') return <Button className="h-11 px-5 font-black" icon={<PlayCircle className="h-4 w-4" />} onClick={() => setStatus('In Progress', 'Work order started')}>Start Job</Button>;
    if (status === 'In Progress') return <Button className="h-11 px-5 font-black" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setStatus('Completed', 'Work order completed')}>Mark Complete</Button>;
    return <Button variant="secondary" className="h-11 px-5" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setStatus('Open', 'Work order reopened')}>Reopen</Button>;
  };

  // A twinned work order follows the prototype's crew permission (workOrder.manageCrew).
  const crewEditable = !twin || canManageCrew;
  const crewOptions = crewEditable ? team.filter((t) => t.isCrew && t.status !== 'Inactive' && !wo.assignedTo.includes(t.id)) : [];

  return (
    <PageShell title="Work Order Details" breadcrumbs={[{ label: 'Work Orders', href: '/work-orders' }]} backHref="/work-orders" contentClassName="pb-32">
      <div className="mx-auto max-w-[1100px] space-y-8">
        <Link href="/work-orders" className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900"><ArrowLeft className="h-4 w-4" /> Back to Work Orders</Link>

        <SectionIndex items={[
          { id: 'wo-overview', label: 'Overview' },
          ...(crewFirst ? [{ id: 'wo-crew-time', label: 'Crew & time' }] : []),
          { id: 'section-paint-card', label: 'Paint & materials' },
          { id: 'section-paint-orders', label: 'Orders' },
          { id: 'wo-checklist', label: 'Checklist' },
          ...(crewFirst ? [] : [{ id: 'wo-crew-time', label: 'Crew & time' }]),
          { id: 'wo-notes', label: 'Notes & photos' },
        ]} />

        {/* 1. Header */}
        <div id="wo-overview" className={cn(card, 'scroll-mt-24 p-6 md:p-8')}>
          {/* The twin's extra actions (Log Hours) need the full width: stack the header there. */}
          <div className={cn('flex flex-col items-start justify-between gap-6', twin ? '2xl:flex-row 2xl:items-center' : 'xl:flex-row xl:items-center')}>
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold', WO_STATUS_STYLE[status])}>{status}</span>
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-gray-400">{wo.workOrderNumber}</span>
                {est && <RefChip href={`/estimates/${est.id}`}>{est.estimateNumber}</RefChip>}
                {lead && <RefChip kind="lead" href={`/leads/${lead.id}`}>{lead.leadNumber}</RefChip>}
                {twin && <WoTwinChips twin={twin} />}
              </div>
              <div>
                <h1 className="mb-1 font-heading text-xl font-extrabold leading-tight tracking-tight text-gray-900 md:text-2xl">{wo.title}</h1>
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-500">
                  <Users className="h-4 w-4 text-gray-400" /> {fullName(customer)}
                  {job && <Link href={`/jobs/${job.id}`} className="ml-2 inline-flex items-center gap-1 text-primary-600 hover:underline">{job.jobNumber} · {job.title} <ExternalLink className="h-3 w-3" /></Link>}
                </div>
              </div>
            </div>
            <div className="flex w-full flex-col items-start gap-6 sm:flex-row sm:items-center xl:w-auto">
              <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2.5 shadow-sm sm:w-auto sm:justify-start sm:gap-4 sm:px-4">
                <Stat label="Estimated" hint="Hours the estimate allows for this job" value={totalHours} />
                <div className="h-8 w-px bg-gray-200" />
                <Stat label="Scheduled" hint="Crew hours booked on the schedule" value={assigned} />
                <div className="h-8 w-px bg-gray-200" />
                <Stat label="Logged" hint="Hours the crew has logged so far" value={rendered} primary />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/work-orders/${wo.id}/print`}><Button variant="secondary" className="h-11 px-4" icon={<Printer className="h-4 w-4" />}>Print</Button></Link>
                {twin ? (
                  <WoTwinActions twin={twin} onLogHours={() => setDialog('hours')} onLogMaterial={() => setDialog('material')} onSchedule={() => setDialog('schedule')} onMarkComplete={() => setDialog('closeout')} onEdit={() => setEditOpen(true)} />
                ) : <>
                {primaryAction()}
                <RowMenu items={[
                  { label: 'Share Work Order', icon: <Share2 />, onClick: () => { navigator.clipboard?.writeText(window.location.href).catch(() => {}); toast('Link copied to clipboard'); } },
                  { label: 'Edit Work Order', icon: <Pencil />, onClick: () => setEditOpen(true) },
                  { label: 'Edit Schedule', icon: <Calendar />, onClick: () => setScheduleOpen(true), disabled: !job },
                  { label: 'Mark Unscheduled', icon: <Clock />, onClick: () => setConfirmUnschedule(true), disabled: status !== 'Scheduled' },
                  { label: 'Delete Work Order', icon: <Trash2 />, danger: true, separatorBefore: true, onClick: () => setConfirmDelete(true) },
                ]} />
                </>}
              </div>
            </div>
          </div>

          <div className="my-8 h-px w-full bg-gray-100" />

          {/* Client & schedule */}
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <Link href={customer ? `/contacts/${customer.id}` : '#'} className="group -m-4 block rounded-xl border border-transparent p-4 transition-all hover:border-blue-100 hover:bg-blue-50/50">
              <SectionHead icon={<Users className="h-4 w-4" />} tone="bg-blue-50 text-blue-600" title="Client" />
              <div className="text-lg font-bold text-gray-900 group-hover:text-blue-700">{customer ? fullName(customer) : 'No client assigned'}</div>
              {customer?.email && <div className="flex items-center gap-2 text-sm text-gray-500"><Mail className="h-3 w-3" /> {customer.email}</div>}
              {customer?.phone && <div className="flex items-center gap-2 text-sm text-gray-500"><Phone className="h-3 w-3" /> {customer.phone}</div>}
            </Link>
            <div className="group relative -m-4 rounded-xl border border-transparent p-4 hover:border-gray-100 hover:bg-gray-50">
              <button type="button" onClick={openSchedule} disabled={scheduleDisabled} title="Edit Schedule"
                className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-300 hover:bg-primary-50 hover:text-primary-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-300"><Edit2 className="h-4 w-4" /></button>
              <SectionHead icon={<Calendar className="h-4 w-4" />} tone="bg-green-50 text-green-600" title="Schedule" />
              <div className="space-y-3">
                <KV label="Start Date" value={job?.startDate ? shortDate(job.startDate) : 'TBD'} />
                <KV label="End Date" value={job?.endDate ? shortDate(job.endDate) : 'TBD'} />
                <KV label="Due Date" value={shortDate(wo.dueDate)} last />
              </div>
            </div>
          </div>
        </div>

        {twin && crewFirst && <WoFieldSections twin={twin} />}

        {/* 2. Location & crew */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className={cn(card, 'flex flex-col overflow-hidden')}>
            <div className="space-y-3 p-6 pb-4">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-red-50 p-2 text-red-500"><MapPin className="h-5 w-5" /></div>
                <h3 className="text-lg font-bold text-gray-900">Job Location</h3>
              </div>
              <p className="font-medium text-gray-700">{job?.address || 'No address set'}</p>
            </div>
            {/* Map placeholder (no external map tiles in the replica) */}
            <div className="relative min-h-[180px] flex-1 border-t border-gray-200 bg-gradient-to-br from-green-50 via-sky-50 to-blue-100">
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px)] bg-[size:32px_32px]" />
              <MapPin className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-full fill-red-500 text-white drop-shadow" />
            </div>
          </div>

          <div className={cn(card, 'flex flex-col')}>
            <div className="flex items-center justify-between border-b border-gray-100 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-gray-100 p-1.5 text-gray-600"><Users className="h-4 w-4" /></div>
                <h3 className="text-lg font-bold text-gray-900">Assigned Crew</h3>
              </div>
              <span className="text-xs font-bold text-gray-400">{wo.assignedTo.length} assigned</span>
            </div>
            <div className="flex-1 space-y-3 p-6">
              {wo.assignedTo.length === 0 && <p className="text-sm text-gray-400">No crew assigned yet.</p>}
              {wo.assignedTo.map((mid) => {
                const m = look.member(mid);
                const a = job?.crew.find((c) => c.memberId === mid);
                return (
                  <div key={mid} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <Avatar name={fullName(m)} color={m?.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-gray-900">{fullName(m)}</div>
                      <div className="text-xs text-gray-500">{a ? `${a.role} · ${a.hours}h on job` : m?.role}</div>
                    </div>
                    {crewEditable && <button onClick={() => setCrew(wo.assignedTo.filter((x) => x !== mid), 'Crew member removed')}
                      className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500" aria-label={`Remove ${fullName(m)}`}><Trash2 className="h-4 w-4" /></button>}
                  </div>
                );
              })}
              {crewOptions.length > 0 && (
                <div className="flex gap-2 pt-1">
                  <div className="flex-1">
                    <NativeSelect value={addMember} onChange={(e) => setAddMember(e.target.value)} className="h-9">
                      <option value="">Add crew member…</option>
                      {crewOptions.map((m) => <option key={m.id} value={m.id}>{fullName(m)} ({m.role})</option>)}
                    </NativeSelect>
                  </div>
                  <Button size="sm" className="h-9" disabled={!addMember} aria-describedby={addMember ? undefined : 'crew-add-hint'} onClick={() => { setCrew([...wo.assignedTo, addMember], 'Crew member assigned'); setAddMember(''); }}>Add</Button>
                </div>
              )}
              {crewOptions.length > 0 && !addMember && (
                <p id="crew-add-hint" className="text-xs text-gray-500">Choose a crew member in the list, then press Add.</p>
              )}
            </div>
          </div>
        </div>

        {/* 3. Instructions */}
        <div className={cn(card, 'p-6 md:p-8')}>
          <div className="mb-4 flex items-center justify-between">
            <h4 className="text-base font-bold text-gray-900">General Instructions</h4>
            {!editingInstr && <button onClick={() => setEditingInstr(true)} className="rounded-full p-2 text-gray-400 hover:text-primary-600" title="Edit instructions"><Edit2 className="h-4 w-4" /></button>}
          </div>
          {editingInstr ? (
            <div className="space-y-3">
              <Textarea value={instr} onChange={(e) => setInstr(e.target.value)} className="min-h-[120px]" />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => { setInstr(wo.instructions); setEditingInstr(false); }}>Cancel</Button>
                <Button size="sm" onClick={() => { patch({ instructions: instr.trim() }, 'Instructions saved'); setEditingInstr(false); }}>Save</Button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-600">{wo.instructions || '--'}</p>
          )}
        </div>

        {/* NEW: paint colour card (3, 18), materials (18) and paint orders (19) */}
        {twin ? (
          <WoMaterialSections twin={twin} />
        ) : (
          <NotLinkedNote what="The paint colour card, material list and paint orders" />
        )}

        {/* 4. Checklist */}
        <div id="wo-checklist" className={cn(card, 'scroll-mt-24 p-6 md:p-8')}>
          <div className="mb-4 flex items-center justify-between">
            <h4 className="text-base font-bold text-gray-900">Task Checklist</h4>
            {wo.tasks.length > 0 && <span className="text-sm font-bold text-gray-500">{done} / {wo.tasks.length} done</span>}
          </div>
          {wo.tasks.length > 0 && <ProgressBar value={(done / wo.tasks.length) * 100} className="mb-5" barClassName="bg-green-500" />}
          {wo.tasks.length === 0 && <p className="mb-4 text-sm text-gray-500">Tasks the crew ticks off on site appear here. Add the first one below.</p>}
          <ul className="divide-y divide-gray-100">
            {wo.tasks.map((t) => (
              <li key={t.id} className="group flex items-center gap-3 py-3">
                <button onClick={() => patch({ tasks: wo.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) })}
                  aria-label={t.done ? 'Mark not done' : 'Mark done'}
                  className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2', t.done ? 'border-green-500 bg-green-500 text-white' : 'border-gray-300 hover:border-primary-400')}>
                  {t.done && <CheckCircle2 className="h-3.5 w-3.5" />}
                </button>
                <span className={cn('flex-1 text-sm', t.done ? 'text-gray-400 line-through' : 'font-medium text-gray-800')}>{t.text}</span>
                <button onClick={() => patch({ tasks: wo.tasks.filter((x) => x.id !== t.id) }, 'Task removed')}
                  className="rounded-lg p-1.5 text-gray-300 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100" aria-label="Remove task"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
          <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!newTask.trim()) return; patch({ tasks: [...wo.tasks, { id: uid('t'), text: newTask.trim(), done: false }] }, 'Task added'); setNewTask(''); }}>
            <div className="flex-1"><Input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add a task…" /></div>
            <Button type="submit" variant="secondary" icon={<Plus className="h-4 w-4" />} disabled={!newTask.trim()}>Add Task</Button>
          </form>
        </div>

        {/* NEW: crew clock + time log (22), field notes & attachments with Use in marketing (34) */}
        {twin ? (
          !crewFirst && <WoFieldSections twin={twin} />
        ) : (
          <NotLinkedNote what="The crew clock, time log and field notes" />
        )}
      </div>

      {twin && <WoTwinDialogs twin={twin} open={dialog} onClose={() => setDialog(null)} />}
      {job && <ScheduleJobModal job={job} open={scheduleOpen} onOpenChange={setScheduleOpen} />}
      <EditWorkOrderModal wo={wo} open={editOpen} onOpenChange={setEditOpen} onSave={(p) => patch(p, 'Work order updated')} />
      <ConfirmDialog open={confirmUnschedule} onOpenChange={setConfirmUnschedule} title="Mark Unscheduled" confirmLabel="Mark Unscheduled"
        message="This clears the job's dates and moves it back to the Unscheduled backlog."
        onConfirm={() => { if (job) { jobActions.cancelSchedule(job.id); toast('Marked unscheduled'); } }} />
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete Work Order"
        message={<>Are you sure you want to delete &quot;{wo.title}&quot;? This action cannot be undone.</>}
        onConfirm={() => { remove(wo.id); if (job) jobActions.change(job.id, {}, `Work order ${wo.workOrderNumber} deleted`); toast('Work order deleted'); router.push('/work-orders'); }} />
    </PageShell>
  );
}

function Stat({ label, value, primary, hint }: { label: string; value: number; primary?: boolean; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col sm:min-w-[60px]" title={hint}>
      <span className={cn('mb-0.5 text-xxs font-black uppercase tracking-[0.15em]', primary ? 'text-primary-500' : 'text-gray-400')}>{label}</span>
      <div className={cn('flex items-center gap-1.5 font-black', primary ? 'text-primary-600' : 'text-gray-900')}>
        <Clock className={cn('h-3.5 w-3.5', !primary && 'text-gray-400')} /><span className="text-base leading-none sm:text-lg">{value.toFixed(2)}</span>
      </div>
    </div>
  );
}

function SectionHead({ icon, tone, title }: { icon: React.ReactNode; tone: string; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2 border-b border-gray-100 pb-2 pr-8">
      <div className={cn('rounded-lg p-1.5', tone)}>{icon}</div>
      <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">{title}</h4>
    </div>
  );
}

/** Stands in for the production sections when this work order has no production record yet. */
function NotLinkedNote({ what }: { what: string }) {
  return (
    <div className={cn(card, 'border-dashed p-6 text-sm text-gray-500')}>
      {what} will appear here once this work order is synced with its production record.
    </div>
  );
}

function KV({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between', !last && 'border-b border-gray-50 pb-2')}>
      <span className="text-sm font-medium text-gray-500">{label}</span>
      <span className="font-bold text-gray-900">{value}</span>
    </div>
  );
}

function EditWorkOrderModal({ wo, open, onOpenChange, onSave }: { wo: WorkOrder; open: boolean; onOpenChange: (v: boolean) => void; onSave: (p: Partial<WorkOrder>) => void }) {
  const [title, setTitle] = useState(wo.title);
  const [dueDate, setDueDate] = useState(wo.dueDate);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setTitle(wo.title); setDueDate(wo.dueDate); setError(''); } }, [open, wo]);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Edit Work Order"
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={() => { if (!title.trim() || !dueDate) return setError('Title and due date are required.'); onSave({ title: title.trim(), dueDate }); onOpenChange(false); }}>Save Changes</Button></>}>
      <div className="space-y-4">
        <Field label="Title" required><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Due Date" required error={error}><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
