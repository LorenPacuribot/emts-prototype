/*
  Automations module: data shapes (Automations Module spec, section 11).

  The spec asks for an ambient types/automations.ts. This repo exports its
  types (lib/types.ts, features/types), so these are exported the same way.
  The shapes follow the spec; extra fields are marked "prototype".
*/

export type ID = string;
export type ISODate = string;

export type AutomationModule =
  | 'LEAD' | 'CONTACT' | 'CALENDAR' | 'ESTIMATE' | 'JOB'
  | 'SCHEDULING' | 'WORK_ORDER' | 'INVOICE' | 'TEAM' | 'CUSTOMER_MESSAGE' | 'TIMING';

/** Modules that have records moving through stages (one board pipeline each). */
export type PipelineModule = 'LEAD' | 'ESTIMATE' | 'JOB' | 'WORK_ORDER' | 'INVOICE';

/* ---------- Action registry ---------- */

export interface RegistryField {
  key: string;
  label: string;
  /** The example shown under the field. */
  hint?: string;
  kind: 'text' | 'longtext' | 'number' | 'percent' | 'money' | 'select'
    | 'user' | 'role' | 'stage' | 'template' | 'estimateTemplate' | 'duration' | 'dateField'
    /* prototype: a customer message from the library, and a pipeline picker for "stage" fields */
    | 'message' | 'module' | 'waitCondition' | 'boolean';
  required: boolean;
  options?: { value: string; label: string }[];
  /** A settings path, e.g. 'financialSettings.depositPercent'. */
  defaultFrom?: string;
  /** prototype: a fixed default. */
  defaultValue?: string | number | boolean;
  supportsVariables?: boolean;
  /** prototype: message fields only show messages of this channel. */
  channel?: 'EMAIL' | 'SMS';
  /** prototype: stage fields read the pipeline from this field (or the step's module). */
  pipelineFrom?: string;
  /** prototype: shown only when another field has one of these values. */
  showIf?: { key: string; values: (string | number | boolean)[] };
  min?: number;
  max?: number;
  /** prototype: people fields are cleared by "Save as template" unless kept. */
  isPerson?: boolean;
}

export interface StepDefinition {
  type: string; // e.g. 'CREATE_INVOICE'
  module: AutomationModule;
  title: string;
  description: string;
  icon: string; // lucide icon name
  /** Records this step can act on, reached through links from the trigger record. */
  worksOn: AutomationModule[];
  fields: RegistryField[];
  prerequisites: { key: string; label: string }[];
  mode: 'AUTO_ONLY' | 'AUTO_OR_ASK' | 'ASK_BY_DEFAULT';
  /** Needs deploy approval; follows consent, opt-outs and the contact window. */
  customerFacing: boolean;
  /** E.g. the deposit invoice. */
  oncePerRecord: boolean;
  createsRecord?: AutomationModule;
  /** E.g. 'FINAL_INVOICE', used for delete warnings. */
  keyJob?: string;
  requiresFeatureFlag?: string;
  /** prototype: shown locked ("Texting isn't switched on yet") until this release flag is on. */
  requiresRelease?: 'texting';
  /** prototype: stages this step can be used from. Missing = any stage the worksOn records exist at. */
  allowedFrom?: Partial<Record<PipelineModule, string[] | 'ANY'>>;
  /** prototype: why a drop is blocked when allowedFrom fails. */
  allowedFromHint?: string;
  /** prototype: the step needs something the backend doesn't have yet (spec section 13). */
  backendGap?: string;
  /** prototype: what this step moves a record into (for loop checks). */
  movesTo?: { module: PipelineModule; field: string };
  /** prototype: the send-queue priority for customer messages. */
  sendPriority?: SendPriority;
}

export type SendPriority = 'REPLY' | 'DOCUMENT' | 'REMINDER' | 'OTHER';

export interface TriggerDefinition {
  type: string; // e.g. 'STAGE_ENTERED'
  modules: AutomationModule[];
  title: string;
  fields: RegistryField[];
  /** prototype: the trigger needs a backend event that doesn't exist yet (spec section 13). */
  backendGap?: string;
  /** prototype: a plain phrase for the sentence builder. */
  phrase?: string;
}

export interface BuiltInStep {
  module: AutomationModule;
  stage: string;
  label: string; // e.g. 'Creates the job, work order and draft invoice'
  creates: AutomationModule[];
}

export interface StageOption {
  value: string;
  label: string;
  colour?: string;
  /** prototype: a stage that ends a journey (no stuck alert). */
  terminal?: boolean;
}

export interface StuckAlertDefault {
  hours: number;
  /** 'STAGE_ENTRY', or a date field the time counts from (e.g. 'appointmentAt'). */
  from: 'STAGE_ENTRY' | string;
}

export interface AutomationRegistry {
  version: string;
  triggers: TriggerDefinition[];
  steps: StepDefinition[];
  builtIns: BuiltInStep[];
  stages: Record<string, StageOption[]>;
  conditionFields: Record<string, RegistryField[]>;
  variables: Record<string, string[]>;
  messages: { id: string; name: string; channel: 'EMAIL' | 'SMS' }[];
  stuckAlertDefaults: Record<string, Record<string, StuckAlertDefault>>;
  /** prototype: what "Wait for something to happen" can wait for. */
  waitConditions: { value: string; label: string; worksOn: AutomationModule[]; backendGap?: string }[];
  /** prototype: date fields per module, for date triggers and "Wait until a date". */
  dateFields: Record<string, { value: string; label: string }[]>;
}

/* ---------- Automations, journeys and templates ---------- */

export type ConditionOperator = 'IS' | 'IS_NOT' | 'IS_ANY_OF' | 'IS_EMPTY' | 'IS_NOT_EMPTY' | 'GT' | 'LT';

export interface AutomationCondition {
  id: string;
  field: string;
  operator: ConditionOperator;
  value?: string | number | string[];
}

export interface AutomationStep {
  id: string;
  order: number;
  type: string; // a StepDefinition.type
  mode: 'AUTO' | 'ASK';
  delay?: { amount: number; unit: 'HOURS' | 'DAYS'; workingDaysOnly: boolean };
  /** "Only if" for this step alone. */
  conditions: AutomationCondition[];
  /** Validated against the registry fields. */
  config: Record<string, unknown>;
}

export interface AutomationTrigger {
  type: string;
  module: AutomationModule;
  config: Record<string, unknown>;
}

export interface Automation {
  id: string;
  name: string;
  summary: string;
  journeyId?: string;
  /** Made from this template. */
  templateId?: string;
  /** prototype: the template version this automation was made from or last updated to. */
  templateVersion?: number;
  /** prototype: which automation of the template this one came from. */
  templateIndex?: number;
  templateUpdated?: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  steps: AutomationStep[];
  /** Order within its stage. */
  runOrder: number;
  isEnabled: boolean;
  /** First deploy. */
  deployedAt?: string;
  /** The current deploy approval. */
  approvalId?: string;
  /** A customer-facing change waits for approval. */
  needsReapproval: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  /** prototype: "Keep going even if the stage changes". */
  keepGoingIfStageChanges?: boolean;
  runsLast7Days: number;
  problemCount: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

/** The parts of an automation a run follows: what was approved at deploy. */
export interface AutomationDefinition {
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  steps: AutomationStep[];
  keepGoingIfStageChanges?: boolean;
}

export interface DeployApproval {
  id: string;
  automationId: string;
  approvedBy: string;
  approvedAt: string;
  customerFacingSteps: { stepId: string; title: string; messageId?: string; messageVersion?: number }[];
  /** prototype: the approved definition, which keeps running until a change is approved. */
  snapshot: AutomationDefinition;
}

export type MessageCategory = 'REPLY' | 'REMINDER' | 'OTHER';

export interface CustomerMessage {
  id: string;
  name: string;
  channel: 'EMAIL' | 'SMS';
  /** Email only. */
  subject?: string;
  /** Plain text in this prototype (the repo has no rich text editor). */
  body: string;
  /** System samples and the message guide, read-only. */
  isSample: boolean;
  version: number;
  usedInAutomationIds: string[];
  updatedBy: string;
  updatedAt: string;
  /** prototype: send-queue priority group. */
  category?: MessageCategory;
}

export interface MessageVersion {
  version: number;
  name: string;
  subject?: string;
  body: string;
  savedBy: string;
  savedAt: string;
}

export interface AppNotificationKind {
  kind: 'REVIEW_WAITING' | 'STEP_FAILED' | 'STUCK_ALERT' | 'DEPLOYED_BY_OTHER' | 'MESSAGE_NEEDS_APPROVAL' | 'SENDING_CAPACITY';
}

export interface Journey {
  id: string;
  name: string;
  description?: string;
  automationIds: string[];
  isEnabled: boolean;
  templateId?: string;
  /** prototype: stuck alert times are multiplied by this (Commercial doubles them). */
  stuckMultiplier?: number;
  createdAt: string;
}

export interface TemplateAutomation {
  name: string;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  steps: AutomationStep[];
  keepGoingIfStageChanges?: boolean;
}

export interface AutomationTemplate {
  id: string;
  kind: 'AUTOMATION' | 'JOURNEY';
  source: 'SYSTEM' | 'BUSINESS';
  name: string;
  description: string;
  automations: TemplateAutomation[];
  blanks: { automationIndex: number; stepId: string; fieldKey: string; question: string }[];
  version: number;
  updatedAt: string;
  /** prototype: journey stuck alert multiplier. */
  stuckMultiplier?: number;
  isDeleted?: boolean;
}

/* ---------- Runs and review items ---------- */

export type RunStatus = 'DONE' | 'WAITING' | 'WAITING_FOR_REVIEW' | 'FAILED' | 'SKIPPED' | 'PAUSED';

export type RunStepStatus = RunStatus | 'PENDING';

export interface RunStep {
  stepId: string;
  title: string;
  status: RunStepStatus;
  message: string;
  at?: string;
  createdRecordId?: string;
}

export interface AutomationRun {
  id: string;
  automationId: string;
  automationName: string;
  journeyName?: string;
  journeyId?: string;
  recordType: PipelineModule;
  recordId: string;
  recordLabel: string;
  status: RunStatus;
  startedAt: string;
  steps: RunStep[];
  /* prototype: what the engine needs to carry on */
  /** The steps as they were when the run started (changes apply to new runs only). */
  definition: AutomationStep[];
  /** Index of the step being worked on. */
  cursor: number;
  /** The stage entry number the run started from (once-only key, stage-change stop). */
  entryNo: number;
  /** The stage the trigger watched, when it is a stage trigger. */
  stage?: string;
  /** The step can't run before this time. */
  waitUntil?: string;
  /** Why it is waiting, in plain words. */
  waitingFor?: string;
  /** When the current step's turn came (delays count from here). */
  stepStartedAt?: string;
  /** "Wait for something to happen": its limit already passed once. */
  limitPassed?: boolean;
  keepGoingIfStageChanges?: boolean;
  /** Paused for this record (journey card). */
  pausedAt?: string;
  updatedAt: string;
  /** True when the automation was deleted after the run. Activity shows "(deleted)". */
  automationDeleted?: boolean;
  /** Retries of the failed step. */
  retries?: number;
  /** The event that started the run (part of the step once-key). */
  eventKey?: string;
  /** "Change and approve": edits for one step of this run only. */
  overrides?: Record<string, Record<string, unknown>>;
  /** Steps a reviewer approved ("Ask me first"). */
  approvedSteps?: string[];
}

export interface ReviewItem {
  id: string;
  runId: string;
  kind: 'CUSTOMER_EMAIL' | 'CUSTOMER_SMS' | 'SEND_ESTIMATE' | 'SEND_INVOICE' | 'BUSINESS_STEP';
  /** E.g. 'Book crew for 14–16 Oct'. */
  title: string;
  recordType: AutomationModule;
  recordId: string;
  customerId?: string;
  automationCreatedBy: string;
  preview: Record<string, unknown>;
  createdAt: string;
  /** prototype */
  stepId: string;
  automationId: string;
  status: 'WAITING' | 'APPROVED' | 'SKIPPED';
  decidedBy?: string;
  decidedAt?: string;
  skipReason?: string;
}

export interface ReadinessItem {
  level: 'PASS' | 'WARN' | 'BLOCK';
  message: string;
  automationId?: string;
  stepId?: string;
}

export interface ReadinessResult {
  ok: boolean;
  items: ReadinessItem[];
}

export interface TestRunResult {
  recordLabel: string;
  timeline: { at: string; automationName: string; stepTitle: string; outcome: 'WOULD_RUN' | 'WOULD_WAIT' | 'WOULD_FAIL' | 'WOULD_SKIP'; message: string }[];
}

export interface RecordJourney {
  journeyId?: string;
  journeyName?: string;
  isPaused: boolean;
  done: { title: string; at: string }[];
  next?: { title: string; waitingFor: string };
  problems: { message: string; runId: string }[];
}

/* ---------- Sending ---------- */

export interface SendingLimits { perSecond?: number; perDay?: number; perMonth?: number }

export interface SendingCapacity {
  /** E.g. 'sendgrid', 'twilio'; null until chosen. */
  provider: string | null;
  email: SendingLimits;
  sms: SendingLimits;
  usedThisMonth: { email: number; sms: number };
  waitingInQueue: { email: number; sms: number };
}

/** One customer message the mock provider "sent" (sandbox). */
export interface SentMessage {
  id: string;
  /** Once-only key: customer + record + automation + step + stage entry. */
  key: string;
  channel: 'email' | 'sms';
  to: string;
  customerId: string;
  subject?: string;
  body: string;
  messageId?: string;
  messageVersion?: number;
  runId?: string;
  recordType?: PipelineModule;
  recordId?: string;
  at: string;
}

/** Contact preferences (spec section 13, item 6: the backend must add these). */
export interface CustomerConsent {
  doNotText?: boolean;
  doNotEmail?: boolean;
  /** The customer replied STOP to a text. */
  textStopAt?: string;
}

/** What the engine remembers about one record. */
export interface RecordTrack {
  stage: string;
  /** Counts every time the record enters a stage (part of the once-only key). */
  entryNo: number;
  enteredAt: string;
  /** Field values watched by "A field changes". */
  fields: Record<string, string>;
  /** Paid amount, for "Payment is recorded" (invoices). */
  paid?: number;
}
