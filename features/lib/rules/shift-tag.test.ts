/**
 * Patent 22 — approved hours carry the work order and the shift worked.
 */
import { describe, expect, it } from "vitest";
import { produce } from "immer";
import type { ActionResult, Database, User } from "@/features/types";
import { createSeed } from "@/features/data/seed";
import { now } from "@/features/lib/clock";
import { clockIn } from "@/features/lib/store/actions/workforce";
import { punchTagLabel, punchTags } from "./shift-tag";

function run<A extends unknown[], R>(db: Database, userId: string, action: (db: Database, actor: User, ...args: A) => ActionResult<R>, ...args: A) {
  let result: ActionResult<R> = { ok: false, error: "not run" };
  const next = produce(db, (draft) => {
    result = action(draft as Database, draft.users.find((u) => u.id === userId)!, ...args);
  });
  return { db: next, result };
}

describe("Patent 22 — work order and shift on hours", () => {
  const db = createSeed(now());
  const wo = db.workOrders.find((w) => w.shifts.length > 0)!;
  const shift = wo.shifts[0]!;
  const member = shift.memberIds[0]!;
  const day = shift.startDate;

  it("tags a punch inside the shift with its work order and shift", () => {
    expect(punchTags(db, member, wo.jobId, day)).toEqual({ workOrderId: wo.id, shiftId: shift.id });
    expect(punchTagLabel(db, { workOrderId: wo.id, shiftId: shift.id })).toBe(`${wo.id} · ${shift.name}`);
  });

  it("keeps the work order but no shift outside the dates, for a non-member, or on an excluded day", () => {
    expect(punchTags(db, member, wo.jobId, "1999-01-01")).toEqual({ workOrderId: wo.id, shiftId: undefined });
    expect(punchTags(db, "EMP-NOBODY", wo.jobId, day).shiftId).toBeUndefined();
    const off = produce(db, (d) => { d.workOrders.find((w) => w.id === wo.id)!.shifts[0]!.dailyHours = { [day]: null }; });
    expect(punchTags(off, member, wo.jobId, day).shiftId).toBeUndefined();
    expect(punchTags(db, member, undefined, day)).toEqual({});
  });

  it("clock-in records the tags on the punch", () => {
    const d = produce(db, (x) => {
      const s = x.workOrders.find((w) => w.id === wo.id)!.shifts[0]!;
      s.startDate = "2000-01-01"; s.endDate = "2100-01-01"; s.dailyHours = undefined;
      // The seed may leave this member mid-punch; a second punch is correctly blocked.
      x.timeSegments.forEach((t) => { if (t.employeeId === member && !t.end) t.end = t.start; });
    });
    const clocker = d.users.find((u) => u.role === "owner" || u.id === "U-OWNER") ?? d.users[0]!;
    const { db: after, result } = run(d, clocker.id, clockIn, member, wo.jobId, "application");
    expect(result.ok).toBe(true);
    const seg = after.timeSegments.find((s) => s.id === (result as { value?: string }).value);
    expect(seg).toMatchObject({ workOrderId: wo.id, shiftId: shift.id, jobId: wo.jobId });
  });
});
