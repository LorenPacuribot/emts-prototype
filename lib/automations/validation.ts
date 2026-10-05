/*
  Validation (spec section 12). The spec asks for Zod schemas; this repo has
  no Zod, so these are plain checks that return one plain-words problem per
  field, the way the rest of the prototype validates. Step settings are
  checked against the registry fields at runtime, so a new step definition
  is validated with no code change.
*/
import type { Automation, AutomationStep, AutomationTrigger, RegistryField } from './types';
import { boardPlacement, stepDef, triggerDef } from './registry';
import { SMS_MAX, optOutLine, unknownVariables } from './messages';

export interface Problem {
  /** 'name' | 'trigger' | 'conditions' | 'steps' | a step id */
  where: string;
  field?: string;
  message: string;
}

export const LIMITS = { conditions: 5, steps: 15, perStage: 30, nameMin: 3, nameMax: 80 } as const;

const blank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

export function validateName(name: string, taken: string[], what = 'name'): string | undefined {
  const n = name.trim();
  if (n.length < LIMITS.nameMin) return `The ${what} needs at least ${LIMITS.nameMin} characters.`;
  if (n.length > LIMITS.nameMax) return `The ${what} can be at most ${LIMITS.nameMax} characters.`;
  if (taken.some((t) => t.trim().toLowerCase() === n.toLowerCase())) return `Another one already uses this ${what}.`;
  return undefined;
}

/** Is this field shown, given the other values? */
export function fieldVisible(field: RegistryField, config: Record<string, unknown>): boolean {
  if (!field.showIf) return true;
  return field.showIf.values.includes(config[field.showIf.key] as string | number | boolean);
}

/** One registry field's value. */
export function checkField(field: RegistryField, value: unknown, variables?: string[]): string | undefined {
  if (blank(value)) return field.required ? `${field.label} is required.` : undefined;
  if (field.kind === 'number' || field.kind === 'percent' || field.kind === 'money') {
    const n = Number(value);
    if (!Number.isFinite(n)) return `${field.label} must be a number.`;
    if (field.kind === 'money') {
      if (n < 0) return `${field.label} can't be negative.`;
      if (Math.round(n * 100) !== n * 100) return `${field.label} can have at most two decimals.`;
    }
    if (field.kind === 'percent' && (n < 0 || n > 100)) return `${field.label} must be between 0 and 100.`;
    if (field.min !== undefined && n < field.min) return `${field.label} must be at least ${field.min}.`;
    if (field.max !== undefined && n > field.max) return `${field.label} can be at most ${field.max}.`;
  }
  if (field.supportsVariables && typeof value === 'string' && variables) {
    const unknown = unknownVariables(value, variables);
    if (unknown.length) return `{{${unknown[0]}}}: this variable doesn't exist.`;
  }
  return undefined;
}

/** Required registry fields of one step (checked before "Done" in the step settings). */
export function validateStep(step: AutomationStep, variables?: string[]): Problem[] {
  const def = stepDef(step.type);
  if (!def) return [{ where: step.id, message: 'This step no longer exists.' }];
  const out: Problem[] = [];
  for (const field of def.fields) {
    if (!fieldVisible(field, step.config)) continue;
    const msg = checkField(field, step.config[field.key], variables);
    if (msg) out.push({ where: step.id, field: field.key, message: msg });
  }
  if (step.delay) {
    const { amount, unit } = step.delay;
    const max = unit === 'HOURS' ? 72 : 365;
    if (!Number.isFinite(amount) || amount < 0 || amount > max) out.push({ where: step.id, field: 'delay', message: unit === 'HOURS' ? 'A delay can be 0 to 72 hours.' : 'A delay can be 0 to 365 days.' });
  }
  if (step.type === 'WAIT_FOR_CONDITION') {
    const hours = Number(step.config.limitAmount) * (step.config.limitUnit === 'HOURS' ? 1 : 24);
    if (Number.isFinite(hours) && (hours < 1 || hours > 90 * 24)) out.push({ where: step.id, field: 'limitAmount', message: 'The time limit can be 1 hour to 90 days.' });
  }
  if (step.type === 'WAIT' && step.config.unit === 'HOURS' && Number(step.config.amount) > 72 * 5) {
    out.push({ where: step.id, field: 'amount', message: 'Use days for waits longer than 15 days.' });
  }
  if (step.conditions.length > LIMITS.conditions) out.push({ where: step.id, field: 'conditions', message: `A step can have up to ${LIMITS.conditions} conditions.` });
  for (const c of step.conditions) if (!c.field) out.push({ where: step.id, field: 'conditions', message: 'Pick a field for each condition.' });
  return out;
}

export function validateTrigger(t: AutomationTrigger): Problem[] {
  const def = triggerDef(t.type);
  if (!def) return [{ where: 'trigger', message: 'Pick what starts this automation.' }];
  const out: Problem[] = [];
  for (const field of def.fields) {
    const msg = checkField(field, t.config[field.key]);
    if (msg) out.push({ where: 'trigger', field: field.key, message: msg });
  }
  return out;
}

/**
 * An automation can't move a record into the stage that triggers it
 * (spec section 10, "Loops"): it would run forever.
 */
export function loopProblem(a: Pick<Automation, 'trigger' | 'steps'>): Problem | undefined {
  if (a.trigger.type !== 'STAGE_ENTERED' && a.trigger.type !== 'STAGE_DURATION') return undefined;
  const { pipeline, stage } = boardPlacement(a.trigger);
  for (const s of a.steps) {
    const def = stepDef(s.type);
    if (def?.movesTo?.module === pipeline && s.config.stage === stage) {
      return { where: s.id, field: 'stage', message: 'This would make the automation run forever. A step can’t move the record into the stage that starts it.' };
    }
  }
  return undefined;
}

export interface AutomationContext {
  /** Names of the business's other live automations. */
  otherNames: string[];
  /** Live automations already in the same stage column (not counting this one). */
  othersInStage?: number;
  variables?: string[];
}

/** Everything Save checks (spec 6.4 and section 12). */
export function validateAutomation(a: Pick<Automation, 'name' | 'trigger' | 'conditions' | 'steps'>, ctx: AutomationContext): Problem[] {
  const out: Problem[] = [];
  const nameMsg = validateName(a.name, ctx.otherNames);
  if (nameMsg) out.push({ where: 'name', message: nameMsg });
  out.push(...validateTrigger(a.trigger));
  if (a.conditions.length > LIMITS.conditions) out.push({ where: 'conditions', message: `Up to ${LIMITS.conditions} conditions.` });
  for (const c of a.conditions) if (!c.field) out.push({ where: 'conditions', message: 'Pick a field for each condition.' });
  if (a.steps.length > LIMITS.steps) out.push({ where: 'steps', message: `An automation can have up to ${LIMITS.steps} steps.` });
  const ordered = [...a.steps].sort((x, y) => x.order - y.order);
  for (const s of ordered) out.push(...validateStep(s, ctx.variables));
  const last = ordered[ordered.length - 1];
  if (last && (last.type === 'WAIT' || last.type === 'WAIT_UNTIL_DATE')) {
    out.push({ where: last.id, message: 'A wait at the end does nothing. Add a step after it or remove it.' });
  }
  const loop = loopProblem(a);
  if (loop) out.push(loop);
  if ((ctx.othersInStage ?? 0) >= LIMITS.perStage) out.push({ where: 'trigger', message: `A stage can hold up to ${LIMITS.perStage} automations.` });
  return out;
}

/** Turning on needs at least one step. */
export const canTurnOn = (a: Pick<Automation, 'steps'>) => (a.steps.length ? undefined : 'Add at least one step before turning this on.');

/* ---------- Messages ---------- */

export interface MessageDraft {
  name: string;
  channel: 'EMAIL' | 'SMS';
  subject?: string;
  body: string;
}

export function validateMessage(m: MessageDraft, ctx: { otherNames: string[]; orgName: string; variables?: string[] }): Problem[] {
  const out: Problem[] = [];
  const nameMsg = validateName(m.name, ctx.otherNames, 'message name');
  if (nameMsg) out.push({ where: 'name', message: nameMsg });
  if (m.channel === 'EMAIL') {
    const subject = (m.subject ?? '').trim();
    if (!subject) out.push({ where: 'subject', message: 'The subject is required.' });
    else if (subject.length > 150) out.push({ where: 'subject', message: 'The subject can be at most 150 characters.' });
  }
  if (!m.body.trim()) out.push({ where: 'body', message: 'Write the message.' });
  if (m.channel === 'SMS' && (m.body + optOutLine(ctx.orgName)).length > SMS_MAX) {
    out.push({ where: 'body', message: `A text can be at most ${SMS_MAX} characters (3 text parts), counting the opt-out line.` });
  }
  const unknown = unknownVariables(`${m.subject ?? ''} ${m.body}`, ctx.variables);
  if (unknown.length) out.push({ where: 'body', message: `{{${unknown[0]}}}: this variable doesn't exist.` });
  return out;
}
