/*
  Automations: drop rules, plain sentences, validation, readiness and the
  system templates.
*/
import { describe, expect, it } from 'vitest';
import type { Automation, AutomationStep } from './types';
import { canDrop, type DropContext } from './drop-rules';
import { summarize, type NameLookup } from './summary';
import { validateAutomation, validateMessage } from './validation';
import { checkReadiness } from './readiness';
import { emptyState } from './state';
import { SYSTEM_TEMPLATES } from './templates';
import { boardPlacement, stepAllowedAt, stepDef, variablesFor } from './registry';
import { smsParts, unknownVariables } from './messages';

const st = (id: string, type: string, config: Record<string, unknown> = {}): AutomationStep => ({ id, order: 0, type, mode: 'AUTO', conditions: [], config });
const auto = (id: string, trigger: Automation['trigger'], steps: AutomationStep[], journeyId?: string): Automation => ({
  id, name: id, summary: '', trigger, conditions: [], steps, runOrder: 0, isEnabled: false, needsReapproval: false, isArchived: false, isDeleted: false,
  runsLast7Days: 0, problemCount: 0, createdBy: 'U-OWNER', updatedBy: 'U-OWNER', createdAt: '', updatedAt: '', journeyId,
});
const ctx = (automations: Automation[], extra: Partial<DropContext> = {}): DropContext => ({ canManage: true, automations, templates: SYSTEM_TEMPLATES, textingReleased: false, flags: { 'new-job-scheduling': true }, ...extra });

describe('drop rules', () => {
  const accepted = auto('a1', { type: 'STAGE_ENTERED', module: 'ESTIMATE', config: { stage: 'ACCEPTED' } }, [st('s1', 'CREATE_INVOICE', { invoiceType: 'DEPOSIT' })], 'j1');
  const scheduled = auto('a2', { type: 'STAGE_ENTERED', module: 'LEAD', config: { stage: 'SCHEDULED' } }, [], 'j1');

  it('blocks a final invoice on Leads › New: a lead has no job yet', () => {
    const r = canDrop({ kind: 'step', type: 'CREATE_INVOICE' }, { kind: 'new', pipeline: 'LEAD', stage: 'NEW' }, ctx([]));
    expect(r).toEqual({ ok: false, reason: 'A lead has no job yet. Use this step from Work Orders or Jobs.' });
  });

  it('blocks a stage on its own column', () => {
    expect(canDrop({ kind: 'stage', pipeline: 'LEAD', stage: 'NEW' }, { kind: 'new', pipeline: 'LEAD', stage: 'NEW' }, ctx([]))).toEqual({ ok: false, reason: 'This would make the automation run forever.' });
    expect(canDrop({ kind: 'stage', pipeline: 'LEAD', stage: 'SCHEDULED' }, { kind: 'zone', automationId: 'a2', index: 0 }, ctx([scheduled])).ok).toBe(false);
  });

  it('blocks a second deposit invoice in one journey and says where the first is', () => {
    const wo = auto('a3', { type: 'STAGE_ENTERED', module: 'WORK_ORDER', config: { stage: 'UNSCHEDULED' } }, [], 'j1');
    const r = canDrop({ kind: 'step', type: 'CREATE_INVOICE' }, { kind: 'zone', automationId: 'a3', index: 0 }, ctx([accepted, wo]));
    expect(r).toEqual({ ok: false, reason: 'This journey already creates a deposit invoice in Estimates › Accepted.' });
  });

  it('blocks a 16th step, locked texts, and everything for view-only users', () => {
    const full = auto('a4', { type: 'STAGE_ENTERED', module: 'JOB', config: { stage: 'CONFIRMED' } }, Array.from({ length: 15 }, (_, i) => st(`x${i}`, 'ADD_NOTE', { text: 'x' })));
    expect(canDrop({ kind: 'step', type: 'ADD_NOTE' }, { kind: 'zone', automationId: 'a4', index: 0 }, ctx([full])).ok).toBe(false);
    expect(canDrop({ kind: 'step', type: 'SEND_TEXT' }, { kind: 'new', pipeline: 'JOB', stage: 'CONFIRMED' }, ctx([]))).toEqual({ ok: false, reason: "Texting isn't switched on yet." });
    expect(canDrop({ kind: 'step', type: 'ADD_NOTE' }, { kind: 'new', pipeline: 'JOB', stage: 'CONFIRMED' }, ctx([], { canManage: false })).ok).toBe(false);
  });

  it('allows a message, and reordering steps within an automation', () => {
    expect(canDrop({ kind: 'message', id: 'm', channel: 'EMAIL' }, { kind: 'zone', automationId: 'a2', index: 0 }, ctx([scheduled])).ok).toBe(true);
    const two = auto('a5', { type: 'STAGE_ENTERED', module: 'JOB', config: { stage: 'CONFIRMED' } }, [st('p', 'ADD_NOTE', { text: 'a' }), st('q', 'ADD_NOTE', { text: 'b' })]);
    expect(canDrop({ kind: 'card', automationId: 'a5', stepId: 'q' }, { kind: 'zone', automationId: 'a5', index: 0 }, ctx([two])).ok).toBe(true);
  });
});

describe('plain sentences', () => {
  const names: NameLookup = { user: () => undefined, message: () => undefined, estimateTemplate: (id) => (id === 'tpl' ? 'Interior Repaint' : undefined) };
  it('reads out loud', () => {
    const a = auto('a', { type: 'STAGE_ENTERED', module: 'LEAD', config: { stage: 'SCHEDULED' } }, [st('1', 'CREATE_ESTIMATE_FROM_TEMPLATE', { estimateTemplateId: 'tpl' }), st('2', 'ASSIGN_ESTIMATOR', { who: 'LEAD_OWNER' })]);
    expect(summarize(a, names)).toBe('When a lead reaches Scheduled, create an estimate from the Interior Repaint template and assign the estimator.');
  });
  it('includes delays and conditions', () => {
    const a = auto('a', { type: 'STAGE_DURATION', module: 'INVOICE', config: { stage: 'SENT', days: 3 } }, [{ ...st('1', 'CREATE_TASK', { title: 'Chase', assignTo: 'ROLE', assignRole: 'office_manager' }), delay: { amount: 2, unit: 'DAYS', workingDaysOnly: false } }]);
    a.conditions = [{ id: 'c', field: 'invoice.amount', operator: 'GT', value: 1000 }];
    expect(summarize(a)).toBe('When an invoice has been Sent for 3 days, if invoice amount is over $1,000, after 2 days, create a task "Chase" for every office manager.');
  });
});

describe('validation', () => {
  const t = { type: 'STAGE_ENTERED', module: 'JOB' as const, config: { stage: 'CONFIRMED' } };
  it('checks names, required settings, waits at the end and loops', () => {
    const p = validateAutomation({ name: 'ab', trigger: t, conditions: [], steps: [st('1', 'CREATE_INVOICE', { invoiceType: 'DEPOSIT', amountKind: 'PERCENT', percent: 120 }), st('2', 'WAIT', { amount: 2, unit: 'DAYS' })] }, { otherNames: [] });
    const text = p.map((x) => x.message);
    expect(text).toContain('The name needs at least 3 characters.');
    expect(text).toContain('Percent must be between 0 and 100.');
    expect(text).toContain('A wait at the end does nothing. Add a step after it or remove it.');
    const loop = validateAutomation({ name: 'Loop', trigger: t, conditions: [], steps: [st('1', 'MOVE_JOB_STAGE', { stage: 'CONFIRMED' })] }, { otherNames: [] });
    expect(loop.some((x) => x.message.startsWith('This would make the automation run forever'))).toBe(true);
  });
  it('checks messages: subject, text length with the opt-out line, unknown variables', () => {
    expect(validateMessage({ name: 'Hello there', channel: 'EMAIL', subject: '', body: 'Hi {{nope}}' }, { otherNames: [], orgName: 'Acme' }).map((x) => x.message))
      .toEqual(['The subject is required.', "{{nope}}: this variable doesn't exist."]);
    expect(validateMessage({ name: 'Long text', channel: 'SMS', body: 'x'.repeat(470) }, { otherNames: [], orgName: 'Acme' })[0]!.message).toMatch(/at most 480/);
    expect(smsParts('x'.repeat(100), 'Acme')).toEqual({ chars: 100 + ' – Acme. Reply STOP to opt out'.length, parts: 1 });
  });
});

describe('readiness', () => {
  it('blocks a deleted message and a step that can never run; warns about review links and texting', () => {
    const a = auto('a', { type: 'STAGE_ENTERED', module: 'LEAD', config: { stage: 'NEW' } }, [st('1', 'SEND_EMAIL', { messageId: 'gone' }), st('2', 'CONFIRM_DEPOSIT'), st('3', 'SEND_TEXT', { messageId: 'm' })]);
    const r = checkReadiness([a], emptyState(), { db: { users: [] }, messages: [{ id: 'm', name: 'Review', channel: 'SMS', body: 'Review us {{reviewLink}}', isSample: false, version: 1, usedInAutomationIds: [], updatedBy: '', updatedAt: '' }], estimateTemplates: [], all: [a] });
    expect(r.ok).toBe(false);
    const msgs = r.items.map((i) => i.message).join('\n');
    expect(msgs).toContain('uses a message that was deleted');
    expect(msgs).toContain('can never run here');
    expect(msgs).toContain('no review link');
    expect(msgs).toContain("texting isn't switched on yet");
  });
  it('the journey walk warns where a record could sit with nobody told', () => {
    const s = emptyState();
    s.stuck.JOB = { TOUCH_UP: { hours: 72, from: 'STAGE_ENTRY', enabled: false } };
    const a = auto('a', { type: 'STAGE_ENTERED', module: 'JOB', config: { stage: 'IN_PRODUCTION' } }, [st('1', 'ADD_NOTE', { text: 'x' })], 'j');
    const b = auto('b', { type: 'STAGE_ENTERED', module: 'JOB', config: { stage: 'READY_FOR_INSPECTION' } }, [st('1', 'ADD_NOTE', { text: 'x' })], 'j');
    const r = checkReadiness([a, b], s, { db: { users: [] }, messages: [], estimateTemplates: [], all: [a, b] }, 'j');
    expect(r.items.some((i) => i.message === 'Jobs could sit at Touch Up with nobody told. Add a step or a stuck alert there.')).toBe(true);
  });
});

describe('system templates', () => {
  it('ships the six journeys', () => {
    expect(SYSTEM_TEMPLATES.filter((t) => t.kind === 'JOURNEY').map((t) => t.name)).toEqual(['Interior Repaint', 'Exterior Repaint', 'Cabinet Refinishing', 'Commercial', 'Returning Customer Repaint', 'Touch-up and Warranty Visit']);
  });
  it('every step exists, can run where it is placed and uses known variables', () => {
    for (const t of SYSTEM_TEMPLATES) {
      for (const a of t.automations) {
        const p = boardPlacement(a.trigger);
        for (const s of a.steps) {
          const def = stepDef(s.type);
          expect(def, `${t.name} › ${a.name} › ${s.type}`).toBeTruthy();
          expect(stepAllowedAt(def!, p.pipeline, p.stage).ok, `${t.name} › ${a.name} › ${s.type}`).toBe(true);
          for (const v of Object.values(s.config)) if (typeof v === 'string') expect(unknownVariables(v, variablesFor(p.pipeline, p.stage)), `${t.name} › ${a.name}`).toEqual([]);
        }
      }
    }
  });
  it('blanks point at real steps and fields', () => {
    for (const t of SYSTEM_TEMPLATES) for (const b of t.blanks) {
      const s = t.automations[b.automationIndex]?.steps.find((x) => x.id === b.stepId);
      expect(s && stepDef(s.type)?.fields.some((f) => f.key === b.fieldKey), `${t.name}: ${b.question}`).toBe(true);
    }
  });
});
