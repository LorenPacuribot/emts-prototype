/**
 * Feature 24 — Change Orders And Additional Work.
 *
 * Pure calculations for pricing, approval thresholds, deposit review,
 * emergency work, approval links, billing and refund windows. Screens and
 * store actions call these so every rule lives in one tested place.
 */
import { roundMoney } from "./rounding";
import { addDays, isHoliday, isoDay } from "./dates";

/** Business owner approves gross additions strictly above this (24). */
export const OWNER_APPROVAL_THRESHOLD = 2000;
/** Emergency path is only for work strictly below this. $500 exactly does not qualify. */
export const EMERGENCY_LIMIT = 500;
/** Deposit review triggers above this share of the ORIGINAL contract value (24.Q02). */
export const DEPOSIT_REVIEW_PCT = 0.25;
export const LINK_EXPIRY_DAYS = 30;
export const REFUND_WINDOW_DAYS = 14;
export const WRITTEN_CONFIRMATION_WORKING_DAYS = 2;
export const UNDELIVERABLE_ESCALATION_WORKING_DAYS = 2;

/* ------------------------------ Pricing ------------------------------ */

export interface PricingLine {
  kind: "add" | "remove";
  cost: number;
  treatment?: "billable" | "stranded_paint" | "absorbed_labour";
}

export interface PricingInput {
  lines: PricingLine[];
  /** Markup from the original contract. */
  markupPct: number;
  /** Rate effective on the change-order date. */
  taxRatePct: number;
  /** Inherited discount on additions. Only applied once the owner approves it. */
  discountPct?: number;
  discountApproved?: boolean;
}

export interface Pricing {
  grossAddition: number;
  credit: number;
  discount: number;
  /** Discount the owner has not approved yet (shown, not applied). */
  pendingDiscount: number;
  net: number;
  tax: number;
  total: number;
  /** Cancelled-inside-24h labour the contractor absorbs (job cost, not billed). */
  absorbedCost: number;
}

/** Customer price for one line: cost × (1 + original markup), half-up to cents (Rule 6). */
export function lineSell(cost: number, markupPct: number): number {
  return roundMoney(cost * (1 + markupPct / 100));
}

/** Signed customer price for one line. Absorbed labour is never billed. */
export function lineAmount(line: PricingLine, markupPct: number): number {
  if (line.treatment === "absorbed_labour") return 0;
  const sell = lineSell(line.cost, markupPct);
  return line.kind === "add" ? sell : -sell;
}

/**
 * Prices only the incremental lines. The original contract is never
 * re-added: the result is the difference against the last approved scope.
 */
export function priceChangeOrder(input: PricingInput): Pricing {
  let grossAddition = 0;
  let credit = 0;
  let absorbedCost = 0;
  for (const l of input.lines) {
    if (l.treatment === "absorbed_labour") {
      absorbedCost += l.cost;
      continue;
    }
    const sell = lineSell(l.cost, input.markupPct);
    if (l.kind === "add") grossAddition += sell;
    else credit += sell;
  }
  grossAddition = roundMoney(grossAddition);
  credit = roundMoney(credit);
  const discountValue = input.discountPct ? roundMoney((grossAddition * input.discountPct) / 100) : 0;
  const discount = input.discountApproved ? discountValue : 0;
  const pendingDiscount = input.discountApproved ? 0 : discountValue;
  const net = roundMoney(grossAddition - discount - credit);
  const tax = roundMoney((net * input.taxRatePct) / 100);
  return { grossAddition, credit, discount, pendingDiscount, net, tax, total: roundMoney(net + tax), absorbedCost: roundMoney(absorbedCost) };
}

/* ------------------------------ Tax rates ---------------------------- */

export interface RateRow {
  ratePct: number;
  effectiveFrom: string;
}

/** The tax rate in force on the change-order date. Never the obsolete contract rate. */
export function taxRateOn<T extends RateRow>(dateIso: string, rates: T[]): T | undefined {
  const day = isoDay(dateIso);
  return [...rates]
    .filter((r) => isoDay(r.effectiveFrom) <= day)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

/* --------------------------- Internal approval ----------------------- */

export interface OwnerCheck {
  required: boolean;
  reasons: string[];
}

/**
 * Owner approves gross additions strictly above $2,000 and every credit.
 * Credits never offset additions: the gross addition alone is tested.
 * An inherited discount also needs the owner.
 */
export function ownerApprovalCheck(p: { grossAddition: number; credit: number; discountRequested?: boolean }): OwnerCheck {
  const reasons: string[] = [];
  if (p.grossAddition > OWNER_APPROVAL_THRESHOLD) reasons.push(`Gross addition is above $2,000.00`);
  if (p.credit > 0) reasons.push("Every credit needs the business owner");
  if (p.discountRequested) reasons.push("Inherited discount needs the business owner");
  return { required: reasons.length > 0, reasons };
}

/* ----------------------------- Deposit review ------------------------ */

export interface DepositReview {
  cumulativeNet: number;
  pct: number;
  triggered: boolean;
  newContractTotal: number;
  target: number;
  collected: number;
  due: number;
}

/**
 * 24.Q02: cumulative SIGNED net changes, including the proposed change, over
 * the ORIGINAL contract value. Revised target = one-third of the new contract
 * total, less deposits already collected.
 */
export function depositReview(p: { originalValue: number; approvedNets: number[]; proposedNet?: number; collected: number }): DepositReview {
  const cumulativeNet = roundMoney(p.approvedNets.reduce((a, b) => a + b, 0) + (p.proposedNet ?? 0));
  const pct = p.originalValue > 0 ? cumulativeNet / p.originalValue : 0;
  const newContractTotal = roundMoney(p.originalValue + cumulativeNet);
  const target = roundMoney(newContractTotal / 3);
  return {
    cumulativeNet,
    pct,
    triggered: pct > DEPOSIT_REVIEW_PCT,
    newContractTotal,
    target,
    collected: p.collected,
    due: roundMoney(Math.max(0, target - p.collected)),
  };
}

/* ------------------------------ Working days ------------------------- */

function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isWorkingDay(d: Date): boolean {
  const day = d.getDay();
  return day >= 1 && day <= 5 && !isHoliday(localDay(d));
}

/** The local calendar day `n` working days after `iso` (weekends and holidays skipped). */
export function addWorkingDays(iso: string, n: number): string {
  const d = new Date(iso);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    if (isWorkingDay(d)) added++;
  }
  return localDay(d);
}

/** Working days from today (exclusive) up to and including `dueDay`. */
export function workingDaysUntil(nowIso: string, dueDay: string): number {
  const d = new Date(nowIso);
  let count = 0;
  for (let i = 0; i < 60; i++) {
    d.setDate(d.getDate() + 1);
    if (localDay(d) > dueDay) break;
    if (isWorkingDay(d)) count++;
  }
  return count;
}

/* ------------------------------ Emergency ---------------------------- */

/** Only work strictly below $500 may start on verbal approval. */
export function emergencyEligible(amount: number): boolean {
  return amount < EMERGENCY_LIMIT;
}

export interface EmergencyEvidence {
  photos: number;
  findings: string;
  authoriser?: string;
  customerMessageRef: string;
  verbalAt?: string;
}

/** Same-day evidence that must all be present (24.3). Returns the missing items. */
export function missingEmergencyEvidence(e: EmergencyEvidence, nowIso: string): string[] {
  const missing: string[] = [];
  if (!e.photos || e.photos < 1) missing.push("photographs");
  if (!e.findings.trim()) missing.push("findings");
  if (!e.authoriser) missing.push("authoriser");
  if (!e.customerMessageRef.trim()) missing.push("customer text or email");
  if (e.verbalAt && isoLocal(e.verbalAt) !== isoLocal(nowIso)) missing.push("same-day capture (the verbal authorisation must be today)");
  return missing;
}

function isoLocal(iso: string) {
  return localDay(new Date(iso));
}

export type WrittenState = "confirmed" | "awaiting" | "overdue";

/**
 * Written confirmation is due within two working days of the verbal
 * authorisation. On day three it is overdue: owner escalated, work stops,
 * the office manager phones the customer (24.Q03).
 */
export function writtenConfirmationStatus(verbalAt: string, confirmedAt: string | undefined, nowIso: string) {
  const dueDay = addWorkingDays(verbalAt, WRITTEN_CONFIRMATION_WORKING_DAYS);
  if (confirmedAt) return { dueDay, state: "confirmed" as WrittenState, workingDaysLeft: 0 };
  const today = isoLocal(nowIso);
  if (today > dueDay) return { dueDay, state: "overdue" as WrittenState, workingDaysLeft: 0 };
  return { dueDay, state: "awaiting" as WrittenState, workingDaysLeft: workingDaysUntil(nowIso, dueDay) };
}

/* ---------------------------- Approval links ------------------------- */

export function linkExpiry(sentAt: string): string {
  return addDays(sentAt, LINK_EXPIRY_DAYS);
}

export type LinkState = "active" | "expired" | "superseded" | "signer_changed" | "undeliverable" | "used";

export interface LinkLike {
  version: number;
  sentAt: string;
  expiresAt: string;
  supersededAt?: string;
  signerChanged?: boolean;
  delivery?: "delivered" | "undeliverable";
}

/** What happens when someone opens this link now. */
export function linkState(link: LinkLike, currentVersion: number, nowIso: string, decided = false): LinkState {
  if (link.supersededAt || link.version !== currentVersion) return "superseded";
  if (decided) return "used";
  if (link.signerChanged) return "signer_changed";
  if (new Date(nowIso).getTime() >= new Date(link.expiresAt).getTime()) return "expired";
  if (link.delivery === "undeliverable") return "undeliverable";
  return "active";
}

/** Undeliverable: flagged to the office the same day, owner after two working days. */
export function undeliverableStatus(failedAt: string, nowIso: string) {
  const escalateAfter = addWorkingDays(failedAt, UNDELIVERABLE_ESCALATION_WORKING_DAYS);
  return { flagged: true, escalateAfter, escalate: isoLocal(nowIso) > escalateAfter };
}

/* ------------------------------ Dependency --------------------------- */

/** A child cannot be submitted, sent or approved until its parent is resolved. */
export function dependencyBlock(parent?: { id: string; status: string }): string | null {
  if (!parent) return null;
  if (parent.status === "approved" || parent.status === "disputed" || parent.status === "rejected") return null;
  return `Parent change order ${parent.id} is still pending. Resolve ${parent.id} first.`;
}

/* -------------------------------- Billing ---------------------------- */

export type BillingMode = "draft_update" | "supplemental" | "credit_note" | "account_credit" | "none";

/**
 * Draft invoices are updated in place. Additions to sent invoices use a
 * supplemental invoice. Negative changes to sent unpaid invoices use a credit
 * note. Negative changes against paid amounts default to account credit.
 */
export function billingMode(net: number, invoiceStatus?: "draft" | "sent" | "partial" | "paid" | "void"): BillingMode {
  if (net === 0) return "none";
  if (invoiceStatus === "draft") return "draft_update";
  if (net > 0) return "supplemental";
  if (invoiceStatus === "sent") return "credit_note";
  if (invoiceStatus === "paid") return "account_credit";
  return "none";
}

export const BILLING_LABEL: Record<BillingMode, string> = {
  draft_update: "Draft invoice updated in place",
  supplemental: "Supplemental invoice",
  credit_note: "Credit note",
  account_credit: "Account credit (refund on request within 14 days)",
  none: "No billing change",
};

/** The refund window closes 14 days after the credit is raised (24.Q03). */
export function refundWindowCloses(creditRaisedAt: string): string {
  return isoDay(addDays(creditRaisedAt, REFUND_WINDOW_DAYS));
}

export function refundAllowed(creditRaisedAt: string, requestIso: string): boolean {
  return isoDay(requestIso) <= refundWindowCloses(creditRaisedAt);
}

/* ------------------------------ Downstream --------------------------- */

/** Only an action currently in a failed state may be retried. */
export function retryable(state: string): boolean {
  return state === "failed";
}

/** Only the missing (failed) actions are retried, never the succeeded ones. */
export function actionsToRetry<K extends string>(states: Record<K, string>): K[] {
  return (Object.keys(states) as K[]).filter((k) => retryable(states[k]));
}

/* ------------------------------- Numbering --------------------------- */

/** CO-2026-1-03: job number + 2-digit sequence. Uses the highest used number. */
export function nextDocNumber(prefix: "CO" | "CRA", jobId: string, existingIds: string[]): string {
  const jobNo = jobId.replace(/^JOB-/, "");
  const stem = `${prefix}-${jobNo}-`;
  const used = existingIds.filter((id) => id.startsWith(stem)).map((id) => Number(id.slice(stem.length)) || 0);
  // Colour Re-approvals are numbered separately and never consume a CO number.
  const n = Math.max(0, ...used) + 1;
  return `${stem}${String(n).padStart(2, "0")}`;
}
