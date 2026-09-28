/*
  Report rows, built from the local store.

  The live app gets each tab from a /reports/* endpoint. These functions
  produce the same columns from our data so the tables, totals and CSV
  exports always match what the rest of the app shows.

  Hours:
    budget hours = the job's estimated hours (from the estimate's labor)
    used hours   = all of it when Completed, a share of it while the job is
                   in production (days passed / days scheduled), else 0
*/
import { derivedInvoiceStatus, estimateTotals, round2 } from '@/lib/calculations';
import type { Activity, Database, Estimate, EstimateStatus, Job } from '@/lib/types';
import { fullName } from '@/lib/utils';

export interface DateRange {
  start: string; // YYYY-MM-DD or ''
  end: string;
}

export function inDateRange(iso: string | undefined, r: DateRange) {
  if (!iso) return false;
  const day = iso.slice(0, 10);
  if (r.start && day < r.start) return false;
  if (r.end && day > r.end) return false;
  return true;
}

/** "5-Jan" style used in the live Present / Email columns */
export function shortDayMonth(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return `${d.getDate()}-${d.toLocaleDateString('en-US', { month: 'short' })}`;
}

/** Label shown in the Estimates Log status badge (live wording). */
export const ESTIMATE_STATUS_LABEL: Record<EstimateStatus, string> = {
  Draft: 'Draft', Sent: 'Sent', Viewed: 'Viewed', Approved: 'Sold', Rejected: 'Declined', Expired: 'Expired',
};

export const ESTIMATE_STATUS_GROUPS: { label: string; options: { value: EstimateStatus; label: string }[] }[] = [
  { label: 'Pending', options: [{ value: 'Draft', label: 'Draft' }, { value: 'Sent', label: 'Sent' }, { value: 'Viewed', label: 'Viewed' }] },
  { label: 'Sold', options: [{ value: 'Approved', label: 'Sold' }] },
  { label: 'Closed', options: [{ value: 'Rejected', label: 'Declined' }, { value: 'Expired', label: 'Expired' }] },
];

export function usedHours(job: Job, now = new Date()) {
  if (job.status === 'Completed' || job.status === 'Marketing') return job.estimatedHours;
  if (!['In Production', 'Touch Up', 'Ready for Inspection'].includes(job.status) || !job.startDate) return 0;
  const start = new Date(job.startDate + 'T00:00:00').getTime();
  const end = new Date((job.endDate ?? job.startDate) + 'T23:59:59').getTime();
  const share = Math.min(1, Math.max(0, (now.getTime() - start) / Math.max(end - start, 1)));
  const base = job.status === 'In Production' ? share : 0.9; // touch up / inspection = nearly done
  return round2(job.estimatedHours * base);
}

function sourceFor(db: Database, e: Estimate | undefined, customerId?: string) {
  const lead = e?.leadId ? db.collections.leads.find((l) => l.id === e.leadId) : undefined;
  if (lead) return lead.leadSource;
  return db.collections.customers.find((c) => c.id === (customerId ?? e?.customerId))?.source ?? '';
}

const customerName = (db: Database, id?: string) => fullName(db.collections.customers.find((c) => c.id === id));

/* ---------- Estimates Log ---------- */

export function estimatesLog(db: Database, range: DateRange, statuses: EstimateStatus[], search: string) {
  const q = search.trim().toLowerCase();
  const rows = db.collections.estimates
    .filter((e) => inDateRange(e.date, range))
    .filter((e) => !statuses.length || statuses.includes(e.status))
    .map((e) => {
      const t = estimateTotals(e);
      const job = e.jobId ? db.collections.jobs.find((j) => j.id === e.jobId) : undefined;
      const hours = job ? job.estimatedHours : round2(t.laborHours);
      const presentation = db.collections.presentations.find((p) => p.estimateId === e.id);
      return {
        id: e.id,
        date: e.date,
        estimateNumber: e.estimateNumber,
        customer: customerName(db, e.customerId),
        source: sourceFor(db, e),
        hours,
        hrsLeft: job ? round2(Math.max(hours - usedHours(job), 0)) : hours,
        amount: t.total,
        pending: ['Draft', 'Sent', 'Viewed'].includes(e.status) ? t.total : 0,
        status: e.status,
        present: presentation?.updatedAt ?? e.viewedAt,
        email: e.sentAt,
      };
    })
    .filter((r) => !q || r.estimateNumber.toLowerCase().includes(q) || r.customer.toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date));
  const totals = {
    hours: round2(rows.reduce((s, r) => s + r.hours, 0)),
    hrsLeft: round2(rows.reduce((s, r) => s + r.hrsLeft, 0)),
    amount: round2(rows.reduce((s, r) => s + r.amount, 0)),
    pending: round2(rows.reduce((s, r) => s + r.pending, 0)),
  };
  return { rows, totals };
}

/* ---------- Jobs Sold ---------- */

export function soldDate(db: Database, job: Job) {
  const e = db.collections.estimates.find((x) => x.id === job.estimateId);
  return e?.approvedAt ?? job.createdAt;
}

function jobPaid(db: Database, job: Job) {
  const invs = db.collections.invoices.filter((i) => i.jobId === job.id && i.status !== 'Void' && i.status !== 'Draft');
  return invs.length > 0 && invs.every((i) => derivedInvoiceStatus(i) === 'Paid');
}

/** Pressure-wash hours: labor on estimate lines whose surface or description mentions washing. */
function washHours(db: Database, job: Job) {
  const e = db.collections.estimates.find((x) => x.id === job.estimateId);
  if (!e) return 0;
  return round2(e.lineItems.filter((l) => /wash/i.test(l.surfaceType + ' ' + l.description)).reduce((s, l) => s + l.laborHours, 0));
}

export function jobsSold(db: Database, range: DateRange) {
  const rows = db.collections.jobs
    .filter((j) => j.status !== 'Cancelled')
    .map((j) => {
      const e = db.collections.estimates.find((x) => x.id === j.estimateId);
      return {
        id: j.id,
        date: soldDate(db, j),
        jobNumber: j.jobNumber,
        customer: customerName(db, j.customerId),
        source: sourceFor(db, e, j.customerId),
        amount: j.value,
        hours: j.estimatedHours,
        wash: washHours(db, j),
        hrsLeft: round2(Math.max(j.estimatedHours - usedHours(j), 0)),
        paid: jobPaid(db, j),
      };
    })
    .filter((r) => inDateRange(r.date, range))
    .sort((a, b) => b.date.localeCompare(a.date));
  const totals = {
    amount: round2(rows.reduce((s, r) => s + r.amount, 0)),
    hours: round2(rows.reduce((s, r) => s + r.hours, 0)),
    wash: round2(rows.reduce((s, r) => s + r.wash, 0)),
    hrsLeft: round2(rows.reduce((s, r) => s + r.hrsLeft, 0)),
  };
  return { rows, totals };
}

/* ---------- Jobs To Do (production schedule) ---------- */

export function jobsToDo(db: Database, range: DateRange) {
  return db.collections.jobs
    .filter((j) => !['Completed', 'Cancelled', 'Marketing'].includes(j.status))
    .filter((j) => (!range.start && !range.end) || inDateRange(j.startDate ?? soldDate(db, j), range))
    .map((j) => {
      const e = db.collections.estimates.find((x) => x.id === j.estimateId);
      const used = usedHours(j);
      return {
        id: j.id,
        jobNumber: j.jobNumber,
        customer: customerName(db, j.customerId),
        source: sourceFor(db, e, j.customerId),
        status: j.status,
        contract: j.value,
        budgetHrs: j.estimatedHours,
        usedHrs: used,
        remainingHrs: round2(Math.max(j.estimatedHours - used, 0)),
        percentUsed: j.estimatedHours ? (used / j.estimatedHours) * 100 : 0,
      };
    })
    .sort((a, b) => a.jobNumber.localeCompare(b.jobNumber, undefined, { numeric: true }));
}

/* ---------- Monthly stats (Sales Goal + Stats tabs) ---------- */

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function monthlyStats(db: Database, year: number) {
  const gp = db.singletons.goalsProfit;
  const saved = gp.reportGoals?.[String(year)];
  const avgJobSize = gp.avgJobSize || 3500;
  const closingRate = gp.closingRate || 35;
  const sold = jobsSold(db, { start: `${year}-01-01`, end: `${year}-12-31` }).rows;
  return MONTH_NAMES.map((name, i) => {
    const mm = String(i + 1).padStart(2, '0');
    const r = { start: `${year}-${mm}-01`, end: `${year}-${mm}-31` };
    const jobs = sold.filter((j) => inDateRange(j.date, r));
    const salesGoal = saved?.[i]?.salesGoal ?? gp.monthlyRevenueTarget;
    const estimateGoal = saved?.[i]?.estimateGoal ?? Math.ceil(salesGoal / (avgJobSize * (closingRate / 100)));
    return {
      month: i,
      monthName: name,
      estimateGoal,
      salesGoal,
      estimatesDone: db.collections.estimates.filter((e) => e.status !== 'Draft' && inDateRange(e.date, r)).length,
      jobsSold: jobs.length,
      actualSold: round2(jobs.reduce((s, j) => s + j.amount, 0)),
      jobs,
    };
  });
}

/* ---------- Activity Log ---------- */

export const ACTIVITY_ENTITY_OPTIONS = [
  { value: 'lead', label: 'Lead' },
  { value: 'estimate', label: 'Estimate' },
  { value: 'job', label: 'Job' },
  { value: 'invoice', label: 'Invoice' },
];

/**
 * Our activity feed stores sentences like "Sam Sample - Payment Received".
 * This splits them into the customer and the action, and guesses an
 * activity type for the colored chip.
 */
export function activityRow(db: Database, a: Activity) {
  const [who, ...rest] = a.text.split(' - ');
  const title = rest.length ? rest.join(' - ') : a.text;
  const customer = rest.length ? who!.replace(/\s*\(USER\)\s*/, '') : '';
  const t = title.toLowerCase();
  let type = 'Updated';
  if (t.includes('payment')) type = 'Payment Recorded';
  else if (t.includes('invoice')) type = t.includes('sent') ? 'Invoice Sent' : 'Invoice Created';
  else if (t.includes('estimate')) type = t.includes('sent') ? 'Estimate Sent' : t.includes('accept') || t.includes('approved') ? 'Estimate Accepted' : 'Estimate Edited';
  else if (t.includes('lead')) type = t.includes('created') || t.includes('new') ? 'Lead Created' : 'Lead Status Changed';
  else if (t.includes('job') || t.includes('log')) type = t.includes('created') ? 'Job Created' : 'Job Status Changed';
  else if (t.includes('appointment')) type = 'Lead Status Changed';

  const ref =
    a.entity === 'lead' ? db.collections.leads.find((x) => x.id === a.entityId)?.leadNumber
      : a.entity === 'estimate' ? db.collections.estimates.find((x) => x.id === a.entityId)?.estimateNumber
        : a.entity === 'job' ? db.collections.jobs.find((x) => x.id === a.entityId)?.jobNumber
          : a.entity === 'invoice' ? db.collections.invoices.find((x) => x.id === a.entityId)?.invoiceNumber
            : undefined;
  const user = who?.includes('(USER)') ? who.replace(/\s*\(USER\)\s*/, '') : fullName(db.collections.team.find((m) => m.id === db.singletons.currentUserId));
  return { id: a.id, date: a.date, type, entity: a.entity, entityId: a.entityId, reference: ref ?? '', title, user, customer: who?.includes('(USER)') ? '' : customer };
}

export const ACTIVITY_TYPE_COLOR: Record<string, string> = {
  'Lead Created': 'bg-blue-100 text-blue-700 border-blue-200',
  'Lead Status Changed': 'bg-blue-100 text-blue-700 border-blue-200',
  'Estimate Sent': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  'Estimate Accepted': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  'Estimate Edited': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  'Invoice Created': 'bg-green-100 text-green-700 border-green-200',
  'Invoice Sent': 'bg-green-100 text-green-700 border-green-200',
  'Payment Recorded': 'bg-green-100 text-green-700 border-green-200',
  'Job Created': 'bg-orange-100 text-orange-700 border-orange-200',
  'Job Status Changed': 'bg-orange-100 text-orange-700 border-orange-200',
  Updated: 'bg-gray-100 text-gray-700 border-gray-200',
};

/* ---------- CSV ---------- */

/** Builds a CSV string and downloads it in the browser. */
export function downloadCsv(filename: string, header: string[], rows: (string | number | boolean | null | undefined)[][]) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
