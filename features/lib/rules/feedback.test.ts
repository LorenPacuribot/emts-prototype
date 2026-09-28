/**
 * Feature 30 — Estimating Performance Feedback. Each test names the
 * acceptance criterion it checks.
 */
import { describe, expect, it } from "vitest";
import type { CompletedJobRecord, EvidenceCombo, User } from "@/features/types";
import { createSeed } from "@/features/data/seed";
import { now } from "@/features/lib/clock";
import {
  approveRate, excludeEvidence, feedbackPool, rejectRate, reopenSuggestion, restoreEvidence, reviewList, rollbackRate, runPreview, runReviewCheck, suggestionFor,
} from "@/features/lib/store/actions/feedback";
import { comboKey, deviation, eligibility, flagState, impactPreview, pooledCoverage, pooledProductivity, reviewState, suppression, wasteAdjustedGal } from "./feedback";

const NOW = "2026-09-25T12:00:00.000Z";
const combo = (x: Partial<EvidenceCombo> = {}): EvidenceCombo => ({
  surfaceType: "walls", exterior: false, tier: "standard", method: "roll", condition: "sound", product: "Cashmere", measuredSqft: 1000, coats: 2,
  applicationHours: 20, prepHours: 5, travelHours: 1, setupHours: 1, reworkHours: 1, consumedGal: 5.25, spillsGal: 0.1, wasteAllowance: 0.05, ...x,
});
const job = (c: EvidenceCombo[], x: Partial<CompletedJobRecord> = {}): CompletedJobRecord => ({
  id: "J", name: "", propertyLabel: "", startedAt: NOW, completedAt: "2026-06-01T12:00:00.000Z", kind: "interior", estimatorId: "U", crewLeadId: "U", verified: true,
  combinations: c, estimate: { labourHours: 0, labourCost: 0, material: 0, subcontractor: 0 }, changes: { labourHours: 0, labourCost: 0, material: 0, subcontractor: 0 }, ...x,
});
const KEY = comboKey(combo());

describe("Feature 30 — eligibility", () => {
  it("accepts exactly 400 sq ft and rejects 399", () => {
    expect(eligibility(job([combo({ measuredSqft: 400 })]), KEY, NOW).eligible).toBe(true);
    expect(eligibility(job([combo({ measuredSqft: 399 })]), KEY, NOW).eligible).toBe(false);
  });
  it("excludes a job completed 19 months ago", () => {
    expect(eligibility(job([combo()], { completedAt: "2025-02-20T12:00:00.000Z" }), KEY, NOW).reason).toMatch(/18 months/);
  });
  it("keeps a mixed job ineligible and invents no allocation", () => {
    const e = eligibility(job([combo(), combo({ surfaceType: "trim" })]), KEY, NOW);
    expect(e.eligible).toBe(false);
    expect(e.reason).toMatch(/Mixed job/);
  });
});

describe("Feature 30 — productivity", () => {
  it("1,000 sq ft and 20 application hours is 50 sq ft per hour", () => {
    expect(pooledProductivity([combo()]).pooled).toBe(50);
  });
  it("shows the median beside the pooled rate, and excludes prep, travel, setup and rework", () => {
    const p = pooledProductivity([combo({ measuredSqft: 1000, applicationHours: 10 }), combo({ measuredSqft: 1000, applicationHours: 20 }), combo({ measuredSqft: 3000, applicationHours: 20 })]);
    expect(p.pooled).toBeCloseTo(100, 10);
    expect(p.median).toBe(100);
  });
});

describe("Feature 30 — coverage (30.Q01)", () => {
  it("1,500 sq ft two coats, 10 gal at 10% waste: 3,000 coat sq ft, 9.0909 waste-adjusted gal, 330 per gallon", () => {
    const c = combo({ measuredSqft: 1500, coats: 2, consumedGal: 10, wasteAllowance: 0.1 });
    expect(wasteAdjustedGal(c)).toBeCloseTo(9.0909, 4);
    const p = pooledCoverage([c]);
    expect(p.coatSqft).toBe(3000);
    expect(p.pooled).toBeCloseTo(330, 6);
  });
  it("divides each job by its own waste allowance — never an averaged allowance", () => {
    const jobs = [combo({ consumedGal: 10, wasteAllowance: 0.05 }), combo({ consumedGal: 10, wasteAllowance: 0.1 }), combo({ consumedGal: 10, wasteAllowance: 0.15 })];
    const expected = 6000 / (10 / 1.05 + 10 / 1.1 + 10 / 1.15);
    expect(pooledCoverage(jobs).pooled).toBeCloseTo(expected, 8);
    expect(pooledCoverage(jobs).pooled).not.toBeCloseTo(6000 / (30 / 1.1), 3);
  });
});

describe("Feature 30 — deviation and flags", () => {
  it("(330 − 350) / 350 is −5.71 percent; zero current is Not applicable", () => {
    expect(deviation(330, 350)! * 100).toBeCloseTo(-5.714, 2);
    expect(deviation(330, 0)).toBeNull();
  });
  it("does not flag exactly 15 percent; flags 15.1; shows 20.5 prominently", () => {
    expect(flagState(0.15)).toBe("none");
    expect(flagState(0.151)).toBe("flagged");
    expect(flagState(0.205)).toBe("prominent");
  });
});

describe("Feature 30 — suppression and review (30.Q02)", () => {
  it("keeps a rejection suppressed at 45 days with two new jobs; three allow a reopen", () => {
    const rejected = "2026-08-11T12:00:00.000Z";
    expect(suppression(rejected, NOW, 2, false)).toMatchObject({ active: true, canReopen: false });
    expect(suppression(rejected, NOW, 3, false).canReopen).toBe(true);
  });
  it("puts the review on the list at day 90 and escalates it at day 120", () => {
    expect(reviewState("2026-06-26T12:00:00.000Z", NOW, false).state).toBe("due");
    expect(reviewState("2026-05-27T12:00:00.000Z", NOW, false).state).toBe("escalated");
    expect(reviewState("2026-05-27T12:00:00.000Z", NOW, true).state).toBe("reviewed");
  });
});

describe("Feature 30 — impact preview", () => {
  const jobs = Array.from({ length: 9 }, (_, i) => ({ jobId: `J${i}`, completedAt: `2026-0${(i % 8) + 1}-10T12:00:00.000Z`, combo: combo() }));
  it("uses all nine eligible jobs and discloses the count", () => {
    expect(impactPreview(jobs, "productivity", 50, 60).count).toBe(9);
  });
  it("a productivity change moves labour only; material is unchanged", () => {
    const p = impactPreview(jobs, "productivity", 50, 60);
    expect(p.rows.every((r) => r.materialAfter === r.materialBefore && r.labourAfter < r.labourBefore)).toBe(true);
  });
  it("a coverage change moves material quantity and cost only; labour is unchanged", () => {
    const p = impactPreview(jobs, "coverage", 400, 380);
    expect(p.rows.every((r) => r.labourAfter === r.labourBefore && r.materialAfter > r.materialBefore)).toBe(true);
    expect(p.variable).toBe("MaterialQuantity");
  });
});

describe("Feature 30 — seeded evidence and decisions", () => {
  const fresh = () => createSeed(now());
  const as = (db: ReturnType<typeof fresh>, id: string) => db.users.find((u) => u.id === id) as User;
  const rate = (db: ReturnType<typeof fresh>, id: string) => db.rateRecords.find((r) => r.id === id)!;

  it("shows Insufficient evidence for seven eligible jobs, and a suggestion for eight or more", () => {
    const db = fresh();
    const c = suggestionFor(db, rate(db, "RATE-P-C"));
    expect(c.status).toBe("insufficient");
    expect(c.pool.eligible).toHaveLength(7);
    expect(suggestionFor(db, rate(db, "RATE-P-A")).status).toBe("suggested");
  });

  it("lists every ineligible job with the check it failed, and the manager's exclusion", () => {
    const db = fresh();
    const a = feedbackPool(db, rate(db, "RATE-P-A").comboKey);
    expect(a.eligible).toHaveLength(11);
    expect(a.excluded).toHaveLength(1);
    expect(a.ineligible.map((p) => p.check.reason).join(" ")).toMatch(/399 sq ft.*18 months.*Mixed job.*not verified.*Zero/s);
  });

  it("flags combination A above 15 percent, and B's coverage sits near 330 against 350", () => {
    const db = fresh();
    expect(suggestionFor(db, rate(db, "RATE-P-A")).flag).not.toBe("none");
    const b = suggestionFor(db, rate(db, "RATE-C-B"));
    expect(b.observed).toBeGreaterThan(320);
    expect(b.observed).toBeLessThan(340);
  });

  it("an exclusion needs a reason, and exclude then restore both reach the log", () => {
    const db = fresh();
    const senior = as(db, "U-SENIOR");
    const key = rate(db, "RATE-P-B").comboKey;
    const job = feedbackPool(db, key).eligible[0].job.id;
    expect(excludeEvidence(db, senior, key, job, " ").ok).toBe(false);
    expect(excludeEvidence(db, senior, key, job, "Rained out mid-coat").ok).toBe(true);
    restoreEvidence(db, senior, db.evidenceExclusions[0].id);
    expect(db.activity.slice(0, 2).map((a) => a.message).join(" ")).toMatch(/restored.*excluded/s);
    expect(db.evidenceExclusions[0].restoredAt).toBeDefined();
  });

  it("a preview changes nothing", () => {
    const db = fresh();
    const before = JSON.stringify(db.rateRecords);
    expect(runPreview(db, as(db, "U-OWNER"), "RATE-P-A").ok).toBe(true);
    expect(JSON.stringify(db.rateRecords)).toBe(before);
  });

  it("only the owner approves; one record changes, drafts are flagged, sent estimates are untouched", () => {
    const db = fresh();
    expect(approveRate(db, as(db, "U-SENIOR"), "RATE-P-A", "").ok).toBe(false);
    const others = JSON.stringify(db.rateRecords.filter((r) => r.id !== "RATE-P-A"));
    const sent = JSON.stringify(db.estimates.find((e) => e.status === "SENT"));
    const r = approveRate(db, as(db, "U-OWNER"), "RATE-P-A", "");
    expect(r.ok && r.value?.drafts).toBe(db.estimates.filter((e) => e.status === "DRAFT").length);
    expect(JSON.stringify(db.rateRecords.filter((x) => x.id !== "RATE-P-A"))).toBe(others);
    expect(JSON.stringify(db.estimates.find((e) => e.status === "SENT"))).toBe(sent);
    const v = rate(db, "RATE-P-A").versions.at(-1)!;
    expect(v).toMatchObject({ version: 2, previous: 120, by: "U-OWNER", kind: "approval" });
    expect(suggestionFor(db, rate(db, "RATE-P-A")).status).toBe("approved");
  });

  it("a rollback is a new version and the approval stays in the history", () => {
    const db = fresh();
    approveRate(db, as(db, "U-OWNER"), "RATE-P-A", "");
    expect(rollbackRate(db, as(db, "U-OWNER"), "RATE-P-A", "Crew mix changed").ok).toBe(true);
    const r = rate(db, "RATE-P-A");
    expect(r.versions.map((v) => v.kind)).toEqual(["initial", "approval", "rollback"]);
    expect(r.value).toBe(120);
    expect(suggestionFor(db, r).status).not.toBe("approved");
    expect(reviewList(db).some((x) => x.rate.id === "RATE-P-A")).toBe(false);
  });

  it("a rejection needs a reason; D stays suppressed with two new jobs and can't be reopened", () => {
    const db = fresh();
    expect(rejectRate(db, as(db, "U-OWNER"), "RATE-P-A", "").ok).toBe(false);
    const d = suggestionFor(db, rate(db, "RATE-P-D"));
    expect(d.status).toBe("suppressed");
    expect(d.newSince).toBe(2);
    expect(reopenSuggestion(db, as(db, "U-SENIOR"), "RATE-P-D").ok).toBe(false);
  });

  it("E is on the day-90 list; F is overdue and the daily check escalates it to the owner once", () => {
    const db = fresh();
    const list = reviewList(db);
    expect(list.find((r) => r.rate.id === "RATE-P-E")?.state).toBe("due");
    expect(list.find((r) => r.rate.id === "RATE-P-F")?.state).toBe("escalated");
    const r = runReviewCheck(db, as(db, "U-SENIOR"));
    expect(r.ok && r.value).toBe(1);
    expect(db.activity[0].message).toMatch(/RATE-P-F review overdue at day 120. Escalated to Tim Skelly/);
    const again = runReviewCheck(db, as(db, "U-SENIOR"));
    expect(again.ok && again.value).toBe(0);
  });

  it("shows Not applicable where no current rate is on file, and a disabled state where coverage is off", () => {
    const db = fresh();
    expect(suggestionFor(db, rate(db, "RATE-C-F")).deviation).toBeNull();
    expect(suggestionFor(db, rate(db, "RATE-C-D")).status).toBe("disabled");
  });
});
