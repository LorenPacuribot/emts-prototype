/**
 * Demo clock.
 *
 * Several rules depend on the time of day (the 8 a.m.–7 p.m. contact window,
 * the supplier working-hours clock). A client demo may happen at night, so the
 * Demo bar can pin the clock to 10:30 a.m. on the nearest weekday.
 */

export type ClockMode = "real" | "business_hours";

let mode: ClockMode = "real";

export function setClockMode(next: ClockMode) {
  mode = next;
}

export function getClockMode(): ClockMode {
  return mode;
}

export function nowDate(): Date {
  const real = new Date();
  if (mode === "real") return real;
  const d = new Date(real);
  // Move Sunday to Monday, Saturday to Friday.
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  if (d.getDay() === 6) d.setDate(d.getDate() - 1);
  d.setHours(10, 30, 0, 0);
  return d;
}

export function now(): string {
  return nowDate().toISOString();
}
