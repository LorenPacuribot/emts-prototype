/**
 * Feature 33 — Financial and accounting management: the books kept next to
 * the QuickBooks exchange (other income, dimensions, receipts and documents,
 * the checkbook register, bank and card feeds, recurring expenses, alerts and
 * the accounting / bank / card / payroll connectors).
 *
 * The existing FINANCE_RECORDS, VENDOR, COST_CODE and FINANCE_SETTINGS types
 * live in ./index. The optional fields they gain here are added by module
 * augmentation, so older saved data stays valid.
 */
import type { ID, ISODate } from "./index";

export type PaymentMethod = "check" | "cash" | "card" | "bank_transfer" | "ach" | "other";
export type CostBucket = "material" | "labour" | "subcontractor" | "other" | "overhead";

/** Any record can carry these dimensions for search, reports and job cost. */
export interface FinanceDimensions {
  vendorId?: ID;
  customerId?: ID;
  propertyId?: ID;
  employeeId?: ID;
  vehicleId?: ID;
  equipmentId?: ID;
  jobId?: ID;
}

declare module "./index" {
  interface FinanceRecord {
    vendorId?: ID;
    customerId?: ID;
    propertyId?: ID;
    employeeId?: ID;
    vehicleId?: ID;
    equipmentId?: ID;
    paymentMethod?: PaymentMethod;
    /** Receipts and other documents attached to this record. */
    documentIds?: ID[];
    /** Bills: due date (bill date + vendor terms when not given). */
    dueDate?: ISODate;
    /** Voided in the checkbook register: never a cost, kept for audit. */
    voidedAt?: ISODate;
    voidReason?: string;
    feedTxnId?: ID;
    checkId?: ID;
    recurringOccurrenceId?: ID;
    memo?: string;
  }
  interface Vendor {
    email?: string;
    phone?: string;
    address?: string;
    category?: VendorCategory;
    /** Payment terms in days (net 30 → 30). Drives AP due dates. */
    termsDays?: number;
    defaultCostCode?: string;
    /** Receives a 1099 at year end. */
    is1099?: boolean;
    /** Other spellings seen on bills and card statements ("SW 7132", "Sherwin-Williams #7248"). */
    aliases?: string[];
    notes?: string;
  }
  interface CostSet {
    /** Estimated other job cost (rentals, permits, dump fees). */
    other?: number;
  }
  interface CostCode {
    /** Which job-cost column this code counts in. */
    bucket?: CostBucket;
  }
  interface FinanceSettings {
    connectors?: Partial<Record<FinanceSystem, ConnectorState>>;
    /** Defaults for the built-in alerts (contractor rules are FinanceAlertRule). */
    alertDefaults?: AlertDefaults;
    /** Customer invoice terms in days, for overdue receivables. */
    arTermsDays?: number;
  }
}

export type VendorCategory = "supplier" | "subcontractor" | "equipment" | "services" | "utilities" | "insurance" | "landlord" | "fuel" | "other";

/* ---------------------------- Other income --------------------------- */

export type OtherIncomeKind = "interest" | "rebate" | "supplier_refund" | "equipment_sale" | "scrap" | "rental" | "insurance_claim" | "other";

/** Income that isn't a customer invoice: interest, rebates, refunds, equipment sales. */
export interface OtherIncome extends FinanceDimensions {
  id: ID; // OI-1
  kind: OtherIncomeKind;
  source: string;
  amount: number;
  date: ISODate;
  period: string;
  paymentMethod?: PaymentMethod;
  reference?: string;
  accountId?: ID;
  documentIds?: ID[];
  note?: string;
  feedTxnId?: ID;
  createdBy: ID;
  createdAt: ISODate;
  voidedAt?: ISODate;
  voidReason?: string;
}

/* ----------------------- Vehicles and equipment ---------------------- */

export interface FleetVehicle {
  id: ID; // VEH-1
  name: string;
  plate?: string;
  vin?: string;
  year?: number;
  active: boolean;
  addedBy: ID;
  addedAt: ISODate;
  retiredAt?: ISODate;
}

export interface FleetEquipment {
  id: ID; // EQP-1
  name: string;
  serial?: string;
  kind?: string;
  active: boolean;
  addedBy: ID;
  addedAt: ISODate;
  retiredAt?: ISODate;
}

/* ------------------------------ Documents ---------------------------- */

export type DocumentCategory = "receipt" | "vendor_invoice" | "bank_statement" | "card_statement" | "contract" | "insurance" | "tax" | "payroll" | "other";
export type DocumentLinkKind = "record" | "job" | "vendor" | "check" | "feed" | "income" | "recurring" | "customer";

/**
 * A stored file. The bytes live in the browser (IndexedDB, key `blobKey`);
 * the database keeps the metadata, a small thumbnail and the links.
 */
export interface FinanceDocument {
  id: ID; // DOC-1
  name: string;
  mime: string;
  size: number;
  /** IndexedDB key. Absent for seeded placeholders with no bytes. */
  blobKey?: string;
  /** Small data-URL preview for images. */
  thumbnail?: string;
  category: DocumentCategory;
  links: { kind: DocumentLinkKind; id: ID }[];
  uploadedBy: ID;
  uploadedAt: ISODate;
  note?: string;
}

/* ------------------------- Checkbook register ------------------------ */

export interface BankAccount {
  id: ID; // BA-1
  name: string;
  kind: "checking" | "savings" | "credit_card";
  last4: string;
  openingBalance: number;
  openingDate: ISODate;
  nextCheckNumber?: number;
}

/** One line in the checkbook register: a check written, or a deposit entered. */
export interface RegisterEntry {
  id: ID; // REG-1
  accountId: ID;
  kind: "check" | "deposit";
  /** Check number (checks only). */
  number?: number;
  payee: string;
  vendorId?: ID;
  amount: number;
  date: ISODate;
  purpose: string;
  jobId?: ID;
  costCode?: string;
  /** The finance record the check produced (job cost, QuickBooks). */
  recordId?: ID;
  status: "written" | "cleared" | "void";
  clearedAt?: ISODate;
  voidedAt?: ISODate;
  voidedBy?: ID;
  voidReason?: string;
  documentIds?: ID[];
  createdBy: ID;
  createdAt: ISODate;
}

/* -------------------------- Bank and card feeds ---------------------- */

/**
 * An imported bank or card line. It waits in the review queue until someone
 * matches it to a record, codes it (creating an expense or income), or excludes it.
 * `amount` is signed: negative is money out, positive is money in.
 */
export interface FeedTransaction {
  id: ID; // FTX-1
  source: "bank" | "card";
  accountId: ID;
  externalId?: string;
  date: ISODate;
  description: string;
  amount: number;
  status: "unreviewed" | "coded" | "matched" | "excluded";
  origin: "manual" | "csv" | "live" | "sandbox";
  costCode?: string;
  jobId?: ID;
  vendorId?: ID;
  employeeId?: ID;
  vehicleId?: ID;
  equipmentId?: ID;
  recordId?: ID;
  incomeId?: ID;
  note?: string;
  reviewedBy?: ID;
  reviewedAt?: ISODate;
  importedAt: ISODate;
  importedBy?: ID;
}

/* -------------------------- Recurring expenses ----------------------- */

export type RecurringKind = "subscription" | "insurance" | "rent" | "utilities" | "vehicle" | "loan" | "other";
export type Frequency = "weekly" | "monthly" | "quarterly" | "annual";

export interface RecurringExpense {
  id: ID; // REC-1
  name: string;
  kind: RecurringKind;
  vendorId?: ID;
  payee: string;
  amount: number;
  costCode: string;
  frequency: Frequency;
  /** First due date. Later dates keep its day of month (clamped to short months). */
  startDate: ISODate;
  endDate?: ISODate;
  /** Remind this many days before each due date. */
  reminderDays: number;
  paymentMethod?: PaymentMethod;
  vehicleId?: ID;
  equipmentId?: ID;
  active: boolean;
  createdBy: ID;
  createdAt: ISODate;
}

/** One expected entry generated from a schedule. Posting it creates the expense. */
export interface RecurringOccurrence {
  id: ID; // ROC-1
  recurringId: ID;
  dueDate: ISODate;
  amount: number;
  status: "expected" | "posted" | "skipped";
  recordId?: ID;
  postedAt?: ISODate;
  postedBy?: ID;
  skippedReason?: string;
}

/* -------------------------------- Alerts ----------------------------- */

export type AlertMetric = "total_expenses" | "category_spend" | "vendor_spend" | "revenue" | "gross_margin" | "ar_overdue" | "ap_overdue" | "other_income";
export type AlertPeriod = "week" | "month" | "quarter" | "year";

/** A contractor-defined rule: metric, threshold, period. */
export interface FinanceAlertRule {
  id: ID; // FAR-1
  name: string;
  metric: AlertMetric;
  comparator: "above" | "below";
  threshold: number;
  period: AlertPeriod;
  costCode?: string;
  vendorId?: ID;
  active: boolean;
  createdBy: ID;
  createdAt: ISODate;
}

export interface AlertDefaults {
  /** Flag a category when this month's spend exceeds the rolling average by this fraction (0.5 = 50%). */
  highExpenseFactor: number;
  /** Months in the rolling average. */
  rollingMonths: number;
  /** Flag a job when its projected margin is this many points below the estimate's margin. */
  marginDropPts: number;
}

export type FinanceAlertKind = "high_expense" | "overdue_ar" | "overdue_ap" | "declining_margin" | "rule" | "recurring_due";

export interface FinanceAlert {
  /** Stable key: the same condition raises one notice, not one per render. */
  key: string;
  kind: FinanceAlertKind;
  severity: "info" | "warn" | "critical";
  title: string;
  detail: string;
  href?: string;
  value?: number;
  threshold?: number;
}

/** A raised alert, kept so it shows in notifications until read or dismissed. */
export interface FinanceNotice {
  id: ID; // FNT-1
  key: string;
  kind: FinanceAlertKind;
  severity: FinanceAlert["severity"];
  title: string;
  detail: string;
  href?: string;
  raisedAt: ISODate;
  readAt?: ISODate;
  dismissedAt?: ISODate;
}

/* ------------------------------ Connectors --------------------------- */

export type FinanceSystem = "accounting" | "bank" | "card" | "payroll";
export const FINANCE_SYSTEMS: FinanceSystem[] = ["accounting", "bank", "card", "payroll"];

export interface ConnectorState {
  mode: "live" | "sandbox" | "unconfigured";
  lastSyncAt?: ISODate;
  lastResult?: string;
  lastError?: string;
  /** Last inbox cursor applied, so a repeat poll changes nothing. */
  appliedMessageIds?: string[];
}

/** One payroll run received from the payroll connector (Gusto-style). Totals only. */
export interface PayrollSyncRun {
  id: ID; // PRR-1
  externalId: string;
  periodStart: ISODate;
  periodEnd: ISODate;
  payDate: ISODate;
  gross: number;
  employerTaxes: number;
  lines: { employeeId?: ID; externalEmployeeId: string; gross: number }[];
  origin: "live" | "sandbox";
  receivedAt: ISODate;
}

/** A queued exchange item as the accounting connector receives it. */
export interface ExchangePushItem {
  itemId: ID;
  idempotencyKey: string;
  recordType: string;
  ref: string;
  amount: number;
  jobId?: ID;
  costCode?: string;
  description: string;
  /** Sandbox only: the error the sandbox returns for this item. */
  simulateError?: string;
}

export interface ExchangeResult {
  itemId: ID;
  ok: boolean;
  externalRef?: string;
  error?: string;
}

/** Messages the connectors deliver through the signed webhook (or the sandbox). */
export type FinanceMessage =
  | { messageId: string; system: "accounting"; kind: "record_edited"; externalRef: string; amount: number; sandbox?: boolean }
  | { messageId: string; system: "accounting"; kind: "record_deleted"; externalRef: string; sandbox?: boolean }
  | { messageId: string; system: "accounting"; kind: "record_created"; externalRef: string; recordType: "receipt" | "bill"; party: string; amount: number; purchaseTax?: number; date: ISODate; sandbox?: boolean }
  | { messageId: string; system: "bank" | "card"; kind: "transaction"; externalId: string; accountLast4: string; date: ISODate; description: string; amount: number; sandbox?: boolean }
  | {
    messageId: string; system: "payroll"; kind: "payroll_run"; externalId: string; periodStart: ISODate; periodEnd: ISODate; payDate: ISODate; gross: number; employerTaxes: number;
    lines: { externalEmployeeId: string; gross: number }[]; sandbox?: boolean;
  };
