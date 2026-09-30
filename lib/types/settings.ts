/*
  Settings entities. Shapes follow the live app types in
  apps/main/src/types/*.ts, simplified for local mock data.

  Rule for anyone editing this file: you may ADD optional fields,
  but do not rename or remove fields. Other modules read them.
*/
import type { ID, LeadStatus } from './core';

/* ================= ORGANIZATION ================= */

export interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  timezone: string;
  photoUrl?: string;
  twoFactorEnabled: boolean;
  notifications: { email: boolean; sms: boolean; push: boolean };
  /** My Profile > Appearance toggle (UI preference only) */
  darkMode?: boolean;
  /** Mock password used to validate "Current Password" on My Profile */
  password?: string;
}

export interface BusinessProfile {
  companyName: string;
  legalName: string;
  email: string;
  phone: string;
  website: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  licenseNumber: string;
  taxId: string;
  logoUrl?: string;
  brandColor: string;
  businessHours: { day: string; open: string; close: string; closed: boolean }[];
  /** IANA timezone, e.g. "America/Chicago" */
  timezone?: string;
  /** Logo used on dark headers and reports (data URL) */
  logoInvertedUrl?: string;
  /** Automated Messages > Email Header & Footer (plain text / light HTML) */
  emailHeader?: string;
  emailFooter?: string;
  /** CRM-C6: simulated Facebook Lead Ads connection (no call to Facebook). */
  facebookLeadAds?: { pageName: string; connectedAt: string; by: string };
}

export interface Role {
  id: ID;
  name: string;
  description: string;
  roleType: 'SYSTEM' | 'CUSTOM';
  /** Permission keys, e.g. "leads.view", "estimates.edit" */
  permissions: string[];
  /** System roles: permissions restored by "Reset to default permissions" */
  defaultPermissions?: string[];
}

export interface Subscription {
  planName: string; // Growth
  price: number;
  interval: 'month' | 'year';
  status: 'Active' | 'Trialing' | 'Past Due' | 'Suspended' | 'Cancelled';
  renewsAt: string;
  seatsIncluded: number;
  seatsUsed: number;
  paymentMethod: { brand: string; last4: string; expMonth: number; expYear: number };
  addOns: { id: ID; name: string; price: number; active: boolean }[];
  billingHistory: {
    id: ID; date: string; description: string; amount: number; status: 'Paid' | 'Failed' | 'Pending';
    invoiceNumber?: string;
    type?: 'charge' | 'refund' | 'credit';
  }[];
}

export interface PaymentGateway {
  provider: 'Stripe';
  connected: boolean;
  accountId?: string;
  accountEmail?: string;
  acceptCards: boolean;
  acceptAch: boolean;
  passFeesToCustomer: boolean;
  connectedAt?: string;
  /** Authorize.Net credentials (the live app's gateway) */
  apiLoginId?: string;
  transactionKey?: string;
  publicClientKey?: string;
  /** false = Sandbox (test mode) */
  production?: boolean;
}

/* ================= CONFIGURATION ================= */

export interface GeneralConfig {
  baseLaborRate: number; // $/hr
  laborMargin: number; // %
  operatingExpense: number; // %
  calculateWaste: boolean;
  defaultWastePercent: number;
}

export interface GoalsProfit {
  desiredAnnualIncome: number;
  annualRevenueTarget: number;
  monthlyRevenueTarget: number;
  profitMargin: number; // %
  miscExpense: number; // %
  includeMiscExpense: boolean;
  workingWeeksPerYear: number;
  hoursPerWeek: number;
  crewSize: number;
  /** Reports > Stats: average job size used to turn estimate goals into sales goals (default 3500) */
  avgJobSize?: number;
  /** Reports > Stats: expected close rate in % (default 35) */
  closingRate?: number;
  /** Reports > Stats: editable goals per year, 12 months each */
  reportGoals?: Record<string, { estimateGoal: number; salesGoal: number }[]>;
  /** Goals & Profit (engine calibration) inputs */
  materialCost?: number; // %
  avgHourlyPay?: number;
  leadConversionRate?: number; // %
  burden?: { socialSecurity: number; medicareFuta: number; stateUnemp: number; workmansComp: number; otherLiability: number; benefits: number };
}

export interface FinancialSettings {
  applyProfitToMiscLineItems: boolean;
  miscLineItemProfitMargin: number;
  depositPercent: number;
  paymentTermsDays: number;
  currency: string;
  lateFeePercent: number;
}

export interface LaborBurden {
  id: ID;
  name: string;
  percentage: number;
}

export interface LaborConfig {
  baseHourlyRate: number;
  socialSecurity: number;
  medicareFuta: number;
  stateUnemp: number;
  workmansComp: number;
  otherLiability: number;
  benefits: number;
  customBurdens: LaborBurden[];
}

export interface DifficultyTier {
  id: ID;
  name: string;
  tierType: 'HEIGHT' | 'ACCESS';
  multiplier: number;
  sortOrder: number;
}

export interface ProjectDiscount {
  id: ID;
  name: string;
  discountType: 'PERCENT' | 'FLAT_PRICE';
  value: number;
  sortOrder: number;
}

export interface TaxRegion {
  id: ID;
  name: string;
  salesTaxRate: number; // %
  serviceTaxRate: number; // %
  zipCodes: string[];
  isDefault?: boolean;
}

export interface TableColumn {
  id: ID;
  name: string;
  columnType: 'SYSTEM' | 'HOURS' | 'CHECKBOX' | 'QUANTITY';
  /** hr for Hours columns; SqFt, LnFt, Item or Percent (% of the surface) for Quantity columns. */
  unit?: string;
  /** Preparation production rate in units per hour (patent 7). Checkbox and Quantity columns use it to add prep hours. */
  prepRate?: number;
  isVisible: boolean;
  isSystem: boolean;
  sortOrder: number;
}

/**
 * A board of stages (CRM-M1). Stored as a list from the start so more
 * pipelines (e.g. Marketing, CRM-C2) need no data change.
 */
export interface Pipeline {
  id: ID; // 'sales', 'production', or pl_… for added ones
  name: string;
  /** Sales holds leads, Production holds sold jobs, custom pipelines hold leads too. */
  kind: 'sales' | 'production' | 'custom';
  sortOrder: number;
}

export interface PipelineStage {
  id: ID;
  /** Fixed key: NEW, SOLD… for the original lead stages, a generated one for stages added later. */
  stageId: string;
  displayName: string;
  color: string; // hex
  /** Position inside its pipeline. */
  sortOrder: number;
  /** CRM-M2. Missing on data saved before pipelines = 'sales'. */
  pipelineId?: ID;
  /** System stages can be renamed and recoloured, not moved or deleted. */
  system?: boolean;
  /**
   * The lead lifecycle status this stage stands for (New, Sold…). Leads with
   * that status sit here. A stage without one holds leads moved into it by hand.
   */
  leadStatus?: LeadStatus;
  /** Kept for the lead lifecycle but not a board column (Archived). */
  hidden?: boolean;
}

/** One move of a lead or production card between stages (CRM-M7). */
export interface StageMove {
  pipelineId: ID;
  stageId: ID;
  stageName: string;
  by: string;
  at: string;
}

/** A card on the Production board: one per sale (CRM-M3). */
export interface ProductionCard {
  id: ID;
  /** Estimate id when there is one, else the lead id. Never two cards for one sale. */
  saleKey: string;
  pipelineId: ID;
  stageId: ID;
  title: string;
  customerName: string;
  leadId?: ID;
  estimateId?: ID;
  jobId?: ID;
  value: number;
  createdAt: string;
  history: StageMove[];
  /** Removed from Production when the lead left Sold. Kept so the sale never gets a second card. */
  removedAt?: string;
}

/** A link to the website form that tags the lead's source (CRM-M5). */
export interface TrackedLink {
  id: ID; // tl_…
  name: string;
  /** Tag passed as ?src= and stored as the lead source, e.g. "Facebook". */
  source: string;
  status: 'active' | 'paused';
  createdAt: string;
  createdBy: string;
}

export interface AutomatedMessage {
  id: ID;
  name: string;
  trigger: string; // e.g. "Estimate Sent", "Job Scheduled"
  channel: 'EMAIL' | 'SMS' | 'BOTH';
  delayValue: number;
  delayUnit: 'minutes' | 'hours' | 'days';
  subject?: string;
  body: string;
  isActive: boolean;
  /** Variable names shown as chips, e.g. "customerName" */
  availableVariables?: string[];
  /**
   * JS-C3: Automatic sends when the trigger happens; Manual waits for someone
   * to send it. Missing = Automatic (how every template behaved before).
   */
  mode?: 'automatic' | 'manual';
  /** CRM-C3: the event that sends this template. */
  ruleTrigger?: AutomationTrigger;
  /** CRM-C3: set = sends without asking. Any edit removes it. Missing = "Ask me first". */
  approval?: AutomationApproval;
}

/* ---------- Automation rules and approvals (CRM-C3 to C5) ---------- */

export type AutomationTrigger = 'estimate_accepted' | 'estimate_declined' | 'estimate_no_show' | 'job_complete';

export interface AutomationApproval {
  byId: ID;
  by: string;
  at: string;
}

/**
 * One step of a rule. Rules are stored as linked steps (trigger → condition →
 * action, with next / yes / no links), so the list editor and the flow view
 * read the same data (CRM-C4, CRM-C5).
 */
export interface RuleNode {
  id: ID;
  kind: 'trigger' | 'condition' | 'action';
  trigger?: AutomationTrigger;
  condition?: { field: 'lead_source' | 'estimate_value' | 'service_type'; op: 'is' | 'over'; value: string };
  action?: { channel: 'email' | 'sms'; subject?: string; body: string };
  next?: ID;
  yes?: ID;
  no?: ID;
}

export interface AutomationRule {
  id: ID; // ar_…
  name: string;
  active: boolean;
  startId: ID;
  nodes: RuleNode[];
  approval?: AutomationApproval;
  createdAt: string;
  updatedAt: string;
}

/** A customer message a rule or template prepared. Waits here until approved (CRM-C3 to C5). */
export interface PreparedMessage {
  id: ID;
  sourceKind: 'rule' | 'template';
  sourceId: ID;
  sourceName: string;
  /** trigger:recordId, so one event never prepares the same message twice. */
  eventKey: string;
  /** lead_stage: a Sales stage email held in the Complete version until approved. */
  trigger: AutomationTrigger | 'lead_stage';
  customerName: string;
  leadId?: ID;
  estimateId?: ID;
  jobId?: ID;
  channel: 'email' | 'sms';
  to: string;
  subject?: string;
  body: string;
  createdAt: string;
  status: 'waiting' | 'sent' | 'skipped';
  /** True when it went out without asking (the rule was approved). */
  auto?: boolean;
  decidedAt?: string;
  decidedBy?: string;
}

/** An event the automation engine has already handled. */
export interface AutomationEvent {
  id: string; // trigger:recordId
  at: string;
}

export interface SmsTemplate {
  id: ID;
  type: string; // ESTIMATE_SENT, APPOINTMENT_REMINDER...
  name: string;
  body: string;
  availableVariables: string[];
  isDefault: boolean;
  /** Original body, restored by "Reset to default" */
  defaultBody?: string;
}

export interface DocumentNumbering {
  id: ID;
  entityType: 'LEAD' | 'ESTIMATE' | 'JOB' | 'WORK_ORDER' | 'INVOICE';
  formatType: 'PREFIX_YEAR_MONTH_SERIAL' | 'PREFIX_YEAR_SERIAL' | 'PREFIX_SERIAL' | 'CUSTOM_SERIAL';
  prefix: string; // LEAD, EST, JOB, WO, INV
  customPrefix?: string;
  paddingLength: number;
  nextSerial: number;
  /** "Set starting number" is a one-time action */
  startingSet?: boolean;
}

/* ================= LIBRARIES ================= */

export interface EstimateType {
  id: ID;
  name: string; // Interior, Exterior, Cabinets
  description: string;
  hourlyRate: number;
  sortOrder: number;
}

export interface EstimateTemplate {
  id: ID;
  name: string; // Standard Interior Repaint
  description: string;
  estimateTypeId: ID;
  areaTemplateIds: ID[];
  lineItemTemplateIds: ID[];
  termsId?: ID;
  defaultPaintProductId?: ID;
  profitMargin: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  customerNotes?: string;
  internalNotes?: string;
  /** Materials & supplies added to the template, with quantities */
  materials?: { materialId: ID; qty: number }[];
  pricingModel?: 'HOURLY' | 'OPEX';
  depositSchedule?: string;
  accessTierId?: ID;
  heightTierId?: ID;
  taxRegionId?: ID;
  projectDiscountId?: ID;
}

export interface PackageTemplate {
  id: ID;
  name: string; // Good / Better / Best
  description: string;
  tier: 'Good' | 'Better' | 'Best';
  paintProductId?: ID;
  priceAdjustment: number; // %
  features: string[];
}

export interface AreaTemplate {
  id: ID;
  name: string; // Bedroom, Kitchen, Front Elevation
  estimateTypeId: ID;
  surfaceRateIds: ID[];
  sortOrder: number;
}

export interface SurfaceRate {
  id: ID;
  name: string; // Walls, Ceiling, Baseboards
  rateGroup: string; // Interior Walls, Trim, Exterior Siding...
  unit: 'sqft' | 'lnft' | 'each';
  defaultCoats: number;
  /** Production rate (units per hour) for each coat */
  rateCoat1: number;
  rateCoat2: number;
  rateCoat3: number;
  rateCoat4: number;
  useMultipliers: boolean;
  sortOrder: number;
  /** How quantity is measured: LENGTH_X_HEIGHT, LENGTH_X_WIDTH, PERIMETER_X_HEIGHT, PERIMETER, LENGTH, NONE */
  amountFormula?: string;
  /** Patent 8: coverage for a particular product on this surface (sq ft per gallon), used ahead of the product's own coverage. */
  coverageOverrides?: { paintProductId: ID; coverageCoat1: number; coverageCoat2?: number }[];
  /** Last change made by an approved estimating-feedback rate (patent 30). */
  feedback?: { rateId: string; version: number; at: string; pct: number; previous: Pick<SurfaceRate, 'rateCoat1' | 'rateCoat2' | 'rateCoat3' | 'rateCoat4'> };
}

/** A named category of surface rates ("Interior Walls"). SurfaceRate.rateGroup holds the name. */
export interface RateGroup {
  id: ID;
  name: string;
  sortOrder: number;
}

export interface Brand {
  id: ID;
  name: string;
  isCustom: boolean;
  sortOrder: number;
}

export interface PaintProduct {
  id: ID;
  name: string;
  brandId: ID;
  category: string; // Paint, Primer, Stain
  finish: string; // Flat, Eggshell, Satin, Semi-Gloss
  /** sqft per gallon, smooth surface */
  coverageCoat1: number;
  coverageCoat2: number;
  pricePerGallon: number;
  pricePer5Gallon?: number;
  isActive: boolean;
  isFavorite: boolean;
  colors?: { name: string; code: string; hex: string }[];
}

export interface Material {
  id: ID;
  name: string;
  category: string; // Masking, Caulk, Sundries
  unit: string; // roll, tube, each
  unitCost: number;
  isFavorite: boolean;
  sortOrder: number;
}

export interface LineItemTemplate {
  id: ID;
  name: string;
  description: string;
  itemType: 'PRICED' | 'DESCRIPTIVE';
  calculationType?: 'FLAT_PRICE' | 'PERCENT';
  defaultValue?: number;
  sortOrder: number;
}

export interface TermsCondition {
  id: ID;
  name: string;
  content: string; // plain text / light markdown
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
