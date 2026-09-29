'use client';

/*
  Feature glue for the job page (/jobs/[id]).

  A replica job with a prototype twin (same id, lib/bridge) gets:
    - JobCostCard: NEW job cost from QuickBooks records (feature 33) for the
      roles with finance access, plus estimated vs actual hours (feature 21).
      Roles without cost access see the hours only (report rule: crew leads
      see hours, estimators only their own jobs).
    - the prototype's status rules: Scheduled and In Production are set by
      the work order, Completed only through the work order's closeout.
  A job without a twin renders none of this and keeps the replica behaviour.
*/
import Link from 'next/link';
import { Clock, DollarSign } from 'lucide-react';
import type { Job as PJob } from '@/features/types';
import { useCurrentUser, useDb } from '@/features/lib/store';
import { byId } from '@/features/lib/selectors';
import { can } from '@/features/lib/permissions';
import { jobFinancials } from '@/features/lib/store/actions/finance';
import { jobPerformance, measureFor, visibleTo } from '@/features/lib/store/actions/performance';
import { WO_STATUS_LABEL } from '@/features/lib/store/actions/work-orders';
import { money } from '@/features/lib/format';
import { CardTitle, ConfirmBadge, LiveCard, NewBadge } from '@/features/components/ui';
import type { JobStatus } from '@/lib/types';

/** The prototype job behind a replica job id (only once it is a real job, not an estimate's scope record). */
export function useJobTwin(id: string | undefined) {
  const db = useDb((d) => d);
  const job = id ? byId(db.jobs, id) : undefined;
  if (!job || job.status === 'estimating') return undefined;
  const wo = db.workOrders.find((w) => w.jobId === job.id);
  return { db, job, wo };
}
export type JobTwin = NonNullable<ReturnType<typeof useJobTwin>>;

/** Stages the prototype refuses as a manual move on a twinned job, with the reason. */
export const SYSTEM_STAGES: Partial<Record<JobStatus, string>> = {
  Scheduled: 'Scheduled is set from the work order (Schedule).',
  'In Production': 'In Production is set from the work order (Start Job).',
  Completed: 'Close the job from the work order: Mark Complete runs the closeout.',
};

/** Why a manual move to `s` would be refused on this twin, or undefined when it is allowed. */
export function stageBlockedReason(twin: JobTwin | undefined, s: JobStatus): string | undefined {
  if (!twin) return undefined;
  if (s === 'Completed' && twin.job.status === 'completed') return undefined;
  return SYSTEM_STAGES[s];
}

export const twinWoStatusLabel = (twin: JobTwin | undefined, woId: string) =>
  twin?.wo && twin.wo.id === woId ? WO_STATUS_LABEL[twin.wo.status] : undefined;

const ALL_TIME = { from: '2000-01-01', to: '2100-12-31' };

/** NEW: job cost (33) and estimated vs actual hours (21). */
export function JobCostCard({ job }: { job: PJob }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const seesCost = can(user, 'finance.access');
  const perf = visibleTo(user, jobPerformance(db, ALL_TIME)).find((p) => p.jobId === job.id);
  if (!seesCost && (!perf || !can(user, 'report.view'))) return null;
  const hoursOnly = !seesCost || measureFor(user, 'cost') === 'hours';
  const f = jobFinancials(db, job.id);
  const margin = f.actual ?? f.projected;
  const estHours = perf ? perf.original.labourHours + perf.change.labourHours : undefined;
  const actHours = perf?.actual?.labourHours;
  return (
    <LiveCard isNew data-tour="job-cost">
      <CardTitle icon={hoursOnly ? <Clock /> : <DollarSign />} badge={<NewBadge feature={hoursOnly ? 21 : [21, 33]} />}>{hoursOnly ? 'Job Hours' : 'Job Cost'}</CardTitle>
      {!hoursOnly && <div className="-mt-3 mb-3"><ConfirmBadge /></div>}
      <div className="space-y-1.5 text-sm">
        {!hoursOnly && ([
          ['Contract (ex tax)', f.contractExTax], ['Invoiced (ex tax)', f.invoicedExTax], ['Labour (approved hours, Rule 3)', f.labour],
          ['Material', f.material], ['Other', f.other + f.subcontractor], ['Cost to date', f.costToDate],
        ] as const).map(([l, v]) => (
          <div key={l} className="flex justify-between gap-2"><span className="text-gray-500">{l}</span><b>{money(v, { cents: true })}</b></div>
        ))}
        {!hoursOnly && (
          <div className="mt-2 flex justify-between border-t border-gray-100 pt-2">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">{f.actual !== null ? 'Margin' : 'Projected margin'}</span>
            <b>{margin === null ? '—' : `${(margin * 100).toFixed(1)}%`}</b>
          </div>
        )}
        {!hoursOnly && f.unmatched > 0 && <p className="text-xs text-amber-700">{money(f.unmatched)} of supplier bills not yet matched to orders.</p>}
        {perf && (
          <div className={hoursOnly ? '' : 'mt-3 border-t border-gray-100 pt-3'}>
            <div className="mb-1.5 text-xs font-bold uppercase tracking-[0.15em] text-gray-500">Estimated vs actual hours</div>
            <div className="flex justify-between gap-2"><span className="text-gray-500">Estimated (incl. change orders)</span><b>{estHours!.toFixed(1)} h</b></div>
            <div className="flex justify-between gap-2"><span className="text-gray-500">Approved actual</span><b>{actHours === undefined ? '—' : `${actHours.toFixed(1)} h`}</b></div>
            {perf.pendingHours > 0 && <div className="flex justify-between gap-2"><span className="text-gray-500">Awaiting approval</span><b className="text-amber-700">{perf.pendingHours.toFixed(1)} h</b></div>}
            {actHours !== undefined && estHours! > 0 && (
              <div className="flex justify-between gap-2"><span className="text-gray-500">Variance</span>
                <b className={actHours > estHours! ? 'text-red-600' : 'text-green-700'}>{actHours > estHours! ? '+' : ''}{(actHours - estHours!).toFixed(1)} h</b></div>
            )}
            <Link href="/reports?tab=job_performance" className="mt-2 inline-block text-xs font-bold text-primary-700 hover:underline">Open the performance report</Link>
          </div>
        )}
      </div>
    </LiveCard>
  );
}
