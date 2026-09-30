'use client';

/*
  Reports tabs that are one big table: Estimates Log, Jobs Sold and
  Jobs To Do (production schedule). Columns, totals row and copy follow
  the live app (features/(main)/reports/listings/components/*).

  Sales entries (30 Sep call, RP): a sold estimate shows one row per entry
  (Original, Amendment 1, …) dated when it was approved or re-approved, so an
  amendment books only its difference in its own month. Complete version:
  what changed on an amendment (RP-C1), Sales by Estimator (RP-C2), change
  orders as entries (RP-C3) and a flag when entries don't add up (RP-C4).
*/
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronRight, Search } from 'lucide-react';
import { useDb } from '@/lib/store';
import type { EstimateStatus } from '@/lib/types';
import { cn, shortDate } from '@/lib/utils';
import { Pagination, usePagination } from '@/components/ui/display';
import { useToast } from '@/components/ui/toast';
import { NewBadge, Stat, StatStrip, Tooltip, VersionBadge, FeatureGate } from '@/features/components/ui';
import { useIsOn } from '@/features/lib/feature-visibility';
import { entryVersions, versionLineDiff } from '@/features/lib/rules/sales-entries';
import {
  ESTIMATE_STATUS_GROUPS, ESTIMATE_STATUS_LABEL, downloadCsv, estimatesLog, jobsSold, jobsToDo, salesByEstimator, shortDayMonth, type DateRange,
} from './data';
import { DateRangeInputs, ExportButton, MultiSelect, ReportCard, TD, TH, money0, money2, signedMoney0, signedMoney2 } from './shared';
import { useSalesExtra } from './useSalesExtra';

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

/** "Original", "Amendment 1", "Change order 1" next to the record number. */
function EntryChip({ label }: { label: string }) {
  // RP Minimal (New Features): the entry labels show with the feature.
  if (!useIsOn({ item: 'RP-M3' })) return null;
  return <span className="ml-2 inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 font-sans text-xxs font-bold text-gray-600">{label}</span>;
}

/* ---------- Estimates Log ---------- */

export function EstimatesLogTab({ year, range, setRange }: { year: number; range: DateRange; setRange: (r: DateRange) => void }) {
  const db = useDb();
  const extra = useSalesExtra();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [open, setOpen] = useState<string>();
  const { rows, totals } = useMemo(() => estimatesLog(db, range, statuses as EstimateStatus[], search, extra), [db, range, statuses, search, extra]);
  const p = usePagination(rows, 10);

  const exportCsv = () => {
    downloadCsv(`estimates-log-${year}.csv`, ['Date', 'Estimate #', 'Entry', 'Customer', 'Source', 'Hours', 'Hrs Left', 'Amount', 'Pending', 'Status', 'Present', 'Email'],
      rows.map((r) => [shortDate(r.date), r.estimateNumber, r.entry?.label ?? '', r.customer, r.source, r.hours, r.hrsLeft, r.amount, r.pending, ESTIMATE_STATUS_LABEL[r.status], shortDayMonth(r.present) ?? '', shortDayMonth(r.email) ?? '']));
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
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
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
      <div className="rtable overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className={theadRow}>
              <th className={TH}>Date</th>
              <th className={TH}>
                <span className="inline-flex items-center gap-1.5">Estimate # <VersionBadge item="RP-M3" /></span>
              </th>
              <th className={TH}>Customer</th><th className={TH}>Source</th>
              <th className={cn(TH, 'text-center')}>Hours</th><th className={cn(TH, 'text-center')}>Hrs Left</th>
              <th className={cn(TH, 'text-right')}>Amount</th><th className={cn(TH, 'text-right')}>Pending</th>
              <th className={cn(TH, 'text-center')}>Status</th><th className={cn(TH, 'text-center')}>Present</th><th className={TH}>Email</th>
            </tr>
            {rows.length > 0 && (
              <tr className={totalsRow}>
                <td colSpan={4} className="px-4 py-3 text-right text-xs uppercase tracking-wider text-gray-500">Totals</td>
                <td className="px-4 py-3 text-center text-gray-900">{totals.hours.toFixed(2)}</td>
                <td className="px-4 py-3 text-center text-gray-900">{totals.hrsLeft.toFixed(2)}</td>
                <td className={cn('px-4 py-3 text-right font-mono', totals.amount < 0 ? 'text-red-600' : 'text-gray-900')}>{signedMoney2(totals.amount)}</td>
                <td className="px-4 py-3 text-right font-mono text-gray-500">{money2(totals.pending)}</td>
                <td colSpan={3} />
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-gray-100">
            {p.pageItems.map((r) => {
              const amendment = r.entry?.type === 'amendment';
              const expanded = open === r.id;
              return (
                <React.Fragment key={r.id}>
                  {/* Rows of one estimate number share a light background (RP-M3). */}
                  <tr className={cn('group transition-colors hover:bg-gray-50/80', r.groupSize > 1 && 'bg-primary-50/40')}>
                    <td className={cn(TD, 'font-medium text-gray-900')}>{shortDate(r.date)}</td>
                    <td className={cn(TD, 'font-mono text-gray-500 group-hover:text-primary-600')}>
                      <span className="inline-flex items-center">
                        {amendment && (
                          <FeatureGate item="RP-C1">
                            <button
                              onClick={() => setOpen(expanded ? undefined : r.id)}
                              aria-expanded={expanded}
                              aria-label={`What changed in ${r.entry!.label}`}
                              className="-ml-1 mr-1 rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                            >
                              <ChevronRight className={cn('h-4 w-4 transition-transform', expanded && 'rotate-90')} />
                            </button>
                          </FeatureGate>
                        )}
                        <Link href={`/estimates/${r.estimateId}`}>{r.estimateNumber}</Link>
                        {r.entry && <EntryChip label={r.entry.label} />}
                        {r.flagged && (
                          <FeatureGate item="RP-C4">
                            <Tooltip content="The sales entries don't add up to this estimate's current total. A change was saved without a new approval.">
                              <span className="ml-2 inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-sans text-xxs font-bold text-amber-700">
                                <AlertTriangle className="h-3 w-3" /> Doesn&apos;t add up
                              </span>
                            </Tooltip>
                            <VersionBadge item="RP-C4" className="ml-1" />
                          </FeatureGate>
                        )}
                      </span>
                    </td>
                    <td className={cn(TD, 'font-bold text-gray-800')}>{r.customer}</td>
                    <td className={cn(TD, 'text-gray-600')}>
                      {r.source ? <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800">{r.source}</span> : '-'}
                    </td>
                    <td className={cn(TD, 'text-center text-gray-600')}>{r.hours}</td>
                    <td className={cn(TD, 'text-center font-bold text-gray-700')}>{r.entry && r.entry.type !== 'original' ? '-' : r.hrsLeft}</td>
                    <td className={cn(TD, 'text-right font-mono font-bold', r.amount < 0 ? 'text-red-600' : 'text-gray-900')}>{signedMoney2(r.amount)}</td>
                    <td className={cn(TD, 'text-right font-mono text-gray-500')}>{r.pending > 0 ? money0(r.pending) : '-'}</td>
                    <td className={cn(TD, 'text-center')}>
                      <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold shadow-sm', STATUS_CLASS[r.status])}>{ESTIMATE_STATUS_LABEL[r.status]}</span>
                    </td>
                    <td className={cn(TD, 'text-center text-gray-600')}>{shortDayMonth(r.present) ?? '-'}</td>
                    <td className={cn(TD, 'text-gray-600')}>{shortDayMonth(r.email) ?? '-'}</td>
                  </tr>
                  {expanded && amendment && (
                    <FeatureGate item="RP-C1">
                      <tr className="bg-primary-50/40">
                        <td colSpan={11} className="px-4 pb-4 pt-0 sm:px-6">
                          <AmendmentChanges estimateId={r.estimateId} versionRef={r.entry!.versionRef} />
                        </td>
                      </tr>
                    </FeatureGate>
                  )}
                </React.Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-6 py-12 text-center italic text-gray-500">No estimates found for this period.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <PagerFooter p={p} />
    </ReportCard>
  );
}

/** RP-C1: lines added, removed and repriced between an amendment and the version before it. */
function AmendmentChanges({ estimateId, versionRef }: { estimateId: string; versionRef: string }) {
  const e = useDb().collections.estimates.find((x) => x.id === estimateId);
  const { prev, next } = e ? entryVersions(e, versionRef) : {};
  const diff = versionLineDiff(prev, next);
  const line = (key: string, text: string, amount: React.ReactNode, cls?: string) => (
    <li key={key} className="flex justify-between gap-4 py-1 text-sm">
      <span className="min-w-0 truncate text-gray-700">{text}</span>
      <span className={cn('shrink-0 font-mono', cls)}>{amount}</span>
    </li>
  );
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
        What changed <VersionBadge item="RP-C1" />
        {prev && next && <span className="font-medium normal-case tracking-normal text-gray-500">v{prev.version} ({shortDate(prev.date)}) to v{next.version} ({shortDate(next.date)})</span>}
      </div>
      {!diff ? (
        <p className="text-sm italic text-gray-500">Line details weren&apos;t recorded for this version.</p>
      ) : !diff.added.length && !diff.removed.length && !diff.repriced.length ? (
        <p className="text-sm italic text-gray-500">No line changes. The difference comes from a discount or tax change.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {([
            ['Added', diff.added.map((l) => line(l.id, l.description, `+${money2(l.total)}`, 'text-green-700'))],
            ['Removed', diff.removed.map((l) => line(l.id, l.description, `-${money2(l.total)}`, 'text-red-600'))],
            ['Repriced', diff.repriced.map((x) => line(x.line.id, x.line.description, <><s className="mr-1.5 text-gray-400">{money2(x.from)}</s>{money2(x.to)}</>, 'text-gray-900'))],
          ] as const).map(([title, items]) => (
            <div key={title}>
              <div className="text-xs font-bold text-gray-900">{title} ({items.length})</div>
              {items.length ? <ul className="divide-y divide-gray-100">{items}</ul> : <p className="py-1 text-sm text-gray-500">None</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Jobs Sold ---------- */

export function JobsSoldTab({ year, range, setRange }: { year: number; range: DateRange; setRange: (r: DateRange) => void }) {
  const db = useDb();
  const extra = useSalesExtra();
  const { toast } = useToast();
  const { rows, totals } = useMemo(() => jobsSold(db, range, extra), [db, range, extra]);
  const p = usePagination(rows, 10);

  const exportCsv = () => {
    downloadCsv(`jobs-sold-${year}.csv`, ['Date', 'Job #', 'Entry', 'Customer', 'Source', 'Amount', 'Hours', 'Wash', 'Hrs Left', 'Paid'],
      rows.map((r) => [shortDate(r.date), r.jobNumber, r.entryLabel ?? 'Original', r.customer, r.source, r.amount, r.hours, r.wash, r.hrsLeft, r.paid ? 'Yes' : 'No']));
    toast('Report exported successfully');
  };

  return (
    <div className="space-y-4">
      {/* RP-M4: new sales and amendments, added up by entry date. */}
      <FeatureGate item="RP-M4"><div>
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
          Sales in this period <VersionBadge item="RP-M4" />
        </div>
        <StatStrip>
          <Stat label="New sales" value={signedMoney0(totals.newSales)} />
          <Stat label="Amendments" value={signedMoney0(totals.amendments)} tone={totals.amendments < 0 ? 'danger' : 'default'} />
          <Stat label="Total" value={signedMoney0(totals.amount)} tone="brand" />
        </StatStrip>
      </div></FeatureGate>
      <ReportCard>
        <div className="flex flex-col justify-between gap-4 border-b border-gray-200 px-4 py-5 sm:px-6 lg:flex-row lg:items-end">
          <div className="flex flex-col items-start gap-4 md:flex-row md:items-end">
            <h3 className="whitespace-nowrap pb-2 text-lg font-bold text-gray-900">{year} Paint Pro Jobs Sold</h3>
            <div className="hidden h-6 w-px bg-gray-200 md:mb-2 md:block" />
            <DateRangeInputs value={range} onChange={setRange} />
          </div>
          <ExportButton onClick={exportCsv} />
        </div>
        <div className="rtable overflow-x-auto">
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
                  <td className={cn('px-4 py-3 text-right font-mono', totals.amount < 0 ? 'text-red-600' : 'text-gray-900')}>{signedMoney0(totals.amount)}</td>
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
                  <td className={cn(TD, 'font-mono text-gray-500 group-hover:text-primary-600')}>
                    <Link href={`/jobs/${r.jobId}`}>{r.jobNumber}</Link>
                    {r.entryLabel && <EntryChip label={r.entryLabel} />}
                  </td>
                  <td className={cn(TD, 'font-bold text-gray-800')}>{r.customer}</td>
                  <td className={cn(TD, 'text-gray-600')}>{r.source || '-'}</td>
                  <td className={cn(TD, 'text-right font-mono font-bold', r.amount < 0 ? 'text-red-600' : 'text-gray-900')}>{signedMoney0(r.amount)}</td>
                  <td className={cn(TD, 'text-center text-gray-600')}>{r.hours}</td>
                  <td className={cn(TD, 'text-center text-gray-600')}>{r.wash || '-'}</td>
                  <td className={cn(TD, 'text-center font-bold text-gray-700')}>{r.entryLabel ? '-' : r.hrsLeft}</td>
                  <td className={cn(TD, 'text-center')}>
                    <span className={cn('inline-flex min-w-12 items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-bold', r.paid ? 'border-green-200 bg-green-100 text-green-700' : 'border-red-200 bg-red-100 text-red-700')}>
                      {r.paid ? 'Yes' : 'No'}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center italic text-gray-500">No sold jobs found for this period.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PagerFooter p={p} />
      </ReportCard>
    </div>
  );
}

/* ---------- Sales by Estimator (RP-C2) ---------- */

export function SalesByEstimatorTab({ year, range, setRange }: { year: number; range: DateRange; setRange: (r: DateRange) => void }) {
  const db = useDb();
  const extra = useSalesExtra();
  const { toast } = useToast();
  const { rows, totals } = useMemo(() => salesByEstimator(db, range, extra), [db, range, extra]);

  const exportCsv = () => {
    downloadCsv(`sales-by-estimator-${year}.csv`, ['Estimator', 'New sales', 'Amendments', 'Total', 'Estimates sold'],
      rows.map((r) => [r.estimator, r.newSales, r.amendments, r.total, r.sold]));
    toast('Report exported successfully');
  };

  return (
    <ReportCard>
      <div className="flex flex-col justify-between gap-4 border-b border-gray-200 px-4 py-5 sm:px-6 lg:flex-row lg:items-end">
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-end">
          <h3 className="flex items-center gap-2 whitespace-nowrap pb-2 text-lg font-bold text-gray-900">
            Sales by Estimator ({year}) <VersionBadge item="RP-C2" />
          </h3>
          <div className="hidden h-6 w-px bg-gray-200 md:mb-2 md:block" />
          <DateRangeInputs value={range} onChange={setRange} />
        </div>
        <ExportButton onClick={exportCsv} />
      </div>
      <div className="rtable overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className={theadRow}>
              <th className={TH}>Estimator</th><th className={cn(TH, 'text-right')}>New sales</th><th className={cn(TH, 'text-right')}>Amendments</th>
              <th className={cn(TH, 'text-right')}>Total</th><th className={cn(TH, 'text-center')}>Estimates sold</th>
            </tr>
            {rows.length > 0 && (
              <tr className={totalsRow}>
                <td className="px-4 py-3 text-right text-xs uppercase tracking-wider text-gray-500">Totals</td>
                <td className="px-4 py-3 text-right font-mono text-gray-900">{signedMoney2(totals.newSales)}</td>
                <td className={cn('px-4 py-3 text-right font-mono', totals.amendments < 0 ? 'text-red-600' : 'text-gray-900')}>{signedMoney2(totals.amendments)}</td>
                <td className="px-4 py-3 text-right font-mono text-gray-900">{signedMoney2(totals.total)}</td>
                <td className="px-4 py-3 text-center text-gray-900">{totals.sold}</td>
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id || 'none'} className="transition-colors hover:bg-gray-50/80">
                <td className={cn(TD, 'font-bold text-gray-800')}>{r.estimator}</td>
                <td className={cn(TD, 'text-right font-mono text-gray-900')}>{signedMoney2(r.newSales)}</td>
                <td className={cn(TD, 'text-right font-mono', r.amendments < 0 ? 'text-red-600' : 'text-gray-900')}>{signedMoney2(r.amendments)}</td>
                <td className={cn(TD, 'text-right font-mono font-bold text-gray-900')}>{signedMoney2(r.total)}</td>
                <td className={cn(TD, 'text-center text-gray-600')}>{r.sold}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center italic text-gray-500">No sales found for this period.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
      <div className="rtable overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-200 bg-white text-xs font-bold uppercase tracking-wider text-gray-500">
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
                  <div className="text-xs text-gray-500">{[r.source, r.status].filter(Boolean).join(' · ')}</div>
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
                <td colSpan={6} className="px-6 py-8 text-center italic text-gray-500">No production jobs found for this period.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <PagerFooter p={p} />
    </ReportCard>
  );
}
