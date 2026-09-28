/**
 * Feature 22 — Employee Hours And Payroll.
 *
 * Pure time rules: lunch deduction, daily rounding, proportional job
 * allocation (Rule 5), overtime attribution, approver routing, dispute
 * routing, conflicts and the payroll calendar. Estimate Master classifies
 * time; it holds no pay rates and calculates no pay (Rule 3).
 *
 * All times are the configured local timezone. The prototype uses the
 * browser's local time for it.
 */
import type { ActivityCode, Employee, MileageRate, Role, TimeEntry, TimeSegment, User } from "@/features/types";
import { allocateInteger, compareJobNumber } from "./allocation";
import { roundMoney } from "./rounding";
import { isWorkingDay } from "./change-orders";

export const LUNCH_THRESHOLD_MIN = 6 * 60;
export const LUNCH_MIN = 30;
export const ROUND_TO_MIN = 15;
export const OVERTIME_WEEK_MIN = 40 * 60;
export const GPS_RETENTION_DAYS = 90;

export const ACTIVITY_LABEL: Record<ActivityCode, string> = {
  application: "Application",
  preparation: "Preparation",
  travel: "Travel",
  shop_setup: "Shop or setup",
  training: "Training",
  rained_out: "Rained out",
};

/** Training and rained-out time is overhead: never charged to a job. */
export const OVERHEAD_ACTIVITIES: ActivityCode[] = ["training", "rained_out"];

export function jobForActivity(activity: ActivityCode, jobId?: string): string | undefined {
  return OVERHEAD_ACTIVITIES.includes(activity) ? undefined : jobId;
}

/* ------------------------------ Calendar ----------------------------- */

export function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Local calendar day a shift belongs to: its start date, even across midnight or a week boundary. */
export function workDateOf(startIso: string): string {
  return localDay(new Date(startIso));
}

function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDaysToDay(day: string, n: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return localDay(d);
}

/** The workweek runs Monday 00:00 to Sunday 23:59. */
export function weekStartOf(day: string): string {
  const d = parseDay(day);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return localDay(d);
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysToDay(weekStart, i));
}

/** Payday is weekly on Friday, covering the prior week. */
export function paydayFor(weekStart: string): string {
  return addDaysToDay(weekStart, 11);
}

/* ---------------------------- Daily totals --------------------------- */

/** Actual elapsed minutes. Timestamps make this correct across daylight-saving changes. */
export function elapsedMinutes(startIso: string, endIso: string): number {
  return Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000));
}

/** Segments that count: finished, synchronised and not superseded by a conflict choice. */
export function countedSegments(segments: TimeSegment[]): TimeSegment[] {
  return segments.filter((s) => s.end && !s.queued && !s.supersededAt);
}

/** For a shift longer than six hours, 30 minutes of lunch is deducted unless a no-lunch flag is approved. */
export function lunchDeduction(workedMinutes: number, noLunchApproved = false): number {
  return workedMinutes > LUNCH_THRESHOLD_MIN && !noLunchApproved ? LUNCH_MIN : 0;
}

/**
 * Daily total after lunch, rounded to the nearest 15 minutes with the tie at
 * the half-quarter rounding upward. The spec's worked example (7 h 37 → 7 h 45)
 * puts the half-quarter at 7 whole minutes, so 7 or more rounds up.
 * Individual punches are never rounded.
 */
export function roundDailyMinutes(netMinutes: number): number {
  const m = Math.max(0, Math.round(netMinutes));
  const r = m % ROUND_TO_MIN;
  return r >= 7 ? m - r + ROUND_TO_MIN : m - r;
}

export interface JobMinutes {
  jobId?: string;
  /** Minutes recorded on the punches for this job (or overhead). */
  recorded: number;
  /** Share of the rounded daily total. */
  allocated: number;
  /** Earliest punch start, for overtime ordering. */
  firstStart: string;
}

export interface DayTotals {
  workedMinutes: number;
  lunchMinutes: number;
  netMinutes: number;
  roundedMinutes: number;
  byJob: JobMinutes[];
  residualTo?: string;
}

/**
 * Rounded daily time is allocated in proportion to recorded job minutes. The
 * residual goes to the job with the most hours; tied jobs go to the lowest
 * job number (Rule 5).
 */
export function dayTotals(segments: TimeSegment[], noLunchApproved = false): DayTotals {
  const counted = countedSegments(segments);
  const buckets = new Map<string, JobMinutes>();
  for (const s of counted) {
    const key = s.jobId ?? "OVERHEAD";
    const b = buckets.get(key) ?? { jobId: s.jobId, recorded: 0, allocated: 0, firstStart: s.start };
    b.recorded += elapsedMinutes(s.start, s.end!);
    if (s.start < b.firstStart) b.firstStart = s.start;
    buckets.set(key, b);
  }
  const byJob = [...buckets.values()].sort((a, b) => a.firstStart.localeCompare(b.firstStart));
  const workedMinutes = byJob.reduce((a, b) => a + b.recorded, 0);
  const lunchMinutes = lunchDeduction(workedMinutes, noLunchApproved);
  const netMinutes = Math.max(0, workedMinutes - lunchMinutes);
  const roundedMinutes = roundDailyMinutes(netMinutes);
  const split = allocateInteger(roundedMinutes, byJob.map((b) => ({ jobId: b.jobId, weight: b.recorded })));
  split.rows.forEach((r, i) => (byJob[i].allocated = r.amount));
  return { workedMinutes, lunchMinutes, netMinutes, roundedMinutes, byJob, residualTo: split.receiver };
}

/* ------------------------------ Overtime ----------------------------- */

export interface ClassifiedDay {
  workDate: string;
  jobs: { jobId?: string; regular: number; overtime: number }[];
}

/**
 * Hourly overtime starts above 40 hours in the week. Overtime is attributed
 * to the last hours of the week, and to the jobs where those hours fell.
 */
export function classifyWeek(days: { workDate: string; byJob: JobMinutes[] }[]): { regular: number; overtime: number; days: ClassifiedDay[] } {
  let running = 0;
  const out: ClassifiedDay[] = [];
  for (const day of [...days].sort((a, b) => a.workDate.localeCompare(b.workDate))) {
    const jobs = [...day.byJob]
      .sort((a, b) => a.firstStart.localeCompare(b.firstStart))
      .map((j) => {
        const regular = Math.max(0, Math.min(j.allocated, OVERTIME_WEEK_MIN - running));
        running += j.allocated;
        return { jobId: j.jobId, regular, overtime: j.allocated - regular };
      });
    out.push({ workDate: day.workDate, jobs });
  }
  const regular = out.reduce((a, d) => a + d.jobs.reduce((x, j) => x + j.regular, 0), 0);
  const overtime = out.reduce((a, d) => a + d.jobs.reduce((x, j) => x + j.overtime, 0), 0);
  return { regular, overtime, days: out };
}

/** Salaried staff have job-cost time only. Subcontractor hours carry zero labour cost. */
export function exportsTime(e: Employee): boolean {
  return e.type === "hourly";
}

export function carriesLabourCost(e: Employee): boolean {
  return e.type !== "subcontractor";
}

/* ------------------------------ Conflicts ---------------------------- */

function overlaps(a: TimeSegment, b: TimeSegment): boolean {
  const aEnd = a.end ?? "9999";
  const bEnd = b.end ?? "9999";
  return a.start < bEnd && b.start < aEnd;
}

/**
 * An offline punch that overlaps a later online punch for the same employee
 * is a conflict. Both are kept; the crew lead chooses; never merged.
 */
export function conflictPairs(segments: TimeSegment[]): [TimeSegment, TimeSegment][] {
  const live = segments.filter((s) => !s.supersededAt && !s.queued);
  const pairs: [TimeSegment, TimeSegment][] = [];
  for (const off of live.filter((s) => s.source === "offline")) {
    for (const on of live.filter((s) => s.source === "online" && s.employeeId === off.employeeId)) {
      if (overlaps(off, on)) pairs.push([off, on]);
    }
  }
  return pairs;
}

/** A second simultaneous punch for the same employee is blocked. */
export function openSegment(segments: TimeSegment[], employeeId: string): TimeSegment | undefined {
  return segments.find((s) => s.employeeId === employeeId && !s.end && !s.supersededAt);
}

/* ------------------------------ Approval ----------------------------- */

export interface ApproverRule {
  roles: Role[];
  label: string;
}

/**
 * 22.Q02: the office manager approves crew time, with the owner covering
 * absence. The owner approves office-manager and bookkeeper hours. The
 * bookkeeper approves the owner's own time. Nobody approves their own time.
 */
export function approverFor(employeeUserRole?: Role): ApproverRule {
  if (employeeUserRole === "owner") return { roles: ["bookkeeper"], label: "the Bookkeeper" };
  if (employeeUserRole === "office_manager" || employeeUserRole === "bookkeeper") return { roles: ["owner"], label: "the Business Owner" };
  return { roles: ["office_manager", "owner"], label: "the Office Manager (the Business Owner covers absence)" };
}

export function canApproveEntry(approver: User, employee: Employee, employeeUser?: User): { ok: boolean; reason?: string } {
  if (employee.userId && employee.userId === approver.id) return { ok: false, reason: `Nobody approves their own time. ${approverFor(employeeUser?.role).label} approves this entry.` };
  const rule = approverFor(employeeUser?.role);
  if (!rule.roles.includes(approver.role)) return { ok: false, reason: `${employee.name}'s time is approved by ${rule.label}.` };
  return { ok: true };
}

/* ------------------------------ Disputes ----------------------------- */

/** Wednesday noon of the pay week (the week after the work week). */
export function disputeCutoff(weekStart: string): Date {
  const d = parseDay(addDaysToDay(weekStart, 9));
  d.setHours(12, 0, 0, 0);
  return d;
}

/**
 * Disputes go to the crew lead and office manager until Wednesday noon, then
 * to the business owner. A later dispute raised before batch creation reopens
 * that one entry and moves it to the next batch (22.Q02).
 */
export function disputeRoute(raisedAtIso: string, weekStart: string, batchCreated: boolean) {
  const late = new Date(raisedAtIso) > disputeCutoff(weekStart);
  return {
    routedTo: late ? ("owner" as const) : ("crew_lead_office" as const),
    moveToNextBatch: late && !batchCreated,
    blocked: batchCreated,
  };
}

/** Attestation is due by the end of the next working day. */
export function attestationDue(workDate: string): Date {
  const d = parseDay(workDate);
  do d.setDate(d.getDate() + 1);
  while (!isWorkingDay(d));
  d.setHours(23, 59, 0, 0);
  return d;
}

export function isAttestationOverdue(entry: Pick<TimeEntry, "workDate" | "attestedAt">, nowIso: string): boolean {
  return !entry.attestedAt && new Date(nowIso) > attestationDue(entry.workDate);
}

/**
 * Missing time is flagged on Monday at 7 a.m. against the 9 a.m. cutoff: an
 * hourly employee with no time on a weekday of the finished week.
 */
export function missingTimeDays(employee: Employee, entries: TimeEntry[], weekStart: string, nowIso: string): string[] {
  if (employee.type !== "hourly" || employee.offboardedAt) return [];
  const flagAt = parseDay(addDaysToDay(weekStart, 7));
  flagAt.setHours(7, 0, 0, 0);
  if (new Date(nowIso) < flagAt) return [];
  return weekDays(weekStart)
    .slice(0, 5)
    .filter((day) => !entries.some((e) => e.employeeId === employee.id && e.workDate === day));
}

/* ------------------------------- GPS -------------------------------- */

/** GPS data is kept 90 days, then deleted. The time record stays for seven years. */
export function gpsToPurge(segments: TimeSegment[], nowIso: string): TimeSegment[] {
  const cutoff = new Date(nowIso).getTime() - GPS_RETENTION_DAYS * 86_400_000;
  return segments.filter((s) => s.gps && new Date(s.start).getTime() < cutoff);
}

/* ------------------------------ Mileage ------------------------------ */

/** The current IRS rate on the claim date, from the bookkeeper's record. Never hard-coded. */
export function mileageRateOn(dateIso: string, rates: MileageRate[]): MileageRate | undefined {
  const year = new Date(dateIso).getFullYear();
  return rates
    .filter((r) => r.year === year && r.effectiveFrom <= dateIso)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

export function mileageAmount(miles: number, centsPerMile: number): number {
  return roundMoney((miles * centsPerMile) / 100);
}

export function mileageEvidenceMissing(e: { kind: "odometer"; start?: number; end?: number } | { kind: "addresses"; from?: string; to?: string }): string | undefined {
  if (e.kind === "odometer") {
    if (e.start === undefined || e.end === undefined || Number.isNaN(e.start) || Number.isNaN(e.end)) return "Enter both odometer readings, or switch to job addresses.";
    if (e.end <= e.start) return "The end reading must be higher than the start reading.";
    return undefined;
  }
  if (!e.from?.trim() || !e.to?.trim()) return "Enter both the from and to addresses, or switch to odometer readings.";
  return undefined;
}

/* --------------------------- Display helpers ------------------------- */

export function hm(minutes: number): string {
  const m = Math.round(minutes);
  const sign = m < 0 ? "−" : "";
  const a = Math.abs(m);
  return `${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
}

export function hours(minutes: number, digits = 2): string {
  return (minutes / 60).toFixed(digits);
}

export function sortJobs<T extends { jobId?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.jobId && b.jobId ? compareJobNumber(a.jobId, b.jobId) : a.jobId ? -1 : 1));
}
