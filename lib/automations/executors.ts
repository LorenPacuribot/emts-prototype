/*
  What each step does (spec section 8). Every executor checks its
  prerequisites first and answers in plain words ("Skipped: this job
  already has a deposit invoice (INV-2026-3)"). Steps that change a record
  call the features engine's own action (features/lib/store/actions), as
  the person who deployed the automation, so the app's rules and
  permissions still apply. Customer messages go through one send path with
  the protections from spec section 3: consent and opt-outs, the contact
  window, the texting release, once-only and sending capacity.
*/
import type { Database as FDb, User } from '@/features/types';
import { setLeadStage, addLeadNote, scheduleLeadEstimate, createLead } from '@/features/lib/store/actions/leads';
import { createEstimateFromLead, sendEstimate, updateEstimateDetails } from '@/features/lib/store/actions/estimates';
import { setJobStage } from '@/features/lib/store/actions/jobs';
import { addFieldNote, scheduleWorkOrder, setWorkOrderStatus, workOrderForJob } from '@/features/lib/store/actions/work-orders';
import { sendInvoice } from '@/features/lib/store/actions/invoices';
import { notify } from '@/features/lib/store/actions/notifications';
import { log, nextId as featureNextId } from '@/features/lib/store/helpers';
import { can } from '@/features/lib/permissions';
import type { Automation, AutomationCondition, AutomationRun, AutomationStep, CustomerMessage, PipelineModule, SentMessage } from './types';
import type { EngineState } from './state';
import { nextId } from './state';
import type { RecordView } from './records';
import {
  JOB_STAGE_TO_FEATURE, LEAD_STAGE_TO_FEATURE, coloursApproved, depositPaid, invoiceBalanceDue, invoiceDueDate, invoiceKind, invoicePaidAmount,
  isReturningCustomer, jobBalance, recordHref, recordKey, recordOf,
} from './records';
import { WAIT_CONDITIONS, stageLabel, stepDef } from './registry';
import { fillVariables, optOutLine } from './messages';
import { conditionPhrase } from './summary';

export interface EngineEnv {
  now: Date;
  /** The message library, current versions. */
  messages: CustomerMessage[];
  orgName: string;
  reviewLink?: string;
  estimateTemplates: { id: string; name: string; estimateType?: string }[];
  /** Test run: work on copies, never wait for the contact window or the send queue. */
  dryRun?: boolean;
}

export interface ExecCtx {
  s: EngineState;
  db: FDb;
  env: EngineEnv;
  run: AutomationRun;
  step: AutomationStep;
  automation: Automation;
  actor: User;
  record: RecordView;
}

export type ExecStatus = 'DONE' | 'SKIPPED' | 'FAILED' | 'WAIT' | 'STOP';

export interface ExecResult {
  status: ExecStatus;
  message: string;
  waitUntil?: string;
  createdRecordId?: string;
  /** The step moved the record that started the run out of its trigger stage on purpose. */
  movedTriggerRecord?: boolean;
}

const done = (message: string, extra: Partial<ExecResult> = {}): ExecResult => ({ status: 'DONE', message, ...extra });
const skip = (message: string): ExecResult => ({ status: 'SKIPPED', message: `Skipped: ${message}` });
const failed = (message: string): ExecResult => ({ status: 'FAILED', message: `Failed: ${message}` });
const wait = (message: string, waitUntil?: string): ExecResult => ({ status: 'WAIT', message, waitUntil });

const DAY = 86_400_000;
const HOUR = 3_600_000;

export function fmtDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
export function fmtTime(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ---------- People ---------- */

export const usersInRole = (db: FDb, role: string): User[] =>
  db.users.filter((u) => (role === 'estimators' ? u.role === 'estimator' || u.role === 'senior_estimator' : u.role === role));

export const ownerIds = (db: FDb) => usersInRole(db, 'owner').map((u) => u.id);
export const officeIds = (db: FDb) => usersInRole(db, 'office_manager').map((u) => u.id);

/** The record's assigned person; invoices go to the office manager. */
export function assignedIds(db: FDb, r: RecordView): string[] {
  if (r.assignedUserId && db.users.some((u) => u.id === r.assignedUserId)) return [r.assignedUserId];
  return r.type === 'INVOICE' ? officeIds(db) : [];
}

export function recipients(db: FDb, r: RecordView, c: Record<string, unknown>, prefix: string): string[] {
  const to = c[`${prefix}To`];
  if (to === 'USER') return [String(c[`${prefix}UserId`] ?? '')].filter(Boolean);
  if (to === 'ROLE') return usersInRole(db, String(c[`${prefix}Role`] ?? '')).map((u) => u.id);
  if (to === 'CREW_LEAD' || to === 'ESTIMATOR') {
    const job = db.jobs.find((j) => j.id === r.jobId);
    const est = db.estimates.find((e) => e.id === r.estimateId);
    const lead = db.leads.find((l) => l.id === r.leadId);
    const id = to === 'CREW_LEAD' ? job?.crewLeadId : est?.estimatorId ?? job?.estimatorId ?? lead?.assignedUserId;
    if (id && db.users.some((u) => u.id === id)) return [id];
  }
  const a = assignedIds(db, r);
  return a.length ? a : ownerIds(db);
}

/** Notify staff (the header bell). Unknown users are skipped. */
export function tell(db: FDb, userIds: (string | undefined)[], n: { title: string; body: string; href: string; automationKind?: NonNullable<Parameters<typeof notify>[2]>['automationKind']; reviewItemId?: string }) {
  notify(db, userIds, { kind: 'automation', ...n });
}

/* ---------- Values for conditions and variables ---------- */

const linked = (db: FDb, r: RecordView, now: Date) => ({
  lead: r.leadId ? db.leads.find((l) => l.id === r.leadId) : undefined,
  estimate: r.estimateId ? db.estimates.find((e) => e.id === r.estimateId) : undefined,
  job: r.jobId ? db.jobs.find((j) => j.id === r.jobId && j.status !== 'estimating') : undefined,
  workOrder: r.workOrderId ? db.workOrders.find((w) => w.id === r.workOrderId) : r.jobId ? workOrderForJob(db, r.jobId) : undefined,
  invoice: r.type === 'INVOICE' ? db.invoices.find((i) => i.id === r.id) : undefined,
  customer: db.customers.find((c) => c.id === r.customerId),
  now,
});

/** Field values "Only if" conditions read (keys match registry conditionFields). */
export function conditionValues(s: EngineState, db: FDb, r: RecordView, now: Date): Record<string, string | number | undefined> {
  const l = linked(db, r, now);
  const jobRec = l.job ? recordOf(db, 'JOB', l.job.id, now) : undefined;
  const woRec = l.workOrder ? recordOf(db, 'WORK_ORDER', l.workOrder.id, now) : undefined;
  const invRec = l.invoice ? recordOf(db, 'INVOICE', l.invoice.id, now) : undefined;
  return {
    'lead.source': l.lead?.source,
    'lead.paintType': l.lead?.paintType,
    'lead.assignedUserId': l.lead?.assignedUserId,
    'customer.returning': String(isReturningCustomer(db, r.customerId)),
    'estimate.total': l.estimate?.total,
    'estimate.type': l.estimate?.jobId ? db.jobs.find((j) => j.id === l.estimate!.jobId)?.jobType : undefined,
    'estimate.ready': String(!!(l.estimate && s.readyEstimates[l.estimate.id])),
    'job.contractValue': l.job?.contractValue,
    'job.stage': jobRec?.stage,
    'job.depositPaid': String(depositPaid(db, r.jobId).paid),
    'job.allPaid': String(!!r.jobId && jobBalance(db, r.jobId).owed === 0 && db.invoices.some((i) => i.jobId === r.jobId && i.status !== 'void')),
    'job.coloursApproved': String(coloursApproved(db, r.jobId)),
    'workOrder.stage': woRec?.stage,
    'invoice.amount': l.invoice?.amount,
    'invoice.balance': l.invoice ? invoiceBalanceDue(l.invoice) : undefined,
    'invoice.stage': invRec?.stage,
  };
}

export function conditionHolds(c: AutomationCondition, values: Record<string, string | number | undefined>): boolean {
  const v = values[c.field];
  const empty = v === undefined || v === null || v === '';
  switch (c.operator) {
    case 'IS_EMPTY': return empty;
    case 'IS_NOT_EMPTY': return !empty;
    case 'IS': return !empty && String(v) === String(c.value);
    case 'IS_NOT': return String(v ?? '') !== String(c.value);
    case 'IS_ANY_OF': return Array.isArray(c.value) && c.value.map(String).includes(String(v));
    case 'GT': return !empty && Number(v) > Number(c.value);
    case 'LT': return !empty && Number(v) < Number(c.value);
  }
}

export function failingCondition(conds: AutomationCondition[], values: Record<string, string | number | undefined>): AutomationCondition | undefined {
  return conds.find((c) => !conditionHolds(c, values));
}

/** Values for {{variables}} in customer messages and text fields. */
export function variableValues(db: FDb, r: RecordView, env: Pick<EngineEnv, 'orgName' | 'reviewLink' | 'now'>): Record<string, string> {
  const l = linked(db, r, env.now);
  const name = l.customer?.name ?? l.lead?.name ?? '';
  const userName = (id?: string) => db.users.find((u) => u.id === id)?.name ?? '';
  const inv = l.invoice ?? (r.jobId ? [...db.invoices].reverse().find((i) => i.jobId === r.jobId && i.status !== 'void') : undefined);
  return {
    customerName: name,
    firstName: name.split(' ')[0] ?? name,
    orgName: env.orgName,
    reviewLink: env.reviewLink ?? '',
    projectName: l.job?.name ?? l.estimate?.title ?? (l.lead?.paintType ? `${l.lead.paintType} painting` : 'your project'),
    appointmentDate: fmtDate(l.lead?.scheduledAt),
    appointmentTime: fmtTime(l.lead?.scheduledAt),
    estimatorName: userName(l.estimate?.estimatorId ?? l.lead?.assignedUserId),
    estimateNumber: l.estimate?.id ?? '',
    estimateTotal: l.estimate ? money(l.estimate.total) : '',
    estimateLink: l.estimate?.publicToken ? `/estimates/view/${l.estimate.publicToken}` : '',
    jobNumber: l.job?.id ?? '',
    startDate: fmtDate(l.job?.scheduleStart ?? l.workOrder?.startDate),
    endDate: fmtDate(l.job?.scheduleEnd ?? l.workOrder?.endDate),
    crewLeadName: userName(l.job?.crewLeadId),
    invoiceNumber: inv?.id ?? '',
    invoiceAmount: inv ? money(inv.depositDue && inv.status === 'draft' ? inv.depositDue : inv.amount) : '',
    balanceDue: inv ? money(invoiceBalanceDue(inv)) : '',
    dueDate: inv ? fmtDate(invoiceDueDate(inv)) : '',
  };
}

/* ---------- Customer messages ---------- */

/** 8 a.m. to 7 p.m. inclusive, business local time (feature 29). */
export function inContactWindow(d: Date): boolean {
  const m = d.getHours() * 60 + d.getMinutes();
  return m >= 8 * 60 && m <= 19 * 60;
}

/** The next moment the window opens. */
export function nextWindowOpen(d: Date): string {
  const n = new Date(d);
  if (n.getHours() * 60 + n.getMinutes() > 19 * 60) n.setDate(n.getDate() + 1);
  n.setHours(8, 0, 0, 0);
  return n.toISOString();
}

/** Has the customer opted out of this channel? Reads the module's consent, the property opt-out and marketing opt-outs. */
export function optedOut(s: EngineState, db: FDb, r: RecordView, channel: 'email' | 'sms'): string | undefined {
  const c = s.consent[r.customerId ?? ''];
  if (channel === 'sms' && (c?.doNotText || c?.textStopAt)) return 'customer opted out of texts';
  if (channel === 'email' && c?.doNotEmail) return 'customer opted out of emails';
  const l = linked(db, r, new Date());
  const propertyId = l.job?.propertyId ?? l.estimate?.propertyId ?? l.lead?.propertyId;
  if (propertyId && db.properties.find((p) => p.id === propertyId)?.optOut) return 'the property opted out of contact';
  const customer = l.customer;
  const address = channel === 'email' ? customer?.email?.trim().toLowerCase() : customer?.phone?.replace(/\D/g, '');
  if (address && (db.mktOptOuts ?? []).some((o) => o.channel === channel && o.address.replace(/\D/g, '') === address.replace(/\D/g, ''))) {
    return `customer opted out of ${channel === 'sms' ? 'texts' : 'emails'}`;
  }
  return undefined;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Usage this month, and whether a send now would go over a plan limit. */
export function capacityCheck(s: EngineState, channel: 'email' | 'sms', now: Date): { full: boolean; usedThisMonth: number; limit?: number; which?: string } {
  const limits = s.settings.sending[channel === 'email' ? 'email' : 'sms'];
  const sent = s.sent.filter((m) => m.channel === channel);
  const t = now.getTime();
  const usedThisMonth = sent.filter((m) => m.at.slice(0, 7) === monthKey(now)).length;
  const lastSecond = sent.filter((m) => t - Date.parse(m.at) < 1000).length;
  const today = sent.filter((m) => new Date(m.at).toDateString() === now.toDateString()).length;
  if (limits.perSecond !== undefined && lastSecond >= limits.perSecond) return { full: true, usedThisMonth, limit: limits.perMonth, which: 'per second' };
  if (limits.perDay !== undefined && today >= limits.perDay) return { full: true, usedThisMonth, limit: limits.perMonth, which: 'daily' };
  if (limits.perMonth !== undefined && usedThisMonth >= limits.perMonth) return { full: true, usedThisMonth, limit: limits.perMonth, which: 'monthly' };
  return { full: false, usedThisMonth, limit: limits.perMonth };
}

/** The approved version of a message for this step (deploy approval), else the current one. */
export function approvedMessage(ctx: ExecCtx, messageId: string): { name: string; subject?: string; body: string; version: number } | undefined {
  const approval = ctx.s.approvals.find((a) => a.id === ctx.automation.approvalId);
  const pinned = approval?.customerFacingSteps.find((c) => c.stepId === ctx.step.id && c.messageId === messageId)?.messageVersion;
  const history = ctx.s.messageVersions[messageId] ?? [];
  const v = pinned !== undefined ? history.find((h) => h.version === pinned) : undefined;
  if (v) return { name: v.name, subject: v.subject, body: v.body, version: v.version };
  const current = ctx.env.messages.find((m) => m.id === messageId);
  return current ? { name: current.name, subject: current.subject, body: current.body, version: current.version } : undefined;
}

interface SendInput {
  channel: 'email' | 'sms';
  subject?: string;
  body: string;
  messageId?: string;
  messageVersion?: number;
  /** Runs before the message is recorded (send the estimate / invoice). A failure stops the send. */
  before?: () => ExecResult | undefined;
}

/** The one send path every customer message goes through. */
export function sendToCustomer(ctx: ExecCtx, input: SendInput): ExecResult {
  const { s, db, env, run, record } = ctx;
  if (input.channel === 'sms' && !s.settings.textingReleased) return skip("texting isn't switched on yet");
  const out = optedOut(s, db, record, input.channel);
  if (out) return skip(out);
  const customer = db.customers.find((c) => c.id === record.customerId);
  const to = input.channel === 'email' ? customer?.email : customer?.phone;
  if (!customer || !to) return failed(`the customer has no ${input.channel === 'email' ? 'email address' : 'mobile number'}.`);
  const key = `${customer.id}|${recordKey(record.type, record.id)}|${ctx.automation.id}|${ctx.step.id}|${run.entryNo}`;
  const already = s.sent.find((m) => m.key === key);
  if (already) return skip(`this message already went to ${customer.name} on ${fmtDate(already.at)}.`);
  if (!env.dryRun && !inContactWindow(env.now)) return wait('Waiting for the contact window (8 a.m. to 7 p.m.).', nextWindowOpen(env.now));
  if (!env.dryRun) {
    const cap = capacityCheck(s, input.channel, env.now);
    if (cap.full) return wait(`Waiting in the send queue: the ${cap.which} ${input.channel === 'email' ? 'email' : 'text'} limit of the sending plan is reached.`);
  }
  const pre = input.before?.();
  if (pre && pre.status !== 'DONE') return pre;
  const values = variableValues(db, record, env);
  const body = fillVariables(input.body, values) + (input.channel === 'sms' ? optOutLine(env.orgName) : '');
  const msg: SentMessage = {
    id: nextId(s, 'SM-'), key, channel: input.channel, to, customerId: customer.id, subject: input.subject ? fillVariables(input.subject, values) : undefined, body,
    messageId: input.messageId, messageVersion: input.messageVersion, runId: run.id, recordType: record.type, recordId: record.id, at: env.now.toISOString(),
  };
  s.sent.push(msg);
  log(db, ctx.actor, 'Automations', `${input.channel === 'email' ? 'Email' : 'Text'}${msg.subject ? ` "${msg.subject}"` : ''} sent to ${to} by automation "${ctx.automation.name}" (sandbox: recorded, not delivered)`);
  return done(`${pre?.message ? `${pre.message} ` : ''}${input.channel === 'email' ? 'Email' : 'Text'} sent to ${customer.name} (${to}).`);
}

/* ---------- Dates ---------- */

export function addTime(fromIso: string, amount: number, unit: 'HOURS' | 'DAYS', workingDays?: number[]): string {
  const d = new Date(fromIso);
  if (unit === 'HOURS') return new Date(d.getTime() + amount * HOUR).toISOString();
  if (!workingDays?.length) return new Date(d.getTime() + amount * DAY).toISOString();
  let left = amount;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (workingDays.includes(d.getDay())) left -= 1;
  }
  return d.toISOString();
}

/* ---------- Wait conditions ---------- */

export function waitConditionMet(s: EngineState, db: FDb, r: RecordView, condition: string): boolean | 'NEVER' {
  switch (condition) {
    case 'DEPOSIT_PAID': return depositPaid(db, r.jobId).paid;
    case 'ALL_PAID': return !!r.jobId && db.invoices.some((i) => i.jobId === r.jobId && i.status !== 'void') && jobBalance(db, r.jobId).owed === 0;
    case 'ESTIMATE_SIGNED': return db.estimates.find((e) => e.id === r.estimateId)?.status === 'ACCEPTED';
    case 'ESTIMATE_READY': return !!(r.estimateId && s.readyEstimates[r.estimateId]);
    case 'COLOURS_APPROVED': return coloursApproved(db, r.jobId);
    default: return 'NEVER';
  }
}

/* ---------- Executors ---------- */

type Executor = (ctx: ExecCtx, config: Record<string, unknown>) => ExecResult;

const result = (r: { ok: boolean; error?: string }, okMessage: string): ExecResult => (r.ok ? done(okMessage) : failed(r.error ?? 'the action was refused.'));

function needLead(ctx: ExecCtx) {
  return ctx.record.leadId ? ctx.db.leads.find((l) => l.id === ctx.record.leadId) : undefined;
}
function needJob(ctx: ExecCtx) {
  return ctx.record.jobId ? ctx.db.jobs.find((j) => j.id === ctx.record.jobId && j.status !== 'estimating') : undefined;
}
function needWorkOrder(ctx: ExecCtx) {
  return ctx.record.workOrderId ? ctx.db.workOrders.find((w) => w.id === ctx.record.workOrderId) : workOrderForJob(ctx.db, ctx.record.jobId);
}
function needEstimate(ctx: ExecCtx) {
  return ctx.record.estimateId ? ctx.db.estimates.find((e) => e.id === ctx.record.estimateId) : undefined;
}

const userName = (db: FDb, id?: string) => db.users.find((u) => u.id === id)?.name ?? 'someone';

const EXECUTORS: Record<string, Executor> = {
  MOVE_LEAD_STAGE: (ctx, c) => {
    const lead = needLead(ctx);
    if (!lead) return failed('this record has no lead.');
    const to = LEAD_STAGE_TO_FEATURE[String(c.stage)];
    if (!to) return failed('pick the stage to move the lead to.');
    if (lead.stage === to) return skip(`the lead is already ${stageLabel('LEAD', String(c.stage))}.`);
    const r = setLeadStage(ctx.db, ctx.actor, lead.id, to);
    return r.ok ? done(`Lead ${lead.id} moved to ${stageLabel('LEAD', String(c.stage))}.`, { movedTriggerRecord: ctx.record.type === 'LEAD' }) : failed(r.error);
  },
  ASSIGN_LEAD_OWNER: (ctx, c) => {
    const lead = needLead(ctx);
    if (!lead) return failed('this record has no lead.');
    let userId = String(c.userId ?? '');
    if (c.how !== 'USER') {
      const pool = usersInRole(ctx.db, String(c.role ?? 'estimators')).filter((u) => !u.outOfOffice);
      if (!pool.length) return failed(`nobody available in ${String(c.role ?? 'the role')} to assign.`);
      const k = String(c.role ?? 'estimators');
      const i = (ctx.s.roundRobin[k] ?? 0) % pool.length;
      if (!ctx.env.dryRun) ctx.s.roundRobin[k] = i + 1;
      userId = pool[i]!.id;
    }
    const user = ctx.db.users.find((u) => u.id === userId);
    if (!user) return failed('the person to assign no longer exists.');
    if (lead.assignedUserId === user.id) return skip(`${user.name} already owns this lead.`);
    lead.assignedUserId = user.id;
    log(ctx.db, ctx.actor, 'Leads', `Lead ${lead.id} assigned to ${user.name} by automation "${ctx.automation.name}"`);
    return done(`Lead ${lead.id} assigned to ${user.name}.`);
  },
  SET_LEAD_FIELD: (ctx, c) => {
    const lead = needLead(ctx);
    if (!lead) return failed('this record has no lead.');
    const value = fillVariables(String(c.value ?? ''), variableValues(ctx.db, ctx.record, ctx.env));
    if (c.field === 'note') return result(addLeadNote(ctx.db, ctx.actor, lead.id, value), `Note added to lead ${lead.id}.`);
    const map: Record<string, typeof lead.source> = { website: 'website', 'existing customer': 'existing_customer', referral: 'referral', 'repaint alert': 'repaint_alert' };
    const src = map[value.trim().toLowerCase()];
    if (src) lead.source = src;
    else lead.sourceLabel = value;
    log(ctx.db, ctx.actor, 'Leads', `Lead ${lead.id} source set to ${value} by automation "${ctx.automation.name}"`);
    return done(`Lead source set to ${value}.`);
  },
  CREATE_LEAD: (ctx, c) => {
    const customer = ctx.db.customers.find((x) => x.id === ctx.record.customerId);
    if (!customer) return failed('this record has no customer.');
    const l = linked(ctx.db, ctx.record, ctx.env.now);
    const propertyId = l.job?.propertyId ?? l.estimate?.propertyId ?? l.lead?.propertyId;
    const open = ctx.db.leads.find((x) => x.customerId === customer.id && x.propertyId === propertyId && !['sold', 'lost', 'archived'].includes(x.stage) && x.id !== ctx.record.leadId);
    if (open) return skip(`${customer.name} already has an open lead (${open.id}).`);
    const note = fillVariables(String(c.note ?? ''), variableValues(ctx.db, ctx.record, ctx.env));
    const r = createLead(ctx.db, ctx.actor, { firstName: '', lastName: '', phone: '', email: '', address: '', city: '', state: '', zip: '', source: String(c.source ?? 'Repaint alert'), note, customerId: customer.id, propertyId });
    return r.ok ? done(`Lead ${String(r.value)} created for ${customer.name} (source: ${String(c.source ?? 'Repaint alert')}).`, { createdRecordId: String(r.value) }) : failed(r.error);
  },
  ADD_CONTACT_NOTE: (ctx, c) => {
    const text = fillVariables(String(c.text ?? ''), variableValues(ctx.db, ctx.record, ctx.env));
    const lead = needLead(ctx);
    if (lead) return result(addLeadNote(ctx.db, ctx.actor, lead.id, text), 'Contact note added.');
    log(ctx.db, ctx.actor, 'Contacts', `Note for ${userName(ctx.db, ctx.record.customerId)}: ${text}`);
    return done('Contact note added to the activity log.');
  },
  CREATE_APPOINTMENT: (ctx, c) => {
    const lead = needLead(ctx);
    if (!lead) return failed('this record has no lead.');
    if (lead.scheduledAt) return skip(`this lead already has an appointment on ${fmtDate(lead.scheduledAt)}.`);
    if (!lead.assignedUserId) return failed('no estimator assigned to this lead.');
    const time = /^\d{1,2}:\d{2}$/.test(String(c.time)) ? String(c.time) : '10:00';
    const taken = new Set(ctx.db.leads.filter((l) => l.assignedUserId === lead.assignedUserId && l.scheduledAt).map((l) => l.scheduledAt!.slice(0, 10)));
    const day = new Date(ctx.env.now);
    day.setDate(day.getDate() + Number(c.daysFromNow ?? 1));
    for (let i = 0; i < 60 && (day.getDay() === 0 || day.getDay() === 6 || taken.has(day.toISOString().slice(0, 10))); i++) day.setDate(day.getDate() + 1);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    if (lead.stage === 'new_lead') lead.stage = 'contacted';
    const r = scheduleLeadEstimate(ctx.db, ctx.actor, lead.id, { date, time, durationMin: Number(c.durationMin ?? 60), estimatorId: lead.assignedUserId });
    return r.ok ? done(`Estimate appointment booked for ${fmtDate(`${date}T${time}:00`)} at ${time} with ${userName(ctx.db, lead.assignedUserId)}.`, { createdRecordId: lead.id, movedTriggerRecord: ctx.record.type === 'LEAD' }) : failed(r.error);
  },
  CREATE_ESTIMATE_FROM_TEMPLATE: (ctx, c) => {
    const lead = needLead(ctx);
    if (!lead) return failed('this record has no lead.');
    if (lead.estimateId) return skip(`this lead already has an estimate (${lead.estimateId}).`);
    if (lead.stage !== 'estimate_scheduled') return failed('this lead is not Scheduled yet.');
    const tpl = ctx.env.estimateTemplates.find((t) => t.id === c.estimateTemplateId);
    if (!tpl) return failed('the estimate template no longer exists.');
    const estimator = lead.assignedUserId ?? ctx.db.users.find((u) => u.role === 'estimator')?.id ?? ctx.actor.id;
    const type = String(tpl.estimateType ?? '').toLowerCase();
    const jobType = type.includes('exterior') ? 'exterior_repaint' : type.includes('new') ? 'new_construction' : 'interior_repaint';
    const r = createEstimateFromLead(ctx.db, ctx.actor, { leadId: lead.id, title: tpl.name, estimatorId: estimator, jobType });
    if (!r.ok) return failed(r.error);
    return done(`Draft estimate ${String(r.value)} created from the ${tpl.name} template. The estimator still measures and checks prices.`, { createdRecordId: String(r.value) });
  },
  CREATE_ESTIMATE_FROM_LAST_JOB: () => failed('this needs the duplicate estimate endpoint, which the backend does not have yet.'),
  ASSIGN_ESTIMATOR: (ctx, c) => {
    const est = needEstimate(ctx);
    if (!est) return failed('this record has no estimate yet.');
    const id = c.who === 'USER' ? String(c.userId ?? '') : needLead(ctx)?.assignedUserId;
    if (!id) return failed('no estimator assigned to this lead.');
    if (est.estimatorId === id) return skip(`${userName(ctx.db, id)} is already the estimator.`);
    return result(updateEstimateDetails(ctx.db, ctx.actor, est.id, { estimatorId: id }), `${userName(ctx.db, id)} assigned as estimator on ${est.id}.`);
  },
  SEND_ESTIMATE: (ctx, c) => {
    const est = needEstimate(ctx);
    if (!est) return failed('this record has no estimate yet.');
    if (est.status !== 'DRAFT' && est.status !== 'AMENDED_DRAFT') return skip(`estimate ${est.id} was already sent.`);
    if (!ctx.s.readyEstimates[est.id]) return failed('the estimator has not marked the estimate ready to send.');
    const m = c.messageId ? approvedMessage(ctx, String(c.messageId)) : undefined;
    return sendToCustomer(ctx, {
      channel: 'email', subject: m?.subject ?? `Your estimate for {{projectName}}`, body: typeof c.overrideBody === 'string' ? c.overrideBody : m?.body ?? 'Hi {{customerName}},\n\nYour estimate is ready: {{estimateLink}}', messageId: m ? String(c.messageId) : undefined, messageVersion: m?.version,
      before: () => { const r = sendEstimate(ctx.db, ctx.actor, est.id); return r.ok ? done(`Estimate ${est.id} sent.`) : failed(r.error); },
    });
  },
  MOVE_JOB_STAGE: (ctx, c) => {
    const job = needJob(ctx);
    if (!job) return failed('this record has no job yet.');
    const to = JOB_STAGE_TO_FEATURE[String(c.stage)];
    if (!to) return failed('pick the stage to move the job to.');
    if (job.status === to) return skip(`the job is already ${stageLabel('JOB', String(c.stage))}.`);
    const r = setJobStage(ctx.db, ctx.actor, job.id, to);
    return r.ok ? done(`Job ${job.id} moved to ${stageLabel('JOB', String(c.stage))}.`, { movedTriggerRecord: ctx.record.type === 'JOB' }) : failed(r.error);
  },
  ASSIGN_CREW_LEAD: (ctx, c) => {
    const job = needJob(ctx);
    if (!job) return failed('this record has no job yet.');
    const user = ctx.db.users.find((u) => u.id === c.userId);
    if (!user) return failed('the crew lead no longer exists.');
    if (job.crewLeadId === user.id) return skip(`${user.name} already leads this job.`);
    job.crewLeadId = user.id;
    log(ctx.db, ctx.actor, 'Jobs', `Crew lead on job ${job.id} set to ${user.name} by automation "${ctx.automation.name}"`);
    return done(`${user.name} assigned as crew lead on ${job.id}.`);
  },
  BOOK_SCHEDULE: (ctx, c) => {
    if (!ctx.s.settings.flags['new-job-scheduling']) return failed('this business uses the older job scheduling. Use a "schedule this job" task instead.');
    const wo = needWorkOrder(ctx);
    if (!wo) return failed('this record has no work order yet.');
    if (wo.status === 'SCHEDULED' || wo.status === 'IN_PROGRESS' || wo.status === 'COMPLETED') return skip(`work order ${wo.id} is already scheduled.`);
    if (wo.status !== 'UNSCHEDULED') return failed(`work order ${wo.id} is ${stageLabel('WORK_ORDER', wo.status)}, not Unscheduled. Confirm the deposit first.`);
    const working = ctx.s.settings.workingDays;
    const start = new Date(addTime(ctx.env.now.toISOString(), Math.max(0, Number(c.earliestDays ?? 3)), 'DAYS'));
    while (!working.includes(start.getDay())) start.setDate(start.getDate() + 1);
    const days = Math.max(1, Number(c.durationDays ?? 3));
    const end = days > 1 ? new Date(addTime(start.toISOString(), days - 1, 'DAYS', working)) : new Date(start);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const startDate = String(ctx.run.overrides?.[ctx.step.id]?.startDate ?? iso(start));
    const endDate = String(ctx.run.overrides?.[ctx.step.id]?.endDate ?? iso(end));
    const r = scheduleWorkOrder(ctx.db, ctx.actor, wo.id, { startDate, endDate, startTime: '08:00', endTime: '16:00' });
    return r.ok ? done(`Crew booked ${fmtDate(`${startDate}T08:00:00`)} to ${fmtDate(`${endDate}T08:00:00`)}. Work order ${wo.id} is Scheduled.`, { movedTriggerRecord: ctx.record.type === 'WORK_ORDER' }) : failed(r.error);
  },
  CONFIRM_DEPOSIT: (ctx) => {
    const wo = needWorkOrder(ctx);
    if (!wo) return failed('this record has no work order yet.');
    if (wo.status !== 'PENDING_DEPOSIT') return skip(`work order ${wo.id} is already past Pending Deposit.`);
    if (!depositPaid(ctx.db, wo.jobId).paid) return failed('the deposit invoice is not paid yet.');
    const r = setWorkOrderStatus(ctx.db, ctx.actor, wo.id, 'UNSCHEDULED');
    return r.ok ? done(`Deposit confirmed. Work order ${wo.id} is Unscheduled.`, { movedTriggerRecord: ctx.record.type === 'WORK_ORDER' }) : failed(r.error);
  },
  START_JOB: (ctx) => {
    const wo = needWorkOrder(ctx);
    if (!wo) return failed('this record has no work order yet.');
    if (wo.status === 'IN_PROGRESS' || wo.status === 'COMPLETED') return skip(`work order ${wo.id} has already started.`);
    if (wo.status !== 'SCHEDULED') return failed(`work order ${wo.id} is not Scheduled.`);
    if (!wo.startDate || new Date(wo.startDate).toDateString() !== ctx.env.now.toDateString()) return failed(`the start date is ${fmtDate(wo.startDate)}, not today.`);
    const r = setWorkOrderStatus(ctx.db, ctx.actor, wo.id, 'IN_PROGRESS');
    return r.ok ? done(`Job started. Work order ${wo.id} is In Progress.`, { movedTriggerRecord: ctx.record.type === 'WORK_ORDER' }) : failed(r.error);
  },
  CREATE_INVOICE: (ctx, c) => {
    const job = needJob(ctx);
    if (!job) return failed('this record has no job yet.');
    const type = String(c.invoiceType ?? 'DEPOSIT') as 'DEPOSIT' | 'PROGRESS' | 'FINAL';
    const invs = ctx.db.invoices.filter((i) => i.jobId === job.id && i.status !== 'void');
    // Once-only: the draft the app makes on acceptance is the deposit invoice (it carries the deposit due).
    if (type === 'DEPOSIT') {
      const existing = invs.find((i) => invoiceKind(i) === 'DEPOSIT');
      if (existing) return skip(`this job already has a deposit invoice (${existing.id}).`);
    }
    const owed = job.contractValue - invs.reduce((a, i) => a + invoicePaidAmount(i), 0);
    if (type === 'FINAL') {
      const existing = invs.find((i) => i.automationType === 'final');
      if (existing) return skip(`this job already has a final invoice (${existing.id}).`);
      const contract = invs.find((i) => i.kind === 'standard' && i.lines && invoiceBalanceDue(i) > 0);
      if (contract) return skip(`the contract invoice ${contract.id} already bills the remaining balance (${money(invoiceBalanceDue(contract))}).`);
    }
    let amount = 0;
    if (c.amountKind === 'FIXED') amount = Number(c.amount ?? 0);
    else if (c.amountKind === 'REMAINING') amount = Math.max(0, owed);
    else amount = (job.contractValue * Number(c.percent ?? 0)) / 100;
    amount = Math.round(amount * 100) / 100;
    if (amount <= 0) return skip('there is nothing left to bill on this job.');
    if (!can(ctx.actor, 'invoice.send')) return failed(`${ctx.actor.name} can't create invoices.`);
    const id = featureNextId(ctx.db, 'invoice', `INV-${ctx.env.now.getFullYear()}-`);
    ctx.db.invoices.push({ id, jobId: job.id, estimateId: job.estimateId, leadId: job.leadId, kind: 'standard', status: 'draft', amount, createdAt: ctx.env.now.toISOString(), automationType: type.toLowerCase() as 'deposit' | 'progress' | 'final' });
    log(ctx.db, ctx.actor, 'Invoices', `Invoice ${id} (${type.toLowerCase()}, ${money(amount)}) created for job ${job.id} by automation "${ctx.automation.name}"`);
    return done(`Invoice ${id} created, ${type[0]}${type.slice(1).toLowerCase()}, ${money(amount)}.`, { createdRecordId: id });
  },
  SEND_INVOICE: (ctx, c) => {
    const job = needJob(ctx);
    const pool = ctx.db.invoices.filter((i) => i.jobId === (job?.id ?? ctx.record.jobId) && i.status !== 'void');
    const inv = c.which === 'TRIGGER' && ctx.record.type === 'INVOICE' ? pool.find((i) => i.id === ctx.record.id)
      : c.which === 'DEPOSIT' ? pool.find((i) => invoiceKind(i) === 'DEPOSIT')
      : c.which === 'FINAL' ? pool.find((i) => i.automationType === 'final') ?? pool.find((i) => invoiceKind(i) === 'FINAL') ?? pool.find((i) => i.kind === 'standard' && invoiceBalanceDue(i) > 0)
      : [...pool].reverse()[0];
    if (!inv) return failed('there is no invoice to send yet.');
    if (inv.status !== 'draft' && c.which !== 'FINAL') return skip(`invoice ${inv.id} was already sent.`);
    if (inv.status === 'paid') return skip(`invoice ${inv.id} is already paid.`);
    const m = c.messageId ? approvedMessage(ctx, String(c.messageId)) : undefined;
    return sendToCustomer(ctx, {
      channel: 'email', subject: m?.subject ?? 'Invoice {{invoiceNumber}} from {{orgName}}', body: typeof c.overrideBody === 'string' ? c.overrideBody : m?.body ?? 'Hi {{customerName}},\n\nPlease find invoice {{invoiceNumber}} attached.', messageId: m ? String(c.messageId) : undefined, messageVersion: m?.version,
      before: () => { const r = sendInvoice(ctx.db, ctx.actor, inv.id); return r.ok ? done(`Invoice ${inv.id} sent.`) : failed(r.error); },
    });
  },
  CHECK_PAYMENT: (ctx) => {
    if (!ctx.record.jobId) return failed('this record has no job yet.');
    const { owed, open } = jobBalance(ctx.db, ctx.record.jobId);
    if (owed > 0) {
      tell(ctx.db, officeIds(ctx.db), { title: `Payment check stopped a journey: ${money(owed)} still owed`, body: `${open.map((i) => i.id).join(', ')} · ${ctx.automation.name}`, href: recordHref('JOB', ctx.record.jobId), automationKind: 'STEP_FAILED' });
      return { status: 'STOP', message: `Stopped: ${money(owed)} still owed on ${open.map((i) => i.id).join(', ')}. The office manager was told.` };
    }
    return done('Every invoice for this job is fully paid.');
  },
  NOTIFY_TEAM: (ctx, c) => {
    const ids = recipients(ctx.db, ctx.record, c, 'notify');
    if (!ids.length) return failed('nobody to notify.');
    const text = fillVariables(String(c.text ?? ''), variableValues(ctx.db, ctx.record, ctx.env));
    tell(ctx.db, ids, { title: text || ctx.automation.name, body: ctx.record.label, href: recordHref(ctx.record.type, ctx.record.id) });
    const names = ids.map((id) => userName(ctx.db, id)).join(', ');
    return done(`${names} notified${c.channel === 'EMAIL' || c.channel === 'BOTH' ? ' in the app and by email (email recorded, sandbox)' : ''}.`);
  },
  CREATE_TASK: (ctx, c) => {
    const ids = recipients(ctx.db, ctx.record, c, 'assign');
    const title = fillVariables(String(c.title ?? ''), variableValues(ctx.db, ctx.record, ctx.env));
    if (!title.trim()) return failed('the task has no title.');
    const due = fmtDate(addTime(ctx.env.now.toISOString(), Number(c.dueInDays ?? 1), 'DAYS'));
    const who = ids.map((id) => userName(ctx.db, id)).join(', ') || 'unassigned';
    // Backend gap 1: tasks hold a title only, so assignee, due date and record go in the title.
    ctx.db.tasks.unshift({ id: featureNextId(ctx.db, 'task', 'T-'), title: `${title} · ${who} · due ${due} · ${ctx.record.label}`, done: false, createdAt: ctx.env.now.toISOString() });
    tell(ctx.db, ids, { title: `New task: ${title}`, body: `Due ${due} · ${ctx.record.label}`, href: recordHref(ctx.record.type, ctx.record.id) });
    return done(`Task "${title}" created for ${who}, due ${due}.`);
  },
  ADD_NOTE: (ctx, c) => {
    const text = fillVariables(String(c.text ?? ''), variableValues(ctx.db, ctx.record, ctx.env));
    if (ctx.record.type === 'LEAD') return result(addLeadNote(ctx.db, ctx.actor, ctx.record.id, text), 'Note added to the lead.');
    if (ctx.record.type === 'WORK_ORDER') {
      const r = addFieldNote(ctx.db, ctx.actor, ctx.record.id, text);
      if (r.ok) return done('Field note added to the work order.');
    }
    log(ctx.db, ctx.actor, 'Automations', `Note on ${ctx.record.label}: ${text}`);
    return done('Note added to the activity log.');
  },
  SEND_EMAIL: (ctx, c) => {
    const m = approvedMessage(ctx, String(c.messageId ?? ''));
    if (!m) return failed('the email message was deleted.');
    return sendToCustomer(ctx, { channel: 'email', subject: m.subject, body: typeof c.overrideBody === 'string' ? c.overrideBody : m.body, messageId: String(c.messageId), messageVersion: m.version });
  },
  SEND_TEXT: (ctx, c) => {
    const m = approvedMessage(ctx, String(c.messageId ?? ''));
    if (!m) return failed('the text message was deleted.');
    return sendToCustomer(ctx, { channel: 'sms', body: typeof c.overrideBody === 'string' ? c.overrideBody : m.body, messageId: String(c.messageId), messageVersion: m.version });
  },
  WAIT: (ctx, c) => {
    const until = ctx.run.waitUntil ?? addTime(ctx.run.stepStartedAt ?? ctx.env.now.toISOString(), Number(c.amount ?? 1), c.unit === 'HOURS' ? 'HOURS' : 'DAYS');
    if (ctx.env.now.getTime() >= Date.parse(until)) return done(`Waited ${Number(c.amount ?? 1)} ${c.unit === 'HOURS' ? 'hours' : 'days'}.`);
    return wait(`Waiting until ${fmtDate(until)} ${fmtTime(until)}.`, until);
  },
  WAIT_UNTIL_DATE: (ctx, c) => {
    const module = String(c.module ?? 'JOB') as PipelineModule;
    const id = module === 'LEAD' ? ctx.record.leadId : module === 'ESTIMATE' ? ctx.record.estimateId : module === 'JOB' ? ctx.record.jobId : module === 'WORK_ORDER' ? ctx.record.workOrderId : ctx.record.type === 'INVOICE' ? ctx.record.id : ctx.record.invoiceIds[0];
    const rec = id ? recordOf(ctx.db, module, id, ctx.env.now) : undefined;
    const date = rec?.dates[String(c.dateField)];
    if (!date) return wait(`Waiting for the ${String(c.dateField ?? 'date')} to be set.`);
    const until = addTime(date, Number(c.offsetDays ?? 0), 'DAYS');
    if (ctx.env.now.getTime() >= Date.parse(until)) return done(`Reached ${fmtDate(until)}.`);
    return wait(`Waiting until ${fmtDate(until)}.`, until);
  },
  WAIT_FOR_CONDITION: (ctx, c) => {
    const cond = String(c.condition ?? '');
    const label = WAIT_CONDITIONS.find((w) => w.value === cond)?.label ?? 'the condition';
    const met = waitConditionMet(ctx.s, ctx.db, ctx.record, cond);
    if (met === true) return done(`${label}.`);
    const limit = addTime(ctx.run.stepStartedAt ?? ctx.env.now.toISOString(), Number(c.limitAmount ?? 7), c.limitUnit === 'HOURS' ? 'HOURS' : 'DAYS');
    if (ctx.env.now.getTime() < Date.parse(limit) || ctx.run.limitPassed) {
      return wait(`Waiting until ${label.replace(/^The /, 'the ')}${met === 'NEVER' ? ' (this event needs the backend)' : ''}.`, ctx.run.limitPassed ? undefined : limit);
    }
    const notifyIds = usersInRole(ctx.db, String(c.notifyRole ?? 'office_manager')).map((u) => u.id);
    if (c.onTimeout === 'CARRY_ON') return done(`The time limit passed before ${label.replace(/^The /, 'the ')}. Carried on.`);
    if (!ctx.env.dryRun) tell(ctx.db, notifyIds, { title: `Still waiting: ${label}`, body: `${ctx.record.label} · ${ctx.automation.name}`, href: recordHref(ctx.record.type, ctx.record.id), automationKind: 'STUCK_ALERT' });
    if (c.onTimeout === 'NOTIFY_STOP') return { status: 'STOP', message: `Stopped: the time limit passed before ${label.replace(/^The /, 'the ')}. Someone was told.` };
    ctx.run.limitPassed = true;
    return wait(`The time limit passed. Someone was told; still waiting until ${label.replace(/^The /, 'the ')}.`);
  },
};

export function execute(ctx: ExecCtx): ExecResult {
  const ex = EXECUTORS[ctx.step.type];
  const def = stepDef(ctx.step.type);
  if (!ex || !def) return failed('this step no longer exists.');
  const config = { ...ctx.step.config, ...(ctx.run.overrides?.[ctx.step.id] ?? {}) };
  try {
    return ex(ctx, config);
  } catch (e) {
    return failed(e instanceof Error ? e.message : 'something went wrong.');
  }
}

/** Plain words for a step that was skipped by its own "Only if". */
export function conditionSkipMessage(c: AutomationCondition, names: Parameters<typeof conditionPhrase>[1]): string {
  return `Skipped: only if ${conditionPhrase(c, names)}.`;
}

export { recordKey };
