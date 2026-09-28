/**
 * Feature 22 (hours and payroll), Rule 3 (wage cost source) and Rule 5
 * (tie-breaking). Each test names the acceptance criterion it checks.
 */
import { describe, expect, it } from "vitest";
import type { Employee, TimeSegment, User } from "@/features/types";
import { allocateInteger, allocateMoney, compareJobNumber } from "./allocation";
import {
  approverFor, canApproveEntry, classifyWeek, conflictPairs, dayTotals, disputeRoute, elapsedMinutes, gpsToPurge, jobForActivity,
  lunchDeduction, mileageAmount, mileageEvidenceMissing, mileageRateOn, missingTimeDays, openSegment, paydayFor, roundDailyMinutes,
  weekStartOf, workDateOf, carriesLabourCost, exportsTime, isAttestationOverdue,
} from "./payroll";
import { allocateLabourCost, burdenedTotal, reconcileLabour } from "./labour-cost";

const local = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).toISOString();
let n = 0;
const seg = (start: string, end: string | undefined, jobId?: string, extra: Partial<TimeSegment> = {}): TimeSegment => ({
  id: `TS-${++n}`, employeeId: "EMP-1", workDate: workDateOf(start), jobId, activity: "application", start, end,
  source: "online", location: "captured", clockedBy: "U-CREW", ...extra,
});

describe("Feature 22 — lunch and rounding", () => {
  it("deducts 30 minutes of lunch from a 6 h 30 shift before rounding", () => {
    const t = dayTotals([seg(local(2026, 9, 21, 7, 0), local(2026, 9, 21, 13, 30), "JOB-2026-1")]);
    expect(t.workedMinutes).toBe(390);
    expect(t.lunchMinutes).toBe(30);
    expect(t.roundedMinutes).toBe(360);
  });
  it("deducts no lunch from a shift of exactly 6 hours", () => {
    expect(lunchDeduction(360)).toBe(0);
    expect(lunchDeduction(361)).toBe(30);
  });
  it("rounds 7 h 37 after lunch up to 7 h 45 (tie rounds upward at the half-quarter)", () => {
    expect(roundDailyMinutes(7 * 60 + 37)).toBe(7 * 60 + 45);
    expect(roundDailyMinutes(7 * 60 + 36)).toBe(7 * 60 + 30);
    expect(roundDailyMinutes(8 * 60)).toBe(8 * 60);
  });
  it("never rounds punches: 7:58 to 16:03 keeps the punch minutes, only the daily total rounds", () => {
    const s = seg(local(2026, 9, 21, 7, 58), local(2026, 9, 21, 16, 3), "JOB-2026-1");
    const t = dayTotals([s]);
    expect(s.start).toBe(local(2026, 9, 21, 7, 58));
    expect(t.workedMinutes).toBe(485);
    expect(t.netMinutes).toBe(455);
    expect(t.roundedMinutes).toBe(450);
  });
  it("skips lunch when the no-lunch flag is approved", () => {
    const t = dayTotals([seg(local(2026, 9, 21, 7, 0), local(2026, 9, 21, 15, 0), "JOB-2026-1")], true);
    expect(t.lunchMinutes).toBe(0);
    expect(t.roundedMinutes).toBe(480);
  });
});

describe("Feature 22 — allocation across jobs (Rule 5)", () => {
  it("allocates a rounded day across three jobs by recorded minutes; the residual goes to the job with the most hours", () => {
    const t = dayTotals([
      seg(local(2026, 9, 21, 7, 0), local(2026, 9, 21, 10, 7), "JOB-2026-2"),
      seg(local(2026, 9, 21, 10, 7), local(2026, 9, 21, 14, 11), "JOB-2026-1"),
      seg(local(2026, 9, 21, 14, 11), local(2026, 9, 21, 15, 52), "JOB-2026-5"),
    ]);
    expect(t.byJob.reduce((a, b) => a + b.allocated, 0)).toBe(t.roundedMinutes);
    expect(t.residualTo).toBe("JOB-2026-1");
  });
  it("gives a tied residual to the lowest job number", () => {
    const r = allocateInteger(10, [{ jobId: "JOB-2026-10", weight: 3 }, { jobId: "JOB-2026-2", weight: 3 }, { jobId: "JOB-2026-5", weight: 1 }]);
    expect(r.receiver).toBe("JOB-2026-2");
    expect(r.rule).toBe("lowest_job_number");
    expect(r.rows.reduce((a, x) => a + x.amount, 0)).toBe(10);
  });
  it("compares job numbers numerically", () => {
    expect(compareJobNumber("JOB-2026-2", "JOB-2026-10")).toBeLessThan(0);
  });
  it("33: $1,000 across three jobs puts the one-cent residual on the largest allocation", () => {
    const r = allocateMoney(1000, [{ jobId: "JOB-2026-1", weight: 1 }, { jobId: "JOB-2026-2", weight: 1 }, { jobId: "JOB-2026-5", weight: 1.0001 }]);
    expect(r.rows.map((x) => x.amount).reduce((a, b) => a + b, 0)).toBeCloseTo(1000, 6);
    expect(r.receiver).toBe("JOB-2026-5");
  });
});

describe("Feature 22 — calendar", () => {
  it("attributes a whole overnight shift (Sunday 22:00 to Monday 06:00) to its Sunday start date", () => {
    const s = seg(local(2026, 9, 20, 22, 0), local(2026, 9, 21, 6, 0), "JOB-2026-1");
    expect(s.workDate).toBe("2026-09-20");
    expect(weekStartOf(s.workDate)).toBe("2026-09-14");
    expect(dayTotals([s]).workedMinutes).toBe(480);
  });
  it("uses actual elapsed time across a daylight-saving change", () => {
    // 1 November 2026: clocks go back. 06:00Z to 15:00Z is nine real hours.
    expect(elapsedMinutes("2026-11-01T06:00:00.000Z", "2026-11-01T15:00:00.000Z")).toBe(540);
  });
  it("pays on the Friday after the week", () => {
    expect(weekStartOf("2026-09-24")).toBe("2026-09-21");
    expect(paydayFor("2026-09-14")).toBe("2026-09-25");
  });
  it("charges travel to the second job and treats rained-out time as overhead", () => {
    expect(jobForActivity("travel", "JOB-2026-2")).toBe("JOB-2026-2");
    expect(jobForActivity("rained_out", "JOB-2026-1")).toBeUndefined();
    expect(jobForActivity("training", "JOB-2026-1")).toBeUndefined();
  });
});

describe("Feature 22 — overtime", () => {
  it("42 hours: 40 regular and 2 overtime, on the last hours of the week and the jobs they fell on", () => {
    const days = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"].map((d) => ({
      workDate: d, byJob: [{ jobId: "JOB-2026-1", recorded: 600, allocated: 600, firstStart: `${d}T12:00:00.000Z` }],
    }));
    days.push({ workDate: "2026-09-25", byJob: [{ jobId: "JOB-2026-2", recorded: 120, allocated: 120, firstStart: "2026-09-25T12:00:00.000Z" }] });
    const w = classifyWeek(days);
    expect(w.regular).toBe(2400);
    expect(w.overtime).toBe(120);
    expect(w.days[4].jobs[0]).toEqual({ jobId: "JOB-2026-2", regular: 0, overtime: 120 });
  });
  it("flags subcontractor hours with zero labour cost and exports hourly time only", () => {
    const sub: Employee = { id: "E", name: "Sub", type: "subcontractor" };
    const sal: Employee = { id: "S", name: "Salaried", type: "salaried" };
    expect(carriesLabourCost(sub)).toBe(false);
    expect(exportsTime(sal)).toBe(false);
    expect(exportsTime({ ...sal, type: "hourly" })).toBe(true);
  });
});

describe("Feature 22 — punches and conflicts", () => {
  it("blocks a second simultaneous punch for one employee", () => {
    const open = seg(local(2026, 9, 24, 7, 0), undefined, "JOB-2026-1");
    expect(openSegment([open], "EMP-1")?.id).toBe(open.id);
  });
  it("flags an offline punch that conflicts with a later online punch, and keeps both", () => {
    const off = seg(local(2026, 9, 22, 7, 0), local(2026, 9, 22, 15, 0), "JOB-2026-1", { source: "offline" });
    const on = seg(local(2026, 9, 22, 7, 30), local(2026, 9, 22, 15, 30), "JOB-2026-1");
    expect(conflictPairs([off, on])).toHaveLength(1);
    expect(conflictPairs([{ ...off, supersededAt: "x" }, on])).toHaveLength(0);
    // The superseded record contributes zero hours.
    expect(dayTotals([{ ...off, supersededAt: "x" }, on]).workedMinutes).toBe(480);
  });
  it("deletes GPS data older than 90 days and keeps the time record", () => {
    const old = seg("2026-06-20T12:00:00.000Z", "2026-06-20T20:00:00.000Z", "JOB-2026-1", { gps: { lat: 1, lng: 1 } });
    expect(gpsToPurge([old], "2026-09-20T12:00:00.000Z")).toHaveLength(1);
    expect(gpsToPurge([old], "2026-09-10T12:00:00.000Z")).toHaveLength(0);
  });
});

describe("Feature 22 — approval and disputes (22.Q02)", () => {
  const owner: User = { id: "U-OWNER", name: "Tim", role: "owner", email: "" };
  const office: User = { id: "U-OFFICE", name: "Dana", role: "office_manager", email: "" };
  const book: User = { id: "U-BOOK", name: "Grace", role: "bookkeeper", email: "" };
  it("makes the bookkeeper the approver of the owner's own time, and self-approval unavailable", () => {
    const ownerEmp: Employee = { id: "EMP-6", name: "Tim", type: "salaried", userId: "U-OWNER" };
    expect(approverFor("owner").roles).toEqual(["bookkeeper"]);
    expect(canApproveEntry(owner, ownerEmp, owner).ok).toBe(false);
    expect(canApproveEntry(book, ownerEmp, owner).ok).toBe(true);
  });
  it("makes the owner the approver of the office manager's time", () => {
    const officeEmp: Employee = { id: "EMP-5", name: "Dana", type: "salaried", userId: "U-OFFICE" };
    expect(canApproveEntry(office, officeEmp, office).ok).toBe(false);
    expect(canApproveEntry(owner, officeEmp, office).ok).toBe(true);
  });
  it("routes a dispute after Wednesday noon to the owner and moves only that entry to the next batch", () => {
    const week = "2026-09-14";
    expect(disputeRoute(local(2026, 9, 23, 11, 0), week, false)).toMatchObject({ routedTo: "crew_lead_office", moveToNextBatch: false });
    expect(disputeRoute(local(2026, 9, 24, 9, 0), week, false)).toMatchObject({ routedTo: "owner", moveToNextBatch: true });
    expect(disputeRoute(local(2026, 9, 24, 9, 0), week, true).blocked).toBe(true);
  });
  it("marks attestation overdue after the end of the next working day", () => {
    expect(isAttestationOverdue({ workDate: "2026-09-18" }, local(2026, 9, 21, 23, 0))).toBe(false); // Fri → due Mon
    expect(isAttestationOverdue({ workDate: "2026-09-18" }, local(2026, 9, 22, 8, 0))).toBe(true);
  });
  it("flags missing weekday time on Monday at 7 a.m.", () => {
    const e: Employee = { id: "EMP-2", name: "Jose", type: "hourly" };
    expect(missingTimeDays(e, [], "2026-09-14", local(2026, 9, 21, 6, 59))).toEqual([]);
    expect(missingTimeDays(e, [], "2026-09-14", local(2026, 9, 21, 7, 0))).toHaveLength(5);
  });
});

describe("Feature 22 — mileage", () => {
  const rates = [{ id: "IRS-2026", year: 2026, centsPerMile: 70, effectiveFrom: "2026-01-01T00:00:00.000Z", setBy: "U-BOOK", setAt: "" }];
  it("reads the maintained IRS rate for the claim date; none for a year with no rate", () => {
    expect(mileageRateOn("2026-09-01T12:00:00.000Z", rates)?.centsPerMile).toBe(70);
    expect(mileageRateOn("2027-01-05T12:00:00.000Z", rates)).toBeUndefined();
    expect(mileageAmount(42.5, 70)).toBe(29.75);
  });
  it("needs odometer readings or a from-and-to address pair", () => {
    expect(mileageEvidenceMissing({ kind: "odometer" })).toBeTruthy();
    expect(mileageEvidenceMissing({ kind: "addresses", from: "Shop", to: "" })).toBeTruthy();
    expect(mileageEvidenceMissing({ kind: "odometer", start: 100, end: 142 })).toBeUndefined();
  });
});

describe("Rule 3 — wage cost source", () => {
  it("applies burden to paid wages and allocates by approved hours, summing exactly", () => {
    expect(burdenedTotal(1000, 18)).toBe(1180);
    const a = allocateLabourCost(1000, 18, [{ jobId: "JOB-2026-1", minutes: 1200 }, { jobId: "JOB-2026-5", minutes: 600 }, { minutes: 300 }]);
    expect(a.total).toBe(1180);
    expect(a.rows.reduce((x, r) => x + r.amount, 0)).toBeCloseTo(1180, 6);
    expect(a.rows[0].amount).toBeGreaterThan(a.rows[1].amount);
  });
  it("reconciles allocated cost against the entered totals", () => {
    const r = reconcileLabour([{ id: "L", employeeId: "E", weekStart: "", amount: 100, burdenPct: 10, enteredBy: "", enteredAt: "", source: "entered", allocations: [{ jobId: "J", minutes: 1, amount: 110 }] }]);
    expect(r.ok).toBe(true);
  });
});
