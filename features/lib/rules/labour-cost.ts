/**
 * Cross-Feature Rule 3 — The actual wage cost source.
 *
 * Estimate Master holds no pay rates and calculates no pay. After each Gusto
 * run the bookkeeper enters one approved labour cost total per employee per
 * pay period, plus the burden percentage. Estimate Master allocates that
 * total across jobs in proportion to the approved hours it already holds.
 * Allocated cost for a period must equal the entered total exactly.
 */
import type { LabourCostTotal } from "@/features/types";
import { allocateMoney } from "./allocation";
import { roundMoney } from "./rounding";

/** The owner-set burden applies to paid wages including overtime, at the same percentage. */
export function burdenedTotal(amount: number, burdenPct: number): number {
  return roundMoney(amount * (1 + burdenPct / 100));
}

/** Allocate by approved minutes. Overhead minutes (no job) take their share as overhead. */
export function allocateLabourCost(amount: number, burdenPct: number, approved: { jobId?: string; minutes: number }[]) {
  const total = burdenedTotal(amount, burdenPct);
  const split = allocateMoney(total, approved.map((a) => ({ jobId: a.jobId, weight: a.minutes })));
  return {
    total,
    rows: split.rows.map((r, i) => ({ jobId: r.jobId, minutes: approved[i].minutes, amount: r.amount })),
    residual: split.residual,
    receiver: split.receiver,
  };
}

/** Sum of allocations against the burdened totals entered, per period. */
export function reconcileLabour(totals: LabourCostTotal[]) {
  const entered = roundMoney(totals.reduce((a, t) => a + burdenedTotal(t.amount, t.burdenPct), 0));
  const allocated = roundMoney(totals.reduce((a, t) => a + t.allocations.reduce((x, r) => x + r.amount, 0), 0));
  const unallocated = totals.filter((t) => t.allocations.length === 0).map((t) => t.employeeId);
  return { entered, allocated, ok: Math.abs(entered - allocated) < 0.005 && unallocated.length === 0, unallocated };
}

/** Allocated job cost for one job, summed across employees and periods. Safe for any role to see. */
export function jobLabourCost(totals: LabourCostTotal[], jobId: string): number {
  return roundMoney(totals.reduce((a, t) => a + t.allocations.filter((r) => r.jobId === jobId).reduce((x, r) => x + r.amount, 0), 0));
}
