/**
 * Feature 30 seed: rate records for combinations A–F (see seed-performance),
 * one exclusion by the estimating manager, and the earlier decisions.
 *
 * - A  productivity suggested (about +20%, shown prominently); coverage within tolerance.
 * - B  coverage 330 against 350 (−5.7%).
 * - C  Insufficient evidence (7 of 8).
 * - D  productivity rejected 45 days ago, 2 new jobs since (still suppressed);
 *      coverage suggestions not enabled.
 * - E  productivity approved 95 days ago: day-90 review due.
 * - F  productivity approved 125 days ago: review overdue, escalates when the
 *      daily check runs; no coverage rate on file (deviation Not applicable).
 */
import type { CompletedJobRecord, EvidenceExclusion, RateDecision, RateRecord } from "@/features/types";
import { addDays } from "@/features/lib/rules/dates";
import { comboKey, eligibility, pooledProductivity } from "@/features/lib/rules/feedback";
import { COMBOS } from "./seed-performance";

export function feedbackSeed(history: CompletedJobRecord[], nowIso: string) {
  const d = (days: number) => addDays(nowIso, days);
  const keyOf = (i: number) => comboKey({ ...COMBOS[i].base });
  const initial = (value: number) => ({ version: 1, value, by: "U-OWNER", at: d(-900), reason: "Launch rate from the estimating templates.", kind: "initial" as const });
  const eligibleBefore = (key: string, at: string) => history.filter((j) => j.completedAt < at && eligibility(j, key, nowIso).eligible);

  const rateRecords: RateRecord[] = [];
  const rateDecisions: RateDecision[] = [];
  COMBOS.forEach((c, i) => {
    const key = keyOf(i);
    rateRecords.push({ id: `RATE-P-${c.key}`, comboKey: key, kind: "productivity", value: c.estProd, versions: [initial(c.estProd)] });
    rateRecords.push({
      id: `RATE-C-${c.key}`, comboKey: key, kind: "coverage", value: c.key === "F" ? 0 : c.estCov, enabled: c.key === "D" ? false : undefined,
      versions: c.key === "F" ? [] : [initial(c.estCov)],
    });
  });

  // E and F: approved changes, the evidence frozen at the approval date.
  const approve = (combo: "E" | "F", daysAgo: number, id: string) => {
    const i = COMBOS.findIndex((c) => c.key === combo);
    const rate = rateRecords.find((r) => r.id === `RATE-P-${combo}`)!;
    const at = d(-daysAgo);
    const pool = eligibleBefore(keyOf(i), at);
    const next = Math.round(pooledProductivity(pool.map((j) => j.combinations[0])).pooled * 10) / 10;
    const reason = `Approved from ${pool.length} eligible jobs.`;
    rate.versions.push({ version: 2, value: next, previous: rate.value, by: "U-OWNER", at, reason, kind: "approval" });
    rateDecisions.push({ id, rateId: rate.id, decision: "approved", by: "U-OWNER", at, reason, observed: next, current: rate.value, eligibleJobIds: pool.map((j) => j.id), draftsFlagged: [] });
    rate.value = next;
  };
  approve("E", 95, "RDC-1");
  approve("F", 125, "RDC-2");

  // D: rejected 45 days ago; two eligible jobs have completed since.
  const dIdx = COMBOS.findIndex((c) => c.key === "D");
  const rejectedAt = d(-45);
  const dPool = eligibleBefore(keyOf(dIdx), rejectedAt);
  rateDecisions.push({
    id: "RDC-3", rateId: "RATE-P-D", decision: "rejected", by: "U-OWNER", at: rejectedAt, reason: "Most of these ceilings were empty new-build rooms. Wait for occupied-home evidence.",
    observed: Math.round(pooledProductivity(dPool.map((j) => j.combinations[0])).pooled * 10) / 10, current: COMBOS[dIdx].estProd, eligibleJobIds: dPool.map((j) => j.id), suppressedUntil: addDays(rejectedAt, 90),
  });

  const rework = history.find((j) => j.name.includes("(heavy rework)"))!;
  const evidenceExclusions: EvidenceExclusion[] = [
    { id: "EXC-1", comboKey: keyOf(0), jobId: rework.id, reason: "Heavy rework after a primer failure — the application hours are not representative.", by: "U-SENIOR", at: d(-150) },
  ];

  return { rateRecords, rateDecisions, evidenceExclusions, counters: { rdc: 3, exc: 1 } };
}
