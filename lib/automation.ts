/*
  Automation engine (30 Sep call, CRM-C3 to C5). Pure over the replica data.

  Events: an estimate accepted or declined, an estimate appointment with no
  estimate after its day (no-show), a job completed. Each event has a key
  (trigger:recordId) and is handled once.

  For each event, every active rule whose trigger matches is walked along its
  linked steps (condition yes / no, then actions), and every active template
  tied to the trigger adds its message. A message from an approved rule or
  template goes out (sandbox); otherwise it waits in the approval queue.
  Nothing reaches a customer without an approval.
*/
import { estimateTotals } from './calculations';
import type {
  AutomatedMessage, AutomationApproval, AutomationRule, AutomationTrigger, Database, PreparedMessage, RuleNode,
} from './types';

export const TRIGGER_LABEL: Record<AutomationTrigger, string> = {
  estimate_accepted: 'Estimate accepted',
  estimate_declined: 'Estimate declined',
  estimate_no_show: 'Estimate no-show',
  job_complete: 'Job complete',
};

export interface AutomationEventInfo {
  key: string;
  trigger: AutomationTrigger;
  leadId?: string;
  estimateId?: string;
  jobId?: string;
  firstName: string;
  customerName: string;
  email: string;
  phone: string;
  projectName: string;
  value: number;
  source: string;
  serviceType: string;
}

const today = (now: Date) => now.toISOString().slice(0, 10);

/** Every event the data shows right now. */
export function automationEvents(db: Database, now = new Date()): AutomationEventInfo[] {
  const c = db.collections;
  const person = (customerId?: string, leadId?: string) => {
    const cu = c.customers.find((x) => x.id === customerId);
    const l = c.leads.find((x) => x.id === leadId);
    const firstName = cu?.firstName ?? l?.firstName ?? '';
    const lastName = cu?.lastName ?? l?.lastName ?? '';
    return {
      firstName, customerName: `${firstName} ${lastName}`.trim(), email: cu?.email ?? l?.email ?? '', phone: cu?.phone ?? l?.phone ?? '',
      source: l?.leadSource ?? cu?.source ?? '', serviceType: l?.serviceType ?? '',
    };
  };
  const out: AutomationEventInfo[] = [];
  for (const e of c.estimates) {
    const trigger = e.status === 'Approved' ? 'estimate_accepted' : e.status === 'Rejected' ? 'estimate_declined' : undefined;
    if (!trigger) continue;
    out.push({ key: `${trigger}:${e.id}`, trigger, estimateId: e.id, leadId: e.leadId, projectName: e.title, value: estimateTotals(e).taxable, ...person(e.customerId, e.leadId), serviceType: e.estimateType });
  }
  for (const j of c.jobs) {
    if (j.status !== 'Completed') continue;
    out.push({ key: `job_complete:${j.id}`, trigger: 'job_complete', jobId: j.id, estimateId: j.estimateId, leadId: j.leadId, projectName: j.title, value: j.value, ...person(j.customerId, j.leadId) });
  }
  for (const l of c.leads) {
    // No-show: the appointment day has passed, the lead is still Scheduled and no estimate was made.
    if (l.status !== 'Scheduled' || l.estimateId || !l.appointment?.date || l.appointment.date >= today(now)) continue;
    out.push({ key: `estimate_no_show:${l.id}`, trigger: 'estimate_no_show', leadId: l.id, projectName: l.serviceType, value: l.estimatedValue, ...person(l.customerId, l.id) });
  }
  return out;
}

export const automationEventKeys = (db: Database, now = new Date()) => automationEvents(db, now).map((e) => e.key);

/** Does the event pass a condition step? */
export function conditionPasses(cond: NonNullable<RuleNode['condition']>, ev: AutomationEventInfo): boolean {
  if (cond.field === 'estimate_value') return ev.value > Number(cond.value || 0);
  const have = cond.field === 'lead_source' ? ev.source : ev.serviceType;
  return have.trim().toLowerCase() === cond.value.trim().toLowerCase();
}

/**
 * The actions a rule takes for an event: from the trigger step along next,
 * yes and no links. A step visited twice ends the walk (no loops).
 */
export function ruleActions(rule: AutomationRule, ev: AutomationEventInfo): RuleNode[] {
  const byId = new Map(rule.nodes.map((n) => [n.id, n]));
  const start = byId.get(rule.startId);
  if (!rule.active || start?.kind !== 'trigger' || start.trigger !== ev.trigger) return [];
  const out: RuleNode[] = [];
  const seen = new Set<string>();
  let id: string | undefined = start.next;
  while (id && !seen.has(id)) {
    seen.add(id);
    const n = byId.get(id);
    if (!n) break;
    if (n.kind === 'condition' && n.condition) id = conditionPasses(n.condition, ev) ? n.yes : n.no;
    else {
      if (n.kind === 'action' && n.action) out.push(n);
      id = n.next;
    }
  }
  return out;
}

export function fillVars(text: string, ev: AutomationEventInfo, orgName: string): string {
  return text
    .replace(/\{\{\s*firstName\s*\}\}/g, ev.firstName || 'there')
    .replace(/\{\{\s*customerName\s*\}\}/g, ev.customerName)
    .replace(/\{\{\s*projectName\s*\}\}/g, ev.projectName)
    .replace(/\{\{\s*orgName\s*\}\}/g, orgName);
}

/** Messages one event prepares. `auto` = the rule or template was approved, so it sends without asking. */
export function prepareMessages(
  ev: AutomationEventInfo,
  rules: AutomationRule[],
  templates: AutomatedMessage[],
  opts: { at: string; orgName: string; newId: () => string },
): PreparedMessage[] {
  const base = { eventKey: ev.key, trigger: ev.trigger, customerName: ev.customerName, leadId: ev.leadId, estimateId: ev.estimateId, jobId: ev.jobId, createdAt: opts.at };
  const out: PreparedMessage[] = [];
  for (const r of rules) {
    for (const n of ruleActions(r, ev)) {
      const a = n.action!;
      out.push({
        ...base, id: opts.newId(), sourceKind: 'rule', sourceId: r.id, sourceName: r.name, channel: a.channel, to: a.channel === 'email' ? ev.email : ev.phone,
        subject: a.subject ? fillVars(a.subject, ev, opts.orgName) : undefined, body: fillVars(a.body, ev, opts.orgName),
        status: r.approval ? 'sent' : 'waiting', ...(r.approval ? { auto: true, decidedAt: opts.at, decidedBy: r.approval.by } : {}),
      });
    }
  }
  for (const t of templates) {
    if (!t.isActive || t.ruleTrigger !== ev.trigger) continue;
    const channels: ('email' | 'sms')[] = t.channel === 'BOTH' ? ['email', 'sms'] : [t.channel === 'SMS' ? 'sms' : 'email'];
    for (const channel of channels) {
      out.push({
        ...base, id: opts.newId(), sourceKind: 'template', sourceId: t.id, sourceName: t.name, channel, to: channel === 'email' ? ev.email : ev.phone,
        subject: channel === 'email' && t.subject ? fillVars(t.subject, ev, opts.orgName) : undefined, body: fillVars(t.body, ev, opts.orgName),
        status: t.approval ? 'sent' : 'waiting', ...(t.approval ? { auto: true, decidedAt: opts.at, decidedBy: t.approval.by } : {}),
      });
    }
  }
  return out;
}

/** New events since last time, and the messages they prepare. */
export function runAutomations(db: Database, opts: { at: string; orgName: string; newId: () => string; now?: Date }) {
  const seen = new Set(db.collections.automationEvents.map((e) => e.id));
  const fresh = automationEvents(db, opts.now).filter((e) => !seen.has(e.key));
  return {
    events: fresh.map((e) => ({ id: e.key, at: opts.at })),
    messages: fresh.flatMap((e) => prepareMessages(e, db.collections.automationRules, db.collections.automatedMessages, opts)),
  };
}

/** Owner and Admin approve automations. */
export const canApproveAutomation = (role?: string) => role === 'Owner' || role === 'Admin';

export const approvalLabel = (a?: AutomationApproval) =>
  a ? `Approved · ${a.by} · ${new Date(a.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Ask me first';

export const waitingCount = (msgs: PreparedMessage[]) => msgs.filter((m) => m.status === 'waiting').length;

/* ---------- The stacked When / If / Then editor (CRM-C4) ---------- */

type Action = NonNullable<RuleNode['action']>;
type Condition = NonNullable<RuleNode['condition']>;

/** What the list editor shows: When, an optional If, Then (yes) and Otherwise (no). */
export interface RuleDraft {
  name: string;
  active: boolean;
  trigger: AutomationTrigger;
  condition?: Condition;
  then: Action;
  otherwise?: Action;
}

/** Reads a rule's linked steps into the editor's shape (the first action on each path). */
export function ruleToDraft(rule: AutomationRule): RuleDraft {
  const byId = new Map(rule.nodes.map((n) => [n.id, n]));
  const start = byId.get(rule.startId);
  const next = start?.next ? byId.get(start.next) : undefined;
  const cond = next?.kind === 'condition' ? next : undefined;
  const firstAction = (id?: string) => {
    const seen = new Set<string>();
    let n = id ? byId.get(id) : undefined;
    while (n && !seen.has(n.id)) {
      seen.add(n.id);
      if (n.kind === 'action' && n.action) return n.action;
      n = n.next ? byId.get(n.next) : undefined;
    }
    return undefined;
  };
  return {
    name: rule.name,
    active: rule.active,
    trigger: start?.trigger ?? 'estimate_accepted',
    condition: cond?.condition,
    then: (cond ? firstAction(cond.yes) : firstAction(start?.next)) ?? { channel: 'email', subject: '', body: '' },
    otherwise: cond ? firstAction(cond.no) : undefined,
  };
}

/** Writes the editor's shape back as linked steps: trigger → (condition → yes / no) → actions. */
export function draftToNodes(d: RuleDraft): { startId: string; nodes: RuleNode[] } {
  const nodes: RuleNode[] = [{ id: 'n1', kind: 'trigger', trigger: d.trigger }];
  if (d.condition) {
    nodes[0]!.next = 'n2';
    nodes.push({ id: 'n2', kind: 'condition', condition: d.condition, yes: 'n3', ...(d.otherwise ? { no: 'n4' } : {}) });
    nodes.push({ id: 'n3', kind: 'action', action: d.then });
    if (d.otherwise) nodes.push({ id: 'n4', kind: 'action', action: d.otherwise });
  } else {
    nodes[0]!.next = 'n3';
    nodes.push({ id: 'n3', kind: 'action', action: d.then });
  }
  return { startId: 'n1', nodes };
}

export const CONDITION_LABEL: Record<Condition['field'], string> = { lead_source: 'Lead source', estimate_value: 'Estimate value', service_type: 'Service type' };

/* ---------- Editing the flow (CRM-C5) ---------- */

type StepResult = { ok: true; nodes: RuleNode[] } | { ok: false; error: string };

/** Steps reachable from the trigger; anything else is dropped. */
function reachable(nodes: RuleNode[], startId: string): RuleNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const keep = new Set<string>();
  const walk = (id?: string) => {
    if (!id || keep.has(id) || !byId.has(id)) return;
    keep.add(id);
    const n = byId.get(id)!;
    walk(n.next);
    walk(n.yes);
    walk(n.no);
  };
  walk(startId);
  return nodes.filter((n) => keep.has(n.id));
}

/**
 * Adds a step after the selected one. After an If, it fills the empty
 * branch (Yes first). A new If keeps what followed as its Yes path.
 */
export function addStep(nodes: RuleNode[], afterId: string, step: RuleNode): StepResult {
  if (step.kind === 'trigger') return { ok: false, error: 'A rule starts with one When.' };
  const next = nodes.map((n) => ({ ...n }));
  const after = next.find((n) => n.id === afterId);
  if (!after) return { ok: false, error: 'Select a step first.' };
  const added = { ...step };
  if (after.kind === 'condition') {
    if (step.kind === 'condition') return { ok: false, error: 'Add the If after a message, or after When.' };
    if (!after.yes) after.yes = added.id;
    else if (!after.no) after.no = added.id;
    else return { ok: false, error: 'Both branches of this If already have a step. Select one of them.' };
  } else if (added.kind === 'condition') {
    added.yes = after.next;
    after.next = added.id;
  } else {
    added.next = after.next;
    after.next = added.id;
  }
  return { ok: true, nodes: [...next, added] };
}

/** Removes a step. Removing an If keeps its Yes path; the No path goes with it. */
export function removeStep(nodes: RuleNode[], startId: string, id: string): StepResult {
  const target = nodes.find((n) => n.id === id);
  if (!target) return { ok: false, error: 'Step not found.' };
  if (target.kind === 'trigger') return { ok: false, error: 'The When step can be changed, not removed.' };
  const follow = target.kind === 'condition' ? target.yes : target.next;
  const next = nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, next: n.next === id ? follow : n.next, yes: n.yes === id ? follow : n.yes, no: n.no === id ? follow : n.no }));
  return { ok: true, nodes: reachable(next, startId) };
}

/** A rule needs at least one message to send. */
export const ruleProblem = (nodes: RuleNode[]) =>
  !nodes.some((n) => n.kind === 'action') ? 'Add at least one message.' : nodes.some((n) => n.kind === 'action' && !n.action?.body.trim()) ? 'Every message needs text.' : undefined;
