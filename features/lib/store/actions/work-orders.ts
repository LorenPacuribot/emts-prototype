/**
 * Work order actions, as the live /work-orders/[id] screen runs them.
 * Each function is one endpoint:
 *
 *   setWorkOrderStatus      PATCH /work-orders/:id/status   (Confirm Deposit, Start Job)
 *   scheduleWorkOrder       PATCH /work-orders/:id/schedule (Schedule / Edit Schedule)
 *   markUnscheduled         POST  /work-orders/:id/mark-unscheduled
 *   logWorkOrderHours       POST  /work-orders/:id/time-entries   (NEW fields: crew member, date, start and end)
 *   updateWorkOrderTimeEntry PATCH /work-orders/:id/time-entries/:entryId
 *   addFieldNote            POST  /work-orders/:id/field-notes
 *   addAttachment           POST  /work-orders/:id/attachments
 *   updateSiteInstructions  PATCH /work-orders/:id/site-instructions
 *   addShift / removeShift  POST / DELETE /work-orders/:id/shifts
 *
 * "Mark Complete" (IN_PROGRESS → COMPLETED) is NEW: it runs the feature 25
 * closeout, and closeJob() in property.ts completes the work order.
 */
import type { Database, Job, User, WorkOrder, WorkOrderStatus } from "@/features/types";
import { can, whoCan } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { byId } from "@/features/lib/selectors";
import { workDateOf } from "@/features/lib/rules/payroll";
import { ensureEntry } from "./workforce";
import { denied, fail, log, nextId, ok } from "../helpers";
import { punchTags } from "@/features/lib/rules/shift-tag";
import { shiftCapacityError } from '@/features/lib/rules/scheduling';
import { addDays, daysInclusive } from '@/components/scheduling/schedule-utils';

const MODULE = "Work Orders";

/** Live LOG_HOURS_ALLOWED_STATUSES. */
export const LOG_HOURS_ALLOWED_STATUSES: WorkOrderStatus[] = ["IN_PROGRESS"];
/** Live field-notes allowed statuses. */
export const FIELD_NOTE_STATUSES: WorkOrderStatus[] = ["SCHEDULED", "IN_PROGRESS"];

export const WO_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  PENDING_DEPOSIT: "Pending Deposit",
  UNSCHEDULED: "Unscheduled",
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
};
export const WO_STATUS_TONE: Record<WorkOrderStatus, "amber" | "gray" | "blue" | "purple" | "green"> = {
  PENDING_DEPOSIT: "amber",
  UNSCHEDULED: "gray",
  SCHEDULED: "blue",
  IN_PROGRESS: "purple",
  COMPLETED: "green",
};

/** The job stage the live app sets from the work order (Scheduled and In Production are system stages). */
const JOB_STAGE_FOR: Partial<Record<WorkOrderStatus, Job["status"]>> = {
  UNSCHEDULED: "unscheduled",
  SCHEDULED: "scheduled",
  IN_PROGRESS: "in_production",
  COMPLETED: "completed",
};

export function workOrderForJob(db: Database, jobId?: string): WorkOrder | undefined {
  return jobId ? db.workOrders.find((w) => w.jobId === jobId) : undefined;
}

function move(db: Database, actor: User, wo: WorkOrder, to: WorkOrderStatus, notes?: string) {
  const from = wo.status;
  wo.status = to;
  wo.statusHistory.push({ id: nextId(db, "wsh", "WSH-"), from, to, by: actor.id, at: now(), notes });
  const job = byId(db.jobs, wo.jobId);
  const stage = JOB_STAGE_FOR[to];
  // Keep a manual stage (Touch Up, Ready for Inspection) while work is in production.
  if (job && stage && !(to === "IN_PROGRESS" && ["touch_up", "ready_for_inspection"].includes(job.status))) job.status = stage;
  log(db, actor, MODULE, `Work order ${wo.id} status changed from ${WO_STATUS_LABEL[from]} to ${WO_STATUS_LABEL[to]} by ${actor.name}`);
}

/** Confirm Deposit (PENDING_DEPOSIT → UNSCHEDULED) and Start Job (SCHEDULED → IN_PROGRESS). */
export function setWorkOrderStatus(db: Database, actor: User, woId: string, to: WorkOrderStatus) {
  if (!can(actor, "workOrder.updateStatus")) return denied(db, actor, MODULE, "change a work order's status", whoCan("workOrder.updateStatus"));
  const wo = byId(db.workOrders, woId);
  if (!wo) return fail("Work order not found.");
  const allowed: Partial<Record<WorkOrderStatus, WorkOrderStatus>> = { PENDING_DEPOSIT: "UNSCHEDULED", SCHEDULED: "IN_PROGRESS" };
  if (to === "COMPLETED") return fail("Mark Complete runs the closeout. Confirm each surface, then close the job.");
  if (allowed[wo.status] !== to) return fail(`A ${WO_STATUS_LABEL[wo.status]} work order can't move to ${WO_STATUS_LABEL[to]}.`);
  if (to === "IN_PROGRESS") wo.startedAt = now();
  move(db, actor, wo, to);
  return ok();
}

export function scheduleWorkOrder(db: Database, actor: User, woId: string, input: { startDate: string; endDate: string; startTime?: string; endTime?: string; preserveShiftTimes?: boolean }) {
  if (!can(actor, "workOrder.manageSchedule")) return denied(db, actor, MODULE, "schedule a work order", whoCan("workOrder.manageSchedule"));
  const wo = byId(db.workOrders, woId);
  if (!wo) return fail("Work order not found.");
  if (byId(db.jobs, wo.jobId)?.scheduleProtected) return fail('Unprotect the schedule before moving this job.');
  if (wo.status === "PENDING_DEPOSIT") return fail("Confirm the deposit before scheduling.");
  if (wo.status === "COMPLETED") return fail("This work order is completed.");
  if (!input.startDate) return fail("Start Date is required.", "startDate");
  if (!input.endDate) return fail("End Date is required.", "endDate");
  if (input.endDate < input.startDate) return fail("End Date must be on or after Start Date.", "endDate");
  const duration = daysInclusive(input.startDate, input.endDate);
  if (!Number.isFinite(duration) || duration > 3660) return fail('Choose a valid date range of at most ten years.');
  const oldStart = wo.shifts.map((s) => s.startDate).sort()[0];
  const oldEnd = wo.shifts.map((s) => s.endDate).sort().at(-1);
  const offset = oldStart ? daysInclusive(oldStart, input.startDate) - 1 : 0;
  const shifts = wo.shifts.map((s) => ({ ...s,
    startDate: addDays(s.startDate, offset),
    endDate: s.startDate === oldStart && s.endDate === oldEnd ? input.endDate : addDays(s.endDate, offset),
    startTime: input.preserveShiftTimes ? s.startTime : input.startTime ?? s.startTime, endTime: input.preserveShiftTimes ? s.endTime : input.endTime ?? s.endTime,
    dailyHours: s.dailyHours && Object.fromEntries(Object.entries(s.dailyHours).map(([day, hours]) => [addDays(day, offset), hours])),
  }));
  if (shifts.some((s) => s.endDate > input.endDate || s.startDate < input.startDate || s.endDate < s.startDate)) return fail('The job dates must contain all assigned shifts.');
  const capacityError = shiftCapacityError(db, woId, shifts);
  if (capacityError) return fail(capacityError);
  wo.shifts = shifts;
  wo.startDate = new Date(`${input.startDate}T08:00:00`).toISOString();
  wo.endDate = new Date(`${input.endDate}T17:00:00`).toISOString();
  const job = byId(db.jobs, wo.jobId);
  if (job) {
    job.scheduleStart = wo.startDate;
    job.scheduleEnd = wo.endDate;
  }
  if (wo.status === "UNSCHEDULED") {
    wo.scheduledAt = now();
    move(db, actor, wo, "SCHEDULED");
  } else {
    log(db, actor, MODULE, `Work order ${wo.id} schedule changed to ${input.startDate} – ${input.endDate} by ${actor.name}`);
  }
  return ok();
}

export function markUnscheduled(db: Database, actor: User, woId: string) {
  if (!can(actor, "workOrder.manageSchedule")) return denied(db, actor, MODULE, "unschedule a work order", whoCan("workOrder.manageSchedule"));
  const wo = byId(db.workOrders, woId);
  if (!wo) return fail("Work order not found.");
  if (byId(db.jobs, wo.jobId)?.scheduleProtected) return fail('Unprotect the schedule before canceling it.');
  if (wo.status !== "SCHEDULED") return fail(`Only available when status is Scheduled (current: ${WO_STATUS_LABEL[wo.status]})`);
  wo.startDate = undefined;
  wo.endDate = undefined;
  const job = byId(db.jobs, wo.jobId);
  if (job) { job.scheduleStart = undefined; job.scheduleEnd = undefined; }
  move(db, actor, wo, "UNSCHEDULED");
  return ok();
}

export interface LogHoursInput {
  entries: { surfaceId: string; hours: number; notes?: string }[];
  /** NEW (feature 22): who did the work (live: always the logged-in user). */
  employeeId?: string;
  /** NEW (feature 22): the work date (live: today). */
  workDate?: string;
  /** NEW (feature 22): start and end ("HH:MM"). When given, the time also goes to payroll as a clock segment. */
  start?: string;
  end?: string;
}

/** Live "Log Rendered Hours" — extended with crew member, date and clock times (feature 22). */
export function logWorkOrderHours(db: Database, actor: User, woId: string, input: LogHoursInput) {
  if (!can(actor, "workOrder.logTime")) return denied(db, actor, MODULE, "log hours", whoCan("workOrder.logTime"));
  const wo = byId(db.workOrders, woId);
  if (!wo) return fail("Work order not found.");
  if (!LOG_HOURS_ALLOWED_STATUSES.includes(wo.status)) {
    return fail(`Cannot log time when work order is in ${wo.status} status. Allowed statuses: ${LOG_HOURS_ALLOWED_STATUSES.join(", ")}.`);
  }
  const job = byId(db.jobs, wo.jobId)!;
  const rows = input.entries.filter((e) => e.hours > 0);
  if (rows.length === 0) return fail("Please enter hours for at least one surface.");
  if (rows.some((e) => !job.surfaceIds.includes(e.surfaceId))) return fail("A surface is not on this work order.");
  const today = workDateOf(now());
  const workDate = input.workDate || today;
  if (workDate > today) return fail("Hours can't be logged for a future date.", "workDate");
  const emp = input.employeeId ? byId(db.employees, input.employeeId) : undefined;
  if (input.employeeId && !emp) return fail("Select a crew member.", "employeeId");

  // NEW (feature 22): start and end times become a payroll segment, so only one place records the day.
  let segmentId: string | undefined;
  if (input.start || input.end) {
    if (!emp) return fail("Select the crew member these times are for.", "employeeId");
    if (!input.start || !input.end) return fail("Enter both a start and an end time.", "end");
    if (input.end <= input.start) return fail("End time must be after the start time.", "end");
    const entry = db.timeEntries.find((x) => x.employeeId === emp.id && x.workDate === workDate);
    if (entry && entry.state !== "open") return fail(`${emp.name}'s time for this day is ${entry.state}. Ask the office to reopen it first.`);
    const [y, m, d] = workDate.split("-").map(Number);
    const at = (hhmm: string) => {
      const [h, mi] = hhmm.split(":").map(Number);
      return new Date(y, m - 1, d, h, mi).toISOString();
    };
    const minutes = (Date.parse(at(input.end)) - Date.parse(at(input.start))) / 60000;
    const logged = rows.reduce((a, e) => a + e.hours, 0);
    if (logged * 60 > minutes + 0.5) return fail(`${logged} hours were entered but ${input.start}–${input.end} is only ${(minutes / 60).toFixed(2)} hours.`, "end");
    segmentId = nextId(db, "ts", "TS-");
    db.timeSegments.push({ id: segmentId, employeeId: emp.id, workDate, jobId: job.id, ...punchTags(db, emp.id, job.id, workDate), activity: "application", start: at(input.start), end: at(input.end), source: "online", location: "captured", clockedBy: actor.id });
    ensureEntry(db, emp.id, workDate);
  }

  const t = now();
  for (const e of rows) {
    wo.timeEntries.push({
      id: nextId(db, "wte", "WTE-"), surfaceId: e.surfaceId, renderedHours: e.hours, notes: e.notes?.trim() || undefined, loggedBy: actor.id, loggedAt: t,
      employeeId: emp?.id, workDate, segmentId,
    });
  }
  const total = rows.reduce((a, e) => a + e.hours, 0);
  log(db, actor, MODULE, `Work order ${wo.id} – ${total} rendered hours logged${emp ? ` for ${emp.name}` : ""} on ${workDate} by ${actor.name}${segmentId ? ` (${input.start}–${input.end}, sent to payroll for approval)` : ""}`);
  return ok(total);
}

export function updateWorkOrderTimeEntry(db: Database, actor: User, woId: string, entryId: string, patch: { renderedHours: number; notes?: string }) {
  if (!can(actor, "workOrder.logTime")) return denied(db, actor, MODULE, "edit logged hours", whoCan("workOrder.logTime"));
  const wo = byId(db.workOrders, woId);
  const e = wo?.timeEntries.find((x) => x.id === entryId);
  if (!wo || !e) return fail("Time entry not found.");
  if (!(patch.renderedHours > 0)) return fail("Please enter valid hours", "renderedHours");
  // NEW (feature 22): approved or exported days are locked.
  if (e.employeeId && e.workDate) {
    const day = db.timeEntries.find((x) => x.employeeId === e.employeeId && x.workDate === e.workDate);
    if (day && day.state !== "open" && day.state !== "submitted") return fail(`This day is ${day.state} for payroll. Ask the office to reopen it first.`);
  }
  const before = e.renderedHours;
  e.renderedHours = patch.renderedHours;
  e.notes = patch.notes?.trim() || undefined;
  log(db, actor, MODULE, `Work order ${wo.id} – Time entry ${entryId} changed from ${before} to ${patch.renderedHours} hours by ${actor.name}`);
  return ok();
}

export function addFieldNote(db: Database, actor: User, woId: string, content: string) {
  if (!can(actor, "workOrder.addNotes")) return denied(db, actor, MODULE, "add a field note", whoCan("workOrder.addNotes"));
  const wo = byId(db.workOrders, woId);
  if (!wo) return fail("Work order not found.");
  if (!FIELD_NOTE_STATUSES.includes(wo.status)) return fail("Notes can only be added while the work order is Scheduled or In Progress.");
  if (!content.trim()) return fail("Write a note first.", "content");
  wo.fieldNotes.unshift({ id: nextId(db, "fn", "FN-"), content: content.trim(), authorId: actor.id, createdAt: now() });
  return ok();
}

export function addAttachment(db: Database, actor: User, woId: string, input: { fileName: string; fileType: string; fileSize?: number; caption?: string; surfaceId?: string }) {
  if (!can(actor, "workOrder.addAttachments")) return denied(db, actor, MODULE, "upload a file", whoCan("workOrder.addAttachments"));
  const wo = byId(db.workOrders, woId);
  if (!wo) return fail("Work order not found.");
  if (!input.fileName.trim()) return fail("Choose a file.");
  if (input.surfaceId && !byId(db.jobs, wo.jobId)?.surfaceIds.includes(input.surfaceId)) return fail("That surface isn't in this job's scope.", "surfaceId");
  wo.attachments.unshift({
    id: nextId(db, "att", "ATT-"), fileName: input.fileName.trim(), fileType: input.fileType, fileSize: input.fileSize,
    caption: input.caption?.trim() || undefined, surfaceId: input.surfaceId || undefined, createdAt: now(), by: actor.id,
  });
  log(db, actor, MODULE, `Work order ${wo.id} – File "${input.fileName.trim()}" uploaded by ${actor.name} (recorded, not stored: prototype)`);
  return ok();
}

export function updateSiteInstructions(db: Database, actor: User, woId: string, patch: Partial<Pick<WorkOrder, "gateCode" | "accessNotes" | "areasExcluded" | "existingConditions" | "companyResponsibilities" | "customerResponsibilities">>) {
  if (!can(actor, "workOrder.addNotes")) return denied(db, actor, MODULE, "edit site instructions", whoCan("workOrder.addNotes"));
  const wo = byId(db.workOrders, woId);
  if (!wo) return fail("Work order not found.");
  Object.assign(wo, patch);
  return ok();
}

export function addShift(db: Database, actor: User, woId: string, input: { name?: string; startDate: string; endDate: string; startTime: string; endTime: string; memberIds: string[] }) {
  if (!can(actor, "workOrder.manageCrew")) return denied(db, actor, MODULE, "assign crew", whoCan("workOrder.manageCrew"));
  const wo = byId(db.workOrders, woId);
  if (!wo) return fail("Work order not found.");
  if (!input.startDate || !input.endDate) return fail("Start Date and End Date are required.", "startDate");
  if (input.endDate < input.startDate) return fail("End Date must be on or after Start Date.", "endDate");
  if (!input.startTime || !input.endTime || input.endTime <= input.startTime) return fail("Default End must be after Default Start.", "endTime");
  if (input.memberIds.length === 0) return fail("No crew members selected. Search above to add.", "memberIds");
  const capacityError = shiftCapacityError(db, woId, [...wo.shifts, { ...input, id: 'proposed-shift' }], false);
  if (capacityError) return fail(capacityError, 'memberIds');
  wo.shifts.push({ id: nextId(db, "shift", "SH-"), ...input });
  const job = byId(db.jobs, wo.jobId);
  if (job) job.crewAssignments = undefined;
  log(db, actor, MODULE, `Work order ${wo.id} – Shift "${input.name || "Unnamed Shift"}" added by ${actor.name}`);
  return ok();
}

export function removeShift(db: Database, actor: User, woId: string, shiftId: string) {
  if (!can(actor, "workOrder.manageCrew")) return denied(db, actor, MODULE, "remove a shift", whoCan("workOrder.manageCrew"));
  const wo = byId(db.workOrders, woId);
  if (!wo) return fail("Work order not found.");
  wo.shifts = wo.shifts.filter((s) => s.id !== shiftId);
  const job = byId(db.jobs, wo.jobId);
  if (job) job.crewAssignments = undefined;
  return ok();
}

/** Estimated hours per surface and per work order (live WOSurface.estimatedHours / renderedHours). */
export function renderedHoursBySurface(wo: WorkOrder): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of wo.timeEntries) m.set(e.surfaceId, (m.get(e.surfaceId) ?? 0) + e.renderedHours);
  return m;
}
