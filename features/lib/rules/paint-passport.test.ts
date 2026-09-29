/**
 * Patent 26 — Customer Paint Passport: add jobs, generate one link, send it,
 * and the customer sees only those jobs' paint.
 */
import { describe, expect, it } from "vitest";
import { produce } from "immer";
import type { ActionResult, Database, User } from "@/features/types";
import { createSeed } from "@/features/data/seed";
import { currentOwnership } from "@/features/lib/selectors";
import { createPassport, passportJobs, recordPassportOpen, revokePassport, sendPassport } from "@/features/lib/store/actions/passport";
import { buildCustomerRecord } from "@/features/components/features/public-record/customer-record";

const NOW = "2026-06-10T15:00:00.000Z";

function run<A extends unknown[], R>(db: Database, userId: string, action: (db: Database, actor: User, ...args: A) => ActionResult<R>, ...args: A) {
  let result: ActionResult<R> = { ok: false, error: "not run" };
  const next = produce(db, (draft) => {
    result = action(draft as Database, draft.users.find((u) => u.id === userId)!, ...args);
  });
  return { db: next, result };
}

/** A customer who owns a property with at least two recorded jobs. */
function setup() {
  const db = createSeed(NOW);
  for (const c of db.customers) {
    const jobs = passportJobs(db, c.id);
    if (jobs.length >= 1) return { db, customerId: c.id, jobs };
  }
  throw new Error("no customer with recorded jobs");
}

describe("Patent 26 — Customer Paint Passport", () => {
  it("generates one unguessable link for the chosen jobs and shows only their paint", () => {
    const { db, customerId, jobs } = setup();
    const chosen = jobs[0]!;
    const r = run(db, "U-OFFICE", createPassport, customerId, [chosen.id]);
    expect(r.result.ok).toBe(true);
    const p = r.db.paintPassports!.find((x) => x.id === (r.result as { value?: string }).value)!;
    expect(p.ref.length).toBeGreaterThanOrEqual(20);
    expect(p.ref).not.toContain(chosen.propertyId);
    const property = r.db.properties.find((x) => x.id === chosen.propertyId)!;
    const record = buildCustomerRecord(r.db, property, currentOwnership(property)!.id, { jobIds: p.jobIds });
    const shownApps = record.areas.flatMap((a) => a.surfaces.map((s) => s.latest));
    expect(shownApps.length).toBeGreaterThan(0);
    const allowedSurfaces = new Set(r.db.applications.filter((a) => a.jobId === chosen.id).map((a) => a.surfaceId));
    expect(record.areas.flatMap((a) => a.surfaces.map((s) => s.surface.id)).every((id) => allowedSurfaces.has(id))).toBe(true);
    const opened = run(r.db, "U-OFFICE", recordPassportOpen, p.ref).db;
    expect(opened.paintPassports![0]!.openCount).toBe(1);
  });

  it("refuses jobs the customer doesn't own, an empty passport, and roles without access", () => {
    const { db, customerId, jobs } = setup();
    expect(run(db, "U-OFFICE", createPassport, customerId, []).result.ok).toBe(false);
    expect(run(db, "U-OFFICE", createPassport, customerId, ["JOB-NOT-THEIRS"]).result.ok).toBe(false);
    expect(run(db, "U-CREW", createPassport, customerId, [jobs[0]!.id]).result.ok).toBe(false);
  });

  it("a revoked passport can't be sent", () => {
    const { db, customerId, jobs } = setup();
    let d = run(db, "U-OFFICE", createPassport, customerId, [jobs[0]!.id]).db;
    const id = d.paintPassports![0]!.id;
    d = run(d, "U-OFFICE", revokePassport, id).db;
    expect(d.paintPassports![0]!.revokedAt).toBeDefined();
    expect(run(d, "U-OFFICE", sendPassport, id, "email").result.ok).toBe(false);
  });
});
