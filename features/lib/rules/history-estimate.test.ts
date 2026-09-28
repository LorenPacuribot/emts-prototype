import { describe, expect, it } from "vitest";
import { produce } from "immer";
import type { ActionResult, Database, User } from "@/features/types";
import { createSeed } from "@/features/data/seed";
import { startEstimateFromHistory } from "@/features/lib/store/actions/history-estimate";
import { sendEstimate } from "@/features/lib/store/actions/estimates";

const NOW = "2026-06-10T15:00:00.000Z";

function run<A extends unknown[], R>(db: Database, userId: string, action: (db: Database, actor: User, ...args: A) => ActionResult<R>, ...args: A) {
  let result: ActionResult<R> = { ok: false, error: "not run" };
  const next = produce(db, (draft) => {
    result = action(draft as Database, draft.users.find((u) => u.id === userId)!, ...args);
  });
  return { db: next, result };
}

/** The ID returned by a successful action. */
function val(r: ActionResult<unknown>): string {
  if (!r.ok) throw new Error(r.error);
  return r.value as string;
}

// Elena's 2021 kitchen walls and hall walls (PROP-1003).
const APPS = ["APP-3031", "APP-3041"];

describe("Feature 28 — New Estimate from History in the live flow", () => {
  it("needs a scheduled lead: without one nothing is created", () => {
    const db = createSeed(NOW);
    const r = run(db, "U-EST", startEstimateFromHistory, { propertyId: "PROP-1003", applicationIds: APPS, acknowledgedOpen: true });
    expect(r.result.ok).toBe(false);
    expect(r.db.estimates.length).toBe(db.estimates.length);
    expect(r.db.repeatEstimates.length).toBe(db.repeatEstimates.length);
  });

  it("booking the appointment creates a Scheduled lead and a normal draft estimate", () => {
    const db = createSeed(NOW);
    const r = run(db, "U-EST", startEstimateFromHistory, { propertyId: "PROP-1003", applicationIds: APPS, acknowledgedOpen: true, newLead: { scheduledAt: "2026-06-12T15:00:00.000Z", estimatorId: "U-EST" } });
    expect(r.result.ok).toBe(true);
    const est = r.db.estimates.find((e) => e.id === val(r.result))!;
    expect(est.status).toBe("DRAFT");
    expect(est.repeatEstimateId).toBeDefined();
    const lead = r.db.leads.find((l) => l.id === est.leadId)!;
    expect(lead.customerId).toBe("C-ELENA");
    expect(lead.estimateId).toBe(est.id);
    expect(lead.stage).toBe("estimate_scheduled");
  });

  it("copies surfaces, colours and specifications, but never the approval state", () => {
    const db = createSeed(NOW);
    const r = run(db, "U-EST", startEstimateFromHistory, { propertyId: "PROP-1003", applicationIds: APPS, acknowledgedOpen: true, newLead: { scheduledAt: "2026-06-12T15:00:00.000Z", estimatorId: "U-EST" } });
    const est = r.db.estimates.find((e) => e.id === val(r.result))!;
    const job = r.db.jobs.find((j) => j.id === est.jobId)!;
    expect([...job.surfaceIds].sort()).toEqual(["SF-3031", "SF-3041"]);
    const colours = r.db.colours.filter((c) => c.jobId === job.id).map((c) => c.number).sort();
    expect(colours).toEqual(["SW 7008", "SW 7029"]);
    const specs = r.db.specs.filter((s) => s.jobId === job.id);
    expect(specs.every((s) => s.state === "draft")).toBe(true);
    expect(specs.flatMap((s) => s.surfaceIds).sort()).toEqual(["SF-3031", "SF-3041"]);
  });

  it("Send is blocked until the repeat-estimate rules are met (inspection, reconfirmation)", () => {
    const db = createSeed(NOW);
    const r = run(db, "U-EST", startEstimateFromHistory, { propertyId: "PROP-1003", applicationIds: APPS, acknowledgedOpen: true, newLead: { scheduledAt: "2026-06-12T15:00:00.000Z", estimatorId: "U-EST" } });
    const id = val(r.result);
    const s = run(r.db, "U-EST", sendEstimate, id);
    expect(s.result.ok).toBe(false);
    expect((s.result as { error: string }).error).toMatch("From history");
  });

  it("the seeded repeat draft (REP-2026-1) is a normal estimate with its own lead", () => {
    const db = createSeed(NOW);
    const rep = db.repeatEstimates.find((r) => r.id === "REP-2026-1")!;
    const est = db.estimates.find((e) => e.id === rep.estimateId)!;
    expect(est.repeatEstimateId).toBe("REP-2026-1");
    expect(db.leads.find((l) => l.id === est.leadId)!.estimateId).toBe(est.id);
  });
});
