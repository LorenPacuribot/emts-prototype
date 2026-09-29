'use client';

/*
  Job detail (/jobs/[id]). Mirrors the live job detail template:
  header card (status, number, EST/LEAD chips, title, Change Status, work
  order button), then Financials + Schedule on the left and Job Progress +
  Work Order details on the right. Adds the customer, crew, pause periods,
  notes/daily log and history cards the replica brief asks for.

  A job with a feature-prototype twin (lib/bridge) follows the prototype's
  status rules (Scheduled / In Production come from the work order, Completed
  only through its closeout) and shows the NEW Job Cost card
  (components/jobs/JobFeatures).
*/
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, ChevronDown, ClipboardList, Trash2 } from 'lucide-react';
import { PageShell } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { RefChip } from '@/components/ui/display';
import { DropdownMenu, RowMenu } from '@/components/ui/menu';
import { ConfirmDialog } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { JobStatusBadge } from '@/components/jobs/JobStatusBadge';
import { ScheduleJobModal } from '@/components/jobs/ScheduleJobModal';
import { useJobActions } from '@/components/jobs/useJobActions';
import {
  BreaksCard, CrewCard, CustomerCard, FinancialsCard, HistoryCard, JobProgress, NotesCard, ScheduleCard, WorkOrdersCard,
} from '@/components/jobs/JobDetailCards';
import { CreateWorkOrderModal } from '@/components/work-orders/CreateWorkOrderModal';
import { useCan } from '@/components/work-orders/WoFeatures';
import { JobCostCard, stageBlockedReason, twinWoStatusLabel, useJobTwin } from '@/components/jobs/JobFeatures';
import { WorkOrderScope } from '@/components/jobs/WorkOrderScope';
import { requiredHoursChange } from '@/lib/scheduling';
import { JOB_STATUSES } from '@/lib/constants';
import { useCollection, useLookups } from '@/lib/store';
import type { JobStatus } from '@/lib/types';
import { cn, money } from '@/lib/utils';

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { get, update } = useCollection('jobs');
  const { items: workOrders } = useCollection('workOrders');
  const look = useLookups();
  const actions = useJobActions();
  const { toast } = useToast();

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [woOpen, setWoOpen] = useState(false);
  const [tab, setTab] = useState<'overview' | 'work-order'>('overview');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const job = get(id);
  const twin = useJobTwin(id);
  // A twinned job follows the prototype permissions of the demo user.
  const canStatus = useCan('job.updateStatus') || !twin;
  const canFinancials = useCan('job.viewFinancials') || !twin;

  if (!job) {
    return (
      <PageShell title="Job Details" breadcrumbs={[{ label: 'Jobs', href: '/jobs' }]} backHref="/jobs">
        <div className="py-20 text-center">
          <h2 className="mb-2 text-xl font-bold text-gray-900">Job Not Found</h2>
          <p className="text-gray-500">The job you are looking for does not exist.</p>
          <Link href="/jobs" className="mt-4 inline-block text-sm font-bold text-primary-600">Back to Jobs</Link>
        </div>
      </PageShell>
    );
  }

  const est = look.estimate(job.estimateId);
  const lead = look.lead(job.leadId);
  const customer = look.customer(job.customerId);
  const linkedWOs = workOrders.filter((w) => w.jobId === job.id);
  const hoursChange = job.startDate ? requiredHoursChange(job) : undefined;

  const changeStatus = (s: JobStatus) => {
    if (s === job.status) return;
    const blocked = stageBlockedReason(twin, s);
    if (blocked) {
      toast(blocked);
      // Completing runs the closeout on the work order.
      if (s === 'Completed' && twin?.wo?.status === 'IN_PROGRESS') router.push(`/work-orders/${twin.wo.id}?closeout=1`);
      return;
    }
    actions.setStatus(job.id, s);
    toast(`Job status updated to ${s}`);
  };

  return (
    <PageShell title="Job Details" breadcrumbs={[{ label: 'Jobs', href: '/jobs' }]} backHref="/jobs" contentClassName="pb-32">
      <div className="mb-6">
        <Link href="/jobs" className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" /> Back to Jobs
        </Link>
      </div>

      {/* Header card */}
      <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <JobStatusBadge status={job.status} />
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-gray-400">{job.jobNumber}</span>
              {est && <RefChip href={`/estimates/${est.id}`}>{est.estimateNumber}</RefChip>}
              {lead && <RefChip kind="lead" href={`/leads/${lead.id}`}>{lead.leadNumber}</RefChip>}
            </div>
            <h1 className="font-heading text-3xl font-extrabold tracking-tight text-gray-900 md:text-4xl">{job.title || job.jobNumber}</h1>
            <p className="text-sm text-gray-500">
              Contract value <span className="font-bold text-gray-900">{money(job.value)}</span>
              {job.completedAt && <> · Completed {new Date(job.completedAt).toLocaleDateString('en-US')}</>}
            </p>
          </div>

          <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
            <DropdownMenu
              align="end"
              items={JOB_STATUSES.map((s) => ({ label: s, onClick: () => changeStatus(s), disabled: !canStatus || s === job.status || !!stageBlockedReason(twin, s) }))}
              trigger={
                <Button variant="secondary" className="rounded-xl">
                  Change Status <ChevronDown className="h-4 w-4" />
                </Button>
              }
            />
            {job.status !== 'Completed' && (!twin || twin.wo?.status === 'IN_PROGRESS') && (
              <Button variant="success" className="rounded-xl" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => changeStatus('Completed')}
                title={twin ? 'Opens the closeout on the work order' : undefined}>
                Mark Complete
              </Button>
            )}
            {linkedWOs[0] ? (
              <Link href={`/work-orders/${linkedWOs[0].id}`}>
                <Button className="rounded-xl px-6" icon={<ClipboardList className="h-4 w-4" />}>View Work Order</Button>
              </Link>
            ) : (
              <Button className="rounded-xl px-6" icon={<ClipboardList className="h-4 w-4" />} onClick={() => setWoOpen(true)}>Create Work Order</Button>
            )}
            <RowMenu
              items={[
                { label: 'Create Invoice', onClick: () => router.push(`/invoices/new?jobId=${job.id}`) },
                { label: 'Create Work Order', onClick: () => setWoOpen(true) },
                { label: 'Delete Job', icon: <Trash2 />, danger: true, separatorBefore: true, onClick: () => setConfirmDelete(true) },
              ]}
            />
          </div>
        </div>
      </div>

      {hoursChange && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <span>
            <b>Labor requirement changed:</b> {hoursChange.from.toFixed(1)} h → {hoursChange.to.toFixed(1)} h ({hoursChange.diff > 0 ? '+' : ''}{hoursChange.diff.toFixed(1)} h) since the schedule was planned.
            The schedule was not moved automatically.
          </span>
          <Button size="sm" variant="secondary" onClick={() => setScheduleOpen(true)}>Adjust schedule</Button>
        </div>
      )}

      {/* Content grid */}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <div className="space-y-8 lg:col-span-4">
          {canFinancials && <FinancialsCard job={job} />}
          {twin && <JobCostCard job={twin.job} />}
          <ScheduleCard
            job={job}
            onEdit={() => setScheduleOpen(true)}
            onCancel={!twin || twin.wo?.status === 'SCHEDULED' ? () => setConfirmCancel(true) : undefined}
            onToggleProtected={job.status === 'Completed' ? undefined : (v) => {
              update(job.id, { scheduleProtected: v });
              toast(v ? 'Date protected from bulk rescheduling' : 'Date protection removed');
            }}
          />
          <CustomerCard job={job} customer={customer} />
          <CrewCard job={job} />
        </div>
        <div className="space-y-8 lg:col-span-8">
          <div className="flex gap-2" role="tablist" aria-label="Job sections">
            {([['overview', 'Overview'], ['work-order', 'Work Order']] as const).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={cn('rounded-xl px-5 py-2.5 text-sm font-bold', tab === k ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50')}>
                {label}
              </button>
            ))}
          </div>
          {tab === 'work-order' ? (
            <WorkOrderScope job={job} estimate={est} lead={lead} workOrder={linkedWOs[0]} onSchedule={() => setScheduleOpen(true)} />
          ) : (
            <>
              <JobProgress status={job.status} onChange={changeStatus} />
              <WorkOrdersCard job={job} workOrders={linkedWOs} onCreate={() => setWoOpen(true)} statusOf={(w) => twinWoStatusLabel(twin, w.id)} />
              <BreaksCard job={job} />
              <NotesCard job={job} />
              <HistoryCard job={job} />
            </>
          )}
        </div>
      </div>

      <ScheduleJobModal job={job} open={scheduleOpen} onOpenChange={setScheduleOpen} />
      <CreateWorkOrderModal open={woOpen} onOpenChange={setWoOpen} jobId={job.id} />
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel Schedule"
        confirmLabel="Cancel schedule"
        message={<>This clears the dates for <b>{job.title}</b> and moves it back to the Unscheduled backlog.</>}
        onConfirm={() => { actions.cancelSchedule(job.id); toast('Schedule canceled'); }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete Job"
        message={<>Delete <b>{job.jobNumber}</b>? Linked work orders stay but lose their job. This cannot be undone.</>}
        onConfirm={() => { actions.deleteJob(job.id); toast('Job deleted'); router.push('/jobs'); }}
      />
    </PageShell>
  );
}
