/**
 * Feature 19 — live supplier connection: server module, live send through
 * the store, the webhook inbox, and the remaining test-step behaviour.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { produce } from "immer";
import type { ActionResult, Database, SupplierOrderPayload, User } from "@/features/types";
import { createSeed } from "@/features/data/seed";
import { acceptRecalculation, generateOrder } from "@/features/lib/store/actions/materials";
import {
  confirmDestination, decideReplacement, editIssuedOrder, liveSendPreflight, receiveSupplierMessage, recordLiveCheck, saveMapping, saveSupplierConnection, submitOrder,
} from "@/features/lib/store/actions/supplier";
import { itemCodeFor, interpretSupplierStatus, jobDemand, lineState } from "@/features/lib/rules/procurement";
import {
  clearInbox, connectionStatus, envName, pushInbox, readInbox, sign, transmitOrder, validateMessage, validatePayload, verifySignature,
} from "./supplier-server";

const NOW = "2026-06-10T15:00:00.000Z";
const ENV = {
  [envName("SUP-SW", "ENDPOINT_URL")]: "https://orders.supplier.example/v1/orders",
  [envName("SUP-SW", "API_KEY")]: "key-123",
  [envName("SUP-SW", "WEBHOOK_SECRET")]: "whsec-456",
};

function run<A extends unknown[], R>(db: Database, userId: string, action: (db: Database, actor: User, ...args: A) => ActionResult<R>, ...args: A) {
  let result: ActionResult<R> = { ok: false, error: "not run" };
  const next = produce(db, (draft) => { result = action(draft as Database, draft.users.find((u) => u.id === userId)!, ...args); });
  return { db: next, result };
}

/** Issued SW order, mapped, with SW switched to a live, healthy connection. */
function liveOrder() {
  let db = createSeed(NOW);
  let pick: { jobId: string; specId: string } | undefined;
  for (const jobId of ["JOB-2026-1", "JOB-2026-5", "JOB-2026-2"]) {
    db = run(db, "U-OWNER", acceptRecalculation, jobId).db;
    const line = jobDemand(db, jobId).find((l) => !l.blocked.length && lineState(db, jobId, l.specId, l.needGal).orderableNow >= 1);
    if (line) { pick = { jobId, specId: line.specId }; break; }
  }
  db = run(db, "U-OWNER", generateOrder, {
    key: "live-test", jobId: pick!.jobId, supplierId: "SUP-SW", branchId: "BR-7132", phase: "Phase 1",
    deliveryDate: "2099-06-20T12:00:00.000Z", fulfilment: "pickup", lines: [{ specId: pick!.specId, gallons: 1 }],
  }).db;
  const po = db.purchaseOrders.find((p) => p.generationKey === "live-test")!;
  for (const l of po.lines) for (const p of l.packs) {
    if (!itemCodeFor(db, { product: l.product, packSize: p.size, branchId: po.branchId })) {
      const cat = db.catalog.find((c) => c.product === l.product)!;
      db = run(db, "U-OFFICE", saveMapping, { supplierId: "SUP-SW", catalogId: cat.id, packSize: p.size, itemCode: `LIVE-${p.size}` }).db;
    }
  }
  db = run(db, "U-OFFICE", saveSupplierConnection, "SUP-SW", { type: "api_edi", mode: "live", endpointLabel: "SW PRO ordering API" }).db;
  db = run(db, "U-OFFICE", recordLiveCheck, "SUP-SW", connectionStatus("SUP-SW", ENV)).db;
  db = run(db, "U-OFFICE", confirmDestination, po.id, true).db;
  return { db, poId: po.id };
}

describe("Server: live connection settings", () => {
  it("is live only with an https endpoint and a key; secrets are never returned", () => {
    const s = connectionStatus("SUP-SW", ENV);
    expect(s).toMatchObject({ live: true, endpointHost: "orders.supplier.example", credentialSet: true, webhookSecretSet: true });
    expect(JSON.stringify(s)).not.toContain("key-123");
    expect(JSON.stringify(s)).not.toContain("whsec-456");
    expect(connectionStatus("SUP-SW", { ...ENV, [envName("SUP-SW", "ENDPOINT_URL")]: "http://orders.supplier.example" }).live).toBe(false);
    expect(connectionStatus("SUP-SW", { ...ENV, [envName("SUP-SW", "API_KEY")]: undefined }).live).toBe(false);
    expect(connectionStatus("SUP-SW", { ...ENV, [envName("SUP-SW", "ENDPOINT_URL")]: "http://localhost:3000/api/mock-supplier" }).live).toBe(true);
  });
});

describe("Server: transmit", () => {
  const payload = (): SupplierOrderPayload => ({
    poId: "PO-1", supplierId: "SUP-SW", storeNumber: "7132", accountNumber: "A1", jobRef: "JOB-1", fulfilment: "pickup",
    lines: [{ lineId: "L1", product: "Duration Exterior Acrylic Latex", colourName: "Repose Gray", colourNumber: "SW 7015", sheen: "Satin", gallons: 1, packs: [{ size: "gal", count: 1, itemCode: "K33W00151" }] }],
  });
  it("posts the order with the server-held key to the server-configured endpoint", async () => {
    let seen: { url?: string; auth?: string | null; idem?: string | null; body?: unknown } = {};
    const fetchImpl = (async (url: URL, init: RequestInit) => {
      const h = new Headers(init.headers);
      seen = { url: String(url), auth: h.get("authorization"), idem: h.get("idempotency-key"), body: JSON.parse(String(init.body)) };
      return new Response(JSON.stringify({ messageId: "SUP-MSG-9" }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await transmitOrder("SUP-SW", payload(), { env: ENV, fetchImpl });
    expect(r).toEqual({ ok: true, messageId: "SUP-MSG-9" });
    expect(seen).toMatchObject({ url: "https://orders.supplier.example/v1/orders", auth: "Bearer key-123", idem: "PO-1" });
    expect(seen.body).toMatchObject({ poId: "PO-1", lines: [{ colourNumber: "SW 7015" }] });
  });
  it("reports a refusal, a network failure or a missing message ID as not sent", async () => {
    const reply = (res: Response | Error) => (async () => { if (res instanceof Error) throw res; return res; }) as unknown as typeof fetch;
    expect((await transmitOrder("SUP-SW", payload(), { env: ENV, fetchImpl: reply(new Response("no", { status: 500 })) })).ok).toBe(false);
    expect((await transmitOrder("SUP-SW", payload(), { env: ENV, fetchImpl: reply(new Error("ECONNREFUSED")) })).ok).toBe(false);
    expect((await transmitOrder("SUP-SW", payload(), { env: ENV, fetchImpl: reply(new Response("{}", { status: 200 })) })).ok).toBe(false);
  });
  it("rejects orders for another supplier, without item codes, or with bad packs", () => {
    expect("error" in validatePayload(payload(), "SUP-BM")).toBe(true);
    const noCode = payload(); noCode.lines[0].packs[0].itemCode = "";
    expect("error" in validatePayload(noCode, "SUP-SW")).toBe(true);
    const bad = payload(); (bad.lines[0].packs[0] as { size: string }).size = "drum";
    expect("error" in validatePayload(bad, "SUP-SW")).toBe(true);
    expect("payload" in validatePayload(payload(), "SUP-SW")).toBe(true);
  });
});

describe("Server: webhook signature and inbox", () => {
  beforeEach(() => clearInbox());
  it("accepts only a correct HMAC signature", () => {
    const body = JSON.stringify({ messageId: "M1", poId: "PO-1", kind: "order_received", reference: "R" });
    expect(verifySignature("whsec-456", body, sign("whsec-456", body))).toBe(true);
    expect(verifySignature("whsec-456", body, sign("other", body))).toBe(false);
    expect(verifySignature("whsec-456", body + " ", sign("whsec-456", body))).toBe(false);
    expect(verifySignature(undefined, body, sign("whsec-456", body))).toBe(false);
    expect(verifySignature("whsec-456", body, null)).toBe(false);
  });
  it("validates messages and hands each one out once, in order", () => {
    expect("error" in validateMessage({ poId: "PO-1", kind: "order_received" })).toBe(true);
    expect("error" in validateMessage({ messageId: "M", poId: "PO-1", kind: "teleport" })).toBe(true);
    pushInbox("SUP-SW", { messageId: "M1", poId: "PO-1", kind: "order_received", reference: "R" });
    pushInbox("SUP-SW", { messageId: "M1", poId: "PO-1", kind: "order_received", reference: "R" });
    pushInbox("SUP-SW", { messageId: "M2", poId: "PO-1", kind: "line_status", lineId: "L1", statusText: "Processing" });
    const first = readInbox("SUP-SW");
    expect(first.messages.map((m) => m.messageId)).toEqual(["M1", "M2"]);
    expect(readInbox("SUP-SW", first.cursor).messages).toEqual([]);
    expect(readInbox("SUP-BM").messages).toEqual([]);
  });
});

describe("Store: live send", () => {
  it("preflight returns the exact payload, and refuses before contacting the server when a guard fails", () => {
    const { db, poId } = liveOrder();
    const office = db.users.find((u) => u.id === "U-OFFICE")!;
    const pre = liveSendPreflight(db, office, poId);
    expect("payload" in pre && pre.payload.poId).toBe(poId);
    const unconfirmed = run(db, "U-OFFICE", confirmDestination, poId, false).db;
    expect(liveSendPreflight(unconfirmed, office, poId)).toMatchObject({ field: "destination" });
    expect(liveSendPreflight(db, db.users.find((u) => u.id === "U-EST")!, poId)).toHaveProperty("error");
  });
  it("records the server's message ID as a live transmission", () => {
    const { db, poId } = liveOrder();
    const r = run(db, "U-OFFICE", submitOrder, poId, "electronic", {}, { ok: true, messageId: "SUP-MSG-9" });
    expect(r.result.ok).toBe(true);
    const po = r.db.purchaseOrders.find((p) => p.id === poId)!;
    expect(po).toMatchObject({ status: "sent", sendMethod: "electronic" });
    expect(po.transmission).toMatchObject({ sandbox: false, messageId: "SUP-MSG-9" });
  });
  it("a live connection can't be sent without the server's result, and a refusal leaves it unsent", () => {
    const { db, poId } = liveOrder();
    expect(run(db, "U-OFFICE", submitOrder, poId, "electronic", {}).result.ok).toBe(false);
    const r = run(db, "U-OFFICE", submitOrder, poId, "electronic", {}, { ok: false, error: "HTTP 500" });
    expect(r.result.ok).toBe(false);
    const po = r.db.purchaseOrders.find((p) => p.id === poId)!;
    expect(po.status).toBe("issued");
    expect(po.events.at(-1)!.text).toMatch(/failed: HTTP 500/);
  });
  it("supplier replies from the inbox move the order Sent → Acknowledged → Received → Fulfilled", () => {
    const { db: d0, poId } = liveOrder();
    let db = run(d0, "U-OFFICE", submitOrder, poId, "electronic", {}, { ok: true, messageId: "SUP-MSG-9" }).db;
    const apply = (msg: Parameters<typeof receiveSupplierMessage>[1]) => { db = produce(db, (d) => { receiveSupplierMessage(d as Database, msg); }); return db.purchaseOrders.find((p) => p.id === poId)!; };
    expect(apply({ messageId: "A", poId, kind: "order_received", reference: "CONF-1" }).status).toBe("acknowledged");
    const lineId = db.purchaseOrders.find((p) => p.id === poId)!.lines[0].id;
    expect(apply({ messageId: "B", poId, kind: "line_status", lineId, statusText: "Received" }).status).toBe("received");
    expect(apply({ messageId: "C", poId, kind: "line_status", lineId, statusText: "Processing" }).status).toBe("processing");
    expect(apply({ messageId: "D", poId, kind: "line_status", lineId, statusText: "Fulfilled" }).status).toBe("picked_up");
  });
});

describe("Test-step behaviour", () => {
  it("'Received' and 'Fulfilled' are recognised supplier statuses", () => {
    expect(interpretSupplierStatus("Received")).toBe("received");
    expect(interpretSupplierStatus("fulfilled")).toBe("picked_up");
  });
  it("Select Supplier/Store Name moves an unsent order to another configured supplier's store", () => {
    const { db, poId } = liveOrder();
    const r = run(db, "U-OFFICE", editIssuedOrder, poId, { supplierId: "SUP-BM", branchId: "BR-BM-1" });
    // BR-BM-1 has no store number in the seed, so it is refused until set up.
    expect(r.result.ok).toBe(false);
    const fixed = produce(db, (d) => { d.branches.find((b) => b.id === "BR-BM-1")!.storeNumber = "BM-9"; });
    const r2 = run(fixed, "U-OFFICE", editIssuedOrder, poId, { supplierId: "SUP-BM", branchId: "BR-BM-1" });
    expect(r2.result.ok).toBe(true);
    expect(r2.db.purchaseOrders.find((p) => p.id === poId)).toMatchObject({ supplierId: "SUP-BM", branchId: "BR-BM-1", destinationConfirmed: false });
    expect(run(fixed, "U-OFFICE", editIssuedOrder, poId, { supplierId: "SUP-BM", branchId: "BR-7132" }).result.ok).toBe(false);
  });
  it("a declined supplier substitute turns the line into a Problem for follow-up", () => {
    const { db: d0, poId } = liveOrder();
    let db = run(d0, "U-OFFICE", submitOrder, poId, "electronic", {}, { ok: true, messageId: "SUP-MSG-9" }).db;
    db = produce(db, (d) => { receiveSupplierMessage(d as Database, { messageId: "A", poId, kind: "order_received", reference: "C" }); });
    const lineId = db.purchaseOrders.find((p) => p.id === poId)!.lines[0].id;
    db = produce(db, (d) => {
      receiveSupplierMessage(d as Database, { messageId: "B", poId, kind: "line_status", lineId, statusText: "Substitute available", substitute: { product: "SuperPaint Exterior" } });
      const po = d.purchaseOrders.find((p) => p.id === poId)!;
      po.replacements = [{
        id: "RPL-1", lineId, original: "x", replacement: "SuperPaint Exterior", newCatalogId: "PRD-SUP-EXT", newPackSize: "gal", oldCostPerGal: 1, newCostPerGal: 1, pctChange: 0,
        orderTotalDelta: 0, decision: "owner", reason: "test", status: "pending_owner", requestedBy: "U-OFFICE", requestedAt: NOW,
      }];
    });
    const r = run(db, "U-OWNER", decideReplacement, poId, "RPL-1", false);
    expect(r.result.ok).toBe(true);
    const po = r.db.purchaseOrders.find((p) => p.id === poId)!;
    expect(po.lines[0].status).toBe("problem");
    expect(po.lines[0].substituteOffer).toBeUndefined();
    expect(po.status).toBe("problem");
  });
});
