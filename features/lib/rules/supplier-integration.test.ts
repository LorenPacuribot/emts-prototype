/**
 * Feature 19 — supplier connections, electronic send, inbound supplier
 * messages, processing / substitute statuses, and edits before sending.
 */
import { describe, expect, it } from "vitest";
import { produce } from "immer";
import type { ActionResult, Database, User } from "@/features/types";
import { createSeed } from "@/features/data/seed";
import { acceptRecalculation, generateOrder } from "@/features/lib/store/actions/materials";
import {
  confirmDestination, editIssuedOrder, receiveSupplierMessage, requestReplacement, saveMapping, saveSupplierConnection, simulateSupplierMessage, submitOrder,
  testSupplierConnection,
} from "@/features/lib/store/actions/supplier";
import { buildSupplierOrder } from "@/features/lib/integrations/supplier-connector";
import { aggregateStatus, itemCodeFor, jobDemand, lineState } from "./procurement";

const NOW = "2026-06-10T15:00:00.000Z";

function run<A extends unknown[], R>(db: Database, userId: string, action: (db: Database, actor: User, ...args: A) => ActionResult<R>, ...args: A) {
  let result: ActionResult<R> = { ok: false, error: "not run" };
  const next = produce(db, (draft) => {
    result = action(draft as Database, draft.users.find((u) => u.id === userId)!, ...args);
  });
  return { db: next, result };
}
function sys<R>(db: Database, fn: (d: Database) => ActionResult<R>) {
  let result: ActionResult<R> = { ok: false, error: "not run" };
  const next = produce(db, (draft) => { result = fn(draft as Database); });
  return { db: next, result };
}

/** An issued (unsent) Sherwin-Williams order with every pack mapped to an item code. */
function issuedOrder(): { db: Database; poId: string } {
  let db = createSeed(NOW);
  let pick: { jobId: string; specId: string; gal: number } | undefined;
  for (const jobId of ["JOB-2026-1", "JOB-2026-5", "JOB-2026-2"]) {
    db = run(db, "U-OWNER", acceptRecalculation, jobId).db;
    const line = jobDemand(db, jobId).find((l) => !l.blocked.length && lineState(db, jobId, l.specId, l.needGal).orderableNow >= 1);
    if (line) { pick = { jobId, specId: line.specId, gal: 1 }; break; }
  }
  const r = run(db, "U-OWNER", generateOrder, {
    key: "sup-test", jobId: pick!.jobId, supplierId: "SUP-SW", branchId: "BR-7132", phase: "Phase 1",
    deliveryDate: "2099-06-20T12:00:00.000Z", fulfilment: "pickup", lines: [{ specId: pick!.specId, gallons: pick!.gal }],
  });
  expect(r.result.ok).toBe(true);
  db = r.db;
  const po = db.purchaseOrders.find((p) => p.generationKey === "sup-test")!;
  for (const l of po.lines) {
    const cat = db.catalog.find((c) => c.product === l.product)!;
    for (const p of l.packs) {
      if (!itemCodeFor(db, { product: l.product, packSize: p.size, branchId: po.branchId })) {
        db = run(db, "U-OFFICE", saveMapping, { supplierId: "SUP-SW", catalogId: cat.id, packSize: p.size, itemCode: `TST-${p.size}-${cat.id.slice(-4)}` }).db;
      }
    }
  }
  return { db, poId: po.id };
}

function sentElectronically() {
  const { db: d0, poId } = issuedOrder();
  let db = run(d0, "U-OFFICE", confirmDestination, poId, true).db;
  const r = run(db, "U-OFFICE", submitOrder, poId, "electronic", {});
  expect(r.result).toMatchObject({ ok: true });
  db = r.db;
  return { db, poId };
}

describe("Supplier connection settings", () => {
  it("an API/EDI connection needs a credential, and the secret is never stored or logged", () => {
    const db = createSeed(NOW);
    const bm = "SUP-BM";
    expect(run(db, "U-OFFICE", saveSupplierConnection, bm, { type: "api_edi", endpointLabel: "BM EDI" }).result.ok).toBe(false);
    const secret = "sk_live_TOPSECRET_123";
    const r = run(db, "U-OFFICE", saveSupplierConnection, bm, { type: "api_edi", endpointLabel: "BM EDI", credential: secret });
    expect(r.result.ok).toBe(true);
    expect(JSON.stringify(r.db)).not.toContain(secret);
    const c = r.db.suppliers.find((s) => s.id === bm)!.connection!;
    expect(c).toMatchObject({ type: "api_edi", credentialsOnFile: true, health: "untested", sandbox: true });
    expect(run(r.db, "U-OFFICE", testSupplierConnection, bm).db.suppliers.find((s) => s.id === bm)!.connection!.health).toBe("healthy");
  });
  it("email needs a valid order inbox; only setup roles can change connections", () => {
    const db = createSeed(NOW);
    expect(run(db, "U-OFFICE", saveSupplierConnection, "SUP-BM", { type: "email", orderEmail: "nope" }).result.ok).toBe(false);
    expect(run(db, "U-OFFICE", saveSupplierConnection, "SUP-BM", { type: "email", orderEmail: "orders@bm.example" }).result.ok).toBe(true);
    expect(run(db, "U-EST", saveSupplierConnection, "SUP-BM", { type: "manual" }).result.ok).toBe(false);
  });
});

describe("Electronic send", () => {
  it("builds the structured order with manufacturer, colour, number, sheen, tint base, packs and item codes", () => {
    const { db, poId } = issuedOrder();
    const built = buildSupplierOrder(db, db.purchaseOrders.find((p) => p.id === poId)!);
    expect("payload" in built).toBe(true);
    const line = (built as { payload: { lines: Record<string, unknown>[] } }).payload.lines[0];
    for (const k of ["manufacturer", "product", "colourName", "colourNumber", "sheen", "tintBase", "packs"]) expect(line[k]).toBeTruthy();
    expect((line.packs as { itemCode: string }[]).every((p) => p.itemCode)).toBe(true);
  });
  it("transmits through the sandbox connector and marks the order Sent", () => {
    const { db, poId } = sentElectronically();
    const po = db.purchaseOrders.find((p) => p.id === poId)!;
    expect(po.status).toBe("sent");
    expect(po.sendMethod).toBe("electronic");
    expect(po.transmission).toMatchObject({ sandbox: true, connector: "SW PRO ordering API" });
    expect(po.transmission!.messageId).toMatch(/^SBX-/);
  });
  it("refuses when the connection is not healthy, and nothing changes status", () => {
    const { db: d0, poId } = issuedOrder();
    let db = produce(d0, (d) => { d.suppliers.find((s) => s.id === "SUP-SW")!.connection!.health = "failing"; });
    db = run(db, "U-OFFICE", confirmDestination, poId, true).db;
    const r = run(db, "U-OFFICE", submitOrder, poId, "electronic", {});
    expect(r.result.ok).toBe(false);
    expect(r.db.purchaseOrders.find((p) => p.id === poId)!.status).toBe("issued");
  });
  it("refuses when a pack has no store item code", () => {
    const { db: d0, poId } = issuedOrder();
    let db = produce(d0, (d) => { d.productMappings = []; });
    db = run(db, "U-OFFICE", confirmDestination, poId, true).db;
    const r = run(db, "U-OFFICE", submitOrder, poId, "electronic", {});
    expect(r.result.ok).toBe(false);
    expect((r.result as { error: string }).error).toMatch(/item code/);
  });
});

describe("Inbound supplier messages", () => {
  it("order received acknowledges the order, with the supplier as the source", () => {
    const { db: d0, poId } = sentElectronically();
    const r = sys(d0, (d) => receiveSupplierMessage(d, { messageId: "M1", poId, kind: "order_received", reference: "SW-ACK-1" }));
    expect(r.result.ok).toBe(true);
    const po = r.db.purchaseOrders.find((p) => p.id === poId)!;
    expect(po).toMatchObject({ status: "acknowledged", ackMethod: "electronic", ackRef: "SW-ACK-1" });
    expect(po.events.at(-1)).toMatchObject({ source: "supplier", by: "SUP-SW" });
    expect(r.db.activity[0]).toMatchObject({ source: "supplier", userId: "SUP-SW" });
  });
  it("a repeated message ID changes nothing", () => {
    const { db: d0, poId } = sentElectronically();
    let db = sys(d0, (d) => receiveSupplierMessage(d, { messageId: "M1", poId, kind: "order_received", reference: "A" })).db;
    const lineId = db.purchaseOrders.find((p) => p.id === poId)!.lines[0].id;
    db = sys(db, (d) => receiveSupplierMessage(d, { messageId: "M2", poId, kind: "line_status", lineId, statusText: "Processing" })).db;
    const before = db.purchaseOrders.find((p) => p.id === poId)!.events.length;
    const again = sys(db, (d) => receiveSupplierMessage(d, { messageId: "M2", poId, kind: "line_status", lineId, statusText: "Ready for pickup" }));
    expect(again.result).toMatchObject({ ok: true, value: "duplicate" });
    const po = again.db.purchaseOrders.find((p) => p.id === poId)!;
    expect(po.lines[0].status).toBe("processing");
    expect(po.events.length).toBe(before);
  });
  it("processing, ready and unfamiliar text flow through the existing status rules", () => {
    const { db: d0, poId } = sentElectronically();
    let db = sys(d0, (d) => receiveSupplierMessage(d, { messageId: "M1", poId, kind: "order_received", reference: "A" })).db;
    const lineId = db.purchaseOrders.find((p) => p.id === poId)!.lines[0].id;
    db = sys(db, (d) => receiveSupplierMessage(d, { messageId: "M2", poId, kind: "line_status", lineId, statusText: "Processing" })).db;
    expect(db.purchaseOrders.find((p) => p.id === poId)!.status).toBe("processing");
    db = sys(db, (d) => receiveSupplierMessage(d, { messageId: "M3", poId, kind: "line_status", lineId, statusText: "BO - TINT MACH DOWN" })).db;
    const po = db.purchaseOrders.find((p) => p.id === poId)!;
    expect(po.lines[0]).toMatchObject({ status: "processing", supplierStatusText: "BO - TINT MACH DOWN" });
    db = sys(db, (d) => receiveSupplierMessage(d, { messageId: "M4", poId, kind: "line_status", lineId, statusText: "Ready for pickup" })).db;
    expect(db.purchaseOrders.find((p) => p.id === poId)!.status).toBe("ready_for_pickup");
  });
  /** Acknowledged electronic order with a substitute offered on its first line. */
  function withOffer(offer: (line: { product: string; packs: { size: string }[] }, db: Database) => { product: string; packSize: "qt" | "gal" | "5gal" }) {
    const { db: d0, poId } = sentElectronically();
    let db = sys(d0, (d) => receiveSupplierMessage(d, { messageId: "M1", poId, kind: "order_received", reference: "A" })).db;
    const line = db.purchaseOrders.find((p) => p.id === poId)!.lines[0];
    const sub = offer(line, db);
    db = sys(db, (d) => receiveSupplierMessage(d, { messageId: "M2", poId, kind: "line_status", lineId: line.id, statusText: "Substitute available", substitute: sub })).db;
    return { db, poId, lineId: line.id, sub, catalogId: db.catalog.find((c) => c.product === sub.product)!.id };
  }

  it("substitute available records the offer on the line and flags the order", () => {
    const { db, poId, sub, catalogId } = withOffer((l) => ({ product: l.product, packSize: l.packs[0].size === "5gal" ? "gal" : "5gal" }));
    const po = db.purchaseOrders.find((p) => p.id === poId)!;
    expect(po.status).toBe("substitute_available");
    expect(po.lines[0].substituteOffer).toMatchObject({ product: sub.product, catalogId, packSize: sub.packSize });
  });
  it("an approved substitute goes back to the supplier as Processing and the offer clears", () => {
    // Same product in another pack size: Rule 1 lets the office or owner approve it.
    const { db, poId, lineId, sub, catalogId } = withOffer((l) => ({ product: l.product, packSize: l.packs[0].size === "5gal" ? "gal" : "5gal" }));
    const r = run(db, "U-OWNER", requestReplacement, { poId, lineId, newCatalogId: catalogId, newPackSize: sub.packSize, isDirectSuccessor: false });
    expect(r.result).toMatchObject({ ok: true, value: "approved" });
    const line = r.db.purchaseOrders.find((p) => p.id === poId)!.lines[0];
    expect(line.status).toBe("processing");
    expect(line.substituteOffer).toBeUndefined();
    expect(line.packs[0].size).toBe(sub.packSize);
  });
  it("a substitute that changes the product line on a signed job is blocked by Rule 1 and stays open", () => {
    const { db, poId, lineId, sub, catalogId } = withOffer((l, d) => {
      const line = d.catalog.find((c) => c.product === l.product)!.productLine;
      const other = d.catalog.find((c) => c.productLine !== line && c.available.length)!;
      return { product: other.product, packSize: other.available[0] };
    });
    const r = run(db, "U-OWNER", requestReplacement, { poId, lineId, newCatalogId: catalogId, newPackSize: sub.packSize, isDirectSuccessor: false });
    expect(r.result.ok).toBe(false);
    expect(r.db.purchaseOrders.find((p) => p.id === poId)!.lines[0].status).toBe("substitute_available");
  });
  it("orders sent manually can't be updated by a supplier connection; simulation is sandbox-only", () => {
    const { db: d0, poId } = issuedOrder();
    let db = run(d0, "U-OFFICE", confirmDestination, poId, true).db;
    db = run(db, "U-OFFICE", submitOrder, poId, "phone", { employee: "Ray", callTime: NOW }).db;
    expect(sys(db, (d) => receiveSupplierMessage(d, { messageId: "X", poId, kind: "order_received", reference: "A" })).result.ok).toBe(false);
    expect(run(db, "U-OFFICE", simulateSupplierMessage, { poId, kind: "order_received", reference: "A" }).result.ok).toBe(false);
  });
});

describe("Order status rules", () => {
  it("a substitute offer outranks everything but a problem; processing shows once acknowledged", () => {
    const base = { status: "acknowledged" as const, ackAt: NOW };
    const l = (status: string) => ({ status }) as never;
    expect(aggregateStatus({ ...base, lines: [l("ready_for_pickup"), l("substitute_available")] })).toBe("substitute_available");
    expect(aggregateStatus({ ...base, lines: [l("problem"), l("substitute_available")] })).toBe("problem");
    expect(aggregateStatus({ ...base, lines: [l("acknowledged"), l("processing")] })).toBe("processing");
    expect(aggregateStatus({ ...base, lines: [l("acknowledged"), l("ready_for_pickup")] })).toBe("acknowledged");
  });
});

describe("Edit a generated order before sending", () => {
  it("quantities can go down, not up", () => {
    const { db, poId } = issuedOrder();
    const line = db.purchaseOrders.find((p) => p.id === poId)!.lines[0];
    expect(run(db, "U-OFFICE", editIssuedOrder, poId, { gallons: { [line.id]: line.gallons + 1 } }).result.ok).toBe(false);
    const r = run(db, "U-OFFICE", editIssuedOrder, poId, { gallons: { [line.id]: 0.5 } });
    expect(r.result.ok).toBe(true);
    expect(r.db.purchaseOrders.find((p) => p.id === poId)!.lines[0].gallons).toBeLessThanOrEqual(line.gallons);
  });
  it("the branch can move within the same supplier and the destination must be confirmed again", () => {
    const { db: d0, poId } = issuedOrder();
    const db = run(d0, "U-OFFICE", confirmDestination, poId, true).db;
    expect(run(db, "U-OFFICE", editIssuedOrder, poId, { branchId: "BR-BM-1" }).result.ok).toBe(false);
    const r = run(db, "U-OFFICE", editIssuedOrder, poId, { branchId: "BR-7248" });
    expect(r.result.ok).toBe(true);
    expect(r.db.purchaseOrders.find((p) => p.id === poId)).toMatchObject({ branchId: "BR-7248", destinationConfirmed: false });
  });
  it("can't be edited once sent", () => {
    const { db, poId } = sentElectronically();
    expect(run(db, "U-OFFICE", editIssuedOrder, poId, { branchId: "BR-7248" }).result.ok).toBe(false);
  });
});
