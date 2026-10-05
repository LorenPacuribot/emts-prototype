/*
  Drop rules (spec 6.3, "Blocked drops"). One function decides whether a
  block may go somewhere. Dragging, the "Add to which stage?" popover and
  the keyboard flow all call it, so they can never disagree. It reads
  prerequisites and once-per-record rules from the registry. Pure.
*/
import type { Automation, AutomationTemplate, PipelineModule } from './types';
import { MODULE_LABEL, boardPlacement, pipelineOf, stageLabel, stepAllowedAt, stepDef } from './registry';
import { LIMITS } from './validation';

export type DragItem =
  | { kind: 'step'; type: string }
  | { kind: 'message'; id: string; channel: 'EMAIL' | 'SMS' }
  | { kind: 'stage'; pipeline: PipelineModule; stage: string }
  | { kind: 'template'; id: string }
  | { kind: 'card'; automationId: string; stepId: string }
  | { kind: 'group'; automationId: string };

export type DropTarget =
  /** A gap inside an automation (before step `index`). */
  | { kind: 'zone'; automationId: string; index: number }
  /** The dashed "New automation for this stage" box. */
  | { kind: 'new'; pipeline: PipelineModule; stage: string }
  /** The editor's When block. */
  | { kind: 'when'; automationId: string }
  /** A slot between automation groups in a column. */
  | { kind: 'groupSlot'; pipeline: PipelineModule; stage: string; index: number };

export type DropResult = { ok: true } | { ok: false; reason: string };

export interface DropContext {
  canManage: boolean;
  /** Live automations (not deleted, not archived), including unsaved editor drafts. */
  automations: Pick<Automation, 'id' | 'journeyId' | 'trigger' | 'steps'>[];
  templates: Pick<AutomationTemplate, 'id' | 'kind' | 'automations'>[];
  textingReleased: boolean;
  flags: Record<string, boolean>;
}

const no = (reason: string): DropResult => ({ ok: false, reason });
const yes: DropResult = { ok: true };

/** Steps that may happen only once per record in a journey, and the key that identifies them. */
export function uniqueKey(type: string, config: Record<string, unknown>): string | undefined {
  const def = stepDef(type);
  if (!def?.oncePerRecord || !def.createsRecord) return undefined;
  if (type === 'CREATE_INVOICE') {
    const t = String(config.invoiceType ?? 'DEPOSIT');
    return t === 'PROGRESS' ? undefined : `CREATE_INVOICE:${t}`;
  }
  return type.startsWith('CREATE_ESTIMATE') ? 'CREATE_ESTIMATE' : type;
}

/** Default settings a new step starts with (registry defaults; settings paths are filled by the caller). */
export function defaultConfig(type: string, settings: Record<string, unknown> = {}): Record<string, unknown> {
  const def = stepDef(type);
  const out: Record<string, unknown> = {};
  for (const f of def?.fields ?? []) {
    if (f.defaultValue !== undefined) out[f.key] = f.defaultValue;
    else if (f.defaultFrom) {
      const v = f.defaultFrom.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), settings);
      if (v !== undefined) out[f.key] = v;
    }
  }
  return out;
}

function placeOf(a: Pick<Automation, 'trigger'>) {
  return boardPlacement(a.trigger);
}

function whereIs(a: Pick<Automation, 'trigger'>): string {
  const p = placeOf(a);
  return `${MODULE_LABEL[p.pipeline]} › ${stageLabel(p.pipeline, p.stage)}`;
}

/** A second copy of a once-per-record step in the same journey (or the same automation when it has no journey). */
function duplicateIn(ctx: DropContext, target: Pick<Automation, 'id' | 'journeyId'> | undefined, key: string | undefined, ignoreStepId?: string): DropResult {
  if (!key) return yes;
  const scope = ctx.automations.filter((a) => (target?.journeyId ? a.journeyId === target.journeyId : a.id === target?.id));
  for (const a of scope) {
    for (const s of a.steps) {
      if (s.id === ignoreStepId) continue;
      if (uniqueKey(s.type, s.config) === key) {
        const what = key.startsWith('CREATE_INVOICE:') ? `creates a ${key.split(':')[1]!.toLowerCase()} invoice`
          : key === 'CREATE_ESTIMATE' ? 'creates an estimate'
          : `has "${stepDef(s.type)?.title ?? 'this step'}"`;
        return no(`This ${target?.journeyId ? 'journey' : 'automation'} already ${what} in ${whereIs(a)}.`);
      }
    }
  }
  return yes;
}

function stepChecks(type: string, config: Record<string, unknown>, pipeline: PipelineModule, stage: string, ctx: DropContext, target?: Pick<Automation, 'id' | 'journeyId' | 'steps'>, movingStepId?: string): DropResult {
  const def = stepDef(type);
  if (!def) return no('This step no longer exists.');
  if (def.requiresRelease === 'texting' && !ctx.textingReleased) return no("Texting isn't switched on yet.");
  if (def.requiresFeatureFlag && !ctx.flags[def.requiresFeatureFlag]) return no('This business uses the older job scheduling. Use "Create a task: schedule this job" instead.');
  const allowed = stepAllowedAt(def, pipeline, stage);
  if (!allowed.ok) return allowed;
  if (target && !movingStepId && target.steps.length >= LIMITS.steps) return no(`An automation can have up to ${LIMITS.steps} steps.`);
  if (target && movingStepId && !target.steps.some((s) => s.id === movingStepId) && target.steps.length >= LIMITS.steps) return no(`An automation can have up to ${LIMITS.steps} steps.`);
  if (def.movesTo && target) {
    const p = boardPlacement((ctx.automations.find((a) => a.id === target.id) ?? { trigger: { type: 'STAGE_ENTERED', module: pipeline, config: { stage } } }).trigger);
    if (def.movesTo.module === p.pipeline && config.stage === p.stage && !p.timed) return no('This would make the automation run forever.');
  }
  return duplicateIn(ctx, target, uniqueKey(type, config), movingStepId);
}

export function canDrop(item: DragItem, target: DropTarget, ctx: DropContext): DropResult {
  if (!ctx.canManage) return no('You can look but not change automations. Ask the business owner for access.');
  const auto = target.kind === 'zone' || target.kind === 'when' ? ctx.automations.find((a) => a.id === target.automationId) : undefined;
  const place = auto ? placeOf(auto) : target.kind === 'new' || target.kind === 'groupSlot' ? { pipeline: target.pipeline, stage: target.stage, timed: false } : undefined;
  if ((target.kind === 'zone' || target.kind === 'when') && !auto) return no('That automation is gone.');
  if (!place) return no('Drop it on a stage.');

  switch (item.kind) {
    case 'step': {
      if (target.kind === 'when' || target.kind === 'groupSlot') return no('Drop a step between the steps of an automation.');
      return stepChecks(item.type, defaultConfig(item.type), place.pipeline, place.stage, ctx, auto);
    }
    case 'message': {
      if (target.kind === 'when' || target.kind === 'groupSlot') return no('Drop a message between the steps of an automation.');
      return stepChecks(item.channel === 'SMS' ? 'SEND_TEXT' : 'SEND_EMAIL', { messageId: item.id }, place.pipeline, place.stage, ctx, auto);
    }
    case 'stage': {
      if (target.kind === 'groupSlot') return no('Drop a stage on an automation.');
      if (target.kind === 'when') {
        return item.pipeline === place.pipeline ? yes : no(`${stageLabel(item.pipeline, item.stage)} is in the ${MODULE_LABEL[item.pipeline]} pipeline. Switch pipeline to use it.`);
      }
      if (target.kind === 'new' && item.pipeline === place.pipeline && item.stage === place.stage) return no('This would make the automation run forever.');
      const moveType = item.pipeline === 'LEAD' ? 'MOVE_LEAD_STAGE' : item.pipeline === 'JOB' ? 'MOVE_JOB_STAGE' : undefined;
      if (!moveType) return no(`${MODULE_LABEL[item.pipeline]} move through their own actions (send, pay, schedule), so there is no "move to" step.`);
      return stepChecks(moveType, { stage: item.stage }, place.pipeline, place.stage, ctx, auto);
    }
    case 'template': {
      if (target.kind !== 'new') return no('Drop a template on "New automation for this stage".');
      const tpl = ctx.templates.find((t) => t.id === item.id);
      if (!tpl) return no('That template is gone.');
      if (tpl.kind === 'JOURNEY') return no('A journey covers many stages. Use it from the Templates tab.');
      const first = tpl.automations[0];
      for (const s of first?.steps ?? []) {
        const r = stepChecks(s.type, s.config, place.pipeline, place.stage, { ...ctx }, undefined);
        if (!r.ok) return no(`${stepDef(s.type)?.title ?? 'A step'}: ${r.reason}`);
      }
      return yes;
    }
    case 'card': {
      if (target.kind === 'when' || target.kind === 'groupSlot') return no('Drop the step between the steps of an automation.');
      const from = ctx.automations.find((a) => a.id === item.automationId);
      const step = from?.steps.find((s) => s.id === item.stepId);
      if (!step) return no('That step is gone.');
      if (target.kind === 'zone' && target.automationId === item.automationId) return yes;
      return stepChecks(step.type, step.config, place.pipeline, place.stage, ctx, auto, item.stepId);
    }
    case 'group': {
      if (target.kind !== 'groupSlot') return no('Drag an automation by its header to change the order in its stage.');
      const a = ctx.automations.find((x) => x.id === item.automationId);
      if (!a) return no('That automation is gone.');
      const p = placeOf(a);
      if (p.pipeline !== target.pipeline || p.stage !== target.stage) return no('Automations stay in their stage. Change the When in the full editor to move one.');
      return yes;
    }
  }
}

/** Same rule, read as "is this block usable on this board at all?" (to lock blocks in the panel). */
export function blockLocked(item: DragItem, ctx: DropContext): string | undefined {
  if (!ctx.canManage) return 'You can look but not change automations.';
  if (item.kind === 'step') {
    const def = stepDef(item.type);
    if (def?.requiresRelease === 'texting' && !ctx.textingReleased) return "Texting isn't switched on yet";
    if (def?.requiresFeatureFlag && !ctx.flags[def.requiresFeatureFlag]) return 'Needs the new job scheduling';
  }
  if (item.kind === 'message' && item.channel === 'SMS' && !ctx.textingReleased) return "Texting isn't switched on yet";
  return undefined;
}

export { pipelineOf };
