/*
  Bridge mapping: prototype records (features/) <-> replica records (lib/types).

  The feature prototype keeps the demo story in its own store (Zustand,
  features/lib/store). The replica screens read the replica store. The
  bridge (lib/bridge/sync.ts) links the two by record id: a lead, estimate,
  job, work order or invoice has the SAME id in both stores.

  This file holds the pure conversions:
    project*   prototype record -> full replica record (used when a record
               first appears on the replica side)
    *Status    status maps in both directions
*/
import type * as P from '@/features/types';
import type {
  Customer, Estimate, EstimateArea, EstimateLineItem, EstimateStatus, Invoice, InvoiceStatus, Job, JobStatus, Lead, LeadStatus,
  Payment, TeamMember, TeamRole, WorkOrder,
} from '@/lib/types';
import { estimateTotals as protoTotals, surfaceHours, BASE_LABOR_RATE } from '@/features/lib/rules/estimate';
import { changeOrderHours } from '@/features/lib/rules/change-order-effects';
import { draftTotal } from '@/features/lib/store/actions/estimates';
import { round2, versionSnapshot } from '@/lib/calculations';

/* ---------- small helpers ---------- */

export const dayOf = (iso?: string) => {
  if (!iso) return undefined;
  // A calendar date is not a UTC timestamp: parsing it shifts the day west of UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : localDay(date);
};
function localDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const timeOf = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const COMPANY_WORDS = /\b(group|llc|inc|ltd|company|co\.|properties|property|management|hoa|drywall|church|school)\b/i;

/** "Korah Singer" -> first "Korah", last "Singer". Companies keep the whole name as the first name. */
export function splitName(name: string): { firstName: string; lastName: string; companyName?: string } {
  const n = (name ?? '').trim();
  if (COMPANY_WORDS.test(n)) return { firstName: n, lastName: '', companyName: n };
  const i = n.indexOf(' ');
  return i < 0 ? { firstName: n, lastName: '' } : { firstName: n.slice(0, i), lastName: n.slice(i + 1) };
}
export const joinName = (first?: string, last?: string) => [first, last].filter((x) => x && x.trim()).join(' ').trim();

/** Properties made from a replica contact's extra service locations (PROP-sl_…). */
export const isServiceLocationProperty = (p: Pick<P.Property, 'id'>) => p.id.startsWith('PROP-sl_');

/**
 * The property a customer currently owns (their primary service location).
 * Extra service locations come last; with `primaryOnly` they are left out.
 */
export function currentProperty(db: P.Database, customerId: string, opts: { primaryOnly?: boolean } = {}): P.Property | undefined {
  const owned = db.properties
    .filter((p) => !p.mergedInto && p.ownership.some((o) => o.customerId === customerId) && !(opts.primaryOnly && isServiceLocationProperty(p)))
    .sort((a, b) => Number(isServiceLocationProperty(a)) - Number(isServiceLocationProperty(b)));
  return owned.find((p) => p.ownership.some((o) => o.customerId === customerId && !o.end)) ?? owned[0];
}

export const addressLine = (p?: P.Property) => (p ? `${p.address}, ${p.city}, ${p.state} ${p.zip}` : '');

/* ---------- status maps ---------- */

export const LEAD_STATUS_R: Record<P.PipelineStage, LeadStatus> = {
  new_lead: 'New', contacted: 'Contacted', estimate_scheduled: 'Scheduled', pending: 'Pending', sold: 'Sold', lost: 'Lost', archived: 'Archived',
};
export const LEAD_STAGE_P: Record<LeadStatus, P.PipelineStage> = {
  New: 'new_lead', Contacted: 'contacted', Scheduled: 'estimate_scheduled', Pending: 'pending', Sold: 'sold', Lost: 'lost', Archived: 'archived',
};

export const EST_STATUS_R: Record<P.EstimateStatus, EstimateStatus> = {
  DRAFT: 'Draft', AMENDED_DRAFT: 'Draft', SENT: 'Sent', PENDING_REAPPROVAL: 'Sent', VIEWED: 'Viewed', ACCEPTED: 'Approved', DECLINED: 'Rejected', EXPIRED: 'Expired',
};

export const JOB_STATUS_R: Record<Exclude<P.JobStatus, 'estimating'>, JobStatus> = {
  unscheduled: 'Unscheduled', confirmed: 'Confirmed', scheduled: 'Scheduled', in_production: 'In Production', touch_up: 'Touch Up',
  ready_for_inspection: 'Ready for Inspection', completed: 'Completed',
};
export const JOB_STATUS_P: Partial<Record<JobStatus, P.JobStatus | 'marketing'>> = {
  Unscheduled: 'unscheduled', Confirmed: 'confirmed', Scheduled: 'scheduled', 'In Production': 'in_production', 'Touch Up': 'touch_up',
  'Ready for Inspection': 'ready_for_inspection', Completed: 'completed',
};

export const WO_STATUS_R: Record<P.WorkOrderStatus, WorkOrder['status']> = {
  PENDING_DEPOSIT: 'Open', UNSCHEDULED: 'Open', SCHEDULED: 'Open', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed',
};

export const INV_STATUS_R: Record<P.InvoiceStatus, InvoiceStatus> = { draft: 'Draft', sent: 'Sent', partial: 'Partial', paid: 'Paid', void: 'Void' };

const PAY_METHOD_R: Record<NonNullable<P.Invoice['payments']>[number]['method'], Payment['method']> = {
  check: 'Check', cash: 'Cash', bank_transfer: 'ACH', credit_card: 'Credit Card', other: 'Other',
};
export const PAY_METHOD_P: Record<Payment['method'], NonNullable<P.Invoice['payments']>[number]['method']> = {
  Check: 'check', Cash: 'cash', ACH: 'bank_transfer', 'Credit Card': 'credit_card', Other: 'other',
};

export const SOURCE_R: Record<P.LeadSource, string> = {
  website: 'Website', existing_customer: 'Existing Customer', referral: 'Referral', repaint_alert: 'Repaint Alert',
};

const SERVICE_TYPE: Record<P.Job['jobType'], string> = {
  interior_repaint: 'Interior', exterior_repaint: 'Exterior', mixed: 'Interior', new_construction: 'Other',
};

/* Surface types: replica line items use display names ("Walls", "Siding"...). */
const SURFACE_R: Record<P.SurfaceType, string> = {
  walls: 'Walls', ceiling: 'Ceiling', trim: 'Trim', door: 'Doors', body: 'Body', siding: 'Siding', cabinets: 'Cabinets',
};
export function surfaceTypeP(name: string): P.SurfaceType | undefined {
  const n = (name ?? '').toLowerCase();
  if (n.includes('cabinet')) return 'cabinets';
  if (n.includes('ceiling')) return 'ceiling';
  if (n.includes('door')) return 'door';
  if (n.includes('siding')) return 'siding';
  if (n.includes('trim') || n.includes('baseboard') || n.includes('crown') || n.includes('fascia') || n.includes('soffit') || n.includes('window')) return 'trim';
  if (n.includes('body') || n.includes('stucco') || n.includes('brick')) return 'body';
  if (n.includes('wall')) return 'walls';
  return undefined;
}

/* ---------- team ---------- */

const ROLE_R: Record<P.Role, { role: TeamRole; roleId: string }> = {
  owner: { role: 'Owner', roleId: 'role_owner' },
  office_manager: { role: 'Office', roleId: 'role_manager' },
  senior_estimator: { role: 'Estimator', roleId: 'role_estimator' },
  estimator: { role: 'Estimator', roleId: 'role_estimator' },
  crew_lead: { role: 'Crew Lead', roleId: 'role_crewlead' },
  bookkeeper: { role: 'Office', roleId: 'role_admin' },
};
const COLORS = ['#2563EB', '#7A5FFF', '#F97316', '#22C55E', '#06B6D4', '#EC4899', '#EAB308', '#EF4444', '#14B8A6'];

/** Prototype login users become team members. */
export function projectUser(u: P.User, i: number): TeamMember {
  const n = splitName(u.name);
  const r = ROLE_R[u.role];
  return {
    id: u.id, firstName: n.firstName, lastName: n.lastName, email: u.email, phone: '', role: r.role, roleId: r.roleId, status: 'Active',
    hourlyRate: u.role === 'crew_lead' ? 32 : 0, capacityHours: 40, color: COLORS[i % COLORS.length], isCrew: u.role === 'crew_lead',
  };
}

/** Hourly crew employees without a login become painters on the team. */
export function projectEmployee(e: P.Employee, i: number): TeamMember {
  const n = splitName(e.name);
  return {
    id: e.id, firstName: n.firstName, lastName: n.lastName, email: e.email ?? '', phone: e.phone ?? '', role: 'Painter', roleId: 'role_painter',
    status: e.offboardedAt ? 'Inactive' : 'Active', hourlyRate: 26, capacityHours: 40, color: COLORS[(i + 4) % COLORS.length], isCrew: true,
  };
}

/** Employee id -> team member id (an employee with a login is that user). */
export function memberIdFor(db: P.Database, employeeId: string) {
  return db.employees?.find((e) => e.id === employeeId)?.userId ?? employeeId;
}

/* ---------- customers ---------- */

export function customerName(db: P.Database, id?: string) {
  return db.customers.find((c) => c.id === id)?.name ?? '';
}

export function projectCustomer(db: P.Database, c: P.Customer): Customer {
  const n = splitName(c.name);
  const prop = currentProperty(db, c.id);
  const leads = db.leads.filter((l) => l.customerId === c.id);
  const signed = db.jobs.some((j) => j.customerId === c.id && j.contractSigned);
  const firstLead = [...leads].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  return {
    id: c.id, firstName: n.firstName, lastName: n.lastName, companyName: n.companyName, email: c.email ?? '', phone: c.phone ?? '',
    street: prop?.address ?? '', city: prop?.city ?? '', state: prop?.state ?? '', zip: prop?.zip ?? '',
    type: signed ? 'Client' : leads.some((l) => l.estimateId) ? 'Contact' : 'Lead',
    source: firstLead ? SOURCE_R[firstLead.source] : 'Existing Customer',
    createdAt: firstLead?.createdAt ?? prop?.ownership[0]?.start ?? db.seededAt,
  };
}

/* ---------- leads ---------- */

export function leadContact(db: P.Database, l: P.Lead) {
  const c = db.customers.find((x) => x.id === l.customerId);
  const n = splitName(l.name ?? c?.name ?? '');
  return { firstName: n.firstName, lastName: n.lastName, phone: l.phone ?? c?.phone ?? '', email: l.email ?? c?.email ?? '' };
}

export function leadAppointment(l: P.Lead): Lead['appointment'] {
  return l.scheduledAt ? { date: dayOf(l.scheduledAt)!, time: timeOf(l.scheduledAt), estimatorId: l.assignedUserId } : null;
}

export function projectLead(db: P.Database, l: P.Lead): Lead {
  const prop = db.properties.find((p) => p.id === l.propertyId) ?? currentProperty(db, l.customerId);
  const est = db.estimates.find((e) => e.id === l.estimateId);
  const job = est?.jobId ? db.jobs.find((j) => j.id === est.jobId) : undefined;
  const status = LEAD_STATUS_R[l.stage];
  const n = splitName(l.name ?? customerName(db, l.customerId));
  const notes = [l.note, ...(l.notes ?? []).map((x) => x.text), l.message].filter(Boolean).join('\n\n');
  return {
    id: l.id, leadNumber: l.id, ...leadContact(db, l), companyName: n.companyName,
    street: prop?.address ?? l.address ?? '', city: prop?.city ?? l.town ?? '', state: prop?.state ?? '', zip: prop?.zip ?? '',
    // D5: "What would you like painted?" from the website form, until a job says otherwise.
    leadSource: l.sourceLabel ?? SOURCE_R[l.source], serviceType: job ? SERVICE_TYPE[job.jobType] : l.paintType ?? 'Interior', status,
    estimatedValue: est?.total ?? 0, date: l.createdAt, createdAt: l.createdAt, updatedAt: l.lastActivityAt ?? l.createdAt,
    notes: notes || undefined, customerId: l.customerId, estimateId: l.estimateId,
    contactType: status === 'Sold' ? 'CLIENT' : l.estimateId || status === 'Scheduled' || status === 'Pending' ? 'CONTACT' : 'LEAD',
    assignedTo: l.assignedUserId, appointment: leadAppointment(l), appointmentDuration: l.durationMin,
    ...(l.trackedLinkId ? { trackedLinkId: l.trackedLinkId } : {}),
    ...(l.possibleDuplicateOf ? { possibleDuplicateOf: l.possibleDuplicateOf } : {}),
  };
}

/* ---------- estimates ---------- */

/** The prototype's internal project record behind an estimate. */
export function scopeJob(db: P.Database, est: P.Estimate) {
  return est.jobId ? db.jobs.find((j) => j.id === est.jobId) : undefined;
}

function coatsFor(db: P.Database, jobId: string, surfaceId: string) {
  return db.specs.find((s) => s.jobId === jobId && s.state !== 'superseded' && s.surfaceIds.includes(surfaceId))?.coats ?? 2;
}

export function estimateTotal(db: P.Database, est: P.Estimate) {
  const job = scopeJob(db, est);
  if (est.total > 0 || !job) return est.total;
  return draftTotal(db, est, job);
}

/**
 * Replica areas and line items for an estimate: one area per room/elevation,
 * one line per surface. Line totals are spread over hours so the replica's
 * own estimateTotals() gives the prototype's total.
 */
export function projectScope(db: P.Database, est: P.Estimate): { areas: EstimateArea[]; lineItems: EstimateLineItem[]; taxRate: number } {
  const job = scopeJob(db, est);
  if (!job) return { areas: [], lineItems: [], taxRate: 0 };
  const surfaces = job.surfaceIds.map((id) => db.surfaces.find((s) => s.id === id)).filter((s): s is P.Surface => !!s && !s.removedAt);
  const areaIds = [...new Set(est.pricingSnapshot ? est.pricingSnapshot.lineItems.map((l) => l.areaId) : surfaces.map((s) => s.areaId))];
  const areas: EstimateArea[] = areaIds.map((id) => {
    const a = db.areas.find((x) => x.id === id);
    return { id, name: a?.name ?? 'Area' };
  });
  if (est.pricingSnapshot) return { areas, lineItems: structuredClone(est.pricingSnapshot.lineItems), taxRate: est.pricingSnapshot.taxRate };
  const total = estimateTotal(db, est);
  const preTax = total / (1 + job.taxRatePct / 100);
  const hours = surfaces.map((s) => surfaceHours(s, coatsFor(db, job.id, s.id)));
  const sumHours = hours.reduce((a, b) => a + b, 0) || 1;
  let running = 0;
  const lineItems: EstimateLineItem[] = surfaces.map((s, i) => {
    const last = i === surfaces.length - 1;
    const lineTotal = last ? round2(preTax - running) : round2((preTax * hours[i]!) / sumHours);
    running = round2(running + lineTotal);
    // QA D-05: the replica re-prices an edited line as hours × rate + quantity × unit price
    // (profit margin 0 here). With unit price 0 an edit dropped a line to labour only, so the
    // unit price (or, when labour alone is more, the rate) is set to reproduce this line's total.
    const labor = hours[i]! * BASE_LABOR_RATE;
    const qty = s.areaSqft || 0;
    const laborRate = labor > lineTotal && hours[i]! > 0 ? lineTotal / hours[i]! : BASE_LABOR_RATE;
    const unitPrice = labor < lineTotal && qty > 0 ? (lineTotal - labor) / qty : 0;
    return {
      id: s.id, areaId: s.areaId, description: s.name, surfaceType: SURFACE_R[s.type], quantity: s.areaSqft, unit: 'sqft', unitPrice,
      laborHours: hours[i]!, laborRate, coats: coatsFor(db, job.id, s.id), difficultyMultiplier: 1, total: lineTotal, quantityManual: true,
    };
  });
  return { areas, lineItems, taxRate: job.taxRatePct };
}

const TYPE_R: Record<P.Job['jobType'], string> = { interior_repaint: 'Interior', exterior_repaint: 'Exterior', mixed: 'Interior', new_construction: 'Interior' };

export function projectEstimate(db: P.Database, est: P.Estimate): Estimate {
  const job = scopeJob(db, est);
  const prop = db.properties.find((p) => p.id === est.propertyId);
  const scope = projectScope(db, est);
  const status = EST_STATUS_R[est.status];
  const total = estimateTotal(db, est);
  const r: Estimate = {
    id: est.id, estimateNumber: est.id, title: est.title, customerId: est.customerId, leadId: est.leadId,
    estimateType: job ? TYPE_R[job.jobType] : 'Interior', status, date: est.estimateDate ?? est.createdAt,
    validUntil: est.validUntil ?? est.createdAt, address: addressLine(prop), areas: scope.areas, lineItems: scope.lineItems,
    // No surface lines (e.g. priced from history): carry the signed amount as one line.
    extras: est.pricingSnapshot?.extras ?? (scope.lineItems.length || !(total > 0) ? [] : [{ id: est.id + '-basis', name: est.repeatEstimateId ? 'Priced from history' : 'Contract amount', quantity: 1, unitPrice: round2(total / (1 + scope.taxRate / 100)) }]),
    discountType: est.pricingSnapshot?.discountType ?? 'none', discountValue: est.pricingSnapshot?.discountValue ?? 0, taxRate: scope.taxRate, profitMargin: 0, notes: est.customerNotes, internalNotes: est.internalNotes,
    createdBy: est.estimatorId ?? 'U-EST', createdAt: est.createdAt, updatedAt: est.lastAmendedAt ?? est.sentAt ?? est.createdAt,
    sentAt: est.sentAt, viewedAt: est.viewedAt, approvedAt: est.acceptedAt,
    signature: est.status === 'ACCEPTED' && est.signatureName ? { name: est.signatureName, date: est.acceptedAt ?? est.createdAt } : null,
    versions: [],
    jobId: job && job.status !== 'estimating' ? job.id : undefined, estimatorId: est.estimatorId,
  };
  // An accepted estimate's version is dated on acceptance, so reports book the sale then (RP-M1).
  const date = status === 'Approved' ? est.acceptedAt ?? est.createdAt : est.createdAt;
  r.versions = [{ version: 1, date, total, status, changedBy: 'Estimate Master', note: 'Imported from the feature prototype', ...versionSnapshot(r) }];
  return r;
}

/* ---------- jobs ---------- */

export function jobCrew(db: P.Database, jobId: string): Job['crew'] {
  const saved = db.jobs.find((j) => j.id === jobId)?.crewAssignments;
  if (saved) return structuredClone(saved);
  const wo = db.workOrders.find((w) => w.jobId === jobId);
  // Scheduled hours per member: weekdays in each shift x the shift's daily hours.
  const hours = new Map<string, number>();
  for (const sh of wo?.shifts ?? []) {
    const [h1, m1] = sh.startTime.split(':').map(Number);
    const [h2, m2] = sh.endTime.split(':').map(Number);
    const daily = Math.max(0, (h2! * 60 + m2!) - (h1! * 60 + m1!)) / 60;
    let days = 0;
    for (let d = new Date(sh.startDate + 'T12:00:00'); d <= new Date(sh.endDate + 'T12:00:00'); d.setDate(d.getDate() + 1)) if (d.getDay() % 6 !== 0) days++;
    for (const m of sh.memberIds) {
      const id = memberIdFor(db, m);
      hours.set(id, (hours.get(id) ?? 0) + days * daily);
    }
  }
  return [...hours.keys()].map((memberId, i) => ({ memberId, role: i === 0 ? 'Crew Lead' : 'Painter', hours: round2(hours.get(memberId)!) }));
}

export function jobSchedule(db: P.Database, job: P.Job) {
  const wo = db.workOrders.find((w) => w.jobId === job.id);
  const shift = wo?.shifts[0];
  return { startDate: dayOf(wo?.startDate ?? job.scheduleStart), endDate: dayOf(wo?.endDate ?? job.scheduleEnd), startTime: shift?.startTime, endTime: shift?.endTime };
}

export function projectJob(db: P.Database, job: P.Job): Job {
  const prop = db.properties.find((p) => p.id === job.propertyId);
  const est = db.estimates.find((e) => e.id === job.estimateId);
  const sched = jobSchedule(db, job);
  const wo = db.workOrders.find((w) => w.jobId === job.id);
  const shift = wo?.shifts[0];
  // Approved change orders (scheduler step done) raise or lower the required hours (patent 15, 24).
  const hours = round2((job.surfaceIds.length ? protoTotals(db, job).totalHours : 0) + changeOrderHours(db, job.id));
  return {
    id: job.id, jobNumber: job.id, title: job.name, customerId: job.customerId, estimateId: job.estimateId, leadId: job.leadId ?? est?.leadId,
    address: addressLine(prop), status: JOB_STATUS_R[job.status as Exclude<P.JobStatus, 'estimating'>] ?? 'Unscheduled',
    ...sched, startTime: shift?.startTime, endTime: shift?.endTime, estimatedHours: hours, value: job.contractValue || est?.total || 0,
    scheduleProtected: job.scheduleProtected,
    crew: jobCrew(db, job.id), breaks: [], notes: [], history: [{ date: job.contractSignedAt ?? db.seededAt, text: `Job created from ${job.estimateId ?? 'the feature prototype'}` }],
    createdAt: job.contractSignedAt ?? db.seededAt, completedAt: job.closedAt,
  };
}

/* ---------- work orders ---------- */

export function projectWorkOrder(db: P.Database, wo: P.WorkOrder): WorkOrder {
  const job = db.jobs.find((j) => j.id === wo.jobId);
  const members = [...new Set(wo.shifts.flatMap((s) => s.memberIds).map((m) => memberIdFor(db, m)))];
  return {
    id: wo.id, workOrderNumber: wo.id, jobId: wo.jobId, title: job?.name ?? wo.id, status: WO_STATUS_R[wo.status], assignedTo: members,
    dueDate: dayOf(wo.endDate ?? job?.scheduleEnd) ?? '', instructions: [wo.accessNotes, wo.existingConditions].filter(Boolean).join('\n') ,
    tasks: [], createdAt: wo.createdAt,
  };
}

/* ---------- invoices ---------- */

/** Id suffix of the stand-in payment for an invoice marked paid without payment rows (seed data). */
export const SETTLED_SUFFIX = '-settled';

export function projectPayments(inv: P.Invoice): Payment[] {
  const rows = (inv.payments ?? []).map((p) => ({ id: p.id, date: dayOf(p.at)!, amount: p.amount, method: PAY_METHOD_R[p.method], reference: p.reference, note: p.notes }));
  // Paid by status alone: show one settled payment so the replica doesn't show a balance due.
  if (inv.status === 'paid' && !rows.length) rows.push({ id: inv.id + SETTLED_SUFFIX, date: dayOf(inv.sentAt ?? inv.createdAt)!, amount: inv.amount, method: 'Check', reference: 'Settled', note: undefined });
  return rows;
}

const AUTOMATION_INVOICE_TYPE = { deposit: 'Deposit', progress: 'Progress', final: 'Final' } as const;

const INV_KIND: Record<P.Invoice['kind'], string> = { standard: 'Deposit', supplemental: 'Change order (supplemental)', credit_note: 'Credit note' };

export function projectInvoice(db: P.Database, inv: P.Invoice): Invoice {
  const job = db.jobs.find((j) => j.id === inv.jobId);
  const est = db.estimates.find((e) => e.id === job?.estimateId);
  const created = dayOf(inv.createdAt)!;
  const due = new Date(inv.createdAt);
  due.setDate(due.getDate() + 15);
  return {
    id: inv.id, invoiceNumber: inv.id, customerId: job?.customerId ?? '', jobId: inv.jobId, estimateId: job?.estimateId, leadId: est?.leadId,
    date: created, dueDate: localDay(due), status: INV_STATUS_R[inv.status],
    ...projectInvoiceLines(inv, job?.name),
    payments: projectPayments(inv), sentAt: inv.sentAt, history: [{ date: inv.createdAt, text: 'Invoice created' }],
    // A scope invoice is the contract invoice: its first Send asks for the deposit percent.
    invoiceType: inv.automationType ? AUTOMATION_INVOICE_TYPE[inv.automationType] : inv.lines ? 'Final' : inv.kind === 'standard' ? 'Deposit' : 'Progress',
  };
}

/** The replica's line, tax and discount fields for a prototype invoice (scope lines when it has them). */
export function projectInvoiceLines(inv: P.Invoice, jobName?: string): Pick<Invoice, 'lineItems' | 'taxRate' | 'discount'> {
  if (inv.lines) return { lineItems: inv.lines.map((l) => ({ id: l.id, description: l.description, quantity: l.quantity, rate: l.rate })), taxRate: inv.taxRatePct ?? 0, discount: inv.discount ?? 0 };
  return { lineItems: [{ id: `${inv.id}-L1`, description: `${INV_KIND[inv.kind]} · ${jobName ?? inv.jobId}`, quantity: 1, rate: inv.amount }], taxRate: 0, discount: 0 };
}
