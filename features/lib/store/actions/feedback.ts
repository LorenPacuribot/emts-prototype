/**
 * Feature 30 — Estimating Performance Feedback.
 *
 * Assembles the evidence pool per surface and product combination from the
 * completed-job history, and records the decisions: exclusions, approvals,
 * rejections with suppression, reopenings, rollbacks and day-90 reviews.
 * A preview never changes a stored rate or estimate.
 */
import type { CompletedJobRecord, Database, EvidenceCombo, EvidenceExclusion, RateDecision, RateRecord, User } from "@/features/types";
import { can, whoCan } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { byId } from "@/features/lib/selectors";
import { addDays } from "@/features/lib/rules/dates";
import {
  MIN_JOBS, comboKey, comboLabel, deviation, eligibility, flagState, impactPreview, pooledCoverage, pooledProductivity, reviewState, suppression,
  type Eligibility, type FlagState,
} from "@/features/lib/rules/feedback";
import { denied, fail, log, nextId, ok } from "../helpers";

const MODULE = "Estimating Feedback";

export interface PoolJob {
  job: CompletedJobRecord;
  /** The matching combination, when the job has one. */
  combo?: EvidenceCombo;
  check: Eligibility;
  exclusion?: EvidenceExclusion;
}

export interface Pool {
  key: string;
  label: string;
  eligible: (PoolJob & { combo: EvidenceCombo })[];
  excluded: PoolJob[];
  ineligible: PoolJob[];
}

export function feedbackPool(db: Database, key: string, nowIso = now()): Pool {
  const all: PoolJob[] = db.completedJobs
    .filter((j) => j.combinations.some((c) => comboKey(c) === key))
    .map((job) => ({
      job,
      combo: job.combinations.find((c) => comboKey(c) === key),
      check: eligibility(job, key, nowIso),
      exclusion: db.evidenceExclusions.find((e) => e.comboKey === key && e.jobId === job.id && !e.restoredAt),
    }));
  return {
    key,
    label: comboLabel(key),
    eligible: all.filter((p) => p.check.eligible && !p.exclusion) as Pool["eligible"],
    excluded: all.filter((p) => p.check.eligible && p.exclusion),
    ineligible: all.filter((p) => !p.check.eligible),
  };
}

export type SuggestionStatus = "suggested" | "insufficient" | "suppressed" | "approved" | "disabled";

export interface Suggestion {
  rate: RateRecord;
  pool: Pool;
  observed: number;
  /** Productivity only: the median per-job figure shown beside the pooled rate. */
  median?: number;
  totals: { sqft: number; hours: number; coatSqft: number; wasteAdjustedGal: number };
  deviation: number | null;
  flag: FlagState;
  status: SuggestionStatus;
  decision?: RateDecision;
  /** Eligible jobs completed since the last decision. */
  newSince: number;
  suppression?: ReturnType<typeof suppression>;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function latestDecision(db: Database, rateId: string): RateDecision | undefined {
  return db.rateDecisions.filter((d) => d.rateId === rateId).sort((a, b) => b.at.localeCompare(a.at))[0];
}

export function suggestionFor(db: Database, rate: RateRecord, nowIso = now()): Suggestion {
  const pool = feedbackPool(db, rate.comboKey, nowIso);
  const combos = pool.eligible.map((p) => p.combo);
  const prod = pooledProductivity(combos);
  const cov = pooledCoverage(combos);
  const observed = rate.kind === "productivity" ? prod.pooled : cov.pooled;
  const dev = deviation(observed, rate.value);
  const decision = latestDecision(db, rate.id);
  const newSince = decision ? pool.eligible.filter((p) => p.job.completedAt > decision.at).length : pool.eligible.length;
  const supp = decision?.decision === "rejected" ? suppression(decision.at, nowIso, newSince, !!decision.reopenedAt) : undefined;
  let status: SuggestionStatus = "suggested";
  if (rate.enabled === false) status = "disabled";
  else if (pool.eligible.length < MIN_JOBS) status = "insufficient";
  else if (supp?.active) status = "suppressed";
  else if (decision?.decision === "approved" && newSince === 0 && rate.versions.at(-1)?.kind === "approval") status = "approved";
  return {
    rate, pool, observed, median: rate.kind === "productivity" ? prod.median : undefined,
    totals: { sqft: prod.sqft, hours: prod.hours, coatSqft: cov.coatSqft, wasteAdjustedGal: cov.wasteAdjustedGal },
    deviation: dev, flag: flagState(dev), status, decision, newSince, suppression: supp,
  };
}

export function allSuggestions(db: Database, nowIso = now()): Suggestion[] {
  return db.rateRecords.map((r) => suggestionFor(db, r, nowIso));
}

const kindWord = (r: RateRecord) => (r.kind === "productivity" ? "Productivity" : "Coverage");
const unit = (r: RateRecord) => (r.kind === "productivity" ? "sq ft/h" : "coat sq ft/gal");
export const rateText = (r: RateRecord, v: number) => `${round1(v)} ${unit(r)}`;

/** Logged when a combination is opened: the pool, then the suggestion or the shortfall. */
export function openSuggestion(db: Database, actor: User, rateId: string) {
  if (!can(actor, "feedback.view")) return denied(db, actor, MODULE, "open estimating feedback", whoCan("feedback.view"));
  const rate = byId(db.rateRecords, rateId);
  if (!rate) return fail("Rate record not found.");
  const s = suggestionFor(db, rate);
  log(db, actor, MODULE, `Feedback: Combination ${s.pool.label} – Evidence pool assembled, ${s.pool.eligible.length} eligible jobs, ${s.pool.excluded.length + s.pool.ineligible.length} excluded`);
  if (s.status === "insufficient") log(db, actor, MODULE, `Feedback: Combination ${s.pool.label} – Insufficient evidence (${s.pool.eligible.length} of ${MIN_JOBS} required)`);
  else if (s.status !== "disabled")
    log(db, actor, MODULE, `Feedback: Combination ${s.pool.label} – Proposed ${kindWord(rate)} rate ${rateText(rate, s.observed)} against current ${rateText(rate, rate.value)}. Deviation: ${s.deviation === null ? "Not applicable" : (s.deviation * 100).toFixed(2)}%. Evidence: ${s.pool.eligible.length} jobs`);
  return ok();
}

export function excludeEvidence(db: Database, actor: User, comboKey: string, jobId: string, reason: string) {
  if (!can(actor, "feedback.exclude")) return denied(db, actor, MODULE, "exclude evidence", whoCan("feedback.exclude"));
  if (!reason.trim()) return fail("An exclusion needs a reason.", "reason");
  if (db.evidenceExclusions.some((e) => e.comboKey === comboKey && e.jobId === jobId && !e.restoredAt)) return fail("This job is already excluded.");
  db.evidenceExclusions.unshift({ id: nextId(db, "exc", "EXC-"), comboKey, jobId, reason: reason.trim(), by: actor.id, at: now() });
  log(db, actor, MODULE, `Feedback: Combination ${comboLabel(comboKey)} – Job ${jobId} excluded by ${actor.name}. Reason: ${reason.trim()}`);
  return ok();
}

/** Restoring keeps the exclusion record: excluded jobs and reasons are retained permanently. */
export function restoreEvidence(db: Database, actor: User, exclusionId: string) {
  if (!can(actor, "feedback.exclude")) return denied(db, actor, MODULE, "restore excluded evidence", whoCan("feedback.exclude"));
  const e = byId(db.evidenceExclusions, exclusionId);
  if (!e || e.restoredAt) return fail("This exclusion is not active.");
  e.restoredBy = actor.id;
  e.restoredAt = now();
  log(db, actor, MODULE, `Feedback: Combination ${comboLabel(e.comboKey)} – Job ${e.jobId} restored to the evidence pool by ${actor.name}. Original exclusion reason: ${e.reason}`);
  return ok();
}

/** Runs on the stored figures and changes nothing. */
export function runPreview(db: Database, actor: User, rateId: string) {
  if (!can(actor, "feedback.view")) return denied(db, actor, MODULE, "run an impact preview", whoCan("feedback.view"));
  const rate = byId(db.rateRecords, rateId);
  if (!rate) return fail("Rate record not found.");
  const s = suggestionFor(db, rate);
  if (s.pool.eligible.length < MIN_JOBS) return fail("A preview needs at least eight eligible jobs.");
  const p = impactPreview(s.pool.eligible.map((e) => ({ jobId: e.job.id, completedAt: e.job.completedAt, combo: e.combo })), rate.kind, rate.value || s.observed, round1(s.observed));
  log(db, actor, MODULE, `Feedback: Combination ${s.pool.label} – Impact preview run on ${p.count} jobs by ${actor.name}. Variable moved: ${p.variable}`);
  return ok(p);
}

/** The curator of a combination's evidence may not approve its change, unless they are the owner. */
export function curatedBy(db: Database, comboKey: string, userId: string) {
  return db.evidenceExclusions.some((e) => e.comboKey === comboKey && (e.by === userId || e.restoredBy === userId));
}

export function approveRate(db: Database, actor: User, rateId: string, reason: string) {
  if (!can(actor, "feedback.approve")) return denied(db, actor, MODULE, "approve a rate change", whoCan("feedback.approve"));
  const rate = byId(db.rateRecords, rateId);
  if (!rate) return fail("Rate record not found.");
  if (actor.role !== "owner" && curatedBy(db, rate.comboKey, actor.id)) return denied(db, actor, MODULE, "approve a rate change for evidence you curated", "the Business Owner");
  const s = suggestionFor(db, rate);
  if (s.status !== "suggested") return fail(s.status === "suppressed" ? "This suggestion is suppressed." : "There is no suggestion to approve.");
  const at = now();
  const next = round1(s.observed);
  const version = rate.versions.length + 1;
  const why = reason.trim() || `Approved from ${s.pool.eligible.length} eligible jobs.`;
  rate.versions.push({ version, value: next, previous: rate.value, by: actor.id, at, reason: why, kind: "approval" });
  const old = rate.value;
  rate.value = next;
  // Open drafts are flagged, never refreshed. Sent and accepted estimates and generated orders stay as they are.
  const drafts = db.estimates.filter((e) => e.status === "DRAFT").map((e) => e.id);
  db.rateDecisions.unshift({ id: nextId(db, "rdc", "RDC-"), rateId, decision: "approved", by: actor.id, at, reason: why, observed: next, current: old, eligibleJobIds: s.pool.eligible.map((e) => e.job.id), draftsFlagged: drafts });
  log(db, actor, MODULE, `Feedback: Rate record ${rateId} for ${s.pool.label} changed from ${rateText(rate, old)} to ${rateText(rate, next)} by ${actor.name} on ${at.slice(0, 10)}. Version ${version}. Previous version retained.`);
  log(db, actor, MODULE, `Feedback: ${drafts.length} open draft estimates flagged for optional refresh after rate change ${rateId}`);
  return ok({ version, drafts: drafts.length });
}

export function rejectRate(db: Database, actor: User, rateId: string, reason: string) {
  if (!can(actor, "feedback.approve")) return denied(db, actor, MODULE, "reject a rate suggestion", whoCan("feedback.approve"));
  const rate = byId(db.rateRecords, rateId);
  if (!rate) return fail("Rate record not found.");
  if (!reason.trim()) return fail("A rejection needs a reason.", "reason");
  const s = suggestionFor(db, rate);
  if (s.status !== "suggested") return fail("There is no suggestion to reject.");
  const at = now();
  const until = addDays(at, 90);
  db.rateDecisions.unshift({ id: nextId(db, "rdc", "RDC-"), rateId, decision: "rejected", by: actor.id, at, reason: reason.trim(), observed: round1(s.observed), current: rate.value, eligibleJobIds: s.pool.eligible.map((e) => e.job.id), suppressedUntil: until });
  log(db, actor, MODULE, `Feedback: Combination ${s.pool.label} suggestion rejected by ${actor.name}. Reason: ${reason.trim()}. Suppressed until ${until.slice(0, 10)}`);
  return ok(until);
}

export function reopenSuggestion(db: Database, actor: User, rateId: string) {
  if (!can(actor, "feedback.reopen")) return denied(db, actor, MODULE, "reopen a rejected suggestion", whoCan("feedback.reopen"));
  const rate = byId(db.rateRecords, rateId);
  if (!rate) return fail("Rate record not found.");
  const s = suggestionFor(db, rate);
  if (!s.decision || !s.suppression?.active) return fail("This suggestion is not suppressed.");
  if (!s.suppression.canReopen) return fail(`Reopening early needs at least three new eligible jobs since the rejection. There are ${s.newSince}.`);
  s.decision.reopenedBy = actor.id;
  s.decision.reopenedAt = now();
  log(db, actor, MODULE, `Feedback: Combination ${s.pool.label} suggestion reopened by ${actor.name} on ${now().slice(0, 10)}. New eligible jobs since rejection: ${s.newSince}`);
  return ok();
}

/** A rollback is a further version. The original decision stays in the history. */
export function rollbackRate(db: Database, actor: User, rateId: string, reason: string) {
  if (!can(actor, "feedback.approve")) return denied(db, actor, MODULE, "roll back a rate", whoCan("feedback.approve"));
  const rate = byId(db.rateRecords, rateId);
  if (!rate) return fail("Rate record not found.");
  const last = rate.versions[rate.versions.length - 1];
  if (!last || last.previous === undefined) return fail("There is no earlier version to roll back to.");
  if (!reason.trim()) return fail("Give a reason for the rollback.", "reason");
  const version = rate.versions.length + 1;
  const at = now();
  rate.versions.push({ version, value: last.previous, previous: rate.value, by: actor.id, at, reason: reason.trim(), kind: "rollback" });
  rate.value = last.previous;
  log(db, actor, MODULE, `Feedback: Rate record ${rateId} rolled back to ${rateText(rate, last.previous)} by ${actor.name} on ${at.slice(0, 10)} as version ${version}`);
  return ok(version);
}

/** The approval in force, whose day-90 review is outstanding or done. A rolled-back change needs no review. */
export function reviewTarget(rate: RateRecord) {
  const last = rate.versions.at(-1);
  return last?.kind === "approval" ? last : undefined;
}

export function reviewList(db: Database, nowIso = now()) {
  return db.rateRecords.flatMap((rate) => {
    const v = reviewTarget(rate);
    if (!v) return [];
    return [{ rate, version: v, ...reviewState(v.at, nowIso, !!v.review), dueAt: addDays(v.at, 90), escalateAt: addDays(v.at, 120) }];
  });
}

export function completeReview(db: Database, actor: User, rateId: string, outcome: string) {
  if (!can(actor, "feedback.review")) return denied(db, actor, MODULE, "complete a day-90 rate review", whoCan("feedback.review"));
  const rate = byId(db.rateRecords, rateId);
  const v = rate && reviewTarget(rate);
  if (!rate || !v) return fail("There is no approved change to review.");
  if (v.review) return fail("This change has already been reviewed.");
  if (reviewState(v.at, now(), false).state === "not_due") return fail("The review isn't due until day 90.");
  if (!outcome.trim()) return fail("Record the outcome.", "outcome");
  v.review = { by: actor.id, at: now(), outcome: outcome.trim() };
  log(db, actor, MODULE, `Feedback: Rate change ${rateId} reviewed at day 90 by ${actor.name}. Outcome: ${outcome.trim()}`);
  return ok();
}

/** Simulated daily check: a review still outstanding at day 120 escalates to the owner. */
export function runReviewCheck(db: Database, actor: User) {
  if (!can(actor, "feedback.view")) return denied(db, actor, MODULE, "run the review check", whoCan("feedback.view"));
  const owner = db.users.find((u) => u.role === "owner");
  let count = 0;
  for (const r of reviewList(db)) {
    if (r.state !== "escalated" || r.version.escalatedAt) continue;
    r.version.escalatedAt = now();
    count += 1;
    log(db, actor, MODULE, `Feedback: Rate change ${r.rate.id} review overdue at day 120. Escalated to ${owner?.name ?? "the Business Owner"}`);
  }
  return ok(count);
}

export function logEvidenceExport(db: Database, actor: User, comboKey: string) {
  log(db, actor, MODULE, `Feedback: Combination ${comboLabel(comboKey)} – Evidence exported as CSV by ${actor.name}.`);
  return ok();
}
