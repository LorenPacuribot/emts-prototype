/*
  Dashboard numbers, computed live from the local store.

  Why this file exists: the live app gets each dashboard card from its own
  API endpoint (/dashboard/widgets/*). Here we compute the same values from
  the store so every card updates as soon as data changes elsewhere.

  Period filter: most money and estimate cards only count records whose date
  falls inside the selected period (This Month by default, like the live app).
*/
import { derivedInvoiceStatus, estimateTotals, invoiceTotals } from '@/lib/calculations';
import type { Database, Estimate, JobStatus, Lead, PipelineStage } from '@/lib/types';
import { fullName, toISODate } from '@/lib/utils';

/* ---------- Period ---------- */

export type PeriodPreset = 'all_time' | 'this_week' | 'this_month' | 'quarterly' | 'this_year' | 'custom';

export interface PeriodValue {
  preset: PeriodPreset;
  /** Custom range, YYYY-MM-DD */
  from?: string;
  to?: string;
}

export const PERIOD_OPTIONS: { key: Exclude<PeriodPreset, 'custom'>; label: string }[] = [
  { key: 'all_time', label: 'All Time' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'this_year', label: 'This Year' },
];

/** Start (inclusive) and end (inclusive) of the period. null = unbounded. */
export function periodRange(p: PeriodValue, now = new Date()): { start: Date | null; end: Date | null } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (p.preset) {
    case 'all_time':
      return { start: null, end: null };
    case 'this_week': {
      // Monday to Sunday, same as the Schedule Agenda strip
      const day = now.getDay();
      const start = new Date(y, m, now.getDate() - (day === 0 ? 6 : day - 1));
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999);
      return { start, end };
    }
    case 'this_month':
      return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59, 999) };
    case 'quarterly': {
      const q = Math.floor(m / 3) * 3;
      return { start: new Date(y, q, 1), end: new Date(y, q + 3, 0, 23, 59, 59, 999) };
    }
    case 'this_year':
      return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59, 999) };
    case 'custom':
      return {
        start: p.from ? new Date(p.from + 'T00:00:00') : null,
        end: p.to ? new Date(p.to + 'T23:59:59') : null,
      };
  }
}

/** Parses 'YYYY-MM-DD' as local noon, anything else as a normal ISO date. */
export function parseDate(iso: string) {
  return new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
}

export function inRange(iso: string | undefined, r: { start: Date | null; end: Date | null }) {
  if (!iso) return false;
  const t = parseDate(iso).getTime();
  if (r.start && t < r.start.getTime()) return false;
  if (r.end && t > r.end.getTime()) return false;
  return true;
}

/** Label and target multiplier for the "Monthly Goal" card per period. */
export function goalFor(p: PeriodValue, monthly: number, annual: number) {
  switch (p.preset) {
    case 'this_week':
      return { label: 'Weekly Goal', target: (annual || monthly * 12) / 52 };
    case 'quarterly':
      return { label: 'Quarterly Goal', target: monthly * 3 };
    case 'this_year':
    case 'all_time':
      return { label: 'Annual Goal', target: annual || monthly * 12 };
    default:
      return { label: 'Monthly Goal', target: monthly };
  }
}

/* ---------- Money formats used on the cards ---------- */

/** $4,992.9 (no trailing zeros), as the live cards print numbers */
export const plainMoney = (n: number) => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US');
/** $5K / $25K */
export const kMoney = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : plainMoney(n));
/** $5.0K */
export const kMoney1 = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : plainMoney(n));

/* ---------- Job status groups ---------- */

/** Jobs being worked on right now (Jobs To Do card) */
export const TODO_STATUSES: JobStatus[] = ['In Production', 'Touch Up', 'Ready for Inspection'];
/** Every job that is not finished (Active Jobs card) */
export const ACTIVE_STATUSES: JobStatus[] = ['In Production', 'Touch Up', 'Ready for Inspection', 'Scheduled', 'Confirmed', 'Unscheduled'];

/** Lead status -> pipeline stage id */
export const LEAD_STAGE_ID: Record<Lead['status'], PipelineStage['stageId']> = {
  New: 'NEW', Contacted: 'CONTACTED', Scheduled: 'SCHEDULED', Pending: 'PENDING', Sold: 'SOLD', Lost: 'LOST', Archived: 'ARCHIVED',
};

/* ---------- Agenda ---------- */

export type AgendaType = 'LEAD' | 'WORK' | 'MEETING';

export const AGENDA_TYPE_OPTIONS: { value: AgendaType; label: string; dot: string }[] = [
  { value: 'LEAD', label: 'Lead Visits', dot: 'bg-blue-500' },
  { value: 'WORK', label: 'Work Orders', dot: 'bg-green-500' },
  { value: 'MEETING', label: 'Meetings', dot: 'bg-purple-500' },
];

export interface AgendaItem {
  id: string;
  type: AgendaType;
  title: string;
  /** YYYY-MM-DD, first and last day */
  startDate: string;
  endDate: string;
  time?: string; // 09:00
  location?: string;
  status?: string;
  href: string;
}

/* ---------- Compute everything ---------- */

export function computeDashboard(db: Database, period: PeriodValue) {
  const c = db.collections;
  const range = periodRange(period);
  const customerName = (id?: string) => fullName(c.customers.find((x) => x.id === id));

  const withTotal = (e: Estimate) => ({ e, total: estimateTotals(e).total });
  const periodEstimates = c.estimates.filter((e) => inRange(e.date, range)).map(withTotal);

  // Pending Sales: estimates waiting for the customer (Sent / Viewed)
  const pending = periodEstimates.filter(({ e }) => e.status === 'Sent' || e.status === 'Viewed');
  const pipelineValue = pending.reduce((s, x) => s + x.total, 0);

  // Estimate Status ring
  const counted = periodEstimates.filter(({ e }) => ['Draft', 'Sent', 'Viewed', 'Approved', 'Rejected'].includes(e.status));
  const soldCount = counted.filter(({ e }) => e.status === 'Approved').length;
  const declinedCount = counted.filter(({ e }) => e.status === 'Rejected').length;

  // Revenue: money actually received (payments dated in the period)
  let revenue = 0;
  for (const inv of c.invoices) {
    if (inv.status === 'Void') continue;
    for (const p of inv.payments) if (inRange(p.date, range)) revenue += p.amount;
  }

  // Win rate: approved / decided (approved + rejected)
  const decided = soldCount + declinedCount;
  const winRate = decided ? (soldCount / decided) * 100 : 0;
  const approved = counted.filter(({ e }) => e.status === 'Approved');
  const avgJob = approved.length ? approved.reduce((s, x) => s + x.total, 0) / approved.length : 0;

  // Monthly goal
  const gp = db.singletons.goalsProfit;
  const goal = goalFor(period, gp.monthlyRevenueTarget, gp.annualRevenueTarget);
  const topDeals = [...approved].sort((a, b) => b.total - a.total).slice(0, 3).map(({ e, total }) => ({
    id: e.id, customerName: customerName(e.customerId), estimateNumber: e.estimateNumber, amount: total,
  }));

  // Leads
  const recentLeads = [...c.leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const stages = [...c.pipelineStages].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => ({
    ...s,
    count: c.leads.filter((l) => LEAD_STAGE_ID[l.status] === s.stageId && inRange(l.date, range)).length,
  }));

  // Jobs
  const jobRow = (j: (typeof c.jobs)[number]) => ({ id: j.id, status: j.status, customerName: customerName(j.customerId), startDate: j.startDate });
  const statusRank = (s: JobStatus) => ACTIVE_STATUSES.indexOf(s);
  const jobsToDo = c.jobs.filter((j) => TODO_STATUSES.includes(j.status)).map(jobRow);
  const activeJobs = c.jobs
    .filter((j) => ACTIVE_STATUSES.includes(j.status))
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || (a.startDate ?? '9').localeCompare(b.startDate ?? '9'))
    .map(jobRow);

  // Invoices with money still owed
  const invoicesDue = c.invoices
    .map((inv) => ({ inv, status: derivedInvoiceStatus(inv), t: invoiceTotals(inv) }))
    .filter(({ status, t }) => status !== 'Draft' && status !== 'Void' && t.balance > 0)
    .sort((a, b) => a.inv.dueDate.localeCompare(b.inv.dueDate))
    .map(({ inv, status, t }) => ({
      id: inv.id, customerName: customerName(inv.customerId), dueDate: inv.dueDate, status, isOverdue: status === 'Overdue', dueAmount: t.balance,
    }));

  // Agenda: calendar events + scheduled jobs (date ranges) + open work orders
  const agenda: AgendaItem[] = [];
  for (const ev of c.events) {
    const type: AgendaType = ev.type === 'Meeting' ? 'MEETING' : ev.type === 'Job' ? 'WORK' : 'LEAD';
    agenda.push({ id: ev.id, type, title: ev.title, startDate: ev.date, endDate: ev.date, time: ev.startTime, location: ev.address, status: ev.status, href: '/calendar' });
  }
  for (const j of c.jobs) {
    if (!j.startDate || j.status === 'Cancelled' || j.status === 'Completed') continue;
    agenda.push({
      id: `job_${j.id}`, type: 'WORK', title: `${j.jobNumber} ${customerName(j.customerId)}`, startDate: j.startDate, endDate: j.endDate ?? j.startDate,
      location: j.address, status: j.status, href: `/jobs/${j.id}`,
    });
  }

  return {
    pending: pending.map(({ e, total }) => ({ id: e.id, customerName: customerName(e.customerId), value: total, status: e.status })),
    pipelineValue,
    estimateStatus: {
      total: counted.length,
      openCount: pending.length,
      soldRatio: counted.length ? soldCount / counted.length : 0,
      totalValue: revenue,
    },
    winRate: { winRate, accepted: soldCount, total: decided, avgJob },
    revenue: { total: revenue, annualTarget: gp.annualRevenueTarget },
    goal: { label: goal.label, actual: revenue, target: goal.target, percent: goal.target ? (revenue / goal.target) * 100 : 0, topDeals },
    recentLeads,
    stages,
    jobsToDo,
    activeJobs,
    invoicesDue,
    agenda,
    activity: [...c.activity].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30),
    messages: [...c.messages].sort((a, b) => b.date.localeCompare(a.date)),
    todayISO: toISODate(new Date()),
  };
}

export type DashboardData = ReturnType<typeof computeDashboard>;
