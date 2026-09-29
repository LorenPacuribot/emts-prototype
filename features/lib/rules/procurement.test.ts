/**
 * Features 18 and 19 — procurement rules.
 * Each test names the acceptance criterion it checks.
 */
import { describe, expect, it } from "vitest";
import { createSeed } from "@/features/data/seed";
import type { Database, PurchaseOrder } from "@/features/types";
import {
  ackException, aggregateStatus, deliveryChangeApprover, interpretSupplierStatus, isQuarterGallon, isStale, jobConsumables, jobDemand,
  limitCheck, lineState, nextPoNumber, replacementDecision, routeReceipt, shelfCandidates, snapshotLines, specDemand,
} from "./procurement";
import { packContainers } from "./materials";
import { ackClock } from "./dates";

const NOW = "2026-09-23T15:30:00.000Z";
const fresh = (): Database => createSeed(NOW);

describe("18.1 — demand calculation", () => {
  it("uses the proven field rate ahead of the manufacturer rate", () => {
    const db = fresh();
    const line = specDemand(db, db.specs.find((s) => s.id === "SPEC-1")!);
    expect(line.source).toBe("field_rate");
    expect(line.rate).toBe(325);
  });
  it("a project override reads Project override and its rate is used", () => {
    const db = fresh();
    db.materialOverrides = [{ id: "O1", jobId: "JOB-2026-1", specId: "SPEC-1", kind: "coverage", value: 300, reason: "Chalky siding", by: "U-OFFICE", at: NOW }];
    const line = specDemand(db, db.specs.find((s) => s.id === "SPEC-1")!);
    expect(line.source).toBe("override");
    expect(line.parts.every((p) => p.rate === 300)).toBe(true);
  });
  it("a rough surface uses its own rule and 15% waste, not the sound rate and not 10% + 15%", () => {
    const db = fresh();
    const line = specDemand(db, db.specs.find((s) => s.id === "SPEC-1")!);
    const rough = line.parts.find((p) => p.condition === "rough")!;
    expect(rough.rate).toBe(250);
    expect(line.waste).toBe(0.15);
  });
  it("new drywall with no matching coverage rule is flagged and blocks ordering", () => {
    const db = fresh();
    db.surfaces.find((s) => s.id === "SF-4011")!.condition = "new_drywall";
    const line = specDemand(db, db.specs.find((s) => s.id === "SPEC-6")!);
    expect(line.parts.find((p) => p.surfaceId === "SF-4011")!.rate).toBe(0);
    expect(line.blocked.some((b) => b.includes("Coverage missing or zero"))).toBe(true);
  });
  it("zero coverage blocks ordering with the line named", () => {
    const db = fresh();
    db.catalog.find((c) => c.id === "PRD-PM200")!.spreadRate = 0;
    const line = specDemand(db, db.specs.find((s) => s.id === "SPEC-7")!);
    expect(line.blocked.join(" ")).toContain("Living Room · Ceiling");
  });
  it("an applied change order adds its area to the matching colour; a pending one adds nothing", () => {
    const db = fresh();
    db.changeOrders = db.changeOrders.filter((c) => c.jobId !== db.specs.find((s) => s.id === "SPEC-6")!.jobId);
    const base = specDemand(db, db.specs.find((s) => s.id === "SPEC-6")!).baseNeedGal;
    const spec = db.specs.find((s) => s.id === "SPEC-6")!;
    const co = {
      ...db.changeOrders[0]!, id: "CO-T", jobId: spec.jobId, status: "approved" as const,
      lines: [{ id: "L1", kind: "add" as const, description: "Closet", sqft: 190, cost: 300, colour: "Agreeable Gray SW 7029" }],
      downstream: { work_order: "done" as const, materials: "not_started" as const, scheduler: "done" as const, billing: "done" as const },
    };
    db.changeOrders.push(co);
    expect(specDemand(db, spec).baseNeedGal).toBeCloseTo(base, 9);
    co.downstream.materials = "done" as never;
    // 190 sq ft × 2 coats / 380 = 1 gal more
    expect(specDemand(db, spec).baseNeedGal).toBeCloseTo(base + 1, 9);
  });
  it("carries full precision and rounds once to three decimals (Rule 6)", () => {
    const db = fresh();
    db.changeOrders = [];
    const line = specDemand(db, db.specs.find((s) => s.id === "SPEC-6")!);
    // 1,140 sq ft × 2 coats / 380 = 6 gal; × 1.05 = 6.3
    expect(line.baseNeedGal).toBeCloseTo(6, 9);
    expect(line.calculatedNeedGal).toBe(6.3);
  });
  it("an approved spec with no product line is blocked with the reason", () => {
    const db = fresh();
    const line = jobDemand(db, "JOB-2026-1").find((l) => l.specId === "SPEC-2")!;
    expect(line.blocked).toContain("Product line missing on the colour card");
  });
  it("shows the stale state after scope changes, keeping the previous figures", () => {
    const db = fresh();
    const snapshot = { lines: snapshotLines(jobDemand(db, "JOB-2026-1")) };
    expect(isStale(snapshot, jobDemand(db, "JOB-2026-1"))).toBe(false);
    db.surfaces.find((s) => s.id === "SF-1011")!.areaSqft = 700;
    expect(isStale(snapshot, jobDemand(db, "JOB-2026-1"))).toBe(true);
  });
});

describe("18.2 — packing", () => {
  it("6.2 gal with gallon and 5-gallon packs picks the smallest excess and shows it", () => {
    const r = packContainers(6.2, ["gal", "5gal"]);
    expect(r.totalGal).toBe(7);
    expect(r.excessGal).toBe(0.8);
  });
  it("never selects an unavailable 5-gallon pack", () => {
    const r = packContainers(11, ["qt", "gal"]);
    expect(r.packs.some((p) => p.size === "5gal")).toBe(false);
  });
});

describe("18 — consumables allowance", () => {
  it("exterior job: $150 + $25 per 1,000 sq ft prorated, once per job", () => {
    const db = fresh();
    const c = jobConsumables(db, db.jobs.find((j) => j.id === "JOB-2026-1")!);
    // 2,874 sq ft exterior -> 150 + 71.85
    expect(c.exterior).toBe(221.85);
    expect(c.interior).toBe(0);
  });
  it("interior repaint rooms at $35 each", () => {
    const db = fresh();
    const c = jobConsumables(db, db.jobs.find((j) => j.id === "JOB-2026-5")!);
    expect(c.rooms.length).toBe(3);
    expect(c.interior).toBe(105);
  });
});

describe("18.3 — leftover shelf", () => {
  it("does not propose stock tinted 30 months ago", () => {
    const db = fresh();
    const line = specDemand(db, db.specs.find((s) => s.id === "SPEC-8")!);
    const sh2 = shelfCandidates(db, line, NOW).find((c) => c.stock.id === "SH-2")!;
    expect(sh2.state).toBe("too_old");
  });
  it("an unconfirmed proposal leaves the purchase need unchanged", () => {
    const db = fresh();
    const line = specDemand(db, db.specs.find((s) => s.id === "SPEC-1")!);
    expect(shelfCandidates(db, line, NOW).find((c) => c.stock.id === "SH-1")!.state).toBe("proposed");
    expect(lineState(db, "JOB-2026-1", "SPEC-1", line.needGal).reservedShelf).toBe(0);
  });
  it("stock reserved to job A is shown as unavailable to job B with job A named", () => {
    const db = fresh();
    const line = specDemand(db, db.specs.find((s) => s.id === "SPEC-1")!);
    const sh5 = shelfCandidates(db, line, NOW).find((c) => c.stock.id === "SH-5")!;
    expect(sh5.state).toBe("reserved_elsewhere");
    expect(sh5.reason).toContain("JOB-2026-3");
  });
  it("measured quantity must be to the nearest quarter gallon", () => {
    expect(isQuarterGallon(1.25)).toBe(true);
    expect(isQuarterGallon(1.3)).toBe(false);
    expect(isQuarterGallon(0)).toBe(false);
  });
});

describe("18.4 — quantity states (Rule 2)", () => {
  const po = (overrides: Partial<PurchaseOrder>): PurchaseOrder => ({
    id: "JOB-2026-5-PO-09", jobId: "JOB-2026-5", supplierId: "SUP-SW", phase: "Test", status: "sent", createdAt: NOW, createdBy: "U-OFFICE",
    destinationConfirmed: true, events: [],
    lines: [{ id: "L1", specId: "SPEC-6", description: "", product: "", colourLabel: "", sheen: "", packs: [], gallons: 4, unitCostPerGal: 58, status: "sent", receivedGal: 0, cancelledGal: 0, returnedGal: 0, creditAmount: 0 }],
    ...overrides,
  });
  const clean = () => {
    const db = fresh();
    db.purchaseOrders = db.purchaseOrders.filter((p) => p.jobId !== "JOB-2026-5");
    return db;
  };
  it("10 gal demand with 4 sent: outstanding 10, orderable now 6", () => {
    const db = clean();
    db.purchaseOrders.push(po({}));
    const s = lineState(db, "JOB-2026-5", "SPEC-6", 10);
    expect(s.outstanding).toBe(10);
    expect(s.orderableNow).toBe(6);
  });
  it("after acknowledgment: outstanding 6, orderable now 6", () => {
    const db = clean();
    db.purchaseOrders.push(po({ ackAt: NOW, status: "acknowledged" }));
    const s = lineState(db, "JOB-2026-5", "SPEC-6", 10);
    expect(s.outstanding).toBe(6);
    expect(s.orderableNow).toBe(6);
  });
  it("confirmed cancellation of 4 returns outstanding to 10 exactly once", () => {
    const db = clean();
    const p = po({ ackAt: NOW, status: "acknowledged" });
    p.lines[0].cancelledGal = 4;
    db.purchaseOrders.push(p);
    expect(lineState(db, "JOB-2026-5", "SPEC-6", 10).outstanding).toBe(10);
  });
  it("a cancellation requested but not confirmed changes no figure", () => {
    const db = clean();
    db.purchaseOrders.push(po({ ackAt: NOW, status: "acknowledged", cancellations: [{ id: "C1", lineId: "L1", qtyGal: 4, requestedBy: "U-OFFICE", requestedAt: NOW, kind: "cancel_request" }] }));
    const s = lineState(db, "JOB-2026-5", "SPEC-6", 10);
    expect(s.outstanding).toBe(6);
    expect(s.requestedCancellations).toBe(4);
  });
  it("an order unacknowledged for a week is still held (no timer release)", () => {
    const db = clean();
    db.purchaseOrders.push(po({ sentAt: "2026-09-10T14:00:00.000Z", createdAt: "2026-09-10T14:00:00.000Z" }));
    expect(lineState(db, "JOB-2026-5", "SPEC-6", 10).sentUnacknowledged).toBe(4);
  });
});

describe("18.5 — limit check and numbering", () => {
  const monday = "2026-09-21T15:00:00.000Z";
  const thursday = "2026-09-24T15:00:00.000Z";
  it("$900 Monday + $800 Thursday = $1,700 rolling total: office manager approval required", () => {
    const r = limitCheck({ entries: [{ createdAt: monday, value: 900, credits: 0 }], newValue: 800, orderDate: thursday, requesterRole: "estimator" });
    expect(r.windowTotal).toBe(1700);
    expect(r.estimatorPass).toBe(false);
    expect(r.needs).toBe("office_manager");
  });
  it("$1,400 with a confirmed $600 credit, plus $600: $800 net keeps the estimator inside the limit", () => {
    const r = limitCheck({ entries: [{ createdAt: monday, value: 1400, credits: 600 }], newValue: 600, orderDate: thursday, requesterRole: "estimator" });
    expect(r.windowTotal).toBe(1400);
    expect(r.estimatorPass).toBe(true);
    expect(r.needs).toBe("none");
  });
  it("orders older than seven days drop out of the window but stay in the lifetime total", () => {
    const r = limitCheck({ entries: [{ createdAt: "2026-09-10T15:00:00.000Z", value: 1400, credits: 0 }], newValue: 600, orderDate: thursday, requesterRole: "estimator" });
    expect(r.windowTotal).toBe(600);
    expect(r.lifetimeTotal).toBe(2000);
  });
  it("lifetime job purchasing above $3,000 needs the owner", () => {
    const r = limitCheck({ entries: [{ createdAt: "2026-08-01T15:00:00.000Z", value: 2800, credits: 0 }], newValue: 400, orderDate: thursday, requesterRole: "office_manager" });
    expect(r.needs).toBe("owner");
  });
  it("numbers on the JOB-PO-01 sequence", () => {
    const db = fresh();
    expect(nextPoNumber(db, "JOB-2026-1")).toBe("JOB-2026-1-PO-02");
    expect(nextPoNumber(db, "JOB-2026-3")).toBe("JOB-2026-3-PO-01");
  });
});

describe("18.Q04 — receiving", () => {
  it("8% over the ordered quantity goes to job cost", () => {
    const r = routeReceipt(10, 0, 10.8);
    expect(r.toJobCostGal).toBe(0.8);
    expect(r.toShelfGal).toBe(0);
  });
  it("20% over: above 10% goes to shelf stock", () => {
    const r = routeReceipt(10, 10, 2);
    expect(r.toJobCostGal).toBe(1);
    expect(r.toShelfGal).toBe(1);
  });
});

describe("19 — supplier status", () => {
  it("one of four lines ready does not mark the order fulfilled", () => {
    const line = { status: "acknowledged" } as PurchaseOrder["lines"][number];
    const status = aggregateStatus({ status: "acknowledged", ackAt: NOW, lines: [{ ...line, status: "ready_for_pickup" }, line, line, line] });
    expect(status).toBe("acknowledged");
  });
  it("unfamiliar supplier text is kept verbatim and no status is inferred", () => {
    expect(interpretSupplierStatus("BO - TINT MACH DOWN / ETA 2D")).toBeNull();
    expect(interpretSupplierStatus("Ready for pickup")).toBe("ready_for_pickup");
  });
  it("sent 3 p.m. Friday: the exception raises Monday 10 a.m., skipping the weekend", () => {
    const fri = new Date(2026, 8, 18, 15, 0).toISOString();
    expect(ackClock(fri, new Date(2026, 8, 21, 9, 45).toISOString()).overdue).toBe(false);
    expect(ackClock(fri, new Date(2026, 8, 21, 10, 0).toISOString()).overdue).toBe(true);
  });
  it("sent the day before a federal holiday: the holiday is excluded", () => {
    // Fri 9 Oct 3 p.m.; Mon 12 Oct is Columbus Day; flag raises Tue 13 Oct 10 a.m.
    const fri = new Date(2026, 9, 9, 15, 0).toISOString();
    expect(ackClock(fri, new Date(2026, 9, 12, 15, 0).toISOString()).overdue).toBe(false);
    expect(ackClock(fri, new Date(2026, 9, 13, 10, 0).toISOString()).overdue).toBe(true);
  });
  it("routes to the office manager when the sender is absent, then the owner", () => {
    const db = fresh();
    const po = db.purchaseOrders.find((p) => p.id === "JOB-2026-2-PO-01")!;
    const users = db.users.map((u) => (u.id === po.sentBy ? { ...u, outOfOffice: true } : u));
    const ex = ackException(po, users, new Date(2026, 8, 23, 10, 0).toISOString())!;
    expect(ex.overdue).toBe(true);
    expect(ex.step).not.toBe("sender");
    const escalated = ackException({ ...po, escalation: "owner" }, db.users, NOW)!;
    expect(escalated.responsible?.role).toBe("owner");
  });
  it("delivery moved 2 days: office manager; 5 days: owner", () => {
    expect(deliveryChangeApprover("2026-09-24T12:00:00Z", "2026-09-26T12:00:00Z").needs).toBe("office_manager");
    expect(deliveryChangeApprover("2026-09-24T12:00:00Z", "2026-09-29T12:00:00Z").needs).toBe("owner");
  });
});

describe("19 — replacement authority (Rule 1)", () => {
  const before = { brand: "Sherwin-Williams", productLine: "Duration", colour: "SW 7015", sheen: "Satin", product: "Duration Exterior Acrylic Latex", packSize: "5gal", costPerGal: 77 };
  it("same-brand pack change at +6%: office manager alone, no customer document", () => {
    const r = replacementDecision({ before, after: { ...before, packSize: "gal", costPerGal: 81.62 }, jobSigned: true, isDirectSuccessor: false, approvedCostPerGal: 77, orderTotalDelta: 46.2 });
    expect(r.decision).toBe("office_manager");
  });
  it("product line change on a signed job needs a priced change order", () => {
    const r = replacementDecision({ before, after: { ...before, productLine: "SuperPaint", product: "SuperPaint Exterior", costPerGal: 58 }, jobSigned: true, isDirectSuccessor: false, approvedCostPerGal: 77, orderTotalDelta: -190 });
    expect(r.decision).toBe("change_order");
  });
  it("line price +12% over the approved PO price needs the owner", () => {
    const r = replacementDecision({ before, after: { ...before, packSize: "gal", costPerGal: 86.24 }, jobSigned: true, isDirectSuccessor: false, approvedCostPerGal: 77, orderTotalDelta: 92 });
    expect(r.decision).toBe("owner");
  });
  it("order total +$250 needs the owner", () => {
    const r = replacementDecision({ before, after: { ...before, packSize: "gal", costPerGal: 80 }, jobSigned: true, isDirectSuccessor: false, approvedCostPerGal: 77, orderTotalDelta: 250 });
    expect(r.decision).toBe("owner");
  });
});
