/*
  One view over the records automations work on. The records live in the
  features engine (features/types Database): leads, estimates, jobs, work
  orders and invoices. This reads them into one shape with a stage, the
  person assigned, the customer, the linked records and the dates the
  triggers use. Pure.
*/
import type { Database as FDb, Estimate, Invoice, Job, Lead, WorkOrder } from '@/features/types';
import type { PipelineModule } from './types';
import { stageLabel } from './registry';

export interface RecordView {
  type: PipelineModule;
  id: string;
  label: string;
  stage: string;
  assignedUserId?: string;
  customerId?: string;
  leadId?: string;
  estimateId?: string;
  jobId?: string;
  workOrderId?: string;
  invoiceIds: string[];
  createdAt?: string;
  dates: Record<string, string | undefined>;
  /** Field values watched by "A field changes". */
  fields: Record<string, string>;
  /** Invoices: amount paid so far. */
  paid?: number;
}

const LEAD_STAGE: Record<Lead['stage'], string> = {
  new_lead: 'NEW', contacted: 'CONTACTED', estimate_scheduled: 'SCHEDULED', pending: 'PENDING', sold: 'SOLD', lost: 'LOST', archived: 'ARCHIVED',
};
export const LEAD_STAGE_TO_FEATURE: Record<string, Lead['stage']> = Object.fromEntries(Object.entries(LEAD_STAGE).map(([k, v]) => [v, k as Lead['stage']]));

const JOB_STAGE: Partial<Record<Job['status'], string>> = {
  unscheduled: 'UNSCHEDULED', confirmed: 'CONFIRMED', scheduled: 'SCHEDULED', in_production: 'IN_PRODUCTION', touch_up: 'TOUCH_UP',
  ready_for_inspection: 'READY_FOR_INSPECTION', completed: 'COMPLETED',
};
export const JOB_STAGE_TO_FEATURE: Record<string, Job['status']> = Object.fromEntries(Object.entries(JOB_STAGE).map(([k, v]) => [v, k as Job['status']]));

const round2 = (n: number) => Math.round(n * 100) / 100;

export function invoicePaidAmount(inv: Invoice): number {
  return round2((inv.payments ?? []).reduce((a, p) => a + p.amount, 0) + (inv.status === 'paid' && !inv.payments?.length ? inv.amount : 0));
}

export function invoiceBalanceDue(inv: Invoice): number {
  return inv.status === 'void' ? 0 : round2(Math.max(0, inv.amount - invoicePaidAmount(inv)));
}

/** Due date: the replica shows invoices as due 15 days after they are created (lib/bridge/map.ts). */
export function invoiceDueDate(inv: Invoice): string {
  const d = new Date(inv.createdAt);
  d.setDate(d.getDate() + 15);
  return d.toISOString();
}

export function invoiceStage(inv: Invoice, now: Date): string {
  if (inv.status === 'void') return 'VOID';
  if (inv.status === 'paid' || (inv.amount > 0 && invoiceBalanceDue(inv) === 0 && inv.status !== 'draft')) return 'PAID';
  if (inv.status === 'draft') return 'DRAFT';
  if (Date.parse(invoiceDueDate(inv)) < now.getTime()) return 'OVERDUE';
  return inv.status === 'partial' || invoicePaidAmount(inv) > 0 ? 'PARTIAL' : 'SENT';
}

/** Deposit, progress or final (prototype: the acceptance draft is the contract invoice that carries the deposit). */
export function invoiceKind(inv: Invoice): 'DEPOSIT' | 'PROGRESS' | 'FINAL' | 'OTHER' {
  if (inv.automationType) return inv.automationType.toUpperCase() as 'DEPOSIT' | 'PROGRESS' | 'FINAL';
  if (inv.kind === 'standard' && inv.depositDue) return 'DEPOSIT';
  if (inv.kind === 'standard' && inv.lines) return 'FINAL';
  return 'OTHER';
}

/** Deposit paid: payments on the deposit invoice reach the deposit due (or its amount). */
export function depositPaid(db: FDb, jobId?: string): { paid: boolean; invoice?: Invoice } {
  const invs = db.invoices.filter((i) => i.jobId === jobId && i.status !== 'void');
  const dep = invs.find((i) => i.automationType === 'deposit') ?? invs.find((i) => i.kind === 'standard' && i.depositDue);
  if (!dep) return { paid: false };
  const due = dep.automationType === 'deposit' ? dep.amount : dep.depositDue ?? dep.amount;
  return { paid: invoicePaidAmount(dep) >= due - 0.005, invoice: dep };
}

export function jobBalance(db: FDb, jobId?: string): { owed: number; open: Invoice[] } {
  const open = db.invoices.filter((i) => i.jobId === jobId && i.status !== 'void' && invoiceBalanceDue(i) > 0);
  return { owed: round2(open.reduce((a, i) => a + invoiceBalanceDue(i), 0)), open };
}

const customerName = (db: FDb, id?: string) => db.customers.find((c) => c.id === id)?.name ?? 'Customer';

function leadView(db: FDb, l: Lead): RecordView {
  const est = db.estimates.find((e) => e.id === l.estimateId);
  const job = est?.jobId ? db.jobs.find((j) => j.id === est.jobId && j.status !== 'estimating') : undefined;
  return {
    type: 'LEAD', id: l.id, label: `Lead ${l.id}, ${l.name ?? customerName(db, l.customerId)}`, stage: LEAD_STAGE[l.stage],
    assignedUserId: l.assignedUserId, customerId: l.customerId, leadId: l.id, estimateId: l.estimateId, jobId: job?.id,
    workOrderId: job ? db.workOrders.find((w) => w.jobId === job.id)?.id : undefined, invoiceIds: job ? db.invoices.filter((i) => i.jobId === job.id).map((i) => i.id) : [],
    createdAt: l.createdAt, dates: { appointmentAt: l.scheduledAt, createdAt: l.createdAt },
    fields: { assignedUserId: l.assignedUserId ?? '', appointmentAt: l.scheduledAt ?? '', source: l.source },
  };
}

function estimateView(db: FDb, e: Estimate): RecordView {
  const job = e.jobId ? db.jobs.find((j) => j.id === e.jobId && j.status !== 'estimating') : undefined;
  return {
    type: 'ESTIMATE', id: e.id, label: `Estimate ${e.id}, ${customerName(db, e.customerId)}`, stage: e.status, assignedUserId: e.estimatorId,
    customerId: e.customerId, leadId: e.leadId, estimateId: e.id, jobId: job?.id, workOrderId: job ? db.workOrders.find((w) => w.jobId === job.id)?.id : undefined,
    invoiceIds: job ? db.invoices.filter((i) => i.jobId === job.id).map((i) => i.id) : [], createdAt: e.createdAt,
    dates: { sentAt: e.sentAt, validUntil: e.validUntil, createdAt: e.createdAt },
    fields: { estimatorId: e.estimatorId ?? '', total: String(e.total) },
  };
}

function jobView(db: FDb, j: Job): RecordView {
  const wo = db.workOrders.find((w) => w.jobId === j.id);
  return {
    type: 'JOB', id: j.id, label: `Job ${j.id}, ${customerName(db, j.customerId)}`, stage: JOB_STAGE[j.status] ?? 'UNSCHEDULED',
    assignedUserId: j.crewLeadId || j.estimatorId, customerId: j.customerId, leadId: j.leadId, estimateId: j.estimateId, jobId: j.id, workOrderId: wo?.id,
    invoiceIds: db.invoices.filter((i) => i.jobId === j.id).map((i) => i.id), createdAt: j.contractSignedAt,
    dates: { startDate: j.scheduleStart, endDate: j.scheduleEnd, completedAt: j.closedAt ?? wo?.completedAt },
    fields: { startDate: j.scheduleStart ?? '', crewLeadId: j.crewLeadId ?? '' },
  };
}

function workOrderView(db: FDb, w: WorkOrder): RecordView {
  const job = db.jobs.find((j) => j.id === w.jobId);
  return {
    type: 'WORK_ORDER', id: w.id, label: `Work order ${w.id}, ${customerName(db, job?.customerId)}`, stage: w.status,
    assignedUserId: job?.crewLeadId, customerId: job?.customerId, leadId: job?.leadId, estimateId: job?.estimateId, jobId: w.jobId, workOrderId: w.id,
    invoiceIds: db.invoices.filter((i) => i.jobId === w.jobId).map((i) => i.id), createdAt: w.createdAt,
    dates: { startDate: w.startDate, endDate: w.endDate }, fields: { startDate: w.startDate ?? '' },
  };
}

function invoiceView(db: FDb, i: Invoice, now: Date): RecordView {
  const job = db.jobs.find((j) => j.id === i.jobId);
  return {
    type: 'INVOICE', id: i.id, label: `Invoice ${i.id}, ${customerName(db, job?.customerId)}`, stage: invoiceStage(i, now),
    assignedUserId: undefined, customerId: job?.customerId, leadId: job?.leadId ?? i.leadId, estimateId: job?.estimateId ?? i.estimateId, jobId: i.jobId,
    workOrderId: db.workOrders.find((w) => w.jobId === i.jobId)?.id, invoiceIds: [i.id], createdAt: i.createdAt,
    dates: { dueDate: invoiceDueDate(i), sentAt: i.sentAt }, fields: { amount: String(i.amount) }, paid: invoicePaidAmount(i),
  };
}

/** Every record of every pipeline. Estimates behind an unaccepted job are estimates only (the job is hidden). */
export function allRecords(db: FDb, now: Date): RecordView[] {
  return [
    ...db.leads.map((l) => leadView(db, l)),
    ...db.estimates.map((e) => estimateView(db, e)),
    ...db.jobs.filter((j) => j.status !== 'estimating').map((j) => jobView(db, j)),
    ...db.workOrders.map((w) => workOrderView(db, w)),
    ...db.invoices.map((i) => invoiceView(db, i, now)),
  ];
}

export function recordOf(db: FDb, type: PipelineModule, id: string, now: Date): RecordView | undefined {
  switch (type) {
    case 'LEAD': { const l = db.leads.find((x) => x.id === id); return l && leadView(db, l); }
    case 'ESTIMATE': { const e = db.estimates.find((x) => x.id === id); return e && estimateView(db, e); }
    case 'JOB': { const j = db.jobs.find((x) => x.id === id && x.status !== 'estimating'); return j && jobView(db, j); }
    case 'WORK_ORDER': { const w = db.workOrders.find((x) => x.id === id); return w && workOrderView(db, w); }
    case 'INVOICE': { const i = db.invoices.find((x) => x.id === id); return i && invoiceView(db, i, now); }
  }
}

export const recordKey = (type: PipelineModule, id: string) => `${type}:${id}`;

/** Detail-page link for a record. */
export function recordHref(type: string, id: string): string {
  switch (type) {
    case 'LEAD': return `/leads/${id}`;
    case 'ESTIMATE': return `/estimates/${id}`;
    case 'JOB': return `/jobs/${id}`;
    case 'WORK_ORDER': return `/work-orders/${id}`;
    case 'INVOICE': return `/invoices/${id}`;
    default: return '/automations';
  }
}

export const recordStageLabel = (r: RecordView) => stageLabel(r.type, r.stage);

/** Does the customer have a completed job? (Returning Customer journey.) */
export function isReturningCustomer(db: FDb, customerId?: string): boolean {
  return !!customerId && db.jobs.some((j) => j.customerId === customerId && j.status === 'completed');
}

/** Every colour specification on the job's card approved (feature 3), with at least one. */
export function coloursApproved(db: FDb, jobId?: string): boolean {
  const specs = db.specs.filter((s) => s.jobId === jobId && s.state !== 'superseded');
  return specs.length > 0 && specs.every((s) => s.state === 'approved');
}
