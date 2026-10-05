/*
  Automations engine: the "run it and leave it" rules (spec section 10 and
  acceptance criteria 27–48), against the features demo seed.
*/
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database as FDb } from '@/features/types';
import { createSeed } from '@/features/data/seed';
import { markEstimateApproved } from '@/features/lib/store/actions/estimates';
import { recordInvoicePayment } from '@/features/lib/store/actions/invoices';
import { createLead } from '@/features/lib/store/actions/leads';
import type { Automation, AutomationStep, AutomationTrigger, CustomerMessage } from './types';
import { emptyState, type EngineState } from './state';
import { approveReview, testRun, tick } from './engine';
import type { EngineEnv } from './executors';
import { NO_NAMES } from './summary';

const NOW = new Date(2026, 9, 7, 10, 0, 0); // Wed 7 Oct 2026, 10:00 local

const MESSAGES: CustomerMessage[] = [
  { id: 'm_email', name: 'Welcome', channel: 'EMAIL', subject: 'Hi {{firstName}}', body: 'Hello {{customerName}} from {{orgName}}', isSample: false, version: 1, usedInAutomationIds: [], updatedBy: 'x', updatedAt: '' },
  { id: 'm_text', name: 'Reminder text', channel: 'SMS', body: 'See you soon {{firstName}}', isSample: false, version: 1, usedInAutomationIds: [], updatedBy: 'x', updatedAt: '' },
  { id: 'm_review', name: 'Review', channel: 'EMAIL', subject: 'Review', body: 'Leave a review {{reviewLink}}', isSample: false, version: 1, usedInAutomationIds: [], updatedBy: 'x', updatedAt: '' },
];

const env = (now = new Date()): EngineEnv => ({
  now, messages: MESSAGES, orgName: 'Acme Painting', reviewLink: 'https://g.page/acme',
  estimateTemplates: [{ id: 'tpl_interior', name: 'Standard Interior Repaint', estimateType: 'Interior' }],
});

let seq = 0;
const st = (type: string, config: Record<string, unknown> = {}, extra: Partial<AutomationStep> = {}): AutomationStep =>
  ({ id: `s${++seq}`, order: 0, type, mode: 'AUTO', conditions: [], config, ...extra });

function deploy(s: EngineState, name: string, trigger: AutomationTrigger, steps: AutomationStep[], extra: Partial<Automation> = {}): Automation {
  const id = `auto_${++seq}`;
  const at = new Date(Date.now() - 1000).toISOString();
  const ordered = steps.map((x, i) => ({ ...x, order: i }));
  s.approvals.push({ id: `apr_${id}`, automationId: id, approvedBy: 'U-OWNER', approvedAt: at, customerFacingSteps: [], snapshot: { trigger, conditions: [], steps: ordered } });
  const a: Automation = {
    id, name, summary: '', trigger, conditions: [], steps: ordered, runOrder: 0, isEnabled: true, deployedAt: at, approvalId: `apr_${id}`, needsReapproval: false,
    isArchived: false, isDeleted: false, runsLast7Days: 0, problemCount: 0, createdBy: 'U-OFFICE', updatedBy: 'U-OFFICE', createdAt: at, updatedAt: at, ...extra,
  };
  s.automations.push(a);
  return a;
}

const owner = (db: FDb) => db.users.find((u) => u.role === 'owner')!;
const step = (s: EngineState, runIndex = 0) => s.runs[runIndex]!.steps;

let s: EngineState;
let db: FDb;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  s = emptyState();
  db = createSeed(new Date().toISOString());
  tick(s, db, env(), NO_NAMES); // baseline: existing records never start anything
});
afterEach(() => vi.useRealTimers());

describe('starting runs', () => {
  it('records existing records first and starts nothing for them', () => {
    deploy(s, 'Any lead', { type: 'STAGE_ENTERED', module: 'LEAD', config: { stage: 'NEW' } }, [st('ADD_NOTE', { text: 'hi' })]);
    tick(s, db, env(), NO_NAMES);
    expect(s.runs).toHaveLength(0);
  });

  it('starts once when a lead is created, and never again on later ticks', () => {
    deploy(s, 'Welcome', { type: 'RECORD_CREATED', module: 'LEAD', config: {} }, [
      st('ASSIGN_LEAD_OWNER', { how: 'ROUND_ROBIN', role: 'estimators' }),
      st('SEND_EMAIL', { messageId: 'm_email' }),
      st('CREATE_TASK', { title: 'Call {{customerName}}', assignTo: 'ASSIGNED', dueInDays: 0 }),
    ]);
    const r = createLead(db, owner(db), { firstName: 'Jane', lastName: 'Smith', phone: '(214) 555-0100', email: 'jane@example.com', address: '1 Elm St', city: 'Dallas', state: 'TX', zip: '75201', source: 'Website', note: '' });
    expect(r.ok).toBe(true);
    tick(s, db, env(), NO_NAMES);
    tick(s, db, env(), NO_NAMES);
    expect(s.runs).toHaveLength(1);
    expect(s.runs[0]!.status).toBe('DONE');
    expect(step(s).map((x) => x.status)).toEqual(['DONE', 'DONE', 'DONE']);
    const lead = db.leads.find((l) => l.id === (r as { value?: string }).value)!;
    expect(lead.assignedUserId).toBeTruthy();
    expect(s.sent).toHaveLength(1);
    expect(s.sent[0]!.body).toContain('Jane Smith');
    expect(db.tasks[0]!.title).toContain('Call Jane Smith');
  });

  it('skips a run when the automation "Only if" is false', () => {
    const a = deploy(s, 'Referrals only', { type: 'RECORD_CREATED', module: 'LEAD', config: {} }, [st('ADD_NOTE', { text: 'x' })]);
    a.conditions = [{ id: 'c', field: 'lead.source', operator: 'IS', value: 'referral' }];
    s.approvals.at(-1)!.snapshot.conditions = a.conditions;
    createLead(db, owner(db), { firstName: 'A', lastName: 'B', phone: '1', email: '', address: '', city: '', state: '', zip: '', source: 'Website', note: '' });
    tick(s, db, env(), NO_NAMES);
    expect(s.runs).toHaveLength(0);
  });

  it('a turned-off or never-deployed automation starts nothing', () => {
    deploy(s, 'Off', { type: 'RECORD_CREATED', module: 'LEAD', config: {} }, [st('ADD_NOTE', { text: 'x' })], { isEnabled: false });
    deploy(s, 'Draft', { type: 'RECORD_CREATED', module: 'LEAD', config: {} }, [st('ADD_NOTE', { text: 'x' })], { deployedAt: undefined, approvalId: undefined });
    createLead(db, owner(db), { firstName: 'A', lastName: 'B', phone: '1', email: '', address: '', city: '', state: '', zip: '', source: 'Website', note: '' });
    tick(s, db, env(), NO_NAMES);
    expect(s.runs).toHaveLength(0);
  });
});

describe('live app rules', () => {
  it('creates an estimate only for a Scheduled lead with none, and says so otherwise', () => {
    const a = deploy(s, 'Estimate', { type: 'FIELD_CHANGED', module: 'LEAD', config: { field: 'source' } }, [st('CREATE_ESTIMATE_FROM_TEMPLATE', { estimateTemplateId: 'tpl_interior' })]);
    db.leads.find((l) => l.id === 'LEAD-2026-10')!.source = 'referral';
    db.leads.find((l) => l.id === 'LEAD-2026-11')!.source = 'referral';
    tick(s, db, env(), NO_NAMES);
    const runs = s.runs.filter((r) => r.automationId === a.id);
    const fresh = runs.find((r) => r.recordId === 'LEAD-2026-10')!;
    const already = runs.find((r) => r.recordId === 'LEAD-2026-11')!;
    expect(fresh.steps[0]!.status).toBe('DONE');
    expect(db.leads.find((l) => l.id === 'LEAD-2026-10')!.estimateId).toBeTruthy();
    expect(already.steps[0]!.message).toBe('Skipped: this lead already has an estimate (EST-2026-8).');
  });

  it('uses the acceptance draft as the deposit invoice instead of making a second one', () => {
    deploy(s, 'Deposit', { type: 'STAGE_ENTERED', module: 'ESTIMATE', config: { stage: 'ACCEPTED' } }, [
      st('MOVE_LEAD_STAGE', { stage: 'SOLD' }),
      st('CREATE_INVOICE', { invoiceType: 'DEPOSIT', amountKind: 'PERCENT', percent: 30 }),
    ]);
    const before = db.invoices.length;
    expect(markEstimateApproved(db, owner(db), 'EST-2026-5').ok).toBe(true);
    tick(s, db, env(), NO_NAMES);
    const run = s.runs.find((r) => r.recordId === 'EST-2026-5')!;
    expect(run.steps[0]!.message).toBe('Skipped: the lead is already Sold.');
    expect(run.steps[1]!.message).toMatch(/^Skipped: this job already has a deposit invoice \(INV-/);
    expect(db.invoices.length).toBe(before + 1); // only the built-in draft
  });

  it('confirms the deposit only once it is paid, then books the schedule', () => {
    markEstimateApproved(db, owner(db), 'EST-2026-5');
    tick(s, db, env(), NO_NAMES);
    deploy(s, 'Book', { type: 'PAYMENT_RECORDED', module: 'INVOICE', config: { which: 'DEPOSIT' } }, [st('CONFIRM_DEPOSIT'), st('BOOK_SCHEDULE', { earliestDays: 3, durationDays: 2 })]);
    const inv = db.invoices.find((i) => i.jobId === 'JOB-2026-3')!;
    expect(recordInvoicePayment(db, owner(db), inv.id, { amount: 100, method: 'cash' }).ok).toBe(true);
    tick(s, db, env(), NO_NAMES);
    expect(s.runs.filter((r) => r.automationId.startsWith('auto') && r.recordId === inv.id)).toHaveLength(0); // not the deposit yet
    recordInvoicePayment(db, owner(db), inv.id, { amount: inv.depositDue! - 100, method: 'cash' });
    tick(s, db, env(), NO_NAMES);
    const run = s.runs.find((r) => r.recordId === inv.id)!;
    expect(run.status).toBe('DONE');
    expect(db.workOrders.find((w) => w.jobId === 'JOB-2026-3')!.status).toBe('SCHEDULED');
  });
});

describe('customer protections', () => {
  const trigger: AutomationTrigger = { type: 'RECORD_CREATED', module: 'LEAD', config: {} };
  const newLead = () => (createLead(db, owner(db), { firstName: 'Ann', lastName: 'Lee', phone: '(214) 555-0199', email: 'ann@example.com', address: '', city: '', state: '', zip: '', source: 'Website', note: "" }) as { value?: string }).value as string;

  it('never emails a customer who opted out', () => {
    deploy(s, 'Mail', trigger, [st('SEND_EMAIL', { messageId: 'm_email' })]);
    const id = newLead();
    s.consent[db.leads.find((l) => l.id === id)!.customerId] = { doNotEmail: true };
    tick(s, db, env(), NO_NAMES);
    expect(step(s)[0]!.message).toBe('Skipped: customer opted out of emails');
    expect(s.sent).toHaveLength(0);
  });

  it('keeps texts locked until texting is released, then adds the opt-out line', () => {
    deploy(s, 'Text', trigger, [st('SEND_TEXT', { messageId: 'm_text' })]);
    newLead();
    tick(s, db, env(), NO_NAMES);
    expect(step(s)[0]!.message).toBe("Skipped: texting isn't switched on yet");
    s.settings.textingReleased = true;
    newLead();
    tick(s, db, env(), NO_NAMES);
    expect(s.sent.at(-1)!.body).toMatch(/Reply STOP to opt out$/);
  });

  it('waits for the contact window and sends once it opens', () => {
    vi.setSystemTime(new Date(2026, 9, 7, 21, 0));
    deploy(s, 'Mail', trigger, [st('SEND_EMAIL', { messageId: 'm_email' })]);
    newLead();
    tick(s, db, env(), NO_NAMES);
    expect(s.runs[0]!.status).toBe('WAITING');
    expect(s.runs[0]!.waitingFor).toMatch(/contact window/);
    vi.setSystemTime(new Date(2026, 9, 8, 8, 5));
    tick(s, db, env(), NO_NAMES);
    expect(s.runs[0]!.status).toBe('DONE');
    expect(s.sent).toHaveLength(1);
  });

  it('holds messages in the queue at the plan limit instead of dropping them', () => {
    s.settings.sending.email = { perDay: 1 };
    deploy(s, 'Mail', trigger, [st('SEND_EMAIL', { messageId: 'm_email' })]);
    newLead();
    newLead();
    tick(s, db, env(), NO_NAMES);
    expect(s.sent).toHaveLength(1);
    expect(s.runs.filter((r) => r.status === 'WAITING')).toHaveLength(1);
    s.settings.sending.email = { perDay: 5 };
    tick(s, db, env(), NO_NAMES);
    expect(s.sent).toHaveLength(2);
  });
});

describe('once only, review and waits', () => {
  it('"Ask me first" waits for review, and a double approve runs it once', () => {
    deploy(s, 'Ask', { type: 'RECORD_CREATED', module: 'LEAD', config: {} }, [st('SEND_EMAIL', { messageId: 'm_email' }, { mode: 'ASK' })]);
    createLead(db, owner(db), { firstName: 'Bo', lastName: 'Ng', phone: '', email: 'bo@example.com', address: '', city: '', state: '', zip: '', source: 'Website', note: '' });
    tick(s, db, env(), NO_NAMES);
    expect(s.runs[0]!.status).toBe('WAITING_FOR_REVIEW');
    const item = s.reviews[0]!;
    expect(approveReview(s, db, item.id, owner(db), undefined, env(), NO_NAMES).ok).toBe(true);
    expect(approveReview(s, db, item.id, owner(db), undefined, env(), NO_NAMES).ok).toBe(false);
    tick(s, db, env(), NO_NAMES);
    expect(s.sent).toHaveLength(1);
    expect(db.notifications!.some((n) => n.reviewItemId === item.id)).toBe(true);
  });

  it('a step delay waits, and the "Only if" of a step skips it and carries on', () => {
    deploy(s, 'Delayed', { type: 'RECORD_CREATED', module: 'LEAD', config: {} }, [
      st('ADD_NOTE', { text: 'skipped' }, { conditions: [{ id: 'c', field: 'lead.source', operator: 'IS', value: 'referral' }] }),
      st('ADD_NOTE', { text: 'later' }, { delay: { amount: 2, unit: 'DAYS', workingDaysOnly: false } }),
    ]);
    createLead(db, owner(db), { firstName: 'C', lastName: 'D', phone: '1', email: '', address: '', city: '', state: '', zip: '', source: 'Website', note: '' });
    tick(s, db, env(), NO_NAMES);
    expect(step(s)[0]!.status).toBe('SKIPPED');
    expect(s.runs[0]!.status).toBe('WAITING');
    vi.setSystemTime(new Date(2026, 9, 9, 10, 1));
    tick(s, db, env(), NO_NAMES);
    expect(s.runs[0]!.status).toBe('DONE');
  });

  it('check payment stops the review request while money is owed', () => {
    deploy(s, 'Review', { type: 'PAYMENT_RECORDED', module: 'INVOICE', config: { which: 'ANY' } }, [st('CHECK_PAYMENT'), st('SEND_EMAIL', { messageId: 'm_review' })]);
    recordInvoicePayment(db, owner(db), 'INV-2026-2', { amount: 100, method: 'cash' });
    tick(s, db, env(), NO_NAMES);
    const run = s.runs[0]!;
    expect(run.status).toBe('SKIPPED');
    expect(run.steps[0]!.message).toMatch(/^Stopped: \$2,183\.33 still owed on INV-2026-2/);
    expect(run.steps[1]!.message).toBe('Not run: the flow stopped.');
    expect(s.sent).toHaveLength(0);
  });

  it('stops a chain of 5 automations on one record within a minute', () => {
    for (let i = 0; i < 6; i++) deploy(s, `A${i}`, { type: 'RECORD_CREATED', module: 'LEAD', config: {} }, [st('ADD_NOTE', { text: 'x' })]);
    createLead(db, owner(db), { firstName: 'E', lastName: 'F', phone: '1', email: '', address: '', city: '', state: '', zip: '', source: 'Website', note: '' });
    tick(s, db, env(), NO_NAMES);
    expect(s.runs.find((r) => r.status === 'FAILED')!.steps[0]!.message).toBe('Failed: Stopped to prevent a loop.');
  });

  it('a failed step says why and notifies the owner', () => {
    deploy(s, 'Start', { type: 'RECORD_CREATED', module: 'LEAD', config: {} }, [st('START_JOB')]);
    createLead(db, owner(db), { firstName: 'G', lastName: 'H', phone: '1', email: '', address: '', city: '', state: '', zip: '', source: 'Website', note: '' });
    tick(s, db, env(), NO_NAMES);
    expect(s.runs[0]!.status).toBe('FAILED');
    expect(step(s)[0]!.message).toBe('Failed: this record has no work order yet.');
    expect(db.notifications!.some((n) => n.automationKind === 'STEP_FAILED' && n.userId === 'U-OWNER')).toBe(true);
  });
});

describe('test run', () => {
  it('plays a finished job without changing anything', () => {
    const a = deploy(s, 'Final', { type: 'STAGE_ENTERED', module: 'ESTIMATE', config: { stage: 'ACCEPTED' } }, [st('CREATE_INVOICE', { invoiceType: 'DEPOSIT', amountKind: 'PERCENT', percent: 30 })]);
    const before = JSON.stringify(db);
    const r = testRun([a], s, db, 'JOB', 'JOB-2026-1', env(), NO_NAMES);
    expect(JSON.stringify(db)).toBe(before);
    expect(r.recordLabel).toMatch(/^Job JOB-2026-1/);
    expect(r.timeline.length).toBeGreaterThan(0);
    expect(s.runs).toHaveLength(0);
  });
});
