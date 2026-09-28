/**
 * Features 27 and 29 — Service: repaint alerts, the nightly run, the lifespan
 * library and the repaint follow-up workflow.
 *
 * Each exported function is one user action. It receives an Immer draft of
 * the database and the acting user, validates first, then mutates the draft.
 * Nothing in this file sends a customer message on its own: every email is a
 * person pressing send (Rule 4), and alert runs never contact anyone.
 */
import type {
  ContactAttempt, Database, FollowUp, FollowUpStatus, HistoricalRecalc, LifespanLibrary, PipelineStage, RepaintAlert, SnoozeReason, User,
} from "@/features/types";
import { can, whoCan } from "@/features/lib/permissions";
import { now, nowDate } from "@/features/lib/clock";
import { byId, currentOwner, propertyAddress } from "@/features/lib/selectors";
import { date as fmtDate, dateTime, money } from "@/features/lib/format";
import { isoDay } from "@/features/lib/rules/dates";
import { labelRoomType, labelSurfaceType } from "@/features/lib/rules/lifespan";
import { attemptSchedule, inContactWindow, isConversation, recycleDate } from "@/features/lib/rules/follow-up";
import {
  BACKLOG_BATCH_MAX, REOPEN_REASONS, SNOOZE_REASONS, alertQueueState, calculateSchedule, capBatch, clockSource, findDuplicateFollowUp,
  followUpClockState, followUpSurfaceIds, isClosedFollowUp, isResolved, planNightlyRun, signedValue, snoozeUntil, suppressionFor, validateExtension,
} from "@/features/lib/rules/alerts";
import { denied, fail, log, nextId, ok } from "../helpers";

const MODULE = "Service";

function hist(alert: RepaintAlert, actor: User, text: string) {
  alert.history = [...(alert.history ?? []), { at: now(), by: actor.id, text }];
}

/* ================================================================== */
/* Feature 27 — nightly run                                            */
/* ================================================================== */

/**
 * Run the nightly job now (the real one runs at 2 a.m. local time).
 * `simulateFailure` records a failed run so the banner and catch-up can be shown.
 */
export interface RunResult { id: string; created: number; skipped: number; caughtUp: string[]; failed: boolean }

export function runNightly(db: Database, actor: User, simulateFailure = false) {
  if (!can(actor, "alerts.queue")) return denied(db, actor, MODULE, "run the nightly repaint job", whoCan("alerts.queue"));
  const t = now();
  const id = nextId(db, "run", "RUN-");

  if (simulateFailure) {
    db.runLog.unshift({
      id, ranAt: t, by: actor.id, created: 0, skipped: 0, failed: true, failures: 1,
      note: "Run failed: property database timed out before any alert was written (simulated). Catch-up scheduled.",
      details: ["No records were processed. The next run will catch up without creating duplicates."],
    });
    log(db, actor, MODULE, `Repaint: Nightly run ${id} at ${dateTime(t)} – 0 alerts created, 0 skipped, status Failed`);
    return ok<RunResult>({ id, created: 0, skipped: 0, caughtUp: [], failed: true });
  }

  const plan = planNightlyRun(db, t);
  db.repaintSchedules ??= [];
  const details: string[] = [];

  for (const c of plan.calculations) {
    db.repaintSchedules.push({ id: nextId(db, "sch", "SCH-"), ...c, calculatedAt: t });
    log(db, actor, MODULE, `Repaint: Surface ${c.surfaceId} at property ${c.propertyId} – Expected date ${fmtDate(c.dueDate)} from completion ${fmtDate(c.completedAt)}, interval ${c.years}y, adjustments ${c.basis.slice(1).join("; ") || "none"}, rule version ${c.ruleVersion}`);
  }
  if (plan.calculations.length) details.push(`${plan.calculations.length} new expected date${plan.calculations.length === 1 ? "" : "s"} calculated and stored.`);

  for (const a of plan.appendTo) {
    const alert = byId(db.repaintAlerts, a.alertId)!;
    alert.surfaces.push(a.surface);
    hist(alert, actor, `Surface ${a.surface.surfaceId} joined this group (due ${fmtDate(a.surface.dueDate)}). Window end and escalation clock unchanged.`);
    details.push(`${a.surface.surfaceId} added to ${alert.id} inside its existing window.`);
  }

  const created: string[] = [];
  for (const n of plan.newAlerts) {
    const alertId = nextId(db, "alert", "RA-");
    db.repaintAlerts.unshift({
      id: alertId, propertyId: n.propertyId, createdAt: t, surfaces: n.surfaces, earliestDue: n.earliestDue, windowEnd: n.windowEnd,
      outcome: "open", backlog: n.backlog, noticeBasis: n.noticeBasis, ownerId: "U-OFFICE", runId: id,
      history: [{ at: t, by: actor.id, text: `Created by nightly run ${id}${n.backlog ? " into the backlog" : ""}.` }],
    });
    created.push(alertId);
    log(db, actor, MODULE, `Repaint: Alert ${alertId} created for property ${n.propertyId}, grouping window ${fmtDate(n.earliestDue)} to ${fmtDate(n.windowEnd)}, ${n.surfaces.length} surfaces`);
    const sup = suppressionFor(db, n.propertyId);
    if (sup) log(db, actor, MODULE, `Repaint: Alert ${alertId} suppressed. Reason: ${sup.code}`);
    details.push(`${alertId} created for ${n.propertyId} (${n.surfaces.length} surface${n.surfaces.length === 1 ? "" : "s"}${n.backlog ? ", backlog" : ""}${sup ? `, suppressed: ${sup.label}` : ""}).`);
  }

  for (const aid of plan.expiredSnoozes) {
    const a = byId(db.repaintAlerts, aid)!;
    a.outcome = "open";
    hist(a, actor, "Snooze ended. Back in the live queue.");
    details.push(`${aid} snooze ended; returned to the queue.`);
  }
  for (const aid of plan.newEscalations) {
    const a = byId(db.repaintAlerts, aid)!;
    a.escalatedAt = t;
    a.ownerId = "U-OWNER";
    hist(a, actor, "Escalated to the business owner after 14 days with no recorded outcome.");
    log(db, actor, MODULE, `Repaint: Alert ${aid} escalated to owner after 14 days with no recorded outcome`);
    details.push(`${aid} escalated to the business owner.`);
  }

  // Follow-up escalation clocks (29.Q02). Logged once per clock and source date.
  for (const fu of db.followUps) {
    if (isClosedFollowUp(fu)) continue;
    const c = followUpClockState(db, fu, t);
    const driving = c.clocks.find((x) => x.key === c.driving);
    if (!driving?.escalated || !driving.source) continue;
    if ((fu.escalations ?? []).some((e) => e.clock === driving.key && e.source === driving.source)) continue;
    fu.escalations = [...(fu.escalations ?? []), { clock: driving.key, at: t, source: driving.source }];
    const clockName = driving.key === "unassigned" ? "Unassigned3Day" : driving.key === "assigned" ? "Assigned7Day" : "Alert14Day";
    log(db, actor, MODULE, `Follow-Up ${fu.id} escalated to ${driving.escalatesTo === "Business owner" ? "Owner" : "OfficeManager"}. Clock: ${clockName}. Source date: ${fmtDate(driving.source)}`);
  }
  // Recycled follow-ups whose season has arrived return for requalification. Nothing is sent.
  for (const fu of db.followUps) {
    if (fu.status === "deferred" && fu.recycleDate && isoDay(fu.recycleDate) <= isoDay(t) && !fu.history.some((h) => h.note?.startsWith("Season date reached"))) {
      fu.history.push({ status: "deferred", at: t, by: actor.id, note: "Season date reached: ready for requalification. Nothing was sent." });
      details.push(`${fu.id} season date reached; waiting for requalification.`);
    }
  }

  // Catch-up: failed runs that no successful run has covered yet.
  const covered = new Set(db.runLog.flatMap((r) => r.catchUpOf ?? []));
  const missed = db.runLog.filter((r) => r.failed && !covered.has(r.id)).map((r) => r.id);
  const unresolvedLabels = plan.unresolved.map((u) => `${u.surfaceId} at ${u.propertyId} (${u.applicationId}) — no completion date recorded`);

  db.runLog.unshift({
    id, ranAt: t, by: actor.id, created: created.length, skipped: plan.skipped.length, failed: false, failures: 0,
    note: created.length ? `Created ${created.join(", ")}.` : "No new surfaces entered a notice window.",
    catchUpOf: missed.length ? missed : undefined,
    catchUpResult: missed.length ? `Caught up ${missed.join(", ")}: ${created.length} alert${created.length === 1 ? "" : "s"} created, no duplicates.` : undefined,
    details: [
      ...details,
      `${plan.skipped.filter((s) => s.reason === "not_due").length} surfaces not yet in their notice window.`,
      `${plan.skipped.filter((s) => s.reason === "already_alerted").length} surfaces already on an alert (not duplicated).`,
      ...(plan.removed.length ? [`${plan.removed.length} removed surface${plan.removed.length === 1 ? "" : "s"} ignored.`] : []),
      "No customer email or text was sent.",
    ],
    unresolved: unresolvedLabels,
  });
  log(db, actor, MODULE, `Repaint: Nightly run ${id} at ${dateTime(t)} – ${created.length} alerts created, ${plan.skipped.length} skipped, status Success`);
  return ok<RunResult>({ id, created: created.length, skipped: plan.skipped.length, caughtUp: missed, failed: false });
}

export function resolveRunFailure(db: Database, actor: User, runId: string) {
  if (!can(actor, "alerts.queue")) return denied(db, actor, MODULE, "resolve a failed nightly run", whoCan("alerts.queue"));
  const run = byId(db.runLog, runId);
  if (!run) return fail("Run not found.");
  if (!run.failed) return fail("Only a failed run can be marked resolved.");
  if (run.resolvedAt) return fail("This failure is already resolved.");
  run.resolvedAt = now();
  run.resolvedBy = actor.id;
  log(db, actor, MODULE, `Repaint: Nightly run ${runId} failure marked resolved by ${actor.name}`);
  return ok();
}

/* ================================================================== */
/* Feature 27 — alert outcomes                                          */
/* ================================================================== */

function guardQueue(db: Database, actor: User, what: string) {
  if (!can(actor, "alerts.queue")) return denied(db, actor, MODULE, what, whoCan("alerts.queue"));
  return null;
}

function contactBlockForProperty(db: Database, propertyId: string): string | undefined {
  const sup = suppressionFor(db, propertyId);
  if (sup) return `Suppressed: ${sup.label}. Contact controls are not available.`;
  if (byId(db.properties, propertyId)?.optOut) return "Property has opted out. Internal tracking continues.";
  return undefined;
}

/** Contacted or Dismissed. Viewing an alert is never an outcome. */
export function recordAlertOutcome(db: Database, actor: User, alertId: string, outcome: "contacted" | "dismissed", reason: string) {
  const blocked = guardQueue(db, actor, `record an outcome on alert ${alertId}`);
  if (blocked) return blocked;
  const alert = byId(db.repaintAlerts, alertId);
  if (!alert) return fail("Alert not found.");
  if (isResolved(alert)) return fail("This alert already has a final outcome. Reopen it first.");
  if (!reason.trim()) return fail(outcome === "contacted" ? "Add a short note about the contact." : "Give a reason for dismissing.", "reason");
  if (outcome === "contacted") {
    const why = contactBlockForProperty(db, alert.propertyId);
    if (why) return fail(why);
  }
  const t = now();
  alert.outcome = outcome;
  alert.outcomeAt = t;
  alert.outcomeBy = actor.id;
  alert.outcomeReason = reason.trim();
  hist(alert, actor, `${outcome === "contacted" ? "Contacted" : "Dismissed"}: ${reason.trim()}`);
  log(db, actor, MODULE, `Repaint: Alert ${alertId} outcome ${outcome === "contacted" ? "Contacted" : "Dismissed"} recorded by ${actor.name} at ${dateTime(t)}. Reason: ${reason.trim()}`);
  return ok();
}

export function snoozeAlert(db: Database, actor: User, alertId: string, choice: 3 | 6 | 12 | "date", dateIso: string | undefined, reason: SnoozeReason | "", note = "") {
  const blocked = guardQueue(db, actor, `snooze alert ${alertId}`);
  if (blocked) return blocked;
  const alert = byId(db.repaintAlerts, alertId);
  if (!alert) return fail("Alert not found.");
  if (isResolved(alert)) return fail("This alert already has a final outcome.");
  if (!reason || !SNOOZE_REASONS.includes(reason)) return fail("Choose a snooze reason.", "reason");
  if (choice === "date" && !dateIso) return fail("Choose the date to snooze until.", "date");
  const until = snoozeUntil(now(), choice, dateIso ? new Date(`${dateIso}T12:00:00`).toISOString() : undefined)!;
  if (isoDay(until) <= isoDay(now())) return fail("The snooze date must be in the future.", "date");
  const t = now();
  alert.outcome = "snoozed";
  alert.snoozeUntil = until;
  alert.snoozeReason = reason;
  alert.outcomeAt = t;
  alert.outcomeBy = actor.id;
  alert.outcomeReason = note.trim() || undefined;
  hist(alert, actor, `Snoozed until ${fmtDate(until)} — ${reason}.`);
  log(db, actor, MODULE, `Repaint: Alert ${alertId} snoozed until ${fmtDate(until)} by ${actor.name}. Reason: ${reason}`);
  log(db, actor, MODULE, `Repaint: Alert ${alertId} outcome Snoozed recorded by ${actor.name} at ${dateTime(t)}. Reason: ${reason}`);
  return ok(until);
}

export function reopenAlert(db: Database, actor: User, alertId: string, reason: string) {
  const blocked = guardQueue(db, actor, `reopen alert ${alertId}`);
  if (blocked) return blocked;
  const alert = byId(db.repaintAlerts, alertId);
  if (!alert) return fail("Alert not found.");
  if (!(REOPEN_REASONS as readonly string[]).includes(reason)) return fail("Choose why the opportunity is reopening.", "reason");
  if (alert.outcome === "open") return fail("This alert is already open.");
  const fu = alert.qualification?.followUpId ? byId(db.followUps, alert.qualification.followUpId) : undefined;
  if (fu && !isClosedFollowUp(fu)) return fail(`Follow-up ${fu.id} is still open. Work it there instead.`);
  if (alert.qualification) hist(alert, actor, `Previous qualification kept in history: ${alert.qualification.decision} — ${alert.qualification.reason}`);
  alert.outcome = "open";
  alert.qualification = undefined;
  alert.snoozeUntil = undefined;
  alert.reopenedAt = now();
  hist(alert, actor, `Reopened: ${reason}. History kept.`);
  log(db, actor, MODULE, `Repaint: Alert ${alertId} reopened by ${actor.name}. Reason: ${reason}`);
  return ok();
}

/* ================================================================== */
/* Qualification gate (27 → 29)                                          */
/* ================================================================== */

export interface QualifyDraft {
  decision: "accepted" | "rejected";
  reason: string;
  /** Address, owner and opportunity checks. All three are needed to accept. */
  checks: string[];
}

function createFollowUp(db: Database, actor: User, alert: RepaintAlert, reason: string, batchId?: string): FollowUp {
  const t = now();
  const fu: FollowUp = {
    id: nextId(db, "fu", "FU-"), alertId: alert.id, propertyId: alert.propertyId, status: "qualified", qualifiedAt: t, qualifiedBy: actor.id,
    qualifyReason: reason, attempts: newAttempts(db, t), history: [{ status: "qualified", at: t, by: actor.id, note: batchId ? `Backlog batch ${batchId}` : undefined }],
  };
  db.followUps.unshift(fu);
  openFollowUpLead(db, actor, fu);
  alert.outcome = "converted";
  alert.outcomeAt = t;
  alert.outcomeBy = actor.id;
  alert.qualification = { decision: "accepted", reason, checks: ["address", "owner", "opportunity"], by: actor.id, at: t, followUpId: fu.id, batchId };
  hist(alert, actor, `Qualified and converted to follow-up ${fu.id}.`);
  return fu;
}

/**
 * NEW (29, decision D5): a qualified follow-up is worked as a lead in the live
 * Lead Pipeline, source "Repaint alert", stage New. The follow-up keeps its own
 * statuses; FOLLOW_UP_LEAD_STAGE says where the lead sits for each one.
 */
export const FOLLOW_UP_LEAD_STAGE: Record<FollowUpStatus, PipelineStage> = {
  qualified: "new_lead",
  contacted: "contacted",
  estimate_requested: "estimate_scheduled",
  estimate_sent: "pending",
  won: "sold",
  lost: "lost",
  deferred: "archived",
  do_not_contact: "archived",
};

function openFollowUpLead(db: Database, actor: User, fu: FollowUp) {
  const p = byId(db.properties, fu.propertyId);
  const owner = p ? currentOwner(db, p) : undefined;
  if (!owner) return;
  const leadId = nextId(db, "lead", "LEAD-2026-");
  db.leads.unshift({ id: leadId, customerId: owner.id, propertyId: fu.propertyId, source: "repaint_alert", stage: "new_lead", createdAt: fu.qualifiedAt, note: `Repaint follow-up ${fu.id} (alert ${fu.alertId}).` });
  fu.leadId = leadId;
  log(db, actor, "Leads", `Lead ${leadId} created in the pipeline for follow-up ${fu.id}, source Repaint alert`);
}

/** Moves the follow-up's lead to the matching pipeline stage. A sold lead never moves back. */
function syncFollowUpLead(db: Database, fu: FollowUp) {
  const lead = byId(db.leads, fu.leadId);
  if (!lead) return;
  const stage = FOLLOW_UP_LEAD_STAGE[fu.status];
  if (lead.stage === "sold" && stage !== "sold") return;
  lead.stage = stage;
  lead.lastActivityAt = now();
  if (stage === "archived") lead.note = [lead.note, `Archived: ${fu.status === "do_not_contact" ? "Do not contact" : "Deferred"}${fu.closedReason ? ` — ${fu.closedReason}` : ""}`].filter(Boolean).join(" ");
}

function newAttempts(db: Database, qualifiedAt: string): ContactAttempt[] {
  return attemptSchedule(qualifiedAt).map((a) => ({ id: nextId(db, "attempt", "AT-"), plannedDay: a.day, plannedDate: a.planned, movedFrom: a.movedFrom }));
}

export interface QualifyResult { followUpId?: string; duplicate: boolean; rejected: boolean }

/** Accept (Converted → follow-up at Qualified) or reject with a reason. Office only. */
export function qualifyAlert(db: Database, actor: User, alertId: string, draft: QualifyDraft) {
  if (!can(actor, "followup.qualify")) return denied(db, actor, MODULE, `qualify alert ${alertId}`, whoCan("followup.qualify"));
  const alert = byId(db.repaintAlerts, alertId);
  if (!alert) return fail("Alert not found.");
  if (isResolved(alert)) return fail("This alert has already been decided.");
  if (draft.reason.trim().length < 5) return fail("A qualification decision needs a reason (address, owner and opportunity).", "reason");
  const t = now();
  const reason = draft.reason.trim();

  if (draft.decision === "rejected") {
    alert.qualification = { decision: "rejected", reason, checks: draft.checks, by: actor.id, at: t };
    alert.outcome = "dismissed";
    alert.outcomeAt = t;
    alert.outcomeBy = actor.id;
    alert.outcomeReason = `Rejected at qualification: ${reason}`;
    hist(alert, actor, `Rejected at qualification: ${reason}`);
    log(db, actor, MODULE, `Follow-Up (not created) – Alert ${alertId} qualified by ${actor.name} at ${dateTime(t)}. Decision: Rejected. Reason: ${reason}`);
    log(db, actor, MODULE, `Repaint: Alert ${alertId} outcome Dismissed recorded by ${actor.name} at ${dateTime(t)}. Reason: ${reason}`);
    return ok<QualifyResult>({ rejected: true, duplicate: false });
  }

  if (["address", "owner", "opportunity"].some((c) => !draft.checks.includes(c))) {
    return fail("Confirm the address, the owner and the opportunity before accepting.", "checks");
  }
  const why = contactBlockForProperty(db, alert.propertyId);
  if (why) return fail(`Can't qualify for outreach. ${why}`);

  const surfaceIds = alert.surfaces.map((s) => s.surfaceId);
  const dup = findDuplicateFollowUp(db, alert.propertyId, surfaceIds, t);
  if (dup) {
    dup.linkedAlertIds = Array.from(new Set([...(dup.linkedAlertIds ?? []), alert.id]));
    alert.outcome = "converted";
    alert.outcomeAt = t;
    alert.outcomeBy = actor.id;
    alert.qualification = { decision: "accepted", reason, checks: draft.checks, by: actor.id, at: t, followUpId: dup.id };
    hist(alert, actor, `Linked to existing follow-up ${dup.id} as a duplicate property conversation.`);
    log(db, actor, MODULE, `Follow-Up ${dup.id} – Duplicate of ${dup.id} at property ${alert.propertyId} within 90 days of last activity. Linked.`);
    return ok<QualifyResult>({ followUpId: dup.id, duplicate: true, rejected: false });
  }
  const fu = createFollowUp(db, actor, alert, reason);
  log(db, actor, MODULE, `Follow-Up ${fu.id} – Alert ${alertId} qualified by ${actor.name} at ${dateTime(t)}. Decision: Accepted. Reason: ${reason}`);
  log(db, actor, MODULE, `Repaint: Alert ${alertId} outcome Converted recorded by ${actor.name} at ${dateTime(t)}. Reason: ${reason}`);
  return ok<QualifyResult>({ followUpId: fu.id, duplicate: false, rejected: false });
}

/** Qualify imported overdue records in batches of at most 25, skipping duplicates and suppressed properties. */
export function qualifyBacklogBatch(db: Database, actor: User, alertIds: string[], reason: string) {
  if (!can(actor, "followup.qualify")) return denied(db, actor, MODULE, "qualify a backlog batch", whoCan("followup.qualify"));
  if (!alertIds.length) return fail("Select at least one backlog record.");
  if (reason.trim().length < 5) return fail("Give a reason for qualifying this batch.", "reason");
  const { batch, dropped } = capBatch(alertIds, BACKLOG_BATCH_MAX);
  const batchId = nextId(db, "batch", "BATCH-");
  const t = now();
  const qualified: string[] = [];
  const skipped: string[] = [];
  for (const id of batch) {
    const alert = byId(db.repaintAlerts, id);
    if (!alert || isResolved(alert) || !alert.backlog) continue;
    const st = alertQueueState(db, alert, t);
    const dup = findDuplicateFollowUp(db, alert.propertyId, alert.surfaces.map((s) => s.surfaceId), t);
    if (dup || st.suppression || byId(db.properties, alert.propertyId)?.optOut) {
      skipped.push(`${alert.propertyId}${dup ? ` (open follow-up ${dup.id})` : st.suppression ? ` (${st.suppression.label})` : " (opted out)"}`);
      continue;
    }
    const fu = createFollowUp(db, actor, alert, reason.trim(), batchId);
    qualified.push(fu.id);
  }
  log(db, actor, MODULE, `Repaint: Backlog batch ${batchId} – ${qualified.length} imported overdue records qualified by ${actor.name}. Skipped for duplicate follow-up: ${skipped.join(", ") || "none"}`);
  return ok({ batchId, qualified, skipped, dropped });
}

/* ================================================================== */
/* Lifespan library                                                     */
/* ================================================================== */

export interface LibraryDraft {
  defaults: LifespanLibrary["defaults"];
  surfaceDefaults: NonNullable<LifespanLibrary["surfaceDefaults"]>;
  productDefaults: NonNullable<LifespanLibrary["productDefaults"]>;
  southWestDeduction: number;
  premiumBonus: number;
  poorPrepDeduction: number;
}

/** Publish a new rule version. Owner only. Affects future applications only. */
export function publishLibrary(db: Database, actor: User, draft: LibraryDraft, reason: string) {
  if (!can(actor, "alerts.editLibrary")) return denied(db, actor, MODULE, "change lifespan library defaults", whoCan("alerts.editLibrary"));
  const lib = db.lifespanLibrary;
  for (const d of [...draft.defaults, ...draft.surfaceDefaults]) {
    if (!Number.isFinite(d.years) || d.years <= 0 || d.years > 30) return fail("Each interval must be a positive number of years (30 or fewer).", `years-${"roomType" in d ? d.roomType : d.surfaceType}`);
  }
  const productKey = (d: { manufacturer: string; productLine: string; product?: string }) => `${d.manufacturer}|${d.productLine}|${d.product ?? ""}`;
  const productLabel = (d: { productLine: string; product?: string }) => d.product ?? `${d.productLine} line`;
  const seen = new Set<string>();
  for (const d of draft.productDefaults) {
    if (!Number.isFinite(d.years) || d.years <= 0 || d.years > 30) return fail("Each interval must be a positive number of years (30 or fewer).", `years-${productKey(d)}`);
    if (seen.has(productKey(d))) return fail(`${productLabel(d)} is listed twice.`, `years-${productKey(d)}`);
    seen.add(productKey(d));
  }
  for (const [k, v] of [["southWestDeduction", draft.southWestDeduction], ["premiumBonus", draft.premiumBonus], ["poorPrepDeduction", draft.poorPrepDeduction]] as const) {
    if (!Number.isFinite(v) || v < 0 || v > 5) return fail("Adjustment values must be between 0 and 5 years.", k);
  }
  if (!reason.trim()) return fail("Give a reason for this change.", "reason");
  const changes: string[] = [];
  const t = now();
  for (const d of draft.defaults) {
    const old = lib.defaults.find((x) => x.roomType === d.roomType)?.years;
    if (old !== d.years) changes.push(`Repaint: Library default for ${labelRoomType(d.roomType)} changed from ${old}y to ${d.years}y by ${actor.name}. Reason: ${reason.trim()}. Applies to future applications only.`);
  }
  for (const d of draft.surfaceDefaults) {
    const old = lib.surfaceDefaults?.find((x) => x.surfaceType === d.surfaceType)?.years;
    if (old !== d.years) changes.push(`Repaint: Library default for ${labelSurfaceType(d.surfaceType)} changed from ${old}y to ${d.years}y by ${actor.name}. Reason: ${reason.trim()}. Applies to future applications only.`);
  }
  const oldProducts = lib.productDefaults ?? [];
  for (const d of draft.productDefaults) {
    const old = oldProducts.find((x) => productKey(x) === productKey(d))?.years;
    if (old !== d.years) changes.push(`Repaint: Library default for ${productLabel(d)} (${d.manufacturer}) ${old === undefined ? `set to ${d.years}y` : `changed from ${old}y to ${d.years}y`} by ${actor.name}. Reason: ${reason.trim()}. Applies to future applications only.`);
  }
  for (const d of oldProducts.filter((x) => !seen.has(productKey(x)))) {
    changes.push(`Repaint: Library default for ${productLabel(d)} (${d.manufacturer}) removed by ${actor.name}; falls back to surface or room default. Reason: ${reason.trim()}. Applies to future applications only.`);
  }
  for (const [k, label] of [["southWestDeduction", "South/west exposure deduction"], ["premiumBonus", "Premium product bonus"], ["poorPrepDeduction", "Poor preparation deduction"]] as const) {
    if (lib[k] !== draft[k]) changes.push(`Repaint: Library default for ${label} changed from ${lib[k]}y to ${draft[k]}y by ${actor.name}. Reason: ${reason.trim()}. Applies to future applications only.`);
  }
  if (!changes.length) return fail("Nothing has changed.");
  db.lifespanHistory = [...(db.lifespanHistory ?? []), JSON.parse(JSON.stringify(lib)) as LifespanLibrary];
  db.lifespanLibrary = {
    version: lib.version + 1, updatedAt: t, updatedBy: actor.id, note: reason.trim(),
    defaults: draft.defaults.map((d) => ({ ...d })), surfaceDefaults: draft.surfaceDefaults.map((d) => ({ ...d })),
    productDefaults: draft.productDefaults.map((d) => ({ ...d })),
    southWestDeduction: draft.southWestDeduction, premiumBonus: draft.premiumBonus, poorPrepDeduction: draft.poorPrepDeduction,
  };
  changes.forEach((c) => log(db, actor, MODULE, c));
  return ok(db.lifespanLibrary.version);
}

/** Owner-selected historical recalculation. Explicit selection only; old dates kept. */
export function recalculateSelected(db: Database, actor: User, scheduleIds: string[], reason: string) {
  if (!can(actor, "alerts.recalculate")) return denied(db, actor, MODULE, "recalculate historical repaint dates", whoCan("alerts.recalculate"));
  if (!scheduleIds.length) return fail("Select the records to recalculate. There is no bulk reset.");
  if (!reason.trim()) return fail("Give a reason for the recalculation.", "reason");
  const lib = db.lifespanLibrary;
  const t = now();
  const rec: HistoricalRecalc = { id: nextId(db, "rcl", "RCL-"), at: t, by: actor.id, reason: reason.trim(), toVersion: lib.version, items: [] };
  for (const sid of scheduleIds) {
    const s = byId(db.repaintSchedules ?? [], sid);
    if (!s) continue;
    const surface = byId(db.surfaces, s.surfaceId);
    const area = byId(db.areas, surface?.areaId);
    const app = byId(db.applications, s.applicationId);
    if (!surface || !area || !app) continue;
    const src = clockSource(db.applications.filter((a) => a.surfaceId === surface.id));
    const extra = [...(src.touchUps ? [`${src.touchUps} touch-up(s) logged — interval not reset`] : []), `Recalculated ${fmtDate(t)} (was v${s.ruleVersion})`];
    const calc = calculateSchedule(surface, area, app, lib, extra);
    if (!calc) continue;
    rec.items.push({ scheduleId: s.id, surfaceId: s.surfaceId, propertyId: s.propertyId, oldDue: s.dueDate, newDue: calc.dueDate, oldVersion: s.ruleVersion });
    s.recalculated = [...(s.recalculated ?? []), { recalcId: rec.id, oldDue: s.dueDate, oldVersion: s.ruleVersion, at: t }];
    s.dueDate = calc.dueDate;
    s.years = calc.years;
    s.basis = calc.basis;
    s.ruleVersion = calc.ruleVersion;
    s.calculatedAt = t;
    // Open alerts show the new date; the grouping window never moves.
    for (const a of db.repaintAlerts.filter((x) => !isResolved(x))) {
      const as = a.surfaces.find((x) => x.applicationId === s.applicationId);
      if (as) {
        as.dueDate = calc.dueDate;
        as.basis = calc.basis;
        as.ruleVersion = calc.ruleVersion;
      }
    }
  }
  if (!rec.items.length) return fail("None of the selected records could be recalculated.");
  db.recalculations = [rec, ...(db.recalculations ?? [])];
  log(db, actor, MODULE, `Repaint: Historical recalculation of ${rec.items.length} selected records by ${actor.name}. Old dates retained. Reason: ${reason.trim()}`);
  return ok(rec.id);
}

export interface ExtensionDraft {
  date: string; // yyyy-mm-dd
  reason: string;
  photoName: string;
  photoDate: string; // yyyy-mm-dd
}

/** Estimators propose; the owner's own entry is approved on save (27.Q01). */
export function proposeExtension(db: Database, actor: User, scheduleId: string, draft: ExtensionDraft) {
  if (!can(actor, "alerts.proposeExtension")) return denied(db, actor, MODULE, "propose an inspection extension", whoCan("alerts.proposeExtension"));
  const s = byId(db.repaintSchedules ?? [], scheduleId);
  if (!s) return fail("Schedule not found.");
  if (s.extension?.status === "pending") return fail("An extension is already waiting for the owner's decision.");
  const proposed = draft.date ? new Date(`${draft.date}T12:00:00`).toISOString() : "";
  const err = validateExtension(s.dueDate, proposed);
  if (err) return fail(err, "date");
  if (!draft.reason.trim()) return fail("Give the inspection finding as the reason.", "reason");
  if (!draft.photoName.trim()) return fail("Attach the inspection photograph.", "photo");
  if (!draft.photoDate) return fail("Enter the date the photograph was taken.", "photoDate");
  if (draft.photoDate > isoDay(now())) return fail("The photograph date can't be in the future.", "photoDate");
  const t = now();
  const owner = can(actor, "alerts.approveExtension");
  const photoId = `PH-${s.surfaceId.replace("SF-", "")}-${String((db.counters.ext ?? 0) + 1).padStart(2, "0")}`;
  s.extension = {
    id: nextId(db, "ext", "EXT-"), proposedDate: proposed, reason: draft.reason.trim(), photoId, photoName: draft.photoName.trim(),
    photoDate: new Date(`${draft.photoDate}T12:00:00`).toISOString(), proposedBy: actor.id, proposedAt: t,
    status: owner ? "approved" : "pending", decidedBy: owner ? actor.id : undefined, decidedAt: owner ? t : undefined,
  };
  if (owner) {
    log(db, actor, MODULE, `Repaint: Surface ${s.surfaceId} – Inspection extension to ${fmtDate(proposed)} approved by ${actor.name} at ${dateTime(t)}`);
  } else {
    log(db, actor, MODULE, `Repaint: Surface ${s.surfaceId} – Inspection extension to ${fmtDate(proposed)} proposed by ${actor.name} with photograph ${photoId}. Reason: ${draft.reason.trim()}. Awaiting owner approval.`);
  }
  return ok(owner ? "approved" : "pending");
}

export function decideExtension(db: Database, actor: User, scheduleId: string, approve: boolean, note = "") {
  if (!can(actor, "alerts.approveExtension")) return denied(db, actor, MODULE, "approve an inspection extension", whoCan("alerts.approveExtension"));
  const s = byId(db.repaintSchedules ?? [], scheduleId);
  if (!s?.extension || s.extension.status !== "pending") return fail("There is no pending extension on this surface.");
  if (!approve && !note.trim()) return fail("Give a reason for rejecting the extension.", "note");
  const t = now();
  s.extension.status = approve ? "approved" : "rejected";
  s.extension.decidedBy = actor.id;
  s.extension.decidedAt = t;
  s.extension.decisionNote = note.trim() || undefined;
  if (approve) log(db, actor, MODULE, `Repaint: Surface ${s.surfaceId} – Inspection extension to ${fmtDate(s.extension.proposedDate)} approved by ${actor.name} at ${dateTime(t)}`);
  else log(db, actor, MODULE, `Repaint: Surface ${s.surfaceId} – Inspection extension to ${fmtDate(s.extension.proposedDate)} rejected by ${actor.name}. Reason: ${note.trim()}`);
  return ok();
}

/* ================================================================== */
/* Feature 29 — assignment                                              */
/* ================================================================== */

function guardWork(db: Database, actor: User, fu: FollowUp | undefined, what: string) {
  if (!fu) return fail("Follow-up not found.");
  if (!can(actor, "followup.work")) return denied(db, actor, MODULE, what, whoCan("followup.work"));
  const office = can(actor, "followup.qualify");
  if (!office && fu.assigneeId !== actor.id) return denied(db, actor, MODULE, `${what} on a follow-up assigned to someone else`, "the assigned estimator or the Office Manager");
  return null;
}

export function assignFollowUp(db: Database, actor: User, fuId: string, userId: string) {
  if (!can(actor, "followup.qualify")) return denied(db, actor, MODULE, `assign follow-up ${fuId}`, whoCan("followup.qualify"));
  const fu = byId(db.followUps, fuId);
  if (!fu) return fail("Follow-up not found.");
  if (isClosedFollowUp(fu)) return fail("A closed follow-up can't be assigned.");
  const user = byId(db.users, userId);
  if (!user || !["senior_estimator", "estimator"].includes(user.role)) return fail("Choose an area estimator.", "assignee");
  if (user.outOfOffice) return fail(`${user.name} is out of office. Choose someone who is available.`, "assignee");
  if (fu.assigneeId === userId) return fail(`Already assigned to ${user.name}.`, "assignee");
  const t = now();
  const re = !!fu.assigneeId || fu.history.some((h) => h.status === "assigned");
  fu.assigneeId = userId;
  fu.assignedAt = t; // restarts the assigned clock only; the alert clock is never touched
  fu.returnedAt = undefined;
  fu.history.push({ status: re ? "reassigned" : "assigned", at: t, by: actor.id, note: `${re ? "Reassigned" : "Assigned"} to ${user.name}${user.area ? ` (${user.area} area)` : ""}` });
  log(db, actor, MODULE, `Follow-Up ${fuId} assigned to ${user.name} by ${actor.name} at ${dateTime(t)}. Assigned clock started.`);
  return ok();
}

/** Mark an estimator out of office (or back). Their open follow-ups return to the queue at once. */
export function setOutOfOffice(db: Database, actor: User, userId: string, away: boolean) {
  if (!can(actor, "followup.qualify")) return denied(db, actor, MODULE, "change staff availability", whoCan("followup.qualify"));
  const user = byId(db.users, userId);
  if (!user) return fail("User not found.");
  user.outOfOffice = away;
  const returned: string[] = [];
  if (away) {
    for (const fu of db.followUps.filter((f) => f.assigneeId === userId && !isClosedFollowUp(f))) {
      fu.assigneeId = undefined;
      fu.returnedAt = now();
      fu.history.push({ status: "reassigned", at: now(), by: actor.id, note: `Returned to queue: ${user.name} is out of office. Escalation clocks unchanged.` });
      log(db, actor, MODULE, `Follow-Up ${fu.id} returned to queue because assignee ${user.name} is out of office. Escalation clocks unchanged.`);
      returned.push(fu.id);
    }
  }
  log(db, actor, MODULE, `${user.name} marked ${away ? "out of office" : "available"} by ${actor.name}`);
  return ok(returned);
}

/* ================================================================== */
/* Feature 29 — contact                                                 */
/* ================================================================== */

/** Why outreach on this follow-up is blocked right now, if it is. */
export function outreachBlock(db: Database, fu: FollowUp, at: Date = nowDate()): string | undefined {
  if (isClosedFollowUp(fu)) return "This follow-up is closed.";
  const p = byId(db.properties, fu.propertyId);
  if (p?.optOut) return "Property has opted out. Every channel is blocked until the office records explicit re-consent.";
  const sup = suppressionFor(db, fu.propertyId, { ignoreEstimateId: fu.estimateId });
  if (sup) return `Outreach suppressed: ${sup.label}.`;
  const w = inContactWindow(at);
  if (!w.ok) return `Outside the permitted contact window (8 a.m.–7 p.m., not Sundays or holidays). ${w.reason}`;
  return undefined;
}

function nextAttempt(fu: FollowUp): { attempt?: ContactAttempt; n: number; error?: string } {
  const idx = fu.attempts.findIndex((a) => !a.actualAt);
  if (idx < 0) return { n: 3, error: "Three attempts made. No more attempts this season." };
  const a = fu.attempts[idx];
  if (isoDay(a.plannedDate) > isoDay(now())) {
    return { n: idx + 1, error: `Attempt ${idx + 1} is scheduled for ${fmtDate(a.plannedDate)} (day ${a.plannedDay}). Attempts follow days 1, 14 and 35.` };
  }
  return { attempt: a, n: idx + 1 };
}

export interface CallDraft {
  contactName: string;
  note: string;
  outcome: NonNullable<ContactAttempt["outcome"]> | "";
  nextActionDate: string; // yyyy-mm-dd
}

function setStatus(db: Database, actor: User, fu: FollowUp, status: FollowUpStatus, note?: string) {
  if (fu.status === status) return;
  const old = fu.status;
  fu.status = status;
  fu.history.push({ status, at: now(), by: actor.id, note });
  syncFollowUpLead(db, fu);
  log(db, actor, MODULE, `Follow-Up ${fu.id} status changed from ${old} to ${status} by ${actor.name} at ${dateTime(now())}`);
}

function afterAttempt(db: Database, actor: User, fu: FollowUp) {
  const made = fu.attempts.filter((a) => a.actualAt);
  if (made.length === 3 && !made.some((a) => isConversation(a.outcome)) && !isClosedFollowUp(fu)) {
    const alert = byId(db.repaintAlerts, fu.alertId);
    const kinds = Array.from(new Set(followUpSurfaceIds(db, fu).map((sid) => byId(db.areas, byId(db.surfaces, sid)?.areaId)?.kind).filter(Boolean))) as ("interior" | "exterior")[];
    const target = recycleDate(fu.qualifiedAt, kinds.length ? kinds : [alert?.noticeBasis === "interior" ? "interior" : "exterior"]);
    fu.recycleDate = target;
    fu.closedAt = now();
    fu.closedReason = "No response after three attempts — recycled for next season";
    setStatus(db, actor, fu, "deferred", `Recycled for ${fmtDate(target)}`);
    log(db, actor, MODULE, `Follow-Up ${fu.id} recycled after three attempts. Next season target: ${fmtDate(target)}. Attempts and consent preserved.`);
    return target;
  }
  return undefined;
}

export function recordCall(db: Database, actor: User, fuId: string, draft: CallDraft) {
  const fu = byId(db.followUps, fuId);
  const g = guardWork(db, actor, fu, "record a call");
  if (g) return g;
  const f = fu!;
  if (!f.assigneeId) return fail("Assign the follow-up before recording contact.");
  const block = outreachBlock(db, f);
  if (block) return fail(block);
  const next = nextAttempt(f);
  if (next.error) return fail(next.error);
  if (!draft.contactName.trim()) return fail("Enter who was contacted (or who you tried to reach).", "contactName");
  if (!draft.note.trim()) return fail("Add a short note.", "note");
  if (!draft.outcome) return fail("Choose the outcome.", "outcome");
  if (!draft.nextActionDate) return fail("Set the next action date.", "nextActionDate");
  if (draft.nextActionDate < isoDay(now())) return fail("The next action date can't be in the past.", "nextActionDate");
  const t = now();
  const a = next.attempt!;
  Object.assign(a, {
    actualAt: t, contactName: draft.contactName.trim(), note: draft.note.trim(), outcome: draft.outcome, channel: "call",
    nextActionDate: new Date(`${draft.nextActionDate}T12:00:00`).toISOString(), by: actor.id,
  });
  const moved = a.movedFrom ? ` Moved from ${fmtDate(a.movedFrom)} because ${new Date(a.movedFrom).getUTCDay() === 0 ? "Sunday" : "Holiday"}.` : "";
  log(db, actor, MODULE, `Follow-Up ${fuId} – Attempt ${next.n} of 3 made on ${fmtDate(t)} via Call by ${actor.name}. Scheduled day: Day${a.plannedDay}.${moved}`);
  if (isConversation(draft.outcome)) {
    log(db, actor, MODULE, `Follow-Up ${fuId} – Call with ${a.contactName} at ${dateTime(t)}. Outcome: ${draft.outcome}. Note: ${a.note}. Next action: ${fmtDate(a.nextActionDate)}`);
  } else {
    const kind = draft.outcome === "no_answer" ? "NoAnswer" : draft.outcome === "left_message" ? "Voicemail" : "WrongNumber";
    log(db, actor, MODULE, `Follow-Up ${fuId} – Attempt ${next.n} unsuccessful (${kind}) at ${dateTime(t)}`);
  }
  let recycled: string | undefined;
  switch (draft.outcome) {
    case "reached":
      if (f.status === "qualified") setStatus(db, actor, f, "contacted");
      break;
    case "wants_quote":
      if (f.status === "qualified") setStatus(db, actor, f, "contacted");
      requestQuoteInner(db, actor, f, "call");
      break;
    case "declined":
      f.closedAt = t;
      f.closedReason = "Customer declined";
      setStatus(db, actor, f, "lost", "Customer declined on the call");
      log(db, actor, MODULE, `Follow-Up ${fuId} closed as Lost by ${actor.name} at ${dateTime(t)}. Linked estimate: ${f.estimateId ?? "none"}`);
      break;
    case "opt_out":
      optOutInner(db, actor, f.propertyId, `Customer asked on the call (${a.contactName}): ${a.note}`);
      f.closedAt = t;
      f.closedReason = "Customer opted out";
      setStatus(db, actor, f, "do_not_contact");
      break;
    default:
      recycled = afterAttempt(db, actor, f);
  }
  return ok({ attempt: next.n, recycled, conversation: isConversation(draft.outcome) });
}

/** Person-triggered reminder email with a Request a quote link (Rule 4). */
export function sendReminderEmail(db: Database, actor: User, fuId: string, nextActionDate: string) {
  const fu = byId(db.followUps, fuId);
  const g = guardWork(db, actor, fu, "send a reminder email");
  if (g) return g;
  const f = fu!;
  if (!f.assigneeId) return fail("Assign the follow-up before any outreach.");
  const block = outreachBlock(db, f);
  if (block) return fail(block);
  const prop = byId(db.properties, f.propertyId)!;
  const cust = currentOwner(db, prop);
  if (!cust?.consentSigned) return fail("No signed consent on file. Email is not available for this customer.");
  if (!cust.email) return fail("No email address on file.");
  const next = nextAttempt(f);
  if (next.error) return fail(next.error);
  if (!nextActionDate) return fail("Set the next action date.", "nextActionDate");
  const t = now();
  const a = next.attempt!;
  Object.assign(a, {
    actualAt: t, contactName: cust.name, channel: "email", outcome: "left_message", by: actor.id,
    note: `Reminder email sent to ${cust.email} with a Request a quote link.`, nextActionDate: new Date(`${nextActionDate}T12:00:00`).toISOString(),
  });
  f.emailsSent = [...(f.emailsSent ?? []), { at: t, by: actor.id, to: cust.email, attemptId: a.id }];
  log(db, actor, MODULE, `Follow-Up ${fuId} – Attempt ${next.n} of 3 made on ${fmtDate(t)} via Email by ${actor.name}. Scheduled day: Day${a.plannedDay}.`);
  const recycled = afterAttempt(db, actor, f);
  return ok({ to: cust.email, recycled });
}

function requestQuoteInner(db: Database, actor: User, fu: FollowUp, via: "call" | "link" | "inbound") {
  const t = now();
  const id = nextId(db, "qrq", "QRQ-");
  fu.quoteRequest = { id, at: t, via, by: actor.id };
  setStatus(db, actor, fu, "estimate_requested", `Quote requested (${via})`);
  log(db, actor, MODULE, `Follow-Up ${fu.id} – Quote requested by customer via ${via === "call" ? "Call" : via === "link" ? "Link" : "Inbound enquiry"} at ${dateTime(t)}. Queued as ${id}`);
  return id;
}

/** "Request quote": queues the request and returns the new-estimate link. */
export function requestQuote(db: Database, actor: User, fuId: string, via: "call" | "link" | "inbound" = "call") {
  const fu = byId(db.followUps, fuId);
  const g = via === "link" ? (fu ? null : fail("Follow-up not found.")) : guardWork(db, actor, fu, "request a quote");
  if (g) return g;
  const f = fu!;
  if (isClosedFollowUp(f)) return fail("This follow-up is closed. Reopen it first.");
  if (f.quoteRequest && f.status !== "qualified" && f.status !== "contacted") return fail(`A quote request (${f.quoteRequest.id}) is already queued.`);
  const p = byId(db.properties, f.propertyId);
  // A customer-initiated request is served even when opted out; staff-initiated outreach is not.
  if (via === "call" && p?.optOut) return fail("Property has opted out. Log an inbound request instead if the customer asked.");
  const id = requestQuoteInner(db, actor, f, via);
  return ok({ requestId: id, propertyId: f.propertyId });
}

export function markEstimateSent(db: Database, actor: User, fuId: string) {
  const fu = byId(db.followUps, fuId);
  const g = guardWork(db, actor, fu, "update a follow-up");
  if (g) return g;
  const est = byId(db.estimates, fu!.estimateId);
  if (!est || est.status === "DRAFT") return fail("The linked estimate hasn't been issued yet.");
  setStatus(db, actor, fu!, "estimate_sent", `${est.id} issued`);
  return ok();
}

function optOutInner(db: Database, actor: User, propertyId: string, source: string) {
  const p = byId(db.properties, propertyId)!;
  p.optOut = true;
  p.optOutAt = now();
  p.optOutBy = actor.id;
  p.optOutSource = source;
  log(db, actor, MODULE, `Property ${propertyId} – Opt-out recorded by ${actor.name} on ${fmtDate(now())}. Source: ${source}`);
}

export function recordOptOut(db: Database, actor: User, propertyId: string, source: string) {
  if (!can(actor, "followup.work")) return denied(db, actor, MODULE, "record an opt-out", whoCan("followup.work"));
  const p = byId(db.properties, propertyId);
  if (!p) return fail("Property not found.");
  if (p.optOut) return fail("This property has already opted out.");
  if (!source.trim()) return fail("Record what the customer said.", "source");
  optOutInner(db, actor, propertyId, source.trim());
  for (const fu of db.followUps.filter((f) => f.propertyId === propertyId && !isClosedFollowUp(f))) {
    fu.closedAt = now();
    fu.closedReason = "Customer opted out";
    setStatus(db, actor, fu, "do_not_contact");
  }
  return ok();
}

/** Explicit re-consent: office only, with the date and what the customer said. */
export function recordReconsent(db: Database, actor: User, propertyId: string, dateStr: string, statement: string) {
  if (!can(actor, "followup.reconsent")) return denied(db, actor, MODULE, "record re-consent", whoCan("followup.reconsent"));
  const p = byId(db.properties, propertyId);
  if (!p) return fail("Property not found.");
  if (!p.optOut) return fail("This property has not opted out.");
  if (!dateStr) return fail("Enter the date the customer asked to be contacted again.", "date");
  if (dateStr > isoDay(now())) return fail("The date can't be in the future.", "date");
  if (statement.trim().length < 5) return fail("Record what the customer said, in their words.", "statement");
  const at = new Date(`${dateStr}T12:00:00`).toISOString();
  p.optOut = false;
  p.reconsent = [...(p.reconsent ?? []), { date: at, statement: statement.trim(), by: actor.id, at: now() }];
  log(db, actor, MODULE, `Property ${propertyId} – Explicit re-consent recorded by ${actor.name} on ${fmtDate(at)}. Customer said: "${statement.trim()}"`);
  return ok();
}

/* ================================================================== */
/* Feature 29 — closure                                                 */
/* ================================================================== */

export interface CloseDraft {
  status: "won" | "lost" | "deferred" | "do_not_contact" | "";
  reason: string;
  /** Ownership correction: "Property sold", confirmed by phone. */
  propertySold?: boolean;
  confirmedByPhone?: boolean;
  newOwnerName?: string;
  newOwnerPhone?: string;
}

export function closeFollowUp(db: Database, actor: User, fuId: string, draft: CloseDraft) {
  const fu = byId(db.followUps, fuId);
  const g = guardWork(db, actor, fu, "close a follow-up");
  if (g) return g;
  const f = fu!;
  if (isClosedFollowUp(f)) return fail("This follow-up is already closed.");
  if (!draft.status) return fail("Choose how this follow-up closed.", "status");
  if ((draft.status === "lost" || draft.status === "do_not_contact") && !draft.reason.trim() && !draft.propertySold) return fail("A reason is required for Lost and Do not contact.", "reason");
  const t = now();
  const est = byId(db.estimates, f.estimateId);
  if (draft.status === "won") {
    if (!est || est.status !== "ACCEPTED") return fail("Won means a signed contract. Link a sold estimate first.");
    const sv = signedValue(db, est.id);
    f.wonValue = sv.value;
    f.wonSignedAt = sv.signedAt ?? t;
    f.closedReason = draft.reason.trim() || "Contract signed";
    f.closedAt = t;
    setStatus(db, actor, f, "won");
    log(db, actor, MODULE, `Follow-Up ${fuId} closed as Won by ${actor.name} at ${dateTime(t)}. Linked estimate: ${est.id}`);
    const month = new Date(f.wonSignedAt).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    log(db, actor, MODULE, `Follow-Up ${fuId} – Contract signed ${fmtDate(f.wonSignedAt)}, value excluding tax ${money(f.wonValue)}, attributed to ${month}`);
    return ok();
  }
  if (draft.propertySold) {
    if (!draft.confirmedByPhone) return fail("Confirm the sale with the owner by phone first.", "confirmedByPhone");
    let leadId: string | undefined;
    if (draft.newOwnerName?.trim()) {
      const custId = nextId(db, "cust", "C-NEW-");
      db.customers.push({ id: custId, name: draft.newOwnerName.trim(), phone: draft.newOwnerPhone?.trim() || undefined, contactVerified: false, preferredChannel: "phone", consentSigned: false, authorisedSigners: [] });
      leadId = nextId(db, "lead", "LEAD-2026-");
      db.leads.unshift({ id: leadId, customerId: custId, propertyId: f.propertyId, source: "repaint_alert", stage: "new_lead", createdAt: t, note: `New owner lead from follow-up ${fuId}. Previous owner's consent not copied.` });
      f.newLeadId = leadId;
    }
    const p = byId(db.properties, f.propertyId)!;
    p.soldUnreassigned = true;
    f.closedAt = t;
    f.closedReason = "Property sold";
    setStatus(db, actor, f, "lost", "Property sold");
    log(db, actor, MODULE, `Follow-Up ${fuId} closed as Lost, reason Property sold, confirmed by phone by ${actor.name}. New lead ${leadId ?? "not created"} created. Old consent not copied.`);
    return ok({ leadId });
  }
  if (draft.status === "do_not_contact") optOutInner(db, actor, f.propertyId, draft.reason.trim());
  if (draft.status === "deferred") {
    f.recycleDate = undefined;
  }
  f.closedAt = t;
  f.closedReason = draft.reason.trim() || undefined;
  setStatus(db, actor, f, draft.status);
  const label = { lost: "Lost", deferred: "Deferred", do_not_contact: "DoNotContact" }[draft.status];
  log(db, actor, MODULE, `Follow-Up ${fuId} closed as ${label} by ${actor.name} at ${dateTime(t)}. Linked estimate: ${est?.id ?? "none"}`);
  return ok();
}

/** Reopen a closed follow-up for a permitted reason. Same ID, so measures count it once. */
export function reopenFollowUp(db: Database, actor: User, fuId: string, reason: string) {
  if (!can(actor, "followup.qualify")) return denied(db, actor, MODULE, `reopen follow-up ${fuId}`, whoCan("followup.qualify"));
  const f = byId(db.followUps, fuId);
  if (!f) return fail("Follow-up not found.");
  if (!isClosedFollowUp(f)) return fail("This follow-up is open.");
  if (f.status === "won") return fail("A won follow-up is not reopened. A later repaint is a new opportunity.");
  if (f.recycleDate && f.status === "deferred") return fail("Recycled follow-ups return through Requalify when the season date arrives.");
  if (!(REOPEN_REASONS as readonly string[]).includes(reason)) return fail("Choose why it is reopening.", "reason");
  f.reopenedAt = now();
  f.closedAt = undefined;
  f.closedReason = undefined;
  setStatus(db, actor, f, f.attempts.some((a) => isConversation(a.outcome)) ? "contacted" : "qualified", `Reopened: ${reason}`);
  return ok();
}

/** A recycled follow-up whose season date has arrived is requalified by the office. Attempts kept. */
export function requalifyFollowUp(db: Database, actor: User, fuId: string, reason: string) {
  if (!can(actor, "followup.qualify")) return denied(db, actor, MODULE, `requalify follow-up ${fuId}`, whoCan("followup.qualify"));
  const f = byId(db.followUps, fuId);
  if (!f) return fail("Follow-up not found.");
  if (!(f.status === "deferred" && f.recycleDate)) return fail("Only a recycled follow-up can be requalified.");
  if (isoDay(f.recycleDate) > isoDay(now())) return fail(`This opportunity recycles for ${fmtDate(f.recycleDate)}. It can be requalified from that date.`);
  if (reason.trim().length < 5) return fail("A qualification decision needs a reason.", "reason");
  const t = now();
  f.priorAttempts = [...(f.priorAttempts ?? []), ...f.attempts];
  f.attempts = newAttempts(db, t);
  f.qualifiedAt = t;
  f.requalifiedAt = t;
  f.qualifyReason = reason.trim();
  f.recycleDate = undefined;
  f.closedAt = undefined;
  f.closedReason = undefined;
  if (f.assigneeId) f.assignedAt = t;
  setStatus(db, actor, f, "qualified", "Requalified for the new season");
  log(db, actor, MODULE, `Follow-Up ${fuId} – Alert ${f.alertId} qualified by ${actor.name} at ${dateTime(t)}. Decision: Accepted. Reason: ${reason.trim()}`);
  return ok();
}

export function linkCompletedRepaint(db: Database, actor: User, fuId: string, jobId: string) {
  const fu = byId(db.followUps, fuId);
  const g = guardWork(db, actor, fu, "link a completed repaint");
  if (g) return g;
  const job = byId(db.jobs, jobId);
  if (!job || job.propertyId !== fu!.propertyId) return fail("Choose a job at this property.", "job");
  if (job.status !== "completed") return fail("Only a completed job can be linked as the completed repaint.", "job");
  fu!.completedRepaintJobId = job.id;
  log(db, actor, MODULE, `Follow-Up ${fuId} – Completed repaint ${job.id} linked by ${actor.name}. Reported separately from Won.`);
  return ok();
}

/** Short label for the property, used in toasts. */
export function propertyLabel(db: Database, propertyId: string) {
  return propertyAddress(byId(db.properties, propertyId));
}

