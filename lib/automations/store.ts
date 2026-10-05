'use client';

/*
  The Automations module's store: the mock adapter behind the endpoints in
  spec section 11 (the backend builds the real ones). One Zustand store,
  saved like the features store (never throws in private windows, shared
  through remote state when configured). Every action that also changes
  records runs over the features database in the same step, so the two
  never drift apart.

  Screens read with useAutomations(selector) and change data with the
  functions below. AutomationsSync registers the environment (message
  library, company name, lookups) the actions need.
*/
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { produce } from 'immer';
import type { Database as FDb, User } from '@/features/types';
import { safeStorage, useStore as useFeatureStore } from '@/features/lib/store';
import { can } from '@/features/lib/permissions';
import type {
  Automation, AutomationCondition, AutomationStep, AutomationTemplate, AutomationTrigger, CustomerConsent, DeployApproval, Journey, MessageVersion,
  PipelineModule, TemplateAutomation,
} from './types';
import type { AutomationSettings, EngineState, StuckSetting } from './state';
import { emptyState, nextId } from './state';
import type { EngineEnv } from './executors';
import { ownerIds, tell } from './executors';
import {
  approveReview, dismissRun, isLive, pauseRecord, resumeRecord, retryRun, skipReview, startJourneyFor, stopRecord, tick,
} from './engine';
import { NO_NAMES, summarize, type NameLookup } from './summary';
import { boardPlacement, stageLabel as stageLabelOf, stepDef } from './registry';
import { SYSTEM_TEMPLATES, samplesUsed } from './templates';
import { defaultConfig } from './drop-rules';

export const AUTOMATIONS_STORAGE_KEY = 'emts-automations-v1';

interface StoreShape {
  s: EngineState;
}

export const useAutomations = create<StoreShape>()(
  persist(() => ({ s: emptyState() }), {
    name: AUTOMATIONS_STORAGE_KEY,
    storage: createJSONStorage(() => safeStorage),
    // Older saves get any lists and settings added since.
    merge: (persisted, current) => {
      const saved = (persisted as Partial<StoreShape> | undefined)?.s;
      if (!saved) return current;
      const fresh = emptyState();
      return { s: { ...fresh, ...saved, settings: { ...fresh.settings, ...saved.settings, flags: { ...fresh.settings.flags, ...saved.settings?.flags } }, ui: { ...fresh.ui, ...saved.ui } } };
    },
  }),
);

export function useAuto<T>(selector: (s: EngineState) => T): T {
  return useAutomations((st) => selector(st.s));
}

export const getAutomationState = () => useAutomations.getState().s;

/* ---------- Environment (registered by AutomationsSync) ---------- */

export interface Environment {
  env: () => EngineEnv;
  names: () => NameLookup;
}

let environment: Environment = {
  env: () => ({ now: new Date(), messages: [], orgName: 'Estimate Master', estimateTemplates: [] }),
  names: () => NO_NAMES,
};

export function setEnvironment(e: Environment) {
  environment = e;
}
export const currentEnv = () => environment.env();
export const currentNames = () => environment.names();

/* ---------- Writing ---------- */

function currentUser(): User {
  const st = useFeatureStore.getState();
  return st.db.users.find((u) => u.id === st.currentUserId) ?? st.db.users[0]!;
}

/** Change the module state and, in the same step, the features database. */
export function mutate<R>(fn: (s: EngineState, db: FDb, me: User) => R): R {
  const me = currentUser();
  let out!: R;
  let nextS!: EngineState;
  const prevS = useAutomations.getState().s;
  const prevDb = useFeatureStore.getState().db;
  const nextDb = produce(prevDb, (db) => {
    nextS = produce(prevS, (s) => {
      out = fn(s as EngineState, db as FDb, me);
    });
  });
  if (nextS !== prevS) useAutomations.setState({ s: nextS });
  if (nextDb !== prevDb) useFeatureStore.setState({ db: nextDb });
  return out;
}

export type Result<T = undefined> = { ok: true; value?: T } | { ok: false; error: string };
const ok = <T>(value?: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

/** One engine tick (AutomationsSync calls this). */
export function runTick() {
  const env = currentEnv();
  const names = currentNames();
  mutate((s, db) => tick(s, db, env, names));
}

/* ---------- Automations ---------- */

export interface AutomationDraft {
  name: string;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  steps: AutomationStep[];
  journeyId?: string;
  templateId?: string;
  templateVersion?: number;
  templateIndex?: number;
  keepGoingIfStageChanges?: boolean;
}

export const liveAutomations = (s: EngineState) => s.automations.filter((a) => !a.isDeleted);

export function nextRunOrder(s: EngineState, trigger: AutomationTrigger): number {
  const p = boardPlacement(trigger);
  return s.automations.filter((a) => !a.isDeleted && boardPlacement(a.trigger).pipeline === p.pipeline && boardPlacement(a.trigger).stage === p.stage).length;
}

function addAutomation(s: EngineState, d: AutomationDraft, me: User, names: NameLookup): Automation {
  const at = new Date().toISOString();
  const a: Automation = {
    id: nextId(s, 'auto_'), name: d.name.trim(), summary: summarize(d, names), journeyId: d.journeyId, templateId: d.templateId, templateVersion: d.templateVersion,
    templateIndex: d.templateIndex, trigger: d.trigger, conditions: d.conditions, steps: d.steps.map((st, i) => ({ ...st, order: i })), runOrder: nextRunOrder(s, d.trigger),
    isEnabled: false, needsReapproval: false, isArchived: false, isDeleted: false, keepGoingIfStageChanges: d.keepGoingIfStageChanges, runsLast7Days: 0, problemCount: 0,
    createdBy: me.id, updatedBy: me.id, createdAt: at, updatedAt: at,
  };
  s.automations.push(a);
  if (d.journeyId) s.journeys.find((j) => j.id === d.journeyId)?.automationIds.push(a.id);
  return a;
}

export function createAutomation(d: AutomationDraft): Result<string> {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to manage automations.');
  const names = currentNames();
  return ok(mutate((s, _db, me) => addAutomation(s, d, me, names).id));
}

/** Customer-facing steps and the messages they use, as they are now. */
function customerFacing(s: EngineState, steps: AutomationStep[]): DeployApproval['customerFacingSteps'] {
  const env = currentEnv();
  return steps.filter((st) => stepDef(st.type)?.customerFacing).map((st) => {
    const messageId = typeof st.config.messageId === 'string' && st.config.messageId ? st.config.messageId : undefined;
    let messageVersion: number | undefined;
    if (messageId) {
      const msg = env.messages.find((m) => m.id === messageId);
      if (msg) messageVersion = ensureVersion(s, messageId, { name: msg.name, subject: msg.subject, body: msg.body }, msg.updatedBy).version;
    }
    return { stepId: st.id, title: stepDef(st.type)!.title, messageId, messageVersion };
  });
}

/** The fingerprint of customer-facing steps (what an approval covers). */
const facingKey = (steps: AutomationStep[]) =>
  JSON.stringify(steps.filter((st) => stepDef(st.type)?.customerFacing).map((st) => ({ id: st.id, type: st.type, config: st.config, mode: st.mode, delay: st.delay, conditions: st.conditions })));

export function changesCustomerFacing(before: Pick<Automation, 'steps'>, after: Pick<Automation, 'steps'>): boolean {
  return facingKey(before.steps) !== facingKey(after.steps);
}

/**
 * Save an automation. A deployed automation whose customer-facing steps
 * change waits for approval and keeps running its approved version.
 */
export function updateAutomation(id: string, patch: Partial<AutomationDraft> & { name?: string }): Result<{ needsApproval: boolean }> {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to manage automations.');
  const names = currentNames();
  return mutate((s, _db, me) => {
    const a = s.automations.find((x) => x.id === id);
    if (!a || a.isDeleted) return fail('This automation is gone.');
    const before = { steps: a.steps };
    if (patch.journeyId !== undefined && patch.journeyId !== a.journeyId) {
      s.journeys.forEach((j) => { j.automationIds = j.automationIds.filter((x) => x !== id); });
      if (patch.journeyId) s.journeys.find((j) => j.id === patch.journeyId)?.automationIds.push(id);
    }
    const p = patch.trigger ? boardPlacement(patch.trigger) : undefined;
    const old = boardPlacement(a.trigger);
    Object.assign(a, {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.trigger ? { trigger: patch.trigger } : {}),
      ...(patch.conditions ? { conditions: patch.conditions } : {}),
      ...(patch.steps ? { steps: patch.steps.map((st, i) => ({ ...st, order: i })) } : {}),
      ...(patch.journeyId !== undefined ? { journeyId: patch.journeyId || undefined } : {}),
      ...(patch.keepGoingIfStageChanges !== undefined ? { keepGoingIfStageChanges: patch.keepGoingIfStageChanges } : {}),
      updatedBy: me.id, updatedAt: new Date().toISOString(),
    });
    if (p && (p.pipeline !== old.pipeline || p.stage !== old.stage)) a.runOrder = nextRunOrder(s, a.trigger) - 1;
    a.summary = summarize(a, names);
    let needsApproval = false;
    if (a.deployedAt && a.approvalId) {
      const ap = s.approvals.find((x) => x.id === a.approvalId);
      if (changesCustomerFacing(before, a) || a.needsReapproval) {
        a.needsReapproval = true;
        needsApproval = true;
      } else if (ap) {
        // Business-only changes apply to new runs straight away.
        ap.snapshot = { trigger: a.trigger, conditions: a.conditions, steps: a.steps, keepGoingIfStageChanges: a.keepGoingIfStageChanges };
      }
    }
    return ok({ needsApproval });
  });
}

/** First deploy, or approval of a changed customer-facing step. Saves who, when and the exact steps and messages. */
export function deployAutomations(ids: string[], approved: boolean): Result {
  const me = currentUser();
  if (!can(me, 'automation.deploy')) return fail('Only people who can deploy automations can do this.');
  if (!approved) return fail('Tick "I approve these steps running automatically" first.');
  return mutate((s, db) => {
    const at = new Date().toISOString();
    let facingByOther = false;
    for (const id of ids) {
      const a = s.automations.find((x) => x.id === id);
      if (!a || a.isDeleted) continue;
      if (!a.steps.length) return fail(`${a.name} has no steps yet.`);
      const ap: DeployApproval = {
        id: nextId(s, 'APR-'), automationId: a.id, approvedBy: me.id, approvedAt: at, customerFacingSteps: customerFacing(s, a.steps),
        snapshot: JSON.parse(JSON.stringify({ trigger: a.trigger, conditions: a.conditions, steps: a.steps, keepGoingIfStageChanges: a.keepGoingIfStageChanges })),
      };
      s.approvals.push(ap);
      a.approvalId = ap.id;
      a.deployedAt ??= at;
      a.needsReapproval = false;
      a.isEnabled = true;
      a.isArchived = false;
      if (ap.customerFacingSteps.length && me.role !== 'owner') facingByOther = true;
    }
    const journeyIds = new Set(ids.map((id) => s.automations.find((a) => a.id === id)?.journeyId).filter(Boolean));
    for (const j of s.journeys) if (journeyIds.has(j.id) && j.automationIds.some((x) => s.automations.find((a) => a.id === x)?.isEnabled)) j.isEnabled = true;
    if (facingByOther) {
      const names = ids.map((id) => s.automations.find((a) => a.id === id)?.name).filter(Boolean).join(', ');
      tell(db, ownerIds(db), { title: `${me.name} deployed an automation that messages customers`, body: names, href: '/automations?tab=all', automationKind: 'DEPLOYED_BY_OTHER' });
    }
    return ok();
  });
}

function stopWaiting(s: EngineState, automationIds: string[], by: User, at: string) {
  for (const r of s.runs) {
    if (!automationIds.includes(r.automationId) || !['WAITING', 'WAITING_FOR_REVIEW', 'PAUSED'].includes(r.status)) continue;
    r.steps.forEach((st) => { if (['PENDING', 'WAITING', 'WAITING_FOR_REVIEW'].includes(st.status)) { st.status = 'SKIPPED'; st.message = `Stopped: ${by.name} turned the automation off.`; } });
    r.status = 'SKIPPED';
    r.waitingFor = undefined;
    r.updatedAt = at;
    s.reviews.filter((v) => v.runId === r.id && v.status === 'WAITING').forEach((v) => { v.status = 'SKIPPED'; v.skipReason = 'Automation turned off'; v.decidedBy = by.id; v.decidedAt = at; });
  }
}

export const waitingRunsFor = (s: EngineState, automationIds: string[]) => s.runs.filter((r) => automationIds.includes(r.automationId) && ['WAITING', 'WAITING_FOR_REVIEW', 'PAUSED'].includes(r.status)).length;

/** On/Off after the first deploy. Turning off asks what to do with waiting runs. */
export function setEnabled(ids: string[], on: boolean, waitingRuns: 'STOP' | 'FINISH' = 'STOP'): Result {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to turn automations on or off.');
  return mutate((s, _db, me) => {
    const at = new Date().toISOString();
    for (const id of ids) {
      const a = s.automations.find((x) => x.id === id);
      if (!a || a.isDeleted) continue;
      if (on && !a.deployedAt) return fail(`${a.name} must be deployed first.`);
      if (on && !a.steps.length) return fail(`Add at least one step to ${a.name} before turning it on.`);
      a.isEnabled = on;
      if (on) a.isArchived = false;
    }
    if (!on && waitingRuns === 'STOP') stopWaiting(s, ids, me, at);
    for (const j of s.journeys) j.isEnabled = j.automationIds.some((x) => s.automations.find((a) => a.id === x && !a.isDeleted)?.isEnabled);
    return ok();
  });
}

export function archiveAutomations(ids: string[], waitingRuns: 'STOP' | 'FINISH' = 'STOP'): Result {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to archive automations.');
  return mutate((s, _db, me) => {
    for (const id of ids) {
      const a = s.automations.find((x) => x.id === id);
      if (!a) continue;
      a.isArchived = true;
      a.isEnabled = false;
    }
    if (waitingRuns === 'STOP') stopWaiting(s, ids, me, new Date().toISOString());
    return ok();
  });
}

export function restoreAutomations(ids: string[]): Result {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to restore automations.');
  return mutate((s) => {
    for (const id of ids) {
      const a = s.automations.find((x) => x.id === id);
      if (a) { a.isArchived = false; a.isEnabled = false; }
    }
    return ok();
  });
}

const copyName = (s: EngineState, base: string) => {
  let name = `${base} (copy)`;
  let n = 2;
  while (s.automations.some((a) => !a.isDeleted && a.name === name)) name = `${base} (copy ${n++})`;
  return name;
};

/** Fresh step ids, so a copy never shares once-keys with the original. */
export function freshSteps(s: EngineState, steps: AutomationStep[]): AutomationStep[] {
  return steps.map((st) => ({ ...JSON.parse(JSON.stringify(st)), id: nextId(s, 'step_'), conditions: st.conditions.map((c) => ({ ...c, id: nextId(s, 'cond_') })) }));
}

export function duplicateAutomation(id: string): Result<string> {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to duplicate automations.');
  const names = currentNames();
  return mutate((s, _db, me) => {
    const a = s.automations.find((x) => x.id === id);
    if (!a) return fail('This automation is gone.');
    const copy = addAutomation(s, { name: copyName(s, a.name), trigger: JSON.parse(JSON.stringify(a.trigger)), conditions: JSON.parse(JSON.stringify(a.conditions)), steps: freshSteps(s, a.steps), journeyId: a.journeyId, keepGoingIfStageChanges: a.keepGoingIfStageChanges }, me, names);
    return ok(copy.id);
  });
}

/** Soft delete: activity stays and shows "(deleted)". */
export function deleteAutomations(ids: string[]): Result {
  if (!can(currentUser(), 'automation.delete')) return fail('You need permission to delete automations.');
  return mutate((s, _db, me) => {
    stopWaiting(s, ids, me, new Date().toISOString());
    for (const id of ids) {
      const a = s.automations.find((x) => x.id === id);
      if (!a) continue;
      a.isDeleted = true;
      a.isEnabled = false;
      s.journeys.forEach((j) => { j.automationIds = j.automationIds.filter((x) => x !== id); });
      s.runs.filter((r) => r.automationId === id).forEach((r) => { r.automationDeleted = true; });
    }
    return ok();
  });
}

/** Change the order automations run in within one stage. */
export function reorderStage(orderedIds: string[]): Result {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to reorder automations.');
  return mutate((s) => {
    orderedIds.forEach((id, i) => { const a = s.automations.find((x) => x.id === id); if (a) a.runOrder = i; });
    return ok();
  });
}

export function moveToJourney(ids: string[], journeyId: string | undefined): Result {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to change journeys.');
  return mutate((s) => {
    for (const id of ids) {
      const a = s.automations.find((x) => x.id === id);
      if (!a) continue;
      s.journeys.forEach((j) => { j.automationIds = j.automationIds.filter((x) => x !== id); });
      a.journeyId = journeyId;
      if (journeyId) s.journeys.find((j) => j.id === journeyId)?.automationIds.push(id);
    }
    return ok();
  });
}

/* ---------- Board edits (drag and drop) ---------- */

export interface BoardChange {
  /** Automations as they were before (for Undo). */
  before: Automation[];
  /** Automations this change created (Undo removes them). */
  created: string[];
  /** Deployed automations whose customer-facing steps changed. */
  needsApproval: string[];
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function saveSteps(a: Automation, steps: AutomationStep[], me: User, names: NameLookup, s: EngineState): boolean {
  const before = { steps: a.steps };
  a.steps = steps.map((st, i) => ({ ...st, order: i }));
  a.updatedBy = me.id;
  a.updatedAt = new Date().toISOString();
  a.summary = summarize(a, names);
  if (a.deployedAt && a.approvalId) {
    if (changesCustomerFacing(before, a) || a.needsReapproval) { a.needsReapproval = true; return true; }
    const ap = s.approvals.find((x) => x.id === a.approvalId);
    if (ap) ap.snapshot = { trigger: a.trigger, conditions: a.conditions, steps: a.steps, keepGoingIfStageChanges: a.keepGoingIfStageChanges };
  }
  return false;
}

/** Insert a step into an automation at an index. */
export function insertStep(automationId: string, index: number, step: AutomationStep): Result<BoardChange> {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to change automations.');
  const names = currentNames();
  return mutate((s, _db, me) => {
    const a = s.automations.find((x) => x.id === automationId);
    if (!a) return fail('This automation is gone.');
    const before = [clone(a)];
    const steps = [...a.steps];
    steps.splice(Math.max(0, Math.min(index, steps.length)), 0, step);
    const needs = saveSteps(a, steps, me, names, s);
    return ok({ before, created: [], needsApproval: needs ? [a.id] : [] });
  });
}

/** Replace one step's settings (the settings panel's Done). */
export function replaceStep(automationId: string, step: AutomationStep): Result<BoardChange> {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to change automations.');
  const names = currentNames();
  return mutate((s, _db, me) => {
    const a = s.automations.find((x) => x.id === automationId);
    if (!a) return fail('This automation is gone.');
    const before = [clone(a)];
    const needs = saveSteps(a, a.steps.map((st) => (st.id === step.id ? step : st)), me, names, s);
    return ok({ before, created: [], needsApproval: needs ? [a.id] : [] });
  });
}

export function removeStep(automationId: string, stepId: string): Result<BoardChange> {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to change automations.');
  const names = currentNames();
  return mutate((s, _db, me) => {
    const a = s.automations.find((x) => x.id === automationId);
    if (!a) return fail('This automation is gone.');
    const before = [clone(a)];
    const needs = saveSteps(a, a.steps.filter((st) => st.id !== stepId), me, names, s);
    return ok({ before, created: [], needsApproval: needs ? [a.id] : [] });
  });
}

/** Move a step within an automation or to another one. */
export function moveStep(fromId: string, stepId: string, toId: string, index: number): Result<BoardChange> {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to change automations.');
  const names = currentNames();
  return mutate((s, _db, me) => {
    const from = s.automations.find((x) => x.id === fromId);
    const to = s.automations.find((x) => x.id === toId);
    const step = from?.steps.find((st) => st.id === stepId);
    if (!from || !to || !step) return fail('That step is gone.');
    const before = from.id === to.id ? [clone(from)] : [clone(from), clone(to)];
    const needs: string[] = [];
    if (from.id === to.id) {
      const steps = from.steps.filter((st) => st.id !== stepId);
      const oldIndex = from.steps.findIndex((st) => st.id === stepId);
      steps.splice(index > oldIndex ? index - 1 : index, 0, step);
      if (saveSteps(from, steps, me, names, s)) needs.push(from.id);
    } else {
      if (saveSteps(from, from.steps.filter((st) => st.id !== stepId), me, names, s)) needs.push(from.id);
      const steps = [...to.steps];
      steps.splice(index, 0, clone(step));
      if (saveSteps(to, steps, me, names, s)) needs.push(to.id);
    }
    return ok({ before, created: [], needsApproval: needs });
  });
}

/** A new automation for a stage, starting with these steps (it starts Off). */
export function createForStage(pipeline: PipelineModule, stage: string, steps: AutomationStep[], name?: string, journeyId?: string): Result<BoardChange & { id: string }> {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to create automations.');
  const names = currentNames();
  return mutate((s, _db, me) => {
    const base = name ?? `${stageLabelOf(pipeline, stage)} automation`;
    const a = addAutomation(s, { name: uniqueName(s, base), trigger: { type: 'STAGE_ENTERED', module: pipeline, config: { stage } }, conditions: [], steps, journeyId }, me, names);
    return ok({ id: a.id, before: [], created: [a.id], needsApproval: [] });
  });
}

/** Undo a board change: put earlier versions back and remove what it created (never deployed ones). */
export function undoChange(change: BoardChange) {
  mutate((s) => {
    for (const b of change.before) {
      const i = s.automations.findIndex((a) => a.id === b.id);
      if (i >= 0) s.automations[i] = clone(b);
    }
    for (const id of change.created) {
      const a = s.automations.find((x) => x.id === id);
      if (!a || a.deployedAt || s.runs.some((r) => r.automationId === id)) continue;
      s.automations = s.automations.filter((x) => x.id !== id);
      s.journeys.forEach((j) => { j.automationIds = j.automationIds.filter((x) => x !== id); });
    }
  });
}

export function renameAutomation(id: string, name: string): Result {
  return updateAutomation(id, { name }) as Result;
}

/* ---------- Journeys ---------- */

export function createJourney(name: string, description?: string): Result<string> {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to create journeys.');
  return mutate((s) => {
    const j: Journey = { id: nextId(s, 'jrn_'), name: name.trim(), description, automationIds: [], isEnabled: false, createdAt: new Date().toISOString() };
    s.journeys.push(j);
    return ok(j.id);
  });
}

export function updateJourney(id: string, patch: Partial<Pick<Journey, 'name' | 'description' | 'stuckMultiplier'>>): Result {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to edit journeys.');
  return mutate((s) => {
    const j = s.journeys.find((x) => x.id === id);
    if (!j) return fail('This journey is gone.');
    Object.assign(j, patch);
    for (const r of s.runs) if (r.journeyId === id && patch.name) r.journeyName = patch.name;
    return ok();
  });
}

/** Deleting a journey keeps its automations (they become "Not in a journey"). */
export function deleteJourney(id: string): Result {
  if (!can(currentUser(), 'automation.delete')) return fail('You need permission to delete journeys.');
  return mutate((s) => {
    s.automations.filter((a) => a.journeyId === id).forEach((a) => { a.journeyId = undefined; });
    s.journeys = s.journeys.filter((j) => j.id !== id);
    return ok();
  });
}

/** Turn a journey on or off as one. Automations never deployed need the Deploy modal first. */
export function setJourneyEnabled(id: string, on: boolean, waitingRuns: 'STOP' | 'FINISH' = 'STOP'): Result {
  const s0 = getAutomationState();
  const j = s0.journeys.find((x) => x.id === id);
  if (!j) return fail('This journey is gone.');
  const ids = j.automationIds.filter((x) => { const a = s0.automations.find((y) => y.id === x); return a && !a.isDeleted && !a.isArchived; });
  return setEnabled(ids, on, waitingRuns);
}

/* ---------- Templates ---------- */

export const allTemplates = (s: EngineState): AutomationTemplate[] => [...SYSTEM_TEMPLATES, ...s.templates.filter((t) => !t.isDeleted)];

const PERSON_KEYS = ['userId', 'notifyUserId', 'assignUserId'];

function toTemplateAutomation(a: Automation, keepPeople: boolean): TemplateAutomation {
  const steps = (JSON.parse(JSON.stringify(a.steps)) as AutomationStep[]).map((st) => {
    if (!keepPeople) for (const k of PERSON_KEYS) if (k in st.config) st.config[k] = '';
    return st;
  });
  return { name: a.name, trigger: JSON.parse(JSON.stringify(a.trigger)), conditions: JSON.parse(JSON.stringify(a.conditions)), steps, keepGoingIfStageChanges: a.keepGoingIfStageChanges };
}

function blanksFor(list: TemplateAutomation[]): AutomationTemplate['blanks'] {
  const out: AutomationTemplate['blanks'] = [];
  list.forEach((a, i) => a.steps.forEach((st) => {
    for (const f of stepDef(st.type)?.fields ?? []) {
      if (f.required && (st.config[f.key] === '' || st.config[f.key] === undefined) && (!f.showIf || f.showIf.values.includes(st.config[f.showIf.key] as string))) {
        out.push({ automationIndex: i, stepId: st.id, fieldKey: f.key, question: f.kind === 'user' ? `${a.name}: who is the ${f.label.toLowerCase()}?` : `${a.name}: ${f.label}?` });
      }
    }
  }));
  return out;
}

export function saveAsTemplate(input: { automationIds: string[]; journeyId?: string; name: string; description: string; keepPeople: boolean }): Result<string> {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to save templates.');
  return mutate((s) => {
    const list = input.automationIds.map((id) => s.automations.find((a) => a.id === id)).filter((a): a is Automation => !!a && !a.isDeleted);
    if (!list.length) return fail('Nothing to save.');
    const automations = list.map((a) => toTemplateAutomation(a, input.keepPeople));
    const journey = input.journeyId ? s.journeys.find((j) => j.id === input.journeyId) : undefined;
    const t: AutomationTemplate = {
      id: nextId(s, 'tmpl_'), kind: input.journeyId ? 'JOURNEY' : 'AUTOMATION', source: 'BUSINESS', name: input.name.trim(), description: input.description.trim(),
      automations, blanks: blanksFor(automations), version: 1, updatedAt: new Date().toISOString(), stuckMultiplier: journey?.stuckMultiplier,
    };
    s.templates.push(t);
    return ok(t.id);
  });
}

export function createBlankTemplate(kind: AutomationTemplate['kind'], name: string): Result<string> {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to create templates.');
  return mutate((s) => {
    const t: AutomationTemplate = {
      id: nextId(s, 'tmpl_'), kind, source: 'BUSINESS', name: name.trim(), description: '', blanks: [], version: 1, updatedAt: new Date().toISOString(),
      automations: [{ name: name.trim(), trigger: { type: 'STAGE_ENTERED', module: 'LEAD', config: { stage: 'NEW' } }, conditions: [], steps: [] }],
    };
    s.templates.push(t);
    return ok(t.id);
  });
}

/** Editing a template never changes automations made from it; they show "Template updated". */
export function updateTemplate(id: string, patch: Partial<Pick<AutomationTemplate, 'name' | 'description' | 'automations'>>): Result {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to edit templates.');
  return mutate((s) => {
    const t = s.templates.find((x) => x.id === id);
    if (!t) return fail('System templates can’t be edited. Duplicate it to make your own copy.');
    Object.assign(t, patch);
    if (patch.automations) {
      t.blanks = blanksFor(t.automations);
      t.version += 1;
      s.automations.filter((a) => a.templateId === id && !a.isDeleted).forEach((a) => { a.templateUpdated = true; });
    }
    t.updatedAt = new Date().toISOString();
    return ok();
  });
}

export function duplicateTemplate(id: string): Result<string> {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to duplicate templates.');
  return mutate((s) => {
    const t = allTemplates(s).find((x) => x.id === id);
    if (!t) return fail('This template is gone.');
    const copy: AutomationTemplate = { ...JSON.parse(JSON.stringify(t)), id: nextId(s, 'tmpl_'), source: 'BUSINESS', name: `${t.name} (copy)`, version: 1, updatedAt: new Date().toISOString(), isDeleted: false };
    s.templates.push(copy);
    return ok(copy.id);
  });
}

/** Deleting a template never touches automations made from it. */
export function deleteTemplate(id: string): Result {
  if (!can(currentUser(), 'automation.delete')) return fail('You need permission to delete templates.');
  return mutate((s) => {
    const t = s.templates.find((x) => x.id === id);
    if (!t) return fail('System templates can’t be deleted.');
    t.isDeleted = true;
    return ok();
  });
}

export interface ApplyInput {
  templateId: string;
  name: string;
  /** stepId|fieldKey → value. */
  answers: Record<string, unknown>;
  /** Sample message id → library message id (the caller copies samples into the library first). */
  messageMap: Record<string, string>;
  /** Only for a template dropped on a stage: put the automation there. */
  placeAt?: { pipeline: PipelineModule; stage: string };
}

/** Create automations from a template. Everything starts Off. */
export function applyTemplate(input: ApplyInput): Result<{ journeyId?: string; automationIds: string[] }> {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to use templates.');
  const names = currentNames();
  return mutate((s, _db, me) => {
    const t = allTemplates(s).find((x) => x.id === input.templateId);
    if (!t) return fail('This template is gone.');
    let journeyId: string | undefined;
    if (t.kind === 'JOURNEY') {
      const j: Journey = { id: nextId(s, 'jrn_'), name: input.name.trim(), description: t.description, automationIds: [], isEnabled: false, templateId: t.id, stuckMultiplier: t.stuckMultiplier, createdAt: new Date().toISOString() };
      s.journeys.push(j);
      journeyId = j.id;
    }
    const ids: string[] = [];
    t.automations.forEach((ta, i) => {
      const idMap = new Map<string, string>();
      const steps = (JSON.parse(JSON.stringify(ta.steps)) as AutomationStep[]).map((st) => {
        const newId = nextId(s, 'step_');
        idMap.set(st.id, newId);
        for (const [k, v] of Object.entries(input.answers)) {
          const [stepId, field] = k.split('|');
          if (stepId === st.id && field) st.config[field] = v;
        }
        if (typeof st.config.messageId === 'string' && input.messageMap[st.config.messageId]) st.config.messageId = input.messageMap[st.config.messageId];
        return { ...st, id: newId, conditions: st.conditions.map((c) => ({ ...c, id: nextId(s, 'cond_') })) };
      });
      let trigger = JSON.parse(JSON.stringify(ta.trigger)) as AutomationTrigger;
      if (input.placeAt) {
        const p = boardPlacement(trigger);
        if (p.pipeline !== input.placeAt.pipeline || p.stage !== input.placeAt.stage) trigger = { type: 'STAGE_ENTERED', module: input.placeAt.pipeline, config: { stage: input.placeAt.stage } };
      }
      const name = t.kind === 'JOURNEY' ? ta.name : input.name.trim();
      const a = addAutomation(s, { name: uniqueName(s, name), trigger, conditions: JSON.parse(JSON.stringify(ta.conditions)), steps, journeyId, templateId: t.id, templateVersion: t.version, templateIndex: i, keepGoingIfStageChanges: ta.keepGoingIfStageChanges }, me, names);
      ids.push(a.id);
    });
    return ok({ journeyId, automationIds: ids });
  });
}

function uniqueName(s: EngineState, name: string) {
  if (!s.automations.some((a) => !a.isDeleted && a.name.toLowerCase() === name.toLowerCase())) return name;
  let n = 2;
  while (s.automations.some((a) => !a.isDeleted && a.name.toLowerCase() === `${name} ${n}`.toLowerCase())) n++;
  return `${name} ${n}`;
}

/** Apply the template's newer version to one automation (only when the user presses Apply). */
export function applyTemplateUpdate(automationId: string, messageMap: Record<string, string> = {}): Result<{ needsApproval: boolean }> {
  const s0 = getAutomationState();
  const a = s0.automations.find((x) => x.id === automationId);
  const t = a && allTemplates(s0).find((x) => x.id === a.templateId);
  const ta = t?.automations[a?.templateIndex ?? 0];
  if (!a || !t || !ta) return fail('The template is gone.');
  const r = mutate((s) => {
    const steps = freshSteps(s, ta.steps).map((st) => (typeof st.config.messageId === 'string' && messageMap[st.config.messageId] ? { ...st, config: { ...st.config, messageId: messageMap[st.config.messageId] } } : st));
    return { steps, trigger: JSON.parse(JSON.stringify(ta.trigger)) as AutomationTrigger, conditions: JSON.parse(JSON.stringify(ta.conditions)) as AutomationCondition[] };
  });
  const res = updateAutomation(automationId, r);
  if (res.ok) mutate((s) => { const x = s.automations.find((y) => y.id === automationId); if (x) { x.templateUpdated = false; x.templateVersion = t.version; } });
  return res;
}

export function dismissTemplateUpdate(automationId: string) {
  mutate((s) => {
    const a = s.automations.find((x) => x.id === automationId);
    const t = a && allTemplates(s).find((x) => x.id === a.templateId);
    if (a) { a.templateUpdated = false; a.templateVersion = t?.version; }
  });
}

export { samplesUsed };

/* ---------- Messages: version history and approvals ---------- */

export function ensureVersion(s: EngineState, id: string, current: { name: string; subject?: string; body: string }, by = 'Estimate Master'): MessageVersion {
  const list = (s.messageVersions[id] ??= []);
  const last = list[list.length - 1];
  if (last && last.name === current.name && last.body === current.body && (last.subject ?? '') === (current.subject ?? '')) return last;
  const v: MessageVersion = { version: (last?.version ?? 0) + 1, name: current.name, subject: current.subject, body: current.body, savedBy: by, savedAt: new Date().toISOString() };
  list.push(v);
  return v;
}

export const deployedUsers = (s: EngineState, messageId: string) =>
  s.automations.filter((a) => !a.isDeleted && a.deployedAt && a.steps.some((st) => st.config.messageId === messageId));

/** After a message is saved: keep a version; deployed automations using it wait for approval and keep sending the old one. */
export function recordMessageSaved(id: string, content: { name: string; subject?: string; body: string }, previous?: { name: string; subject?: string; body: string }): { needsApproval: string[] } {
  return mutate((s, db, me) => {
    if (previous && !s.messageVersions[id]?.length) ensureVersion(s, id, previous);
    ensureVersion(s, id, content, me.name);
    const users = deployedUsers(s, id);
    for (const a of users) a.needsReapproval = true;
    if (users.length) {
      tell(db, db.users.filter((u) => can(u, 'automation.deploy')).map((u) => u.id), {
        title: `"${content.name}" changed and needs approval`, body: `Used in ${users.length} deployed ${users.length === 1 ? 'automation' : 'automations'}. They keep sending the old version until approved.`,
        href: '/automations?tab=messages', automationKind: 'MESSAGE_NEEDS_APPROVAL',
      });
    }
    return { needsApproval: users.map((a) => a.id) };
  });
}

/** Point every step that used one message at another (delete with replacement). */
export function replaceMessage(fromId: string, toId: string) {
  const names = currentNames();
  mutate((s) => {
    for (const a of s.automations) {
      let changed = false;
      for (const st of a.steps) if (st.config.messageId === fromId) { st.config.messageId = toId; changed = true; }
      if (changed) { a.summary = summarize(a, names); if (a.deployedAt) a.needsReapproval = true; }
    }
    delete s.messageVersions[fromId];
  });
}

export const messageUsedIn = (s: EngineState, id: string) => s.automations.filter((a) => !a.isDeleted && a.steps.some((st) => st.config.messageId === id)).map((a) => a.id);

/* ---------- Reviews, runs and records ---------- */

export function approveReviewItem(id: string, edits?: Record<string, unknown>): Result {
  const me = currentUser();
  if (!can(me, 'automation.review')) return fail('You need permission to approve these.');
  const env = currentEnv();
  const names = currentNames();
  return mutate((s, db) => {
    const r = approveReview(s, db, id, me, edits, env, names);
    return r.ok ? ok() : fail(r.error ?? 'Could not approve.');
  });
}

export function skipReviewItem(id: string, reason: string): Result {
  const me = currentUser();
  if (!can(me, 'automation.review')) return fail('You need permission to skip these.');
  const env = currentEnv();
  const names = currentNames();
  return mutate((s, db) => {
    const r = skipReview(s, db, id, me, reason, env, names);
    return r.ok ? ok() : fail(r.error ?? 'Could not skip.');
  });
}

export function retry(runId: string): Result {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to retry runs.');
  const env = currentEnv();
  const names = currentNames();
  return mutate((s, db) => {
    const r = retryRun(s, db, runId, env, names);
    return r.ok ? ok() : fail(r.error ?? 'Could not retry.');
  });
}

export function dismiss(runId: string): Result {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to dismiss problems.');
  mutate((s) => dismissRun(s, runId, new Date().toISOString()));
  return ok();
}

export function pauseJourneyFor(type: PipelineModule, id: string): Result {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to pause journeys.');
  mutate((s, db) => pauseRecord(s, db, type, id, new Date().toISOString()));
  return ok();
}

export function resumeJourneyFor(type: PipelineModule, id: string): Result {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to resume journeys.');
  const env = currentEnv();
  const names = currentNames();
  mutate((s, db) => resumeRecord(s, db, type, id, env, names));
  return ok();
}

export function stopJourneyFor(type: PipelineModule, id: string): Result {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to stop journeys.');
  mutate((s, db, me) => stopRecord(s, db, type, id, me, new Date().toISOString()));
  return ok();
}

export function startJourney(journeyId: string, type: PipelineModule, id: string): Result<number> {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to start journeys.');
  const env = currentEnv();
  const names = currentNames();
  return ok(mutate((s, db) => startJourneyFor(s, db, journeyId, type, id, env, names)));
}

/* ---------- Settings and small state ---------- */

export function setStuckAlert(pipeline: PipelineModule, stage: string, patch: Partial<StuckSetting>, base: StuckSetting): Result {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to change stuck alerts.');
  mutate((s) => {
    s.stuck[pipeline] ??= {};
    s.stuck[pipeline]![stage] = { ...base, ...s.stuck[pipeline]![stage], ...patch };
  });
  return ok();
}

export function setConsent(customerId: string, patch: Partial<CustomerConsent>) {
  mutate((s) => { s.consent[customerId] = { ...s.consent[customerId], ...patch }; });
}

/** Backend gap 3: the estimator marks an estimate ready to send. Kept in this module for the prototype. */
export function setEstimateReady(estimateId: string, ready: boolean) {
  mutate((s) => {
    if (ready) s.readyEstimates[estimateId] = new Date().toISOString();
    else delete s.readyEstimates[estimateId];
  });
}

export function setSettings(patch: Partial<AutomationSettings>): Result {
  if (!can(currentUser(), 'automation.manage')) return fail('You need permission to change these settings.');
  mutate((s) => { s.settings = { ...s.settings, ...patch }; });
  return ok();
}

export function setEmailPref(userId: string, kinds: string[]) {
  mutate((s) => { s.settings.emailPrefs[userId] = kinds; });
}

export function setUi(patch: Partial<EngineState['ui']>) {
  mutate((s) => { s.ui = { ...s.ui, ...patch, collapsed: { ...s.ui.collapsed, ...(patch.collapsed ?? {}) } }; });
}

export function resetAutomations() {
  useAutomations.setState({ s: emptyState() });
}

/* ---------- Helpers for screens ---------- */

export function blankStep(s: EngineState | undefined, type: string, settings: Record<string, unknown> = {}): AutomationStep {
  const def = stepDef(type);
  const id = s ? nextId(s, 'step_') : `step_${Math.random().toString(36).slice(2, 9)}`;
  return { id, order: 0, type, mode: def?.mode === 'ASK_BY_DEFAULT' ? 'ASK' : 'AUTO', conditions: [], config: defaultConfig(type, settings) };
}

export const newStepId = () => `step_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const newCondId = () => `cond_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const healthOf = (s: EngineState) => ({
  on: s.automations.filter(isLive).length,
  problems: s.runs.filter((r) => r.status === 'FAILED').length + s.automations.filter((a) => !a.isDeleted && a.needsReapproval).length,
  waiting: s.reviews.filter((v) => v.status === 'WAITING').length,
});
