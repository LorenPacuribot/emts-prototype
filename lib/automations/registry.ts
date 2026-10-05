/*
  The action registry (spec section 5 and 11): every trigger and step the
  module supports, with their settings. The UI draws the Building blocks
  panel, the step settings forms, the drop rules and the variables box from
  this list, so a new step definition here appears everywhere without UI
  changes. In production it comes from GET /automations/registry; this is
  the mock adapter's copy.

  Stages are the features engine's real statuses (features/types), which is
  what this prototype runs on. Where they differ from the spec's list, the
  code wins:
    - Leads have no "Converted" status.
    - Work orders are Pending Deposit → Unscheduled → Scheduled → In Progress → Completed.
    - Invoices are Draft, Sent, Partially Paid, Overdue, Paid and Cancelled.
      There is no "Viewed" invoice state, and "Partial" and "Partially Paid" are one.
    - Jobs have no Cancelled or Marketing status (Marketing is a board column only).
*/
import type {
  AutomationModule, AutomationRegistry, BuiltInStep, PipelineModule, RegistryField, StageOption, StepDefinition, TriggerDefinition,
} from './types';

export const REGISTRY_VERSION = '2026-10-06.1';

export const PIPELINES: PipelineModule[] = ['LEAD', 'ESTIMATE', 'JOB', 'WORK_ORDER', 'INVOICE'];

export const MODULE_LABEL: Record<AutomationModule, string> = {
  LEAD: 'Leads', CONTACT: 'Contacts', CALENDAR: 'Calendar', ESTIMATE: 'Estimates', JOB: 'Jobs', SCHEDULING: 'Scheduling',
  WORK_ORDER: 'Work Orders', INVOICE: 'Invoices', TEAM: 'Team and tasks', CUSTOMER_MESSAGE: 'Customer messages', TIMING: 'Timing',
};

/** One record of each pipeline, for sentences ("When a lead reaches…"). */
export const RECORD_NOUN: Record<AutomationModule, string> = {
  LEAD: 'lead', CONTACT: 'contact', CALENDAR: 'appointment', ESTIMATE: 'estimate', JOB: 'job', SCHEDULING: 'schedule',
  WORK_ORDER: 'work order', INVOICE: 'invoice', TEAM: 'team member', CUSTOMER_MESSAGE: 'message', TIMING: 'wait',
};

/** lucide icon per module (Building blocks group headers, step cards). */
export const MODULE_ICON: Record<AutomationModule, string> = {
  LEAD: 'Kanban', CONTACT: 'Users', CALENDAR: 'Calendar', ESTIMATE: 'Calculator', JOB: 'Briefcase', SCHEDULING: 'CalendarRange',
  WORK_ORDER: 'ClipboardList', INVOICE: 'Receipt', TEAM: 'UserCheck', CUSTOMER_MESSAGE: 'Mail', TIMING: 'Hourglass',
};

/** Building blocks groups, in the order of the job journey (spec 6.3). */
export const STEP_GROUP_ORDER: AutomationModule[] = [
  'LEAD', 'CONTACT', 'CALENDAR', 'ESTIMATE', 'JOB', 'SCHEDULING', 'WORK_ORDER', 'INVOICE', 'TEAM', 'CUSTOMER_MESSAGE', 'TIMING',
];

/* ---------- Stages ---------- */

const STAGES: Record<PipelineModule, StageOption[]> = {
  LEAD: [
    { value: 'NEW', label: 'New', colour: '#3b82f6' },
    { value: 'CONTACTED', label: 'Contacted', colour: '#8b5cf6' },
    { value: 'SCHEDULED', label: 'Scheduled', colour: '#0ea5e9' },
    { value: 'PENDING', label: 'Pending', colour: '#f59e0b' },
    { value: 'SOLD', label: 'Sold', colour: '#16a34a', terminal: true },
    { value: 'LOST', label: 'Lost', colour: '#dc2626', terminal: true },
    { value: 'ARCHIVED', label: 'Archived', colour: '#6b7280', terminal: true },
  ],
  ESTIMATE: [
    { value: 'DRAFT', label: 'Draft', colour: '#6b7280' },
    { value: 'SENT', label: 'Sent', colour: '#3b82f6' },
    { value: 'VIEWED', label: 'Viewed', colour: '#8b5cf6' },
    { value: 'ACCEPTED', label: 'Accepted', colour: '#16a34a', terminal: true },
    { value: 'AMENDED_DRAFT', label: 'Amended draft', colour: '#f59e0b' },
    { value: 'PENDING_REAPPROVAL', label: 'Pending reapproval', colour: '#f97316' },
    { value: 'DECLINED', label: 'Declined', colour: '#dc2626', terminal: true },
    { value: 'EXPIRED', label: 'Expired', colour: '#9ca3af', terminal: true },
  ],
  JOB: [
    { value: 'UNSCHEDULED', label: 'Unscheduled', colour: '#6b7280' },
    { value: 'CONFIRMED', label: 'Confirmed', colour: '#0ea5e9' },
    { value: 'SCHEDULED', label: 'Scheduled', colour: '#3b82f6' },
    { value: 'IN_PRODUCTION', label: 'In Production', colour: '#8b5cf6' },
    { value: 'TOUCH_UP', label: 'Touch Up', colour: '#f59e0b' },
    { value: 'READY_FOR_INSPECTION', label: 'Ready for Inspection', colour: '#f97316' },
    { value: 'COMPLETED', label: 'Completed', colour: '#16a34a', terminal: true },
  ],
  WORK_ORDER: [
    { value: 'PENDING_DEPOSIT', label: 'Pending Deposit', colour: '#f59e0b' },
    { value: 'UNSCHEDULED', label: 'Unscheduled', colour: '#6b7280' },
    { value: 'SCHEDULED', label: 'Scheduled', colour: '#3b82f6' },
    { value: 'IN_PROGRESS', label: 'In Progress', colour: '#8b5cf6' },
    { value: 'COMPLETED', label: 'Completed', colour: '#16a34a', terminal: true },
  ],
  INVOICE: [
    { value: 'DRAFT', label: 'Draft', colour: '#6b7280' },
    { value: 'SENT', label: 'Sent', colour: '#3b82f6' },
    { value: 'PARTIAL', label: 'Partially Paid', colour: '#f59e0b' },
    { value: 'OVERDUE', label: 'Overdue', colour: '#dc2626' },
    { value: 'PAID', label: 'Paid', colour: '#16a34a', terminal: true },
    { value: 'VOID', label: 'Cancelled', colour: '#9ca3af', terminal: true },
  ],
};

export function stagesOf(pipeline: PipelineModule): StageOption[] {
  return STAGES[pipeline];
}

export function stageLabel(pipeline: PipelineModule | undefined, stage: string | undefined): string {
  if (!pipeline || !stage) return stage ?? '';
  return STAGES[pipeline].find((s) => s.value === stage)?.label ?? stage;
}

/** The board pipeline a module's records belong to. */
export function pipelineOf(module: AutomationModule): PipelineModule {
  if (module === 'CONTACT' || module === 'CALENDAR') return 'LEAD';
  if (module === 'SCHEDULING') return 'WORK_ORDER';
  return (PIPELINES as string[]).includes(module) ? (module as PipelineModule) : 'LEAD';
}

/**
 * Which records a step can reach from a record at this stage (spec 6.3,
 * "A step from a module that cannot reach this record"). A lead has an
 * estimate once it is Scheduled (it may be made by an earlier step), and a
 * job, work order and invoice once it is Sold. An estimate has them once it
 * is accepted.
 */
export function reachableModules(pipeline: PipelineModule, stage?: string): AutomationModule[] {
  const always: AutomationModule[] = ['TEAM', 'CUSTOMER_MESSAGE', 'TIMING', 'CONTACT'];
  const sold: AutomationModule[] = ['JOB', 'WORK_ORDER', 'SCHEDULING', 'INVOICE'];
  if (pipeline === 'LEAD') {
    const out: AutomationModule[] = [...always, 'LEAD', 'CALENDAR'];
    if (!stage || ['SCHEDULED', 'PENDING', 'SOLD'].includes(stage)) out.push('ESTIMATE');
    if (!stage || stage === 'SOLD') out.push(...sold);
    return out;
  }
  if (pipeline === 'ESTIMATE') {
    const out: AutomationModule[] = [...always, 'ESTIMATE', 'LEAD', 'CALENDAR'];
    if (!stage || ['ACCEPTED', 'AMENDED_DRAFT', 'PENDING_REAPPROVAL'].includes(stage)) out.push(...sold);
    return out;
  }
  return [...always, 'LEAD', 'CALENDAR', 'ESTIMATE', ...sold];
}

/* ---------- Shared field lists ---------- */

export const ROLE_OPTIONS = [
  { value: 'owner', label: 'Business owner' },
  { value: 'office_manager', label: 'Office manager' },
  { value: 'estimators', label: 'Estimators' },
  { value: 'crew_lead', label: 'Crew leads' },
  { value: 'bookkeeper', label: 'Bookkeeper' },
];

const UNIT_OPTIONS = [
  { value: 'HOURS', label: 'hours' },
  { value: 'DAYS', label: 'days' },
];

const DATE_FIELDS: Record<string, { value: string; label: string }[]> = {
  LEAD: [{ value: 'appointmentAt', label: 'Appointment date' }, { value: 'createdAt', label: 'Created date' }],
  ESTIMATE: [{ value: 'sentAt', label: 'Sent date' }, { value: 'validUntil', label: 'Valid until' }, { value: 'createdAt', label: 'Created date' }],
  JOB: [{ value: 'startDate', label: 'Scheduled start date' }, { value: 'endDate', label: 'Scheduled end date' }, { value: 'completedAt', label: 'Completed date' }],
  WORK_ORDER: [{ value: 'startDate', label: 'Start date' }, { value: 'endDate', label: 'Planned end date' }],
  INVOICE: [{ value: 'dueDate', label: 'Due date' }, { value: 'sentAt', label: 'Sent date' }],
};

const WATCHED_FIELDS: Record<string, { value: string; label: string }[]> = {
  LEAD: [{ value: 'assignedUserId', label: 'Owner' }, { value: 'appointmentAt', label: 'Appointment date' }, { value: 'source', label: 'Lead source' }],
  ESTIMATE: [{ value: 'estimatorId', label: 'Estimator' }, { value: 'total', label: 'Total' }],
  JOB: [{ value: 'startDate', label: 'Scheduled start date' }, { value: 'crewLeadId', label: 'Crew lead' }],
  WORK_ORDER: [{ value: 'startDate', label: 'Start date' }],
  INVOICE: [{ value: 'amount', label: 'Amount' }],
};

export const watchedFields = (pipeline: PipelineModule) => WATCHED_FIELDS[pipeline] ?? [];
export const dateFieldsOf = (pipeline: PipelineModule) => DATE_FIELDS[pipeline] ?? [];

/** Events the backend doesn't emit yet (spec section 13, items 5 and 10). */
export const PENDING_EVENTS = [
  { value: 'WEATHER_CONFIRMED', label: 'Crew lead confirms the weather is OK' },
  { value: 'WEATHER_DELAY', label: 'Crew lead marks a weather delay' },
  { value: 'TOUCH_UP_DECISION', label: 'Crew lead marks a touch-up as warranty or paid visit' },
  { value: 'TOUCH_UP_VISIT_BOOKED', label: 'Touch-up visit is booked' },
  { value: 'TOUCH_UP_VISIT_DONE', label: 'Touch-up visit is marked done' },
];

/* ---------- Triggers (spec section 7) ---------- */

const f = (field: RegistryField) => field;

export const TRIGGERS: TriggerDefinition[] = [
  { type: 'RECORD_CREATED', modules: ['LEAD', 'ESTIMATE', 'JOB', 'WORK_ORDER', 'INVOICE'], title: 'Record is created', phrase: 'is created', fields: [] },
  {
    type: 'STAGE_ENTERED', modules: ['LEAD', 'ESTIMATE', 'JOB', 'WORK_ORDER', 'INVOICE'], title: 'Record reaches a stage or status', phrase: 'reaches',
    fields: [f({ key: 'stage', label: 'Stage', kind: 'stage', required: true, hint: 'Example: Completed' })],
  },
  {
    type: 'STAGE_DURATION', modules: ['LEAD', 'ESTIMATE', 'JOB', 'WORK_ORDER', 'INVOICE'], title: 'Record has been in a stage for a set time', phrase: 'has been in',
    fields: [
      f({ key: 'stage', label: 'Stage', kind: 'stage', required: true }),
      f({ key: 'days', label: 'For how many days', kind: 'number', required: true, min: 1, max: 365, defaultValue: 3, hint: 'Example: 3' }),
    ],
  },
  {
    type: 'FIELD_CHANGED', modules: ['LEAD', 'ESTIMATE', 'JOB', 'WORK_ORDER', 'INVOICE'], title: 'A field changes', phrase: 'changes',
    fields: [
      f({ key: 'field', label: 'Field', kind: 'select', required: true, hint: "Example: a job's scheduled start date" }),
      f({ key: 'value', label: 'New value (optional)', kind: 'text', required: false }),
    ],
  },
  {
    type: 'DATE_RELATIVE', modules: ['LEAD', 'ESTIMATE', 'JOB', 'WORK_ORDER', 'INVOICE'], title: 'A date is coming up or has passed', phrase: 'date',
    fields: [
      f({ key: 'dateField', label: 'Date', kind: 'dateField', required: true }),
      f({ key: 'direction', label: 'Before or after', kind: 'select', required: true, defaultValue: 'BEFORE', options: [{ value: 'BEFORE', label: 'before' }, { value: 'AFTER', label: 'after' }] }),
      f({ key: 'amount', label: 'Amount', kind: 'number', required: true, min: 0, max: 365, defaultValue: 1 }),
      f({ key: 'unit', label: 'Unit', kind: 'select', required: true, defaultValue: 'DAYS', options: UNIT_OPTIONS }),
    ],
  },
  { type: 'ESTIMATE_VIEWED', modules: ['ESTIMATE'], title: 'Customer views an estimate', phrase: 'is viewed by the customer', fields: [] },
  { type: 'ESTIMATE_SIGNED', modules: ['ESTIMATE'], title: 'Customer signs an estimate', phrase: 'is signed by the customer', fields: [] },
  {
    type: 'ESTIMATE_READY', modules: ['ESTIMATE'], title: 'Estimator marks the estimate ready', phrase: 'is marked ready to send', fields: [],
    backendGap: 'The estimate "ready to send" flag (backend gap 3). This prototype keeps the flag in the Automations module.',
  },
  {
    type: 'PAYMENT_RECORDED', modules: ['INVOICE'], title: 'Payment is recorded', phrase: 'gets a payment',
    fields: [f({
      key: 'which', label: 'Which payment', kind: 'select', required: true, defaultValue: 'ANY',
      options: [{ value: 'ANY', label: 'Any payment' }, { value: 'DEPOSIT', label: 'The deposit is paid in full' }, { value: 'FULL', label: 'The invoice is paid in full' }],
    })],
  },
  {
    type: 'APPOINTMENT_BOOKED', modules: ['CALENDAR'], title: 'Appointment is booked or changed', phrase: 'is booked',
    fields: [f({ key: 'change', label: 'When it is', kind: 'select', required: true, defaultValue: 'BOOKED', options: [{ value: 'BOOKED', label: 'Booked' }, { value: 'CHANGED', label: 'Changed' }, { value: 'ANY', label: 'Booked or changed' }] })],
  },
  {
    type: 'TIME_SINCE_COMPLETION', modules: ['JOB'], title: 'Time has passed since the job was completed', phrase: 'was completed',
    fields: [f({ key: 'months', label: 'Months after completion', kind: 'number', required: true, min: 1, max: 240, defaultValue: 36, hint: 'Example: 36 for a 3-year repaint check-in' })],
  },
  {
    type: 'TOUCH_UP_SUBMITTED', modules: ['JOB'], title: 'A touch-up request is submitted', phrase: 'gets a touch-up request', fields: [],
  },
  {
    type: 'PENDING_EVENT', modules: ['JOB', 'WORK_ORDER'], title: 'Something the crew marks', phrase: 'event',
    fields: [f({ key: 'event', label: 'Event', kind: 'select', required: true, options: PENDING_EVENTS })],
    backendGap: 'These events need the backend to emit them (backend gaps 5 and 10). Until then this trigger never fires.',
  },
];

/* ---------- Steps (spec section 8) ---------- */

const message = (channel: 'EMAIL' | 'SMS', required = true): RegistryField => ({ key: 'messageId', label: channel === 'EMAIL' ? 'Email' : 'Text message', kind: 'message', channel, required });
const stageField = (pipeline: PipelineModule): RegistryField => ({ key: 'stage', label: 'Stage', kind: 'stage', required: true, pipelineFrom: pipeline });
const userField = (key = 'userId', label = 'Person', required = true): RegistryField => ({ key, label, kind: 'user', required, isPerson: true });
const recipient = (prefix: string, label: string): RegistryField[] => [
  {
    key: `${prefix}To`, label, kind: 'select', required: true, defaultValue: 'ASSIGNED',
    options: [
      { value: 'ASSIGNED', label: "The record's assigned person" }, { value: 'CREW_LEAD', label: "The job's crew lead" }, { value: 'ESTIMATOR', label: 'The estimator' },
      { value: 'USER', label: 'A person' }, { value: 'ROLE', label: 'Everyone in a role' },
    ],
  },
  { key: `${prefix}UserId`, label: 'Person', kind: 'user', required: true, isPerson: true, showIf: { key: `${prefix}To`, values: ['USER'] } },
  { key: `${prefix}Role`, label: 'Role', kind: 'role', required: true, options: ROLE_OPTIONS, showIf: { key: `${prefix}To`, values: ['ROLE'] } },
];

export const STEPS: StepDefinition[] = [
  /* Leads and contacts */
  {
    type: 'MOVE_LEAD_STAGE', module: 'LEAD', title: 'Move lead to stage', description: "Changes the lead's status", icon: 'MoveRight',
    worksOn: ['LEAD'], fields: [stageField('LEAD')], prerequisites: [{ key: 'HAS_LEAD', label: 'A lead' }], mode: 'AUTO_OR_ASK',
    customerFacing: false, oncePerRecord: false, movesTo: { module: 'LEAD', field: 'stage' },
  },
  {
    type: 'ASSIGN_LEAD_OWNER', module: 'LEAD', title: 'Assign lead owner', description: 'Sets the assigned person, or round-robin in a role', icon: 'UserPlus',
    worksOn: ['LEAD'], prerequisites: [{ key: 'HAS_LEAD', label: 'A lead' }], mode: 'AUTO_OR_ASK', customerFacing: false, oncePerRecord: false,
    fields: [
      { key: 'how', label: 'Assign to', kind: 'select', required: true, defaultValue: 'ROUND_ROBIN', options: [{ value: 'ROUND_ROBIN', label: 'Round-robin in a role' }, { value: 'USER', label: 'A person' }] },
      { key: 'role', label: 'Role', kind: 'role', required: true, options: ROLE_OPTIONS, defaultValue: 'estimators', showIf: { key: 'how', values: ['ROUND_ROBIN'] } },
      { ...userField(), showIf: { key: 'how', values: ['USER'] } },
    ],
  },
  {
    type: 'SET_LEAD_FIELD', module: 'LEAD', title: 'Set lead field', description: 'Sets the lead source or adds to the notes', icon: 'PenLine',
    worksOn: ['LEAD'], prerequisites: [{ key: 'HAS_LEAD', label: 'A lead' }], mode: 'AUTO_OR_ASK', customerFacing: false, oncePerRecord: false,
    fields: [
      { key: 'field', label: 'Field', kind: 'select', required: true, defaultValue: 'source', options: [{ value: 'source', label: 'Lead source' }, { value: 'note', label: 'Notes' }] },
      { key: 'value', label: 'Value', kind: 'text', required: true, supportsVariables: true, hint: 'Example: Repaint alert' },
    ],
  },
  {
    type: 'CREATE_LEAD', module: 'LEAD', title: 'Create a lead', description: 'Creates a new lead for the same customer and address', icon: 'UserRoundPlus',
    worksOn: ['CONTACT'], prerequisites: [], mode: 'AUTO_OR_ASK', customerFacing: false, oncePerRecord: true, createsRecord: 'LEAD',
    fields: [
      { key: 'source', label: 'Lead source', kind: 'select', required: true, defaultValue: 'Repaint alert', options: ['Repaint alert', 'Existing Customer', 'Referral', 'Website'].map((v) => ({ value: v, label: v })) },
      { key: 'note', label: 'Note on the lead', kind: 'text', required: false, supportsVariables: true, hint: 'Example: Repaint check-in for {{projectName}}' },
    ],
  },
  {
    type: 'ADD_CONTACT_NOTE', module: 'CONTACT', title: 'Add contact note', description: "Adds a note to the contact's activity log", icon: 'StickyNote',
    worksOn: ['CONTACT'], prerequisites: [], mode: 'AUTO_ONLY', customerFacing: false, oncePerRecord: false,
    fields: [{ key: 'text', label: 'Note', kind: 'longtext', required: true, supportsVariables: true, hint: 'Example: Final payment received for {{projectName}}' }],
  },
  /* Calendar */
  {
    type: 'CREATE_APPOINTMENT', module: 'CALENDAR', title: 'Create estimate appointment', description: 'Books the first free slot with the assigned estimator', icon: 'CalendarPlus',
    worksOn: ['LEAD', 'CALENDAR'], prerequisites: [{ key: 'LEAD_HAS_OWNER', label: 'A lead with an owner' }], mode: 'AUTO_OR_ASK', customerFacing: false, oncePerRecord: true,
    createsRecord: 'CALENDAR', allowedFrom: { LEAD: ['NEW', 'CONTACTED', 'SCHEDULED'] }, allowedFromHint: 'An appointment is booked for a lead before its estimate. Use this step from Leads.',
    fields: [
      { key: 'daysFromNow', label: 'Earliest day (days from now)', kind: 'number', required: true, min: 0, max: 60, defaultValue: 1 },
      { key: 'time', label: 'Preferred time', kind: 'text', required: true, defaultValue: '10:00', hint: '24-hour time, e.g. 10:00' },
      { key: 'durationMin', label: 'Length (minutes)', kind: 'number', required: true, min: 15, max: 240, defaultValue: 60 },
    ],
  },
  /* Estimates */
  {
    type: 'CREATE_ESTIMATE_FROM_TEMPLATE', module: 'ESTIMATE', title: 'Create estimate from template', description: 'Creates a draft estimate for the lead from an estimate template', icon: 'FilePlus2',
    worksOn: ['LEAD', 'ESTIMATE'], mode: 'AUTO_OR_ASK', customerFacing: false, oncePerRecord: true, createsRecord: 'ESTIMATE',
    prerequisites: [{ key: 'LEAD_SCHEDULED_NO_ESTIMATE', label: 'A lead at Scheduled, with no estimate yet' }],
    allowedFrom: { LEAD: ['SCHEDULED'] }, allowedFromHint: 'An estimate is only created for a lead at Scheduled. Use this step from Leads › Scheduled.',
    fields: [{ key: 'estimateTemplateId', label: 'Estimate template', kind: 'estimateTemplate', required: true, hint: 'Example: Interior Repaint' }],
  },
  {
    type: 'CREATE_ESTIMATE_FROM_LAST_JOB', module: 'ESTIMATE', title: 'Create estimate from last job', description: "Creates a draft estimate from the customer's last estimate at this address", icon: 'History',
    worksOn: ['LEAD', 'ESTIMATE'], mode: 'AUTO_OR_ASK', customerFacing: false, oncePerRecord: true, createsRecord: 'ESTIMATE',
    prerequisites: [{ key: 'LEAD_SCHEDULED_NO_ESTIMATE', label: 'A lead at Scheduled, with no estimate yet' }, { key: 'HAS_PAST_ESTIMATE', label: 'A past estimate' }],
    allowedFrom: { LEAD: ['SCHEDULED'] }, allowedFromHint: 'An estimate is only created for a lead at Scheduled. Use this step from Leads › Scheduled.',
    backendGap: 'Needs a duplicate or "from history" estimate endpoint (backend gap 2).',
    fields: [],
  },
  {
    type: 'ASSIGN_ESTIMATOR', module: 'ESTIMATE', title: 'Assign estimator', description: 'Sets the estimator on the estimate', icon: 'UserCog',
    worksOn: ['ESTIMATE'], prerequisites: [{ key: 'HAS_ESTIMATE', label: 'An estimate' }], mode: 'AUTO_OR_ASK', customerFacing: false, oncePerRecord: false,
    fields: [
      { key: 'who', label: 'Estimator', kind: 'select', required: true, defaultValue: 'LEAD_OWNER', options: [{ value: 'LEAD_OWNER', label: "The lead's owner" }, { value: 'USER', label: 'A person' }] },
      { ...userField(), showIf: { key: 'who', values: ['USER'] } },
    ],
  },
  {
    type: 'SEND_ESTIMATE', module: 'ESTIMATE', title: 'Send estimate', description: 'Sends the estimate with the existing send flow', icon: 'Send',
    worksOn: ['ESTIMATE'], mode: 'AUTO_OR_ASK', customerFacing: true, oncePerRecord: true, sendPriority: 'DOCUMENT',
    prerequisites: [{ key: 'ESTIMATE_READY', label: 'An estimate marked ready by the estimator' }],
    fields: [message('EMAIL', false)],
  },
  /* Jobs */
  {
    type: 'MOVE_JOB_STAGE', module: 'JOB', title: 'Move job to stage', description: 'Changes the job stage', icon: 'MoveRight',
    worksOn: ['JOB'], fields: [stageField('JOB')], prerequisites: [{ key: 'HAS_JOB', label: 'A job' }], mode: 'AUTO_OR_ASK',
    customerFacing: false, oncePerRecord: false, movesTo: { module: 'JOB', field: 'stage' },
  },
  {
    type: 'ASSIGN_CREW_LEAD', module: 'JOB', title: 'Assign crew lead', description: 'Sets the crew lead on the job', icon: 'HardHat',
    worksOn: ['JOB'], fields: [userField('userId', 'Crew lead')], prerequisites: [{ key: 'HAS_JOB', label: 'A job' }], mode: 'AUTO_OR_ASK', customerFacing: false, oncePerRecord: false,
  },
  /* Scheduling */
  {
    type: 'BOOK_SCHEDULE', module: 'SCHEDULING', title: 'Book the schedule', description: 'Books the first dates a crew has capacity and moves the work order to Scheduled', icon: 'CalendarCheck',
    worksOn: ['WORK_ORDER', 'JOB'], mode: 'AUTO_OR_ASK', customerFacing: false, oncePerRecord: true, requiresFeatureFlag: 'new-job-scheduling',
    prerequisites: [{ key: 'WO_UNSCHEDULED', label: 'A work order at Unscheduled' }],
    fields: [
      { key: 'crew', label: 'Crew', kind: 'select', required: true, defaultValue: 'ANY', options: [{ value: 'ANY', label: 'Any crew' }] },
      { key: 'earliestDays', label: 'Earliest start (days from now)', kind: 'number', required: true, min: 0, max: 120, defaultValue: 3 },
      { key: 'durationDays', label: 'Working days to book', kind: 'number', required: true, min: 1, max: 60, defaultValue: 3 },
    ],
  },
  /* Work orders */
  {
    type: 'CONFIRM_DEPOSIT', module: 'WORK_ORDER', title: 'Confirm deposit', description: 'Same as the Confirm Deposit button. Moves Pending Deposit to Unscheduled.', icon: 'BadgeDollarSign',
    worksOn: ['WORK_ORDER'], prerequisites: [{ key: 'DEPOSIT_PAID', label: 'The deposit invoice is paid' }], mode: 'AUTO_OR_ASK', customerFacing: false, oncePerRecord: true, fields: [],
  },
  {
    type: 'START_JOB', module: 'WORK_ORDER', title: 'Start job', description: 'Same as Start Job. Moves Scheduled to In Progress.', icon: 'Play',
    worksOn: ['WORK_ORDER'], prerequisites: [{ key: 'WO_SCHEDULED_TODAY', label: 'Scheduled, and the start date is today' }], mode: 'AUTO_OR_ASK', customerFacing: false, oncePerRecord: true, fields: [],
  },
  /* Invoices */
  {
    type: 'CREATE_INVOICE', module: 'INVOICE', title: 'Create invoice', description: 'Creates a deposit, progress or final invoice for the job', icon: 'FilePlus',
    worksOn: ['JOB', 'INVOICE'], prerequisites: [{ key: 'HAS_JOB', label: 'A job' }], mode: 'AUTO_OR_ASK', customerFacing: false, oncePerRecord: true,
    createsRecord: 'INVOICE', keyJob: 'INVOICE',
    allowedFromHint: 'A lead has no job yet. Use this step from Work Orders or Jobs.',
    fields: [
      { key: 'invoiceType', label: 'Type', kind: 'select', required: true, defaultValue: 'DEPOSIT', options: [{ value: 'DEPOSIT', label: 'Deposit' }, { value: 'PROGRESS', label: 'Progress' }, { value: 'FINAL', label: 'Final' }] },
      { key: 'amountKind', label: 'Amount', kind: 'select', required: true, defaultValue: 'PERCENT', options: [{ value: 'PERCENT', label: 'Percent of the estimate' }, { value: 'FIXED', label: 'A fixed amount' }, { value: 'REMAINING', label: 'Remaining balance' }] },
      { key: 'percent', label: 'Percent', kind: 'percent', required: true, defaultFrom: 'financialSettings.depositPercent', showIf: { key: 'amountKind', values: ['PERCENT'] }, min: 0, max: 100 },
      { key: 'amount', label: 'Amount', kind: 'money', required: true, showIf: { key: 'amountKind', values: ['FIXED'] }, min: 0 },
    ],
  },
  {
    type: 'SEND_INVOICE', module: 'INVOICE', title: 'Send invoice', description: 'Sends the invoice with the existing compose and send flow', icon: 'Send',
    worksOn: ['INVOICE', 'JOB'], prerequisites: [{ key: 'INVOICE_DRAFT', label: 'A Draft invoice' }], mode: 'AUTO_OR_ASK', customerFacing: true, oncePerRecord: true, sendPriority: 'DOCUMENT',
    fields: [
      { key: 'which', label: 'Which invoice', kind: 'select', required: true, defaultValue: 'LATEST', options: [{ value: 'LATEST', label: "The job's latest invoice" }, { value: 'DEPOSIT', label: 'The deposit invoice' }, { value: 'FINAL', label: 'The final invoice' }, { value: 'TRIGGER', label: 'The invoice that started this' }] },
      message('EMAIL', false),
    ],
  },
  {
    type: 'CHECK_PAYMENT', module: 'INVOICE', title: 'Check payment', description: "Stops the flow if any balance is left on the job's invoices", icon: 'ShieldCheck',
    worksOn: ['JOB', 'INVOICE'], prerequisites: [{ key: 'HAS_JOB', label: 'A job' }], mode: 'AUTO_ONLY', customerFacing: false, oncePerRecord: false, fields: [],
  },
  /* Team and tasks */
  {
    type: 'NOTIFY_TEAM', module: 'TEAM', title: 'Notify a team member', description: 'In-app, email or both', icon: 'BellRing',
    worksOn: ['TEAM'], prerequisites: [], mode: 'AUTO_ONLY', customerFacing: false, oncePerRecord: false,
    fields: [
      ...recipient('notify', 'Who'),
      { key: 'channel', label: 'How', kind: 'select', required: true, defaultValue: 'IN_APP', options: [{ value: 'IN_APP', label: 'In-app' }, { value: 'EMAIL', label: 'Email' }, { value: 'BOTH', label: 'Both' }] },
      { key: 'text', label: 'Message', kind: 'text', required: true, supportsVariables: true, hint: 'Example: New lead from {{customerName}}' },
    ],
  },
  {
    type: 'CREATE_TASK', module: 'TEAM', title: 'Create a task', description: 'Title, assignee, due date, linked record', icon: 'ListChecks',
    worksOn: ['TEAM'], prerequisites: [], mode: 'AUTO_ONLY', customerFacing: false, oncePerRecord: false,
    backendGap: 'Tasks have only a title and a done flag (backend gap 1). The assignee and due date are written into the title and the assignee is notified.',
    fields: [
      { key: 'title', label: 'Title', kind: 'text', required: true, supportsVariables: true, hint: 'Example: Call within 1 hour' },
      ...recipient('assign', 'Assign to'),
      { key: 'dueInDays', label: 'Due (days after it is created)', kind: 'number', required: true, min: 0, max: 365, defaultValue: 1 },
    ],
  },
  {
    type: 'ADD_NOTE', module: 'TEAM', title: 'Add a note', description: "Adds a note to the record's activity log", icon: 'NotebookPen',
    worksOn: ['TEAM'], prerequisites: [], mode: 'AUTO_ONLY', customerFacing: false, oncePerRecord: false,
    fields: [{ key: 'text', label: 'Note', kind: 'longtext', required: true, supportsVariables: true }],
  },
  /* Customer messages */
  {
    type: 'SEND_EMAIL', module: 'CUSTOMER_MESSAGE', title: 'Send email', description: 'Sends a message from the library to the customer', icon: 'Mail',
    worksOn: ['CUSTOMER_MESSAGE'], prerequisites: [], mode: 'AUTO_OR_ASK', customerFacing: true, oncePerRecord: true, fields: [message('EMAIL')],
  },
  {
    type: 'SEND_TEXT', module: 'CUSTOMER_MESSAGE', title: 'Send text', description: 'Sends a text message from the library to the customer', icon: 'MessageSquare',
    worksOn: ['CUSTOMER_MESSAGE'], prerequisites: [], mode: 'AUTO_OR_ASK', customerFacing: true, oncePerRecord: true, requiresRelease: 'texting', fields: [message('SMS')],
  },
  /* Timing */
  {
    type: 'WAIT', module: 'TIMING', title: 'Wait', description: 'Pauses for a set number of hours or days', icon: 'Hourglass',
    worksOn: ['TIMING'], prerequisites: [], mode: 'AUTO_ONLY', customerFacing: false, oncePerRecord: false,
    fields: [
      { key: 'amount', label: 'How long', kind: 'number', required: true, min: 1, max: 365, defaultValue: 2 },
      { key: 'unit', label: 'Unit', kind: 'select', required: true, defaultValue: 'DAYS', options: UNIT_OPTIONS },
    ],
  },
  {
    type: 'WAIT_UNTIL_DATE', module: 'TIMING', title: 'Wait until a date', description: 'Pauses until a date field, for example the job start date', icon: 'CalendarClock',
    worksOn: ['TIMING'], prerequisites: [], mode: 'AUTO_ONLY', customerFacing: false, oncePerRecord: false,
    fields: [
      { key: 'module', label: 'Record', kind: 'module', required: true, defaultValue: 'JOB' },
      { key: 'dateField', label: 'Date', kind: 'dateField', required: true },
      { key: 'offsetDays', label: 'Days before (−) or after (+)', kind: 'number', required: true, min: -365, max: 365, defaultValue: 0 },
    ],
  },
  {
    type: 'WAIT_FOR_CONDITION', module: 'TIMING', title: 'Wait for something to happen', description: 'Pauses until a condition is true, with a time limit', icon: 'Timer',
    worksOn: ['TIMING'], prerequisites: [], mode: 'AUTO_ONLY', customerFacing: false, oncePerRecord: false,
    fields: [
      { key: 'condition', label: 'Wait until', kind: 'waitCondition', required: true },
      { key: 'limitAmount', label: 'Time limit', kind: 'number', required: true, min: 1, max: 2160, defaultValue: 7 },
      { key: 'limitUnit', label: 'Unit', kind: 'select', required: true, defaultValue: 'DAYS', options: UNIT_OPTIONS },
      {
        key: 'onTimeout', label: 'If the limit passes', kind: 'select', required: true, defaultValue: 'NOTIFY_KEEP_WAITING',
        options: [{ value: 'NOTIFY_KEEP_WAITING', label: 'Notify someone and keep waiting' }, { value: 'NOTIFY_STOP', label: 'Notify someone and stop' }, { value: 'CARRY_ON', label: 'Carry on anyway' }],
      },
      { key: 'notifyRole', label: 'Who to notify', kind: 'role', required: true, options: ROLE_OPTIONS, defaultValue: 'office_manager', showIf: { key: 'onTimeout', values: ['NOTIFY_KEEP_WAITING', 'NOTIFY_STOP'] } },
    ],
  },
];

/* ---------- Built-in steps (shown locked on the board) ---------- */

export const BUILT_INS: BuiltInStep[] = [
  { module: 'ESTIMATE', stage: 'ACCEPTED', label: 'Creates the job, work order and draft invoice', creates: ['JOB', 'WORK_ORDER', 'INVOICE'] },
  { module: 'ESTIMATE', stage: 'ACCEPTED', label: 'Moves the lead to Sold', creates: [] },
  { module: 'ESTIMATE', stage: 'SENT', label: 'Moves a Scheduled lead to Pending', creates: [] },
  { module: 'WORK_ORDER', stage: 'UNSCHEDULED', label: 'Moves the job to Unscheduled', creates: [] },
  { module: 'WORK_ORDER', stage: 'SCHEDULED', label: 'Moves the job to Scheduled', creates: [] },
  { module: 'WORK_ORDER', stage: 'IN_PROGRESS', label: 'Moves the job to In Production', creates: [] },
  { module: 'WORK_ORDER', stage: 'COMPLETED', label: 'Moves the job to Completed after the closeout', creates: [] },
];

/* ---------- Conditions ("Only if") ---------- */

const CONDITION_FIELDS: Record<string, RegistryField[]> = {
  LEAD: [
    { key: 'lead.source', label: 'Lead source', kind: 'select', required: true, options: [{ value: 'website', label: 'Website' }, { value: 'existing_customer', label: 'Existing customer' }, { value: 'referral', label: 'Referral' }, { value: 'repaint_alert', label: 'Repaint alert' }] },
    { key: 'lead.paintType', label: 'Work type', kind: 'select', required: true, options: ['Interior', 'Exterior', 'Both', 'Cabinets', 'Other'].map((v) => ({ value: v, label: v })) },
    { key: 'lead.assignedUserId', label: 'Lead owner', kind: 'user', required: true },
  ],
  CONTACT: [
    { key: 'customer.returning', label: 'Customer has a completed job', kind: 'boolean', required: true },
  ],
  ESTIMATE: [
    { key: 'estimate.total', label: 'Estimate total', kind: 'money', required: true },
    { key: 'estimate.type', label: 'Estimate type', kind: 'select', required: true, options: [{ value: 'interior_repaint', label: 'Interior' }, { value: 'exterior_repaint', label: 'Exterior' }, { value: 'mixed', label: 'Mixed' }, { value: 'new_construction', label: 'New construction' }] },
    { key: 'estimate.ready', label: 'Marked ready to send', kind: 'boolean', required: true },
  ],
  JOB: [
    { key: 'job.contractValue', label: 'Contract value', kind: 'money', required: true },
    { key: 'job.stage', label: 'Job stage', kind: 'stage', required: true, pipelineFrom: 'JOB' },
    { key: 'job.depositPaid', label: 'The deposit is paid', kind: 'boolean', required: true },
    { key: 'job.allPaid', label: 'Every invoice for the job is paid', kind: 'boolean', required: true },
    { key: 'job.coloursApproved', label: 'Every colour on the colour card is approved', kind: 'boolean', required: true },
  ],
  WORK_ORDER: [
    { key: 'workOrder.stage', label: 'Work order status', kind: 'stage', required: true, pipelineFrom: 'WORK_ORDER' },
  ],
  INVOICE: [
    { key: 'invoice.amount', label: 'Invoice amount', kind: 'money', required: true },
    { key: 'invoice.balance', label: 'Balance due', kind: 'money', required: true },
    { key: 'invoice.stage', label: 'Invoice status', kind: 'stage', required: true, pipelineFrom: 'INVOICE' },
  ],
};

/** Condition fields a record at this stage can use. */
export function conditionFieldsFor(pipeline: PipelineModule, stage?: string): RegistryField[] {
  const reach = reachableModules(pipeline, stage);
  return Object.entries(CONDITION_FIELDS).filter(([m]) => reach.includes(m as AutomationModule) || m === pipeline).flatMap(([, list]) => list);
}

export const conditionField = (key: string) => Object.values(CONDITION_FIELDS).flat().find((f) => f.key === key);

/* ---------- Variables ---------- */

const BASE_VARS = ['customerName', 'firstName', 'orgName', 'reviewLink'];
const VARIABLES: Record<string, string[]> = {
  LEAD: [...BASE_VARS, 'projectName', 'appointmentDate', 'appointmentTime', 'estimatorName'],
  ESTIMATE: [...BASE_VARS, 'projectName', 'appointmentDate', 'appointmentTime', 'estimatorName', 'estimateNumber', 'estimateTotal', 'estimateLink'],
  JOB: [...BASE_VARS, 'projectName', 'estimatorName', 'estimateTotal', 'jobNumber', 'startDate', 'endDate', 'crewLeadName', 'invoiceNumber', 'invoiceAmount', 'balanceDue', 'dueDate'],
  WORK_ORDER: [...BASE_VARS, 'projectName', 'jobNumber', 'startDate', 'endDate', 'crewLeadName'],
  INVOICE: [...BASE_VARS, 'projectName', 'jobNumber', 'startDate', 'endDate', 'crewLeadName', 'invoiceNumber', 'invoiceAmount', 'balanceDue', 'dueDate'],
};

/** Variables a message or text field can use for records reachable from this pipeline and stage. */
export function variablesFor(pipeline?: PipelineModule, stage?: string): string[] {
  if (!pipeline) return Array.from(new Set(Object.values(VARIABLES).flat()));
  const reach = reachableModules(pipeline, stage);
  return Array.from(new Set(Object.entries(VARIABLES).filter(([m]) => m === pipeline || reach.includes(m as AutomationModule)).flatMap(([, v]) => v)));
}

export const ALL_VARIABLES = variablesFor();

/* ---------- Wait conditions ---------- */

export const WAIT_CONDITIONS: AutomationRegistry['waitConditions'] = [
  { value: 'DEPOSIT_PAID', label: 'The deposit invoice is paid', worksOn: ['INVOICE'] },
  { value: 'ALL_PAID', label: 'Every invoice for the job is paid', worksOn: ['INVOICE'] },
  { value: 'ESTIMATE_SIGNED', label: 'The estimate is signed', worksOn: ['ESTIMATE'] },
  { value: 'ESTIMATE_READY', label: 'The estimate is marked ready', worksOn: ['ESTIMATE'] },
  { value: 'COLOURS_APPROVED', label: 'Every colour on the colour card is approved', worksOn: ['JOB'] },
  { value: 'WEATHER_CONFIRMED', label: 'The crew lead confirms the weather is OK', worksOn: ['JOB'], backendGap: 'Needs the weather confirmation event (backend gap 10).' },
];

/* ---------- Stuck alert defaults (spec section 10) ---------- */

const H = 1;
const D = 24;
export const STUCK_ALERT_DEFAULTS: AutomationRegistry['stuckAlertDefaults'] = {
  LEAD: { NEW: { hours: 4 * H, from: 'STAGE_ENTRY' }, CONTACTED: { hours: 3 * D, from: 'STAGE_ENTRY' }, SCHEDULED: { hours: 1 * D, from: 'appointmentAt' }, PENDING: { hours: 7 * D, from: 'STAGE_ENTRY' } },
  ESTIMATE: { DRAFT: { hours: 2 * D, from: 'STAGE_ENTRY' }, SENT: { hours: 5 * D, from: 'STAGE_ENTRY' }, PENDING_REAPPROVAL: { hours: 3 * D, from: 'STAGE_ENTRY' } },
  WORK_ORDER: { PENDING_DEPOSIT: { hours: 5 * D, from: 'STAGE_ENTRY' }, UNSCHEDULED: { hours: 2 * D, from: 'STAGE_ENTRY' }, SCHEDULED: { hours: 1 * D, from: 'startDate' }, IN_PROGRESS: { hours: 2 * D, from: 'endDate' } },
  JOB: { TOUCH_UP: { hours: 3 * D, from: 'STAGE_ENTRY' }, READY_FOR_INSPECTION: { hours: 2 * D, from: 'STAGE_ENTRY' } },
  INVOICE: { DRAFT: { hours: 1 * D, from: 'STAGE_ENTRY' }, SENT: { hours: 7 * D, from: 'STAGE_ENTRY' }, PARTIAL: { hours: 14 * D, from: 'STAGE_ENTRY' } },
};

/* ---------- Lookups ---------- */

export const stepDef = (type: string) => STEPS.find((s) => s.type === type);
export const triggerDef = (type: string) => TRIGGERS.find((t) => t.type === type);

/** The full registry, as GET /automations/registry returns it. `messages` is filled by the caller from the library. */
export function buildRegistry(messages: AutomationRegistry['messages'] = []): AutomationRegistry {
  return {
    version: REGISTRY_VERSION,
    triggers: TRIGGERS,
    steps: STEPS,
    builtIns: BUILT_INS,
    stages: STAGES,
    conditionFields: CONDITION_FIELDS,
    variables: VARIABLES,
    messages,
    stuckAlertDefaults: STUCK_ALERT_DEFAULTS,
    waitConditions: WAIT_CONDITIONS,
    dateFields: DATE_FIELDS,
  };
}

/** The stage column an automation shows in on the board. */
export function boardPlacement(trigger: { type: string; module: AutomationModule; config: Record<string, unknown> }): { pipeline: PipelineModule; stage: string; timed: boolean } {
  const pipeline = pipelineOf(trigger.module);
  const first = STAGES[pipeline][0]!.value;
  const c = trigger.config;
  switch (trigger.type) {
    case 'STAGE_ENTERED':
      return { pipeline, stage: String(c.stage ?? first), timed: false };
    case 'STAGE_DURATION':
      return { pipeline, stage: String(c.stage ?? first), timed: true };
    case 'ESTIMATE_VIEWED':
      return { pipeline, stage: 'VIEWED', timed: false };
    case 'ESTIMATE_SIGNED':
      return { pipeline, stage: 'ACCEPTED', timed: false };
    case 'ESTIMATE_READY':
      return { pipeline, stage: 'DRAFT', timed: false };
    case 'PAYMENT_RECORDED':
      return { pipeline, stage: c.which === 'FULL' ? 'PAID' : 'PARTIAL', timed: false };
    case 'APPOINTMENT_BOOKED':
      return { pipeline: 'LEAD', stage: 'SCHEDULED', timed: false };
    case 'TIME_SINCE_COMPLETION':
      return { pipeline, stage: 'COMPLETED', timed: true };
    case 'TOUCH_UP_SUBMITTED':
      return { pipeline, stage: 'COMPLETED', timed: false };
    case 'DATE_RELATIVE': {
      const byDate: Record<string, string> = {
        appointmentAt: 'SCHEDULED', sentAt: 'SENT', validUntil: 'SENT', startDate: 'SCHEDULED', endDate: pipeline === 'WORK_ORDER' ? 'IN_PROGRESS' : 'IN_PRODUCTION',
        completedAt: 'COMPLETED', dueDate: 'SENT', createdAt: first,
      };
      const stage = byDate[String(c.dateField)] ?? first;
      return { pipeline, stage: STAGES[pipeline].some((s) => s.value === stage) ? stage : first, timed: true };
    }
    default:
      return { pipeline, stage: String(c.stage ?? first), timed: false };
  }
}

export function iconFor(type: string): string {
  return stepDef(type)?.icon ?? 'Circle';
}

/** Is this step usable from a record at this stage? (drop rules and readiness share it) */
export function stepAllowedAt(def: StepDefinition, pipeline: PipelineModule, stage: string): { ok: true } | { ok: false; reason: string } {
  const reach = reachableModules(pipeline, stage);
  const target = def.worksOn.filter((m) => !['TEAM', 'CUSTOMER_MESSAGE', 'TIMING'].includes(m));
  if (target.length && !target.some((m) => reach.includes(m))) {
    return { ok: false, reason: def.allowedFromHint ?? `A ${RECORD_NOUN[pipeline]} at ${stageLabel(pipeline, stage)} can't reach a ${RECORD_NOUN[target[0]!]} yet.` };
  }
  const allowed = def.allowedFrom?.[pipeline];
  if (def.allowedFrom && allowed === undefined) {
    return { ok: false, reason: def.allowedFromHint ?? `Use this step from ${Object.keys(def.allowedFrom).map((m) => MODULE_LABEL[m as AutomationModule]).join(' or ')}.` };
  }
  if (Array.isArray(allowed) && !allowed.includes(stage)) {
    return { ok: false, reason: def.allowedFromHint ?? `Use this step from ${allowed.map((s) => stageLabel(pipeline, s)).join(' or ')}.` };
  }
  return { ok: true };
}
