/**
 * Feature 21 — Estimated Versus Actual Performance.
 *
 * Variance language and highlighting, baseline reconciliation, paint usage,
 * correction approvals and reporting periods. Actual wage cost comes from
 * Rule 3; nothing here calculates pay.
 */
import type { ReasonCode } from "@/features/types";
import { roundMoney } from "./rounding";

/** Highlight when absolute variance is strictly above 10 percent, or strictly above $500 on the job total. */
export const HIGHLIGHT_PCT = 0.1;
export const HIGHLIGHT_ABS = 500;

export const REASON_CODES: ReasonCode[] = ["Weather", "Hidden damage or rot", "Rework", "Customer change", "Training or new crew"];

/** Blended cost per labour hour used to turn change-order cost into hours (prototype assumption). */
export const BLENDED_COST_PER_HOUR = 37;
/** Share of a change order's cost that is labour (prototype assumption; the rest is material). */
export const CO_LABOUR_SHARE = 0.7;

export interface Variance {
  amount: number;
  /** Null when the estimate is zero: percentage shows Not applicable. */
  pct: number | null;
  label: "Over budget" | "Under budget" | "On budget";
  highlight: "over" | "under" | null;
}

/**
 * Variance = actual − selected estimate. Positive is Over budget, negative
 * Under budget — always in words. Exactly 10 percent, or exactly $500 with no
 * percentage breach, does not highlight. The $500 test applies to money only.
 */
export function variance(actual: number, estimate: number, measure: "cost" | "hours" = "cost"): Variance {
  const amount = measure === "cost" ? roundMoney(actual - estimate) : Math.round((actual - estimate) * 100) / 100;
  const pct = estimate === 0 ? null : (actual - estimate) / estimate;
  const label = amount > 0 ? "Over budget" : amount < 0 ? "Under budget" : "On budget";
  const pctBreach = pct !== null && Math.abs(pct) > HIGHLIGHT_PCT + 1e-12;
  const absBreach = measure === "cost" && Math.abs(amount) > HIGHLIGHT_ABS + 1e-9;
  const highlight = amount === 0 || !(pctBreach || absBreach) ? null : amount > 0 ? "over" : "under";
  return { amount, pct, label, highlight };
}

/** Original approved plus approved change contribution must equal revised approved. */
export function reconciles(original: number, change: number, revised: number): boolean {
  return Math.abs(roundMoney(original + change) - roundMoney(revised)) < 0.005;
}

/** Actual paint = issued less sealed, usable returns. Spills and waste stay inside usage. */
export function actualPaintGal(issuedGal: number, sealedUsableReturnedGal: number): number {
  return Math.max(0, issuedGal - sealedUsableReturnedGal);
}

/**
 * After job completion, an actual correction needs the office manager and
 * the owner. After payroll, a labour correction needs the owner.
 */
export function correctionApprovers(opts: { jobCompleted: boolean; afterPayroll: boolean; labour: boolean }): ("office_manager" | "owner")[] {
  if (opts.jobCompleted) return ["office_manager", "owner"];
  if (opts.afterPayroll && opts.labour) return ["owner"];
  return [];
}

export type PeriodPreset = "this_month" | "last_month" | "last_30" | "last_90" | "this_year" | "custom";

export const PRESET_LABEL: Record<PeriodPreset, string> = {
  this_month: "This month", last_month: "Last month", last_30: "Last 30 days", last_90: "Last 90 days", this_year: "This year", custom: "Custom",
};

function day(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Work-date period for a preset, as local YYYY-MM-DD bounds (inclusive). */
export function presetRange(preset: PeriodPreset, nowIso: string): { from: string; to: string } {
  const n = new Date(nowIso);
  const to = day(n);
  switch (preset) {
    case "this_month": return { from: day(new Date(n.getFullYear(), n.getMonth(), 1)), to };
    case "last_month": return { from: day(new Date(n.getFullYear(), n.getMonth() - 1, 1)), to: day(new Date(n.getFullYear(), n.getMonth(), 0)) };
    case "last_30": return { from: day(new Date(n.getFullYear(), n.getMonth(), n.getDate() - 29)), to };
    case "last_90": return { from: day(new Date(n.getFullYear(), n.getMonth(), n.getDate() - 89)), to };
    case "this_year": return { from: day(new Date(n.getFullYear(), 0, 1)), to };
    default: return { from: to, to };
  }
}

export function validRange(from: string, to: string): boolean {
  return !!from && !!to && from <= to;
}

/** Snapshots older than this are archived (retrievable within one working day). */
export const ARCHIVE_AFTER_DAYS = 90;
