/** Date helpers. All dates are ISO strings in the data layer. */

export const DAY_MS = 86_400_000;

export function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();
}

/**
 * Add years keeping the day of month where possible, else the last day of
 * the destination month (27: 15 June 2026 + 7 years = 15 June 2033).
 */
export function addYears(iso: string, years: number): string {
  return addMonths(iso, Math.round(years * 12));
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, d.getUTCHours(), d.getUTCMinutes()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString();
}

export function daysBetween(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / DAY_MS);
}

export function isoDay(iso: string): string {
  return iso.slice(0, 10);
}

/** Observed US federal holidays used by the prototype (2026–2027). */
export const US_HOLIDAYS = new Set([
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19", "2026-07-03",
  "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-05-31", "2027-06-18", "2027-07-05",
  "2027-09-06", "2027-10-11", "2027-11-11", "2027-11-25", "2027-12-24",
]);

export function isHoliday(iso: string): boolean {
  return US_HOLIDAYS.has(isoDay(iso));
}

/**
 * Working hours for supplier acknowledgment (feature 19):
 * Mon–Fri, 7 a.m. to 4 p.m. branch-local, excluding federal holidays.
 * The prototype treats the browser's local time as branch-local.
 * Returns the remaining working minutes out of `budgetHours` since `from`.
 */
export function workingMinutesBetween(fromIso: string, toIso: string): number {
  let t = new Date(fromIso);
  const end = new Date(toIso);
  let minutes = 0;
  // Step in 15-minute blocks: plenty precise for a 4-hour clock.
  while (t < end) {
    const day = t.getDay();
    const h = t.getHours() + t.getMinutes() / 60;
    const localDay = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    if (day >= 1 && day <= 5 && h >= 7 && h < 16 && !US_HOLIDAYS.has(localDay)) minutes += 15;
    t = new Date(t.getTime() + 15 * 60_000);
    if (minutes > 60 * 24 * 10) break;
  }
  return minutes;
}

export function ackClock(sentAtIso: string, nowIso: string, budgetHours = 4) {
  const used = workingMinutesBetween(sentAtIso, nowIso);
  const remaining = budgetHours * 60 - used;
  return { usedMinutes: used, remainingMinutes: remaining, overdue: remaining <= 0 };
}
