/**
 * Cross-Feature Rule 5 — Deterministic tie-breaking.
 *
 * - A rounding residual or allocation remainder that must go to one job, where
 *   two jobs tie, goes to the lowest job number (feature 22 time rounding,
 *   feature 33 financial allocation).
 * - A residual assigned by size goes to the largest allocation first, then to
 *   the lowest job number if those tie.
 *
 * Amounts here are integers (minutes or cents) so a split always sums exactly.
 */

/** Numeric parts of a job ID: "JOB-2026-12" → [2026, 12]. */
export function jobNumberParts(jobId: string): number[] {
  return (jobId.match(/\d+/g) ?? []).map(Number);
}

/** Ascending by job number, numerically: JOB-2026-2 before JOB-2026-10. */
export function compareJobNumber(a: string, b: string): number {
  const x = jobNumberParts(a);
  const y = jobNumberParts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d !== 0) return d;
  }
  return a.localeCompare(b);
}

export interface WeightedBucket {
  /** Undefined for overhead. */
  jobId?: string;
  /** Recorded minutes, or cents of the pre-residual share. */
  weight: number;
}

/**
 * Index of the bucket that receives a residual: largest weight, then lowest
 * job number. Overhead only receives it when no job bucket has any weight.
 */
export function residualReceiver(buckets: WeightedBucket[]): number {
  const candidates = buckets.map((b, i) => ({ ...b, i })).filter((b) => b.jobId && b.weight > 0);
  const pool = candidates.length ? candidates : buckets.map((b, i) => ({ ...b, i })).filter((b) => b.weight > 0);
  if (!pool.length) return -1;
  pool.sort((a, b) => b.weight - a.weight || (a.jobId && b.jobId ? compareJobNumber(a.jobId, b.jobId) : a.jobId ? -1 : 1));
  return pool[0].i;
}

export interface Allocated {
  jobId?: string;
  weight: number;
  amount: number;
}

/**
 * Split an integer total across buckets in proportion to their weights.
 * Each share is floored; the whole residual goes to one receiver (Rule 5),
 * so the rows always sum exactly to the total.
 */
export function allocateInteger(total: number, buckets: WeightedBucket[]): { rows: Allocated[]; residual: number; receiver?: string; rule?: "largest_allocation" | "lowest_job_number" } {
  const sum = buckets.reduce((a, b) => a + b.weight, 0);
  if (sum <= 0 || total === 0) return { rows: buckets.map((b) => ({ ...b, amount: 0 })), residual: 0 };
  const rows = buckets.map((b) => ({ ...b, amount: Math.floor((total * b.weight) / sum) }));
  const residual = total - rows.reduce((a, r) => a + r.amount, 0);
  if (residual === 0) return { rows, residual };
  const idx = residualReceiver(buckets);
  rows[idx].amount += residual;
  const top = buckets[idx];
  const tied = buckets.filter((b) => b !== top && b.jobId && b.weight === top.weight).length > 0;
  return { rows, residual, receiver: top.jobId, rule: tied ? "lowest_job_number" : "largest_allocation" };
}

/** Money version: splits dollars to the cent (half-up inputs, exact sum). */
export function allocateMoney(total: number, buckets: WeightedBucket[]) {
  const cents = Math.round(total * 100);
  const r = allocateInteger(cents, buckets);
  return { ...r, residual: r.residual / 100, rows: r.rows.map((x) => ({ ...x, amount: x.amount / 100 })) };
}
