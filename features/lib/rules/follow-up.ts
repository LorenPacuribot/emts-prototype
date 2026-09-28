/**
 * Feature 29 — contact schedule, contact window and season recycling.
 */
import { addDays, isHoliday } from "./dates";

/** Contact window: 8:00 a.m. through 7:00 p.m. inclusive, not Sundays or holidays. */
export function inContactWindow(date: Date): { ok: boolean; reason?: string } {
  if (date.getDay() === 0) return { ok: false, reason: "Sundays are outside the contact window." };
  const localDay = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  if (isHoliday(localDay)) return { ok: false, reason: "Holidays are outside the contact window." };
  const minutes = date.getHours() * 60 + date.getMinutes();
  if (minutes < 8 * 60) return { ok: false, reason: "Before 8:00 a.m. is outside the contact window." };
  if (minutes > 19 * 60) return { ok: false, reason: "After 7:00 p.m. is outside the contact window." };
  return { ok: true };
}

/**
 * Attempts on days 1, 14 and 35 from qualification. Day 1 is the
 * qualification day. A Sunday or holiday moves to the next allowed day.
 */
export function attemptSchedule(qualifiedAtIso: string): { day: 1 | 14 | 35; planned: string; movedFrom?: string }[] {
  return ([1, 14, 35] as const).map((day) => {
    const original = addDays(qualifiedAtIso, day - 1);
    let planned = original;
    while (new Date(planned).getUTCDay() === 0 || isHoliday(planned)) planned = addDays(planned, 1);
    return { day, planned, movedFrom: planned !== original ? original : undefined };
  });
}

/**
 * Season recycling (29.Q01): exterior 1 March, interior 1 September.
 * Qualified after the date means next year. Mixed properties use the earlier.
 */
export function recycleDate(qualifiedAtIso: string, kinds: ("interior" | "exterior")[]): string {
  const q = new Date(qualifiedAtIso);
  const next = (month: number) => {
    const thisYear = new Date(Date.UTC(q.getUTCFullYear(), month, 1));
    return thisYear > q ? thisYear : new Date(Date.UTC(q.getUTCFullYear() + 1, month, 1));
  };
  const candidates: Date[] = [];
  if (kinds.includes("exterior")) candidates.push(next(2));
  if (kinds.includes("interior")) candidates.push(next(8));
  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[0].toISOString();
}

/** Escalation clocks (29.Q02), all calendar days. */
export function followUpClocks(opts: { alertCreatedAt: string; qualifiedAt: string; assignedAt?: string; lastOutcomeAt?: string; now: string }) {
  const days = (from: string) => Math.floor((new Date(opts.now).getTime() - new Date(from).getTime()) / 86_400_000);
  if (!opts.assignedAt) {
    const d = days(opts.qualifiedAt);
    return { driving: "unassigned" as const, source: opts.qualifiedAt, days: d, limit: 3, escalated: d >= 3, escalatesTo: "Office manager" };
  }
  const since = opts.lastOutcomeAt && opts.lastOutcomeAt > opts.assignedAt ? opts.lastOutcomeAt : opts.assignedAt;
  const d = days(since);
  return { driving: "assigned" as const, source: since, days: d, limit: 7, escalated: d >= 7, escalatesTo: "Office manager" };
}

export interface ClockState {
  key: "alert" | "unassigned" | "assigned";
  label: string;
  /** Date the clock counts from (shown as "source"). */
  source?: string;
  days?: number;
  limit: number;
  escalatesTo: "Office manager" | "Business owner";
  state: "running" | "stopped" | "not_started";
  escalated: boolean;
  /** Why the clock stopped, when it has. */
  stoppedNote?: string;
}

/**
 * The three escalation clocks of 29.Q02, all in calendar days.
 * - Alert clock: from alert creation, 14 days to qualification → Business owner.
 * - Unassigned clock: from qualification, 3 days to assignment → Office manager.
 * - Assigned clock: from the latest assignment (or the latest recorded outcome), 7 days → Office manager.
 * Reassignment restarts only the assigned clock. Absence restarts nothing.
 * `closed` stops every clock.
 */
export function clockPanel(opts: {
  alertCreatedAt: string;
  qualifiedAt?: string;
  assignedAt?: string;
  lastOutcomeAt?: string;
  closed?: boolean;
  now: string;
}): { clocks: ClockState[]; driving?: ClockState["key"] } {
  const days = (from: string, to = opts.now) => Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);
  const alertClock: ClockState = opts.qualifiedAt
    ? {
        key: "alert", label: "Alert clock (14 days to qualification)", source: opts.alertCreatedAt, days: days(opts.alertCreatedAt, opts.qualifiedAt), limit: 14,
        escalatesTo: "Business owner", state: "stopped", escalated: days(opts.alertCreatedAt, opts.qualifiedAt) >= 14, stoppedNote: "Stopped at qualification",
      }
    : {
        key: "alert", label: "Alert clock (14 days to qualification)", source: opts.alertCreatedAt, days: days(opts.alertCreatedAt), limit: 14,
        escalatesTo: "Business owner", state: opts.closed ? "stopped" : "running", escalated: days(opts.alertCreatedAt) >= 14,
      };

  let unassigned: ClockState = { key: "unassigned", label: "Unassigned clock (3 days to assignment)", limit: 3, escalatesTo: "Office manager", state: "not_started", escalated: false };
  let assigned: ClockState = { key: "assigned", label: "Assigned clock (7 days to an outcome)", limit: 7, escalatesTo: "Office manager", state: "not_started", escalated: false };
  let driving: ClockState["key"] | undefined;

  if (!opts.qualifiedAt) {
    driving = opts.closed ? undefined : "alert";
  } else if (!opts.assignedAt) {
    const d = days(opts.qualifiedAt);
    unassigned = { ...unassigned, source: opts.qualifiedAt, days: d, state: opts.closed ? "stopped" : "running", escalated: d >= 3 };
    driving = opts.closed ? undefined : "unassigned";
  } else {
    const d0 = days(opts.qualifiedAt, opts.assignedAt);
    unassigned = { ...unassigned, source: opts.qualifiedAt, days: d0, state: "stopped", escalated: false, stoppedNote: "Stopped at assignment" };
    const since = opts.lastOutcomeAt && opts.lastOutcomeAt > opts.assignedAt ? opts.lastOutcomeAt : opts.assignedAt;
    const d = days(since);
    assigned = {
      ...assigned, source: since, days: d, state: opts.closed ? "stopped" : "running", escalated: !opts.closed && d >= 7,
      stoppedNote: since !== opts.assignedAt ? "Restarted by the latest recorded outcome" : undefined,
    };
    driving = opts.closed ? undefined : "assigned";
  }
  return { clocks: [alertClock, unassigned, assigned], driving };
}

/** Outcomes that count as a conversation with the customer. An unsuccessful call never does. */
export const CONVERSATION_OUTCOMES = ["reached", "wants_quote", "declined", "opt_out"] as const;

export function isConversation(outcome?: string): boolean {
  return !!outcome && (CONVERSATION_OUTCOMES as readonly string[]).includes(outcome);
}

/** Next season target after three unanswered attempts, from the recycle date (29.Q01). Alias for clarity. */
export function nextSeason(qualifiedAtIso: string, kinds: ("interior" | "exterior")[]): string {
  return recycleDate(qualifiedAtIso, kinds);
}
