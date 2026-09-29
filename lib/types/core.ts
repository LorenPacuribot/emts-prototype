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
}

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
