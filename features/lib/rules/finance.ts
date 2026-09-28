/**
 * Feature 33 — Financial And Accounting Management.
 *
 * Pure rules for the QuickBooks exchange window, posting periods, margins,
 * receivables ageing, bill matching, approvals and job allocation (Rule 5).
 * QuickBooks owns the ledger; Estimate Master owns the job. Nothing here
 * moves money.
 */
import type { Role } from "@/features/types";
import { roundMoney } from "./rounding";
import { allocateMoney, type WeightedBucket } from "./allocation";

/** The hourly exchange runs from 6:00 a.m. to 6:00 p.m. local time, Monday to Saturday (33.Q02). */
export const EXCHANGE_FIRST_HOUR = 6;
export const EXCHANGE_LAST_HOUR = 18;
/** External payments above this need the owner's approval captured first. */
export const OWNER_PAYMENT_THRESHOLD = 2500;
/** A record that fails twice escalates to the bookkeeper. */
export const EXCHANGE_ESCALATE_AFTER = 2;

function isExchangeDay(d: Date) {
  return d.getDay() >= 1 && d.getDay() <= 6;
}

/** True when an exchange run happens at this top of the hour. */
export function isExchangeRunTime(d: Date): boolean {
  return isExchangeDay(d) && d.getMinutes() === 0 && d.getHours() >= EXCHANGE_FIRST_HOUR && d.getHours() <= EXCHANGE_LAST_HOUR;
}

/** Is the exchange running now (between the first and last run of the day)? */
export function inExchangeWindow(d: Date): boolean {
  const h = d.getHours() + d.getMinutes() / 60;
  return isExchangeDay(d) && h >= EXCHANGE_FIRST_HOUR && h <= EXCHANGE_LAST_HOUR;
}

/** The next hourly run at or after `from`. A record queued at 7 p.m. goes on the next morning's 6 a.m. run. */
export function nextExchangeRun(from: Date): Date {
  const d = new Date(from);
  if (d.getMinutes() > 0 || d.getSeconds() > 0 || d.getMilliseconds() > 0) {
    d.setHours(d.getHours() + 1, 0, 0, 0);
  }
  for (let i = 0; i < 24 * 8; i++) {
    if (isExchangeRunTime(d)) return d;
    d.setHours(d.getHours() + 1, 0, 0, 0);
  }
  return d;
}

/** The most recent run at or before `at`, if any in the last week. */
export function lastExchangeRun(at: Date): Date | undefined {
  const d = new Date(at);
  d.setMinutes(0, 0, 0);
  for (let i = 0; i < 24 * 8; i++) {
    if (isExchangeRunTime(d)) return d;
    d.setHours(d.getHours() - 1);
  }
  return undefined;
}

export function shouldEscalate(failures: number): boolean {
  return failures >= EXCHANGE_ESCALATE_AFTER;
}

/* ------------------------------ Periods ------------------------------ */

export function periodOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function nextPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** A correction for a closed period posts to the next open period. */
export function postingPeriod(dateIso: string, closed: string[]): { period: string; movedFrom?: string } {
  let p = periodOf(dateIso);
  const original = p;
  while (closed.includes(p)) p = nextPeriod(p);
  return p === original ? { period: p } : { period: p, movedFrom: original };
}

/* ------------------------------- Margin ------------------------------ */

/**
 * 33.Q01. Actual margin = (invoiced revenue ex tax − job cost to date) / invoiced revenue ex tax.
 * Zero or credit-only revenue shows Not applicable (null); the cost is still shown.
 */
export function actualMargin(invoicedExTax: number, costToDate: number): number | null {
  if (!(invoicedExTax > 0)) return null;
  return (invoicedExTax - costToDate) / invoicedExTax;
}

/** Projected margin, for jobs in progress = (contract ex tax − forecast job cost) / contract ex tax. */
export function projectedMargin(contractExTax: number, forecastCost: number): number | null {
  if (!(contractExTax > 0)) return null;
  return (contractExTax - forecastCost) / contractExTax;
}

/* ----------------------------- Receivables --------------------------- */

export type AgeBucket = "0–30" | "31–60" | "61–90" | "90+";

/** Receivables age from the invoice date, never from the due date. */
export function ageFromInvoiceDate(invoiceDateIso: string, asOfIso: string): { days: number; bucket: AgeBucket } {
  const a = new Date(invoiceDateIso);
  const b = new Date(asOfIso);
  const days = Math.floor((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000);
  const bucket: AgeBucket = days <= 30 ? "0–30" : days <= 60 ? "31–60" : days <= 90 ? "61–90" : "90+";
  return { days, bucket };
}

/* ---------------------------- Bill matching -------------------------- */

export interface BillLine {
  billedGal: number;
  unitCost: number;
  receivedGal: number;
  returnedGal?: number;
}

/**
 * A supplier bill is matched to its purchase order and received quantities.
 * Anything billed beyond what was received (net of returns) is flagged, never absorbed.
 */
export function matchBill(lines: BillLine[]): { unmatchedGal: number; unmatchedValue: number; matched: boolean } {
  let gal = 0;
  let value = 0;
  for (const l of lines) {
    const over = l.billedGal - Math.max(0, l.receivedGal - (l.returnedGal ?? 0));
    if (over > 1e-9) {
      gal += over;
      value += over * l.unitCost;
    }
  }
  return { unmatchedGal: Math.round(gal * 1000) / 1000, unmatchedValue: roundMoney(value), matched: gal <= 1e-9 };
}

/* ----------------------------- Approvals ----------------------------- */

export function paymentNeedsOwner(amount: number): boolean {
  return amount > OWNER_PAYMENT_THRESHOLD;
}

export type ReimbursementStep = "crew_lead" | "office" | "owner";

/**
 * Every claim needs a receipt photograph. Crew claims: crew lead approves,
 * office reviews. Office staff claims need the owner at any value, and the
 * owner reviews the office manager's own claim.
 */
export function reimbursementSteps(claimant: { type: "hourly" | "salaried" | "subcontractor"; role?: Role }): ReimbursementStep[] {
  if (claimant.role === "office_manager" || claimant.role === "bookkeeper") return ["owner"];
  if (claimant.role === "owner") return ["office"];
  if (claimant.type === "hourly") return ["crew_lead", "office"];
  return ["office"];
}

/** A claim that repeats an expense already charged to the job (same amount, merchant word, within 14 days). */
export function isDuplicateExpense(claim: { amount: number; merchant: string; date: string }, expense: { amount: number; party: string; date: string }): boolean {
  const sameAmount = Math.abs(claim.amount - expense.amount) < 0.005;
  const word = claim.merchant.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const sameMerchant = word.some((w) => expense.party.toLowerCase().includes(w));
  const days = Math.abs(new Date(claim.date).getTime() - new Date(expense.date).getTime()) / 86_400_000;
  return sameAmount && sameMerchant && days <= 14;
}

/* ----------------------------- Allocation ---------------------------- */

/**
 * Split a source amount across jobs. Rows always sum to the source; the
 * residual cent goes to the largest allocation, then the lowest job number
 * (Rule 5). Overhead stays overhead.
 */
export function allocateSource(amount: number, weights: WeightedBucket[]) {
  return allocateMoney(amount, weights);
}

/** Rows must sum exactly to the source amount before an allocation can be saved. */
export function allocationDifference(amount: number, rows: { amount: number }[]): number {
  return roundMoney(amount - rows.reduce((a, r) => a + r.amount, 0));
}
