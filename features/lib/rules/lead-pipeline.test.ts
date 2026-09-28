import { describe, expect, it } from "vitest";
import { produce } from "immer";
import type { ActionResult, Database, User } from "@/features/types";
import { createSeed } from "@/features/data/seed";
import { canArchiveStage, canManuallySetStage, leadSourceLabel, sourceFromLabel } from "@/features/lib/rules/lead-pipeline";
import { addLeadNote, createLead, scheduleLeadEstimate, setLeadStage } from "@/features/lib/store/actions/leads";
import { FOLLOW_UP_LEAD_STAGE, qualifyAlert, requestQuote } from "@/features/lib/store/actions/service";
import { startEstimateFromHistory } from "@/features/lib/store/actions/history-estimate";
import { createEstimateFromLead } from "@/features/lib/store/actions/estimates";
import { sendPhotoToMarketing } from "@/features/lib/store/actions/marketing";

const NOW = "2026-06-10T15:00:00.000Z";

function run<A extends unknown[], R>(db: Database, userId: string, action: (db: Database, actor: User, ...args: A) => ActionResult<R>, ...args: A) {
  let result: ActionResult<R> = { ok: false, error: "not run" };
  const next = produce(db, (draft) => {
    result = action(draft as Database, draft.users.find((u) => u.id === userId)!, ...args);
  });
  return { db: next, result };
}

function val(r: ActionResult<unknown>): string {
  if (!r.ok) throw new Error(r.error);
  return r.value as string;
}

const DRAFT = { firstName: "Nora", lastName: "Price", phone: "(972) 555-0101", email: "nora@example.com", address: "88 Cedar Lane", city: "Frisco", state: "TX", zip: "75034", source: "Nextdoor", note: "Fence and deck." };

describe("Live Lead Pipeline rules", () => {
  it("follows the live manual-status rules", () => {
    expect(canManuallySetStage("new_lead", "contacted")).toBe(true);
    expect(canManuallySetStage("contacted", "estimate_scheduled")).toBe(true);
    expect(canManuallySetStage("new_lead", "lost")).toBe(false);
    expect(canManuallySetStage("contacted", "lost")).toBe(true);
    expect(canManuallySetStage("contacted", "sold")).toBe(false);
    expect(canManuallySetStage("estimate_scheduled", "sold")).toBe(true);
    expect(canManuallySetStage("estimate_scheduled", "pending")).toBe(false);
    expect(canArchiveStage("new_lead")).toBe(false);
    expect(canArchiveStage("pending")).toBe(true);
  });

  it("keeps a source that isn't Website or Referral as its label", () => {
    expect(sourceFromLabel("Referral")).toEqual({ source: "referral" });
    expect(leadSourceLabel(sourceFromLabel("Yard Sign"))).toBe("Yard Sign");
    expect(leadSourceLabel({ source: "repaint_alert" })).toBe("Repaint alert");
  });

  it("creates a New lead and its contact", () => {
    const db = createSeed(NOW);
    const r = run(db, "U-EST", createLead, DRAFT);
    const lead = r.db.leads.find((l) => l.id === val(r.result))!;
    expect(lead.stage).toBe("new_lead");
    expect(lead.sourceLabel).toBe("Nextdoor");
    expect(lead.notes?.[0].text).toBe("Fence and deck.");
    expect(r.db.customers.find((c) => c.id === lead.customerId)?.name).toBe("Nora Price");
    expect(r.db.properties.find((p) => p.id === lead.propertyId)?.address).toBe("88 Cedar Lane");
    expect(run(db, "U-EST", createLead, { ...DRAFT, phone: "", email: "" }).result.ok).toBe(false);
  });

  it("moves New → Contacted → Scheduled, then an estimate can be created", () => {
    let db = createSeed(NOW);
    let r = run(db, "U-EST", createLead, DRAFT);
    const id = val(r.result);
    db = r.db;
    expect(run(db, "U-EST", setLeadStage, id, "lost").result.ok).toBe(false);
    expect(run(db, "U-EST", setLeadStage, id, "pending").result.ok).toBe(false);
    expect(run(db, "U-EST", scheduleLeadEstimate, id, { date: "2026-06-12", time: "10:00", durationMin: 60, estimatorId: "U-EST" }).result.ok).toBe(false);
    db = run(db, "U-EST", setLeadStage, id, "contacted").db;
    r = run(db, "U-EST", scheduleLeadEstimate, id, { date: "2026-06-12", time: "10:00", durationMin: 60, estimatorId: "U-EST" });
    expect(r.result.ok).toBe(true);
    db = r.db;
    const lead = db.leads.find((l) => l.id === id)!;
    expect(lead.stage).toBe("estimate_scheduled");
    expect(lead.assignedUserId).toBe("U-EST");
    expect(run(db, "U-EST", createEstimateFromLead, { leadId: id, title: "Fence", estimatorId: "U-EST" }).result.ok).toBe(true);
  });

  it("archives only from Scheduled, Pending or Lost, and restores to Contacted", () => {
    let db = createSeed(NOW);
    expect(run(db, "U-EST", setLeadStage, "LEAD-2026-10", "archived").result.ok).toBe(true);
    db = run(db, "U-EST", setLeadStage, "LEAD-2026-10", "archived").db;
    expect(run(db, "U-EST", setLeadStage, "LEAD-2026-10", "new_lead").result.ok).toBe(false);
    expect(run(db, "U-EST", setLeadStage, "LEAD-2026-10", "contacted").result.ok).toBe(true);
    const fresh = run(createSeed(NOW), "U-EST", createLead, DRAFT);
    expect(run(fresh.db, "U-EST", setLeadStage, val(fresh.result), "archived").result.ok).toBe(false);
  });

  it("adds notes newest first", () => {
    let db = createSeed(NOW);
    db = run(db, "U-EST", addLeadNote, "LEAD-2026-10", "First").db;
    db = run(db, "U-EST", addLeadNote, "LEAD-2026-10", "Second").db;
    expect(db.leads.find((l) => l.id === "LEAD-2026-10")!.notes!.map((n) => n.text)).toEqual(["Second", "First"]);
    expect(run(db, "U-EST", addLeadNote, "LEAD-2026-10", "  ").result.ok).toBe(false);
  });
});

describe("Feature 29 — follow-ups in the Lead Pipeline (D5)", () => {
  it("every seeded follow-up has a Repaint alert lead at the mapped stage", () => {
    const db = createSeed(NOW);
    for (const fu of db.followUps) {
      const lead = db.leads.find((l) => l.id === fu.leadId);
      expect(lead, fu.id).toBeDefined();
      if (!fu.estimateId) {
        expect(lead!.source).toBe("repaint_alert");
        expect(lead!.stage).toBe(FOLLOW_UP_LEAD_STAGE[fu.status]);
      }
    }
  });

  it("qualifying an alert opens a New lead; a quote request moves it to Scheduled", () => {
    let db = createSeed(NOW);
    const r = run(db, "U-OFFICE", qualifyAlert, "RA-1001", { decision: "accepted", reason: "Owner confirmed, walls due", checks: ["address", "owner", "opportunity"] });
    expect(r.result.ok).toBe(true);
    db = r.db;
    const fuId = (r.result as unknown as { value: { followUpId: string } }).value.followUpId;
    const fu = db.followUps.find((f) => f.id === fuId)!;
    const lead = db.leads.find((l) => l.id === fu.leadId)!;
    expect(lead).toMatchObject({ source: "repaint_alert", stage: "new_lead", propertyId: "PROP-1003", customerId: "C-ELENA" });
    // The follow-up drives the lead: no manual move.
    expect(run(db, "U-EST", setLeadStage, lead.id, "contacted").result.ok).toBe(false);
    db = run(db, "U-OFFICE", requestQuote, fuId, "link").db;
    expect(db.leads.find((l) => l.id === lead.id)!.stage).toBe("estimate_scheduled");
  });

  it("a new estimate from history books the appointment on the follow-up's lead", () => {
    let db = createSeed(NOW);
    const q = run(db, "U-OFFICE", qualifyAlert, "RA-1001", { decision: "accepted", reason: "Owner confirmed, walls due", checks: ["address", "owner", "opportunity"] });
    db = q.db;
    const fuId = (q.result as unknown as { value: { followUpId: string } }).value.followUpId;
    const leadId = db.followUps.find((f) => f.id === fuId)!.leadId!;
    const leads = db.leads.length;
    const r = run(db, "U-EST", startEstimateFromHistory, {
      propertyId: "PROP-1003", applicationIds: ["APP-3031", "APP-3041"], acknowledgedOpen: true, followUpId: fuId, newLead: { scheduledAt: "2026-06-12T15:00:00.000Z", estimatorId: "U-EST" },
    });
    const est = r.db.estimates.find((e) => e.id === val(r.result))!;
    expect(est.leadId).toBe(leadId);
    expect(r.db.leads.length).toBe(leads);
    expect(r.db.leads.find((l) => l.id === leadId)).toMatchObject({ stage: "estimate_scheduled", estimateId: est.id, assignedUserId: "U-EST" });
  });
});

describe("Feature 34 — Use in marketing on a work order photo", () => {
  it("copies the photo into the media library once, linked to the job", () => {
    const db = createSeed(NOW);
    const r = run(db, "U-OFFICE", sendPhotoToMarketing, "WO-2026-1", "ATT-1");
    const id = val(r.result);
    const asset = r.db.mediaAssets.find((m) => m.id === id)!;
    expect(asset).toMatchObject({ jobId: "JOB-2026-1", release: "signed_contract", identifying: false });
    expect(r.db.workOrders.find((w) => w.id === "WO-2026-1")!.attachments.find((a) => a.id === "ATT-1")!.mediaAssetId).toBe(id);
    expect(run(r.db, "U-OFFICE", sendPhotoToMarketing, "WO-2026-1", "ATT-1").result.ok).toBe(false);
    expect(run(db, "U-CREW", sendPhotoToMarketing, "WO-2026-1", "ATT-1").result.ok).toBe(false);
  });
});
