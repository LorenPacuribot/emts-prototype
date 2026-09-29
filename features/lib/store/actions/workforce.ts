/**
 * Feature 22 — Employee Hours And Payroll, plus Rule 3 labour cost entry.
 *
 * Each exported function is one user action: access check, validation, then
 * the change and the activity-log line (wording from the Activity Logs
 * section). Totals are never stored: they are derived from the punches by
 * lib/rules/payroll.ts every time they are shown or exported.
 */
import type { ActivityCode, Database, Employee, TimeEntry, TimeSegment, User } from "@/features/types";
import { can, whoCan } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { byId } from "@/features/lib/selectors";
import {
  ACTIVITY_LABEL, OVERHEAD_ACTIVITIES, canApproveEntry, classifyWeek, conflictPairs, dayTotals, disputeRoute, exportsTime, gpsToPurge, hm,
  jobForActivity, mileageAmount, mileageEvidenceMissing, mileageRateOn, openSegment, weekStartOf, workDateOf, carriesLabourCost,
  localDay, approverFor, addDaysToDay,
} from "@/features/lib/rules/payroll";
import { allocateLabourCost, reconcileLabour } from "@/features/lib/rules/labour-cost";
import { roundMoney } from "@/features/lib/rules/rounding";
import { punchTags } from "@/features/lib/rules/shift-tag";
import { denied, fail, log, nextId, ok, userName } from "../helpers";

const MODULE = "Time";
const PAYROLL = "Payroll Export";

/* ------------------------------ Selectors ---------------------------- */

export function employeeFor(db: Database, user: User): Employee | undefined {
  return db.employees.find((e) => e.userId === user.id);
}

export function employeeUser(db: Database, e?: Employee): User | undefined {
  return e?.userId ? byId(db.users, e.userId) : undefined;
}

export function entrySegments(db: Database, entry: Pick<TimeEntry, "employeeId" | "workDate">): TimeSegment[] {
  return db.timeSegments
    .filter((s) => s.employeeId === entry.employeeId && s.workDate === entry.workDate)
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function entryTotals(db: Database, entry: TimeEntry) {
  return dayTotals(entrySegments(db, entry), entry.noLunch?.decision === "approved");
}

export function entryConflicts(db: Database, entry: TimeEntry) {
  return conflictPairs(entrySegments(db, entry));
}

export interface EntryFlag {
  key: "conflict" | "no_lunch" | "location" | "unattested" | "dispute" | "offline" | "subcontractor";
  label: string;
  tone: "red" | "amber" | "gray" | "blue";
}

export function entryFlags(db: Database, entry: TimeEntry): EntryFlag[] {
  const segs = entrySegments(db, entry);
  const emp = byId(db.employees, entry.employeeId);
  const flags: EntryFlag[] = [];
  if (conflictPairs(segs).length) flags.push({ key: "conflict", label: "Offline conflict", tone: "red" });
  if (entry.noLunch && !entry.noLunch.decision) flags.push({ key: "no_lunch", label: "No-lunch — office decision", tone: "amber" });
  if (segs.some((s) => s.location === "denied")) flags.push({ key: "location", label: "Location denied", tone: "gray" });
  if (entry.unattested) flags.push({ key: "unattested", label: "Unattested", tone: "amber" });
  if (entry.dispute?.status === "open") flags.push({ key: "dispute", label: entry.dispute.routedTo === "owner" ? "Disputed — owner" : "Disputed", tone: "red" });
  if (segs.some((s) => s.source === "offline")) flags.push({ key: "offline", label: "Offline punch", tone: "blue" });
  if (emp?.type === "subcontractor") flags.push({ key: "subcontractor", label: "Subcontractor — zero labour cost", tone: "gray" });
  return flags;
}

export function weekEntries(db: Database, weekStart: string): TimeEntry[] {
  const end = addDaysToDay(weekStart, 6);
  return db.timeEntries.filter((e) => e.workDate >= weekStart && e.workDate <= end);
}

/** Regular / overtime split for one employee's entries in one week. */
export function employeeWeek(db: Database, employeeId: string, weekStart: string, entries?: TimeEntry[]) {
  const list = (entries ?? weekEntries(db, weekStart)).filter((e) => e.employeeId === employeeId);
  const days = list.map((e) => ({ workDate: e.workDate, byJob: entryTotals(db, e).byJob }));
  return classifyWeek(days);
}

/** Approved minutes per job for an employee and week — the Rule 3 allocation basis. */
export function approvedJobMinutes(db: Database, employeeId: string, weekStart: string) {
  const buckets = new Map<string, { jobId?: string; minutes: number }>();
  for (const e of weekEntries(db, weekStart).filter((x) => x.employeeId === employeeId && ["approved", "locked", "paid"].includes(x.state))) {
    for (const j of entryTotals(db, e).byJob) {
      const key = j.jobId ?? "OVERHEAD";
      const b = buckets.get(key) ?? { jobId: j.jobId, minutes: 0 };
      b.minutes += j.allocated;
      buckets.set(key, b);
    }
  }
  return [...buckets.values()].filter((b) => b.minutes > 0);
}

/** Approved and pending hours on one job (feature 21 reads these). */
export function jobHours(db: Database, jobId: string, range?: { from: string; to: string }) {
  let approved = 0;
  let pending = 0;
  for (const e of db.timeEntries) {
    if (range && (e.workDate < range.from || e.workDate > range.to)) continue;
    const emp = byId(db.employees, e.employeeId);
    if (!emp) continue;
    const mins = entryTotals(db, e).byJob.filter((j) => j.jobId === jobId).reduce((a, j) => a + j.allocated, 0);
    if (!mins) continue;
    if (["approved", "locked", "paid"].includes(e.state)) approved += mins;
    else if (e.state === "submitted") pending += mins;
  }
  return { approved, pending };
}

export function ensureEntry(db: Database, employeeId: string, workDate: string): TimeEntry {
  let e = db.timeEntries.find((x) => x.employeeId === employeeId && x.workDate === workDate);
  if (!e) {
    e = { id: nextId(db, "te", "TE-"), employeeId, workDate, state: "open", overrides: [], history: [] };
    db.timeEntries.push(e);
  }
  return e;
}

function entryEditable(e: TimeEntry) {
  if (e.state === "locked") return fail("This day is in an export batch and is locked. Only a paid-period adjustment can change it.");
  if (e.state === "paid") return fail("This day has been paid. Create a next-paycheck adjustment instead — paid entries are never edited.");
  return null;
}

/* ------------------------------ Mobile clock ------------------------- */

export interface ClockOptions {
  offline?: boolean;
  locationDenied?: boolean;
}

function fakeGps(seed: number) {
  return { lat: 32.78 + (seed % 7) / 1000, lng: -96.8 - (seed % 5) / 1000 };
}

export function clockIn(db: Database, actor: User, employeeId: string, jobId: string | undefined, activity: ActivityCode, opts: ClockOptions = {}) {
  if (!can(actor, "time.clock")) return denied(db, actor, MODULE, "clock staff in", whoCan("time.clock"));
  const emp = byId(db.employees, employeeId);
  if (!emp) return fail("Employee not found.");
  if (emp.offboardedAt) return fail(`${emp.name} has been offboarded. Their history is kept, but they can't clock in.`);
  const job = jobForActivity(activity, jobId);
  if (!OVERHEAD_ACTIVITIES.includes(activity) && !job) return fail("Select a job before clocking in.", "job");
  if (openSegment(db.timeSegments, employeeId)) {
    log(db, actor, MODULE, `Time: Second simultaneous punch for ${emp.name} blocked and flagged by the system.`, true);
    return fail(`${emp.name} is already clocked in. A second simultaneous punch is blocked and has been flagged.`);
  }
  const t = now();
  const workDate = workDateOf(t);
  const existing = db.timeEntries.find((x) => x.employeeId === employeeId && x.workDate === workDate);
  if (existing && existing.state !== "open") return fail("This day has already been submitted. Ask the office to reopen it first.");
  const seg: TimeSegment = {
    id: nextId(db, "ts", "TS-"), employeeId, workDate, jobId: job, ...punchTags(db, employeeId, job, workDate), activity, start: t,
    source: opts.offline ? "offline" : "online", queued: opts.offline || undefined,
    location: opts.locationDenied ? "denied" : "captured", gps: opts.locationDenied ? undefined : fakeGps(db.timeSegments.length),
    clockedBy: actor.id,
  };
  db.timeSegments.push(seg);
  ensureEntry(db, employeeId, workDate);
  log(db, actor, MODULE, `Time: Employee ${emp.name} clocked In at job ${job ?? "overhead"} at ${new Date(t).toLocaleTimeString()} by ${actor.name}. Source: ${opts.offline ? "Offline" : "Online"}. Location: ${opts.locationDenied ? "Denied" : "Captured"}`);
  return ok(seg.id);
}

export function clockOut(db: Database, actor: User, employeeId: string, opts: ClockOptions = {}) {
  if (!can(actor, "time.clock")) return denied(db, actor, MODULE, "clock staff out", whoCan("time.clock"));
  const emp = byId(db.employees, employeeId);
  const seg = openSegment(db.timeSegments, employeeId);
  if (!emp || !seg) return fail("This employee isn't clocked in.");
  seg.end = now();
  if (opts.offline) seg.queued = true;
  log(db, actor, MODULE, `Time: Employee ${emp.name} clocked Out at job ${seg.jobId ?? "overhead"} at ${new Date(seg.end).toLocaleTimeString()} by ${actor.name}. Source: ${opts.offline ? "Offline" : "Online"}. Location: ${opts.locationDenied ? "Denied" : "Captured"}`);
  return ok();
}

/** Change Job ends the current punch and starts travel, charged to the second job. */
export function changeJob(db: Database, actor: User, employeeId: string, newJobId: string, opts: ClockOptions = {}) {
  if (!can(actor, "time.clock")) return denied(db, actor, MODULE, "change a job", whoCan("time.clock"));
  const seg = openSegment(db.timeSegments, employeeId);
  if (!seg) return fail("Clock the employee in first.");
  if (!newJobId) return fail("Select the job they are travelling to.", "job");
  if (seg.jobId === newJobId) return fail("They are already on that job.");
  const t = now();
  seg.end = t;
  if (opts.offline) seg.queued = true;
  db.timeSegments.push({
    id: nextId(db, "ts", "TS-"), employeeId, workDate: seg.workDate, jobId: newJobId, ...punchTags(db, employeeId, newJobId, seg.workDate), activity: "travel", start: t,
    source: opts.offline ? "offline" : "online", queued: opts.offline || undefined,
    location: opts.locationDenied ? "denied" : "captured", gps: opts.locationDenied ? undefined : fakeGps(db.timeSegments.length), clockedBy: actor.id,
  });
  log(db, actor, MODULE, `Time: ${userName(db, actor.id)} changed ${byId(db.employees, employeeId)?.name} from ${seg.jobId ?? "overhead"} to ${newJobId}. Travel charged to ${newJobId}.`);
  return ok();
}

/** Switch activity code on the running punch (ends one segment, starts the next). */
export function setActivity(db: Database, actor: User, employeeId: string, activity: ActivityCode, opts: ClockOptions = {}) {
  if (!can(actor, "time.clock")) return denied(db, actor, MODULE, "change an activity", whoCan("time.clock"));
  const seg = openSegment(db.timeSegments, employeeId);
  if (!seg) return fail("Clock the employee in first.");
  if (seg.activity === activity) return ok();
  const t = now();
  seg.end = t;
  if (opts.offline) seg.queued = true;
  const last = [...db.timeSegments].reverse().find((s) => s.employeeId === employeeId && s.jobId);
  const jobId = jobForActivity(activity, seg.jobId ?? last?.jobId);
  if (!jobId && !OVERHEAD_ACTIVITIES.includes(activity)) return fail("Choose a job for this activity.", "job");
  db.timeSegments.push({
    id: nextId(db, "ts", "TS-"), employeeId, workDate: seg.workDate, jobId, ...punchTags(db, employeeId, jobId, seg.workDate), activity, start: t,
    source: opts.offline ? "offline" : "online", queued: opts.offline || undefined,
    location: opts.locationDenied ? "denied" : "captured", gps: opts.locationDenied ? undefined : fakeGps(db.timeSegments.length), clockedBy: actor.id,
  });
  log(db, actor, MODULE, `Time: ${byId(db.employees, employeeId)?.name} switched to ${ACTIVITY_LABEL[activity]}${jobId ? ` on ${jobId}` : " (overhead)"} by ${actor.name}.`);
  return ok();
}

/** Offline punches upload with the Offline flag and their captured timestamps. */
export function syncOffline(db: Database, actor: User) {
  const queued = db.timeSegments.filter((s) => s.queued);
  if (!queued.length) return fail("No punches are queued on this device.");
  const t = now();
  for (const s of queued) {
    s.queued = undefined;
    s.syncedAt = t;
    ensureEntry(db, s.employeeId, s.workDate);
  }
  log(db, actor, MODULE, `Time: ${queued.length} offline punch${queued.length === 1 ? "" : "es"} synchronised by ${actor.name}. Captured timestamps kept; Offline flag retained.`);
  return ok(queued.length);
}

/** The crew lead chooses the correct record. The other stays visible, superseded, with zero hours. */
export function resolveConflict(db: Database, actor: User, keepId: string, supersedeId: string) {
  if (!can(actor, "time.resolveConflict")) return denied(db, actor, MODULE, "choose between conflicting punches", whoCan("time.resolveConflict"));
  const keep = byId(db.timeSegments, keepId);
  const drop = byId(db.timeSegments, supersedeId);
  if (!keep || !drop) return fail("Punch not found.");
  const entry = db.timeEntries.find((e) => e.employeeId === drop.employeeId && e.workDate === drop.workDate);
  if (entry) {
    const locked = entryEditable(entry);
    if (locked) return locked;
  }
  drop.supersededAt = now();
  drop.supersededBy = actor.id;
  entry?.history.push({ at: now(), by: actor.id, text: `Conflict resolved: kept ${keep.id} (${keep.source}), superseded ${drop.id} (${drop.source}).` });
  log(db, actor, MODULE, `Time: Employee ${byId(db.employees, drop.employeeId)?.name} ${drop.workDate} – Offline punch ${drop.source === "offline" ? drop.id : keep.id} conflicts with online punch ${drop.source === "online" ? drop.id : keep.id}. Selected: ${keep.id}. Superseded: ${drop.id}`);
  return ok();
}

/* --------------------------- Employee actions ------------------------ */

export function attestDay(db: Database, actor: User, entryId: string) {
  const entry = byId(db.timeEntries, entryId);
  if (!entry) return fail("Entry not found.");
  const emp = byId(db.employees, entry.employeeId);
  if (emp?.userId !== actor.id) return denied(db, actor, MODULE, "attest someone else's time", "the employee themselves");
  if (entry.attestedAt) return fail("Already attested.");
  entry.attestedAt = now();
  entry.unattested = undefined;
  entry.history.push({ at: entry.attestedAt, by: actor.id, text: "Attested by the employee." });
  log(db, actor, MODULE, `Time: Employee ${emp.name} attested ${entry.workDate} at ${new Date(entry.attestedAt).toLocaleString()}`);
  return ok();
}

export function raiseDispute(db: Database, actor: User, entryId: string, note: string) {
  const entry = byId(db.timeEntries, entryId);
  if (!entry) return fail("Entry not found.");
  const emp = byId(db.employees, entry.employeeId);
  if (emp?.userId !== actor.id) return denied(db, actor, MODULE, "dispute someone else's time", "the employee themselves");
  if (!note.trim()) return fail("Say what is wrong with this day.", "note");
  if (entry.dispute?.status === "open") return fail("This day already has an open dispute.");
  if (entry.state === "locked" || entry.state === "paid") {
    return fail("This day is already in an export batch, so it can't be reopened. The office can create a next-paycheck adjustment.");
  }
  const route = disputeRoute(now(), weekStartOf(entry.workDate), false);
  entry.dispute = { raisedAt: now(), raisedBy: actor.id, note: note.trim(), routedTo: route.routedTo, status: "open", movedToNextBatch: route.moveToNextBatch || undefined };
  if (entry.state === "approved") {
    entry.state = "submitted";
    entry.history.push({ at: now(), by: actor.id, text: "Reopened by a dispute after approval." });
  }
  entry.history.push({ at: now(), by: actor.id, text: `Disputed: ${note.trim()}` });
  log(db, actor, MODULE, `Time: Employee ${emp.name} ${entry.workDate} disputed at ${new Date().toLocaleString()}. Routed to: ${route.routedTo === "owner" ? "Owner" : "CrewLead, OfficeManager"}. Outcome: Open${route.moveToNextBatch ? ". Moved to the next batch." : ""}`);
  return ok(route);
}

export function resolveDispute(db: Database, actor: User, entryId: string, outcome: string) {
  const entry = byId(db.timeEntries, entryId);
  if (!entry?.dispute || entry.dispute.status !== "open") return fail("No open dispute on this day.");
  const allowed = entry.dispute.routedTo === "owner" ? actor.role === "owner" : ["crew_lead", "office_manager", "owner"].includes(actor.role);
  if (!allowed) return denied(db, actor, MODULE, "resolve this dispute", entry.dispute.routedTo === "owner" ? "the Business Owner (raised after Wednesday noon)" : "the Crew Lead or Office Manager");
  if (!outcome.trim()) return fail("Record the outcome.", "outcome");
  Object.assign(entry.dispute, { status: "resolved", outcome: outcome.trim(), resolvedBy: actor.id, resolvedAt: now() });
  entry.history.push({ at: now(), by: actor.id, text: `Dispute resolved: ${outcome.trim()}` });
  log(db, actor, MODULE, `Time: Employee ${byId(db.employees, entry.employeeId)?.name} ${entry.workDate} disputed at ${new Date(entry.dispute.raisedAt).toLocaleString()}. Routed to: ${entry.dispute.routedTo === "owner" ? "Owner" : "CrewLead, OfficeManager"}. Outcome: ${outcome.trim()}`);
  return ok();
}

/* ------------------------------ Crew lead ---------------------------- */

export function setNoLunch(db: Database, actor: User, entryId: string, reason: string) {
  if (!can(actor, "time.submit")) return denied(db, actor, MODULE, "flag a no-lunch day", whoCan("time.submit"));
  const entry = byId(db.timeEntries, entryId);
  if (!entry) return fail("Entry not found.");
  if (entry.state !== "open") return fail("Set the no-lunch flag before the day is submitted.");
  if (!reason.trim()) return fail("A no-lunch flag needs the crew's reason.", "reason");
  entry.noLunch = { reason: reason.trim(), by: actor.id, at: now() };
  log(db, actor, MODULE, `Time: Employee ${byId(db.employees, entry.employeeId)?.name} ${entry.workDate} – No-lunch flag set by ${actor.name}. Reason: ${reason.trim()}. Office decision: Pending`);
  return ok();
}

/** Crew lead submits the crew's open days. Unattested days are submitted and marked. */
export function submitWeek(db: Database, actor: User, weekStart: string) {
  if (!can(actor, "time.submit")) return denied(db, actor, MODULE, "submit the week", whoCan("time.submit"));
  const open = weekEntries(db, weekStart).filter((e) => e.state === "open" && entrySegments(db, e).some((s) => s.end && !s.queued));
  if (!open.length) return fail("No open days to submit this week.");
  const running = open.filter((e) => entrySegments(db, e).some((s) => !s.end));
  if (running.length) return fail(`${running.map((e) => byId(db.employees, e.employeeId)?.name).join(", ")} still clocked in. Clock them out first.`);
  const t = now();
  for (const e of open) {
    e.state = "submitted";
    e.submittedAt = t;
    e.submittedBy = actor.id;
    if (!e.attestedAt) {
      e.unattested = true;
      log(db, actor, MODULE, `Time: Employee ${byId(db.employees, e.employeeId)?.name} ${e.workDate} submitted by ${actor.name} without attestation`);
    }
    e.history.push({ at: t, by: actor.id, text: `Submitted${e.attestedAt ? "" : " (unattested)"}.` });
  }
  log(db, actor, MODULE, `Time: Crew ${db.crews[0]?.name ?? "crew"} ${weekStart}–${addDaysToDay(weekStart, 6)} submitted by ${actor.name}`);
  return ok(open.length);
}

/* ------------------------------- Office ------------------------------ */

export function decideNoLunch(db: Database, actor: User, entryId: string, decision: "approved" | "rejected") {
  if (!can(actor, "time.decideNoLunch")) return denied(db, actor, MODULE, "decide a no-lunch exception", whoCan("time.decideNoLunch"));
  const entry = byId(db.timeEntries, entryId);
  if (!entry?.noLunch) return fail("No no-lunch flag on this day.");
  const locked = entryEditable(entry);
  if (locked) return locked;
  Object.assign(entry.noLunch, { decision, decidedBy: actor.id, decidedAt: now() });
  log(db, actor, MODULE, `Time: Employee ${byId(db.employees, entry.employeeId)?.name} ${entry.workDate} – No-lunch flag set by ${userName(db, entry.noLunch.by)}. Reason: ${entry.noLunch.reason}. Office decision: ${decision === "approved" ? "Approved" : "Rejected"} by ${actor.name}`);
  return ok();
}

export function approveEntry(db: Database, actor: User, entryId: string) {
  if (!can(actor, "time.approve")) return denied(db, actor, MODULE, "approve time", whoCan("time.approve"));
  const entry = byId(db.timeEntries, entryId);
  if (!entry) return fail("Entry not found.");
  const emp = byId(db.employees, entry.employeeId)!;
  const check = canApproveEntry(actor, emp, employeeUser(db, emp));
  if (!check.ok) return denied(db, actor, MODULE, `approve ${emp.name}'s time`, approverFor(employeeUser(db, emp)?.role).label);
  if (entry.state === "approved") return fail("Already approved.");
  if (entry.state === "locked" || entry.state === "paid") return fail("This day is already in an export batch.");
  if (entryConflicts(db, entry).length) return fail("Approval is blocked until the crew lead selects one of the conflicting punches.");
  if (entry.noLunch && !entry.noLunch.decision) return fail("Decide the no-lunch exception first.");
  if (entry.dispute?.status === "open") return fail("Resolve the open dispute before approving this day.");
  if (entrySegments(db, entry).some((s) => !s.end)) return fail("This employee is still clocked in on this day.");
  entry.state = "approved";
  entry.approvedBy = actor.id;
  entry.approvedAt = now();
  entry.history.push({ at: entry.approvedAt, by: actor.id, text: "Approved." });
  log(db, actor, MODULE, `Time: Employee ${emp.name} ${entry.workDate} approved by ${actor.name} at ${new Date(entry.approvedAt).toLocaleString()}`);
  return ok();
}

export function approveMany(db: Database, actor: User, entryIds: string[]) {
  let approved = 0;
  const skipped: string[] = [];
  for (const id of entryIds) {
    const entry = byId(db.timeEntries, id);
    if (!entry || entry.state !== "submitted") continue;
    const emp = byId(db.employees, entry.employeeId)!;
    if (!canApproveEntry(actor, emp, employeeUser(db, emp)).ok || entryConflicts(db, entry).length || (entry.noLunch && !entry.noLunch.decision) || entry.dispute?.status === "open") {
      skipped.push(`${emp.name} ${entry.workDate}`);
      continue;
    }
    const r = approveEntry(db, actor, id);
    if (r.ok) approved++;
    else skipped.push(`${emp.name} ${entry.workDate}`);
  }
  if (!approved && !skipped.length) return fail("Nothing in this view is waiting for approval.");
  return ok({ approved, skipped });
}

export function reopenEntry(db: Database, actor: User, entryId: string) {
  if (!can(actor, "time.override")) return denied(db, actor, MODULE, "reopen an approved day", whoCan("time.override"));
  const entry = byId(db.timeEntries, entryId);
  if (!entry) return fail("Entry not found.");
  if (entry.state !== "approved") return fail(entry.state === "locked" || entry.state === "paid" ? "This day is in an export batch. Only an adjustment is possible." : "Only an approved day can be reopened.");
  entry.state = "submitted";
  entry.history.push({ at: now(), by: actor.id, text: "Reopened before export. Approval history kept." });
  log(db, actor, MODULE, `Time: Employee ${byId(db.employees, entry.employeeId)?.name} ${entry.workDate} reopened by ${actor.name}.`);
  return ok();
}

export function overridePunch(db: Database, actor: User, segmentId: string, field: "start" | "end", value: string, reason: string) {
  if (!can(actor, "time.override")) return denied(db, actor, MODULE, "override a punch", whoCan("time.override"));
  const seg = byId(db.timeSegments, segmentId);
  if (!seg) return fail("Punch not found.");
  const entry = db.timeEntries.find((e) => e.employeeId === seg.employeeId && e.workDate === seg.workDate);
  if (!entry) return fail("Entry not found.");
  const locked = entryEditable(entry);
  if (locked) return locked;
  if (!reason.trim()) return fail("An override needs a reason.", "reason");
  const iso = new Date(value).toISOString();
  const other = field === "start" ? seg.end : seg.start;
  if (other && (field === "start" ? iso >= other : iso <= other)) return fail("The punch would end before it starts.", "value");
  const old = seg[field]!;
  seg[field] = iso;
  entry.overrides.push({ segmentId, field, oldValue: old, newValue: iso, reason: reason.trim(), by: actor.id, at: now() });
  entry.history.push({ at: now(), by: actor.id, text: `Override: ${field} ${new Date(old).toLocaleTimeString()} → ${new Date(iso).toLocaleTimeString()}. ${reason.trim()}` });
  log(db, actor, MODULE, `Time: Employee ${byId(db.employees, seg.employeeId)?.name} ${seg.workDate} – ${field} changed from ${new Date(old).toLocaleTimeString()} to ${new Date(iso).toLocaleTimeString()} by ${actor.name}. Reason: ${reason.trim()}`);
  return ok();
}

/* --------------------------- Export batches -------------------------- */

function buildLines(db: Database, weekStart: string, entries: TimeEntry[]) {
  const byEmployee = new Map<string, TimeEntry[]>();
  for (const e of entries) byEmployee.set(e.employeeId, [...(byEmployee.get(e.employeeId) ?? []), e]);
  return [...byEmployee.entries()].map(([employeeId, list]) => {
    const w = employeeWeek(db, employeeId, weekStart, list);
    return { employeeId, entryIds: list.map((e) => e.id), regularMinutes: w.regular, overtimeMinutes: w.overtime, result: "unconfirmed" as const };
  });
}

/** Creating the batch locks its entries. Unapproved time stays out and visibly outstanding. */
export function createBatch(db: Database, actor: User, weekStart: string) {
  if (!can(actor, "payroll.batch")) return denied(db, actor, PAYROLL, "create an export batch", whoCan("payroll.batch"));
  const eligible = weekEntries(db, weekStart).filter((e) => {
    const emp = byId(db.employees, e.employeeId);
    return e.state === "approved" && !e.batchId && emp && exportsTime(emp) && e.dispute?.status !== "open";
  });
  if (!eligible.length) return fail("No approved hourly time is waiting for export in this week.");
  const batch = { id: nextId(db, "pb", "PB-"), weekStart, createdAt: now(), createdBy: actor.id, lines: buildLines(db, weekStart, eligible) };
  db.payrollBatches.unshift(batch);
  for (const e of eligible) {
    e.state = "locked";
    e.batchId = batch.id;
    e.history.push({ at: batch.createdAt, by: actor.id, text: `Locked in export batch ${batch.id}.` });
  }
  const totalMinutes = batch.lines.reduce((a, l) => a + l.regularMinutes + l.overtimeMinutes, 0);
  log(db, actor, PAYROLL, `Payroll Export: Batch ${batch.id} created by ${actor.name} at ${new Date(batch.createdAt).toLocaleString()}, ${eligible.length} entries, ${hm(totalMinutes)} hours. Entries locked.`);
  return ok(batch.id);
}

export function markCsvDownloaded(db: Database, actor: User, batchId: string) {
  if (!can(actor, "time.payrollDetail") && actor.role !== "bookkeeper") return denied(db, actor, PAYROLL, "download the Gusto file", "the Office Manager, Business Owner or Bookkeeper");
  const b = byId(db.payrollBatches, batchId);
  if (!b) return fail("Batch not found.");
  b.csvDownloadedAt = now();
  log(db, actor, PAYROLL, `Payroll Export: Batch ${b.id} CSV downloaded by ${actor.name}. Results stay Unconfirmed until Gusto is checked.`);
  return ok();
}

export function recordResult(db: Database, actor: User, batchId: string, employeeId: string, result: "accepted" | "rejected" | "unconfirmed", note = "") {
  if (!can(actor, "payroll.results")) return denied(db, actor, PAYROLL, "record a provider result", whoCan("payroll.results"));
  const b = byId(db.payrollBatches, batchId);
  const line = b?.lines.find((l) => l.employeeId === employeeId);
  if (!b || !line) return fail("Batch line not found.");
  if (b.paidAt) return fail("This batch is paid. Its results are final.");
  if (result === "rejected" && !note.trim()) return fail("Record why Gusto rejected this line.", "note");
  Object.assign(line, { result, resultNote: note.trim() || undefined, resultBy: actor.id, resultAt: now() });
  log(db, actor, PAYROLL, `Payroll Export: Batch ${b.id} – Employee ${byId(db.employees, employeeId)?.name} result ${result[0].toUpperCase() + result.slice(1)}. Recorded by ${actor.name}`);
  return ok();
}

/** A correction batch contains only the rejected lines. */
export function createCorrectionBatch(db: Database, actor: User, batchId: string) {
  if (!can(actor, "payroll.batch")) return denied(db, actor, PAYROLL, "create a correction batch", whoCan("payroll.batch"));
  const b = byId(db.payrollBatches, batchId);
  if (!b) return fail("Batch not found.");
  const rejected = b.lines.filter((l) => l.result === "rejected" && !l.correctedInBatchId);
  if (!rejected.length) return fail("There are no uncorrected rejected lines in this batch.");
  const nb = {
    id: nextId(db, "pb", "PB-"), weekStart: b.weekStart, createdAt: now(), createdBy: actor.id, correctionOf: b.id,
    lines: rejected.map((l) => ({ employeeId: l.employeeId, entryIds: l.entryIds, regularMinutes: l.regularMinutes, overtimeMinutes: l.overtimeMinutes, result: "unconfirmed" as const })),
  };
  db.payrollBatches.unshift(nb);
  rejected.forEach((l) => (l.correctedInBatchId = nb.id));
  log(db, actor, PAYROLL, `Payroll Export: Batch ${nb.id} created to correct rejected lines from ${b.id} by ${actor.name}`);
  return ok(nb.id);
}

export function markBatchPaid(db: Database, actor: User, batchId: string) {
  if (!can(actor, "payroll.results")) return denied(db, actor, PAYROLL, "record the payroll run as paid", whoCan("payroll.results"));
  const b = byId(db.payrollBatches, batchId);
  if (!b) return fail("Batch not found.");
  if (b.paidAt) return fail("Already recorded as paid.");
  const open = b.lines.filter((l) => l.result === "unconfirmed" || (l.result === "rejected" && !l.correctedInBatchId));
  if (open.length) return fail(`Confirm every line in Gusto first. ${open.map((l) => byId(db.employees, l.employeeId)?.name).join(", ")} ${open.length === 1 ? "is" : "are"} unconfirmed or rejected without a correction batch.`);
  b.paidAt = now();
  b.paidBy = actor.id;
  for (const l of b.lines.filter((x) => x.result === "accepted")) {
    for (const id of l.entryIds) {
      const e = byId(db.timeEntries, id);
      if (e) {
        e.state = "paid";
        e.history.push({ at: b.paidAt, by: actor.id, text: `Paid in ${b.id}.` });
      }
    }
  }
  log(db, actor, PAYROLL, `Payroll Export: Batch ${b.id} recorded as paid by ${actor.name}. Paid entries are now final.`);
  return ok();
}

/** After payment, a correction is a new record on the next paycheck. The paid entry is untouched. */
export function createAdjustment(db: Database, actor: User, employeeId: string, weekStart: string, minutes: number, reason: string) {
  if (!can(actor, "payroll.adjust")) return denied(db, actor, PAYROLL, "create a paid-period adjustment", whoCan("payroll.adjust"));
  const emp = byId(db.employees, employeeId);
  if (!emp) return fail("Employee not found.", "employee");
  if (!minutes || Number.isNaN(minutes)) return fail("Enter the minutes to add or remove.", "minutes");
  if (!reason.trim()) return fail("An adjustment needs a reason.", "reason");
  const paid = weekEntries(db, weekStart).some((e) => e.employeeId === employeeId && e.state === "paid");
  if (!paid) return fail("That week isn't paid for this employee. Correct the entry itself instead.");
  const today = localDay(new Date(now()));
  const friday = addDaysToDay(weekStartOf(today), 4);
  const payday = today <= friday ? friday : addDaysToDay(friday, 7);
  const a = { id: nextId(db, "padj", "PADJ-"), employeeId, weekStart, minutes: Math.round(minutes), reason: reason.trim(), createdBy: actor.id, createdAt: now(), payday };
  db.payrollAdjustments.unshift(a);
  log(db, actor, PAYROLL, `Payroll: Employee ${emp.name} paid-period adjustment ${minutes > 0 ? "+" : ""}${hm(minutes)} hours created by ${actor.name}. Reason: ${a.reason}`);
  return ok(a.id);
}

/** GPS is deleted after 90 days. The time record stays. */
export function purgeGpsData(db: Database, actor: User) {
  if (!can(actor, "payroll.gps")) return denied(db, actor, MODULE, "run GPS retention", whoCan("payroll.gps"));
  const old = gpsToPurge(db.timeSegments, now());
  old.forEach((s) => {
    s.gps = undefined;
    s.location = "purged";
  });
  log(db, actor, MODULE, `Time: GPS retention run by ${actor.name}. Location data deleted from ${old.length} punch${old.length === 1 ? "" : "es"} older than 90 days. Time records kept.`);
  return ok(old.length);
}

/* ------------------------- Rule 3 labour cost ------------------------ */

export function enterLabourCost(db: Database, actor: User, employeeId: string, weekStart: string, amount: number, burdenPct: number) {
  if (!can(actor, "labour.enter")) return denied(db, actor, "Job Costing", "enter labour cost totals", whoCan("labour.enter"));
  const emp = byId(db.employees, employeeId);
  if (!emp) return fail("Employee not found.", "employee");
  if (!carriesLabourCost(emp)) return fail("Subcontractor hours carry zero labour cost. Their invoice supplies the cost.");
  if (!(amount > 0)) return fail("Enter the approved labour cost total from the Gusto run.", "amount");
  if (burdenPct < 0 || burdenPct > 100 || Number.isNaN(burdenPct)) return fail("Burden must be between 0 and 100 percent.", "burden");
  const minutes = approvedJobMinutes(db, employeeId, weekStart);
  if (!minutes.length) return fail(`${emp.name} has no approved hours in that week to allocate against.`);
  const split = allocateLabourCost(amount, burdenPct, minutes);
  const existing = db.labourCosts.find((l) => l.employeeId === employeeId && l.weekStart === weekStart);
  const record = { employeeId, weekStart, amount: roundMoney(amount), burdenPct, enteredBy: actor.id, enteredAt: now(), source: "entered" as const, allocations: split.rows };
  if (existing) Object.assign(existing, record);
  else db.labourCosts.push({ id: nextId(db, "lct", "LCT-"), ...record });
  log(db, actor, "Job Costing", `Job Costing: Period ${weekStart}–${addDaysToDay(weekStart, 6)} – Approved labour cost total entered for ${emp.name} by ${actor.name}. Burden: ${burdenPct}%`);
  return ok();
}

export function setBurden(db: Database, actor: User, pct: number) {
  if (!can(actor, "labour.setBurden")) return denied(db, actor, "Job Costing", "set the burden percentage", whoCan("labour.setBurden"));
  if (Number.isNaN(pct) || pct < 0 || pct > 100) return fail("Burden must be between 0 and 100 percent.", "burden");
  const old = db.payrollSettings.burdenPct;
  db.payrollSettings.burdenPct = pct;
  db.payrollSettings.burdenSetBy = actor.id;
  log(db, actor, "Job Costing", `Job Costing: Burden percentage changed from ${old}% to ${pct}% by ${actor.name}. Applies to totals entered from now on.`);
  return ok();
}

export function recordReconciliation(db: Database, actor: User, month: string, note: string) {
  if (!can(actor, "labour.reconcile")) return denied(db, actor, "Job Costing", "record the monthly labour check", whoCan("labour.reconcile"));
  const totals = db.labourCosts.filter((l) => l.weekStart.slice(0, 7) === month);
  if (!totals.length) return fail("No labour cost totals have been entered for that month.");
  const r = reconcileLabour(totals);
  db.payrollSettings.reconciliations.unshift({ month, by: actor.id, at: now(), ok: r.ok, note: note.trim() || (r.ok ? "Allocated equals entered." : "Mismatch found.") });
  log(db, actor, "Job Costing", `Job Costing: Monthly check for ${month} by ${actor.name}. Allocated ${r.allocated.toFixed(2)} against entered ${r.entered.toFixed(2)} — ${r.ok ? "matches" : "does not match"}.`);
  return ok(r);
}

/* ------------------------------ Mileage ------------------------------ */

export interface MileageDraft {
  employeeId: string;
  date: string;
  purpose: string;
  jobId?: string;
  evidence: { kind: "odometer"; start?: number; end?: number } | { kind: "addresses"; from?: string; to?: string };
  miles?: number;
}

export function submitMileage(db: Database, actor: User, d: MileageDraft) {
  const emp = byId(db.employees, d.employeeId);
  if (!emp) return fail("Choose the employee.", "employee");
  if (emp.userId !== actor.id && !can(actor, "time.clock")) return denied(db, actor, "Mileage", "submit a claim for someone else", "the employee or their Crew Lead");
  const missing = mileageEvidenceMissing(d.evidence);
  if (missing) return fail(missing, "evidence");
  const miles = d.evidence.kind === "odometer" ? d.evidence.end! - d.evidence.start! : d.miles ?? 0;
  if (!(miles > 0)) return fail("Enter the miles for the address route.", "miles");
  if (!d.purpose.trim()) return fail("Say what the trip was for.", "purpose");
  const evidence = d.evidence.kind === "odometer"
    ? { kind: "odometer" as const, start: d.evidence.start!, end: d.evidence.end! }
    : { kind: "addresses" as const, from: d.evidence.from!.trim(), to: d.evidence.to!.trim() };
  const claim = { id: nextId(db, "mil", "MIL-"), employeeId: emp.id, date: new Date(d.date).toISOString(), miles: Math.round(miles * 10) / 10, evidence, purpose: d.purpose.trim(), jobId: d.jobId || undefined, status: "submitted" as const };
  db.mileageClaims.unshift(claim);
  log(db, actor, "Mileage", `Mileage: Employee ${emp.name} ${d.date.slice(0, 10)} – ${claim.miles} miles submitted by ${actor.name}.`);
  return ok(claim.id);
}

export function approveMileage(db: Database, actor: User, id: string) {
  if (!can(actor, "mileage.approve")) return denied(db, actor, "Mileage", "approve a mileage claim", whoCan("mileage.approve"));
  const c = byId(db.mileageClaims, id);
  if (!c || c.status !== "submitted") return fail("Only a submitted claim can be approved.");
  if (!mileageRateOn(c.date, db.mileageRates)) return fail("Current IRS mileage rate not set. The bookkeeper must set it.");
  Object.assign(c, { status: "crew_approved", crewApprovedBy: actor.id, crewApprovedAt: now() });
  log(db, actor, "Mileage", `Mileage: Claim ${c.id} approved by ${actor.name}. Awaiting office review.`);
  return ok();
}

export function reviewMileage(db: Database, actor: User, id: string) {
  if (!can(actor, "mileage.review")) return denied(db, actor, "Mileage", "review a mileage claim", whoCan("mileage.review"));
  const c = byId(db.mileageClaims, id);
  if (!c || c.status !== "crew_approved") return fail("The crew lead approves the claim first.");
  const rate = mileageRateOn(c.date, db.mileageRates);
  if (!rate) return fail("Current IRS mileage rate not set. The bookkeeper must set it.");
  Object.assign(c, { status: "reviewed", reviewedBy: actor.id, reviewedAt: now(), rateId: rate.id, centsPerMile: rate.centsPerMile, amount: mileageAmount(c.miles, rate.centsPerMile) });
  log(db, actor, "Mileage", `Mileage: Employee ${byId(db.employees, c.employeeId)?.name} ${c.date.slice(0, 10)} – ${c.miles} miles at ${rate.centsPerMile}¢ approved by ${userName(db, c.crewApprovedBy)}, reviewed by ${actor.name}`);
  return ok();
}

export function rejectMileage(db: Database, actor: User, id: string, reason: string) {
  if (!can(actor, "mileage.approve") && !can(actor, "mileage.review")) return denied(db, actor, "Mileage", "reject a mileage claim", "the Crew Lead or the office");
  const c = byId(db.mileageClaims, id);
  if (!c || c.status === "reviewed" || c.status === "rejected") return fail("This claim can't be rejected now.");
  if (!reason.trim()) return fail("Say why the claim is rejected.", "reason");
  Object.assign(c, { status: "rejected", rejectedReason: reason.trim() });
  log(db, actor, "Mileage", `Mileage: Claim ${c.id} rejected by ${actor.name}. Reason: ${reason.trim()}`);
  return ok();
}

export function setMileageRate(db: Database, actor: User, year: number, centsPerMile: number) {
  if (!can(actor, "mileage.rate")) return denied(db, actor, "Mileage", "maintain the IRS mileage rate", whoCan("mileage.rate"));
  if (!(centsPerMile > 0) || centsPerMile > 200) return fail("Enter the IRS rate in cents per mile.", "rate");
  if (!(year >= 2000 && year <= 2100)) return fail("Enter the year the rate applies to.", "year");
  const existing = db.mileageRates.find((r) => r.year === year);
  const effectiveFrom = new Date(year, 0, 1).toISOString();
  if (existing) Object.assign(existing, { centsPerMile, setBy: actor.id, setAt: now() });
  else db.mileageRates.push({ id: `IRS-${year}`, year, centsPerMile, effectiveFrom, setBy: actor.id, setAt: now() });
  log(db, actor, "Mileage", `Mileage: IRS rate for ${year} set to ${centsPerMile}¢ per mile by ${actor.name}.`);
  return ok();
}
