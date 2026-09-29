import { describe, expect, it } from "vitest";
import { produce } from "immer";
import type { ActionResult, Database, User } from "@/features/types";
import { createSeed } from "@/features/data/seed";
import {
  acceptEstimateByToken, addEstimateArea, addScopeSurface, amendEstimate, assignSurfaceColour, createEstimateFromLead, declineEstimateByToken,
  markEstimateApproved, openPublicEstimate, saveEstimate, sendEstimate, sendForReapproval, updateEstimateDetails,
} from "@/features/lib/store/actions/estimates";
import { addColour, saveSpec } from "@/features/lib/store/actions/color-card";
import { PRIMER_NONE_SOUND } from "@/features/types";

const NOW = "2026-06-10T15:00:00.000Z";

/** Run an action the way act() does, returning the new database and the result. */
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

function draftEstimate() {
  let db = createSeed(NOW);
  const r = run(db, "U-EST", createEstimateFromLead, { leadId: "LEAD-2026-10", title: "Living Room Repaint", estimatorId: "U-EST" });
  expect(r.result.ok).toBe(true);
  db = r.db;
  const estimateId = val(r.result);
  const jobId = db.estimates.find((e) => e.id === estimateId)!.jobId!;
  const a = run(db, "U-EST", addEstimateArea, estimateId, { name: "Living Room", kind: "interior", roomType: "living_room" });
  db = a.db;
  const areaId = val(a.result);
  const s = run(db, "U-EST", addScopeSurface, estimateId, { areaId, name: "Walls", type: "walls", areaSqft: 450, condition: "sound" });
  db = s.db;
  const surfaceId = val(s.result);
  const c = run(db, "U-EST", addColour, jobId, { manufacturer: "Sherwin-Williams", name: "Agreeable Gray", number: "SW 7029", hex: "#D1CBC1", customMatch: false });
  db = c.db;
  const colourId = val(c.result);
  const sp = run(db, "U-EST", saveSpec, {
    jobId, colourId,
    draft: { sheen: "Eggshell", coats: 2, primer: PRIMER_NONE_SOUND, coatSequence: ["Finish coat 1", "Finish coat 2"], surfaceIds: [], lifespanYears: 7, productLine: "Cashmere", product: "Cashmere Interior Acrylic Latex", tintBase: "Extra White base" },
  });
  db = sp.db;
  db = run(db, "U-EST", assignSurfaceColour, estimateId, surfaceId, colourId).db;
  return { db, estimateId, jobId, surfaceId };
}

describe("Estimate flow — lead → estimate → accept → job, work order and draft invoice", () => {
  it('validates a single date edit against the other saved date', () => {
    const fixture = draftEstimate();
    const { estimateId } = fixture;
    const db = structuredClone(fixture.db);
    const est = db.estimates.find((e) => e.id === estimateId)!;
    est.estimateDate = '2026-06-10T15:00:00.000Z';
    est.validUntil = '2026-06-20';
    expect(run(db, 'U-EST', updateEstimateDetails, estimateId, { validUntil: '2026-06-09' }).result.ok).toBe(false);
    expect(run(db, 'U-EST', updateEstimateDetails, estimateId, { estimateDate: '2026-06-21' }).result.ok).toBe(false);
    expect(run(db, 'U-EST', updateEstimateDetails, estimateId, { validUntil: '2026-06-10' }).result.ok).toBe(true);
  });

  it("an estimate needs a Scheduled lead with no estimate yet", () => {
    const db = createSeed(NOW);
    expect(run(db, "U-EST", createEstimateFromLead, { leadId: "LEAD-2026-3", title: "x", estimatorId: "U-EST" }).result.ok).toBe(false);
    expect(run(db, "U-EST", createEstimateFromLead, { leadId: "LEAD-2026-11", title: "x", estimatorId: "U-EST" }).result.ok).toBe(false);
  });

  it("the new estimate is a draft; its project record stays hidden as estimating", () => {
    const { db, estimateId, jobId } = draftEstimate();
    const est = db.estimates.find((e) => e.id === estimateId)!;
    expect(est.status).toBe("DRAFT");
    expect(db.jobs.find((j) => j.id === jobId)!.status).toBe("estimating");
    expect(db.leads.find((l) => l.id === "LEAD-2026-10")!.estimateId).toBe(estimateId);
  });

  it("the paint bucket puts the surface on the colour's specification", () => {
    const { db, jobId, surfaceId } = draftEstimate();
    expect(db.specs.find((s) => s.jobId === jobId)!.surfaceIds).toContain(surfaceId);
  });

  it("save computes the total; send moves it to Sent and the lead to Pending", () => {
    let { db, estimateId } = draftEstimate();
    db = run(db, "U-EST", saveEstimate, estimateId).db;
    expect(db.estimates.find((e) => e.id === estimateId)!.total).toBeGreaterThan(0);
    db = run(db, "U-EST", sendEstimate, estimateId).db;
    expect(db.estimates.find((e) => e.id === estimateId)!.status).toBe("SENT");
    expect(db.leads.find((l) => l.id === "LEAD-2026-10")!.stage).toBe("pending");
  });

  it("customer acceptance creates the job, a Pending Deposit work order and a draft deposit invoice", () => {
    let { db, estimateId, jobId } = draftEstimate();
    db = run(db, "U-EST", sendEstimate, estimateId).db;
    const token = db.estimates.find((e) => e.id === estimateId)!.publicToken!;
    db = run(db, "U-EST", openPublicEstimate, token).db;
    expect(db.estimates.find((e) => e.id === estimateId)!.status).toBe("VIEWED");
    expect(run(db, "U-EST", acceptEstimateByToken, token, { signatureName: "", signed: true }).result.ok).toBe(false);
    expect(run(db, "U-EST", acceptEstimateByToken, token, { signatureName: "Olivia Bennett", signed: false }).result.ok).toBe(false);
    db = run(db, "U-EST", acceptEstimateByToken, token, { signatureName: "Olivia Bennett", signed: true }).db;
    const est = db.estimates.find((e) => e.id === estimateId)!;
    const job = db.jobs.find((j) => j.id === jobId)!;
    expect(est.status).toBe("ACCEPTED");
    expect(job.status).toBe("confirmed");
    expect(job.contractSigned).toBe(true);
    expect(db.workOrders.find((w) => w.jobId === jobId)!.status).toBe("PENDING_DEPOSIT");
    const inv = db.invoices.find((i) => i.jobId === jobId)!;
    expect(inv.status).toBe("draft");
    expect(inv.amount).toBeCloseTo(est.total * 0.3333, 1);
    expect(db.leads.find((l) => l.id === "LEAD-2026-10")!.stage).toBe("sold");
  });

  it("feature 3: the signature approves every complete specification, with evidence", () => {
    let { db, estimateId, jobId } = draftEstimate();
    db = run(db, "U-EST", sendEstimate, estimateId).db;
    const token = db.estimates.find((e) => e.id === estimateId)!.publicToken!;
    db = run(db, "U-EST", acceptEstimateByToken, token, { signatureName: "Olivia Bennett", signed: true }).db;
    expect(db.specs.filter((s) => s.jobId === jobId).every((s) => s.state === "approved")).toBe(true);
    const evidence = db.colourApprovals.find((a) => a.jobId === jobId)!;
    expect(evidence.channel).toBe("estimate_pdf");
    expect(evidence.signer).toBe("Olivia Bennett");
  });

  it("a declined estimate sets the lead to Lost", () => {
    let { db, estimateId } = draftEstimate();
    db = run(db, "U-EST", sendEstimate, estimateId).db;
    const token = db.estimates.find((e) => e.id === estimateId)!.publicToken!;
    db = run(db, "U-EST", declineEstimateByToken, token).db;
    expect(db.estimates.find((e) => e.id === estimateId)!.status).toBe("DECLINED");
    expect(db.leads.find((l) => l.id === "LEAD-2026-10")!.stage).toBe("lost");
  });

  it("manual approval also creates the work order", () => {
    let { db, estimateId, jobId } = draftEstimate();
    db = run(db, "U-OFFICE", markEstimateApproved, estimateId).db;
    expect(db.workOrders.some((w) => w.jobId === jobId)).toBe(true);
  });
});

describe("Feature 24 — Amend Estimate on the live flow (decision D4)", () => {
  it("amending an approved estimate before work starts opens Editing Amendment #1", () => {
    let db = createSeed(NOW);
    db = run(db, "U-EST", amendEstimate, "EST-2026-3").db; // WO-2026-2 is Scheduled
    const est = db.estimates.find((e) => e.id === "EST-2026-3")!;
    expect(est.status).toBe("AMENDED_DRAFT");
    expect(est.amendmentNumber).toBe(1);
  });

  it("amending is blocked once the work order is In Progress", () => {
    const db = createSeed(NOW);
    const r = run(db, "U-EST", amendEstimate, "EST-2026-1"); // WO-2026-1 is In Progress
    expect(r.result.ok).toBe(false);
    expect(r.db.estimates.find((e) => e.id === "EST-2026-1")!.status).toBe("ACCEPTED");
  });

  it("re-approval rotates the link and the re-signed total updates the contract value", () => {
    let db = createSeed(NOW);
    db = run(db, "U-EST", amendEstimate, "EST-2026-3").db;
    const oldToken = db.estimates.find((e) => e.id === "EST-2026-3")!.publicToken;
    db = run(db, "U-EST", sendForReapproval, "EST-2026-3").db;
    const est = db.estimates.find((e) => e.id === "EST-2026-3")!;
    expect(est.status).toBe("PENDING_REAPPROVAL");
    expect(est.publicToken).not.toBe(oldToken);
    db = run(db, "U-EST", acceptEstimateByToken, est.publicToken!, { signatureName: "Sam Sample", signed: true }).db;
    const job = db.jobs.find((j) => j.id === "JOB-2026-2")!;
    expect(db.estimates.find((e) => e.id === "EST-2026-3")!.status).toBe("ACCEPTED");
    expect(job.contractValue).toBe(db.estimates.find((e) => e.id === "EST-2026-3")!.total);
    expect(db.workOrders.filter((w) => w.jobId === "JOB-2026-2")).toHaveLength(1);
  });
});
