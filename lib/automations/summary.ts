/*
  The one-line sentence every automation shows (spec section 2): "When a
  lead reaches Scheduled, create an estimate from the Interior Repaint
  template and assign the estimator." Built from the saved rule, never
  typed. Pure.
*/
import type { AutomationCondition, AutomationStep, AutomationTrigger, PipelineModule } from './types';
import { PENDING_EVENTS, RECORD_NOUN, ROLE_OPTIONS, WAIT_CONDITIONS, conditionField, dateFieldsOf, pipelineOf, stageLabel, watchedFields } from './registry';

export interface NameLookup {
  user: (id?: string) => string | undefined;
  message: (id?: string) => string | undefined;
  estimateTemplate: (id?: string) => string | undefined;
}

export const NO_NAMES: NameLookup = { user: () => undefined, message: () => undefined, estimateTemplate: () => undefined };

const article = (noun: string) => (/^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`);
const roleLabel = (r?: unknown) => ROLE_OPTIONS.find((o) => o.value === r)?.label.toLowerCase() ?? 'a role';
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
const unitWord = (u: unknown) => (u === 'HOURS' ? 'hour' : 'day');

function money(n: unknown): string {
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '$0';
}

export function joinAnd(parts: string[]): string {
  const p = parts.filter(Boolean);
  if (p.length <= 1) return p[0] ?? '';
  return `${p.slice(0, -1).join(', ')} and ${p[p.length - 1]}`;
}

export function triggerPhrase(t: AutomationTrigger): string {
  const pipeline = pipelineOf(t.module);
  const noun = RECORD_NOUN[t.module];
  const c = t.config;
  switch (t.type) {
    case 'RECORD_CREATED': return `When ${article(noun)} is created`;
    case 'STAGE_ENTERED': return `When ${article(noun)} reaches ${stageLabel(pipeline, String(c.stage ?? '')) || '…'}`;
    case 'STAGE_DURATION': return `When ${article(noun)} has been ${stageLabel(pipeline, String(c.stage ?? '')) || '…'} for ${plural(Number(c.days ?? 0), 'day')}`;
    case 'FIELD_CHANGED': {
      const label = watchedFields(pipeline).find((f) => f.value === c.field)?.label.toLowerCase() ?? 'a field';
      return `When ${article(noun)}'s ${label} changes${c.value ? ` to ${String(c.value)}` : ''}`;
    }
    case 'DATE_RELATIVE': {
      const label = dateFieldsOf(pipeline).find((f) => f.value === c.dateField)?.label.toLowerCase() ?? 'date';
      const amount = Number(c.amount ?? 0);
      if (!amount) return `On ${article(noun)}'s ${label}`;
      return `${plural(amount, unitWord(c.unit))} ${c.direction === 'AFTER' ? 'after' : 'before'} ${article(noun)}'s ${label}`;
    }
    case 'ESTIMATE_VIEWED': return 'When the customer views an estimate';
    case 'ESTIMATE_SIGNED': return 'When the customer signs an estimate';
    case 'ESTIMATE_READY': return 'When the estimator marks an estimate ready';
    case 'PAYMENT_RECORDED':
      return c.which === 'DEPOSIT' ? 'When a deposit is paid in full' : c.which === 'FULL' ? 'When an invoice is paid in full' : 'When a payment is recorded on an invoice';
    case 'APPOINTMENT_BOOKED':
      return c.change === 'CHANGED' ? 'When an estimate appointment is changed' : c.change === 'ANY' ? 'When an estimate appointment is booked or changed' : 'When an estimate appointment is booked';
    case 'TIME_SINCE_COMPLETION': {
      const m = Number(c.months ?? 0);
      const span = m % 12 === 0 ? plural(m / 12, 'year') : plural(m, 'month');
      return `${span} after a job is completed`;
    }
    case 'TOUCH_UP_SUBMITTED': return 'When a touch-up request is submitted';
    case 'PENDING_EVENT': return `When ${(PENDING_EVENTS.find((e) => e.value === c.event)?.label ?? 'the crew marks something').replace(/^./, (x) => x.toLowerCase())}`;
    default: return 'When something happens';
  }
}

function who(prefix: string, c: Record<string, unknown>, names: NameLookup): string {
  const to = c[`${prefix}To`];
  if (to === 'USER') return names.user(String(c[`${prefix}UserId`] ?? '')) ?? 'a person';
  if (to === 'ROLE') return `every ${roleLabel(c[`${prefix}Role`]).replace(/s$/, '')}`;
  if (to === 'CREW_LEAD') return 'the crew lead';
  if (to === 'ESTIMATOR') return 'the estimator';
  return 'the assigned person';
}

export function stepPhrase(step: Pick<AutomationStep, 'type' | 'config'>, names: NameLookup = NO_NAMES): string {
  const c = step.config ?? {};
  switch (step.type) {
    case 'MOVE_LEAD_STAGE': return `move the lead to ${stageLabel('LEAD', String(c.stage ?? '')) || '…'}`;
    case 'ASSIGN_LEAD_OWNER':
      return c.how === 'USER' ? `assign the lead to ${names.user(String(c.userId ?? '')) ?? 'a person'}` : `assign an owner from the ${roleLabel(c.role)} in turn`;
    case 'SET_LEAD_FIELD': return c.field === 'note' ? 'add a note to the lead' : `set the lead source to ${String(c.value ?? '…')}`;
    case 'CREATE_LEAD': return `create a lead with source "${String(c.source ?? 'Repaint alert')}"`;
    case 'ADD_CONTACT_NOTE': return 'add a contact note';
    case 'CREATE_APPOINTMENT': return 'book an estimate appointment';
    case 'CREATE_ESTIMATE_FROM_TEMPLATE': {
      const n = names.estimateTemplate(String(c.estimateTemplateId ?? ''));
      return n ? `create an estimate from the ${n} template` : 'create an estimate from a template';
    }
    case 'CREATE_ESTIMATE_FROM_LAST_JOB': return "create an estimate from the customer's last job";
    case 'ASSIGN_ESTIMATOR': return c.who === 'USER' ? `assign ${names.user(String(c.userId ?? '')) ?? 'a person'} as estimator` : 'assign the estimator';
    case 'SEND_ESTIMATE': return 'send the estimate';
    case 'MOVE_JOB_STAGE': return `move the job to ${stageLabel('JOB', String(c.stage ?? '')) || '…'}`;
    case 'ASSIGN_CREW_LEAD': return `assign ${names.user(String(c.userId ?? '')) ?? 'a crew lead'} as crew lead`;
    case 'BOOK_SCHEDULE': return 'book the schedule';
    case 'CONFIRM_DEPOSIT': return 'confirm the deposit';
    case 'START_JOB': return 'start the job';
    case 'CREATE_INVOICE': {
      const type = String(c.invoiceType ?? 'DEPOSIT').toLowerCase();
      const amount = c.amountKind === 'REMAINING' ? 'for the remaining balance' : c.amountKind === 'FIXED' ? `for ${money(c.amount)}` : `for ${Number(c.percent ?? 0)}% of the estimate`;
      return `create ${article(type)} invoice ${amount}`;
    }
    case 'SEND_INVOICE': return c.which === 'DEPOSIT' ? 'send the deposit invoice' : c.which === 'FINAL' ? 'send the final invoice' : 'send the invoice';
    case 'CHECK_PAYMENT': return 'check every invoice is paid';
    case 'NOTIFY_TEAM': return `notify ${who('notify', c, names)}`;
    case 'CREATE_TASK': return `create a task "${String(c.title ?? '')}" for ${who('assign', c, names)}`;
    case 'ADD_NOTE': return 'add a note';
    case 'SEND_EMAIL': { const n = names.message(String(c.messageId ?? '')); return n ? `send the "${n}" email` : 'send an email'; }
    case 'SEND_TEXT': { const n = names.message(String(c.messageId ?? '')); return n ? `send the "${n}" text` : 'send a text'; }
    case 'WAIT': return `wait ${plural(Number(c.amount ?? 0), unitWord(c.unit))}`;
    case 'WAIT_UNTIL_DATE': {
      const pipeline = (String(c.module ?? 'JOB') as PipelineModule);
      const label = dateFieldsOf(pipeline).find((f) => f.value === c.dateField)?.label.toLowerCase() ?? 'a date';
      const off = Number(c.offsetDays ?? 0);
      return off ? `wait until ${plural(Math.abs(off), 'day')} ${off < 0 ? 'before' : 'after'} the ${label}` : `wait until the ${label}`;
    }
    case 'WAIT_FOR_CONDITION': {
      const label = WAIT_CONDITIONS.find((w) => w.value === c.condition)?.label.replace(/^The /, 'the ') ?? 'something happens';
      return `wait until ${label} (up to ${plural(Number(c.limitAmount ?? 0), unitWord(c.limitUnit))})`;
    }
    default: return step.type.toLowerCase().replace(/_/g, ' ');
  }
}

const OP: Record<AutomationCondition['operator'], string> = { IS: 'is', IS_NOT: 'is not', IS_ANY_OF: 'is any of', IS_EMPTY: 'is empty', IS_NOT_EMPTY: 'is not empty', GT: 'is over', LT: 'is under' };

export function conditionPhrase(c: AutomationCondition, names: NameLookup = NO_NAMES): string {
  const field = conditionField(c.field);
  const label = (field?.label ?? c.field).replace(/^./, (x) => x.toLowerCase());
  if (c.operator === 'IS_EMPTY' || c.operator === 'IS_NOT_EMPTY') return `${label} ${OP[c.operator]}`;
  const show = (v: unknown) => {
    if (field?.kind === 'money') return money(v);
    if (field?.kind === 'boolean') return v === 'true' || v === true ? 'yes' : 'no';
    if (field?.kind === 'user') return names.user(String(v)) ?? String(v);
    if (field?.kind === 'stage' && field.pipelineFrom) return stageLabel(field.pipelineFrom as PipelineModule, String(v));
    return field?.options?.find((o) => o.value === v)?.label ?? String(v ?? '');
  };
  if (field?.kind === 'boolean') return c.value === 'true' || c.value === (true as unknown) ? label : `not ${label}`;
  const value = Array.isArray(c.value) ? joinAnd(c.value.map(show)).replace(/ and ([^,]+)$/, ' or $1') : show(c.value);
  return `${label} ${OP[c.operator]} ${value}`;
}

/** The whole sentence. */
export function summarize(a: { trigger: AutomationTrigger; conditions: AutomationCondition[]; steps: AutomationStep[] }, names: NameLookup = NO_NAMES): string {
  const when = triggerPhrase(a.trigger);
  const only = a.conditions.length ? `, if ${joinAnd(a.conditions.map((c) => conditionPhrase(c, names)))}` : '';
  const steps = [...a.steps].sort((x, y) => x.order - y.order).map((s, i) => {
    const phrase = stepPhrase(s, names);
    const delay = s.delay && s.delay.amount > 0 ? `${i ? 'then ' : ''}after ${plural(s.delay.amount, s.delay.unit === 'HOURS' ? 'hour' : s.delay.workingDaysOnly ? 'working day' : 'day')}, ` : '';
    return `${delay}${phrase}`;
  });
  if (!steps.length) return `${when}${only}, do nothing yet.`;
  return `${when}${only}, ${joinAnd(steps)}.`;
}
