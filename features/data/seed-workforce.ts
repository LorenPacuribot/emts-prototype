/**
 * Feature 22 seed: crew time across three weeks, relative to "now".
 *
 * - Two weeks ago (paid): batch PB-1, one line rejected by Gusto and
 *   corrected in PB-2, labour cost totals entered (Rule 3), one
 *   next-paycheck adjustment.
 * - Last week (in review): overtime, travel between jobs, rained-out
 *   overhead, a no-lunch flag waiting for the office, an open dispute, an
 *   unattested day, an offline/online conflict, a denied location, missing
 *   Monday time, the office manager's and owner's own time, and a
 *   subcontractor day. No export batch yet.
 * - This week: open days so far, two crew members clocked in now, and one
 *   offline punch still queued on the crew lead's phone.
 */
import type { ActivityCode, Crew, Employee, LabourCostTotal, MileageClaim, PayrollBatch, TimeEntry, TimeSegment } from "@/features/types";
import { addDaysToDay, classifyWeek, dayTotals, localDay, weekStartOf } from "@/features/lib/rules/payroll";
import { allocateLabourCost } from "@/features/lib/rules/labour-cost";
import { addDays, addMonths } from "@/features/lib/rules/dates";

type Part = [start: string, end: string | null, jobId: string | null, activity?: ActivityCode, extra?: Partial<TimeSegment>];

export function workforceSeed(nowIso: string) {
  const nowMs = new Date(nowIso).getTime();
  const today = localDay(new Date(nowIso));
  const W0 = weekStartOf(today);
  const W1 = addDaysToDay(W0, -7);
  const W2 = addDaysToDay(W0, -14);
  const at = (day: string, hhmm: string) => {
    const [y, m, d] = day.split("-").map(Number);
    const [h, mi] = hhmm.split(":").map(Number);
    return new Date(y, m - 1, d, h, mi).toISOString();
  };
  /** Never let a seeded "past" event land in the future. */
  const past = (iso: string) => (new Date(iso).getTime() > nowMs ? nowIso : iso);

  let ts = 0;
  let te = 0;
  const segments: TimeSegment[] = [];
  const entries: TimeEntry[] = [];

  function day(employeeId: string, workDate: string, parts: Part[], entry: Partial<TimeEntry> = {}) {
    for (const [s, e, job, activity = "application", extra] of parts) {
      segments.push({
        id: `TS-${++ts}`, employeeId, workDate, jobId: job ?? undefined, activity, start: at(workDate, s), end: e ? at(workDate, e) : undefined,
        source: "online", location: "captured", gps: { lat: 32.78 + (ts % 9) / 1000, lng: -96.8 - (ts % 7) / 1000 }, clockedBy: "U-CREW", ...extra,
      });
    }
    const e: TimeEntry = {
      id: `TE-${++te}`, employeeId, workDate, state: "open", overrides: [], history: [],
      attestedAt: past(at(addDaysToDay(workDate, 1), "17:00")), ...entry,
    };
    entries.push(e);
    return e;
  }

  const approved = (w: string): Partial<TimeEntry> => ({
    state: "approved", submittedAt: past(at(addDaysToDay(w, 4), "16:30")), submittedBy: "U-CREW",
    approvedBy: "U-OFFICE", approvedAt: past(at(addDaysToDay(w, 7), "09:00")),
    history: [{ at: past(at(addDaysToDay(w, 4), "16:30")), by: "U-CREW", text: "Submitted." }, { at: past(at(addDaysToDay(w, 7), "09:00")), by: "U-OFFICE", text: "Approved." }],
  });
  const submitted = (w: string): Partial<TimeEntry> => ({
    state: "submitted", submittedAt: past(at(addDaysToDay(w, 4), "16:30")), submittedBy: "U-CREW",
    history: [{ at: past(at(addDaysToDay(w, 4), "16:30")), by: "U-CREW", text: "Submitted." }],
  });

  const CREW = ["EMP-1", "EMP-2", "EMP-3", "EMP-4"];
  const full = (job: string): Part[] => [["07:00", "15:30", job]];

  /* ------------------------ Two weeks ago: paid ------------------------ */
  const w2Days = [0, 1, 2, 3, 4].map((i) => addDaysToDay(W2, i));
  for (const emp of CREW) {
    w2Days.forEach((d, i) => day(emp, d, full(i < 3 ? "JOB-2026-5" : "JOB-2026-1"), { state: "paid", batchId: emp === "EMP-3" ? "PB-2" : "PB-1" }));
  }
  day("EMP-1", addDaysToDay(W2, 5), [["07:00", "11:00", "JOB-2026-1", "shop_setup"]], { state: "paid", batchId: "PB-1" });

  /* ---------------------- Last week: in review ------------------------- */
  const w1 = (i: number) => addDaysToDay(W1, i);
  // Luis — crew lead. Overtime, and travel between jobs on Wednesday.
  day("EMP-1", w1(0), [["07:00", "16:00", "JOB-2026-5"]], approved(W1));
  day("EMP-1", w1(1), [["07:00", "16:00", "JOB-2026-5"]], approved(W1));
  day("EMP-1", w1(2), [["07:00", "09:00", "JOB-2026-5"], ["09:00", "09:30", "JOB-2026-1", "travel"], ["09:30", "16:00", "JOB-2026-1"]], approved(W1));
  day("EMP-1", w1(3), [["07:00", "16:00", "JOB-2026-1"]], approved(W1));
  day("EMP-1", w1(4), [["07:00", "16:00", "JOB-2026-1"]], approved(W1));
  day("EMP-1", w1(5), [["07:00", "10:30", "JOB-2026-1", "shop_setup"]], approved(W1));
  // José — no-lunch flag waiting for the office; rained out Thursday (overhead).
  day("EMP-2", w1(0), full("JOB-2026-5"), approved(W1));
  day("EMP-2", w1(1), [["07:00", "14:30", "JOB-2026-5"]], {
    ...submitted(W1),
    noLunch: { reason: "Crew worked through lunch to finish the ceiling before the primer cured.", by: "U-CREW", at: past(at(w1(1), "14:40")) },
  });
  day("EMP-2", w1(2), full("JOB-2026-1"), approved(W1));
  day("EMP-2", w1(3), [["07:00", "09:30", null, "rained_out"]], approved(W1));
  day("EMP-2", w1(4), full("JOB-2026-1"), submitted(W1));
  // Ana — open dispute on Wednesday; Friday submitted without attestation.
  day("EMP-3", w1(0), full("JOB-2026-5"), approved(W1));
  day("EMP-3", w1(1), full("JOB-2026-5"), approved(W1));
  day("EMP-3", w1(2), [["07:00", "16:00", "JOB-2026-1"]], {
    ...submitted(W1),
    dispute: { raisedAt: past(at(w1(3), "18:05")), raisedBy: "U-CREW", note: "Ana (on the crew lead's phone): clock-out should be 4:30 p.m. — she stayed to clean the sprayer.", routedTo: "crew_lead_office", status: "open" },
  });
  day("EMP-3", w1(3), full("JOB-2026-1"), approved(W1));
  day("EMP-3", w1(4), full("JOB-2026-1"), { ...submitted(W1), attestedAt: undefined, unattested: true });
  // Kevin — no Monday time; Wednesday offline/online conflict; Thursday location denied.
  day("EMP-4", w1(1), full("JOB-2026-1"), approved(W1));
  day("EMP-4", w1(2), [
    ["07:00", "15:30", "JOB-2026-1", "application", { source: "offline", syncedAt: past(at(w1(2), "18:10")), gps: undefined, location: "captured" }],
    ["07:20", "15:40", "JOB-2026-1", "application"],
  ], submitted(W1));
  day("EMP-4", w1(3), [["07:00", "15:30", "JOB-2026-1", "application", { location: "denied", gps: undefined }]], submitted(W1));
  day("EMP-4", w1(4), full("JOB-2026-1"), submitted(W1));
  // Office manager and owner job-coded time; subcontractor day.
  day("EMP-5", w1(1), [["10:00", "12:00", "JOB-2026-1", "preparation", { clockedBy: "U-OFFICE" }]], { ...submitted(W1), submittedBy: "U-OFFICE" });
  day("EMP-6", w1(3), [["14:00", "15:30", "JOB-2026-5", "preparation", { clockedBy: "U-OWNER" }]], { ...submitted(W1), submittedBy: "U-OWNER" });
  day("EMP-8", w1(1), [["08:00", "16:00", "JOB-2026-5", "preparation"]], approved(W1));

  /* ----------------------------- This week ----------------------------- */
  for (let i = 0; i < 5; i++) {
    const d = addDaysToDay(W0, i);
    if (d >= today) break;
    for (const emp of CREW) day(emp, d, full("JOB-2026-1"), emp === "EMP-4" ? { attestedAt: undefined } : {});
  }
  const hour = new Date(nowIso).getHours() + new Date(nowIso).getMinutes() / 60;
  const weekday = new Date(nowIso).getDay() >= 1 && new Date(nowIso).getDay() <= 5;
  if (weekday && hour >= 7.5 && hour < 17) {
    day("EMP-1", today, [["07:00", null, "JOB-2026-1"]], { attestedAt: undefined });
    day("EMP-2", today, [["07:00", null, "JOB-2026-1"]], { attestedAt: undefined });
    day("EMP-4", today, [["07:05", null, "JOB-2026-1", "application", { source: "offline", queued: true, gps: undefined }]], { attestedAt: undefined });
  }

  /* -------------------- Older punch with GPS (> 90 days) --------------- */
  const oldDay = localDay(new Date(addDays(nowIso, -95)));
  day("EMP-1", oldDay, [["07:00", "09:00", "JOB-2026-1", "shop_setup"]], { state: "paid" });

  /* ------------------------------ Batches ------------------------------ */
  const lineFor = (employeeId: string, batchEntries: TimeEntry[]) => {
    const list = batchEntries.filter((e) => e.employeeId === employeeId);
    const w = classifyWeek(list.map((e) => ({ workDate: e.workDate, byJob: dayTotals(segments.filter((s) => s.employeeId === employeeId && s.workDate === e.workDate)).byJob })));
    return { employeeId, entryIds: list.map((e) => e.id), regularMinutes: w.regular, overtimeMinutes: w.overtime };
  };
  const w2Entries = entries.filter((e) => e.workDate >= W2 && e.workDate <= addDaysToDay(W2, 6));
  const createdPb1 = past(at(addDaysToDay(W2, 8), "09:00"));
  const paidAt = past(at(addDaysToDay(W2, 11), "10:00"));
  const batches: PayrollBatch[] = [
    {
      id: "PB-2", weekStart: W2, createdAt: past(at(addDaysToDay(W2, 9), "11:30")), createdBy: "U-OFFICE", correctionOf: "PB-1", csvDownloadedAt: past(at(addDaysToDay(W2, 9), "11:32")), paidAt, paidBy: "U-BOOK",
      lines: [{ ...lineFor("EMP-3", w2Entries), result: "accepted", resultBy: "U-BOOK", resultAt: past(at(addDaysToDay(W2, 10), "09:00")) }],
    },
    {
      id: "PB-1", weekStart: W2, createdAt: createdPb1, createdBy: "U-OFFICE", csvDownloadedAt: past(at(addDaysToDay(W2, 8), "09:05")), paidAt, paidBy: "U-BOOK",
      lines: [
        { ...lineFor("EMP-1", w2Entries), result: "accepted", resultBy: "U-BOOK", resultAt: past(at(addDaysToDay(W2, 9), "10:00")) },
        { ...lineFor("EMP-2", w2Entries), result: "accepted", resultBy: "U-BOOK", resultAt: past(at(addDaysToDay(W2, 9), "10:00")) },
        { ...lineFor("EMP-3", w2Entries), result: "rejected", resultNote: "Gusto: employee ID G-1043 not found — onboarding step incomplete.", resultBy: "U-BOOK", resultAt: past(at(addDaysToDay(W2, 9), "10:00")), correctedInBatchId: "PB-2" },
        { ...lineFor("EMP-4", w2Entries), result: "accepted", resultBy: "U-BOOK", resultAt: past(at(addDaysToDay(W2, 9), "10:00")) },
      ],
    },
  ];

  /* ------------------------- Rule 3 labour cost ------------------------ */
  const wages: Record<string, number> = { "EMP-1": 1426, "EMP-2": 1120, "EMP-3": 1064, "EMP-4": 1008 };
  const labourCosts: LabourCostTotal[] = CREW.map((employeeId, i) => {
    const minutes = new Map<string, { jobId?: string; minutes: number }>();
    for (const e of w2Entries.filter((x) => x.employeeId === employeeId)) {
      for (const j of dayTotals(segments.filter((s) => s.employeeId === employeeId && s.workDate === e.workDate)).byJob) {
        const key = j.jobId ?? "OVERHEAD";
        minutes.set(key, { jobId: j.jobId, minutes: (minutes.get(key)?.minutes ?? 0) + j.allocated });
      }
    }
    const rows = [...minutes.values()];
    return {
      id: `LCT-${i + 1}`, employeeId, weekStart: W2, amount: wages[employeeId], burdenPct: 18, enteredBy: "U-BOOK", enteredAt: paidAt,
      source: "entered", allocations: allocateLabourCost(wages[employeeId], 18, rows).rows,
    };
  });

  /* ------------------------------ Mileage ------------------------------ */
  const mileageClaims: MileageClaim[] = [
    { id: "MIL-3", employeeId: "EMP-2", date: at(w1(1), "12:00"), miles: 42, evidence: { kind: "odometer", start: 48211, end: 48253 }, purpose: "Paint pickup at SW 7132 for JOB-2026-1", jobId: "JOB-2026-1", status: "submitted" },
    { id: "MIL-2", employeeId: "EMP-3", date: at(w1(2), "12:00"), miles: 18.4, evidence: { kind: "addresses", from: "17 Brookside Ct, Richardson", to: "1314 Maple Ridge Dr, Dallas" }, purpose: "Moved the sprayer between jobs", jobId: "JOB-2026-1", status: "crew_approved", crewApprovedBy: "U-CREW", crewApprovedAt: past(at(w1(3), "08:00")) },
    { id: "MIL-1", employeeId: "EMP-1", date: at(addDaysToDay(W2, 3), "12:00"), miles: 22.6, evidence: { kind: "addresses", from: "Shop, 410 Commerce Park, Dallas", to: "SW 7248 Plano Parkway" }, purpose: "Tint match pickup", jobId: "JOB-2026-5", status: "reviewed", crewApprovedBy: "U-CREW", crewApprovedAt: past(at(addDaysToDay(W2, 4), "08:00")), reviewedBy: "U-OFFICE", reviewedAt: past(at(addDaysToDay(W2, 7), "09:00")), rateId: `IRS-${new Date(nowIso).getFullYear()}`, centsPerMile: 70, amount: 15.82 },
  ];

  const employees: Employee[] = [
    { id: "EMP-1", name: "Luis Ortega", type: "hourly", userId: "U-CREW", crewId: "CREW-1", gustoId: "G-1041" },
    { id: "EMP-2", name: "José Rivera", type: "hourly", crewId: "CREW-1", gustoId: "G-1042", email: "jose.rivera@example.com", phone: "(214) 555-0182" },
    { id: "EMP-3", name: "Ana Torres", type: "hourly", crewId: "CREW-1", gustoId: "G-1043", phone: "(972) 555-0147" },
    { id: "EMP-4", name: "Kevin Nguyen", type: "hourly", crewId: "CREW-1", gustoId: "G-1044" },
    { id: "EMP-5", name: "Dana Ruiz", type: "salaried", userId: "U-OFFICE" },
    { id: "EMP-6", name: "Tim Skelly", type: "salaried", userId: "U-OWNER" },
    { id: "EMP-7", name: "Priya Shah", type: "salaried", userId: "U-EST" },
    { id: "EMP-8", name: "Brightline Drywall (sub)", type: "subcontractor" },
    { id: "EMP-9", name: "Carlos Mendez", type: "hourly", crewId: "CREW-1", gustoId: "G-1039", offboardedAt: addDays(nowIso, -40) },
  ];
  const crews: Crew[] = [{ id: "CREW-1", name: "Ortega crew", leadUserId: "U-CREW" }];

  const lastMonth = addMonths(nowIso, -1).slice(0, 7);
  const thisFriday = addDaysToDay(W0, 4);

  return {
    employees,
    crews,
    timeSegments: segments,
    timeEntries: entries,
    payrollBatches: batches,
    payrollAdjustments: [
      { id: "PADJ-1", employeeId: "EMP-1", weekStart: W2, minutes: 30, reason: "Missed clock-out on Thursday. Confirmed with the crew lead after the week was paid.", createdBy: "U-OFFICE", createdAt: past(at(addDaysToDay(W1, 2), "10:00")), payday: today <= thisFriday ? thisFriday : addDaysToDay(thisFriday, 7) },
    ],
    labourCosts,
    mileageRates: [{ id: `IRS-${new Date(nowIso).getFullYear()}`, year: new Date(nowIso).getFullYear(), centsPerMile: 70, effectiveFrom: new Date(new Date(nowIso).getFullYear(), 0, 1).toISOString(), setBy: "U-BOOK", setAt: new Date(new Date(nowIso).getFullYear(), 0, 2).toISOString() }],
    mileageClaims,
    payrollSettings: {
      burdenPct: 18, burdenSetBy: "U-OWNER", timezone: "America/Chicago (browser local time in the prototype)",
      gustoMappingConfirmed: true, reimbursementMappingConfirmed: false,
      reconciliations: [{ month: lastMonth, by: "U-OFFICE", at: addDays(nowIso, -20), ok: true, note: "Allocated equals entered for every pay period." }],
    },
    counters: { ts, te, pb: 2, padj: 1, lct: labourCosts.length, mil: 3 },
  };
}
