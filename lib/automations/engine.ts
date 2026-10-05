/*
  The run engine (spec sections 7, 8 and 10). Pure over two drafts: the
  module state and the features database. lib/automations/AutomationsSync
  calls tick() every few seconds and whenever records change.

  One tick:
    1. Reads every record and compares it with what the engine last saw
       (stage, entry number, watched fields, paid amount). The first tick
       only records what exists, so old records never start anything.
    2. Turns the differences into events, plus time-based ones (in a stage
       for a set time, a date coming up, years since completion).
    3. Starts a run for every deployed, switched-on automation the event
       matches, once per event (trigger once-key), if its "Only if" holds.
       A chain of 5 runs on one record within a minute is stopped.
    4. Moves every waiting run along until it has to wait.
    5. Sends stuck alerts and sending-capacity notices.

  Nothing runs twice: steps have once-keys (automation + step + record +
  stage entry + event), customer messages have their own key, and steps
  that create records check the target record first.
*/
import type { Database as FDb, User } from '@/features/types';
import type {
  Automation, AutomationDefinition, AutomationRun, AutomationStep, PipelineModule, ReviewItem, RunStepStatus, TestRunResult,
} from './types';
import type { EngineState } from './state';
import { emptyState, nextId } from './state';
import type { RecordView } from './records';
import { allRecords, recordHref, recordKey, recordOf } from './records';
import { STUCK_ALERT_DEFAULTS, boardPlacement, pipelineOf, stageLabel, stagesOf, stepDef } from './registry';
import type { EngineEnv, ExecResult } from './executors';
import {
  addTime, capacityCheck, conditionHolds, conditionValues, execute, failingCondition, fmtDate, officeIds, ownerIds, tell, usersInRole, variableValues,
} from './executors';
import { conditionPhrase, stepPhrase, type NameLookup } from './summary';
import { can } from '@/features/lib/permissions';

export interface EngineEvent {
  type: string;
  record: RecordView;
  entryNo: number;
  stage?: string;
  /** Distinguishes repeat events of one kind (a field value, a payment amount). */
  key: string;
  payload?: Record<string, unknown>;
}

const MINUTE = 60_000;
const HOUR = 3_600_000;

/* ---------- Which automations are live ---------- */

export function isLive(a: Automation): boolean {
  return a.isEnabled && !!a.deployedAt && !!a.approvalId && !a.isArchived && !a.isDeleted;
}

/** What a run follows: the approved snapshot while a customer-facing change waits for approval. */
export function liveDefinition(s: EngineState, a: Automation): AutomationDefinition {
  const ap = s.approvals.find((x) => x.id === a.approvalId);
  if (a.needsReapproval && ap) return ap.snapshot;
  return { trigger: a.trigger, conditions: a.conditions, steps: a.steps, keepGoingIfStageChanges: a.keepGoingIfStageChanges };
}

function actorFor(s: EngineState, db: FDb, a: Automation): User {
  const ap = s.approvals.find((x) => x.id === a.approvalId);
  return db.users.find((u) => u.id === ap?.approvedBy) ?? db.users.find((u) => u.role === 'owner') ?? db.users[0]!;
}

/* ---------- 1–2. Events ---------- */

function fieldsOf(s: EngineState, r: RecordView): Record<string, string> {
  return r.type === 'ESTIMATE' ? { ...r.fields, ready: s.readyEstimates[r.id] ?? '' } : r.fields;
}

/** Compare records with the tracks and return what happened. Updates the tracks. */
export function detectEvents(s: EngineState, db: FDb, now: Date): EngineEvent[] {
  const records = allRecords(db, now);
  const at = now.toISOString();
  const events: EngineEvent[] = [];
  if (!s.baselinedAt) {
    for (const r of records) s.tracks[recordKey(r.type, r.id)] = { stage: r.stage, entryNo: 1, enteredAt: r.createdAt ?? at, fields: fieldsOf(s, r), paid: r.paid };
    s.touchUpsSeen = db.touchUpRequests.map((t) => t.id);
    s.baselinedAt = at;
    return [];
  }
  for (const r of records) {
    const k = recordKey(r.type, r.id);
    const t = s.tracks[k];
    const fields = fieldsOf(s, r);
    if (!t) {
      s.tracks[k] = { stage: r.stage, entryNo: 1, enteredAt: at, fields, paid: r.paid };
      events.push({ type: 'RECORD_CREATED', record: r, entryNo: 1, key: 'created' });
      events.push({ type: 'STAGE_ENTERED', record: r, entryNo: 1, stage: r.stage, key: `stage:1` });
      if (r.type === 'ESTIMATE' && r.stage === 'VIEWED') events.push({ type: 'ESTIMATE_VIEWED', record: r, entryNo: 1, key: 'viewed' });
      if (r.type === 'ESTIMATE' && r.stage === 'ACCEPTED') events.push({ type: 'ESTIMATE_SIGNED', record: r, entryNo: 1, key: 'signed:1' });
      continue;
    }
    if (t.stage !== r.stage) {
      t.stage = r.stage;
      t.entryNo += 1;
      t.enteredAt = at;
      events.push({ type: 'STAGE_ENTERED', record: r, entryNo: t.entryNo, stage: r.stage, key: `stage:${t.entryNo}` });
      if (r.type === 'ESTIMATE' && r.stage === 'VIEWED') events.push({ type: 'ESTIMATE_VIEWED', record: r, entryNo: t.entryNo, key: 'viewed' });
      if (r.type === 'ESTIMATE' && r.stage === 'ACCEPTED') events.push({ type: 'ESTIMATE_SIGNED', record: r, entryNo: t.entryNo, key: `signed:${t.entryNo}` });
    }
    for (const [field, value] of Object.entries(fields)) {
      const before = t.fields[field] ?? '';
      if (before === value) continue;
      if (field === 'ready') {
        if (value) events.push({ type: 'ESTIMATE_READY', record: r, entryNo: t.entryNo, key: `ready:${value}` });
      } else {
        events.push({ type: 'FIELD_CHANGED', record: r, entryNo: t.entryNo, key: `field:${field}:${value}`, payload: { field, value, before } });
        if (r.type === 'LEAD' && field === 'appointmentAt' && value) {
          events.push({ type: 'APPOINTMENT_BOOKED', record: r, entryNo: t.entryNo, key: `appt:${value}`, payload: { change: before ? 'CHANGED' : 'BOOKED' } });
        }
      }
    }
    t.fields = fields;
    if (r.type === 'INVOICE' && (r.paid ?? 0) > (t.paid ?? 0) + 0.004) {
      const inv = db.invoices.find((i) => i.id === r.id)!;
      const kinds = ['ANY'];
      const dueDeposit = inv.automationType === 'deposit' ? inv.amount : inv.depositDue;
      if (dueDeposit && (t.paid ?? 0) < dueDeposit - 0.004 && (r.paid ?? 0) >= dueDeposit - 0.004) kinds.push('DEPOSIT');
      if (r.stage === 'PAID') kinds.push('FULL');
      events.push({ type: 'PAYMENT_RECORDED', record: r, entryNo: t.entryNo, key: `pay:${r.paid}`, payload: { kinds } });
    }
    t.paid = r.paid;
  }
  for (const req of db.touchUpRequests) {
    if (s.touchUpsSeen.includes(req.id)) continue;
    s.touchUpsSeen.push(req.id);
    const job = [...db.jobs].filter((j) => j.propertyId === req.propertyId && j.status === 'completed').pop();
    const r = job ? recordOf(db, 'JOB', job.id, now) : undefined;
    if (r) events.push({ type: 'TOUCH_UP_SUBMITTED', record: r, entryNo: s.tracks[recordKey('JOB', job!.id)]?.entryNo ?? 1, key: `touchup:${req.id}`, payload: { requestId: req.id } });
  }
  return events;
}

function triggerMatches(def: AutomationDefinition, e: EngineEvent): boolean {
  const t = def.trigger;
  if (pipelineOf(t.module) !== e.record.type) return false;
  if (t.type !== e.type) return false;
  const c = t.config;
  switch (t.type) {
    case 'STAGE_ENTERED': return c.stage === e.stage;
    case 'FIELD_CHANGED': return c.field === e.payload?.field && (!c.value || String(c.value) === String(e.payload?.value));
    case 'APPOINTMENT_BOOKED': return !c.change || c.change === 'ANY' || c.change === e.payload?.change;
    case 'PAYMENT_RECORDED': return ((e.payload?.kinds as string[]) ?? []).includes(String(c.which ?? 'ANY'));
    default: return true;
  }
}

/** Time-based triggers: a record has been in a stage for a set time, a date is near, years since completion. */
function timeEvents(s: EngineState, db: FDb, now: Date): { automation: Automation; event: EngineEvent }[] {
  const out: { automation: Automation; event: EngineEvent }[] = [];
  const timed = s.automations.filter((a) => isLive(a) && ['STAGE_DURATION', 'DATE_RELATIVE', 'TIME_SINCE_COMPLETION'].includes(liveDefinition(s, a).trigger.type));
  if (!timed.length) return out;
  const records = allRecords(db, now);
  for (const a of timed) {
    const def = liveDefinition(s, a);
    const pipeline = pipelineOf(def.trigger.module);
    const deployed = Date.parse(a.deployedAt!);
    const c = def.trigger.config;
    for (const r of records) {
      if (r.type !== pipeline) continue;
      const t = s.tracks[recordKey(r.type, r.id)];
      if (!t) continue;
      let due: number | undefined;
      let key = '';
      if (def.trigger.type === 'STAGE_DURATION') {
        if (r.stage !== c.stage) continue;
        due = Date.parse(t.enteredAt) + Number(c.days ?? 0) * 24 * HOUR;
        key = `dur:${t.entryNo}`;
      } else if (def.trigger.type === 'DATE_RELATIVE') {
        const date = r.dates[String(c.dateField)];
        if (!date) continue;
        const ms = Number(c.amount ?? 0) * (c.unit === 'HOURS' ? HOUR : 24 * HOUR);
        due = Date.parse(date) + (c.direction === 'AFTER' ? ms : -ms);
        key = `date:${String(c.dateField)}:${date}`;
      } else {
        const date = r.dates.completedAt;
        if (!date || r.stage !== 'COMPLETED') continue;
        const d = new Date(date);
        d.setMonth(d.getMonth() + Number(c.months ?? 0));
        due = d.getTime();
        key = `done:${date}`;
      }
      // Only moments after deploy: switching an automation on never floods old records.
      if (due === undefined || due > now.getTime() || due < deployed) continue;
      out.push({ automation: a, event: { type: def.trigger.type, record: r, entryNo: t.entryNo, stage: r.stage, key } });
    }
  }
  return out;
}

/* ---------- 3. Starting runs ---------- */

const STAGE_TRIGGERS = ['STAGE_ENTERED', 'STAGE_DURATION'];

export function startRun(s: EngineState, db: FDb, a: Automation, e: EngineEvent, env: EngineEnv, opts: { force?: boolean } = {}): AutomationRun | undefined {
  const def = liveDefinition(s, a);
  const rk = recordKey(e.record.type, e.record.id);
  const firedKey = `${a.id}|${rk}|${e.key}`;
  if (!opts.force && s.fired[firedKey]) return undefined;
  const values = conditionValues(s, db, e.record, env.now);
  if (def.conditions.some((c) => !conditionHolds(c, values))) {
    s.fired[firedKey] = env.now.toISOString();
    return undefined;
  }
  s.fired[firedKey] = env.now.toISOString();
  const journey = s.journeys.find((j) => j.id === a.journeyId);
  const at = env.now.toISOString();
  const steps = [...def.steps].sort((x, y) => x.order - y.order);
  const run: AutomationRun = {
    id: nextId(s, 'RUN-'), automationId: a.id, automationName: a.name, journeyName: journey?.name, journeyId: journey?.id, recordType: e.record.type,
    recordId: e.record.id, recordLabel: e.record.label, status: 'WAITING', startedAt: at, updatedAt: at, cursor: 0, entryNo: e.entryNo,
    stage: STAGE_TRIGGERS.includes(def.trigger.type) ? e.stage : undefined, keepGoingIfStageChanges: def.keepGoingIfStageChanges, eventKey: e.key,
    definition: steps, stepStartedAt: at,
    steps: steps.map((st) => ({ stepId: st.id, title: stepDef(st.type)?.title ?? st.type, status: 'PENDING' as RunStepStatus, message: '' })),
  };
  // Loop guard: 5 automations on one record within a minute is a loop.
  const recent = (s.loopGuard[rk] ?? []).filter((t) => env.now.getTime() - Date.parse(t) < MINUTE);
  if (recent.length >= 5 && !env.dryRun) {
    run.status = 'FAILED';
    run.steps.forEach((st) => { st.status = 'SKIPPED'; st.message = 'Not run.'; });
    if (run.steps[0]) { run.steps[0].status = 'FAILED'; run.steps[0].message = 'Failed: Stopped to prevent a loop.'; run.steps[0].at = at; }
    s.runs.unshift(run);
    notifyFailure(s, db, a, run, e.record, 'Stopped to prevent a loop.');
    return run;
  }
  s.loopGuard[rk] = [...recent, at];
  if (s.paused[rk]) run.pausedAt = s.paused[rk];
  s.runs.unshift(run);
  return run;
}

/* ---------- 4. Moving runs along ---------- */

function notifyFailure(s: EngineState, db: FDb, a: Automation, run: AutomationRun, r: RecordView, message: string) {
  const step = run.steps[run.cursor];
  const key = `${run.id}|${step?.stepId ?? ''}|${run.retries ?? 0}`;
  if (s.failureNotices[key]) return;
  s.failureNotices[key] = new Date().toISOString();
  tell(db, [...ownerIds(db), a.createdBy, r.assignedUserId], {
    title: `Automation step failed: ${step?.title ?? a.name}`, body: `${r.label} · ${message.replace(/^Failed: /, '')}`, href: `/automations?tab=activity&run=${run.id}`, automationKind: 'STEP_FAILED',
  });
}

function reviewKind(type: string): ReviewItem['kind'] {
  if (type === 'SEND_EMAIL') return 'CUSTOMER_EMAIL';
  if (type === 'SEND_TEXT') return 'CUSTOMER_SMS';
  if (type === 'SEND_ESTIMATE') return 'SEND_ESTIMATE';
  if (type === 'SEND_INVOICE') return 'SEND_INVOICE';
  return 'BUSINESS_STEP';
}

/** Reviewers: the owner, the automation's creator and everyone with AUTOMATION_REVIEW (spec 6.12). */
export function reviewerIds(db: FDb, a: Pick<Automation, 'createdBy'>): string[] {
  return Array.from(new Set([...ownerIds(db), a.createdBy, ...db.users.filter((u) => can(u, 'automation.review')).map((u) => u.id)])).filter((id) => db.users.some((u) => u.id === id));
}

function previewFor(s: EngineState, db: FDb, env: EngineEnv, a: Automation, step: AutomationStep, r: RecordView, names: NameLookup): Record<string, unknown> {
  const values = variableValues(db, r, env);
  const msg = typeof step.config.messageId === 'string' ? env.messages.find((m) => m.id === step.config.messageId) : undefined;
  const customer = db.customers.find((c) => c.id === r.customerId);
  const fill = (t?: string) => (t ?? '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k: string) => values[k] ?? '');
  return {
    summary: stepPhrase(step, names), to: msg?.channel === 'SMS' ? customer?.phone : customer?.email, customerName: customer?.name,
    subject: msg?.subject ? fill(msg.subject) : undefined, body: msg ? fill(msg.body) : undefined, messageId: msg?.id, record: r.label, automation: a.name,
  };
}

function finishRun(run: AutomationRun, status: AutomationRun['status'], at: string) {
  run.status = status;
  run.waitUntil = undefined;
  run.waitingFor = undefined;
  run.updatedAt = at;
}

function stopRest(run: AutomationRun, from: number, message: string) {
  for (let i = from; i < run.steps.length; i++) if (run.steps[i]!.status === 'PENDING' || run.steps[i]!.status === 'WAITING' || run.steps[i]!.status === 'WAITING_FOR_REVIEW') {
    run.steps[i]!.status = 'SKIPPED';
    run.steps[i]!.message = message;
  }
}

/** Move one run as far as it can go now. */
export function advanceRun(s: EngineState, db: FDb, run: AutomationRun, env: EngineEnv, names: NameLookup): void {
  if (run.pausedAt || !['WAITING', 'WAITING_FOR_REVIEW'].includes(run.status)) return;
  const a = s.automations.find((x) => x.id === run.automationId);
  const at = env.now.toISOString();
  if (!a || a.isDeleted) {
    stopRest(run, run.cursor, 'Not run: the automation was deleted.');
    finishRun(run, 'SKIPPED', at);
    return;
  }
  const r = recordOf(db, run.recordType, run.recordId, env.now);
  if (!r) {
    stopRest(run, run.cursor, 'Not run: the record was deleted.');
    finishRun(run, 'SKIPPED', at);
    return;
  }
  // The record left the stage while the run was waiting: stop, unless told to keep going.
  const track = s.tracks[recordKey(run.recordType, run.recordId)];
  if (run.stage && !run.keepGoingIfStageChanges && track && track.entryNo !== run.entryNo && run.waitingFor) {
    stopRest(run, run.cursor, `Skipped: the record left ${stageLabel(run.recordType, run.stage)}.`);
    finishRun(run, 'SKIPPED', at);
    return;
  }
  const actor = actorFor(s, db, a);
  for (let guard = 0; guard < 40; guard++) {
    if (run.cursor >= run.definition.length) {
      finishRun(run, 'DONE', at);
      return;
    }
    const step = run.definition[run.cursor]!;
    const rs = run.steps[run.cursor]!;
    const def = stepDef(step.type);
    run.stepStartedAt ??= at;
    // Delay before this step.
    if (step.delay && step.delay.amount > 0) {
      const due = addTime(run.stepStartedAt, step.delay.amount, step.delay.unit, step.delay.workingDaysOnly ? s.settings.workingDays : undefined);
      if (env.now.getTime() < Date.parse(due)) {
        rs.status = 'WAITING';
        rs.message = `Waiting until ${fmtDate(due)} (delay before this step).`;
        run.status = 'WAITING';
        run.waitUntil = due;
        run.waitingFor = rs.message;
        run.updatedAt = at;
        return;
      }
    }
    const current = recordOf(db, run.recordType, run.recordId, env.now) ?? r;
    // "Only if" for this step alone.
    const failing = failingCondition(step.conditions, conditionValues(s, db, current, env.now));
    if (failing) {
      rs.status = 'SKIPPED';
      rs.message = `Skipped: only if ${conditionPhrase(failing, names)}.`;
      rs.at = at;
      run.cursor += 1;
      run.stepStartedAt = at;
      run.waitUntil = undefined;
      continue;
    }
    // "Ask me first".
    if (step.mode === 'ASK' && def?.mode !== 'AUTO_ONLY' && !run.approvedSteps?.includes(step.id)) {
      if (env.dryRun) {
        rs.status = 'WAITING_FOR_REVIEW';
        rs.message = 'Would wait for review, then run once approved.';
        rs.at = at;
        run.approvedSteps = [...(run.approvedSteps ?? []), step.id];
        continue;
      }
      if (!s.reviews.some((v) => v.runId === run.id && v.stepId === step.id && v.status === 'WAITING')) {
        const item: ReviewItem = {
          id: nextId(s, 'REV-'), runId: run.id, stepId: step.id, automationId: a.id, kind: reviewKind(step.type), title: stepPhrase(step, names).replace(/^./, (x) => x.toUpperCase()),
          recordType: run.recordType, recordId: run.recordId, customerId: r.customerId, automationCreatedBy: a.createdBy, preview: previewFor(s, db, env, a, step, r, names),
          createdAt: at, status: 'WAITING',
        };
        s.reviews.unshift(item);
        tell(db, reviewerIds(db, a), { title: `Waiting for review: ${item.title}`, body: `${r.label} · ${a.name}`, href: `/automations?tab=review&item=${item.id}`, automationKind: 'REVIEW_WAITING', reviewItemId: item.id });
      }
      rs.status = 'WAITING_FOR_REVIEW';
      rs.message = 'Waiting for review.';
      run.status = 'WAITING_FOR_REVIEW';
      run.waitingFor = 'Waiting for review.';
      run.updatedAt = at;
      return;
    }
    // Once only.
    const onceKey = `${a.id}|${step.id}|${recordKey(run.recordType, run.recordId)}|${run.entryNo}|${run.eventKey ?? ''}`;
    let res: ExecResult;
    if (s.executed[onceKey] && def?.oncePerRecord) {
      res = { status: 'SKIPPED', message: 'Skipped: already done for this record.' };
    } else {
      res = execute({ s, db, env, run, step, automation: a, actor, record: current });
    }
    if (res.status === 'WAIT') {
      rs.status = 'WAITING';
      rs.message = res.message;
      run.status = 'WAITING';
      run.waitUntil = res.waitUntil;
      run.waitingFor = res.message;
      run.updatedAt = at;
      return;
    }
    rs.message = res.message;
    rs.at = at;
    if (res.createdRecordId) rs.createdRecordId = res.createdRecordId;
    if (res.status === 'FAILED') {
      rs.status = 'FAILED';
      finishRun(run, 'FAILED', at);
      a.problemCount = (a.problemCount ?? 0) + 1;
      if (!env.dryRun) notifyFailure(s, db, a, run, current, res.message);
      return;
    }
    if (res.status === 'STOP') {
      rs.status = 'SKIPPED';
      stopRest(run, run.cursor + 1, 'Not run: the flow stopped.');
      finishRun(run, 'SKIPPED', at);
      return;
    }
    rs.status = res.status === 'DONE' ? 'DONE' : 'SKIPPED';
    if (res.status === 'DONE') s.executed[onceKey] = at;
    if (res.movedTriggerRecord) run.stage = undefined;
    run.cursor += 1;
    run.stepStartedAt = at;
    run.waitUntil = undefined;
    run.limitPassed = undefined;
  }
}

/* ---------- 5. Stuck alerts and sending notices ---------- */

export function stuckSettingFor(s: EngineState, pipeline: PipelineModule, stage: string) {
  const o = s.stuck[pipeline]?.[stage];
  if (o) return o;
  const d = STUCK_ALERT_DEFAULTS[pipeline]?.[stage];
  if (!d || stagesOf(pipeline).find((x) => x.value === stage)?.terminal) return undefined;
  return { hours: d.hours, from: d.from, enabled: true };
}

function multiplierFor(s: EngineState, rk: string): number {
  const run = s.runs.find((x) => recordKey(x.recordType, x.recordId) === rk && x.journeyId);
  return s.journeys.find((j) => j.id === run?.journeyId)?.stuckMultiplier ?? 1;
}

function stuckAlerts(s: EngineState, db: FDb, now: Date) {
  // Silent until the business uses automations.
  if (!s.automations.some(isLive)) return;
  const since = Date.parse(s.baselinedAt ?? now.toISOString());
  for (const r of allRecords(db, now)) {
    const rk = recordKey(r.type, r.id);
    const t = s.tracks[rk];
    const set = stuckSettingFor(s, r.type, r.stage);
    if (!t || !set?.enabled) continue;
    const anchor = set.from === 'STAGE_ENTRY' ? t.enteredAt : r.dates[set.from];
    if (!anchor) continue;
    const hours = set.hours * multiplierFor(s, rk);
    const due = hours % 24 === 0 && s.settings.stuckWorkingDaysOnly ? addTime(anchor, hours / 24, 'DAYS', s.settings.workingDays) : addTime(anchor, hours, 'HOURS');
    const dueMs = Date.parse(due);
    if (dueMs > now.getTime() || dueMs < since) continue;
    const key = `${rk}|${t.entryNo}`;
    const sent = s.stuckSent[key];
    if (sent && (sent.count >= 3 || now.getTime() - Date.parse(sent.lastAt) < 24 * HOUR)) continue;
    const to = r.assignedUserId && db.users.some((u) => u.id === r.assignedUserId) ? [r.assignedUserId] : ownerIds(db);
    tell(db, to, { title: `Stuck: ${r.label} is still ${stageLabel(r.type, r.stage)}`, body: `In this stage since ${fmtDate(t.enteredAt)}. Alert ${(sent?.count ?? 0) + 1} of 3.`, href: recordHref(r.type, r.id), automationKind: 'STUCK_ALERT' });
    s.stuckSent[key] = { count: (sent?.count ?? 0) + 1, lastAt: now.toISOString() };
  }
}

function capacityNotices(s: EngineState, db: FDb, now: Date) {
  const month = now.toISOString().slice(0, 7);
  for (const channel of ['email', 'sms'] as const) {
    const cap = capacityCheck(s, channel, now);
    if (!cap.limit) continue;
    for (const pct of [80, 100]) {
      const key = `${month}:${channel}:${pct}`;
      if (s.capacityNotices[key] || cap.usedThisMonth < (cap.limit * pct) / 100) continue;
      s.capacityNotices[key] = now.toISOString();
      const word = channel === 'email' ? 'emails' : 'texts';
      tell(db, ownerIds(db), { title: `You've used ${pct}% of this month's ${word} (${cap.usedThisMonth.toLocaleString()} of ${cap.limit.toLocaleString()})`, body: pct === 100 ? 'New messages wait in the send queue until next month or a bigger plan.' : 'Messages over the limit will wait in the queue.', href: '/automations?tab=activity', automationKind: 'SENDING_CAPACITY' });
    }
  }
}

/* ---------- The tick ---------- */

const PRIORITY = { REPLY: 0, DOCUMENT: 1, REMINDER: 2, OTHER: 3 } as const;

function runPriority(s: EngineState, env: EngineEnv, run: AutomationRun): number {
  const step = run.definition[run.cursor];
  const def = step && stepDef(step.type);
  if (!def?.customerFacing) return -1;
  if (def.sendPriority) return PRIORITY[def.sendPriority];
  const msg = env.messages.find((m) => m.id === step!.config.messageId);
  return PRIORITY[msg?.category ?? 'OTHER'];
}

export function tick(s: EngineState, db: FDb, env: EngineEnv, names: NameLookup): void {
  const events = detectEvents(s, db, env.now);
  const live = s.automations.filter(isLive).sort((x, y) => x.runOrder - y.runOrder);
  for (const e of events) {
    for (const a of live) if (triggerMatches(liveDefinition(s, a), e)) startRun(s, db, a, e, env);
  }
  for (const { automation, event } of timeEvents(s, db, env.now)) startRun(s, db, automation, event, env);
  // Every waiting run is looked at each tick: a condition may have come true before its time limit.
  const waiting = s.runs.filter((r) => r.status === 'WAITING' && !r.pausedAt).sort((x, y) => runPriority(s, env, x) - runPriority(s, env, y));
  for (const run of waiting) advanceRun(s, db, run, env, names);
  stuckAlerts(s, db, env.now);
  capacityNotices(s, db, env.now);
  // Activity counts on each automation.
  const weekAgo = env.now.getTime() - 7 * 24 * HOUR;
  for (const a of s.automations) {
    a.runsLast7Days = s.runs.filter((r) => r.automationId === a.id && Date.parse(r.startedAt) >= weekAgo).length;
    a.problemCount = s.runs.filter((r) => r.automationId === a.id && r.status === 'FAILED').length;
  }
}

/* ---------- Reviews, retries and journey controls ---------- */

export function approveReview(s: EngineState, db: FDb, reviewId: string, by: User, edits: Record<string, unknown> | undefined, env: EngineEnv, names: NameLookup): { ok: boolean; error?: string } {
  const item = s.reviews.find((v) => v.id === reviewId);
  if (!item) return { ok: false, error: 'This item is gone.' };
  if (item.status !== 'WAITING') return { ok: false, error: `Already ${item.status === 'APPROVED' ? 'approved' : 'skipped'} by ${db.users.find((u) => u.id === item.decidedBy)?.name ?? 'someone'}.` };
  const run = s.runs.find((r) => r.id === item.runId);
  if (!run) return { ok: false, error: 'The run is gone.' };
  item.status = 'APPROVED';
  item.decidedBy = by.id;
  item.decidedAt = env.now.toISOString();
  run.approvedSteps = [...(run.approvedSteps ?? []), item.stepId];
  if (edits && Object.keys(edits).length) run.overrides = { ...(run.overrides ?? {}), [item.stepId]: { ...(run.overrides?.[item.stepId] ?? {}), ...edits } };
  run.status = 'WAITING';
  run.waitingFor = undefined;
  advanceRun(s, db, run, env, names);
  return { ok: true };
}

/** Does any later step depend on this one (it creates a record a later step works on)? */
export function laterStepsDepend(run: AutomationRun, stepId: string): boolean {
  const i = run.definition.findIndex((d) => d.id === stepId);
  const def = stepDef(run.definition[i]?.type ?? '');
  if (!def?.createsRecord) return false;
  return run.definition.slice(i + 1).some((d) => stepDef(d.type)?.worksOn.includes(def.createsRecord!));
}

export function skipReview(s: EngineState, db: FDb, reviewId: string, by: User, reason: string, env: EngineEnv, names: NameLookup): { ok: boolean; error?: string } {
  const item = s.reviews.find((v) => v.id === reviewId);
  if (!item) return { ok: false, error: 'This item is gone.' };
  if (item.status !== 'WAITING') return { ok: false, error: 'Someone already decided this item.' };
  if (!reason.trim()) return { ok: false, error: 'Pick a reason.' };
  const run = s.runs.find((r) => r.id === item.runId);
  item.status = 'SKIPPED';
  item.decidedBy = by.id;
  item.decidedAt = env.now.toISOString();
  item.skipReason = reason;
  if (!run) return { ok: true };
  const i = run.definition.findIndex((d) => d.id === item.stepId);
  const rs = run.steps[i];
  if (rs) {
    rs.status = 'SKIPPED';
    rs.message = `Skipped by ${by.name}: ${reason}.`;
    rs.at = env.now.toISOString();
  }
  if (laterStepsDepend(run, item.stepId)) {
    stopRest(run, i + 1, 'Not run: a step it depends on was skipped.');
    finishRun(run, 'SKIPPED', env.now.toISOString());
    return { ok: true };
  }
  run.cursor = i + 1;
  run.stepStartedAt = env.now.toISOString();
  run.status = 'WAITING';
  run.waitingFor = undefined;
  advanceRun(s, db, run, env, names);
  return { ok: true };
}

/** "Try again": the failed step and the ones after it. Once-keys stop anything running twice. */
export function retryRun(s: EngineState, db: FDb, runId: string, env: EngineEnv, names: NameLookup): { ok: boolean; error?: string } {
  const run = s.runs.find((r) => r.id === runId);
  if (!run) return { ok: false, error: 'This run is gone.' };
  if (run.status !== 'FAILED') return { ok: false, error: 'Only a failed run can be tried again.' };
  const rs = run.steps[run.cursor];
  if (rs) {
    rs.status = 'PENDING';
    rs.message = '';
  }
  for (const st of run.steps.slice(run.cursor + 1)) if (st.status === 'SKIPPED' && st.message === 'Not run.') { st.status = 'PENDING'; st.message = ''; }
  run.retries = (run.retries ?? 0) + 1;
  run.status = 'WAITING';
  run.stepStartedAt = env.now.toISOString();
  advanceRun(s, db, run, env, names);
  return { ok: true };
}

export function dismissRun(s: EngineState, runId: string, at: string) {
  const run = s.runs.find((r) => r.id === runId);
  if (!run || run.status !== 'FAILED') return;
  stopRest(run, run.cursor + 1, 'Not run: dismissed.');
  finishRun(run, 'SKIPPED', at);
  const rs = run.steps[run.cursor];
  if (rs) rs.message = `${rs.message} (dismissed)`;
}

/** Records linked to this one (lead, estimate, job, work order, invoices). */
export function linkedKeys(db: FDb, type: PipelineModule, id: string, now: Date): string[] {
  const r = recordOf(db, type, id, now);
  if (!r) return [recordKey(type, id)];
  const keys = [recordKey(type, id)];
  if (r.leadId) keys.push(recordKey('LEAD', r.leadId));
  if (r.estimateId) keys.push(recordKey('ESTIMATE', r.estimateId));
  if (r.jobId) keys.push(recordKey('JOB', r.jobId));
  if (r.workOrderId) keys.push(recordKey('WORK_ORDER', r.workOrderId));
  for (const i of r.invoiceIds) keys.push(recordKey('INVOICE', i));
  return Array.from(new Set(keys));
}

const activeRun = (r: AutomationRun) => r.status === 'WAITING' || r.status === 'WAITING_FOR_REVIEW' || r.status === 'PAUSED';

export function pauseRecord(s: EngineState, db: FDb, type: PipelineModule, id: string, at: string) {
  for (const k of linkedKeys(db, type, id, new Date(at))) {
    s.paused[k] = at;
    for (const r of s.runs) if (recordKey(r.recordType, r.recordId) === k && activeRun(r)) r.pausedAt = at;
  }
}

export function resumeRecord(s: EngineState, db: FDb, type: PipelineModule, id: string, env: EngineEnv, names: NameLookup) {
  for (const k of linkedKeys(db, type, id, env.now)) {
    delete s.paused[k];
    // Steps whose time passed during the pause run straight away, once.
    for (const r of s.runs) if (recordKey(r.recordType, r.recordId) === k && r.pausedAt) { r.pausedAt = undefined; advanceRun(s, db, r, env, names); }
  }
}

export function stopRecord(s: EngineState, db: FDb, type: PipelineModule, id: string, by: User, at: string) {
  for (const k of linkedKeys(db, type, id, new Date(at))) {
    delete s.paused[k];
    for (const r of s.runs) if (recordKey(r.recordType, r.recordId) === k && activeRun(r)) {
      stopRest(r, r.cursor, `Stopped for this job by ${by.name}.`);
      s.reviews.filter((v) => v.runId === r.id && v.status === 'WAITING').forEach((v) => { v.status = 'SKIPPED'; v.skipReason = 'Journey stopped'; v.decidedBy = by.id; v.decidedAt = at; });
      finishRun(r, 'SKIPPED', at);
      r.pausedAt = undefined;
    }
  }
}

/** "Start a journey": runs every live automation of the journey whose stage this record is at now. */
export function startJourneyFor(s: EngineState, db: FDb, journeyId: string, type: PipelineModule, id: string, env: EngineEnv, names: NameLookup): number {
  const r = recordOf(db, type, id, env.now);
  const journey = s.journeys.find((j) => j.id === journeyId);
  if (!r || !journey) return 0;
  let n = 0;
  for (const a of s.automations.filter((x) => x.journeyId === journeyId && isLive(x))) {
    const p = boardPlacement(liveDefinition(s, a).trigger);
    if (p.pipeline !== type || p.stage !== r.stage || p.timed) continue;
    const t = s.tracks[recordKey(type, id)];
    const run = startRun(s, db, a, { type: liveDefinition(s, a).trigger.type, record: r, entryNo: t?.entryNo ?? 1, stage: r.stage, key: `manual:${env.now.toISOString()}` }, env);
    if (run) { advanceRun(s, db, run, env, names); n++; }
  }
  return n;
}

/* ---------- Journey card ---------- */

export function recordJourney(s: EngineState, db: FDb, type: PipelineModule, id: string, now: Date) {
  const keys = new Set(linkedKeys(db, type, id, now));
  const runs = s.runs.filter((r) => keys.has(recordKey(r.recordType, r.recordId))).sort((x, y) => x.startedAt.localeCompare(y.startedAt));
  const journeyRun = [...runs].reverse().find((r) => r.journeyId);
  const done = runs.flatMap((r) => r.steps.filter((st) => st.status === 'DONE' && st.at).map((st) => ({ title: st.title, message: st.message, at: st.at!, runId: r.id }))).sort((x, y) => x.at.localeCompare(y.at));
  const open = runs.filter((r) => r.status === 'WAITING' || r.status === 'WAITING_FOR_REVIEW');
  const nextRun = open.find((r) => r.status === 'WAITING_FOR_REVIEW') ?? open.sort((x, y) => (x.waitUntil ?? '').localeCompare(y.waitUntil ?? ''))[0];
  const nextStep = nextRun ? nextRun.steps[nextRun.cursor] : undefined;
  const reviewer = nextRun?.status === 'WAITING_FOR_REVIEW' ? s.reviews.find((v) => v.runId === nextRun.id && v.status === 'WAITING') : undefined;
  return {
    journeyId: journeyRun?.journeyId,
    journeyName: journeyRun?.journeyName,
    isPaused: [...keys].some((k) => s.paused[k]),
    done,
    next: nextStep ? { title: nextStep.title, waitingFor: reviewer ? 'Waiting for review.' : nextRun!.waitingFor ?? 'Running.', runId: nextRun!.id, reviewId: reviewer?.id, stepId: nextStep.stepId, automationId: nextRun!.automationId } : undefined,
    problems: runs.filter((r) => r.status === 'FAILED').map((r) => ({ message: r.steps[r.cursor]?.message ?? 'Failed', runId: r.id, automationId: r.automationId, stepId: r.steps[r.cursor]?.stepId })),
    runs,
  };
}

/* ---------- Test run ---------- */

interface HistoryPoint { at: string; type: PipelineModule; id: string; apply: (s: EngineState) => EngineEvent[] }

/**
 * Plays automations against a past record's real history on copies of the
 * data (spec section 10, "Test run"). Nothing is created and nothing is
 * sent: every action runs on throwaway copies, so the result shows what
 * would have happened, including once-only skips and missing prerequisites.
 */
export function testRun(automations: Automation[], s0: EngineState, db0: FDb, type: PipelineModule, id: string, env0: EngineEnv, names: NameLookup): TestRunResult {
  const db = JSON.parse(JSON.stringify(db0)) as FDb;
  const s: EngineState = { ...emptyState(), ...JSON.parse(JSON.stringify({ ...s0, runs: [], reviews: [], fired: {}, executed: {}, sent: [], loopGuard: {}, paused: {} })) };
  const nowIso = env0.now.toISOString();
  const r0 = recordOf(db, type, id, env0.now);
  if (!r0) return { recordLabel: 'Record not found', timeline: [] };
  const keys = linkedKeys(db, type, id, env0.now);
  const points: HistoryPoint[] = [];
  const add = (at: string | undefined, rt: PipelineModule, rid: string, evs: (rec: RecordView) => Omit<EngineEvent, 'record'>[]) => {
    if (!at) return;
    points.push({ at, type: rt, id: rid, apply: () => { const rec = recordOf(db, rt, rid, env0.now); return rec ? evs(rec).map((e) => ({ ...e, record: rec })) : []; } });
  };
  for (const k of keys) {
    const [rt, rid] = k.split(':') as [PipelineModule, string];
    const rec = recordOf(db, rt, rid, env0.now);
    if (!rec) continue;
    if (rt === 'LEAD') {
      const l = db.leads.find((x) => x.id === rid)!;
      add(l.createdAt, rt, rid, () => [{ type: 'RECORD_CREATED', entryNo: 1, key: 'created' }, { type: 'STAGE_ENTERED', entryNo: 1, stage: 'NEW', key: 'stage:1' }]);
      if (l.scheduledAt) add(new Date(Math.min(Date.parse(l.scheduledAt), Date.parse(l.createdAt) + HOUR)).toISOString(), rt, rid, () => [{ type: 'STAGE_ENTERED', entryNo: 2, stage: 'SCHEDULED', key: 'stage:2' }, { type: 'APPOINTMENT_BOOKED', entryNo: 2, key: 'appt', payload: { change: 'BOOKED' } }]);
      if (rec.stage !== 'NEW' && rec.stage !== 'SCHEDULED') add(l.lastActivityAt ?? l.createdAt, rt, rid, (x) => [{ type: 'STAGE_ENTERED', entryNo: 3, stage: x.stage, key: 'stage:3' }]);
    }
    if (rt === 'ESTIMATE') {
      const e = db.estimates.find((x) => x.id === rid)!;
      add(e.createdAt, rt, rid, () => [{ type: 'RECORD_CREATED', entryNo: 1, key: 'created' }, { type: 'STAGE_ENTERED', entryNo: 1, stage: 'DRAFT', key: 'stage:1' }]);
      if (e.sentAt) add(e.sentAt, rt, rid, () => [{ type: 'ESTIMATE_READY', entryNo: 1, key: 'ready' }, { type: 'STAGE_ENTERED', entryNo: 2, stage: 'SENT', key: 'stage:2' }]);
      if (e.viewedAt) add(e.viewedAt, rt, rid, () => [{ type: 'STAGE_ENTERED', entryNo: 3, stage: 'VIEWED', key: 'stage:3' }, { type: 'ESTIMATE_VIEWED', entryNo: 3, key: 'viewed' }]);
      if (e.acceptedAt) add(e.acceptedAt, rt, rid, () => [{ type: 'STAGE_ENTERED', entryNo: 4, stage: 'ACCEPTED', key: 'stage:4' }, { type: 'ESTIMATE_SIGNED', entryNo: 4, key: 'signed' }]);
    }
    if (rt === 'WORK_ORDER') {
      const w = db.workOrders.find((x) => x.id === rid)!;
      w.statusHistory.forEach((h, i) => add(h.at, rt, rid, () => [{ type: 'STAGE_ENTERED', entryNo: i + 1, stage: h.to, key: `stage:${i + 1}` }]));
    }
    if (rt === 'INVOICE') {
      const inv = db.invoices.find((x) => x.id === rid)!;
      add(inv.createdAt, rt, rid, () => [{ type: 'RECORD_CREATED', entryNo: 1, key: 'created' }, { type: 'STAGE_ENTERED', entryNo: 1, stage: 'DRAFT', key: 'stage:1' }]);
      if (inv.sentAt) add(inv.sentAt, rt, rid, () => [{ type: 'STAGE_ENTERED', entryNo: 2, stage: 'SENT', key: 'stage:2' }]);
      let paid = 0;
      for (const p of inv.payments ?? []) {
        const before = paid;
        paid += p.amount;
        const after = paid;
        add(p.at, rt, rid, () => {
          const kinds = ['ANY'];
          if (inv.depositDue && before < inv.depositDue && after >= inv.depositDue - 0.004) kinds.push('DEPOSIT');
          if (after >= inv.amount - 0.004) kinds.push('FULL');
          return [{ type: 'PAYMENT_RECORDED', entryNo: 3, key: `pay:${after}`, payload: { kinds } }, ...(after >= inv.amount - 0.004 ? [{ type: 'STAGE_ENTERED', entryNo: 4, stage: 'PAID', key: 'stage:4' }] : [])];
        });
      }
    }
    if (rt === 'JOB') {
      const j = db.jobs.find((x) => x.id === rid)!;
      add(j.contractSignedAt, rt, rid, () => [{ type: 'RECORD_CREATED', entryNo: 1, key: 'created' }, { type: 'STAGE_ENTERED', entryNo: 1, stage: 'CONFIRMED', key: 'stage:1' }]);
      if (j.closedAt) add(j.closedAt, rt, rid, () => [{ type: 'STAGE_ENTERED', entryNo: 9, stage: 'COMPLETED', key: 'stage:9' }]);
    }
  }
  points.sort((x, y) => x.at.localeCompare(y.at));
  s.baselinedAt = points[0]?.at ?? nowIso;
  for (const k of keys) {
    const [rt, rid] = k.split(':') as [PipelineModule, string];
    const rec = recordOf(db, rt, rid, env0.now);
    if (rec) s.tracks[k] = { stage: rec.stage, entryNo: 1, enteredAt: rec.createdAt ?? nowIso, fields: rec.fields, paid: rec.paid };
  }
  // Every automation in scope counts as deployed and on for the test.
  s.automations = automations.map((a) => ({ ...JSON.parse(JSON.stringify(a)), isEnabled: true, deployedAt: s.baselinedAt, approvalId: a.approvalId ?? 'TEST', needsReapproval: false, isArchived: false, isDeleted: false }));
  if (!s.approvals.some((x) => x.id === 'TEST')) s.approvals.push({ id: 'TEST', automationId: '', approvedBy: db.users.find((u) => u.role === 'owner')?.id ?? '', approvedAt: s.baselinedAt!, customerFacingSteps: [], snapshot: { trigger: automations[0]?.trigger ?? { type: '', module: 'LEAD', config: {} }, conditions: [], steps: [] } });
  s.readyEstimates = { ...s.readyEstimates };
  for (const e of db.estimates) if (e.sentAt) s.readyEstimates[e.id] = e.sentAt;
  const live = s.automations.sort((x, y) => x.runOrder - y.runOrder);
  for (const p of points) {
    const env = { ...env0, now: new Date(p.at), dryRun: true };
    for (const e of p.apply(s)) {
      const t = s.tracks[recordKey(e.record.type, e.record.id)];
      if (t && e.stage) { t.stage = e.stage; t.entryNo = e.entryNo; t.enteredAt = p.at; }
      for (const a of live) if (triggerMatches(liveDefinition(s, a), e)) startRun(s, db, a, e, env);
    }
    for (const run of s.runs.filter((r) => r.status === 'WAITING')) advanceRun(s, db, run, env, names);
  }
  const endEnv = { ...env0, dryRun: true };
  for (const { automation, event } of timeEvents(s, db, env0.now)) startRun(s, db, automation, event, endEnv);
  for (let i = 0; i < 3; i++) for (const run of s.runs.filter((r) => r.status === 'WAITING')) advanceRun(s, db, run, endEnv, names);
  const timeline: TestRunResult['timeline'] = [];
  for (const run of [...s.runs].reverse()) {
    for (const st of run.steps) {
      if (st.status === 'PENDING') continue;
      timeline.push({
        at: st.at ?? run.updatedAt, automationName: run.automationName, stepTitle: st.title,
        outcome: st.status === 'DONE' ? 'WOULD_RUN' : st.status === 'FAILED' ? 'WOULD_FAIL' : st.status === 'SKIPPED' ? 'WOULD_SKIP' : 'WOULD_WAIT',
        message: st.message.replace(/^(Waiting)/, 'Would be waiting').replace(/ sent to /, ' would be sent to '),
      });
    }
  }
  timeline.sort((x, y) => x.at.localeCompare(y.at));
  return { recordLabel: r0.label, timeline };
}

/** Who gets told about a stuck record (for the column header tooltip). */
export const stuckRecipientText = 'the assigned person, or the business owner if nobody is assigned';

export { officeIds, usersInRole };
