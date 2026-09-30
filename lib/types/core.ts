/*
  Core business entities: customers, leads, estimates, jobs, invoices,
  presentations, work orders, calendar events and dashboard items.
  Field names follow the live app types (apps/main/src/types/*.ts) where possible.
*/

export type ID = string;

/* ---------- Team ---------- */

export type TeamRole = 'Owner' | 'Admin' | 'Estimator' | 'Project Manager' | 'Crew Lead' | 'Painter' | 'Office';

export interface TeamMember {
  id: ID;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: TeamRole;
  roleId?: ID; // links to settings Role (permissions)
  status: 'Active' | 'Invited' | 'Inactive';
  hourlyRate: number;
  /** Weekly hours this person can be scheduled for */
  capacityHours: number;
  /** Hex color used on the scheduling board */
  color: string;
  isCrew: boolean;
  lastActive?: string;
  /** Profile picture (data URL) */
  photoUrl?: string;
  /** Weekly availability keyed by week start (Sunday, YYYY-MM-DD). 7 days, Sun..Sat. */
  schedule?: Record<string, { start: string; end: string; working: boolean }[]>;
  /** Default working weekdays (0 = Sun .. 6 = Sat) for weeks without a saved schedule. Unset: every day is schedulable. */
  workingDays?: number[];
  /** Time off / unavailable dates. The scheduler refuses hours on these days. */
  timeOff?: MemberTimeOff[];
}
export interface MemberTimeOff {
  id: ID;
  startDate: string;
  endDate: string;
  reason: string;
}

/* ---------- Customers / Contacts ---------- */

export type ContactType = 'Lead' | 'Contact' | 'Client';

export interface Customer {
  id: ID;
  firstName: string;
  lastName: string;
  companyName?: string;
  email: string;
  phone: string;
  secondaryPhone?: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  type: ContactType;
  source: string;
  createdAt: string;
  notes?: string;
  tags?: string[];
  secondaryEmail?: string;
  /** 0-5 star rating shown on the contact header */
  rating?: number;
  /** Job-site addresses besides the primary address (patent 1: "Add Service Location"). */
  serviceLocations?: ServiceLocation[];
}

/** A property / job site belonging to a customer. Geocoded for the map and directions. */
export interface ServiceLocation {
  id: ID;
  label?: string;
  street: string;
  /** Unit, suite or lot */
  unit?: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
  /** When geocoding was tried; `lat` is missing when the address couldn't be found. */
  geocodedAt?: string;
  createdAt: string;
}

/* ---------- Leads ---------- */

export type LeadStatus = 'New' | 'Contacted' | 'Scheduled' | 'Pending' | 'Sold' | 'Lost' | 'Archived';

export interface Lead {
  id: ID;
  leadNumber: string; // LEAD-2026-5
  firstName: string;
  lastName: string;
  companyName?: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  securityCode?: string;
  leadSource: string; // Website, Referral, Existing Customer...
  serviceType: string; // Interior, Exterior, Cabinets...
  status: LeadStatus;
  estimatedValue: number;
  date: string; // lead date (ISO)
  createdAt: string;
  updatedAt: string;
  qualityRating?: number; // 1-5
  notes?: string;
  customerId?: ID;
  estimateId?: ID;
  /** Badge shown on the card: LEAD (new), CONTACT (has customer), CLIENT (has sold job) */
  contactType: 'LEAD' | 'CONTACT' | 'CLIENT';
  assignedTo?: ID;
  appointment?: { date: string; time: string; estimatorId?: ID } | null;
  secondaryPhone?: string;
  secondaryEmail?: string;
  /** Calendar event created when the estimate appointment was scheduled */
  appointmentEventId?: ID;
  /** Minutes for the estimate appointment (15-120) */
  appointmentDuration?: number;
  /** Automated messages sent for this lead's pipeline stages (Settings > Automated Messages). */
  sentMessages?: LeadMessageLog[];
  /** Stage messages with a delay, waiting for their send time (patent 1). Sent ones move to sentMessages. */
  scheduledMessages?: ScheduledLeadMessage[];
  /**
   * CRM-M2: a Sales stage without a lifecycle status that the lead was moved
   * into by hand. It holds while the lead keeps `stageStatus`; a lifecycle
   * change (estimate sent, sold…) puts the lead back on its status stage.
   */
  stageId?: ID;
  stageStatus?: LeadStatus;
  /** CRM-C2: stage in each added pipeline (pipeline id → stage id). Missing = the first stage. */
  pipelineStages?: Record<ID, ID>;
  /** CRM-M7: every stage the lead was in, oldest first. */
  stageHistory?: import('./settings').StageMove[];
  /** CRM-M5: the tracked link the website form was opened from. */
  trackedLinkId?: ID;
}

export interface ScheduledLeadMessage {
  id: ID;
  /** AutomatedMessage id */
  messageId: ID;
  name: string;
  stage: LeadStatus;
  channel: 'EMAIL' | 'SMS';
  to: string;
  subject?: string;
  body: string;
  createdAt: string;
  sendAt: string;
  cancelledAt?: string;
  cancelReason?: string;
}

export interface LeadMessageLog {
  /** AutomatedMessage id */
  messageId: ID;
  name: string;
  stage: LeadStatus;
  channel: 'EMAIL' | 'SMS';
  to: string;
  at: string;
  ok: boolean;
  /** True when no live email/SMS service is configured (nothing left the server). */
  sandbox: boolean;
  externalId?: string;
  error?: string;
}

/* ---------- Estimates ---------- */

export type EstimateStatus = 'Draft' | 'Sent' | 'Viewed' | 'Approved' | 'Rejected' | 'Expired';

export interface EstimateLineItem {
  optional?: boolean;
  selected?: boolean;
  id: ID;
  areaId: ID;
  description: string;
  surfaceType: string; // Walls, Ceiling, Trim...
  paintProductId?: ID;
  paintName?: string;
  quantity: number;
  unit: 'sqft' | 'lnft' | 'each' | 'hour' | 'gallon';
  /** Material price per unit */
  unitPrice: number;
  laborHours: number;
  laborRate: number;
  coats: number;
  difficultyMultiplier: number;
  /** Total for this line (material + labor, after multiplier) */
  total: number;
  /** Difficulty tiers picked for this line (Settings > Difficulty Tiers) */
  heightTierId?: ID;
  accessTierId?: ID;
  /** True once the user types a quantity, so dimension changes stop overwriting it */
  quantityManual?: boolean;
  /** Explicit coating area for lines measured in length, items, hours or gallons. */
  coatingAreaSqft?: number;
  /** Property side or room location, e.g. "Front Exterior", "Living Rm" (patent 4). */
  location?: string;
  /** Surface characteristic; changes labour and coverage (lib/estimating.ts). Missing = smooth. */
  condition?: SurfaceCondition;
  /** Finish / sheen for this surface; filled from the colour card when a colour is assigned. */
  sheen?: string;
  /** Preparation entries keyed by Table Column id: ticked (checkbox), hours or quantity. */
  prep?: Record<ID, number | boolean>;
  /** Derived (lib/estimating.ts): laborHours = applicationHours + prepHours. */
  applicationHours?: number;
  prepHours?: number;
  /** Derived: gallons of paint for this surface. */
  gallons?: number;
}

export type SurfaceCondition = 'smooth' | 'medium' | 'rough' | 'porous';

export interface EstimateArea {
  id: ID;
  name: string; // Living Room, Master Bedroom...
  areaTemplateId?: ID;
  length?: number;
  width?: number;
  height?: number;
  notes?: string;
}

export interface EstimateVersion {
  version: number;
  date: string;
  total: number;
  status: EstimateStatus;
  changedBy: string;
  note: string;
  /*
    Snapshot when the version was saved (lib/calculations versionSnapshot).
    Reports book amendments from these (features/lib/rules/sales-entries.ts).
    Missing on versions saved before they were recorded.
  */
  /** Total before sales tax (after discount). */
  preTaxTotal?: number;
  laborHours?: number;
  /** Included lines and extras with their totals, to show what an amendment changed. */
  lines?: { id: ID; description: string; total: number }[];
}

export interface Estimate {
  id: ID;
  estimateNumber: string; // EST-2026-9
  title: string; // Standard Interior Repaint
  customerId: ID;
  leadId?: ID;
  estimateTemplateId?: ID;
  estimateType: string; // Interior, Exterior, Cabinets
  status: EstimateStatus;
  date: string;
  validUntil: string;
  address: string;
  /** Service location the estimate is for (Customer.serviceLocations); missing = the primary address. */
  serviceLocationId?: ID;
  areas: EstimateArea[];
  lineItems: EstimateLineItem[];
  /** Additional flat items from the Line Items library */
  extras: { id: ID; name: string; quantity: number; unitPrice: number }[];
  discountId?: ID;
  discountType: 'percent' | 'flat' | 'none';
  discountValue: number;
  taxRegionId?: ID;
  taxRate: number; // percent
  /** Target profit margin applied on top of cost (percent) */
  profitMargin: number;
  termsId?: ID;
  notes?: string;
  internalNotes?: string;
  createdBy: ID;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  viewedAt?: string;
  approvedAt?: string;
  signature?: { name: string; date: string } | null;
  versions: EstimateVersion[];
  jobId?: ID;
  /** Team member shown as "Estimator" on the proposal */
  estimatorId?: ID;
  /** Estimate-wide default difficulty tiers (Finalize section) */
  heightTierId?: ID;
  accessTierId?: ID;
  /** "Deposit & Payment Schedule" text on the Finalize section */
  depositTerms?: string;
  /** Reason the customer gave when declining */
  declineReason?: string;
  /** Every time the customer opened the estimate link (ISO timestamps, oldest first). */
  viewLog?: string[];
  /** Client Preview / customer output settings (template, hidden sections and line parts). */
  presentation?: EstimatePresentationSettings;
  /** Every "Send to Customer" attempt, oldest first (lib/estimate-email.ts). Missing on older data = none. */
  deliveries?: EstimateDelivery[];
}

/**
 * One message of a "Send to Customer" attempt, as reported by /api/messaging.
 * delivered = the email/SMS provider accepted it; sandbox = the server has no
 * email keys, so nothing left the server; failed = not sent (see error).
 */
export interface EstimateDelivery {
  id: ID;
  /** Same for every recipient of one send, so the latest attempt can be shown together. */
  sendId: ID;
  at: string;
  to: string;
  channel: 'email' | 'sms';
  status: 'delivered' | 'sandbox' | 'failed';
  error?: string;
  /** Message id returned by the provider (or the sandbox "SBX-" id). */
  providerMessageId?: string;
  subject?: string;
}

/** Content blocks of the customer output that the gear panel can show or hide. */
export type ProposalSectionKey =
  | 'customer' | 'scope' | 'linePrices' | 'areaTotals' | 'specs' | 'optional' | 'pricing' | 'notes' | 'terms' | 'signature';

/** Parts of one scope line that the per-line ⋯ menu can hide. */
export type ProposalLinePart = 'price' | 'prep' | 'colour' | 'product' | 'sheen' | 'coats' | 'quantity' | 'location';

export interface EstimatePresentationSettings {
  /** Presentation template used by Client Preview. Missing = the only matching template, else the proposal. */
  templateId?: ID;
  /** True = always use the plain proposal, even when a template matches. */
  useProposal?: boolean;
  /** Hidden content blocks (ProposalSectionKey) and hidden template section ids. */
  hiddenSections?: string[];
  /** Lines left out of the customer output entirely. */
  hiddenLines?: ID[];
  /** Per line: the parts not shown to the customer. */
  hiddenLineParts?: Record<ID, ProposalLinePart[]>;
}

/* ---------- Jobs ---------- */

export type JobStatus =
  | 'Unscheduled'
  | 'Confirmed'
  | 'Scheduled'
  | 'In Production'
  | 'Touch Up'
  | 'Ready for Inspection'
  | 'Completed'
  | 'Marketing'
  | 'Cancelled';

export interface CrewAssignment {
  memberId: ID;
  role: string; // Crew Lead, Painter, Helper
  hours: number;
  date?: string; // specific day, if split
  /** The job shift (portion) these hours belong to. Unset: the job's own dates and daily window. */
  shiftId?: ID;
}
/** A named shift or portion of a job with its own dates, daily window and crew (same shape as the feature WorkOrderShift). */
export interface JobShift {
  id: ID;
  name?: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  memberIds: ID[];
  /** Per-day overrides; null excludes a day from this shift. */
  dailyHours?: Record<string, { startTime: string; endTime: string } | null>;
}

export interface JobBreak {
  id: ID;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface JobNote {
  id: ID;
  date: string;
  authorId: ID;
  text: string;
  type: 'note' | 'daily-log';
}

export interface Job {
  scheduleProtected?: boolean;
  /** Named shifts / portions scheduled separately (synced with the work order's shifts). */
  shifts?: JobShift[];
  /** Required hours the current schedule was planned against; differs from estimatedHours after a change order or amendment. */
  scheduleBasisHours?: number;
  id: ID;
  jobNumber: string; // JOB-2026-4
  title: string;
  customerId: ID;
  estimateId?: ID;
  leadId?: ID;
  address: string;
  status: JobStatus;
  startDate?: string; // ISO date
  endDate?: string;
  startTime?: string; // 08:00
  endTime?: string; // 16:00
  estimatedHours: number;
  value: number;
  crew: CrewAssignment[];
  breaks: JobBreak[];
  notes: JobNote[];
  history: { date: string; text: string }[];
  createdAt: string;
  completedAt?: string;
  /** Scheduling priority shown in the Job Scheduling details panel (default Normal) */
  priority?: 'Low' | 'Normal' | 'High' | 'Urgent';
}

/* ---------- Crew schedule notifications (JS) ---------- */

/** What one person was last told about one job (features/lib/rules/schedule-notify.ts). */
export interface ScheduleNotifySnapshot {
  /** memberId:jobId */
  id: ID;
  memberId: ID;
  jobId: ID;
  jobNumber: string;
  title: string;
  view: {
    startDate?: string;
    endDate?: string;
    startTime?: string;
    endTime?: string;
    shifts: { name: string; startDate: string; endDate: string; startTime: string; endTime: string; days?: string }[];
    days: string[];
  };
  notifiedAt: string;
}

/** One Schedule Update sent to a crew member. Sandbox only: nothing leaves the prototype. */
export interface ScheduleMessageLog {
  id: ID;
  memberId: ID;
  channel: 'email' | 'sms';
  to: string;
  subject: string;
  body: string;
  lang: 'en' | 'es';
  jobIds: ID[];
  at: string;
  sentBy: string;
  sandbox: true;
  /** JS-C4: the sandbox provider's answer. */
  delivery: 'delivered' | 'not_delivered';
  error?: string;
}

/* ---------- Work Orders ---------- */

export interface WorkOrder {
  id: ID;
  workOrderNumber: string; // WO-2026-1
  jobId: ID;
  title: string;
  status: 'Open' | 'In Progress' | 'Completed';
  assignedTo: ID[];
  dueDate: string;
  instructions: string;
  tasks: { id: ID; text: string; done: boolean }[];
  createdAt: string;
}

/* ---------- Invoices ---------- */

export type InvoiceStatus = 'Draft' | 'Sent' | 'Unpaid' | 'Partial' | 'Paid' | 'Overdue' | 'Void';

export interface InvoiceLineItem {
  id: ID;
  description: string;
  quantity: number;
  rate: number;
}

export interface Payment {
  id: ID;
  date: string;
  amount: number;
  method: 'Credit Card' | 'Check' | 'Cash' | 'ACH' | 'Other';
  reference?: string;
  note?: string;
  /** Last 4 digits when paid by card (customer pay page / Charge Card) */
  cardLast4?: string;
}

export interface Invoice {
  id: ID;
  invoiceNumber: string; // INV-2026-5
  customerId: ID;
  jobId?: ID;
  estimateId?: ID;
  leadId?: ID;
  date: string;
  dueDate: string;
  status: InvoiceStatus;
  lineItems: InvoiceLineItem[];
  taxRate: number;
  discount: number; // flat amount
  payments: Payment[];
  notes?: string;
  termsId?: ID;
  sentAt?: string;
  history: { date: string; text: string }[];
  /** Deposit / Progress / Final (live Create Invoice modal) */
  invoiceType?: 'Deposit' | 'Progress' | 'Final';
  /** Amount requested in the last Send Invoice email */
  requestedAmount?: number;
  viewedAt?: string;
}

/* ---------- Presentations ---------- */

export type PresentationSectionType =
  | 'cover'
  | 'about'
  | 'services'
  | 'gallery'
  | 'testimonials'
  | 'process'
  | 'warranty'
  | 'team'
  | 'estimate'
  | 'custom'
  /* Estimate-driven blocks, filled from the linked estimate (Client Preview templates). */
  | 'property'
  | 'scope'
  | 'specs'
  | 'optional'
  | 'pricing';

export interface PresentationSection {
  id: ID;
  type: PresentationSectionType;
  title: string;
  content: string;
  enabled: boolean;
  /** Optional sub-heading shown under the section title */
  subtitle?: string;
  /** Layout style 1-3 (the live builder's "Style 1/2/3") */
  variant?: 1 | 2 | 3;
  /** Uploaded block image (data URL). Missing = the gradient placeholder. */
  imageUrl?: string;
  /** Per-item images for list blocks (gallery tiles), by item index (data URLs). */
  itemImages?: (string | null)[];
}

export interface Presentation {
  id: ID;
  title: string;
  description: string;
  status: 'Draft' | 'Published';
  theme: 'blue' | 'purple' | 'green' | 'dark';
  isTemplate: boolean;
  /** Estimate types this presentation is for, e.g. ['Interior','Exterior'] */
  scopes: string[];
  /** Estimate templates this presentation is used for (Client Preview). Takes precedence over `scopes` when set. */
  templateIds?: ID[];
  /** CSS gradient used as the cover image */
  cover: string;
  /** Uploaded cover photo (data URL), shown over the gradient. */
  coverImage?: string;
  sections: PresentationSection[];
  estimateId?: ID;
  customerId?: ID;
  views: number;
  sharedWith: string[];
  createdAt: string;
  updatedAt: string;
  /** Builder "Branding" tab. Falls back to the theme color when missing. */
  branding?: { primaryColor: string; headingFont: string; bodyFont: string };
  /** Header navigation links (label + target section id) */
  navLinks?: { label: string; targetId: string }[];
  /** Footer message and links */
  footerText?: string;
  footerLinks?: { label: string; targetId: string }[];
}

/* ---------- Calendar ---------- */

export interface CalendarEvent {
  id: ID;
  title: string;
  type: 'Estimate Appointment' | 'Job' | 'Meeting' | 'Follow Up';
  date: string; // YYYY-MM-DD
  startTime: string; // 09:00
  endTime: string;
  leadId?: ID;
  jobId?: ID;
  customerId?: ID;
  assignedTo?: ID;
  address?: string;
  notes?: string;
  /** Appointment status (missing = Scheduled) */
  status?: 'Scheduled' | 'Completed';
}

/* ---------- Dashboard ---------- */

export interface Task {
  id: ID;
  text: string;
  done: boolean;
  createdAt: string;
}

export interface Activity {
  id: ID;
  date: string;
  text: string;
  entity?: 'lead' | 'estimate' | 'job' | 'invoice';
  entityId?: ID;
}

export interface Message {
  id: ID;
  from: string;
  customerId?: ID;
  channel: 'email' | 'sms';
  preview: string;
  date: string;
  unread: boolean;
}
