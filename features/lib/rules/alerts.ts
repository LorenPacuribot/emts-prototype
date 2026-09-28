/**
 * Features 27 and 29 — repaint alert queue rules.
 *
 * Pure functions over the Database. Nothing here writes data: the store
 * actions in lib/store/actions/service.ts call these, then apply the result.
 *
 * Main ideas
 * - A surface's clock starts at its latest confirmed application with a
 *   completion date. Touch-ups never reset it. Unverified third-party work
 *   does not reset it until staff have seen it.
 * - Alerts group by property, from the earliest due date through exactly 12
 *   months later, inclusive. A later surface joins an open group only when its
 *   date falls inside the existing window; it never stretches the window.
 * - Deduplication is by application: a surface application already on an
 *   alert is never alerted again, so repeat or catch-up runs create nothing twice.
 */
import type {
  AlertSurface, Application, Area, ContactAttempt, Database, FollowUp, LifespanLibrary, Property, RepaintAlert, RepaintSchedule, SnoozeReason, Surface,
} from "@/features/types";
import { OPEN_ESTIMATE_STATUSES } from "@/features/types";
import { calcRepaintDate, noticeDate, noticeMonths } from "./lifespan";
import { addMonths, daysBetween, isoDay } from "./dates";
import { clockPanel, isConversation } from "./follow-up";

export const ESCALATION_DAYS = 14;
export const BACKLOG_BATCH_MAX = 25;
export const MAX_EXTENSION_MONTHS = 24;
export const DUPLICATE_WINDOW_DAYS = 90;

export const SNOOZE_REASONS: SnoozeReason[] = ["Not due yet", "Customer deferred", "Wrong contact", "Not interested", "Property sold"];

export const REOPEN_REASONS = ["Sale reassignment", "Lost repaint estimate", "Inbound enquiry"] as const;

/* ------------------------------------------------------------------ */
/* Which application drives a surface's clock                          */
/* ------------------------------------------------------------------ */

export interface ClockSource {
  /** The application whose completion date starts the clock. */
  app?: Application;
  /** A confirmed application with no completion date (data gap). */
  unresolved?: Application;
  /** Unverified third-party records that did not reset the clock. */
  ignoredUnverified: Application[];
  /** Touch-ups on the driving application (never reset the clock). */
  touchUps: number;
}

export function clockSource(apps: Application[]): ClockSource {
  const confirmed = apps.filter((a) => a.verification === "confirmed");
  const dated = confirmed.filter((a) => a.completedAt).sort((a, b) => b.completedAt!.localeCompare(a.completedAt!));
  const app = dated[0];
  const undated = confirmed.filter((a) => !a.completedAt);
  const unresolved = !app && undated.length ? undated[undated.length - 1] : undefined;
  const ignoredUnverified = apps.filter((a) => a.verification === "unverified" && (!app || (a.completedAt ?? "") > (app.completedAt ?? "")));
  return { app, unresolved, ignoredUnverified, touchUps: app?.touchUps.length ?? 0 };
}

/** Effective due date of a stored schedule: an approved extension wins; a pending one does not (27.Q01). */
export function effectiveDue(s: Pick<RepaintSchedule, "dueDate" | "extension">): string {
  return s.extension?.status === "approved" ? s.extension.proposedDate : s.dueDate;
}

/* ------------------------------------------------------------------ */
/* Grouping                                                             */
/* ------------------------------------------------------------------ */

export function windowEndFor(earliestDue: string): string {
  return addMonths(earliestDue, 12);
}

/** True when `due` falls inside [earliestDue, windowEnd], inclusive, by calendar day. */
export function inWindow(w: { earliestDue: string; windowEnd: string }, due: string): boolean {
  const d = isoDay(due);
  return d >= isoDay(w.earliestDue) && d <= isoDay(w.windowEnd);
}

/**
 * Group due dates by property window: the earliest due date through exactly
 * 12 months later, inclusive. Anything later starts a new group.
 */
export function groupByWindow<T extends { dueDate: string }>(items: T[]): { earliestDue: string; windowEnd: string; items: T[] }[] {
  const sorted = [...items].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const groups: { earliestDue: string; windowEnd: string; items: T[] }[] = [];
  for (const item of sorted) {
    const g = groups[groups.length - 1];
    if (g && inWindow(g, item.dueDate)) g.items.push(item);
    else groups.push({ earliestDue: item.dueDate, windowEnd: windowEndFor(item.dueDate), items: [item] });
  }
  return groups;
}

/** Commercial notice takes precedence, then exterior, then interior. */
export function groupNoticeBasis(propertyType: Property["type"], kinds: Area["kind"][]): RepaintAlert["noticeBasis"] {
  if (propertyType === "commercial") return "commercial";
  return kinds.includes("exterior") ? "exterior" : "interior";
}

/* ------------------------------------------------------------------ */
/* Suppression, escalation and queue state                              */
/* ------------------------------------------------------------------ */

export interface Suppression {
  code: "Sold" | "Demolished" | "OpenRepaintEstimate" | "ActiveJob";
  label: string;
  ref?: string;
}

/**
 * Suppression (27.A12, 29): sold but not reassigned, demolished, an open repaint
 * estimate (draft or sent), or an active job. An unrelated estimate never suppresses.
 * `ignoreEstimateId` skips the estimate a follow-up itself asked for.
 */
export function suppressionFor(db: Database, propertyId: string, opts: { ignoreEstimateId?: string } = {}): Suppression | undefined {
  const p = db.properties.find((x) => x.id === propertyId);
  if (!p) return undefined;
  if (p.soldUnreassigned) return { code: "Sold", label: "Sold — not yet reassigned to the new owner" };
  if (p.demolished) return { code: "Demolished", label: "Property demolished" };
  const est = db.estimates.find(
    (e) => e.propertyId === propertyId && e.isRepaint && OPEN_ESTIMATE_STATUSES.includes(e.status) && e.id !== opts.ignoreEstimateId,
  );
  if (est) return { code: "OpenRepaintEstimate", label: `Open repaint estimate ${est.id}`, ref: est.id };
  const job = db.jobs.find((j) => j.propertyId === propertyId && j.status !== "completed");
  if (job) return { code: "ActiveJob", label: `Active job ${job.id}`, ref: job.id };
  return undefined;
}

/** Open estimates at the property that are not repaint quotes: shown, but they never suppress. */
export function unrelatedOpenEstimates(db: Database, propertyId: string) {
  return db.estimates.filter((e) => e.propertyId === propertyId && !e.isRepaint && OPEN_ESTIMATE_STATUSES.includes(e.status));
}

export function alertAgeDays(alert: Pick<RepaintAlert, "createdAt">, nowIso: string): number {
  return Math.max(0, daysBetween(alert.createdAt, nowIso));
}

/**
 * Escalation: 14 calendar days from alert creation with no recorded outcome.
 * Viewing is not an outcome. Qualification (Converted) and every other
 * recorded outcome stop the clock.
 */
export function alertEscalation(alert: RepaintAlert, nowIso: string) {
  const age = alertAgeDays(alert, nowIso);
  const noOutcome = alert.outcome === "open" && !alert.qualification;
  return { age, escalated: noOutcome && age >= ESCALATION_DAYS, daysLeft: Math.max(0, ESCALATION_DAYS - age), running: noOutcome };
}

export type QueueState = "live" | "backlog" | "snoozed" | "suppressed" | "resolved";

export function isResolved(alert: RepaintAlert): boolean {
  return alert.outcome === "converted" || alert.outcome === "dismissed" || !!alert.qualification;
}

export function snoozeActive(alert: RepaintAlert, nowIso: string): boolean {
  return alert.outcome === "snoozed" && !!alert.snoozeUntil && alert.snoozeUntil > nowIso;
}

export function alertQueueState(db: Database, alert: RepaintAlert, nowIso: string): { state: QueueState; suppression?: Suppression; escalated: boolean } {
  const suppression = suppressionFor(db, alert.propertyId);
  const { escalated } = alertEscalation(alert, nowIso);
  if (isResolved(alert)) return { state: "resolved", suppression, escalated: false };
  if (suppression) return { state: "suppressed", suppression, escalated };
  if (snoozeActive(alert, nowIso)) return { state: "snoozed", escalated: false };
  if (alert.backlog) return { state: "backlog", escalated };
  return { state: "live", escalated };
}

/** Snooze by 3, 6 or 12 months, or until a date. */
export function snoozeUntil(fromIso: string, choice: 3 | 6 | 12 | "date", dateIso?: string): string | undefined {
  if (choice === "date") return dateIso;
  return addMonths(fromIso, choice);
}

/** Inspection extension: later than the original date and at most two years after it. */
export function validateExtension(originalDue: string, proposed: string): string | undefined {
  if (!proposed) return "Choose the proposed service date.";
  if (isoDay(proposed) <= isoDay(originalDue)) return "An extension must be later than the current expected date.";
  if (isoDay(proposed) > isoDay(addMonths(originalDue, MAX_EXTENSION_MONTHS))) return "An inspection can extend a service date by at most two years.";
  return undefined;
}

/** Backlog batches are capped at 25 records. */
export function capBatch<T>(ids: T[], max = BACKLOG_BATCH_MAX): { batch: T[]; capped: boolean; dropped: number } {
  return { batch: ids.slice(0, max), capped: ids.length > max, dropped: Math.max(0, ids.length - max) };
}

/* ------------------------------------------------------------------ */
/* Schedules and the nightly run                                        */
/* ------------------------------------------------------------------ */

export interface CalcResult {
  propertyId: string;
  surfaceId: string;
  applicationId: string;
  completedAt: string;
  dueDate: string;
  years: number;
  basis: string[];
  ruleVersion: number;
}

export function calculateSchedule(surface: Surface, area: Area, app: Application, lib: LifespanLibrary, extraBasis: string[] = []): CalcResult | undefined {
  const calc = calcRepaintDate(app, area, lib, surface);
  if (!calc.dueDate) return undefined;
  return {
    propertyId: surface.propertyId, surfaceId: surface.id, applicationId: app.id, completedAt: app.completedAt!, dueDate: calc.dueDate,
    years: calc.years!, basis: [...calc.basis, ...extraBasis], ruleVersion: lib.version,
  };
}

function basisNotes(src: ClockSource): string[] {
  const notes: string[] = [];
  if (src.touchUps) notes.push(`${src.touchUps} touch-up${src.touchUps === 1 ? "" : "s"} logged — interval not reset`);
  if (src.ignoredUnverified.length) notes.push("Unverified third-party work on record — clock not reset until staff inspect it");
  if (src.app?.source?.toLowerCase().includes("import")) notes.push("Imported record");
  return notes;
}

export interface EligibleSurface {
  propertyId: string;
  surface: AlertSurface;
  kind: Area["kind"];
  backlog: boolean;
}

export interface RunPlan {
  calculations: CalcResult[];
  appendTo: { alertId: string; surface: AlertSurface }[];
  newAlerts: { propertyId: string; backlog: boolean; noticeBasis: RepaintAlert["noticeBasis"]; earliestDue: string; windowEnd: string; surfaces: AlertSurface[] }[];
  skipped: { surfaceId: string; propertyId: string; reason: "not_due" | "already_alerted"; dueDate?: string; noticeDate?: string }[];
  unresolved: { surfaceId: string; propertyId: string; applicationId: string }[];
  removed: string[];
  unverifiedOnly: string[];
  expiredSnoozes: string[];
  newEscalations: string[];
}

/**
 * Plan one nightly run (27.3). Reads the database and returns what the run
 * should create. Stored schedules are reused so a library change never moves
 * an existing date (future applications only).
 */
export function planNightlyRun(db: Database, nowIso: string): RunPlan {
  const plan: RunPlan = { calculations: [], appendTo: [], newAlerts: [], skipped: [], unresolved: [], removed: [], unverifiedOnly: [], expiredSnoozes: [], newEscalations: [] };
  const schedules = db.repaintSchedules ?? [];
  const covered = new Set(db.repaintAlerts.flatMap((a) => a.surfaces.map((s) => s.applicationId)));
  const eligible: EligibleSurface[] = [];

  for (const surface of db.surfaces) {
    const apps = db.applications.filter((a) => a.surfaceId === surface.id);
    if (!apps.length) continue;
    if (surface.removedAt) {
      plan.removed.push(surface.id);
      continue;
    }
    const area = db.areas.find((a) => a.id === surface.areaId);
    const property = db.properties.find((p) => p.id === surface.propertyId);
    if (!area || !property) continue;
    const src = clockSource(apps);
    if (!src.app) {
      if (src.unresolved) plan.unresolved.push({ surfaceId: surface.id, propertyId: surface.propertyId, applicationId: src.unresolved.id });
      else plan.unverifiedOnly.push(surface.id);
      continue;
    }
    const stored = schedules.find((s) => s.applicationId === src.app!.id);
    let due: string;
    let basis: string[];
    let version: number;
    if (stored) {
      due = effectiveDue(stored);
      basis = stored.basis;
      version = stored.ruleVersion;
    } else {
      const calc = calculateSchedule(surface, area, src.app, db.lifespanLibrary, basisNotes(src));
      if (!calc) continue;
      plan.calculations.push(calc);
      due = calc.dueDate;
      basis = calc.basis;
      version = calc.ruleVersion;
    }
    const notice = noticeMonths(property.type, area.kind);
    const nDate = noticeDate(due, notice.months);
    if (covered.has(src.app.id)) {
      plan.skipped.push({ surfaceId: surface.id, propertyId: property.id, reason: "already_alerted", dueDate: due, noticeDate: nDate });
      continue;
    }
    if (isoDay(nDate) > isoDay(nowIso)) {
      plan.skipped.push({ surfaceId: surface.id, propertyId: property.id, reason: "not_due", dueDate: due, noticeDate: nDate });
      continue;
    }
    const imported = !!src.app.source?.toLowerCase().includes("import");
    eligible.push({
      propertyId: property.id,
      kind: area.kind,
      backlog: imported && isoDay(due) <= isoDay(nowIso),
      surface: { surfaceId: surface.id, applicationId: src.app.id, dueDate: due, noticeDate: nDate, basis, ruleVersion: version },
    });
  }

  // Group per property (and keep backlog apart from the live queue).
  const byKey = new Map<string, EligibleSurface[]>();
  for (const e of eligible) {
    const k = `${e.propertyId}|${e.backlog}`;
    byKey.set(k, [...(byKey.get(k) ?? []), e]);
  }
  for (const [key, items] of byKey) {
    const [propertyId, backlogStr] = key.split("|");
    const backlog = backlogStr === "true";
    const property = db.properties.find((p) => p.id === propertyId)!;
    const openAlerts = db.repaintAlerts.filter((a) => a.propertyId === propertyId && !isResolved(a) && a.backlog === backlog);
    const rest: EligibleSurface[] = [];
    for (const it of items) {
      const target = openAlerts.find((a) => inWindow(a, it.surface.dueDate));
      if (target) plan.appendTo.push({ alertId: target.id, surface: it.surface });
      else rest.push(it);
    }
    for (const g of groupByWindow(rest.map((r) => ({ ...r, dueDate: r.surface.dueDate })))) {
      plan.newAlerts.push({
        propertyId, backlog, earliestDue: g.earliestDue, windowEnd: g.windowEnd,
        noticeBasis: groupNoticeBasis(property.type, g.items.map((i) => i.kind)),
        surfaces: g.items.map((i) => i.surface),
      });
    }
  }

  for (const a of db.repaintAlerts) {
    if (a.outcome === "snoozed" && a.snoozeUntil && a.snoozeUntil <= nowIso) plan.expiredSnoozes.push(a.id);
    if (!a.escalatedAt && alertEscalation(a, nowIso).escalated) plan.newEscalations.push(a.id);
  }
  return plan;
}

/** Schedules for every surface's current clock source, used to seed the demo. */
export function buildSchedules(db: Database, nowIso: string): RepaintSchedule[] {
  const out: RepaintSchedule[] = [];
  let n = 0;
  for (const surface of db.surfaces) {
    if (surface.removedAt) continue;
    const apps = db.applications.filter((a) => a.surfaceId === surface.id);
    const area = db.areas.find((a) => a.id === surface.areaId);
    const src = clockSource(apps);
    if (!src.app || !area) continue;
    const calc = calculateSchedule(surface, area, src.app, db.lifespanLibrary, basisNotes(src));
    if (!calc) continue;
    out.push({ id: `SCH-${++n}`, ...calc, calculatedAt: src.app.completedAt ?? nowIso });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Follow-ups (feature 29)                                              */
/* ------------------------------------------------------------------ */

export const CLOSED_FU = ["won", "lost", "do_not_contact", "deferred"] as const;

export function isClosedFollowUp(fu: FollowUp): boolean {
  return (CLOSED_FU as readonly string[]).includes(fu.status);
}

export function isRecycled(fu: FollowUp): boolean {
  return fu.status === "deferred" && !!fu.recycleDate;
}

export function madeAttempts(fu: FollowUp): ContactAttempt[] {
  return fu.attempts.filter((a) => a.actualAt);
}

export function lastOutcomeAt(fu: FollowUp): string | undefined {
  return madeAttempts(fu).map((a) => a.actualAt!).sort().pop();
}

export function nextActionDate(fu: FollowUp): string | undefined {
  const made = madeAttempts(fu).sort((a, b) => a.actualAt!.localeCompare(b.actualAt!));
  const last = made[made.length - 1];
  if (last?.nextActionDate) return last.nextActionDate;
  return fu.attempts.find((a) => !a.actualAt)?.plannedDate;
}

export function followUpClockState(db: Database, fu: FollowUp, nowIso: string) {
  const alert = db.repaintAlerts.find((a) => a.id === fu.alertId);
  return clockPanel({
    alertCreatedAt: alert?.createdAt ?? fu.qualifiedAt,
    qualifiedAt: fu.qualifiedAt,
    assignedAt: fu.assigneeId ? fu.assignedAt : undefined,
    lastOutcomeAt: lastOutcomeAt(fu),
    closed: isClosedFollowUp(fu),
    now: nowIso,
  });
}

export function followUpFlags(db: Database, fu: FollowUp, nowIso: string) {
  const closed = isClosedFollowUp(fu);
  const clocks = followUpClockState(db, fu, nowIso);
  const driving = clocks.clocks.find((c) => c.key === clocks.driving);
  const next = nextActionDate(fu);
  const overdue = !closed && !!fu.assigneeId && ((!!next && isoDay(next) < isoDay(nowIso)) || !!(driving?.key === "assigned" && driving.escalated));
  return {
    closed,
    recycled: isRecycled(fu),
    assigned: !closed && !!fu.assigneeId,
    unassigned: !closed && !fu.assigneeId,
    overdue,
    escalated: !closed && !!driving?.escalated,
    driving,
    next,
    attemptsMade: madeAttempts(fu).length,
  };
}

/** Surfaces covered by a follow-up: its source alert plus linked duplicate alerts. */
export function followUpSurfaceIds(db: Database, fu: FollowUp): string[] {
  const ids = [fu.alertId, ...(fu.linkedAlertIds ?? [])];
  return Array.from(new Set(db.repaintAlerts.filter((a) => ids.includes(a.id)).flatMap((a) => a.surfaces.map((s) => s.surfaceId))));
}

function lastActivity(fu: FollowUp): string {
  return [fu.qualifiedAt, fu.closedAt, ...fu.attempts.map((a) => a.actualAt), ...fu.history.map((h) => h.at)].filter(Boolean).sort().pop()!;
}

/**
 * Duplicate check (29.A09): an open follow-up at the property, or overlapping
 * surfaces at the property within 90 days of that follow-up's last activity.
 */
export function findDuplicateFollowUp(db: Database, propertyId: string, surfaceIds: string[], nowIso: string): FollowUp | undefined {
  const atProperty = db.followUps.filter((f) => f.propertyId === propertyId);
  const open = atProperty.find((f) => !isClosedFollowUp(f));
  if (open) return open;
  return atProperty.find((f) => {
    const overlap = followUpSurfaceIds(db, f).some((s) => surfaceIds.includes(s));
    return overlap && daysBetween(lastActivity(f), nowIso) <= DUPLICATE_WINDOW_DAYS;
  });
}

/* ------------------------------------------------------------------ */
/* Monthly measures (29.4)                                              */
/* ------------------------------------------------------------------ */

export function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function lastMonths(nowIso: string, n: number): string[] {
  const d = new Date(nowIso);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export type MeasureKey = "alerts" | "contacts" | "attempts" | "estimates" | "sold" | "dollars";

export interface MeasureItem {
  key: string;
  at: string;
  propertyId: string;
  label: string;
  followUpId?: string;
  alertId?: string;
  amount?: number;
}

/**
 * Monthly measures. Contacts are successful conversations only; attempts are
 * counted separately. Dollars won = signed contract value excluding tax and
 * later change orders, attributed to the signature month. Each opportunity
 * (follow-up ID) counts once, including reopened ones.
 */
export function monthlyMeasures(db: Database): Record<MeasureKey, MeasureItem[]> {
  const out: Record<MeasureKey, MeasureItem[]> = { alerts: [], contacts: [], attempts: [], estimates: [], sold: [], dollars: [] };
  for (const a of db.repaintAlerts) {
    out.alerts.push({ key: a.id, at: a.createdAt, propertyId: a.propertyId, alertId: a.id, label: `Alert ${a.id} — ${a.surfaces.length} surface${a.surfaces.length === 1 ? "" : "s"}${a.backlog ? " (backlog)" : ""}` });
  }
  const seenWon = new Set<string>();
  for (const f of db.followUps) {
    for (const at of [...(f.priorAttempts ?? []), ...f.attempts].filter((x) => x.actualAt)) {
      out.attempts.push({ key: `${f.id}-${at.id}`, at: at.actualAt!, propertyId: f.propertyId, followUpId: f.id, label: `${f.id} — day ${at.plannedDay} ${at.channel ?? "call"} (${(at.outcome ?? "").replace(/_/g, " ")})` });
      if (isConversation(at.outcome)) {
        out.contacts.push({ key: `${f.id}-${at.id}`, at: at.actualAt!, propertyId: f.propertyId, followUpId: f.id, label: `${f.id} — conversation with ${at.contactName ?? "customer"}` });
      }
    }
    const est = db.estimates.find((e) => e.id === f.estimateId);
    if (est && est.status !== "DRAFT") {
      out.estimates.push({ key: `${f.id}-${est.id}`, at: est.createdAt, propertyId: f.propertyId, followUpId: f.id, label: `${est.id} — ${est.title}` });
    }
    if (f.status === "won" && f.wonSignedAt && !seenWon.has(f.id)) {
      seenWon.add(f.id);
      out.sold.push({ key: f.id, at: f.wonSignedAt, propertyId: f.propertyId, followUpId: f.id, label: `${f.id} — contract signed` });
      out.dollars.push({ key: f.id, at: f.wonSignedAt, propertyId: f.propertyId, followUpId: f.id, label: `${f.id} — signed value excl. tax`, amount: f.wonValue ?? 0 });
    }
  }
  return out;
}

/** Signed value for Won: the job's original contract value (pre-tax, no later change orders), else the estimate total. */
export function signedValue(db: Database, estimateId?: string): { value?: number; signedAt?: string; source: string } {
  const est = db.estimates.find((e) => e.id === estimateId);
  if (!est) return { source: "No linked estimate" };
  const job = db.jobs.find((j) => j.estimateId === est.id && j.contractSigned);
  if (job) return { value: job.contractValue, signedAt: job.contractSignedAt, source: `Job ${job.id} original contract value (excl. tax and change orders)` };
  return { value: est.total, source: `Estimate ${est.id} total (excl. tax)` };
}
