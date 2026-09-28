/**
 * Feature 21 — Estimated Versus Actual Performance.
 *
 * Builds the comparison rows from two sources:
 * - live jobs (JOB-2026-1, -2, -5): approved hours from feature 22, Rule 3
 *   labour cost, material issued less sealed returns (features 18/19),
 *   subcontractor bills (feature 33) and approved change orders (feature 24);
 * - completed-job summaries from before the prototype's live jobs.
 *
 * Everything is filtered by work date. Only approved hours reach the main
 * figures; submitted hours show in the pending column.
 */
import type { CompletedJobRecord, CostSet, Database, PerformanceDimension, PerformanceMeasure, PerformanceRow, PerformanceSnapshot, ReasonCode, Role, SavedFilter, User } from "@/features/types";
import { can, whoCan } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { byId } from "@/features/lib/selectors";
import { roundMoney } from "@/features/lib/rules/rounding";
import { compareJobNumber } from "@/features/lib/rules/allocation";
import { BLENDED_COST_PER_HOUR, CO_LABOUR_SHARE, REASON_CODES, correctionApprovers, validRange } from "@/features/lib/rules/performance";
import { addDaysToDay, localDay, weekStartOf } from "@/features/lib/rules/payroll";
import { jobHours } from "./workforce";
import { denied, fail, log, nextId, ok, userName } from "../helpers";

const MODULE = "Performance Report";

export interface PerfFilter {
  from: string;
  to: string;
  dimension: PerformanceDimension;
  baseline: "revised" | "original";
  measure: PerformanceMeasure;
}

export interface JobPerf {
  jobId: string;
  name: string;
  kind: "interior" | "exterior";
  estimatorId: string;
  crewLeadId: string;
  source: "live" | "history";
  complete: boolean;
  original: CostSet;
  change: CostSet;
  actual?: CostSet;
  pendingHours: number;
  outOfScope?: { label: string; hours: number; cost: number };
  /** Live jobs only: purchases shown apart from usage (21). */
  purchasedGal?: number;
  purchasedValue?: number;
  issuedGal?: number;
  returnedGal?: number;
}

export const ZERO: CostSet = { labourHours: 0, labourCost: 0, material: 0, subcontractor: 0 };

export function costOf(c: CostSet | undefined, m: PerformanceMeasure): number | undefined {
  if (!c) return undefined;
  return m === "hours" ? Math.round(c.labourHours * 100) / 100 : roundMoney(c.labourCost + c.material + c.subcontractor);
}

function add(a: CostSet, b: CostSet): CostSet {
  return { labourHours: a.labourHours + b.labourHours, labourCost: roundMoney(a.labourCost + b.labourCost), material: roundMoney(a.material + b.material), subcontractor: roundMoney(a.subcontractor + b.subcontractor) };
}

const inRange = (day: string, f: { from: string; to: string }) => day >= f.from && day <= f.to;

/** Live job, measured over the work-date period. */
function liveJob(db: Database, jobId: string, f: { from: string; to: string }): JobPerf | undefined {
  const job = byId(db.jobs, jobId);
  const base = db.estimateBaselines.find((b) => b.jobId === jobId);
  if (!job || !base) return undefined;
  const hrs = jobHours(db, jobId, f);
  const labourCost = roundMoney(db.labourCosts.filter((l) => inRange(l.weekStart, f) || inRange(addDaysToDay(l.weekStart, 6), f))
    .reduce((a, l) => a + l.allocations.filter((x) => x.jobId === jobId).reduce((s, x) => s + x.amount, 0), 0));
  const tax = 1 + job.taxRatePct / 100;
  const pos = db.purchaseOrders.filter((p) => p.jobId === jobId && p.status !== "preliminary");
  const unit = (poId: string, lineId: string) => byId(db.purchaseOrders, poId)?.lines.find((l) => l.id === lineId)?.unitCostPerGal ?? 0;
  const receipts = (db.receipts ?? []).filter((r) => r.jobId === jobId && inRange(localDay(new Date(r.at)), f));
  const returns = (db.returns ?? []).filter((r) => r.jobId === jobId && r.confirmed && inRange(localDay(new Date(r.at)), f));
  const issuedGal = receipts.reduce((a, r) => a + r.qtyGal, 0);
  const returnedGal = returns.reduce((a, r) => a + r.qtyGal, 0);
  const material = roundMoney((receipts.reduce((a, r) => a + r.qtyGal * unit(r.poId, r.lineId), 0) - returns.reduce((a, r) => a + r.qtyGal * unit(r.poId, r.lineId), 0)) * tax);
  const subcontractor = roundMoney(db.financeRecords.filter((r) => r.type === "bill" && r.costCode === "SUB" && r.jobId === jobId && !r.deletedInQbo && inRange(localDay(new Date(r.date)), f)).reduce((a, r) => a + r.amount, 0));
  const actual: CostSet = { labourHours: hrs.approved / 60, labourCost, material, subcontractor };
  const hasActual = hrs.approved > 0 || material > 0 || labourCost > 0 || subcontractor > 0;
  if (!hasActual && hrs.pending === 0) return undefined;
  const coCost = db.changeOrders
    .filter((c) => c.jobId === jobId && (c.status === "approved" || c.status === "disputed") && (!c.decidedAt || localDay(new Date(c.decidedAt)) <= f.to))
    .reduce((a, c) => a + c.lines.reduce((x, l) => x + (l.treatment === "absorbed_labour" ? 0 : l.kind === "add" ? l.cost : -l.cost), 0), 0);
  const change: CostSet = { labourHours: (coCost * CO_LABOUR_SHARE) / BLENDED_COST_PER_HOUR, labourCost: roundMoney(coCost * CO_LABOUR_SHARE), material: roundMoney(coCost * (1 - CO_LABOUR_SHARE)), subcontractor: 0 };
  return {
    jobId, name: job.name, kind: base.kind, estimatorId: job.estimatorId, crewLeadId: job.crewLeadId, source: "live",
    complete: job.status === "completed", original: base.estimate, change, actual: hasActual ? actual : undefined, pendingHours: hrs.pending / 60,
    purchasedGal: pos.reduce((a, p) => a + p.lines.reduce((x, l) => x + l.gallons, 0), 0),
    purchasedValue: roundMoney(pos.reduce((a, p) => a + p.lines.reduce((x, l) => x + l.gallons * l.unitCostPerGal, 0), 0)),
    issuedGal, returnedGal,
  };
}

function historyJob(r: CompletedJobRecord): JobPerf {
  return {
    jobId: r.id, name: r.name, kind: r.kind, estimatorId: r.estimatorId, crewLeadId: r.crewLeadId, source: "history",
    complete: !!r.actual, original: r.estimate, change: r.changes, actual: r.actual, pendingHours: r.pendingHours ?? 0, outOfScope: r.outOfScope,
  };
}

/** Every job with work dates in the period. No zero-value rows are invented. */
export function jobPerformance(db: Database, f: { from: string; to: string }): JobPerf[] {
  // Sold jobs only: a job still being estimated has no contract to compare against.
  const live = db.jobs.filter((j) => j.contractSigned && j.status !== "estimating").map((j) => liveJob(db, j.id, f)).filter(Boolean) as JobPerf[];
  const history = db.completedJobs.filter((r) => inRange(localDay(new Date(r.completedAt)), f)).map(historyJob);
  return [...live, ...history].sort((a, b) => compareJobNumber(b.jobId, a.jobId));
}

/** Estimators see their own jobs; everyone else sees every job (crew leads see hours only). */
export function visibleTo(user: User, jobs: JobPerf[]): JobPerf[] {
  if (user.role === "estimator" || user.role === "senior_estimator") return jobs.filter((j) => j.estimatorId === user.id);
  return jobs;
}

export function measureFor(user: User, m: PerformanceMeasure): PerformanceMeasure {
  return user.role === "crew_lead" ? "hours" : m;
}

/** Group job rows by the chosen dimension into report rows. */
export function buildRows(db: Database, jobs: JobPerf[], dimension: PerformanceDimension, measure: PerformanceMeasure): PerformanceRow[] {
  const keyOf = (j: JobPerf) =>
    dimension === "job" ? j.jobId : dimension === "estimator" ? j.estimatorId : dimension === "crew_lead" ? j.crewLeadId : j.kind;
  const labelOf = (j: JobPerf) =>
    dimension === "job" ? `${j.jobId} · ${j.name}` : dimension === "kind" ? (j.kind === "interior" ? "Interior" : "Exterior") : userName(db, keyOf(j));
  const groups = new Map<string, JobPerf[]>();
  for (const j of jobs) groups.set(keyOf(j), [...(groups.get(keyOf(j)) ?? []), j]);
  return [...groups.entries()].map(([key, list]) => {
    const original = list.reduce((a, j) => add(a, j.original), ZERO);
    const change = list.reduce((a, j) => add(a, j.change), ZERO);
    const complete = list.every((j) => j.complete && j.actual);
    const actualSet = list.some((j) => j.actual) ? list.reduce((a, j) => add(a, j.actual ?? ZERO), ZERO) : undefined;
    const oos = list.filter((j) => j.outOfScope);
    const o = costOf(original, measure)!;
    const c = costOf(change, measure)!;
    const reason = dimension === "job" ? db.varianceReasons.find((r) => r.jobId === key)?.code : undefined;
    return {
      key, label: labelOf(list[0]), jobIds: list.map((j) => j.jobId), complete,
      original: o, change: c, revised: measure === "hours" ? Math.round((o + c) * 100) / 100 : roundMoney(o + c),
      actual: complete || actualSet ? costOf(actualSet, measure) : undefined,
      pending: Math.round(list.reduce((a, j) => a + j.pendingHours, 0) * 100) / 100,
      outOfScope: oos.length ? { label: oos.map((j) => j.outOfScope!.label).join("; "), value: oos.reduce((a, j) => a + (measure === "hours" ? j.outOfScope!.hours : j.outOfScope!.cost), 0) } : undefined,
      reasonCode: reason,
    };
  });
}

/** Overhead that could not be allocated to a job in the period, shown as an explicit exclusion. */
export function overheadExcluded(db: Database, f: { from: string; to: string }): number {
  const labour = db.labourCosts.filter((l) => inRange(l.weekStart, f)).reduce((a, l) => a + l.allocations.filter((x) => !x.jobId).reduce((s, x) => s + x.amount, 0), 0);
  const finance = db.financeRecords.filter((r) => !r.deletedInQbo && inRange(localDay(new Date(r.date)), f)).reduce((a, r) => a + (r.allocations ?? []).filter((x) => x.overhead).reduce((s, x) => s + x.amount, 0), 0);
  return roundMoney(labour + finance);
}

/** Per-employee hours on a live job (owner and office manager only). */
export function employeeHoursOnJob(db: Database, jobId: string, f: { from: string; to: string }) {
  const out = new Map<string, number>();
  for (const e of db.timeEntries) {
    if (!["approved", "locked", "paid"].includes(e.state) || !inRange(e.workDate, f)) continue;
    const seg = db.timeSegments.filter((s) => s.employeeId === e.employeeId && s.workDate === e.workDate && s.jobId === jobId && s.end && !s.supersededAt && !s.queued);
    if (!seg.length) continue;
    const mins = seg.reduce((a, s) => a + (new Date(s.end!).getTime() - new Date(s.start).getTime()) / 60000, 0);
    out.set(e.employeeId, (out.get(e.employeeId) ?? 0) + mins);
  }
  return [...out.entries()].map(([employeeId, minutes]) => ({ employeeId, name: byId(db.employees, employeeId)?.name ?? employeeId, hours: minutes / 60 }));
}

/* ------------------------------- Actions ----------------------------- */

export function issueSnapshot(db: Database, actor: User, f: PerfFilter, kind: "manual" | "weekly" = "manual", supersedes?: string) {
  if (!can(actor, "perf.issue")) return denied(db, actor, MODULE, "issue a performance report", whoCan("perf.issue"));
  if (!validRange(f.from, f.to)) return fail("The From date must be on or before the To date.", "period");
  const jobs = jobPerformance(db, f);
  const rows = buildRows(db, jobs, f.dimension, f.measure);
  const snap: PerformanceSnapshot = {
    id: nextId(db, "snap", "SNAP-"), issuedAt: now(), issuedBy: actor.id, kind, period: { from: f.from, to: f.to }, dimension: f.dimension, baseline: f.baseline, measure: f.measure,
    timezone: db.payrollSettings.timezone, rows,
    recipients: kind === "weekly" ? db.users.filter((u) => u.role === "owner" || u.role === "office_manager" || u.role === "senior_estimator").map((u) => u.email) : undefined,
    supersedes,
  };
  db.performanceSnapshots.unshift(snap);
  if (supersedes) {
    const old = byId(db.performanceSnapshots, supersedes);
    if (old) old.supersededBy = snap.id;
    log(db, actor, MODULE, `Performance Report: Snapshot ${supersedes} superseded by ${snap.id}, issued ${new Date(snap.issuedAt).toLocaleString()}. Original retained.`);
  }
  log(db, actor, MODULE, `Performance Report: Period ${f.from}–${f.to}, dimension ${f.dimension} issued by ${kind === "weekly" ? "System" : actor.name} at ${new Date(snap.issuedAt).toLocaleString()}. Snapshot: ${snap.id}`);
  return ok(snap.id);
}

/**
 * The weekly summary issues on Monday at 7 a.m. local time to the owner,
 * office manager and estimating manager (simulated by a button). It covers
 * the previous Monday-to-Sunday week and never issues twice for one week.
 */
export function runWeeklyIssue(db: Database, actor: User) {
  if (!can(actor, "perf.issue")) return denied(db, actor, MODULE, "run the weekly issue", whoCan("perf.issue"));
  const t = new Date(now());
  const monday = weekStartOf(localDay(t));
  const due = new Date(`${monday}T07:00:00`);
  if (t < due) return fail("The weekly summary issues on Monday at 7 a.m. local time.");
  if (db.performanceSnapshots.some((s) => s.kind === "weekly" && s.issuedAt >= due.toISOString())) return fail("This week's summary has already been issued.");
  const from = addDaysToDay(monday, -7);
  return issueSnapshot(db, actor, { from, to: addDaysToDay(monday, -1), dimension: "job", baseline: "revised", measure: "cost" }, "weekly");
}

export function requestArchived(db: Database, actor: User, snapshotId: string) {
  const s = byId(db.performanceSnapshots, snapshotId);
  if (!s?.archivedAt) return fail("This snapshot isn't archived.");
  if (s.retrievalRequestedAt) return fail("Retrieval already requested.");
  s.retrievalRequestedAt = now();
  s.retrievalRequestedBy = actor.id;
  log(db, actor, MODULE, `Performance Report: Archived snapshot ${s.id} requested by ${actor.name}. Available within one working day.`);
  return ok();
}

export function setReason(db: Database, actor: User, jobId: string, code: ReasonCode, note: string) {
  if (!can(actor, "perf.reason")) return denied(db, actor, MODULE, "set a variance reason", whoCan("perf.reason"));
  if (!REASON_CODES.includes(code)) return fail("Choose a reason from the fixed list.", "code");
  const own = db.jobs.find((j) => j.id === jobId)?.estimatorId ?? db.completedJobs.find((j) => j.id === jobId)?.estimatorId;
  if ((actor.role === "estimator" || actor.role === "senior_estimator") && own !== actor.id) return denied(db, actor, MODULE, "set a reason on another estimator's job", "the job's estimator, the Office Manager or the Business Owner");
  const existing = db.varianceReasons.find((r) => r.jobId === jobId);
  const rec = { jobId, code, note: note.trim(), by: actor.id, at: now() };
  if (existing) Object.assign(existing, rec);
  else db.varianceReasons.push(rec);
  log(db, actor, MODULE, `Performance Report: Job ${jobId} variance reason set to ${code} by ${actor.name}. Note: ${note.trim() || "—"}`);
  return ok();
}

/**
 * Correct a completed job's actual. After completion the office manager and
 * the owner both approve; a labour correction after payroll needs the owner.
 * Issued snapshots never change.
 */
export function requestCorrection(db: Database, actor: User, jobId: string, field: keyof CostSet, newValue: number, code: ReasonCode, note: string) {
  const rec = db.completedJobs.find((j) => j.id === jobId);
  if (!rec?.actual) return fail("Only a completed job with a recorded actual can be corrected here.");
  const requires = correctionApprovers({ jobCompleted: true, afterPayroll: true, labour: field === "labourCost" || field === "labourHours" });
  if (!can(actor, "perf.approveCorrection")) {
    log(db, actor, MODULE, `Blocked: ${actor.name} attempted to correct the actual on completed job ${jobId}. Requires the Office Manager and the Business Owner.`, true);
    return fail("This job is complete. Actual corrections need the Office Manager and the Business Owner to approve.");
  }
  if (Number.isNaN(newValue) || newValue < 0) return fail("Enter the corrected value.", "value");
  if (!note.trim()) return fail("Explain the correction.", "note");
  const c = {
    id: nextId(db, "pcr", "PCR-"), jobId, field, oldValue: rec.actual[field], newValue, code, note: note.trim(), requestedBy: actor.id, requestedAt: now(), requires,
    approvals: [{ role: actor.role as "office_manager" | "owner", by: actor.id, at: now() }], status: "pending" as const,
  };
  db.performanceCorrections.unshift(c);
  const done = requires.every((r) => c.approvals.some((a) => a.role === r));
  if (done) applyCorrection(db, actor, c.id);
  else log(db, actor, MODULE, `Performance Report: Correction ${c.id} to job ${jobId} ${field} requested by ${actor.name}. Awaiting ${requires.filter((r) => !c.approvals.some((a) => a.role === r)).map((r) => (r === "owner" ? "Business Owner" : "Office Manager")).join(" and ")}.`);
  return ok(c.id);
}

function applyCorrection(db: Database, actor: User, id: string) {
  const c = byId(db.performanceCorrections, id)!;
  const rec = db.completedJobs.find((j) => j.id === c.jobId)!;
  rec.actual = { ...rec.actual!, [c.field]: c.newValue };
  c.status = "applied";
  c.appliedAt = now();
  log(db, actor, MODULE, `Performance Report: Job ${c.jobId} actual ${c.field} changed from ${c.oldValue} to ${c.newValue} by ${userName(db, c.requestedBy)}. Approved by: ${c.approvals.map((a) => userName(db, a.by)).join(", ")}. Reason code: ${c.code}. Note: ${c.note}`);
}

export function approveCorrection(db: Database, actor: User, id: string) {
  if (!can(actor, "perf.approveCorrection")) return denied(db, actor, MODULE, "approve an actual correction", whoCan("perf.approveCorrection"));
  const c = byId(db.performanceCorrections, id);
  if (!c || c.status !== "pending") return fail("This correction isn't pending.");
  const role = actor.role as "office_manager" | "owner";
  if (!c.requires.includes(role)) return fail("Your role isn't one of the required approvers.");
  if (c.approvals.some((a) => a.role === role)) return fail("Your role has already approved this correction.");
  c.approvals.push({ role, by: actor.id, at: now() });
  if (c.requires.every((r) => c.approvals.some((a) => a.role === r))) applyCorrection(db, actor, id);
  return ok(c.status);
}

export function saveFilter(db: Database, actor: User, name: string, preset: string, f: PerfFilter) {
  if (!name.trim()) return fail("Name the filter.", "name");
  db.savedFilters.push({ id: nextId(db, "sf", "SF-"), userId: actor.id, name: name.trim(), preset, ...f, createdRole: actor.role as Role });
  log(db, actor, MODULE, `Performance Report: Filter "${name.trim()}" saved by ${actor.name}.`);
  return ok();
}

export function deleteFilter(db: Database, actor: User, id: string) {
  const f = byId(db.savedFilters, id);
  if (!f || f.userId !== actor.id) return fail("You can only remove your own saved filters.");
  db.savedFilters = db.savedFilters.filter((x) => x.id !== id);
  return ok();
}

export function logExport(db: Database, actor: User, f: PerfFilter, format: "CSV" | "PDF") {
  log(db, actor, MODULE, `Performance Report: Period ${f.from}–${f.to} exported as ${format} by ${actor.name}. Role filter: ${actor.role}`);
  return ok();
}

export function filtersFor(db: Database, user: User): SavedFilter[] {
  return db.savedFilters.filter((f) => f.userId === user.id);
}
