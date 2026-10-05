/*
  Everything the Automations module stores (the mock adapter's database).
  Saved by lib/automations/store.ts. In production each list is a backend
  table behind the endpoints in spec section 11.
*/
import type {
  Automation, AutomationRun, AutomationTemplate, CustomerConsent, DeployApproval, Journey, MessageVersion, PipelineModule,
  RecordTrack, ReviewItem, SendingLimits, SentMessage,
} from './types';

export interface StuckSetting {
  hours: number;
  from: string;
  enabled: boolean;
}

export interface AutomationSettings {
  /** Texting stays locked until the state rules and timezone are supplied (feature 29). */
  textingReleased: boolean;
  /** Feature flags the registry reads (e.g. 'new-job-scheduling'). */
  flags: Record<string, boolean>;
  /** Working days for "Count working days only" (0 = Sun … 6 = Sat). */
  workingDays: number[];
  /** Stuck alerts count working days only. */
  stuckWorkingDaysOnly: boolean;
  /** The sending provider plan, from configuration (spec section 3). */
  sending: { provider: string | null; email: SendingLimits; sms: SendingLimits };
  /** Notification kinds a user also wants by email (Settings › My Profile). In-app is always on. */
  emailPrefs: Record<string, string[]>;
}

export interface EngineState {
  automations: Automation[];
  journeys: Journey[];
  templates: AutomationTemplate[];
  approvals: DeployApproval[];
  runs: AutomationRun[];
  reviews: ReviewItem[];
  /** recordKey → what the engine last saw. */
  tracks: Record<string, RecordTrack>;
  /** Trigger once-keys: an event starts an automation once. */
  fired: Record<string, string>;
  /** Step once-keys: automation + step + record + stage entry (+ event). */
  executed: Record<string, string>;
  sent: SentMessage[];
  consent: Record<string, CustomerConsent>;
  /** Estimates the estimator marked ready to send (backend gap 3: kept here for the prototype). */
  readyEstimates: Record<string, string>;
  /** Stuck alert overrides per pipeline and stage (defaults come from the registry). */
  stuck: Partial<Record<PipelineModule, Record<string, StuckSetting>>>;
  /** recordKey|entryNo → alerts sent. */
  stuckSent: Record<string, { count: number; lastAt: string }>;
  /** Round-robin pointer per role. */
  roundRobin: Record<string, number>;
  /** recordKey → when a journey was paused for it (journey card). */
  paused: Record<string, string>;
  /** Run start times per record, for the loop guard. */
  loopGuard: Record<string, string[]>;
  /** Touch-up requests already seen. */
  touchUpsSeen: string[];
  /** Message version history, by message id. */
  messageVersions: Record<string, MessageVersion[]>;
  /** Monthly sending notices already sent: "2026-10:email:80". */
  capacityNotices: Record<string, string>;
  /** Failure notices already sent: runId|stepId. */
  failureNotices: Record<string, string>;
  settings: AutomationSettings;
  /** Set once the engine has recorded the records that existed before it started. */
  baselinedAt?: string;
  /** Per-user UI state (collapsed groups, Building blocks panel). */
  ui: { collapsed: Record<string, boolean>; panelOpen: boolean; firstDropDone: boolean };
  seq: number;
}

export function emptyState(): EngineState {
  return {
    automations: [], journeys: [], templates: [], approvals: [], runs: [], reviews: [], tracks: {}, fired: {}, executed: {}, sent: [], consent: {},
    readyEstimates: {}, stuck: {}, stuckSent: {}, roundRobin: {}, paused: {}, loopGuard: {}, touchUpsSeen: [], messageVersions: {}, capacityNotices: {},
    failureNotices: {},
    settings: {
      textingReleased: false,
      flags: { 'new-job-scheduling': true },
      workingDays: [1, 2, 3, 4, 5],
      stuckWorkingDaysOnly: false,
      sending: { provider: null, email: {}, sms: {} },
      emailPrefs: {},
    },
    ui: { collapsed: {}, panelOpen: true, firstDropDone: false },
    seq: 0,
  };
}

export function nextId(s: EngineState, prefix: string): string {
  s.seq += 1;
  return `${prefix}${s.seq}`;
}
