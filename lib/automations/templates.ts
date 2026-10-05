/*
  System templates (spec section 9): six journeys and a few single
  automations. Customer steps point at sample messages (lib/automations/
  messages.ts); applying a template copies the samples it uses into the
  business's library, so the user can edit them.

  Where the live code works differently from the spec's journey table,
  the journey follows the code:
    - Accepting an estimate already moves the lead to Sold (built in), so
      "Move lead to Sold" shows as Skipped.
    - Scheduled and In Production are set by the work order, so the "Move
      job" steps after booking and starting show as Skipped.
    - The work order's closeout (Mark Complete) is the crew lead's
      inspection and closes the job, so the job goes straight to Completed.
    - The acceptance draft invoice carries the deposit and later the
      remaining balance, so "Create final invoice" reuses it.
    - Invoices are due 15 days after they are created (fixed in the app).
  Pure.
*/
import type { AutomationCondition, AutomationStep, AutomationTemplate, AutomationTrigger, TemplateAutomation } from './types';
import { defaultConfig } from './drop-rules';

let seq = 0;
const sid = () => `ts${++seq}`;

function step(type: string, config: Record<string, unknown> = {}, extra: Partial<AutomationStep> = {}): AutomationStep {
  return { id: sid(), order: 0, type, mode: 'AUTO', conditions: [], config: { ...defaultConfig(type), ...config }, ...extra };
}
const when = (type: string, module: AutomationTrigger['module'], config: Record<string, unknown> = {}): AutomationTrigger => ({ type, module, config });
const only = (field: string, operator: AutomationCondition['operator'], value?: AutomationCondition['value']): AutomationCondition => ({ id: sid(), field, operator, value });
function auto(name: string, trigger: AutomationTrigger, steps: AutomationStep[], conditions: AutomationCondition[] = []): TemplateAutomation {
  return { name, trigger, conditions, steps: steps.map((s, i) => ({ ...s, order: i })) };
}
const days = (n: number) => ({ amount: n, unit: 'DAYS' as const, workingDaysOnly: false });

const UPDATED = '2026-10-06T00:00:00.000Z';

interface Options {
  estimateTemplateId?: string;
  depositPercent?: number;
  repaintMonths?: number;
  welcome?: 'sample_lead_received' | 'sample_welcome_back';
  returning?: boolean;
  exterior?: boolean;
  cabinets?: boolean;
  commercial?: boolean;
}

/** The Interior Repaint journey, with the switches the other journeys change. */
function journey(o: Options): { automations: TemplateAutomation[]; blanks: AutomationTemplate['blanks'] } {
  const blanks: AutomationTemplate['blanks'] = [];
  const list: TemplateAutomation[] = [];
  const blank = (automationIndex: number, s: AutomationStep, fieldKey: string, question: string) => blanks.push({ automationIndex, stepId: s.id, fieldKey, question });

  // 1. Lead created
  const assign = o.commercial ? step('ASSIGN_LEAD_OWNER', { how: 'USER', userId: '' }) : step('ASSIGN_LEAD_OWNER', { how: 'ROUND_ROBIN', role: 'estimators' });
  list.push(auto(o.returning ? 'Welcome back' : 'New lead welcome', when('RECORD_CREATED', 'LEAD'), [
    assign,
    step('SEND_EMAIL', { messageId: o.welcome ?? 'sample_lead_received' }),
    step('NOTIFY_TEAM', { notifyTo: 'ASSIGNED', channel: 'IN_APP', text: 'New lead from {{customerName}}' }),
    step('CREATE_TASK', { title: 'Call {{customerName}} within 1 hour', assignTo: 'ASSIGNED', dueInDays: 0 }),
  ], o.returning ? [only('customer.returning', 'IS', 'true')] : []));
  if (o.commercial) blank(list.length - 1, assign, 'userId', 'Who is the commercial estimator?');

  // 2. Lead reaches Scheduled
  const create = o.returning ? step('CREATE_ESTIMATE_FROM_LAST_JOB') : step('CREATE_ESTIMATE_FROM_TEMPLATE', { estimateTemplateId: o.estimateTemplateId ?? '' });
  list.push(auto('Estimate visit', when('STAGE_ENTERED', 'LEAD', { stage: 'SCHEDULED' }), [
    step('CREATE_APPOINTMENT'),
    step('SEND_EMAIL', { messageId: 'sample_appointment_confirmed' }),
    create,
    step('ASSIGN_ESTIMATOR', { who: 'LEAD_OWNER' }),
  ]));
  if (!o.returning) blank(list.length - 1, create, 'estimateTemplateId', 'Which estimate template?');

  // 3. Day before the appointment
  list.push(auto('See you tomorrow', when('DATE_RELATIVE', 'LEAD', { dateField: 'appointmentAt', direction: 'BEFORE', amount: 1, unit: 'DAYS' }), [
    step('SEND_TEXT', { messageId: 'sample_see_you_tomorrow' }),
  ]));

  // 4. Estimator marks it ready
  list.push(auto('Send the estimate', when('ESTIMATE_READY', 'ESTIMATE'), [step('SEND_ESTIMATE', { messageId: 'sample_estimate_sent' })]));

  // 5. Sent for 3 days, not signed
  list.push(auto('Estimate follow-up', when('STAGE_DURATION', 'ESTIMATE', { stage: 'SENT', days: 3 }), [
    step('SEND_EMAIL', { messageId: 'sample_estimate_follow_up' }),
    step('CREATE_TASK', { title: 'Follow up on the estimate for {{customerName}}', assignTo: 'ESTIMATOR', dueInDays: 1 }),
  ]));

  // 6. Estimate accepted (built in: job, work order and draft invoice)
  const deposit = step('CREATE_INVOICE', { invoiceType: 'DEPOSIT', amountKind: 'PERCENT', ...(o.depositPercent !== undefined ? { percent: o.depositPercent } : {}) },
    o.commercial ? { conditions: [only('estimate.total', 'GT', 10000)] } : {});
  list.push(auto('Deposit invoice', when('STAGE_ENTERED', 'ESTIMATE', { stage: 'ACCEPTED' }), [
    step('MOVE_LEAD_STAGE', { stage: 'SOLD' }),
    deposit,
    step('SEND_INVOICE', { which: 'DEPOSIT', messageId: 'sample_deposit_invoice' }, o.commercial ? { conditions: [only('estimate.total', 'GT', 10000)] } : {}),
  ]));
  blank(list.length - 1, deposit, 'percent', 'Deposit percent?');

  // 7. Wait for the deposit, up to 5 days
  list.push(auto('Deposit chase', when('STAGE_ENTERED', 'ESTIMATE', { stage: 'ACCEPTED' }), [
    step('WAIT_FOR_CONDITION', { condition: 'DEPOSIT_PAID', limitAmount: 5, limitUnit: 'DAYS', onTimeout: 'CARRY_ON' }),
    step('SEND_EMAIL', { messageId: 'sample_deposit_reminder' }, { conditions: [only('job.depositPaid', 'IS', 'false')] }),
    step('NOTIFY_TEAM', { notifyTo: 'ROLE', notifyRole: 'office_manager', channel: 'IN_APP', text: 'Deposit not paid yet for {{projectName}}' }, { conditions: [only('job.depositPaid', 'IS', 'false')] }),
  ], o.commercial ? [only('estimate.total', 'GT', 10000)] : []));

  // 8. Deposit paid
  list.push(auto('Book the job', when('PAYMENT_RECORDED', 'INVOICE', { which: 'DEPOSIT' }), [
    step('CONFIRM_DEPOSIT'),
    step('BOOK_SCHEDULE'),
    step('MOVE_JOB_STAGE', { stage: 'SCHEDULED' }),
    step('SEND_EMAIL', { messageId: 'sample_start_confirmed' }),
    step('NOTIFY_TEAM', { notifyTo: 'CREW_LEAD', channel: 'IN_APP', text: 'New job booked: {{projectName}} starts {{startDate}}' }),
  ]));

  if (o.cabinets) {
    list.push(auto('Colour approval', when('PAYMENT_RECORDED', 'INVOICE', { which: 'DEPOSIT' }), [
      step('SEND_EMAIL', { messageId: 'sample_approve_colours' }),
      step('WAIT_FOR_CONDITION', { condition: 'COLOURS_APPROVED', limitAmount: 3, limitUnit: 'DAYS', onTimeout: 'CARRY_ON' }),
      step('SEND_EMAIL', { messageId: 'sample_approve_colours' }, { conditions: [only('job.coloursApproved', 'IS', 'false')] }),
      step('WAIT_FOR_CONDITION', { condition: 'COLOURS_APPROVED', limitAmount: 4, limitUnit: 'DAYS', onTimeout: 'CARRY_ON' }),
      step('NOTIFY_TEAM', { notifyTo: 'ROLE', notifyRole: 'office_manager', channel: 'IN_APP', text: 'Colours still not approved for {{projectName}}' }, { conditions: [only('job.coloursApproved', 'IS', 'false')] }),
    ]));
  }

  // 9. Two days before the start date
  list.push(auto('Start reminder', when('DATE_RELATIVE', 'JOB', { dateField: 'startDate', direction: 'BEFORE', amount: 2, unit: 'DAYS' }), [
    ...(o.exterior ? [step('CREATE_TASK', { title: 'Check the weather for {{startDate}}', assignTo: 'CREW_LEAD', dueInDays: 1 })] : []),
    step('SEND_TEXT', { messageId: 'sample_we_start_monday' }),
  ]));

  if (o.exterior) {
    list.push(auto('Weather delay', when('PENDING_EVENT', 'JOB', { event: 'WEATHER_DELAY' }), [
      step('SEND_EMAIL', { messageId: 'sample_moving_start' }),
      step('CREATE_TASK', { title: 'Book the next free dates for {{projectName}}', assignTo: 'ROLE', assignRole: 'office_manager', dueInDays: 0 }),
    ]));
  }

  // 10. Start date arrives
  list.push(auto('Start day', when('DATE_RELATIVE', 'WORK_ORDER', { dateField: 'startDate', direction: 'BEFORE', amount: 0, unit: 'DAYS' }), [
    ...(o.exterior ? [step('WAIT_FOR_CONDITION', { condition: 'WEATHER_CONFIRMED', limitAmount: 2, limitUnit: 'HOURS', onTimeout: 'CARRY_ON' })] : []),
    step('START_JOB'),
    step('MOVE_JOB_STAGE', { stage: 'IN_PRODUCTION' }),
  ]));

  if (o.commercial) {
    const progress = step('CREATE_INVOICE', { invoiceType: 'PROGRESS', amountKind: 'PERCENT', percent: 25 });
    list.push(auto('Progress invoices', when('STAGE_DURATION', 'JOB', { stage: 'IN_PRODUCTION', days: 14 }), [
      progress,
      step('SEND_INVOICE', { which: 'LATEST' }),
      step('CREATE_INVOICE', { invoiceType: 'PROGRESS', amountKind: 'PERCENT', percent: 25 }, { delay: days(14), conditions: [only('job.stage', 'IS', 'IN_PRODUCTION')] }),
      step('SEND_INVOICE', { which: 'LATEST' }, { conditions: [only('job.stage', 'IS', 'IN_PRODUCTION')] }),
    ]));
    blank(list.length - 1, progress, 'percent', 'What percent of the contract does each progress invoice bill?');
  }

  // 11. Work order completed (the closeout is the inspection)
  list.push(auto('Closeout follow-up', when('STAGE_ENTERED', 'WORK_ORDER', { stage: 'COMPLETED' }), [
    ...(o.cabinets ? [step('SEND_EMAIL', { messageId: 'sample_cabinets_curing' })] : []),
    step('CREATE_TASK', { title: 'Walk the final inspection with {{customerName}}', assignTo: 'CREW_LEAD', dueInDays: o.cabinets ? 3 : 1 }, o.cabinets ? { delay: days(3) } : {}),
  ]));

  // 12. Job completed
  list.push(auto('Final invoice', when('STAGE_ENTERED', 'JOB', { stage: 'COMPLETED' }), [
    step('CREATE_INVOICE', { invoiceType: 'FINAL', amountKind: 'REMAINING' }),
    step('SEND_INVOICE', { which: 'FINAL', messageId: 'sample_final_invoice' }),
  ]));

  // 13. Final invoice overdue: remind every 7 days, up to 3 times
  const overdueWhen = o.commercial
    ? when('DATE_RELATIVE', 'INVOICE', { dateField: 'dueDate', direction: 'AFTER', amount: 3, unit: 'DAYS' })
    : when('STAGE_ENTERED', 'INVOICE', { stage: 'OVERDUE' });
  const stillOverdue = { conditions: [only('invoice.stage', 'IS', 'OVERDUE')] };
  list.push(auto('Payment reminders', overdueWhen, [
    step('SEND_EMAIL', { messageId: 'sample_payment_reminder' }, o.commercial ? stillOverdue : {}),
    step('CREATE_TASK', { title: 'Chase payment for {{invoiceNumber}}', assignTo: 'ROLE', assignRole: 'office_manager', dueInDays: 1 }),
    step('SEND_EMAIL', { messageId: 'sample_payment_reminder' }, { delay: days(7), ...stillOverdue }),
    step('SEND_EMAIL', { messageId: 'sample_payment_reminder' }, { delay: days(7), ...stillOverdue }),
  ]));

  // 14. Final invoice paid
  list.push(auto('Thanks and review', when('PAYMENT_RECORDED', 'INVOICE', { which: 'FULL' }), [
    step('CHECK_PAYMENT'),
    step('ADD_CONTACT_NOTE', { text: 'Final payment received for {{projectName}}.' }),
    step('SEND_EMAIL', { messageId: 'sample_payment_thanks' }),
    step('SEND_EMAIL', { messageId: 'sample_review_request' }, { delay: days(2) }),
  ]));

  // 15. Repaint check-in
  if (o.commercial) {
    list.push(auto('Yearly check-in', when('TIME_SINCE_COMPLETION', 'JOB', { months: 12 }), [
      step('CREATE_TASK', { title: 'Check in with {{customerName}} about upcoming work', assignTo: 'ESTIMATOR', dueInDays: 7 }),
    ]));
  } else if (!o.cabinets) {
    list.push(auto('Repaint check-in', when('TIME_SINCE_COMPLETION', 'JOB', { months: o.repaintMonths ?? 36 }), [
      step('SEND_EMAIL', { messageId: 'sample_repaint_check_in' }),
      step('CREATE_LEAD', { source: 'Repaint alert', note: 'Repaint check-in for {{projectName}}' }),
    ]));
  }
  return { automations: list, blanks };
}

function journeyTemplate(id: string, name: string, description: string, o: Options, extra: Partial<AutomationTemplate> = {}): AutomationTemplate {
  const j = journey(o);
  return { id, kind: 'JOURNEY', source: 'SYSTEM', name, description, automations: j.automations, blanks: j.blanks, version: 1, updatedAt: UPDATED, ...extra };
}

function touchUpTemplate(): AutomationTemplate {
  const fee = step('CREATE_INVOICE', { invoiceType: 'PROGRESS', amountKind: 'FIXED', amount: 150 }, { mode: 'ASK' });
  const automations = [
    auto('Touch-up request', when('TOUCH_UP_SUBMITTED', 'JOB'), [
      step('NOTIFY_TEAM', { notifyTo: 'CREW_LEAD', channel: 'IN_APP', text: 'Touch-up request for {{projectName}}' }),
      step('CREATE_TASK', { title: 'Review touch-up request for {{customerName}}', assignTo: 'CREW_LEAD', dueInDays: 1 }),
    ]),
    auto('Paid visit invoice', when('PENDING_EVENT', 'JOB', { event: 'TOUCH_UP_DECISION' }), [fee, step('SEND_INVOICE', { which: 'LATEST' })]),
    auto('Touch-up visit booked', when('PENDING_EVENT', 'JOB', { event: 'TOUCH_UP_VISIT_BOOKED' }), [step('SEND_EMAIL', { messageId: 'sample_touch_up_confirmed' })]),
    auto('Touch-up visit done', when('PENDING_EVENT', 'JOB', { event: 'TOUCH_UP_VISIT_DONE' }), [
      step('SEND_EMAIL', { messageId: 'sample_all_done' }),
      step('ADD_CONTACT_NOTE', { text: 'Touch-up visit completed.' }),
    ]),
  ];
  return {
    id: 'tmpl_sys_touchup', kind: 'JOURNEY', source: 'SYSTEM', name: 'Touch-up and Warranty Visit',
    description: 'A short journey for small return visits. The acknowledgment to the customer is already built in. The paid-visit invoice asks first, so warranty visits can be skipped.',
    automations, blanks: [{ automationIndex: 1, stepId: fee.id, fieldKey: 'amount', question: 'What is the visit fee?' }], version: 1, updatedAt: UPDATED,
  };
}

export function systemTemplates(): AutomationTemplate[] {
  seq = 0;
  const interior = journeyTemplate('tmpl_sys_interior', 'Interior Repaint', 'The full journey from first contact to final payment, review request and repaint reminder.', { estimateTemplateId: 'tpl_interior' });
  const singles = (ids: number[], names: string[], from: AutomationTemplate): AutomationTemplate[] => ids.map((i, n) => {
    const a = from.automations[i]!;
    const blanks = from.blanks.filter((b) => b.automationIndex === i).map((b) => ({ ...b, automationIndex: 0 }));
    return { id: `tmpl_sys_${names[n]!.toLowerCase().replace(/[^a-z]+/g, '_')}`, kind: 'AUTOMATION', source: 'SYSTEM', name: names[n]!, description: a.name, automations: [a], blanks, version: 1, updatedAt: UPDATED };
  });
  const depositChase: AutomationTemplate = {
    id: 'tmpl_sys_deposit_chase', kind: 'AUTOMATION', source: 'SYSTEM', name: 'Deposit chase', description: 'A deposit invoice sent for 3 days and not paid gets a follow-up task.',
    automations: [auto('Deposit chase', when('STAGE_DURATION', 'INVOICE', { stage: 'SENT', days: 3 }), [
      step('CREATE_TASK', { title: 'Follow up on the deposit for {{projectName}}', assignTo: 'ROLE', assignRole: 'office_manager', dueInDays: 0 }, { conditions: [only('job.depositPaid', 'IS', 'false')] }),
    ])],
    blanks: [], version: 1, updatedAt: UPDATED,
  };
  return [
    interior,
    journeyTemplate('tmpl_sys_exterior', 'Exterior Repaint', 'Interior Repaint with the exterior estimate template, a weather check before the start and a 5-year repaint reminder.', { estimateTemplateId: 'tpl_exterior', exterior: true, repaintMonths: 60 }),
    journeyTemplate('tmpl_sys_cabinets', 'Cabinet Refinishing', 'A 50% deposit, colour approval before work starts and a 3-day cure time before the final check.', { estimateTemplateId: 'tpl_cabinets', depositPercent: 50, cabinets: true }),
    journeyTemplate('tmpl_sys_commercial', 'Commercial', 'A named estimator, a deposit only over a set amount, progress invoices every 14 days and longer stuck alerts.', { commercial: true }, { stuckMultiplier: 2 }),
    journeyTemplate('tmpl_sys_returning', 'Returning Customer Repaint', 'For a customer whose job you have done before. The estimate starts from their last job.', { returning: true, welcome: 'sample_welcome_back' }),
    touchUpTemplate(),
    depositChase,
    ...singles([0, 4, 12, 13, 2], ['New lead welcome', 'Estimate follow-up', 'Payment reminders', 'Thanks and review', 'Appointment reminder text'], interior),
  ];
}

export const SYSTEM_TEMPLATES = systemTemplates();

/** Sample message ids a template uses. */
export function samplesUsed(t: Pick<AutomationTemplate, 'automations'>): string[] {
  return Array.from(new Set(t.automations.flatMap((a) => a.steps.map((s) => s.config.messageId).filter((m): m is string => typeof m === 'string' && m.startsWith('sample_')))));
}
