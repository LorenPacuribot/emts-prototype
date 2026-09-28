/**
 * Feature 30 — Estimating Performance Feedback.
 *
 * Conservative rate suggestions from comparable, verified evidence: labour
 * production and coating coverage only — never markup or selling price.
 * Every rate change needs the business owner's approval of that one record.
 */
import type { CompletedJobRecord, EvidenceCombo } from "@/features/types";
import { addDays, addMonths } from "./dates";
import { roundMoney } from "./rounding";

export const MIN_JOBS = 8;
export const MIN_SQFT = 400;
export const MAX_AGE_MONTHS = 18;
export const FLAG_PCT = 0.15;
export const PROMINENT_PCT = 0.2;
export const SUPPRESS_DAYS = 90;
export const REOPEN_NEW_JOBS = 3;
export const REVIEW_DAY = 90;
export const ESCALATE_DAY = 120;
export const PREVIEW_JOBS = 10;
/** Prototype constants for the impact preview (held fixed). */
export const PREVIEW_WAGE_PER_HOUR = 37;
export const PREVIEW_PRICE_PER_GAL = 58;
export const PREVIEW_MARKUP = 0.45;

export function comboKey(c: Pick<EvidenceCombo, "surfaceType" | "exterior" | "tier" | "method" | "condition">): string {
  return `${c.surfaceType}|${c.exterior ? "exterior" : "interior"}|${c.tier}|${c.method}|${c.condition}`;
}

export function comboLabel(key: string): string {
  const [s, e, t, m, c] = key.split("|");
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  return [cap(s), cap(e), cap(t), cap(m), cap(c)].join(" · ");
}

export interface Eligibility {
  eligible: boolean;
  /** The specific check a job failed. */
  reason?: string;
}

/**
 * Launch eligibility: a verified whole job with one surface and product
 * combination, at least 400 measured square feet, completed within the last
 * 18 months, with no zero or missing values. Mixed jobs stay ineligible —
 * no allocation is ever invented to make them eligible.
 */
export function eligibility(job: CompletedJobRecord, key: string, nowIso: string): Eligibility {
  if (!job.verified) return { eligible: false, reason: "Whole-job actuals not verified" };
  if (job.combinations.length !== 1) return { eligible: false, reason: `Mixed job (${job.combinations.length} surface and product combinations) — no allocation is invented` };
  const c = job.combinations[0];
  if (comboKey(c) !== key) return { eligible: false, reason: "Different combination" };
  if (c.measuredSqft < MIN_SQFT) return { eligible: false, reason: `${c.measuredSqft} sq ft — below the 400 sq ft minimum` };
  if (job.completedAt < addMonths(nowIso, -MAX_AGE_MONTHS)) return { eligible: false, reason: "Completed more than 18 months ago" };
  if (!(c.applicationHours > 0) || !(c.consumedGal > 0) || !(c.coats > 0)) return { eligible: false, reason: "Zero or missing hours, usage or coats" };
  return { eligible: true };
}

/** Productivity pools measured area and application hours. Prep, travel, setup and rework are excluded. */
export function pooledProductivity(combos: Pick<EvidenceCombo, "measuredSqft" | "applicationHours">[]) {
  const sqft = combos.reduce((a, c) => a + c.measuredSqft, 0);
  const hours = combos.reduce((a, c) => a + c.applicationHours, 0);
  const perJob = combos.filter((c) => c.applicationHours > 0).map((c) => c.measuredSqft / c.applicationHours).sort((a, b) => a - b);
  const mid = Math.floor(perJob.length / 2);
  const median = perJob.length ? (perJob.length % 2 ? perJob[mid] : (perJob[mid - 1] + perJob[mid]) / 2) : 0;
  return { sqft, hours, pooled: hours > 0 ? sqft / hours : 0, median };
}

/** Each job's consumed gallons (spills included) divided by one plus its own waste allowance. Never averaged. */
export function wasteAdjustedGal(c: Pick<EvidenceCombo, "consumedGal" | "wasteAllowance">): number {
  return c.consumedGal / (1 + c.wasteAllowance);
}

/** Proposed coverage = total coat-adjusted area ÷ sum of per-job waste-adjusted gallons (30.Q01). */
export function pooledCoverage(combos: Pick<EvidenceCombo, "measuredSqft" | "coats" | "consumedGal" | "wasteAllowance">[]) {
  const coatSqft = combos.reduce((a, c) => a + c.measuredSqft * c.coats, 0);
  const gal = combos.reduce((a, c) => a + wasteAdjustedGal(c), 0);
  return { coatSqft, wasteAdjustedGal: gal, pooled: gal > 0 ? coatSqft / gal : 0 };
}

/** Deviation = (observed − current) ÷ current. Not applicable (null) when current is zero or missing. */
export function deviation(observed: number, current?: number): number | null {
  if (!current) return null;
  return (observed - current) / current;
}

export type FlagState = "none" | "flagged" | "prominent";

/** Strictly above 15 percent is flagged; strictly above 20 percent shows the evidence prominently. */
export function flagState(dev: number | null): FlagState {
  if (dev === null) return "none";
  const a = Math.abs(dev);
  if (a > PROMINENT_PCT + 1e-12) return "prominent";
  if (a > FLAG_PCT + 1e-12) return "flagged";
  return "none";
}

/**
 * A rejection suppresses the suggestion for 90 days. The estimating manager
 * may reopen early once at least three new eligible jobs have completed.
 */
export function suppression(rejectedAt: string, nowIso: string, newEligibleSince: number, reopened: boolean) {
  const until = addDays(rejectedAt, SUPPRESS_DAYS);
  const active = !reopened && nowIso < until;
  return { active, until, canReopen: active && newEligibleSince >= REOPEN_NEW_JOBS };
}

/** Day-90 review by the estimating manager; overdue at day 120 escalates to the owner. */
export function reviewState(approvedAt: string, nowIso: string, reviewed: boolean) {
  const days = Math.floor((new Date(nowIso).getTime() - new Date(approvedAt).getTime()) / 86_400_000);
  if (reviewed) return { days, state: "reviewed" as const };
  if (days >= ESCALATE_DAY) return { days, state: "escalated" as const };
  if (days >= REVIEW_DAY) return { days, state: "due" as const };
  return { days, state: "not_due" as const };
}

export interface PreviewRow {
  jobId: string;
  sellPrice: number;
  before: number;
  after: number;
  labourBefore: number;
  labourAfter: number;
  materialBefore: number;
  materialAfter: number;
}

/**
 * Impact preview on the last ten eligible jobs (or all eight or nine). Scope,
 * measurements, historical selling price, markup and material unit prices are
 * held fixed. Only the rate under review moves: labour for productivity,
 * material quantity (and the cost that follows) for coverage. Never both.
 */
export function impactPreview(jobs: { jobId: string; completedAt: string; combo: EvidenceCombo }[], kind: "productivity" | "coverage", current: number, proposed: number) {
  const sample = [...jobs].sort((a, b) => b.completedAt.localeCompare(a.completedAt)).slice(0, PREVIEW_JOBS);
  const rows: PreviewRow[] = sample.map(({ jobId, combo }) => {
    const labour = (rate: number) => roundMoney((combo.measuredSqft / rate) * PREVIEW_WAGE_PER_HOUR);
    const material = (rate: number) => roundMoney(((combo.measuredSqft * combo.coats * (1 + combo.wasteAllowance)) / rate) * PREVIEW_PRICE_PER_GAL);
    const labourBefore = kind === "productivity" ? labour(current) : labour(combo.measuredSqft / Math.max(combo.applicationHours, 0.1));
    const materialBefore = kind === "coverage" ? material(current) : roundMoney(combo.consumedGal * PREVIEW_PRICE_PER_GAL);
    const labourAfter = kind === "productivity" ? labour(proposed) : labourBefore;
    const materialAfter = kind === "coverage" ? material(proposed) : materialBefore;
    const sellPrice = roundMoney((labourBefore + materialBefore) * (1 + PREVIEW_MARKUP));
    return { jobId, sellPrice, before: roundMoney(labourBefore + materialBefore), after: roundMoney(labourAfter + materialAfter), labourBefore, labourAfter, materialBefore, materialAfter };
  });
  return { rows, count: rows.length, variable: kind === "productivity" ? ("Labour" as const) : ("MaterialQuantity" as const) };
}
