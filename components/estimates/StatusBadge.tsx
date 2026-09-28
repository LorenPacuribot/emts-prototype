'use client';

/*
  Estimate status pill with the same icons as the live list
  (Sent = paper plane, Viewed = eye, Approved = check circle).
*/
import { CheckCircle2, Clock, Eye, FileText, Send, XCircle } from 'lucide-react';
import type { EstimateStatus } from '@/lib/types';
import { ESTIMATE_STATUS_BADGE } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { STATUS_LABEL } from './estimate-utils';

const ICONS: Record<EstimateStatus, React.ComponentType<{ className?: string }>> = {
  Draft: FileText,
  Sent: Send,
  Viewed: Eye,
  Approved: CheckCircle2,
  Rejected: XCircle,
  Expired: Clock,
};

export function EstimateStatusBadge({ status, size = 'sm', className }: { status: EstimateStatus; size?: 'sm' | 'md'; className?: string }) {
  const Icon = ICONS[status];
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-full border font-bold whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'rounded-lg px-3 py-1.5 text-xs tracking-wide',
        ESTIMATE_STATUS_BADGE[status],
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      {STATUS_LABEL[status]}
    </span>
  );
}
