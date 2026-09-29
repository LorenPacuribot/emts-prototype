import { describe, expect, it } from "vitest";
import { produce } from "immer";
import type { ActionResult, Database, User } from "@/features/types";
import { createSeed } from "@/features/data/seed";
import { logWorkOrderHours, markUnscheduled, scheduleWorkOrder, setWorkOrderStatus, updateWorkOrderTimeEntry } from "@/features/lib/store/actions/work-orders";
import { closeJob, closeoutRowsFor, confirmAllMatching, logMaterialUsage } from "@/features/lib/store/actions/property";
import { setJobStage } from "@/features/lib/store/actions/jobs";

const NOW = "2026-06-10T15:00:00.000Z";

function run<A extends unknown[], R>(db: Database, userId: string, action: (db: Database, actor: User, ...args: A) => ActionResult<R>, ...args: A) {
  let result: ActionResult<R> = { ok: false, error: "not run" };
  const next = produce(db, (draft) => {
    result = action(draft as Database, draft.users.find((u) => u.id === userId)!, ...args);
  });
  return { db: next, result };
}
const wo = (db: Database, id: string) => db.workOrders.find((w) => w.id === id)!;

describe("Work order — live status flow", () => {
  it("Start Job moves Scheduled to In Progress and the job to In Production", () => {
    const r = run(createSeed(NOW), "U-CREW", setWorkOrderStatus, "WO-2026-2", "IN_PROGRESS");
    expect(r.result.ok).toBe(true);
    expect(wo(r.db, "WO-2026-2").status).toBe("IN_PROGRESS");
    expect(r.db.jobs.find((j) => j.id === "JOB-2026-2")!.status).toBe("in_production");
  });

  it("statuses can't be skipped, and Mark Complete only runs through the closeout", () => {
    const db = createSeed(NOW);
    expect(run(db, "U-OFFICE", setWorkOrderStatus, "WO-2026-2", "COMPLETED").result.ok).toBe(false);
    expect(run(db, "U-OFFICE", setWorkOrderStatus, "WO-2026-1", "UNSCHEDULED").result.ok).toBe(false);
  });

  it("Mark Unscheduled is only available when Scheduled; scheduling needs both dates in order", () => {
    const db = createSeed(NOW);
    expect(run(db, "U-OFFICE", markUnscheduled, "WO-2026-1").result.ok).toBe(false);
    const r = run(db, "U-OFFICE", markUnscheduled, "WO-2026-2");
    expect(wo(r.db, "WO-2026-2").status).toBe("UNSCHEDULED");
    expect(run(r.db, "U-OFFICE", scheduleWorkOrder, "WO-2026-2", { startDate: "2026-06-20", endDate: "2026-06-18" }).result.ok).toBe(false);
    // The seed shares a painter with another job on these dates; that move is now rejected.
    expect(run(r.db, 'U-OFFICE', scheduleWorkOrder, 'WO-2026-2', { startDate: '2026-06-18', endDate: '2026-06-20' }).result.ok).toBe(false);
    const available = produce(r.db, (d) => {
      for (const w of d.workOrders) if (w.id !== 'WO-2026-2') w.shifts = [];
      d.workOrders.find((w) => w.id === 'WO-2026-2')!.shifts[0]!.endTime = '16:00';
    });
    const s = run(available, "U-OFFICE", scheduleWorkOrder, "WO-2026-2", { startDate: "2026-06-18", endDate: "2026-06-20" });
    if (!s.result.ok) throw new Error(s.result.error);
    expect(wo(s.db, "WO-2026-2").status).toBe("SCHEDULED");
  });

  it("Change Status can't set the system stages or complete a job by hand", () => {
    const db = createSeed(NOW);
    expect(run(db, "U-OFFICE", setJobStage, "JOB-2026-1", "in_production").result.ok).toBe(false);
    expect(run(db, "U-OFFICE", setJobStage, "JOB-2026-1", "completed").result.ok).toBe(false);
    expect(run(db, "U-OFFICE", setJobStage, "JOB-2026-1", "touch_up").result.ok).toBe(true);
  });
});

describe("Feature 22 — Log Hours on the work order", () => {
  it("hours can only be logged while the work order is In Progress (live rule kept)", () => {
    const r = run(createSeed(NOW), "U-CREW", logWorkOrderHours, "WO-2026-2", { entries: [{ surfaceId: "SF-2011", hours: 2 }] });
    expect(r.result.ok).toBe(false);
  });

  it("hours for a crew member with start and end also create a payroll segment", () => {
    const db = createSeed(NOW);
    const before = db.timeSegments.length;
    const r = run(db, "U-CREW", logWorkOrderHours, "WO-2026-1", { entries: [{ surfaceId: "SF-1041", hours: 7 }], employeeId: "EMP-3", workDate: "2026-06-10", start: "07:30", end: "15:30" });
    expect(r.result.ok).toBe(true);
    expect(r.db.timeSegments.length).toBe(before + 1);
    const entry = wo(r.db, "WO-2026-1").timeEntries.at(-1)!;
    expect(entry.employeeId).toBe("EMP-3");
    expect(entry.segmentId).toBeDefined();
    expect(r.db.timeEntries.some((e) => e.employeeId === "EMP-3" && e.workDate === "2026-06-10")).toBe(true);
  });

  it("more hours than the start–end span is refused", () => {
    const r = run(createSeed(NOW), "U-CREW", logWorkOrderHours, "WO-2026-1", { entries: [{ surfaceId: "SF-1041", hours: 9 }], employeeId: "EMP-3", workDate: "2026-06-10", start: "07:30", end: "15:30" });
    expect(r.result.ok).toBe(false);
  });

  it("an approved day's entries can't be edited", () => {
    let db = createSeed(NOW);
    const e = db.timeEntries.find((x) => x.state === "approved")!;
    db = run(db, "U-CREW", (d) => {
      d.workOrders[0].timeEntries.push({ id: "WTE-X", surfaceId: "SF-1011", renderedHours: 3, loggedBy: "U-CREW", loggedAt: NOW, employeeId: e.employeeId, workDate: e.workDate });
      return { ok: true };
    }).db;
    expect(run(db, "U-CREW", updateWorkOrderTimeEntry, "WO-2026-1", "WTE-X", { renderedHours: 4 }).result.ok).toBe(false);
  });
});

describe("Feature 25 — Mark Complete runs the closeout", () => {
  it("closing the job completes the work order", () => {
    let db = createSeed(NOW);
    db = run(db, "U-CREW", confirmAllMatching, "JOB-2026-5", "2026-06-08T12:00:00.000Z").db;
    // The baseboard row was saved without a sheen in the seed: blocked until fixed.
    const blocked = run(db, "U-OFFICE", closeJob, "JOB-2026-5");
    if (!blocked.result.ok) {
      db = run(db, "U-CREW", (d) => {
        d.closeouts![0].rows.forEach((r) => { r.sheen = r.sheen ?? "Semi-Gloss"; r.confirmedBy = r.confirmedBy ?? "U-CREW"; });
        return { ok: true };
      }).db;
    }
    const r = run(db, "U-OFFICE", closeJob, "JOB-2026-5");
    expect(r.result.ok).toBe(true);
    expect(wo(r.db, "WO-2026-5").status).toBe("COMPLETED");
    expect(r.db.jobs.find((j) => j.id === "JOB-2026-5")!.status).toBe("completed");
  });

  it("a job whose work order hasn't started can't be closed", () => {
    const r = run(createSeed(NOW), "U-OFFICE", closeJob, "JOB-2026-2");
    expect(r.result.ok).toBe(false);
  });
});

describe("Patent 20 — Log Material Usage", () => {
  const row = (db: Database, sid: string) => closeoutRowsFor(db, db.jobs.find((j) => j.id === "JOB-2026-5")!).find((r) => r.surfaceId === sid)!;
  const day = "2026-06-09T12:00:00.000Z";

  it("adds gallons to the surface's actuals and keeps the crew lead's confirmation", () => {
    const db = createSeed(NOW);
    const before = row(db, "SF-4011");
    expect(before.actualGallons).toBe(2.5);
    expect(before.confirmedBy).toBe("U-CREW");
    const r = run(db, "U-CREW", logMaterialUsage, "JOB-2026-5", { surfaceId: "SF-4011", gallons: 1.5, date: day });
    expect(r.result).toMatchObject({ ok: true, value: 4 });
    expect(row(r.db, "SF-4011").actualGallons).toBe(4);
    expect(row(r.db, "SF-4011").confirmedBy).toBe("U-CREW");
  });

  it("starts from zero on a surface with nothing recorded", () => {
    const db = createSeed(NOW);
    const empty = closeoutRowsFor(db, db.jobs.find((j) => j.id === "JOB-2026-5")!).find((r) => r.actualGallons === undefined)!;
    const r = run(db, "U-CREW", logMaterialUsage, "JOB-2026-5", { surfaceId: empty.surfaceId, gallons: 0.75, date: day });
    expect(row(r.db, empty.surfaceId).actualGallons).toBe(0.75);
  });

  it("refuses bad entries and users who can't confirm applications", () => {
    const db = createSeed(NOW);
    expect(run(db, "U-CREW", logMaterialUsage, "JOB-2026-5", { surfaceId: "SF-4011", gallons: 0, date: day }).result).toMatchObject({ ok: false, field: "gallons" });
    expect(run(db, "U-CREW", logMaterialUsage, "JOB-2026-5", { surfaceId: "SF-9999", gallons: 1, date: day }).result).toMatchObject({ ok: false, field: "surfaceId" });
    expect(run(db, "U-CREW", logMaterialUsage, "JOB-2026-5", { surfaceId: "SF-4011", gallons: 1, date: "2099-01-01T12:00:00.000Z" }).result).toMatchObject({ ok: false, field: "date" });
    expect(run(db, "U-BOOK", logMaterialUsage, "JOB-2026-5", { surfaceId: "SF-4011", gallons: 1, date: day }).result.ok).toBe(false);
  });
});
