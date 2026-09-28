'use client';

/*
  One estimate row on /estimates. Matches the live row: date tile, title,
  EST number chip, customer, LEAD chip, then Status / Type / Total Value
  columns and a View button with a kebab menu.
  NEW (feature 28): a "From history" chip on repeat estimates.
*/
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Briefcase, CheckCircle2, Copy, Eye, History, Trash2, Users } from 'lucide-react';
import type { Estimate } from '@/lib/types';
import { DateTile } from '@/components/ui/display';
import { RowMenu, type MenuItem } from '@/components/ui/menu';
import { cn, fullName, money } from '@/lib/utils';
import { useLookups } from '@/lib/store';
import { useDb as useFeatureDb } from '@/features/lib/store';
import { EstimateStatusBadge } from './StatusBadge';
import { isOpen } from './estimate-utils';

export interface RowHandlers {
  onDuplicate: (e: Estimate) => void;
  onDelete: (e: Estimate) => void;
  onMarkApproved: (e: Estimate) => void;
  onConvert: (e: Estimate) => void;
}

export function EstimateRow({ estimate: e, total, handlers }: { estimate: Estimate; total: number; handlers: RowHandlers }) {
  const router = useRouter();
  const look = useLookups();
  const customer = look.customer(e.customerId);
  const lead = look.lead(e.leadId);
  const twin = useFeatureDb((d) => d.estimates.find((x) => x.id === e.id));
  const fromHistory = !!twin && (!!twin.isRepaint || !!twin.repeatEstimateId);
  const dimmed = e.status === 'Rejected' || e.status === 'Expired';

  const items: MenuItem[] = [
    { label: 'View', icon: <Eye />, onClick: () => router.push(`/estimates/${e.id}`) },
    ...(isOpen(e.status) ? [{ label: 'Mark Approved', icon: <CheckCircle2 className="text-green-600" />, onClick: () => handlers.onMarkApproved(e) }] : []),
    ...(e.status === 'Approved'
      ? [
          e.jobId
            ? { label: 'View Job', icon: <Briefcase />, onClick: () => router.push(`/jobs/${e.jobId}`) }
            : { label: 'Convert to Job', icon: <Briefcase />, onClick: () => handlers.onConvert(e) },
        ]
      : []),
    { label: 'Duplicate', icon: <Copy />, onClick: () => handlers.onDuplicate(e) },
    { label: 'History', icon: <History />, onClick: () => router.push(`/estimates/${e.id}/history`) },
    { label: 'Delete', icon: <Trash2 />, danger: true, separatorBefore: true, disabled: !!e.jobId, onClick: () => handlers.onDelete(e) },
  ];

  const leadChip = lead && (
    <Link
      href={`/leads/${lead.id}`}
      onClick={(ev) => ev.stopPropagation()}
      className="inline-flex items-center gap-1 rounded border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100"
      title="View Lead"
    >
      <Users className="h-3 w-3" />
      {lead.leadNumber}
    </Link>
  );

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/estimates/${e.id}`)}
      onKeyDown={(ev) => ev.key === 'Enter' && router.push(`/estimates/${e.id}`)}
      className={cn(
        'group flex cursor-pointer flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 transition-all hover:border-primary-300 hover:shadow-md md:flex-row md:items-center md:gap-6',
        dimmed && 'border-dashed bg-gray-50 opacity-75',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <DateTile iso={e.date} />
        <div className="min-w-0 flex-1">
          <h3 className={cn('mb-1 truncate text-base font-bold text-gray-900', dimmed ? 'text-gray-500 line-through' : 'group-hover:text-primary-700')}>
            {e.title || 'Untitled Estimate'}
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 font-mono font-medium text-gray-600">{e.estimateNumber}</span>
            {fromHistory && <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">From history</span>}
            {customer && (
              <>
                <span>&bull;</span>
                <span className="font-medium">{fullName(customer)}</span>
              </>
            )}
            {leadChip && (
              <>
                <span>&bull;</span>
                {leadChip}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-6 border-t border-gray-100 pt-3 md:justify-end md:gap-8 md:border-0 md:pt-0">
        <div className="flex w-24 flex-col gap-1">
          <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Status</span>
          <EstimateStatusBadge status={e.status} />
        </div>
        <div className="hidden w-24 flex-col gap-1 lg:flex">
          <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Type</span>
          <span className="truncate text-sm font-bold text-gray-700">{e.estimateType}</span>
        </div>
        <div className="flex min-w-28 flex-col items-end gap-1 text-right">
          <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Total Value</span>
          <span className="text-sm font-black text-gray-900">{money(total)}</span>
        </div>
        <div className="flex items-center gap-2 border-l border-gray-100 pl-4">
          <span className="hidden h-8 items-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-bold text-gray-600 shadow-sm hover:bg-gray-50 md:inline-flex">
            View
          </span>
          <RowMenu items={items} />
        </div>
      </div>
    </div>
  );
}
