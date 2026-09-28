'use client';

/*
  Reports tabs that are one big table: Estimates Log, Jobs Sold and
  Jobs To Do (production schedule). Columns, totals row and copy follow
  the live app (features/(main)/reports/listings/components/*).
*/
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { useDb } from '@/lib/store';
import type { EstimateStatus } from '@/lib/types';
import { cn, shortDate } from '@/lib/utils';
import { Pagination, usePagination } from '@/components/ui/display';
import { useToast } from '@/components/ui/toast';
import {
  ESTIMATE_STATUS_GROUPS, ESTIMATE_STATUS_LABEL, downloadCsv, estimatesLog, jobsSold, jobsToDo, shortDayMonth, type DateRange,
} from './data';
import { DateRangeInputs, ExportButton, MultiSelect, ReportCard, TD, TH, money0, money2 } from './shared';

const STATUS_CLASS: Record<EstimateStatus, string> = {
  Draft: 'bg-gray-100 text-gray-700 border-gray-200',
  Sent: 'bg-blue-50 text-blue-700 border-blue-200',
  Viewed: 'bg-blue-50 text-blue-700 border-blue-200',
  Approved: 'bg-green-50 text-green-700 border-green-200',
  Rejected: 'bg-red-50 text-red-700 border-red-200',
  Expired: 'bg-gray-200 text-gray-500 border-gray-300',
};

const theadRow = 'border-b border-gray-200 bg-white text-xs font-bold uppercase tracking-wider text-gray-500';
const totalsRow = 'border-b border-gray-200 bg-gray-50/50 text-sm font-bold';

function PagerFooter({ p }: { p: ReturnType<typeof usePagination<unknown>> }) {
  if (!p.total) return null;
  return (
    <div className="border-t border-gray-200 px-4 pb-4">
      <Pagination page={p.page} totalPages={p.totalPages} onPage={p.setPage} pageSize={p.pageSize} onPageSize={p.setPageSize} shown={p.pageItems.length} total={p.total} />
    </div>
  );
}

/* ---------- Estimates Log ---------- */

export function EstimatesLogTab({ year, range, setRange }: { year: number; range: DateRange; setRange: (r: DateRange) => void }) {
  const db = useDb();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [statuses, setStatuses] = useState<string[]>([]);
  const { rows, totals } = useMemo(() => estimatesLog(db, range, statuses as EstimateStatus[], search), [db, range, statuses, search]);
  const p = usePagination(rows, 10);

  const exportCsv = () => {
    downloadCsv(`estimates-log-${year}.csv`, ['Date', 'Estimate #', 'Customer', 'Source', 'Hours', 'Hrs Left', 'Amount', 'Pending', 'Status', 'Present', 'Email'],
      rows.map((r) => [shortDate(r.date), r.estimateNumber, r.customer, r.source, r.hours, r.hrsLeft, r.amount, r.pending, ESTIMATE_STATUS_LABEL[r.status], shortDayMonth(r.present) ?? '', shortDayMonth(r.email) ?? '']));
    toast('Report exported successfully');
  };

  return (
    <ReportCard>
      <div className="space-y-4 border-b border-gray-200 px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-gray-900 sm:whitespace-nowrap">Estimate Activity Log ({year})</h3>
          <ExportButton onClick={exportCsv}>Export CSV</ExportButton>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search estimate # or customer"
              className="h-10 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/40"
            />
          </div>
          <DateRangeInputs value={range} onChange={setRange} />
          <MultiSelect label="Status" value={statuses} onChange={setStatuses} groups={ESTIMATE_STATUS_GROUPS} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className={theadRow}>
              <th className={TH}>Date</th><th className={TH}>Estimate #</th><th className={TH}>Customer</th><th className={TH}>Source</th>
              <th className={cn(TH, 'text-center')}>Hours</th><th className={cn(TH, 'text-center')}>Hrs Left</th>
              <th className={cn(TH, 'text-right')}>Amount</th><th className={cn(TH, 'text-right')}>Pending</th>
              <th className={cn(TH, 'text-center')}>Status</th><th className={cn(TH, 'text-center')}>Present</th><th className={TH}>Email</th>
            </tr>
            {rows.length > 0 && (
              <tr className={totalsRow}>
                <td colSpan={4} className="px-4 py-3 text-right text-xs uppercase tracking-wider text-gray-500">Totals</td>
                <td className="px-4 py-3 text-center text-gray-900">{totals.hours.toFixed(2)}</td>
                <td className="px-4 py-3 text-center text-gray-900">{totals.hrsLeft.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-mono text-gray-900">{money2(totals.amount)}</td>
                <td className="px-4 py-3 text-right font-mono text-gray-500">{money2(totals.pending)}</td>
                <td colSpan={3} />
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-gray-100">
            {p.pageItems.map((r) => (
              <tr key={r.id} className="group transition-colors hover:bg-gray-50/80">
                <td className={cn(TD, 'font-medium text-gray-900')}>{shortDate(r.date)}</td>
                <td className={cn(TD, 'font-mono text-gray-500 group-hover:text-primary-600')}>
                  <Link href={`/estimates/${r.id}`}>{r.estimateNumber}</Link>
                </td>
                <td className={cn(TD, 'font-bold text-gray-800')}>{r.customer}</td>
                <td className={cn(TD, 'text-gray-600')}>
                  {r.source ? <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800">{r.source}</span> : '-'}
                </td>
                <td className={cn(TD, 'text-center text-gray-600')}>{r.hours}</td>
                <td className={cn(TD, 'text-center font-bold text-gray-700')}>{r.hrsLeft}</td>
                <td className={cn(TD, 'text-right font-mono font-bold text-gray-900')}>{money2(r.amount)}</td>
                <td className={cn(TD, 'text-right font-mono text-gray-500')}>{r.pending > 0 ? money0(r.pending) : '-'}</td>
                <td className={cn(TD, 'text-center')}>
                  <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold shadow-sm', STATUS_CLASS[r.status])}>{ESTIMATE_STATUS_LABEL[r.status]}</span>
                </td>
                <td className={cn(TD, 'text-center text-gray-600')}>{shortDayMonth(r.present) ?? '-'}</td>
                <td className={cn(TD, 'text-gray-600')}>{shortDayMonth(r.email) ?? '-'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-6 py-12 text-center italic text-gray-400">No estimates found for this period.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <PagerFooter p={p} />
    </ReportCard>
  );
}

/* ---------- Jobs Sold ---------- */

export function JobsSoldTab({ year, range, setRange }: { year: number; range: DateRange; setRange: (r: DateRange) => void }) {
  const db = useDb();
  const { toast } = useToast();
  const { rows, totals } = useMemo(() => jobsSold(db, range), [db, range]);
  const p = usePagination(rows, 10);

  const exportCsv = () => {
    downloadCsv(`jobs-sold-${year}.csv`, ['Date', 'Job #', 'Customer', 'Source', 'Amount', 'Hours', 'Wash', 'Hrs Left', 'Paid'],
      rows.map((r) => [shortDate(r.date), r.jobNumber, r.customer, r.source, r.amount, r.hours, r.wash, r.hrsLeft, r.paid ? 'Yes' : 'No']));
    toast('Report exported successfully');
  };

  return (
    <ReportCard>
      <div className="flex flex-col justify-between gap-4 border-b border-gray-200 px-4 py-5 sm:px-6 lg:flex-row lg:items-end">
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-end">
          <h3 className="whitespace-nowrap pb-2 text-lg font-bold text-gray-900">{year} Paint Pro Jobs Sold</h3>
          <div className="hidden h-6 w-px bg-gray-200 md:mb-2 md:block" />
          <DateRangeInputs value={range} onChange={setRange} />
        </div>
        <ExportButton onClick={exportCsv} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className={theadRow}>
              <th className={TH}>Date</th><th className={TH}>Job #</th><th className={TH}>Customer</th><th className={TH}>Source</th>
              <th className={cn(TH, 'text-right')}>Amount</th><th className={cn(TH, 'text-center')}>Hours</th><th className={cn(TH, 'text-center')}>Wash</th>
              <th className={cn(TH, 'text-center')}>Hrs Left</th><th className={cn(TH, 'text-center')}>Paid</th>
            </tr>
            {rows.length > 0 && (
              <tr className={totalsRow}>
                <td colSpan={4} className="px-4 py-3 text-right text-xs uppercase tracking-wider text-gray-500">Totals</td>
                <td className="px-4 py-3 text-right font-mono text-gray-900">{money0(totals.amount)}</td>
                <td className="px-4 py-3 text-center text-gray-900">{totals.hours.toFixed(2)}</td>
                <td className="px-4 py-3 text-center text-gray-900">{totals.wash > 0 ? totals.wash : '-'}</td>
                <td className="px-4 py-3 text-center text-gray-900">{totals.hrsLeft.toFixed(2)}</td>
                <td />
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-gray-100">
            {p.pageItems.map((r) => (
              <tr key={r.id} className="group transition-colors hover:bg-gray-50/80">
                <td className={cn(TD, 'font-medium text-gray-900')}>{shortDate(r.date)}</td>
                <td className={cn(TD, 'font-mono text-gray-500 group-hover:text-primary-600')}><Link href={`/jobs/${r.id}`}>{r.jobNumber}</Link></td>
                <td className={cn(TD, 'font-bold text-gray-800')}>{r.customer}</td>
                <td className={cn(TD, 'text-gray-600')}>{r.source || '-'}</td>
                <td className={cn(TD, 'text-right font-mono font-bold text-gray-900')}>{money0(r.amount)}</td>
                <td className={cn(TD, 'text-center text-gray-600')}>{r.hours}</td>
                <td className={cn(TD, 'text-center text-gray-600')}>{r.wash || '-'}</td>
                <td className={cn(TD, 'text-center font-bold text-gray-700')}>{r.hrsLeft}</td>
                <td className={cn(TD, 'text-center')}>
                  <span className={cn('inline-flex min-w-12 items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-bold', r.paid ? 'border-green-200 bg-green-100 text-green-700' : 'border-red-200 bg-red-100 text-red-700')}>
                    {r.paid ? 'Yes' : 'No'}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center italic text-gray-400">No sold jobs found for this period.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <PagerFooter p={p} />
    </ReportCard>
  );
}

/* ---------- Jobs To Do ---------- */

export function JobsToDoTab({ year, range, setRange }: { year: number; range: DateRange; setRange: (r: DateRange) => void }) {
  const db = useDb();
  const { toast } = useToast();
  const rows = useMemo(() => jobsToDo(db, range), [db, range]);
  const p = usePagination(rows, 10);

  const exportCsv = () => {
    downloadCsv(`jobs-to-do-${year}.csv`, ['Job #', 'Customer', 'Source', 'Status', 'Contract', 'Budget Hrs', 'Used', 'Remaining'],
      rows.map((r) => [r.jobNumber, r.customer, r.source, r.status, r.contract, r.budgetHrs, r.usedHrs, r.remainingHrs]));
    toast('Report exported successfully');
  };

  return (
    <ReportCard>
      <div className="flex flex-col justify-between gap-4 border-b border-gray-200 px-4 py-5 sm:px-6 lg:flex-row lg:items-end">
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-end">
          <h3 className="whitespace-nowrap pb-2 text-lg font-bold text-gray-900">Production Schedule ({year})</h3>
          <div className="hidden h-6 w-px bg-gray-200 md:mb-2 md:block" />
          <DateRangeInputs value={range} onChange={setRange} />
        </div>
        <ExportButton onClick={exportCsv} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-200 bg-white text-xs font-bold uppercase tracking-wider text-gray-400">
              <th className="w-32 px-6 py-3">Job #</th><th className="px-6 py-3">Customer</th><th className="px-6 py-3 text-right">Contract</th>
              <th className="px-6 py-3 text-center">Budget Hrs</th><th className="px-6 py-3 text-center">Used</th><th className="px-6 py-3 text-center">Remaining</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {p.pageItems.map((r) => (
              <tr key={r.id} className="group transition-colors hover:bg-gray-50">
                <td className="px-6 py-4 font-mono text-xs font-bold text-gray-500 group-hover:text-primary-600"><Link href={`/jobs/${r.id}`}>{r.jobNumber}</Link></td>
                <td className="px-6 py-4">
                  <div className="font-bold text-gray-900">{r.customer}</div>
                  <div className="text-xs text-gray-400">{[r.source, r.status].filter(Boolean).join(' · ')}</div>
                </td>
                <td className="px-6 py-4 text-right font-medium text-gray-900">{money0(r.contract)}</td>
                <td className="px-6 py-4 text-center">
                  <span className="inline-block rounded bg-gray-100 px-2 py-1 text-xs font-bold text-gray-700">{r.budgetHrs}</span>
                </td>
                <td className="px-6 py-4 text-center text-sm text-gray-500">{r.usedHrs}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-center gap-2">
                    <div className="text-sm font-bold text-gray-900">{r.remainingHrs}</div>
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                      <div className={cn('h-full rounded-full', r.percentUsed > 90 ? 'bg-red-500' : 'bg-green-500')} style={{ width: `${Math.min(100, r.percentUsed)}%` }} />
                    </div>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center italic text-gray-400">No production jobs found for this period.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <PagerFooter p={p} />
    </ReportCard>
  );
}
