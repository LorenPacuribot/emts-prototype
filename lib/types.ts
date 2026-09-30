/*
  Single import point for all TypeScript types.
  Usage: import type { Lead, Estimate } from '@/lib/types';
*/
export * from './types/core';
export * from './types/settings';

import type {
  Activity, CalendarEvent, Customer, Estimate, Invoice, Job, Lead, Message,
  Presentation, ScheduleMessageLog, ScheduleNotifySnapshot, Task, TeamMember, WorkOrder,
} from './types/core';
import type {
  AreaTemplate, AutomatedMessage, AutomationEvent, AutomationRule, Brand, BusinessProfile, DifficultyTier, DocumentNumbering,
  EstimateTemplate, EstimateType, FinancialSettings, GeneralConfig, GoalsProfit, LaborConfig,
  LineItemTemplate, Material, PackageTemplate, PaintProduct, PaymentGateway, Pipeline, PipelineStage, PreparedMessage, ProductionCard,
  ProjectDiscount, RateGroup, Role, SmsTemplate, Subscription, SurfaceRate, TableColumn, TaxRegion,
  TermsCondition, TrackedLink, UserProfile,
} from './types/settings';

/** Every list of records in the app. Each key is a "collection". */
export interface Collections {
  team: TeamMember[];
  customers: Customer[];
  leads: Lead[];
  estimates: Estimate[];
  jobs: Job[];
  workOrders: WorkOrder[];
  invoices: Invoice[];
  presentations: Presentation[];
  events: CalendarEvent[];
  tasks: Task[];
  activity: Activity[];
  messages: Message[];
  /** JS-M2: what each crew member was last told about each job. */
  scheduleNotifySnapshots: ScheduleNotifySnapshot[];
  /** JS-M4: Schedule Update messages sent (sandbox log). */
  scheduleMessages: ScheduleMessageLog[];
  // settings lists
  roles: Role[];
  difficultyTiers: DifficultyTier[];
  projectDiscounts: ProjectDiscount[];
  taxRegions: TaxRegion[];
  tableColumns: TableColumn[];
  pipelineStages: PipelineStage[];
  /** CRM-M1: Sales, Production and any added pipelines. */
  pipelines: Pipeline[];
  /** CRM-M3: one card per sale on the Production board. */
  productionCards: ProductionCard[];
  /** CRM-M5: website form links that tag the lead source. */
  trackedLinks: TrackedLink[];
  /** CRM-C4: automation rules (linked steps). */
  automationRules: AutomationRule[];
  /** CRM-C3 to C5: customer messages prepared by rules and templates (the approval queue). */
  preparedMessages: PreparedMessage[];
  /** Events the automation engine already handled. */
  automationEvents: AutomationEvent[];
  automatedMessages: AutomatedMessage[];
  smsTemplates: SmsTemplate[];
  documentNumbering: DocumentNumbering[];
  estimateTypes: EstimateType[];
  estimateTemplates: EstimateTemplate[];
  packageTemplates: PackageTemplate[];
  areaTemplates: AreaTemplate[];
  surfaceRates: SurfaceRate[];
  rateGroups: RateGroup[];
  brands: Brand[];
  paintProducts: PaintProduct[];
  materials: Material[];
  lineItemTemplates: LineItemTemplate[];
  termsConditions: TermsCondition[];
}

/** Single-object settings (one record per organization). */
export interface Singletons {
  currentUserId: string;
  userProfile: UserProfile;
  businessProfile: BusinessProfile;
  subscription: Subscription;
  paymentGateway: PaymentGateway;
  generalConfig: GeneralConfig;
  goalsProfit: GoalsProfit;
  financialSettings: FinancialSettings;
  laborConfig: LaborConfig;
}

export type CollectionKey = keyof Collections;
export type SingletonKey = keyof Singletons;
export type ItemOf<K extends CollectionKey> = Collections[K][number];

export interface Database {
  collections: Collections;
  singletons: Singletons;
}
