'use client';

/*
  Job status pill used on the Jobs list, job detail and scheduling panels.
  Colors and icons follow the live Jobs grid (features/(main)/jobs/listings/templates/grid.tsx).
*/
import { AlertCircle, Calendar, CheckCircle2, PlayCircle } from 'lucide-react';
import type { JobStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

export const JOB_STAGE_STYLE: Record<JobStatus, string> = {
  Confirmed: 'bg-gray-100 text-gray-700 border-gray-200',
  Unscheduled: 'bg-gray-100 text-gray-500 border-gray-200',
  Scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  'In Production': 'bg-purple-50 text-purple-700 border-purple-200',
  'Touch Up': 'bg-orange-50 text-orange-700 border-orange-200',
  'Ready for Inspection': 'bg-amber-50 text-amber-700 border-amber-200',
  Completed: 'bg-green-50 text-green-700 border-green-200',
  Marketing: 'bg-pink-50 text-pink-700 border-pink-200',
  Cancelled: 'bg-red-50 text-red-700 border-red-200',
};

/** Solid dot color per status (scheduling panel header). */
export const JOB_STAGE_DOT: Record<JobStatus, string> = {
  Confirmed: 'bg-gray-400',
  Unscheduled: 'bg-gray-400',
  Scheduled: 'bg-blue-500',
  'In Production': 'bg-purple-500',
  'Touch Up': 'bg-orange-500',
  'Ready for Inspection': 'bg-amber-500',
  Completed: 'bg-green-500',
  Marketing: 'bg-pink-500',
  Cancelled: 'bg-red-500',
};

function StageIcon({ status }: { status: JobStatus }) {
  const cls = 'mr-1 h-3 w-3';
  if (status === 'Scheduled') return <Calendar className={cls} />;
  if (status === 'In Production') return <PlayCircle className={cls} />;
  if (status === 'Completed') return <CheckCircle2 className={cls} />;
  if (status === 'Unscheduled') return <AlertCircle className={cls} />;
  return null;
}

export function JobStatusBadge({ status, className, icon = true }: { status: JobStatus; className?: string; icon?: boolean }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold', JOB_STAGE_STYLE[status], className)}>
      {icon && <StageIcon status={status} />}
      {status}
    </span>
  );
}
