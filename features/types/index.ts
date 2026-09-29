/**
 * Data model for the EMTS prototype.
 *
 * Names follow the "Tables To Use" sections of the User Stories and Final
 * Design v1.0 document (COLOR_CARD_SPECS, PURCHASE_ORDERS, ...), written in
 * TypeScript style. Dates are ISO strings so the whole database can be saved
 * to localStorage as JSON.
 */

export type ID = string;
export type ISODate = string;

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

export type Role =
  | "owner"
  | "office_manager"
  | "senior_estimator"
  | "estimator"
  | "crew_lead"
  | "bookkeeper";

export interface User {
  id: ID;
  name: string;
  role: Role;
  email: string;
  /** Area served, used when assigning follow-ups. */
  area?: string;
  outOfOffice?: boolean;
}

export interface Customer {
  id: ID;
  name: string;
  email?: string;
  phone?: string;
  /** Office has verified the email/phone on file (feature 26). */
  contactVerified: boolean;
  contactVerifiedAt?: ISODate;
  contactVerifiedBy?: ID;
  /** Names and contacts removed by a personal-data deletion request (feature 25). */
  personalDataDeleted?: boolean;
  preferredChannel: "phone" | "email" | "text";
  /** Signed consent for follow-up contact (feature 29). */
  consentSigned: boolean;
  /** Authorised property managers who may approve change orders. */
  authorisedSigners: string[];
  /** Replica bridge: placeholder contact for a replica lead that has no customer yet (hidden from Contacts). */
  leadOnly?: boolean;
}

/* ------------------------------------------------------------------ */
/* Existing app records (leads, estimates, invoices)                   */
/* ------------------------------------------------------------------ */

export type LeadSource = "website" | "existing_customer" | "referral" | "repaint_alert";
export type PipelineStage =
  | "new_lead"
  | "contacted"
  | "estimate_scheduled"
  | "pending"
  | "sold"
  | "lost"
  | "archived";

export interface Lead {
  id: ID; // LEAD-2026-1
  customerId: ID;
  propertyId?: ID;
  source: LeadSource;
  stage: PipelineStage;
  createdAt: ISODate;
  note?: string;
  /** Live Lead.scheduleDetails: the estimate appointment (startAt, assignedUser). */
  scheduledAt?: ISODate;
  assignedUserId?: ID;
  /** Live Lead.estimate: the estimate made from this lead (one-to-one). */
  estimateId?: ID;
  /** Free-text source when "Other" was chosen (live OTHER_CUSTOM). */
  sourceLabel?: string;
  /** Live Lead.scheduleDetails.duration, in minutes. */
  durationMin?: number;
  /** Live Lead.notes (POST /leads/{id}/notes). Newest first. */
  notes?: { id: ID; at: ISODate; by: ID; text: string }[];
  /* ---- Feature 34 website-form fields (optional for older records) ---- */
  /** Contact details as submitted on the website form. */
  name?: string;
  phone?: string;
  email?: string;
  town?: string;
  message?: string;
  /** Stable reference of the website event that created the lead (never duplicated). */
  eventRef?: string;
  /** The 90-day repeat-enquiry window runs from here (34.Q02). */
  lastActivityAt?: ISODate;
  /** Every website event attached to this lead. */
  events?: { ref: string; at: ISODate; message: string; matchedOn?: "phone" | "email" }[];
  /** Phone matched one contact and email another: a person resolves it (34.Q02). */
  review?: { phoneMatchLeadId: ID; emailMatchLeadId: ID; status: "open" | "resolved"; resolution?: string; resolvedBy?: ID; resolvedAt?: ISODate };
  /** Mandatory website fields that were missing on submission. */
  missingFields?: string[];
  manual?: boolean;
}

/** The live app's EstimateStatus (types/estimates.ts). ACCEPTED is shown as "Approved". */
export type EstimateStatus = "DRAFT" | "SENT" | "VIEWED" | "ACCEPTED" | "AMENDED_DRAFT" | "PENDING_REAPPROVAL" | "DECLINED" | "EXPIRED";

/** Statuses where the estimate is still an open quote (not signed, not closed). */
export const OPEN_ESTIMATE_STATUSES: EstimateStatus[] = ["DRAFT", "SENT", "VIEWED"];

export interface Estimate {
  /** Saved builder pricing is authoritative for estimates authored in the replica. */
  pricingSnapshot?: Pick<import('@/lib/types').Estimate, 'lineItems' | 'extras' | 'discountType' | 'discountValue' | 'taxRate'>;
  id: ID; // EST-2026-1 (the live estimateNumber)
  title: string;
  customerId: ID;
  /** The live serviceLocationId. The prototype's Property is the live ServiceLocation. */
  propertyId: ID;
  /** Every live estimate comes from a scheduled lead (CreateEstimateDto.leadId). */
  leadId?: ID;
  status: EstimateStatus;
  total: number;
  createdAt: ISODate;
  /** True when this estimate is a repaint quote (suppresses repaint outreach). */
  isRepaint?: boolean;
  validUntil?: ISODate;
  /** Feature 28: repeat estimate this quote was issued from, and its source jobs. */
  repeatEstimateId?: ID;
  sourceJobIds?: ID[];
  /* ---- Live EstimateResponse fields used by the rebuilt host screens ---- */
  estimatorId?: ID;
  estimateDate?: ISODate;
  /**
   * The prototype's internal project record (JOB-…) that carries this
   * estimate's scope, colours and specifications. It stays hidden (status
   * "estimating") until the estimate is accepted; then it is the live Job.
   */
  jobId?: ID;
  /** Public link token for /estimates/view (live `presentationUrl` token). */
  publicToken?: string;
  sentAt?: ISODate;
  viewedAt?: ISODate;
  /** Every open of the public link (oldest first); viewedAt stays the first one. */
  viewLog?: ISODate[];
  acceptedAt?: ISODate;
  declinedAt?: ISODate;
  signatureName?: string;
  amendmentNumber?: number;
  lastAmendedAt?: ISODate;
  customerNotes?: string;
  internalNotes?: string;
}

/** Live EstimateHistoryEntry (types/estimates.ts), shown on /estimates/[id]/history. */
export interface EstimateHistoryEntry {
  id: ID;
  estimateId: ID;
  amendmentNumber: number;
  /** Live trigger values, plus the NEW change-order triggers (feature 24). */
  trigger: string;
  status: EstimateStatus;
  grandTotal: number;
  preAmendmentTotal?: number;
  performedBy: "ORG_USER" | "CLIENT" | "SYSTEM";
  userId?: ID;
  customerName?: string;
  changes: { type: "field_change" | "item_added" | "item_removed"; entity: string; entityLabel: string; field?: string; from?: unknown; to?: unknown }[];
  createdAt: ISODate;
  /** NEW (feature 24): the change order this entry records. */
  changeOrderId?: ID;
}

/* ------------------------------------------------------------------ */
/* Work orders (live /work-orders/[id], types/work-orders.ts)          */
/* ------------------------------------------------------------------ */

/** Live WOStatus: PENDING_DEPOSIT → UNSCHEDULED → SCHEDULED → IN_PROGRESS → COMPLETED. */
export type WorkOrderStatus = "PENDING_DEPOSIT" | "UNSCHEDULED" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED";

/** Live WOTimeEntry: rendered hours per surface, from "Log Hours". */
export interface WorkOrderTimeEntry {
  id: ID;
  /** Live estimateSurfaceId. */
  surfaceId: ID;
  renderedHours: number;
  notes?: string;
  loggedBy: ID;
  loggedAt: ISODate;
  /* ---- NEW (feature 22) ---- */
  /** Crew member the hours are for (live: always the logged-in user). */
  employeeId?: ID;
  workDate?: string;
  /** The clock segment the hours came from, when clocked in and out. */
  segmentId?: ID;
}

export interface WorkOrderAttachment {
  id: ID;
  fileName: string;
  fileType: string;
  fileSize?: number;
  createdAt: ISODate;
  by: ID;
  caption?: string;
  /** The surface this photo documents (patent 20: photos sit with the surface record). */
  surfaceId?: ID;
  /** NEW (feature 34): the media-library asset made from this photo. */
  mediaAssetId?: ID;
}

export interface WorkOrderShift {
  id: ID;
  name?: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  memberIds: ID[];
  dailyHours?: Record<string, { startTime: string; endTime: string } | null>;
}

export interface WorkOrder {
  id: ID; // WO-2026-1 (live workOrderNumber)
  jobId: ID;
  status: WorkOrderStatus;
  startDate?: ISODate;
  endDate?: ISODate;
  gateCode?: string;
  accessNotes?: string;
  areasExcluded?: string;
  existingConditions?: string;
  companyResponsibilities: string[];
  customerResponsibilities: string[];
  timeEntries: WorkOrderTimeEntry[];
  fieldNotes: { id: ID; content: string; authorId: ID; createdAt: ISODate }[];
  attachments: WorkOrderAttachment[];
  statusHistory: { id: ID; from?: WorkOrderStatus; to: WorkOrderStatus; by: ID; at: ISODate; notes?: string }[];
  shifts: WorkOrderShift[];
  createdAt: ISODate;
  scheduledAt?: ISODate;
  startedAt?: ISODate;
  completedAt?: ISODate;
}

/** Internal invoice status; the live InvoiceStatus is DRAFT, SENT, VIEWED, PARTIAL, PAID, OVERDUE, CANCELLED. */
export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "void";

export interface Invoice {
  id: ID; // INV-2026-1
  jobId: ID;
  kind: "standard" | "supplemental" | "credit_note";
  status: InvoiceStatus;
  amount: number;
  createdAt: ISODate;
  changeOrderId?: ID;
  /** Estimate and lead the invoice came from (set on the draft deposit invoice at acceptance). */
  estimateId?: ID;
  leadId?: ID;
  sentAt?: ISODate;
  /** Live Record Payment (RecordPaymentDto) entries. */
  payments?: { id: ID; amount: number; method: "check" | "cash" | "bank_transfer" | "credit_card" | "other"; reference?: string; notes?: string; at: ISODate; by: ID }[];
  /** Pre-tax lines (accepted scope, extras, change orders). When set, amount = invoiceLinesTotal(this). */
  lines?: InvoiceLine[];
  taxRatePct?: number;
  /** Flat discount taken off the lines before tax. */
  discount?: number;
  /** Deposit requested from the customer at acceptance (paid against this invoice). */
  depositDue?: number;
}

export interface InvoiceLine {
  id: ID;
  description: string;
  quantity: number;
  rate: number;
  changeOrderId?: ID;
}

/* ------------------------------------------------------------------ */
/* Property, surfaces and paint history (features 25, 26)              */
/* ------------------------------------------------------------------ */

export type PropertyType = "single_family" | "multifamily" | "commercial";

export interface OwnershipPeriod {
  id: ID;
  customerId: ID;
  start: ISODate;
  end?: ISODate;
  /** Predecessor history sharing decision (25.Q01). */
  predecessorConsent?: "granted" | "refused" | "unreachable_spec_only" | "not_requested";
  /** Written seller consent or refusal (25.Q01). */
  consentRecord?: { decision: "granted" | "refused"; at: ISODate; channel: string; spokeTo: string; recordedBy: ID };
  /** Documented attempts to reach an unreachable seller (25.Q01). */
  consentAttempts?: ConsentAttempt[];
  /** Office manager has asked the owner to approve the unreachable determination. */
  unreachableRequestedAt?: ISODate;
  unreachableApprovedBy?: ID;
  unreachableApprovedAt?: ISODate;
  /** Former-owner permanent PDF issued at the end of this period (feature 26). */
  formerOwnerPdf?: { issuedAt: ISODate; issuedBy: ID; recipient: string };
}

export interface Property {
  id: ID; // PROP-1001 (stable identifier, never derived from the address)
  address: string;
  city: string;
  state: string;
  zip: string;
  type: PropertyType;
  ownership: OwnershipPeriod[];
  /** Property-wide opt-out from outreach (features 27, 29). */
  optOut: boolean;
  demolished?: boolean;
  soldUnreassigned?: boolean;
  /** Possible duplicate of another property, for office review (25.1). */
  mergeCandidateOf?: ID;
  /** Set on a property that was merged into another. */
  mergedInto?: ID;
  /** Originating identifiers preserved through a merge (25). */
  mergedFrom?: ID[];
  /** Earlier addresses, kept when an address typo is corrected (25). */
  addressHistory?: { address: string; changedAt: ISODate; changedBy: ID }[];
  personalDataDeletions?: PersonalDataDeletion[];
  /** Feature 29 opt-out and re-consent records (all optional). */
  optOutAt?: ISODate;
  optOutBy?: ID;
  optOutSource?: string;
  reconsent?: { date: ISODate; statement: string; by: ID; at: ISODate }[];
}

export type AreaKind = "interior" | "exterior";

/** Room types map to lifespan library defaults (feature 27). */
export type RoomType =
  | "bedroom"
  | "living_room"
  | "hall_stairs"
  | "kitchen"
  | "bathroom"
  | "exterior_body"
  | "exterior_trim";

export type Exposure = "north" | "south" | "east" | "west";

/** A room or an exterior elevation. */
export interface Area {
  id: ID;
  propertyId: ID;
  name: string;
  kind: AreaKind;
  roomType: RoomType;
  exposure?: Exposure;
  building?: string;
  unit?: string;
  /** A room that has never been painted counts as new construction (18.Q02). */
  neverPainted?: boolean;
}

export type SurfaceType = "walls" | "ceiling" | "trim" | "door" | "body" | "siding" | "cabinets";
export type SurfaceCondition = "sound" | "new_drywall" | "rough";

export interface Surface {
  measurementUnit?: 'sqft' | 'lnft' | 'each' | 'hour' | 'gallon';
  measuredQuantity?: number;
  id: ID;
  propertyId: ID;
  areaId: ID;
  name: string;
  type: SurfaceType;
  /** Measured area in square feet (openings over 20 sq ft already deducted). */
  areaSqft: number;
  condition: SurfaceCondition;
  removedAt?: ISODate;
  removedReason?: string;
  removedBy?: ID;
  /** A replacement surface points at the one it replaced (e.g. new siding). */
  replacesSurfaceId?: ID;
}

export type Sheen = "Flat" | "Matte" | "Eggshell" | "Satin" | "Semi-Gloss" | "Gloss";

/** One recorded event of paint applied to a surface. */
export interface Application {
  id: ID;
  propertyId: ID;
  surfaceId: ID;
  jobId?: ID;
  manufacturer: string;
  colourName: string;
  colourNumber: string;
  hex: string;
  product: string;
  sheen: Sheen | "Unknown";
  coats: number;
  completedAt?: ISODate;
  confirmedBy?: ID;
  verification: "confirmed" | "unverified";
  /** Where unverified data came from, e.g. "recorded from customer". */
  source?: string;
  productTier?: "standard" | "premium";
  prepQuality?: "good" | "poor";
  actualGallons?: number;
  actualHours?: number;
  tintFormula?: string;
  photoCount: number;
  touchUps: { date: ISODate; note: string; by?: ID }[];
  /** Product line from the catalogue at closeout, for product-line lifespan defaults (feature 27). */
  productLine?: string;
  /**
   * Expected life carried from the colour card specification at closeout
   * (feature 3). When set it replaces the library base interval.
   */
  lifespanYears?: number;
  /** The colour card specification the lifespan came from. */
  specId?: ID;
  /** Owner-approved Unknown values for legacy or subcontractor work (feature 25). */
  unknowns?: UnknownException[];
  /** Customer sign-off date, where collected at closeout (feature 25). */
  customerAcceptedAt?: ISODate;
  /** When the application was reported, for customer-reported work (feature 25). */
  recordedAt?: ISODate;
  recordedBy?: ID;
}

/** Owner-approved "Unknown" for a required closeout field (feature 25). */
export interface UnknownException {
  field: "colour" | "sheen" | "completedAt";
  kind: "legacy" | "subcontractor";
  approvedBy: ID;
  reason: string;
  at: ISODate;
}

/** One surface row on a job's closeout checklist (feature 25, component 25.2). */
export interface CloseoutRow {
  surfaceId: ID;
  specId?: ID;
  /** Crew lead says this surface was painted on this job. */
  painted: boolean;
  notPaintedReason?: string;
  manufacturer: string;
  colourName: string;
  colourNumber: string;
  hex: string;
  product: string;
  sheen?: Sheen | "Unknown";
  coats?: number;
  completedAt?: ISODate;
  /** Optional actuals. Undefined means "Not recorded" — never zero, never estimated. */
  actualHours?: number;
  actualGallons?: number;
  photoCount?: number;
  tintFormula?: string;
  unknowns: UnknownException[];
  confirmedBy?: ID;
  confirmedAt?: ISODate;
  savedBy?: ID;
  savedAt?: ISODate;
}

export interface Closeout {
  jobId: ID;
  rows: CloseoutRow[];
  customerAcceptedAt?: ISODate;
}

/** A job photograph that may be shared on the customer QR record (feature 26). */
export interface SharedPhoto {
  id: ID; // PH-1
  propertyId: ID;
  applicationId?: ID;
  surfaceId?: ID;
  caption: string;
  takenAt: ISODate;
  /** Faces, house numbers, licence plates or a neighbouring property. */
  identifying: boolean;
  identifyingReason?: string;
  selected: boolean;
  ownerApprovedBy?: ID;
  ownerApprovedAt?: ISODate;
  releaseRef?: string;
  /** Removed by a personal-data deletion request. */
  deletedAt?: ISODate;
}

/** Property merge or unit renumber waiting for individual owner approval (feature 25). */
export interface PropertyStructureRequest {
  id: ID; // PSR-1
  kind: "merge" | "renumber";
  propertyId: ID;
  /** merge: the property the source merges into. */
  targetPropertyId?: ID;
  /** renumber: the old and new unit labels. */
  oldUnit?: string;
  newUnit?: string;
  reason: string;
  requestedBy: ID;
  requestedAt: ISODate;
  status: "pending" | "approved" | "rejected";
  decidedBy?: ID;
  decidedAt?: ISODate;
}

/** Seller contact attempt for predecessor consent (25.Q01). */
export interface ConsentAttempt {
  id: ID;
  at: ISODate;
  channel: "phone" | "email" | "letter" | "text";
  note: string;
  by: ID;
}

/** Personal-data deletion request record (feature 25). */
export interface PersonalDataDeletion {
  id: ID;
  subject: string;
  customerId?: ID;
  by: ID;
  at: ISODate;
  purgeDue: ISODate;
}

export interface Correction {
  id: ID;
  applicationId: ID;
  field: string;
  oldValue: string;
  newValue: string;
  by: ID;
  at: ISODate;
  reason: string;
  noticeSent: boolean;
  /** True when the field is colour, product, sheen, coats or location (Rule 4). */
  noticeRequired?: boolean;
  noticeSentAt?: ISODate;
  noticeSentBy?: ID;
  approvedBy?: ID;
}

export interface QrLink {
  id: ID;
  /** Unguessable reference, never derived from address or property ID. */
  ref: string;
  propertyId: ID;
  ownershipPeriodId: ID;
  createdAt: ISODate;
  createdBy: ID;
  revokedAt?: ISODate;
  revokeReason?: string;
  lastSentAt?: ISODate;
  lastSentTo?: string;
  lastSentResult?: "delivered" | "failed";
  lastSentChannel?: "email" | "text" | "printed_card" | "post";
  openCount: number;
  lastOpenAt?: ISODate;
  /** Analytics: date and coarse device type only. No IP, location or personal data. */
  opens?: { at: ISODate; device: "mobile" | "tablet" | "desktop" }[];
  /** Replacement link issued after caller verification (26.Q01). */
  replacesLinkId?: ID;
  verificationNotes?: string;
}

export interface TouchUpRequest {
  id: ID;
  propertyId: ID;
  linkRef: string;
  surfaceId?: ID;
  colourLabel?: string;
  requesterName: string;
  contact: string;
  note: string;
  createdAt: ISODate;
  status: "new" | "acknowledged" | "converted" | "closed";
}

/* ------------------------------------------------------------------ */
/* Jobs and the project colour card (feature 3)                        */
/* ------------------------------------------------------------------ */

/**
 * Internal job status. "estimating" is prototype-only: the project record
 * behind an estimate that isn't accepted yet. It never shows in the live
 * Jobs list. The other values are the live JobStatus in lower case.
 */
export type JobStatus =
  | "estimating"
  | "unscheduled"
  | "confirmed"
  | "scheduled"
  | "in_production"
  | "touch_up"
  | "ready_for_inspection"
  | "completed";

export interface Job {
  scheduleProtected?: boolean;
  crewAssignments?: import('@/lib/types').CrewAssignment[];
  id: ID; // JOB-2026-1
  name: string;
  propertyId: ID;
  customerId: ID;
  estimateId?: ID;
  leadId?: ID;
  status: JobStatus;
  scheduleStart?: ISODate;
  scheduleEnd?: ISODate;
  contractSigned: boolean;
  contractSignedAt?: ISODate;
  /** Original contract value, pre-tax. */
  contractValue: number;
  depositsCollected: number;
  markupPct: number;
  taxRatePct: number;
  estimatorId: ID;
  crewLeadId: ID;
  /** Surfaces in the job's scope. */
  surfaceIds: ID[];
  /** Current colour card version. */
  cardVersion: number;
  /** Row version for optimistic concurrency on the card (3: two editors). */
  cardRowVersion: number;
  closedAt?: ISODate;
  closedBy?: ID;
  jobType: "interior_repaint" | "exterior_repaint" | "mixed" | "new_construction";
}

export type SpecState = "draft" | "pending_sample" | "sent" | "approved" | "superseded";

export const PRIMER_NONE_SOUND = "No primer, existing coating sound";

export interface Colour {
  id: ID;
  jobId: ID;
  manufacturer: string;
  name: string;
  number: string;
  hex: string;
  tintFormula?: string;
  sampleRef?: string;
  customMatch: boolean;
  createdAt: ISODate;
  createdBy: ID;
}

/** One colour in a manufacturer's preloaded palette (COLOUR_PALETTE, feature 3). */
export interface PaletteColour {
  id: ID;
  manufacturer: string;
  name: string;
  number: string;
  hex: string;
  /** Manufacturer collection or family, e.g. "Neutrals". */
  family?: string;
}

/** One colour applied a particular way (COLOR_CARD_SPECS). */
export interface SpecLine {
  id: ID;
  jobId: ID;
  colourId: ID;
  sheen?: Sheen;
  coats?: number;
  primer?: string;
  coatSequence: string[];
  surfaceIds: ID[];
  lifespanYears: number;
  lifespanLocked: boolean;
  productLine?: string;
  product?: string;
  tintBase?: string;
  state: SpecState;
  approvedVersion?: number;
  /** Set when a referenced record exists (work order, calc, history). */
  referencedBy: ("work_order" | "material_calc" | "history")[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface SampleRound {
  id: ID;
  colourId: ID;
  round: number;
  date: ISODate;
  deliveredBy: ID;
  outcome?: "accepted" | "rejected";
  note?: string;
}

export type ApprovalChannel = "estimate_pdf" | "email" | "portal";

export interface ColourApproval {
  id: ID;
  jobId: ID;
  cardVersion: number;
  specIds: ID[];
  channel: ApprovalChannel;
  sentAt: ISODate;
  sentBy: ID;
  status: "sent" | "approved";
  signer?: string;
  approvedAt?: ISODate;
  senderAddress?: string;
}

/** Frozen copy of a colour card version, for version history (feature 3). */
export interface CardSnapshot {
  jobId: ID;
  version: number;
  createdAt: ISODate;
  createdBy: ID;
  colours: Colour[];
  specs: SpecLine[];
}

/** Banner raised when an approved selection changes after ordering (3). */
export interface CommitmentFlag {
  id: ID;
  jobId: ID;
  specId: ID;
  poId?: ID;
  message: string;
  responsibleUserId: ID;
  createdAt: ISODate;
  storeCallConfirmedAt?: ISODate;
}

/* ------------------------------------------------------------------ */
/* Materials, purchase orders and suppliers (features 18, 19)          */
/* ------------------------------------------------------------------ */

export type PackSize = "qt" | "gal" | "5gal";

export interface PackCount {
  size: PackSize;
  count: number;
}

export interface ProductCatalogItem {
  id: ID;
  manufacturer: string;
  productLine: string;
  product: string;
  /** Manufacturer spread rate, sq ft per gallon. */
  spreadRate: number;
  /** Contractor's proven field rate, if recorded. */
  fieldRate?: number;
  tier: "standard" | "premium";
  /** Cost per pack size (restricted to owner/office manager). */
  cost: Partial<Record<PackSize, number>>;
  /** Pack sizes the office has marked available. */
  available: PackSize[];
  itemCode?: string;
  /**
   * Coverage rules for non-sound surface conditions (feature 18.1). A
   * condition with no entry here has no matching rule and is flagged.
   */
  conditionRates?: Partial<Record<SurfaceCondition, number>>;
  /** Feature 28: product no longer made; repeat estimates must propose a replacement. */
  discontinued?: boolean;
  /** Feature 28: manufacturer-published direct successor of this catalog item. */
  successorOf?: ID;
}

/** Estimator adjustment to a demand line (±10% self-approved). */
export interface DemandAdjustment {
  id: ID;
  jobId: ID;
  specId: ID;
  baselineGal: number;
  proposedGal: number;
  pct: number;
  note: string;
  by: ID;
  at: ISODate;
  status: "applied" | "pending_approval" | "rejected";
  approvedBy?: ID;
  decidedAt?: ISODate;
  decisionNote?: string;
}

export interface ShelfStock {
  id: ID;
  product: string;
  colourName: string;
  colourNumber: string;
  sheen: Sheen;
  containerSize: PackSize;
  sealed: boolean;
  tintDate?: ISODate;
  purchaseDate: ISODate;
  /** Measured to the nearest quarter gallon when confirmed. */
  measuredGal?: number;
  confirmedBy?: ID;
  checkDate?: ISODate;
  reservedJobId?: ID;
  reservedAt?: ISODate;
  /** Purchase cost per gallon, used for transfers (restricted). */
  unitCostPerGal?: number;
  /** Where the stock came from, e.g. an over-receipt on a PO. */
  source?: string;
  /** Per-job rejections of a proposal (feature 18.3). */
  rejections?: { jobId: ID; reason: string; by: ID; at: ISODate }[];
  /** Transfers between jobs at transfer cost (feature 18.3). */
  transfers?: { fromJobId: ID; toJobId: ID; cost: number; by: ID; at: ISODate }[];
}

export interface Supplier {
  id: ID;
  name: string;
  /** "Launch" or "Phase 1.1" (feature 19). */
  launchPhase?: string;
  /** How orders reach this supplier. Undefined means manual. */
  connection?: SupplierConnection;
}

export type SupplierConnectionType = "manual" | "email" | "api_edi";
export type ConnectionHealth = "not_configured" | "untested" | "healthy" | "failing";

/**
 * Connection profile (feature 19). Credentials are write-only: the secret
 * itself is never stored in the record or shown, only that one is on file.
 */
export interface SupplierConnection {
  type: SupplierConnectionType;
  /** Connector name for API/EDI, e.g. "SW PRO ordering API". */
  endpointLabel?: string;
  /** Order inbox for the email connection type. */
  orderEmail?: string;
  /** Sandbox: in-app simulated connector. Live: HTTP to the endpoint configured on the server. */
  mode?: "sandbox" | "live";
  /** Host of the live endpoint, as reported by the server (never the key). */
  endpointHost?: string;
  /** True for the sandbox connector: no real supplier is contacted. */
  sandbox?: boolean;
  credentialsOnFile?: boolean;
  credentialsUpdatedAt?: ISODate;
  credentialsUpdatedBy?: ID;
  health: ConnectionHealth;
  lastCheckedAt?: ISODate;
  lastError?: string;
  updatedAt?: ISODate;
  updatedBy?: ID;
}

/** Structured order transmitted over an API/EDI connection (feature 19). */
export interface SupplierOrderPayload {
  poId: ID;
  supplierId: ID;
  storeNumber: string;
  accountNumber: string;
  jobRef: ID;
  fulfilment: "pickup" | "delivery";
  requestedDate?: ISODate;
  pickupContact?: string;
  pickupPhone?: string;
  lines: {
    lineId: ID;
    manufacturer?: string;
    productLine?: string;
    product: string;
    colourName: string;
    colourNumber?: string;
    sheen: string;
    tintBase?: string;
    tintFormula?: string;
    gallons: number;
    packs: { size: PackSize; count: number; itemCode: string }[];
  }[];
}

/** One message pushed back by a supplier connection (feature 19). */
export type SupplierMessage =
  | { messageId: string; poId: ID; kind: "order_received"; reference: string }
  | { messageId: string; poId: ID; kind: "line_status"; lineId: ID; statusText: string; substitute?: { product: string; packSize?: PackSize } };

export interface Branch {
  id: ID;
  supplierId: ID;
  name: string;
  storeNumber: string;
  accountNumber: string;
  phone: string;
  address?: string;
  /** False once deactivated. Undefined means active. */
  active?: boolean;
  createdAt?: ISODate;
  createdBy?: ID;
}

/** Store item code for one product and pack size (feature 19.2). */
export interface ProductMapping {
  id: ID;
  supplierId: ID;
  /** Undefined means the code applies at every branch of the supplier. */
  branchId?: ID;
  catalogId: ID;
  packSize: PackSize;
  unit: "quart" | "gallon" | "5-gallon pail";
  itemCode: string;
  colourNumber?: string;
  tintFormula?: string;
  updatedAt: ISODate;
  updatedBy: ID;
}

/** Project coverage or waste override (features 18.1, 18.2). */
export interface MaterialOverride {
  id: ID;
  jobId: ID;
  specId: ID;
  kind: "coverage" | "waste";
  /** sq ft per gallon for coverage; a fraction (0.12) for waste. */
  value: number;
  reason: string;
  by: ID;
  at: ISODate;
}

/** The last accepted calculation for a job, kept for comparison (18.1). */
export interface MaterialCalcSnapshot {
  jobId: ID;
  calculatedAt: ISODate;
  calculatedBy: ID;
  lines: { specId: ID; rate: number; source: string; waste: number; coatSqft: number; adjustedNeedGal: number }[];
}

/** Coverage and cost assumed when the estimate was approved (18.A15). */
export interface EstimateBasis {
  jobId: ID;
  approvedAt: ISODate;
  lines: { specId: ID; rate: number; costPerGal: number }[];
}

export interface EquipmentRental {
  id: ID;
  jobId: ID;
  description: string;
  vendor?: string;
  days: number;
  /** Restricted to owner and office manager. */
  cost?: number;
  addedBy: ID;
  addedAt: ISODate;
}

export interface LimitCheckResult {
  orderValue: number;
  windowTotal: number;
  lifetimeTotal: number;
  estimatorPass: boolean;
  needs: "none" | "office_manager" | "owner";
  checkedAt: ISODate;
}

/** Estimator's request for the office to generate a priced order (18.5). */
export interface OrderRequest {
  id: ID; // REQ-7
  jobId: ID;
  supplierId: ID;
  branchId?: ID;
  phase: string;
  deliveryDate?: ISODate;
  fulfilment: "pickup" | "delivery";
  lines: { specId: ID; gallons: number; packs: PackCount[] }[];
  requestedBy: ID;
  requestedAt: ISODate;
  limit: LimitCheckResult;
  status: "requested" | "generated" | "rejected";
  poId?: ID;
  decidedBy?: ID;
  decidedAt?: ISODate;
  note?: string;
}

export interface POReceipt {
  id: ID;
  poId: ID;
  lineId: ID;
  jobId: ID;
  qtyGal: number;
  orderedGal: number;
  at: ISODate;
  by: ID;
  overGal: number;
  toJobCostGal: number;
  toShelfGal: number;
  status: "recorded" | "pending_approval" | "approved";
  approvedBy?: ID;
}

export interface POReturn {
  id: ID;
  poId: ID;
  lineId: ID;
  jobId: ID;
  qtyGal: number;
  credit: number;
  /** Credit confirmed by the supplier. Only confirmed returns count (Rule 2). */
  confirmed: boolean;
  reason: string;
  at: ISODate;
  by: ID;
}

export interface POCall {
  at: ISODate;
  employee: string;
  outcome: "confirmed_received" | "not_received" | "no_answer" | "cannot_fill" | "other";
  note?: string;
  by: ID;
}

export interface DeliveryChange {
  id: ID;
  from: ISODate;
  to: ISODate;
  days: number;
  reason: string;
  requestedBy: ID;
  requestedAt: ISODate;
  status: "approved" | "pending_owner" | "rejected";
  approvedBy?: ID;
  approvedAt?: ISODate;
}

export interface ReplacementRequest {
  id: ID;
  lineId: ID;
  original: string;
  replacement: string;
  newCatalogId: ID;
  newPackSize: PackSize;
  oldCostPerGal: number;
  newCostPerGal: number;
  pctChange: number;
  orderTotalDelta: number;
  decision: "office_manager" | "owner" | "change_order";
  reason: string;
  status: "pending_owner" | "approved" | "rejected" | "blocked";
  requestedBy: ID;
  requestedAt: ISODate;
  approvedBy?: ID;
}

export interface CancellationRecord {
  id: ID;
  lineId: ID;
  qtyGal: number;
  requestedBy: ID;
  requestedAt: ISODate;
  /** Set only when the branch confirms (Rule 2). */
  confirmedAt?: ISODate;
  branchEmployee?: string;
  kind: "cancel_request" | "cannot_fill";
}

export type POStatus =
  | "preliminary"
  | "draft"
  | "pending_approval"
  | "issued"
  | "sent"
  | "acknowledged"
  | "received"
  | "processing"
  | "substitute_available"
  | "ready_for_pickup"
  | "picked_up"
  | "partially_filled"
  | "problem"
  | "cancelled";

export type LineStatus =
  | "open"
  | "sent"
  | "acknowledged"
  | "received"
  | "processing"
  | "substitute_available"
  | "ready_for_pickup"
  | "picked_up"
  | "partially_filled"
  | "problem"
  | "cancelled";

export interface POLine {
  id: ID;
  specId?: ID;
  description: string;
  product: string;
  /** "Name Number" display label, kept for older orders. */
  colourLabel: string;
  /** Ordering identity copied from the colour card at generation (feature 18). */
  manufacturer?: string;
  productLine?: string;
  colourName?: string;
  colourNumber?: string;
  tintBase?: string;
  sheen: string;
  packs: PackCount[];
  gallons: number;
  unitCostPerGal: number;
  status: LineStatus;
  receivedGal: number;
  /** Supplier-confirmed cancellations only (Rule 2). */
  cancelledGal: number;
  returnedGal: number;
  creditAmount: number;
  /** Verbatim unfamiliar supplier status text, kept for human review. */
  supplierStatusText?: string;
  /** Substitute the supplier offered; reviewed through the replacement flow. */
  substituteOffer?: { product: string; catalogId?: ID; packSize?: PackSize; at: ISODate };
  /** Tinted paint is non-returnable. Undefined is treated as tinted. */
  tinted?: boolean;
  tintFormula?: string;
  /** PO price at generation, for replacement thresholds (19). */
  approvedCostPerGal?: number;
  /** Other jobs/surfaces grouped on this line (18.5). */
  allocations?: { jobId: ID; surfaceIds: ID[] }[];
}

export interface POEvent {
  at: ISODate;
  /** User ID, or the supplier ID when `source` is "supplier". */
  by: ID;
  text: string;
  source?: "supplier";
}

export interface PurchaseOrder {
  id: ID; // JOB-2026-1-PO-01
  jobId: ID;
  supplierId: ID;
  branchId?: ID;
  phase: string;
  deliveryDate?: ISODate;
  originalDeliveryDate?: ISODate;
  status: POStatus;
  lines: POLine[];
  createdAt: ISODate;
  createdBy: ID;
  approvedBy?: ID;
  destinationConfirmed: boolean;
  sendMethod?: "print" | "email" | "phone" | "electronic";
  /** Set when sent over an API/EDI connection (feature 19). */
  transmission?: { connector: string; sandbox: boolean; messageId: string; at: ISODate; payload: SupplierOrderPayload };
  /** Supplier message IDs already applied, so a repeated message changes nothing. */
  supplierMessageIds?: string[];
  sentAt?: ISODate;
  sentBy?: ID;
  sentEvidence?: string;
  ackAt?: ISODate;
  ackRef?: string;
  uncertainSend?: boolean;
  branchCallConfirmedAt?: ISODate;
  events: POEvent[];
  /** Idempotency key of the generation that created this order (18.5). */
  generationKey?: string;
  requestId?: ID;
  fulfilment?: "pickup" | "delivery";
  pickupContact?: string;
  pickupPhone?: string;
  destinationConfirmedAt?: ISODate;
  destinationConfirmedBy?: ID;
  ackBy?: string;
  ackMethod?: "confirmation_number" | "supplier_reply" | "call" | "electronic";
  uncertainAt?: ISODate;
  /** Stays true after a resend so the uncertainty stays visible (19.3). */
  uncertainHistory?: boolean;
  resentAt?: ISODate;
  resendCount?: number;
  calls?: POCall[];
  escalation?: "sender" | "office_manager" | "owner";
  escalatedAt?: ISODate;
  deliveryChanges?: DeliveryChange[];
  replacements?: ReplacementRequest[];
  cancellations?: CancellationRecord[];
  limitCheck?: LimitCheckResult;
  /** Order total when generated, for the $200 owner threshold. */
  approvedTotal?: number;
}

/* ------------------------------------------------------------------ */
/* Change orders (feature 24)                                          */
/* ------------------------------------------------------------------ */

export type ChangeOrderType =
  | "addition"
  | "deleted_room"
  | "credit"
  | "quantity_reduction"
  | "product_substitution"
  | "no_cost_colour_change";

export type ChangeOrderStatus =
  | "draft"
  | "pending_internal"
  | "ready_to_send"
  | "sent"
  | "approved"
  | "rejected"
  | "disputed";

export interface ChangeOrderLine {
  id: ID;
  kind: "add" | "remove";
  description: string;
  sqft?: number;
  /** Cost before markup. With a labour/material breakdown it is laborHours × laborRate + materialCost. */
  cost: number;
  /** Optional breakdown of cost (patent 24: incremental labour and materials for the added scope). */
  laborHours?: number;
  laborRate?: number;
  materialCost?: number;
  /** Product and colour for the line (feature 24 builder). */
  product?: string;
  colour?: string;
  surfaceId?: ID;
  /**
   * How the line is charged (24): billable (default), nonreturnable tinted
   * paint billed on the change order, or labour cancelled inside 24 hours
   * that the contractor absorbs (kept as job cost, never billed).
   */
  treatment?: "billable" | "stranded_paint" | "absorbed_labour";
}

export type DownstreamState = "not_started" | "done" | "failed";

/** Feature 24: the four downstream actions attempted on approval. */
export type DownstreamKey = "work_order" | "materials" | "scheduler" | "billing";

export interface DownstreamMeta {
  at: ISODate;
  by?: ID;
  ref?: string;
  error?: string;
  /** Set when the office manager reconciled a failure by hand. */
  reconciledNote?: string;
}

/** APPROVAL_LINKS (24.2). One link carries exactly one version. */
export interface ApprovalLink {
  id: ID; // LNK-...
  version: number;
  recipientName: string;
  recipient: string;
  channel: "portal" | "email";
  sentAt: ISODate;
  sentBy: ID;
  expiresAt: ISODate;
  supersededAt?: ISODate;
  supersededReason?: string;
  delivery: "delivered" | "undeliverable";
  deliveryFailedAt?: ISODate;
  deliveryError?: string;
  /** Owner escalation raised after two working days undeliverable. */
  escalatedAt?: ISODate;
  /** The signer on the customer record changed after this link was sent. */
  signerChanged?: boolean;
}

/** APPROVAL_EVIDENCE (24.2). */
export interface ApprovalEvidence {
  version: number;
  signer: string;
  channel: "portal" | "email" | "verbal";
  ref: string;
  at: ISODate;
  recordedBy: ID;
}

export interface TaxRate {
  id: ID;
  region: string;
  ratePct: number;
  effectiveFrom: ISODate;
}

export interface ChangeOrder {
  id: ID; // CO-2026-1-01
  jobId: ID;
  type: ChangeOrderType;
  title: string;
  status: ChangeOrderStatus;
  parentId?: ID;
  lines: ChangeOrderLine[];
  markupPct: number;
  taxRatePct: number;
  taxDate: ISODate;
  createdAt: ISODate;
  createdBy: ID;
  ownerApprovedBy?: ID;
  ownerApprovedAt?: ISODate;
  recipient?: string;
  recipientVerified: boolean;
  channel?: "portal" | "email";
  sentAt?: ISODate;
  linkExpiresAt?: ISODate;
  signer?: string;
  decidedAt?: ISODate;
  /** "Apply Change Order" (patent 24 step 6): when staff pushed the approved scope into the job. */
  appliedAt?: ISODate;
  appliedBy?: ID;
  emergency?: {
    authoriser: ID;
    verbalAt: ISODate;
    findings: string;
    photos: number;
    writtenConfirmedAt?: ISODate;
    /** Office manager authorised because the owner was unreachable. */
    ownerUnreachable?: boolean;
    /** Customer text or email captured the same day. */
    customerMessageRef?: string;
    amount?: number;
    writtenRef?: string;
    escalatedAt?: ISODate;
    workStopped?: boolean;
    callTaskId?: ID;
    customerCalledAt?: ISODate;
  };
  downstream: Record<"work_order" | "materials" | "scheduler" | "billing", DownstreamState>;
  /** Colour Re-approval record instead of a change order (Rule 1). */
  isColourReapproval?: boolean;

  /* ---- Feature 24 builder fields (all optional for older records) ---- */
  version?: number;
  recipientName?: string;
  links?: ApprovalLink[];
  evidence?: ApprovalEvidence;
  rejection?: { signer: string; reason: string; at: ISODate; by: ID };
  dispute?: { note: string; at: ISODate; by: ID; taskId?: ID };
  /** Inherited discount: held until the owner approves it. */
  discount?: { pct: number; status: "requested" | "approved"; approvedBy?: ID; approvedAt?: ISODate };
  submittedAt?: ISODate;
  depositReview?: { cumulativeNet: number; pct: number; target: number; collected: number; due: number; at: ISODate };
  downstreamMeta?: Partial<Record<DownstreamKey, DownstreamMeta>>;
  billing?: {
    mode: "draft_update" | "supplemental" | "credit_note" | "account_credit" | "none";
    docId?: ID;
    amount: number;
    creditRaisedAt?: ISODate;
    refundWindowCloses?: ISODate;
    customerChoice?: "refund" | "credit";
    choiceAt?: ISODate;
  };
  /** Colour Re-approval details (when isColourReapproval). */
  colourChange?: { specId: ID; fromColour: string; toColour: string; sheen?: string; note?: string };
  returnedToDraft?: { reason: string; at: ISODate; scopeVersion: number };
  splitFrom?: ID;
}

/* ------------------------------------------------------------------ */
/* Paint life, alerts and follow-ups (features 27, 29)                 */
/* ------------------------------------------------------------------ */

export interface LifespanDefault {
  roomType: RoomType;
  years: number;
}

/** `product` set: that product only. Unset: every product in the line. */
export interface ProductLifespanDefault {
  manufacturer: string;
  productLine: string;
  product?: string;
  /** Patent 27: the product (or line) on this surface type only. Most specific entry of all. */
  surfaceType?: SurfaceType;
  years: number;
}

export interface LifespanLibrary {
  version: number;
  updatedAt: ISODate;
  updatedBy: ID;
  defaults: LifespanDefault[];
  southWestDeduction: number;
  premiumBonus: number;
  poorPrepDeduction: number;
  /** Feature 27: surface-type defaults that win over the room default (ceilings 10 yrs). */
  surfaceDefaults?: { surfaceType: SurfaceType; years: number }[];
  /**
   * Product or product-line defaults. A product entry wins over a line
   * entry, and both win over surface-type and room defaults.
   */
  productDefaults?: ProductLifespanDefault[];
  /** Why this version was published. */
  note?: string;
}

/** Stored expected repaint date for one surface (REPAINT_SCHEDULES, feature 27). */
export interface RepaintSchedule {
  id: ID; // SCH-1
  propertyId: ID;
  surfaceId: ID;
  applicationId: ID;
  completedAt: ISODate;
  dueDate: ISODate;
  years: number;
  basis: string[];
  ruleVersion: number;
  calculatedAt: ISODate;
  /** Set when the owner recalculated this record (old values kept). */
  recalculated?: { recalcId: ID; oldDue: ISODate; oldVersion: number; at: ISODate }[];
  extension?: InspectionExtension;
}

/** INSPECTION_EXTENSIONS (27.Q01): max +2 years, reason + dated photo. */
export interface InspectionExtension {
  id: ID; // EXT-1
  proposedDate: ISODate;
  reason: string;
  photoId: string;
  photoName?: string;
  photoDate: ISODate;
  proposedBy: ID;
  proposedAt: ISODate;
  status: "pending" | "approved" | "rejected";
  decidedBy?: ID;
  decidedAt?: ISODate;
  decisionNote?: string;
}

/** Owner-selected historical recalculation (27). */
export interface HistoricalRecalc {
  id: ID; // RCL-1
  at: ISODate;
  by: ID;
  reason: string;
  fromVersion?: number;
  toVersion: number;
  items: { scheduleId: ID; surfaceId: ID; propertyId: ID; oldDue: ISODate; newDue: ISODate; oldVersion: number }[];
}

export interface AlertSurface {
  surfaceId: ID;
  applicationId: ID;
  dueDate: ISODate;
  noticeDate: ISODate;
  basis: string[];
  ruleVersion: number;
}

export type AlertOutcome = "open" | "contacted" | "snoozed" | "dismissed" | "converted";

export type SnoozeReason =
  | "Not due yet"
  | "Customer deferred"
  | "Wrong contact"
  | "Not interested"
  | "Property sold";

export interface RepaintAlert {
  id: ID; // RA-1001
  propertyId: ID;
  createdAt: ISODate;
  surfaces: AlertSurface[];
  earliestDue: ISODate;
  windowEnd: ISODate;
  outcome: AlertOutcome;
  outcomeAt?: ISODate;
  outcomeBy?: ID;
  snoozeUntil?: ISODate;
  snoozeReason?: SnoozeReason;
  backlog: boolean;
  noticeBasis: "commercial" | "exterior" | "interior";
  /** Feature 27/29 additions (all optional). */
  ownerId?: ID;
  escalatedAt?: ISODate;
  outcomeReason?: string;
  qualification?: {
    decision: "accepted" | "rejected";
    reason: string;
    checks: string[];
    by: ID;
    at: ISODate;
    followUpId?: ID;
    batchId?: ID;
  };
  runId?: ID;
  reopenedAt?: ISODate;
  history?: { at: ISODate; by: ID; text: string }[];
}

export interface RunLogEntry {
  id: ID;
  ranAt: ISODate;
  created: number;
  skipped: number;
  failed: boolean;
  note: string;
  /** Feature 27 additions (all optional). */
  by?: ID;
  failures?: number;
  catchUpOf?: ID[];
  catchUpResult?: string;
  resolvedAt?: ISODate;
  resolvedBy?: ID;
  details?: string[];
  unresolved?: string[];
}

export type FollowUpStatus =
  | "qualified"
  | "contacted"
  | "estimate_requested"
  | "estimate_sent"
  | "won"
  | "lost"
  | "deferred"
  | "do_not_contact";

export interface ContactAttempt {
  id: ID;
  plannedDay: 1 | 14 | 35;
  plannedDate: ISODate;
  movedFrom?: ISODate;
  actualAt?: ISODate;
  contactName?: string;
  note?: string;
  outcome?: "reached" | "no_answer" | "left_message" | "wrong_number" | "wants_quote" | "declined" | "opt_out";
  nextActionDate?: ISODate;
  by?: ID;
  /** Feature 29: channel used for this attempt. */
  channel?: "call" | "email" | "text";
}

export interface FollowUp {
  id: ID; // FU-1001
  alertId: ID;
  propertyId: ID;
  /** NEW (feature 29, decision D5): the lead this follow-up works in the live Lead Pipeline. */
  leadId?: ID;
  status: FollowUpStatus;
  qualifiedAt: ISODate;
  qualifiedBy: ID;
  qualifyReason: string;
  assigneeId?: ID;
  assignedAt?: ISODate;
  attempts: ContactAttempt[];
  estimateId?: ID;
  recycleDate?: ISODate;
  closedReason?: string;
  closedAt?: ISODate;
  wonValue?: number;
  history: { status: FollowUpStatus | "assigned" | "reassigned"; at: ISODate; by: ID; note?: string }[];
  /** Feature 29 additions (all optional). */
  quoteRequest?: { id: ID; at: ISODate; via: "call" | "link" | "inbound"; by: ID };
  /** Alerts linked as duplicates of this opportunity (29.A09). */
  linkedAlertIds?: ID[];
  completedRepaintJobId?: ID;
  wonSignedAt?: ISODate;
  escalations?: { clock: "unassigned" | "assigned" | "alert"; at: ISODate; source: ISODate }[];
  returnedAt?: ISODate;
  /** Attempts from an earlier season, kept through recycling. */
  priorAttempts?: ContactAttempt[];
  requalifiedAt?: ISODate;
  reopenedAt?: ISODate;
  newLeadId?: ID;
  emailsSent?: { at: ISODate; by: ID; to: string; attemptId: ID }[];
}

/* ------------------------------------------------------------------ */
/* Future estimating and touch-up reorders (feature 28)                */
/* ------------------------------------------------------------------ */

export interface RepeatEstimateLine {
  id: ID;
  surfaceId: ID;
  sourceJobId?: ID;
  sourceApplicationId: ID;
  sqft: number;
  colourLabel: string;
  hex: string;
  product: string;
  sheen: string;
  coats: number;
  priorActualGal?: number;
  /** Labour hours actually used last time (patent 28), reference only like priorActualGal. */
  priorActualHours?: number;
  unverified: boolean;
  newQtyGal?: number;
  prep?: "standard" | "extra_scrape" | "full_prime";
  condition?: "good" | "fair" | "poor";
  price?: number;
  reconfirmed: boolean;
  /** Feature 28 additions (all optional). */
  manufacturer?: string;
  productLine?: string;
  colourNumber?: string;
  /** Custom tint formula carried for store review, never auto-substituted. */
  tintFormula?: string;
  /** Provenance kept on copy, e.g. "recorded from customer". */
  sourceNote?: string;
  /** Copied under the specification-only fallback (feature 25). */
  specOnly?: boolean;
  reconfirmedAt?: ISODate;
  reconfirmedBy?: ID;
  replacement?: RepeatReplacement;
}

/** Discontinued product replacement proposal on a repeat line (28, Rule 1). */
export interface RepeatReplacement {
  oldProduct: string;
  newProduct: string;
  newManufacturer: string;
  newProductLine: string;
  newColourNumber: string;
  newSheen: string;
  isDirectSuccessor: boolean;
  /** Rule 1 decision kind. */
  decision: "office_approval" | "colour_reapproval" | "change_order" | "draft_edit" | "no_change";
  approver: "office" | "owner";
  document: "None" | "ChangeOrder" | "ColourReapproval";
  reason: string;
  status: "proposed" | "approved" | "rejected";
  proposedBy: ID;
  proposedAt: ISODate;
  decidedBy?: ID;
  decidedAt?: ISODate;
}

export interface RepeatEstimate {
  id: ID; // REP-2026-1
  propertyId: ID;
  status: "draft" | "issued";
  createdAt: ISODate;
  createdBy: ID;
  lines: RepeatEstimateLine[];
  inspection?: {
    path: "site_visit" | "small_interior";
    visitDate?: ISODate;
    measurementDate?: ISODate;
    photos: number;
    callNote?: string;
    /** Small-interior path: date of the recorded phone call. */
    callDate?: ISODate;
    recordedBy?: ID;
    recordedAt?: ISODate;
  };
  useHistoricalProductivity: boolean;
  /** Patent 25 (Combination 8 step 8): keep last time's labour, material and paint prices, or update to current. Default current. */
  pricingMode?: "current" | "previous";
  issuedAt?: ISODate;
  validUntil?: ISODate;
  estimateId?: ID;
  /** Feature 28 additions (all optional). */
  title?: string;
  updatedAt?: ISODate;
  /** Follow-up that asked for this quote (feature 29 "Request quote"). */
  followUpId?: ID;
  /** Differing-observed-conditions clause included on the customer quote. */
  clauseIncluded?: boolean;
  /** Ownership period whose history was used. */
  ownershipPeriodId?: ID;
  issuedBy?: ID;
}

/** Owner approval to reuse historical productivity, once per property type (28.3). */
export interface ProductivityPolicy {
  id: ID;
  propertyType: PropertyType;
  approvedBy: ID;
  approvedAt: ISODate;
  note?: string;
}

/** Summary of a completed historical job, for the internal comparison view (28). */
export interface HistoricalJobSummary {
  id: ID; // JOB-2019-14
  propertyId: ID;
  name: string;
  completedAt: ISODate;
  /** Customer price per surface, pre-tax. Internal only. */
  linePrices: Record<ID, number>;
  /** Discount given on that job. Never carried forward. */
  discountPct?: number;
  discountNote?: string;
}

export interface TouchUpReorder {
  id: ID; // TUR-2026-1
  propertyId: ID;
  applicationId: ID;
  packs: PackCount[];
  gallons: number;
  payment: "unpaid" | "prepaid_cleared" | "on_account";
  status: "draft" | "approved" | "fulfilled" | "cancelled";
  stockCheck?: {
    ok: boolean;
    note: string;
    stockId?: ID;
    brand?: string;
    code?: string;
    sheen?: string;
    tintDate?: ISODate;
    issues?: ("skinning" | "separation" | "unlabelled")[];
    checkedAt?: ISODate;
    checkedBy?: ID;
  };
  createdAt: ISODate;
  createdBy: ID;
  approvedBy?: ID;
  refundDueAt?: ISODate;
  refundRecordedAt?: ISODate;
  /** Feature 28 additions (all optional). */
  touchUpRequestId?: ID;
  purpose?: "touch_up" | "non_touch_up";
  requestedGal?: number;
  /** Excess over the request (pack minimum). Non-touch-up excess goes to shelf stock. */
  excessGal?: number;
  /** Where the On account / prepayment status came from. */
  paymentSource?: string;
  paymentMethod?: string;
  /** Where the paint comes from. Customer-owned cans are never company stock. */
  supply?: "new_order" | "company_stock" | "customer_cans";
  customerCansNote?: string;
  approvedAt?: ISODate;
  fulfilledAt?: ISODate;
  cancelledAt?: ISODate;
  cancelReason?: "customer_cancelled" | "unfillable";
  refundRecordedBy?: ID;
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Phase 2 — Employee hours and payroll (feature 22)                   */
/* ------------------------------------------------------------------ */

export type EmployeeType = "hourly" | "salaried" | "subcontractor";

/** EMPLOYEES. Estimate Master holds no pay rates (Rule 3). */
export interface Employee {
  id: ID; // EMP-1
  name: string;
  type: EmployeeType;
  /** Login user, when the employee also uses the app. */
  userId?: ID;
  crewId?: ID;
  /** Identifier in the bookkeeper-approved Gusto mapping. */
  gustoId?: string;
  offboardedAt?: ISODate;
}

export interface Crew {
  id: ID; // CREW-1
  name: string;
  leadUserId: ID;
}

export type ActivityCode = "application" | "preparation" | "travel" | "shop_setup" | "training" | "rained_out";

/** TIME_PUNCHES: one clocked interval on one job and activity. Punches are never rounded. */
export interface TimeSegment {
  id: ID; // TS-1
  employeeId: ID;
  /** Local calendar day the shift started on. A whole overnight shift belongs to its start date. */
  workDate: string;
  /** Undefined for overhead (training, rained out). Travel between jobs is charged to the second job. */
  jobId?: ID;
  /** Patent 22: the job's work order, and the shift the employee was scheduled on that day (if any). */
  workOrderId?: ID;
  shiftId?: ID;
  activity: ActivityCode;
  start: ISODate;
  end?: ISODate;
  source: "online" | "offline";
  /** Offline punch still held on the device, not yet synchronised. */
  queued?: boolean;
  syncedAt?: ISODate;
  /** Location is captured where permitted. Denial never blocks clock-in. GPS is deleted after 90 days. */
  location: "captured" | "denied" | "purged";
  gps?: { lat: number; lng: number };
  clockedBy: ID;
  /** The unselected record of an offline/online conflict. Kept visible, counts zero hours. */
  supersededAt?: ISODate;
  supersededBy?: ID;
}

export type TimeEntryState = "open" | "submitted" | "approved" | "locked" | "paid";

/** TIME_ENTRIES: one employee's day. Totals are always derived from the segments. */
export interface TimeEntry {
  id: ID; // TE-1
  employeeId: ID;
  workDate: string;
  state: TimeEntryState;
  attestedAt?: ISODate;
  submittedAt?: ISODate;
  submittedBy?: ID;
  /** Submitted by the crew lead before the employee attested. */
  unattested?: boolean;
  noLunch?: { reason: string; by: ID; at: ISODate; decision?: "approved" | "rejected"; decidedBy?: ID; decidedAt?: ISODate };
  approvedBy?: ID;
  approvedAt?: ISODate;
  batchId?: ID;
  overrides: { segmentId: ID; field: "start" | "end"; oldValue: ISODate; newValue: ISODate; reason: string; by: ID; at: ISODate }[];
  dispute?: {
    raisedAt: ISODate;
    raisedBy: ID;
    note: string;
    routedTo: "crew_lead_office" | "owner";
    status: "open" | "resolved";
    outcome?: string;
    resolvedBy?: ID;
    resolvedAt?: ISODate;
    /** Raised after Wednesday noon: the entry drops out of this batch into the next (22.Q02). */
    movedToNextBatch?: boolean;
  };
  history: { at: ISODate; by: ID; text: string }[];
}

export interface PayrollBatchLine {
  employeeId: ID;
  entryIds: ID[];
  regularMinutes: number;
  overtimeMinutes: number;
  /** A CSV download alone is never evidence: everything starts Unconfirmed. */
  result: "unconfirmed" | "accepted" | "rejected";
  resultNote?: string;
  resultBy?: ID;
  resultAt?: ISODate;
  correctedInBatchId?: ID;
}

/** PAYROLL_BATCHES. Creating a batch locks its entries. A batch is never reimported. */
export interface PayrollBatch {
  id: ID; // PB-1
  weekStart: string;
  createdAt: ISODate;
  createdBy: ID;
  lines: PayrollBatchLine[];
  correctionOf?: ID;
  csvDownloadedAt?: ISODate;
  paidAt?: ISODate;
  paidBy?: ID;
}

/** PAYROLL_ADJUSTMENTS: after payment, corrections are new records on the next paycheck. */
export interface PayrollAdjustment {
  id: ID; // PADJ-1
  employeeId: ID;
  /** The paid week being corrected. */
  weekStart: string;
  minutes: number;
  reason: string;
  createdBy: ID;
  createdAt: ISODate;
  /** Payday the adjustment is paid on. */
  payday: string;
}

/** LABOR_COST_TOTALS (Rule 3): one approved total per employee per pay period. */
export interface LabourCostTotal {
  id: ID; // LCT-1
  employeeId: ID;
  weekStart: string;
  /** Gross wages from the Gusto run, before burden. Restricted to bookkeeper and owner. */
  amount: number;
  burdenPct: number;
  enteredBy: ID;
  enteredAt: ISODate;
  source: "entered" | "imported";
  /** Allocation across jobs by approved hours. Sums exactly to amount × (1 + burden). */
  allocations: { jobId?: ID; minutes: number; amount: number }[];
}

export interface MileageRate {
  id: ID; // IRS-2026
  year: number;
  centsPerMile: number;
  effectiveFrom: ISODate;
  setBy: ID;
  setAt: ISODate;
}

export interface MileageClaim {
  id: ID; // MIL-1
  employeeId: ID;
  date: ISODate;
  miles: number;
  evidence: { kind: "odometer"; start: number; end: number } | { kind: "addresses"; from: string; to: string };
  purpose: string;
  jobId?: ID;
  status: "submitted" | "crew_approved" | "reviewed" | "rejected";
  crewApprovedBy?: ID;
  crewApprovedAt?: ISODate;
  reviewedBy?: ID;
  reviewedAt?: ISODate;
  /** Rate read from the maintained record on approval. Never typed on the claim. */
  rateId?: ID;
  centsPerMile?: number;
  amount?: number;
  rejectedReason?: string;
}

export interface PayrollSettings {
  /** Owner-set burden percentage, applied to paid wages including overtime. */
  burdenPct: number;
  burdenSetBy: ID;
  timezone: string;
  /** Launch gates supplied in writing by the bookkeeper. */
  gustoMappingConfirmed: boolean;
  reimbursementMappingConfirmed: boolean;
  /** Office manager's monthly check that allocated cost equals entered totals (Rule 3). */
  reconciliations: { month: string; by: ID; at: ISODate; ok: boolean; note: string }[];
}

/* ------------------------------------------------------------------ */
/* Phase 2 — Financial and accounting management (feature 33)          */
/* ------------------------------------------------------------------ */

export type FinanceRecordType = "invoice" | "deposit" | "payment" | "bill" | "credit" | "check" | "receipt" | "refund" | "card_settlement";

export interface FinanceAllocation {
  jobId?: ID;
  /** Overhead stays overhead (vehicle and equipment costs). */
  overhead?: boolean;
  amount: number;
}

/** FINANCE_RECORDS. QuickBooks owns amounts and dates; Estimate Master owns the job and cost code. */
export interface FinanceRecord {
  id: ID; // FIN-1
  type: FinanceRecordType;
  /** Local reference: INV-2026-1, a bill number, a receipt number. */
  ref: string;
  /** Stable QuickBooks reference. Every exchanged record carries one. */
  externalRef?: string;
  party: string;
  /** Pre-tax amount. Read-only here once it has been sent to QuickBooks. */
  amount: number;
  /** Customer sales tax: never counted as revenue. */
  salesTax?: number;
  /** Purchase tax: included in gross job cost. */
  purchaseTax?: number;
  date: ISODate;
  /** Accounting period, YYYY-MM. A closed-period correction posts to the next period. */
  period: string;
  jobId?: ID;
  costCode?: string;
  allocations?: FinanceAllocation[];
  /** Residual cent assignment from the last allocation (Rule 5). */
  residual?: { amount: number; jobId: ID; rule: "largest_allocation" | "lowest_job_number" };
  /** Where the record came from. */
  origin: "estimate_master" | "quickbooks";
  invoiceId?: ID;
  poId?: ID;
  /** A card settlement pays this existing bill. It is never a second expense. */
  paysRecordId?: ID;
  /** A supplier credit stays against its original bill and job. */
  creditOfRecordId?: ID;
  paymentStatus?: "unpaid" | "partial" | "paid";
  amountPaid?: number;
  paymentDate?: ISODate;
  /** Amount edited in QuickBooks after send: display updates, variance flagged. */
  variance?: { sent: number; current: number; at: ISODate; reviewedBy?: ID; reviewedAt?: ISODate };
  /** Deleted in QuickBooks: flagged for review, never deleted here. */
  deletedInQbo?: { at: ISODate; reviewedBy?: ID; reviewedAt?: ISODate; note?: string };
  /** Deposits stay liabilities until invoiced. */
  liability?: boolean;
  appliedToInvoiceId?: ID;
  /** Overpayment turned into account credit. */
  accountCredit?: number;
  /** External payment above $2,500: requested by the office, approved by the owner before it is recorded. */
  approvalRequest?: { by: ID; at: ISODate };
  ownerApproval?: { by: ID; at: ISODate };
  /** Bill matching against the purchase order and received quantities. */
  match?: { poId: ID; matchedAt: ISODate; matchedBy: ID; unmatchedGal: number; unmatchedValue: number; note: string };
  /** Posted to a later period because the original period was closed. */
  postedFromClosedPeriod?: string;
  note?: string;
  /** Bookkeeper note for retainage. There is no retainage engine. */
  retainageNote?: string;
}

/** EXCHANGE_QUEUE. Queued items can be edited; sent versions are frozen. */
export interface ExchangeItem {
  id: ID; // EXQ-1
  recordId: ID;
  version: number;
  status: "queued" | "sent" | "accepted" | "rejected";
  payload: { amount: number; jobId?: ID; costCode?: string; description: string };
  /** Retry-safe: a repeat send with the same key never creates a second QuickBooks record. */
  idempotencyKey: string;
  queuedAt: ISODate;
  queuedBy: ID;
  sentAt?: ISODate;
  attempts: { at: ISODate; ok: boolean; error?: string }[];
  escalatedAt?: ISODate;
  /** Corrections after send are new versions; this points at the one that replaced it. */
  supersededBy?: ID;
  correctionOf?: ID;
  /** Prototype only: the error the simulated QuickBooks returns for this item. */
  simulateError?: string;
}

export interface ReimbursementClaim {
  id: ID; // RMB-1
  /** The employee being reimbursed. Crew members without a login claim through their crew lead. */
  employeeId: ID;
  submittedBy: ID;
  amount: number;
  date: ISODate;
  merchant: string;
  description: string;
  jobId?: ID;
  costCode: string;
  /** File name of the receipt photograph. Required. */
  receiptPhoto?: string;
  status: "draft" | "submitted" | "crew_approved" | "office_reviewed" | "owner_approved" | "rejected";
  crewApprovedBy?: ID;
  crewApprovedAt?: ISODate;
  officeReviewedBy?: ID;
  officeReviewedAt?: ISODate;
  ownerApprovedBy?: ID;
  ownerApprovedAt?: ISODate;
  /** Original expense reference, matched to prevent duplicate job cost. */
  expenseRef?: string;
  duplicateOfRecordId?: ID;
  rejectedReason?: string;
}

export interface Vendor {
  id: ID; // VEN-1
  name: string;
  status: "requested" | "active";
  requestedBy: ID;
  requestedAt: ISODate;
  activatedBy?: ID;
  activatedAt?: ISODate;
}

export interface CostCode {
  code: string;
  label: string;
  status: "proposed" | "approved";
  proposedBy: ID;
  approvedBy?: ID;
  approvedAt?: ISODate;
}

export interface AccountMapping {
  id: ID; // MAP-A1
  category: string;
  account: string;
  updatedBy: ID;
  updatedAt: ISODate;
}

/** MIGRATION_TOTALS: two years of comparison totals only, never transaction detail. */
export interface MigrationTotal {
  id: ID;
  year: number;
  category: "revenue" | "materials" | "labour" | "subcontractors" | "overhead";
  amount: number;
  batchId: ID;
}

export interface FinanceSettings {
  qbo: { connected: boolean; connectedBy?: ID; connectedAt?: ISODate; lastExchangeAt?: ISODate; realm?: string };
  closedPeriods: string[];
  /** Bookkeeper's written confirmation of whether Gusto posts the payroll journal. */
  gustoPostsJournal?: boolean;
  migrationSignOff?: { by: ID; at: ISODate; batchId: ID };
  jurisdiction: string;
}

/* ------------------------------------------------------------------ */
/* Phase 2 — Performance reporting and rate feedback (features 21, 30) */
/* ------------------------------------------------------------------ */

export interface CostSet {
  labourHours: number;
  labourCost: number;
  material: number;
  subcontractor: number;
}

export type ApplicationMethod = "roll" | "spray" | "brush";

/** One surface and product combination on a completed job (feature 30 evidence). */
export interface EvidenceCombo {
  surfaceType: SurfaceType;
  exterior: boolean;
  tier: "standard" | "premium";
  method: ApplicationMethod;
  condition: SurfaceCondition;
  product: string;
  measuredSqft: number;
  coats: number;
  applicationHours: number;
  /** Captured separately and excluded from application rates. */
  prepHours: number;
  travelHours: number;
  setupHours: number;
  reworkHours: number;
  /** Consumed gallons include spills. */
  consumedGal: number;
  spillsGal: number;
  /** The waste allowance used on that job (0.05, 0.10, 0.15). */
  wasteAllowance: number;
}

/** A completed job summary from before the prototype's live jobs (features 21, 30). */
export interface CompletedJobRecord {
  id: ID; // JOB-2025-41
  name: string;
  propertyLabel: string;
  startedAt: ISODate;
  completedAt: ISODate;
  kind: "interior" | "exterior";
  estimatorId: ID;
  crewLeadId: ID;
  /** Whole-job hours, area, product, coats and usage all verified. */
  verified: boolean;
  combinations: EvidenceCombo[];
  /** Original approved estimate (cost basis). */
  estimate: CostSet;
  /** Approved change-order contribution. */
  changes: CostSet;
  /** Undefined means the actual is missing: shown as missing, never as zero. */
  actual?: CostSet;
  pendingHours?: number;
  /** Work outside the compared scope, reported on its own line. */
  outOfScope?: { label: string; hours: number; cost: number };
}

/** Estimate cost basis for a live job (feature 21). */
export interface EstimateBaseline {
  jobId: ID;
  approvedAt: ISODate;
  kind: "interior" | "exterior";
  estimate: CostSet;
}

export type PerformanceDimension = "job" | "estimator" | "crew_lead" | "kind";
export type PerformanceMeasure = "cost" | "hours";

export interface PerformanceRow {
  key: string;
  label: string;
  jobIds: ID[];
  complete: boolean;
  original: number;
  change: number;
  revised: number;
  actual?: number;
  pending: number;
  outOfScope?: { label: string; value: number };
  reasonCode?: string;
}

/** PERFORMANCE_SNAPSHOTS: issued reports never change. */
export interface PerformanceSnapshot {
  id: ID; // SNAP-1
  issuedAt: ISODate;
  issuedBy: ID;
  kind: "manual" | "weekly";
  period: { from: string; to: string };
  dimension: PerformanceDimension;
  baseline: "revised" | "original";
  measure: PerformanceMeasure;
  timezone: string;
  rows: PerformanceRow[];
  recipients?: string[];
  supersedes?: ID;
  supersededBy?: ID;
  archivedAt?: ISODate;
  retrievalRequestedAt?: ISODate;
  retrievalRequestedBy?: ID;
}

export type ReasonCode = "Weather" | "Hidden damage or rot" | "Rework" | "Customer change" | "Training or new crew";

export interface VarianceReason {
  jobId: ID;
  code: ReasonCode;
  note: string;
  by: ID;
  at: ISODate;
}

/** A correction to a completed job's actual: office manager and owner approve. */
export interface PerformanceCorrection {
  id: ID; // PCR-1
  jobId: ID;
  field: keyof CostSet;
  oldValue: number;
  newValue: number;
  code: ReasonCode;
  note: string;
  requestedBy: ID;
  requestedAt: ISODate;
  requires: ("office_manager" | "owner")[];
  approvals: { role: "office_manager" | "owner"; by: ID; at: ISODate }[];
  status: "pending" | "applied" | "rejected";
  appliedAt?: ISODate;
}

export interface SavedFilter {
  id: ID;
  userId: ID;
  name: string;
  preset: string;
  from: string;
  to: string;
  dimension: PerformanceDimension;
  baseline: "revised" | "original";
  measure: PerformanceMeasure;
  /** Role it was created under. Loading it always applies the viewer's own permissions. */
  createdRole: Role;
}

/** One shared estimating rate for one surface and product combination (feature 30). */
export interface RateRecord {
  id: ID; // RATE-P-1
  comboKey: string;
  kind: "productivity" | "coverage";
  value: number;
  /** False where coverage suggestions are not enabled for the combination. */
  enabled?: boolean;
  versions: RateVersion[];
}

export interface RateVersion {
  version: number;
  value: number;
  previous?: number;
  by: ID;
  at: ISODate;
  reason: string;
  kind: "initial" | "approval" | "rollback";
  /** Day-90 review by the estimating manager. */
  review?: { by: ID; at: ISODate; outcome: string };
  escalatedAt?: ISODate;
}

export interface EvidenceExclusion {
  id: ID; // EXC-1
  comboKey: string;
  jobId: ID;
  reason: string;
  by: ID;
  at: ISODate;
  restoredBy?: ID;
  restoredAt?: ISODate;
}

export interface RateDecision {
  id: ID; // RDC-1
  rateId: ID;
  decision: "approved" | "rejected";
  by: ID;
  at: ISODate;
  reason: string;
  observed: number;
  current: number;
  eligibleJobIds: ID[];
  suppressedUntil?: ISODate;
  reopenedBy?: ID;
  reopenedAt?: ISODate;
  /** Open drafts flagged for an estimator to choose whether to refresh. */
  draftsFlagged?: ID[];
}

/* ------------------------------------------------------------------ */
/* Phase 2 — Social media and marketing (feature 34)                   */
/* ------------------------------------------------------------------ */

/** Data-driven list and capabilities: SOCIAL_PLATFORMS in lib/rules/marketing-social. */
export type SocialPlatform = "facebook" | "instagram" | "google_business" | "linkedin" | "tiktok" | "youtube" | "x";

/** MEDIA_ASSETS: job media with its release evidence. The original is kept when cropped. */
export interface MediaAsset {
  id: ID; // MED-1
  label: string;
  jobId?: ID;
  propertyId?: ID;
  /** Neighbourhood only. The street address is never shown. */
  neighbourhood?: string;
  kind: "customer_property" | "surface_detail" | "crew" | "seasonal";
  /** Shows faces, house numbers, licence plates or a neighbouring property. */
  identifying: boolean;
  identifyingNote?: string;
  release: "signed_contract" | "written_approval" | "hiring_release" | "none";
  releaseRef?: string;
  withdrawnAt?: ISODate;
  withdrawnBy?: ID;
  withdrawReason?: string;
  sizeMb: number;
  takenAt: ISODate;
  uploadedBy: ID;
  hex: string;
  /** Publication crop made from an original. */
  cropOf?: ID;
  crop?: { format: "square" | "vertical"; template: string };
  deletedForPrivacyAt?: ISODate;
}

export type PostState = "draft" | "awaiting_approval" | "approved" | "scheduled" | "published" | "missed" | "partially_failed" | "cancelled";
export type PostTemplate = "before_after" | "finished_job" | "crew_spotlight" | "seasonal";

export interface PostPublication {
  platform: SocialPlatform;
  status: "pending" | "published" | "failed" | "uncertain";
  at?: ISODate;
  externalRef?: string;
  error?: string;
}

export interface MarketingPost {
  id: ID; // POST-1
  title: string;
  template: PostTemplate;
  copy: string;
  assetIds: ID[];
  platforms: SocialPlatform[];
  /** Content types that need owner approval. */
  flags: { customerProperty: boolean; testimonial: boolean; namedCrew: boolean };
  /** Pre-publication checklist, completed by the office. */
  checklist: { houseNumbers: boolean; faces: boolean; plates: boolean; neighbouring: boolean };
  version: number;
  versions: { version: number; at: ISODate; by: ID; copy: string; assetIds: ID[]; note: string }[];
  approval?: { version: number; by: ID; at: ISODate };
  approvalVoided?: { at: ISODate; reason: string };
  rejection?: { by: ID; at: ISODate; comment: string };
  state: PostState;
  /** Local wall-clock schedule and the resolved instant (34.Q01). */
  schedule?: { localDate: string; localTime: string; utc: ISODate; adjustment: "none" | "moved_to_first_valid" | "first_occurrence" };
  publications: PostPublication[];
  missedAt?: ISODate;
  /** Withdrawn media on a published post: the office reviews and confirms the takedown. */
  takedown?: { requiredAt: ISODate; reason: string; doneAt?: ISODate; doneBy?: ID; spotCheckedBy?: ID };
  copiedFrom?: ID;
  /** Prototype only: the outcome the simulated platform returns on the next attempt. */
  simulate?: Partial<Record<SocialPlatform, "failed" | "uncertain">>;
  createdBy: ID;
  createdAt: ISODate;
}

export interface SocialAccount {
  platform: SocialPlatform;
  accountId: string;
  name: string;
  status: "connected" | "expired" | "suspended";
  expiresAt: ISODate;
  /** Test page and account used before production (34). */
  test: boolean;
  /** Fallback when only draft push is possible (34.A20). */
  mode: "publish" | "draft_for_approval";
  access: ID[];
  ownerNotifiedAt?: ISODate;
}

/* ------------------------------------------------------------------ */
/* Cross-cutting                                                       */
/* ------------------------------------------------------------------ */

export interface ActivityEntry {
  id: ID;
  at: ISODate;
  /** User ID, or the supplier ID when `source` is "supplier". */
  userId: ID;
  /** Set when the entry came from a supplier connection, not a staff member. */
  source?: "supplier";
  module: string;
  message: string;
  /** Blocked attempts are logged too (Access Validations). */
  blocked?: boolean;
}

export interface Task {
  id: ID;
  title: string;
  done: boolean;
  createdAt: ISODate;
}

/** The whole prototype database. Saved as one JSON blob in localStorage. */
export interface Database {
  seededAt: ISODate;
  users: User[];
  customers: Customer[];
  leads: Lead[];
  estimates: Estimate[];
  estimateHistory: EstimateHistoryEntry[];
  invoices: Invoice[];
  workOrders: WorkOrder[];
  /** Live WasteSettings (Settings › General Configuration). */
  wasteSettings?: { calculateWaste: boolean; defaultWastePercent: number; updatedAt?: ISODate; updatedBy?: ID };
  /** Live FinancialSettings (Settings › Financial Settings). depositPercent drives the deposit invoice on acceptance. */
  financialSettings?: { applyProfitToMiscLineItems: boolean; miscLineItemProfitMargin: number; depositPercent: number; updatedAt?: ISODate; updatedBy?: ID };
  properties: Property[];
  areas: Area[];
  surfaces: Surface[];
  applications: Application[];
  corrections: Correction[];
  qrLinks: QrLink[];
  touchUpRequests: TouchUpRequest[];
  /** Feature 25 closeout checklists (optional: older saved data may lack it). */
  closeouts?: Closeout[];
  /** Feature 26 photographs for sharing. */
  sharedPhotos?: SharedPhoto[];
  /** Feature 25 merge / renumber requests. */
  propertyRequests?: PropertyStructureRequest[];
  jobs: Job[];
  colours: Colour[];
  /** Manufacturer colour palettes (feature 3). Optional for older saved data. */
  palette?: PaletteColour[];
  specs: SpecLine[];
  sampleRounds: SampleRound[];
  colourApprovals: ColourApproval[];
  cardSnapshots: CardSnapshot[];
  commitmentFlags: CommitmentFlag[];
  catalog: ProductCatalogItem[];
  demandAdjustments: DemandAdjustment[];
  shelfStock: ShelfStock[];
  suppliers: Supplier[];
  branches: Branch[];
  purchaseOrders: PurchaseOrder[];
  /** Features 18 and 19 (optional: older saved data may lack them). */
  orderRequests?: OrderRequest[];
  receipts?: POReceipt[];
  returns?: POReturn[];
  equipmentRentals?: EquipmentRental[];
  materialOverrides?: MaterialOverride[];
  materialCalcs?: MaterialCalcSnapshot[];
  estimateBases?: EstimateBasis[];
  productMappings?: ProductMapping[];
  procurementSettings?: { packingStrategy: "least_leftover" | "lowest_price"; updatedBy?: ID; updatedAt?: ISODate };
  changeOrders: ChangeOrder[];
  /** TAX_RATES by effective date (feature 24). Optional for older saved data. */
  taxRates?: TaxRate[];
  lifespanLibrary: LifespanLibrary;
  repaintAlerts: RepaintAlert[];
  runLog: RunLogEntry[];
  /** Feature 27 stores (optional: older saved data may lack them). */
  repaintSchedules?: RepaintSchedule[];
  lifespanHistory?: LifespanLibrary[];
  recalculations?: HistoricalRecalc[];
  followUps: FollowUp[];
  repeatEstimates: RepeatEstimate[];
  touchUpReorders: TouchUpReorder[];
  /** Feature 28 owner productivity policies (optional: older saved data may lack it). */
  productivityPolicies?: ProductivityPolicy[];
  /** Feature 28 completed-job summaries for the comparison view. */
  historicalJobs?: HistoricalJobSummary[];
  /* ---- Phase 2. Older saved data gets these from the seed when it loads (lib/store). ---- */
  /** Feature 22 */
  employees: Employee[];
  crews: Crew[];
  timeSegments: TimeSegment[];
  timeEntries: TimeEntry[];
  payrollBatches: PayrollBatch[];
  payrollAdjustments: PayrollAdjustment[];
  labourCosts: LabourCostTotal[];
  mileageRates: MileageRate[];
  mileageClaims: MileageClaim[];
  payrollSettings: PayrollSettings;
  /** Feature 33 */
  financeRecords: FinanceRecord[];
  exchangeQueue: ExchangeItem[];
  reimbursements: ReimbursementClaim[];
  vendors: Vendor[];
  costCodes: CostCode[];
  accountMappings: AccountMapping[];
  migrationTotals: MigrationTotal[];
  financeSettings: FinanceSettings;
  /** Feature 33 books (features/types/finance.ts). Optional: older saved data gets them from the seed. */
  otherIncome?: import("./finance").OtherIncome[];
  financeVehicles?: import("./finance").FleetVehicle[];
  financeEquipment?: import("./finance").FleetEquipment[];
  financeDocuments?: import("./finance").FinanceDocument[];
  bankAccounts?: import("./finance").BankAccount[];
  checkRegister?: import("./finance").RegisterEntry[];
  feedTransactions?: import("./finance").FeedTransaction[];
  recurringExpenses?: import("./finance").RecurringExpense[];
  recurringOccurrences?: import("./finance").RecurringOccurrence[];
  financeAlertRules?: import("./finance").FinanceAlertRule[];
  financeNotices?: import("./finance").FinanceNotice[];
  payrollRuns?: import("./finance").PayrollSyncRun[];
  /** Features 21 and 30 */
  completedJobs: CompletedJobRecord[];
  estimateBaselines: EstimateBaseline[];
  performanceSnapshots: PerformanceSnapshot[];
  varianceReasons: VarianceReason[];
  performanceCorrections: PerformanceCorrection[];
  savedFilters: SavedFilter[];
  rateRecords: RateRecord[];
  evidenceExclusions: EvidenceExclusion[];
  rateDecisions: RateDecision[];
  /** Feature 34 */
  mediaAssets: MediaAsset[];
  marketingPosts: MarketingPost[];
  socialAccounts: SocialAccount[];
  /** Feature 34 part 1 — social platforms and content (types in ./marketing-social). */
  socialTemplates?: import("./marketing-social").SocialTemplate[];
  socialMetrics?: import("./marketing-social").SocialMetricSnapshot[];
  socialMessages?: import("./marketing-social").SocialMessage[];
  socialReviews?: import("./marketing-social").SocialReview[];
  reviewRequests?: import("./marketing-social").ReviewRequest[];
  employeeMediaConsents?: import("./marketing-social").EmployeeMediaConsent[];
  socialAds?: import("./marketing-social").SocialAdCampaign[];
  /** Feature 34 part 2 — campaigns and growth (types in ./marketing-growth). */
  mktCampaigns?: import("./marketing-growth").MarketingCampaign[];
  mktPromotions?: import("./marketing-growth").Promotion[];
  mktReferralCodes?: import("./marketing-growth").ReferralCode[];
  mktLinks?: import("./marketing-growth").TrackLink[];
  mktLandingPages?: import("./marketing-growth").LandingPage[];
  mktSubmissions?: import("./marketing-growth").FormSubmission[];
  mktAppointmentRequests?: import("./marketing-growth").AppointmentRequest[];
  mktContacts?: import("./marketing-growth").MarketingContact[];
  mktSegments?: import("./marketing-growth").AudienceSegment[];
  mktMessageCampaigns?: import("./marketing-growth").MessageCampaign[];
  mktAutomations?: import("./marketing-growth").MarketingAutomation[];
  mktAutomationRuns?: import("./marketing-growth").AutomationRun[];
  mktExpenses?: import("./marketing-growth").MarketingExpense[];
  mktAttributions?: import("./marketing-growth").LeadAttributionRecord[];
  mktCommunications?: import("./marketing-growth").CommEntry[];
  mktOptOuts?: import("./marketing-growth").MarketingOptOut[];
  mktSettings?: import("./marketing-growth").MarketingGrowthSettings;
  mktRecommendationLog?: import("./marketing-growth").RecommendationLogEntry[];
  activity: ActivityEntry[];
  tasks: Task[];
  notifications?: Notification[];
  paintPassports?: PaintPassport[];
  counters: Record<string, number>;
}

/**
 * Customer Paint Passport (patent 26): chosen completed jobs behind one
 * customer-viewable link, so the customer can look up past colours,
 * products and surfaces without contacting the contractor.
 */
export interface PaintPassport {
  id: ID; // PP-1
  /** Unguessable link reference; never derived from the address or ids. */
  ref: string;
  customerId: ID;
  jobIds: ID[];
  createdAt: ISODate;
  createdBy: ID;
  revokedAt?: ISODate;
  lastSentAt?: ISODate;
  lastSentTo?: string;
  lastSentChannel?: "email" | "text";
  openCount: number;
  lastOpenAt?: ISODate;
}

/** A message for one staff member, shown under the header bell until read (patent 12). */
export interface Notification {
  id: ID;
  userId: ID;
  kind: "estimate_accepted" | "finance_alert" | "campaign";
  title: string;
  body: string;
  /** Page the notification opens. */
  href: string;
  createdAt: ISODate;
  readAt?: ISODate;
}

/** Standard result shape for store actions. */
export type ActionResult<T = undefined> =
  | { ok: true; value?: T }
  | { ok: false; error: string; field?: string };
