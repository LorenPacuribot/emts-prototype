/*
  Readiness check (spec section 10), POST /automations/readiness. Runs
  first in the Deploy modal. Blockers stop the deploy; warnings let the
  user continue. For a journey it walks every stage the journey covers and
  lists any stage where a record could stop with no next step and no alert.
  Pure.
*/
import type { Database as FDb } from '@/features/types';
import type { Automation, CustomerMessage, PipelineModule, ReadinessItem, ReadinessResult } from './types';
import type { EngineState } from './state';
import { MODULE_LABEL, RECORD_NOUN, boardPlacement, stageLabel, stagesOf, stepAllowedAt, stepDef, triggerDef, variablesFor } from './registry';
import { loopProblem, validateStep, validateTrigger } from './validation';
import { unknownVariables } from './messages';
import { stuckSettingFor } from './engine';

export interface ReadinessContext {
  db: Pick<FDb, 'users'>;
  messages: CustomerMessage[];
  estimateTemplates: { id: string; name: string }[];
  reviewLink?: string;
  /** All automations of the business (for "two automations change the same field"). */
  all: Automation[];
}

const PERSON_KEYS = ['userId', 'notifyUserId', 'assignUserId'];

function stepLabel(a: Automation, stepId?: string): string {
  const i = a.steps.findIndex((s) => s.id === stepId);
  return i >= 0 ? `${a.name}, step ${i + 1} (${stepDef(a.steps[i]!.type)?.title ?? 'step'})` : a.name;
}

export function checkAutomation(a: Automation, s: EngineState, ctx: ReadinessContext): ReadinessItem[] {
  const items: ReadinessItem[] = [];
  const block = (message: string, stepId?: string) => items.push({ level: 'BLOCK', message, automationId: a.id, stepId });
  const warn = (message: string, stepId?: string) => items.push({ level: 'WARN', message, automationId: a.id, stepId });
  const place = boardPlacement(a.trigger);
  const vars = variablesFor(place.pipeline, place.stage);

  for (const p of validateTrigger(a.trigger)) block(`${a.name}: ${p.message}`);
  const tdef = triggerDef(a.trigger.type);
  if (tdef?.backendGap) warn(`${a.name}: ${tdef.backendGap}`);
  if (!a.steps.length) block(`${a.name} has no steps yet.`);
  const loop = loopProblem(a);
  if (loop) block(`${stepLabel(a, loop.where)}: ${loop.message}`, loop.where);

  for (const step of a.steps) {
    const def = stepDef(step.type);
    const label = stepLabel(a, step.id);
    if (!def) { block(`${label}: this step no longer exists.`, step.id); continue; }
    for (const p of validateStep(step, vars)) block(`${label}: ${p.message}`, step.id);
    const allowed = stepAllowedAt(def, place.pipeline, place.stage);
    if (!allowed.ok) block(`${label} can never run here. ${allowed.reason}`, step.id);
    for (const key of PERSON_KEYS) {
      const id = step.config[key];
      if (typeof id === 'string' && id && !ctx.db.users.some((u) => u.id === id)) block(`${label} points to a person who no longer exists.`, step.id);
    }
    if (step.config.estimateTemplateId && !ctx.estimateTemplates.some((t) => t.id === step.config.estimateTemplateId)) block(`${label} uses an estimate template that was deleted.`, step.id);
    if (typeof step.config.messageId === 'string' && step.config.messageId) {
      const m = ctx.messages.find((x) => x.id === step.config.messageId);
      if (!m) block(`${label} uses a message that was deleted.`, step.id);
      else {
        const unknown = unknownVariables(`${m.subject ?? ''} ${m.body}`, vars);
        if (unknown.length) block(`${label}: the message "${m.name}" uses {{${unknown[0]}}}, which doesn't exist for a ${RECORD_NOUN[place.pipeline]}.`, step.id);
        if (/\{\{\s*reviewLink\s*\}\}/.test(m.body) && !ctx.reviewLink?.trim()) warn(`${label} sends a review request, but Settings › Business Profile has no review link.`, step.id);
      }
    }
    if (def.backendGap) warn(`${label}: ${def.backendGap}`, step.id);
    if (def.requiresRelease === 'texting' && !s.settings.textingReleased) warn(`${label} is a text, but texting isn't switched on yet. It will be skipped.`, step.id);
    if (def.requiresFeatureFlag && !s.settings.flags[def.requiresFeatureFlag]) block(`${label} needs the new job scheduling. Use a "schedule this job" task instead.`, step.id);
    if (step.type === 'WAIT_FOR_CONDITION' && step.config.condition === 'WEATHER_CONFIRMED') warn(`${label} waits for the weather confirmation event, which the backend doesn't send yet. It will always reach its time limit.`, step.id);
  }
  if (a.steps.some((st) => stepDef(st.type)?.customerFacing) && !s.settings.sending.provider) {
    warn(`${a.name} messages customers, and no sending provider is set up yet. Messages are recorded, not delivered (sandbox).`);
  }
  // Two automations on the same stage change the same field.
  const changes = (x: Automation) => x.steps.map((st) => (stepDef(st.type)?.movesTo ? `${st.type}` : st.type.startsWith('ASSIGN_') ? st.type : '')).filter(Boolean);
  const mine = new Set(changes(a));
  for (const other of ctx.all) {
    if (other.id === a.id || other.isDeleted || other.isArchived) continue;
    const op = boardPlacement(other.trigger);
    if (op.pipeline !== place.pipeline || op.stage !== place.stage) continue;
    const clash = changes(other).find((c) => mine.has(c));
    if (clash) warn(`${a.name} and ${other.name} both ${(stepDef(clash)?.title ?? 'change the same field').toLowerCase()} at ${stageLabel(place.pipeline, place.stage)}.`);
  }
  if (!items.some((i) => i.level === 'BLOCK')) items.unshift({ level: 'PASS', message: `${a.name}: every step is set up.`, automationId: a.id });
  return items;
}

/** Readiness for some automations, or for a whole journey (with the stage walk). */
export function checkReadiness(automations: Automation[], s: EngineState, ctx: ReadinessContext, journeyId?: string): ReadinessResult {
  const items: ReadinessItem[] = automations.flatMap((a) => checkAutomation(a, s, ctx));
  const all = automations;
  const createsFinal = all.some((a) => a.steps.some((st) => (st.type === 'CREATE_INVOICE' && st.config.invoiceType === 'FINAL') || (st.type === 'SEND_INVOICE' && st.config.which === 'FINAL')));
  if (createsFinal) {
    const chased = ctx.all.some((a) => !a.isDeleted && boardPlacement(a.trigger).pipeline === 'INVOICE' && ['OVERDUE', 'SENT', 'PARTIAL'].includes(boardPlacement(a.trigger).stage))
      || stuckSettingFor(s, 'INVOICE', 'SENT')?.enabled;
    if (!chased) items.push({ level: 'WARN', message: 'This creates a final invoice, but nothing chases it if it is not paid.' });
  }
  if (journeyId) {
    // Walk each pipeline the journey covers, first to last stage it uses.
    const byPipeline = new Map<PipelineModule, number[]>();
    for (const a of all) {
      const p = boardPlacement(a.trigger);
      const idx = stagesOf(p.pipeline).findIndex((x) => x.value === p.stage);
      byPipeline.set(p.pipeline, [...(byPipeline.get(p.pipeline) ?? []), idx]);
    }
    for (const [pipeline, idxs] of byPipeline) {
      const stages = stagesOf(pipeline);
      for (let i = Math.min(...idxs); i <= Math.max(...idxs); i++) {
        const st = stages[i];
        if (!st || st.terminal) continue;
        const handled = all.some((a) => { const p = boardPlacement(a.trigger); return p.pipeline === pipeline && p.stage === st.value; });
        const alert = stuckSettingFor(s, pipeline, st.value)?.enabled;
        if (!handled && !alert) {
          items.push({ level: 'WARN', message: `${MODULE_LABEL[pipeline]} could sit at ${st.label} with nobody told. Add a step or a stuck alert there.` });
        }
      }
    }
    items.push({ level: 'PASS', message: 'The whole journey was walked stage by stage.' });
  }
  return { ok: !items.some((i) => i.level === 'BLOCK'), items };
}
