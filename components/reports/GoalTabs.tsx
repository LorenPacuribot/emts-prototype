'use client';

/*
  Goal-based report tabs.

  SalesGoalTab: one card per month that has sales or a goal, listing the
  jobs sold that month against the month's sales goal.

  StatsTab: the yearly performance grid. "Estimate Goal" and "Sales Goal"
  rows are editable; changing one updates the other using
  1 estimate = average job size x close rate. Edits are saved (on blur) to
  Goals & Profit settings (goalsProfit.reportGoals), so they persist.
*/
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Download, Info } from 'lucide-react';
import { useDb, useSingleton } from '@/lib/store';
import { cn, shortDate } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { MONTH_NAMES, downloadCsv, inDateRange, monthlyStats, type DateRange } from './data';
import { DateRangeInputs, ExportButton, ReportCard, money0, money2 } from './shared';

const MONTH_LABELS = ['JAN', 'FEB', 'MAR', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUG', 'SEPT', 'OCT', 'NOV', 'DEC'];

const compact = (v: number) => {
  if (!v) return '-';
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  return a < 1000 ? `${sign}$${a.toFixed(0)}` : `${sign}$${(a / 1000).toFixed(0)}k`;
};

/* ---------- Sales Goal ---------- */

export function SalesGoalTab({ year, range, setRange }: { year: number; range: DateRange; setRange: (r: DateRange) => void }) {
  const db = useDb();
  const { toast } = useToast();
  const months = useMemo(() => monthlyStats(db, year), [db, year]);

  // Months inside the date range that have jobs, a goal or sales
  const periods = months
    .map((m) => ({ ...m, jobs: m.jobs.filter((j) => inDateRange(j.date, range)) }))
    .filter((m) => {
      const mm = String(m.month + 1).padStart(2, '0');
      const monthStart = `${year}-${mm}-01`;
      const monthEnd = `${year}-${mm}-31`;
      if (range.start && monthEnd < range.start) return false;
      if (range.end && monthStart > range.end) return false;
      return m.jobs.length > 0 || m.salesGoal > 0;
    });

  const exportRows = (list: typeof periods, name: string) => {
    downloadCsv(name, ['Month', 'Date', 'Job ID', 'Customer', 'Source', 'Amount', 'Hours', 'Goal', 'Total Sold'],
      list.flatMap((m) =>
        m.jobs.length
          ? m.jobs.map((j) => [m.monthName, shortDate(j.date), j.jobNumber, j.customer, j.source, j.amount, j.hours, m.salesGoal, m.actualSold])
          : [[m.monthName, '', '', '', '', '', '', m.salesGoal, 0]],
      ));
    toast('Report exported successfully');
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:flex-row md:items-end">
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-end">
          <span className="pb-2.5 text-sm font-bold uppercase tracking-wider text-gray-500">Period:</span>
          <DateRangeInputs value={range} onChange={setRange} />
        </div>
        <ExportButton onClick={() => exportRows(periods, `sales-goal-${year}.csv`)}>Export Year</ExportButton>
      </div>

      {periods.map((m) => (
        <div key={m.month} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex flex-col items-start justify-between border-b border-gray-100 px-6 py-6 sm:flex-row sm:items-center">
            <h3 className="font-heading text-xl font-bold text-gray-900">{m.monthName} Performance</h3>
            <div className="mt-4 flex items-center gap-6 sm:mt-0">
              <div className="hidden text-right sm:block">
                <div className="mb-0.5 text-xxs font-bold uppercase tracking-widest text-gray-500">Goal</div>
                <div className="text-xl font-bold text-gray-500">{money0(m.salesGoal)}</div>
              </div>
              <div className="text-right">
                <div className="mb-0.5 text-xxs font-bold uppercase tracking-widest text-gray-500">Total Sold</div>
                <div className="text-2xl font-black text-gray-900">{money2(m.jobs.reduce((s, j) => s + j.amount, 0))}</div>
              </div>
              <button
                className="self-center rounded-lg bg-gray-50 p-2 text-gray-500 transition-colors hover:text-gray-600"
                title={`Export ${m.monthName}`}
                aria-label={`Export ${m.monthName}`}
                onClick={() => exportRows([m], `sales-goal-${year}-${String(m.month + 1).padStart(2, '0')}.csv`)}
              >
                <Download className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="rtable overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50/50 text-xs font-bold uppercase tracking-wider text-gray-500">
                  <th className="px-6 py-3">Date</th><th className="px-6 py-3">Job ID</th><th className="px-6 py-3">Customer</th>
                  <th className="px-6 py-3">Source</th><th className="px-6 py-3 text-right">Amount</th><th className="px-6 py-3 text-center">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {m.jobs.map((j) => (
                  <tr key={j.id} className="transition-colors hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4 font-medium text-gray-600">{shortDate(j.date)}</td>
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-xs text-gray-500"><Link href={`/jobs/${j.id}`} className="hover:text-primary-600">{j.jobNumber}</Link></td>
                    <td className="whitespace-nowrap px-6 py-4 font-bold text-gray-900">{j.customer}</td>
                    <td className="whitespace-nowrap px-6 py-4">
                      {j.source ? <span className="inline-flex rounded bg-gray-100 px-2 py-1 text-xxs font-bold uppercase tracking-wide text-gray-500">{j.source}</span> : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right font-mono font-bold text-gray-900">{money0(j.amount)}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-center text-gray-600">{j.hours}</td>
                  </tr>
                ))}
                {m.jobs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center italic text-gray-500">No sales recorded for this period.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {periods.length === 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center italic text-gray-500 shadow-sm">No sales recorded for this period.</div>
      )}
    </div>
  );
}

/* ---------- Stats (yearly performance summary) ---------- */

function GoalInfo({ perEstimate, avgJobSize, closingRate, hover }: { perEstimate: number; avgJobSize: number; closingRate: number; hover: string }) {
  return (
    <div className="group/info relative">
      <Info className={cn('h-3.5 w-3.5 cursor-help text-gray-500', hover)} />
      <div className="invisible absolute left-full top-1/2 z-50 ml-2 w-64 -translate-y-1/2 rounded-lg border border-gray-200 bg-white p-3 text-xs font-normal normal-case text-gray-900 opacity-0 shadow-xl transition-all group-hover/info:visible group-hover/info:opacity-100">
        <div className="mb-1 font-bold">Goal Calculation</div>
        <p className="mb-2 text-gray-500">Based on your settings, 1 Estimate equals <strong>{money0(perEstimate)}</strong> in expected Sales.</p>
        <div className="space-y-1 rounded border border-gray-100 bg-gray-50 p-2">
          <div className="flex justify-between"><span>Avg Job Size:</span><strong>{money0(avgJobSize)}</strong></div>
          <div className="flex justify-between"><span>Close Rate:</span><strong>{closingRate}%</strong></div>
        </div>
      </div>
    </div>
  );
}

function BelowTarget({ title, target, needed }: { title: string; target: string; needed: string }) {
  return (
    <div className="group relative flex items-center">
      <span className="flex cursor-help items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-bold text-amber-600">
        <AlertCircle className="h-3 w-3" /> Below Target
      </span>
      <div className="invisible absolute right-0 top-full z-50 mt-1.5 w-48 rounded-lg border border-gray-200 bg-white p-2.5 text-xs opacity-0 shadow-xl transition-all group-hover:visible group-hover:opacity-100">
        <div className="mb-1.5 font-bold text-gray-900">{title}</div>
        <div className="mb-1 flex justify-between"><span className="text-gray-500">Target:</span><span className="font-medium">{target}</span></div>
        <div className="mt-1 flex justify-between border-t border-gray-100 pt-1 font-bold text-amber-600"><span>Needed:</span><span>{needed}</span></div>
      </div>
    </div>
  );
}

export function StatsTab({ year }: { year: number }) {
  const db = useDb();
  const [gp, setGp] = useSingleton('goalsProfit');
  const { toast } = useToast();
  const months = useMemo(() => monthlyStats(db, year), [db, year]);

  const avgJobSize = gp.avgJobSize || 3500;
  const closingRate = gp.closingRate || 35;
  const perEstimate = avgJobSize * (closingRate / 100);
  const targetRevenue = gp.profitMargin > 0 ? gp.desiredAnnualIncome / (gp.profitMargin / 100) : 0;
  const annualEstimatesTarget = perEstimate > 0 ? Math.ceil(targetRevenue / perEstimate) : 0;

  const [estGoals, setEstGoals] = useState<number[]>(() => months.map((m) => m.estimateGoal));
  const [salesGoals, setSalesGoals] = useState<number[]>(() => months.map((m) => m.salesGoal));
  const key = months.map((m) => `${m.estimateGoal}-${m.salesGoal}`).join(',');
  useEffect(() => {
    setEstGoals(months.map((m) => m.estimateGoal));
    setSalesGoals(months.map((m) => m.salesGoal));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const totalEst = estGoals.reduce((s, v) => s + v, 0);
  const totalSales = salesGoals.reduce((s, v) => s + v, 0);
  const diffs = months.map((m, i) => m.actualSold - (salesGoals[i] ?? 0));

  const changeEst = (i: number, raw: string) => {
    const v = parseInt(raw.replace(/[^0-9]/g, ''), 10) || 0;
    setEstGoals((g) => g.map((x, j) => (j === i ? v : x)));
    setSalesGoals((g) => g.map((x, j) => (j === i ? Math.round(v * perEstimate) : x)));
  };
  const changeSales = (i: number, raw: string) => {
    const v = parseFloat(raw.replace(/[^0-9.]/g, '')) || 0;
    setSalesGoals((g) => g.map((x, j) => (j === i ? v : x)));
    setEstGoals((g) => g.map((x, j) => (j === i ? (perEstimate > 0 ? Math.ceil(v / perEstimate) : x) : x)));
  };
  const saveGoals = (i: number) => {
    const m = months[i]!;
    if (estGoals[i] === m.estimateGoal && salesGoals[i] === m.salesGoal) return;
    const next = months.map((_, j) => ({ estimateGoal: estGoals[j] ?? 0, salesGoal: salesGoals[j] ?? 0 }));
    setGp({ reportGoals: { ...(gp.reportGoals ?? {}), [String(year)]: next } });
    toast('Goal saved successfully');
  };

  const exportCsv = () => {
    downloadCsv(`stats-${year}.csv`, ['Metric', ...MONTH_NAMES], [
      ['Estimate Goal', ...estGoals],
      ['Estimates Done', ...months.map((m) => m.estimatesDone)],
      ['Jobs Sold', ...months.map((m) => m.jobsSold)],
      ['Sales Goal', ...salesGoals],
      ['Actual Sold', ...months.map((m) => m.actualSold)],
      ['Differential', ...diffs],
    ]);
    toast('Report exported successfully');
  };

  const cellL = 'sticky left-0 z-10 border-r border-gray-100 bg-white p-4 text-xs font-bold text-gray-900';
  const maxBar = Math.max(1, ...months.map((m) => m.actualSold), ...salesGoals);

  return (
    <div className="space-y-6">
      <ReportCard className="shadow-xl">
        <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-6 py-5">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-bold text-gray-900">{year} Performance Summary</h3>
            <div className="hidden items-center gap-4 border-l border-gray-200 px-4 md:flex">
              <div className="flex flex-col">
                <span className="text-xxs font-bold uppercase tracking-widest text-gray-500">Target Revenue</span>
                <span className="font-bold text-gray-900">{money0(targetRevenue)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xxs font-bold uppercase tracking-widest text-gray-500">Goal Total</span>
                <div className="flex items-center gap-2">
                  <span className={cn('font-bold', totalSales >= targetRevenue ? 'text-green-600' : 'text-amber-500')}>{money0(totalSales)}</span>
                  {totalSales < targetRevenue && <BelowTarget title="Sales Goal Shortfall" target={money0(targetRevenue)} needed={`+${money0(targetRevenue - totalSales)}`} />}
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-xxs font-bold uppercase tracking-widest text-gray-500">Annual Est. Goal</span>
                <span className="font-bold text-gray-900">{annualEstimatesTarget} Est.</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xxs font-bold uppercase tracking-widest text-gray-500">Current Est.</span>
                <div className="flex items-center gap-2">
                  <span className={cn('font-bold', totalEst >= annualEstimatesTarget ? 'text-green-600' : 'text-amber-500')}>{totalEst} Est.</span>
                  {totalEst < annualEstimatesTarget && <BelowTarget title="Estimates Shortfall" target={`${annualEstimatesTarget} Est.`} needed={`+${annualEstimatesTarget - totalEst} Est.`} />}
                </div>
              </div>
            </div>
          </div>
          <ExportButton onClick={exportCsv}>Report</ExportButton>
        </div>

        <div className="rtable overflow-x-auto pb-2">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-white">
                <th className="sticky left-0 z-10 w-48 border-r border-gray-100 bg-white p-4 text-xs font-black uppercase tracking-widest text-gray-500">Metric</th>
                {MONTH_LABELS.map((m) => (
                  <th key={m} className="min-w-[88px] border-l border-gray-100 p-3 text-center text-xs font-bold uppercase text-gray-600">{m}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td colSpan={13} className="sticky left-0 bg-white p-3 pl-4 text-xxs font-bold uppercase tracking-widest text-blue-600">Estimates Pipeline</td>
              </tr>
              <tr className="group hover:bg-gray-50/50">
                <td className={cn(cellL, 'group-hover:bg-gray-50')}>
                  <div className="flex items-center justify-between">
                    <div>Estimate Goal<span className="mt-0.5 block text-xs font-normal text-gray-500">Editable</span></div>
                    <GoalInfo perEstimate={perEstimate} avgJobSize={avgJobSize} closingRate={closingRate} hover="hover:text-blue-500" />
                  </div>
                </td>
                {estGoals.map((v, i) => (
                  <td key={i} className="border-l border-gray-50 p-1 text-center">
                    <input
                      aria-label={`${MONTH_NAMES[i]} estimate goal`}
                      value={v}
                      onChange={(e) => changeEst(i, e.target.value)}
                      onBlur={() => saveGoals(i)}
                      className="w-full cursor-pointer rounded bg-transparent py-2 text-center text-xs font-bold text-blue-600 outline-none ring-inset ring-blue-200 hover:bg-gray-50 focus:bg-blue-50 focus:ring-2"
                    />
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-gray-50/50">
                <td className={cellL}>Estimates Done</td>
                {months.map((m) => <td key={m.month} className="border-l border-gray-50 p-3 text-center text-xs italic text-gray-500">{m.estimatesDone}</td>)}
              </tr>
              <tr className="hover:bg-gray-50/50">
                <td className={cellL}>Jobs Sold</td>
                {months.map((m) => <td key={m.month} className="border-l border-gray-100 p-3 text-center text-xs font-bold text-gray-900">{m.jobsSold}</td>)}
              </tr>
              <tr className="border-t border-gray-200">
                <td colSpan={13} className="sticky left-0 bg-white p-3 pl-4 text-xxs font-bold uppercase tracking-widest text-green-600">Revenue Performance</td>
              </tr>
              <tr className="group hover:bg-gray-50/50">
                <td className={cn(cellL, 'group-hover:bg-gray-50')}>
                  <div className="flex items-center justify-between">
                    <div>Sales Goal<span className="mt-0.5 block text-xs font-normal text-gray-500">Editable</span></div>
                    <GoalInfo perEstimate={perEstimate} avgJobSize={avgJobSize} closingRate={closingRate} hover="hover:text-green-500" />
                  </div>
                </td>
                {salesGoals.map((v, i) => (
                  <td key={i} className="border-l border-gray-50 p-1 text-center">
                    <input
                      aria-label={`${MONTH_NAMES[i]} sales goal`}
                      value={`$${v.toLocaleString('en-US')}`}
                      onChange={(e) => changeSales(i, e.target.value)}
                      onBlur={() => saveGoals(i)}
                      className="w-full cursor-pointer rounded bg-transparent py-2 text-center text-xs font-bold text-green-600 outline-none ring-inset ring-green-200 hover:bg-gray-50 focus:bg-green-50 focus:ring-2"
                    />
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-gray-50/50">
                <td className={cellL}>Actual Sold</td>
                {months.map((m) => <td key={m.month} className="border-l border-gray-100 p-3 text-center text-xs font-bold text-gray-900">{compact(m.actualSold)}</td>)}
              </tr>
              <tr className="border-t border-gray-100">
                <td className={cellL}>Differential</td>
                {diffs.map((v, i) => (
                  <td key={i} className={cn('border-l border-white p-3 text-center text-xs font-bold', v < 0 ? 'bg-red-50 text-red-600' : v > 0 ? 'bg-green-50 text-green-600' : 'text-gray-300')}>
                    {v !== 0 ? `${v > 0 ? '+' : ''}${compact(v)}` : '-'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </ReportCard>

      {/* Goal vs actual chart (plain CSS bars) */}
      <ReportCard className="shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="text-base font-bold text-gray-900">Sales Goal vs Actual Sold</h3>
          <div className="flex items-center gap-4 text-xs font-semibold text-gray-500">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-green-200" /> Goal</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary-600" /> Actual</span>
          </div>
        </div>
        <div className="overflow-x-auto px-6 py-5">
          <div className="flex h-48 min-w-[640px] items-end gap-3">
            {months.map((m, i) => (
              <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <div className="flex h-full w-full items-end justify-center gap-1">
                  <div className="w-1/3 rounded-t bg-green-200" style={{ height: `${((salesGoals[i] ?? 0) / maxBar) * 100}%` }} title={`Goal ${money0(salesGoals[i] ?? 0)}`} />
                  <div className="w-1/3 rounded-t bg-primary-600" style={{ height: `${(m.actualSold / maxBar) * 100}%` }} title={`Actual ${money0(m.actualSold)}`} />
                </div>
                <span className="text-xxs font-bold uppercase text-gray-500">{MONTH_LABELS[i]!.slice(0, 3)}</span>
              </div>
            ))}
          </div>
        </div>
      </ReportCard>
    </div>
  );
}
