/**
 * Feature 19 — Supplier Integration (manual ordering at launch).
 *
 * Each exported action receives an Immer draft of the database and the acting
 * user, validates first, then mutates. Nothing is sent or retried
 * automatically: every status change is a person recording what happened.
 *
 * Tables (spec "Tables To Use"): SUPPLIERS / BRANCHES = suppliers, branches;
 * PRODUCT_MAPPINGS = productMappings; ORDER_SUBMISSIONS / ORDER_EVIDENCE /
 * ORDER_STATUS_EVENTS = fields and events on PurchaseOrder; SUPPLIER_EXCEPTIONS
 * are derived from the acknowledgment clock (ackException) plus po.escalation.
 */
import type {
  Branch, Database, LineStatus, PackSize, POCall, POLine, PurchaseOrder, SupplierConnection, SupplierConnectionType, SupplierMessage, SupplierOrderPayload, User,
} from "@/features/types";
import { buildSupplierOrder, connectorFor } from "@/features/lib/integrations/supplier-connector";
import { can, whoCan } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { byId } from "@/features/lib/selectors";
import { dateLong, dateTime, money } from "@/features/lib/format";
import { PACK_GALLONS, packContainers } from "@/features/lib/rules/materials";
import { roundHalfUp, roundMoney } from "@/features/lib/rules/rounding";
import {
  ackException, aggregateStatus, branchGaps, deliveryChangeApprover, interpretSupplierStatus, isOpenOrder, packsCost, poValue, replacementDecision, ESCALATION_LABEL,
} from "@/features/lib/rules/procurement";
import { denied, fail, log, logSupplier, ok, userName } from "../helpers";
import { nextFreeId } from "./materials";

const MODULE = "Supplier Orders";
const SETUP = "Supplier Setup";

export const LINE_STATUS_LABEL: Record<LineStatus, string> = {
  open: "Open",
  sent: "Sent",
  acknowledged: "Acknowledged",
  received: "Received by supplier",
  processing: "Processing",
  substitute_available: "Substitute available",
  ready_for_pickup: "Ready for pickup",
  picked_up: "Fulfilled (picked up / delivered)",
  partially_filled: "Partially filled",
  problem: "Problem",
  cancelled: "Canceled",
};

const METHOD_LABEL = { print: "Print", email: "Email", phone: "Phone", electronic: "Electronic (API/EDI)" } as const;
export type SendMethod = keyof typeof METHOD_LABEL;

function orderAndBranch(db: Database, poId: string) {
  const po = byId(db.purchaseOrders, poId);
  const branch = po && byId(db.branches, po.branchId);
  return { po, branch };
}

/* ------------------------------------------------------------------ */
/* Supplier and branch setup (19.1)                                    */
/* ------------------------------------------------------------------ */

export interface BranchDraft {
  supplierId: string;
  name: string;
  storeNumber: string;
  accountNumber: string;
  phone: string;
  address?: string;
}

export function saveBranch(db: Database, actor: User, draft: BranchDraft, branchId?: string) {
  if (!can(actor, "supplier.setup")) return denied(db, actor, SETUP, "edit supplier branches", whoCan("supplier.setup"));
  if (!byId(db.suppliers, draft.supplierId)) return fail("Choose a supplier.", "supplierId");
  const existing = branchId ? byId(db.branches, branchId) : undefined;
  if (branchId && !existing) return fail("Branch not found.");
  const gaps = branchGaps(draft);
  if (gaps.length) return fail(`${gaps[0].label} is required before the branch can be saved.`, gaps[0].field);
  if (!/^[0-9()+\-.\s]{7,}$/.test(draft.phone.trim())) return fail("Enter a valid phone number.", "phone");
  const dupe = db.branches.find((b) => b.id !== branchId && b.supplierId === draft.supplierId && b.storeNumber.trim() === draft.storeNumber.trim());
  if (dupe) return fail(`Store ${draft.storeNumber} is already set up as ${dupe.name}.`, "storeNumber");
  const clean = { supplierId: draft.supplierId, name: draft.name.trim(), storeNumber: draft.storeNumber.trim(), accountNumber: draft.accountNumber.trim(), phone: draft.phone.trim(), address: draft.address?.trim() || undefined };
  const supplier = byId(db.suppliers, draft.supplierId)!;
  if (existing) {
    Object.assign(existing, clean);
    log(db, actor, SETUP, `Supplier: ${supplier.name} branch ${clean.name} (store ${clean.storeNumber}) updated by ${actor.name}`);
    return ok(existing.id);
  }
  const branch: Branch = { id: `BR-${clean.storeNumber.replace(/\W/g, "")}`, ...clean, active: true, createdAt: now(), createdBy: actor.id };
  if (byId(db.branches, branch.id)) branch.id = nextFreeId(db.branches, "BR-N");
  db.branches.push(branch);
  log(db, actor, SETUP, `Supplier: ${supplier.name} branch ${clean.name} (store ${clean.storeNumber}) created by ${actor.name}`);
  return ok(branch.id);
}

/** Open orders at a branch — deactivation is blocked while any exist. */
export function branchCommitments(db: Database, branchId: string) {
  return db.purchaseOrders.filter((p) => p.branchId === branchId && isOpenOrder(p));
}

export function setBranchActive(db: Database, actor: User, branchId: string, active: boolean) {
  if (!can(actor, "supplier.setup")) return denied(db, actor, SETUP, "deactivate a branch", whoCan("supplier.setup"));
  const branch = byId(db.branches, branchId);
  if (!branch) return fail("Branch not found.");
  if (!active) {
    const open = branchCommitments(db, branchId);
    if (open.length) return fail(`${branch.name} holds active commitments: ${open.map((p) => p.id).join(", ")}. Close or cancel them first.`);
  }
  branch.active = active;
  log(db, actor, SETUP, `Supplier: branch ${branch.name} (store ${branch.storeNumber || "—"}) ${active ? "reactivated" : "deactivated"} by ${actor.name}`);
  return ok();
}

/* ------------------------------------------------------------------ */
/* Supplier connection (19.1)                                          */
/* ------------------------------------------------------------------ */

export const CONNECTION_LABEL: Record<SupplierConnectionType, string> = { manual: "Manual (print / phone)", email: "Email", api_edi: "API / EDI" };

export interface ConnectionDraft {
  type: SupplierConnectionType;
  endpointLabel?: string;
  orderEmail?: string;
  /** API/EDI only. Live keys live in the server environment, never here. */
  mode?: "sandbox" | "live";
  /** Sandbox only, write-only. Blank keeps the credential already on file. */
  credential?: string;
}

/** Save how orders reach a supplier. The credential is never stored or shown, only that one is on file. */
export function saveSupplierConnection(db: Database, actor: User, supplierId: string, draft: ConnectionDraft) {
  if (!can(actor, "supplier.setup")) return denied(db, actor, SETUP, "change a supplier connection", whoCan("supplier.setup"));
  const supplier = byId(db.suppliers, supplierId);
  if (!supplier) return fail("Supplier not found.");
  const prev = supplier.connection;
  const t = now();
  const next: SupplierConnection = { type: draft.type, health: "not_configured", updatedAt: t, updatedBy: actor.id };
  if (draft.type === "email") {
    const email = draft.orderEmail?.trim() ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter the supplier's order inbox address.", "orderEmail");
    Object.assign(next, { orderEmail: email, health: "healthy" });
  }
  if (draft.type === "api_edi" && draft.mode === "live") {
    if (!draft.endpointLabel?.trim()) return fail("Name the connector, e.g. \"SW PRO ordering API\".", "endpointLabel");
    // Endpoint, key and webhook secret are server environment settings; run Test connection to check them.
    Object.assign(next, { endpointLabel: draft.endpointLabel.trim(), mode: "live", sandbox: false, health: "untested" });
  } else if (draft.type === "api_edi") {
    if (!draft.endpointLabel?.trim()) return fail("Name the connector, e.g. \"SW PRO ordering API\".", "endpointLabel");
    const newCredential = !!draft.credential?.trim();
    const onFile = newCredential || (prev?.type === "api_edi" && !!prev.credentialsOnFile);
    if (!onFile) return fail("Enter the API key or EDI credential. It is stored write-only and never shown again.", "credential");
    Object.assign(next, {
      endpointLabel: draft.endpointLabel.trim(), mode: "sandbox", sandbox: true, credentialsOnFile: true, health: "untested",
      credentialsUpdatedAt: newCredential ? t : prev?.credentialsUpdatedAt, credentialsUpdatedBy: newCredential ? actor.id : prev?.credentialsUpdatedBy,
    });
  }
  supplier.connection = next;
  const cred = draft.type === "api_edi" && draft.credential?.trim() ? " Credential replaced (not recorded)." : "";
  log(db, actor, SETUP, `Supplier: ${supplier.name} connection set to ${CONNECTION_LABEL[draft.type]}${next.endpointLabel ? ` (${next.endpointLabel}, ${next.mode === "live" ? "live" : "sandbox"})` : ""}${next.orderEmail ? ` (${next.orderEmail})` : ""} by ${actor.name}.${cred}`);
  return ok();
}

/** Check an API/EDI connection through its connector and record the health. */
export function testSupplierConnection(db: Database, actor: User, supplierId: string) {
  if (!can(actor, "supplier.setup")) return denied(db, actor, SETUP, "test a supplier connection", whoCan("supplier.setup"));
  const supplier = byId(db.suppliers, supplierId);
  const conn = supplier?.connection;
  if (!supplier || !conn) return fail("Supplier has no connection to test.");
  if (conn.mode === "live") return fail("A live connection is checked by the server. Use Test connection on the Suppliers screen.");
  const connector = connectorFor(conn);
  if (!connector) return fail("Only API/EDI connections are tested.");
  const res = connector.check(conn);
  conn.health = res.ok ? "healthy" : "failing";
  conn.lastCheckedAt = now();
  conn.lastError = res.error;
  log(db, actor, SETUP, `Supplier: ${supplier.name} connection test ${res.ok ? "passed" : `failed (${res.error})`}${connector.sandbox ? " [sandbox]" : ""}, run by ${actor.name}`);
  return res.ok ? ok() : fail(`Connection test failed: ${res.error}`);
}

/** Record the server's answer for a live connection check. No secret is ever part of it. */
export function recordLiveCheck(db: Database, actor: User, supplierId: string, status: { live: boolean; endpointHost?: string; credentialSet: boolean; webhookSecretSet: boolean; error?: string }) {
  if (!can(actor, "supplier.setup")) return denied(db, actor, SETUP, "test a supplier connection", whoCan("supplier.setup"));
  const supplier = byId(db.suppliers, supplierId);
  const conn = supplier?.connection;
  if (!supplier || conn?.mode !== "live") return fail("This supplier has no live connection.");
  conn.health = status.live ? "healthy" : "failing";
  conn.endpointHost = status.endpointHost;
  conn.credentialsOnFile = status.credentialSet;
  conn.lastCheckedAt = now();
  conn.lastError = status.live ? (status.webhookSecretSet ? undefined : "No webhook secret on the server — status replies can't be verified.") : status.error;
  log(db, actor, SETUP, `Supplier: ${supplier.name} live connection test ${status.live ? `passed (${status.endpointHost})` : `failed (${status.error})`}, run by ${actor.name}`);
  return status.live ? ok() : fail(`Connection test failed: ${status.error}`);
}

/* ------------------------------------------------------------------ */
/* Product mapping and pack availability (19.2, 18.2)                  */
/* ------------------------------------------------------------------ */

export interface MappingDraft {
  supplierId: string;
  branchId?: string;
  catalogId: string;
  packSize: PackSize;
  itemCode: string;
  colourNumber?: string;
  tintFormula?: string;
}

const UNIT: Record<PackSize, "quart" | "gallon" | "5-gallon pail"> = { qt: "quart", gal: "gallon", "5gal": "5-gallon pail" };

export function saveMapping(db: Database, actor: User, draft: MappingDraft, mappingId?: string) {
  if (!can(actor, "supplier.setup")) return denied(db, actor, SETUP, "edit product mappings", whoCan("supplier.setup"));
  const cat = byId(db.catalog, draft.catalogId);
  if (!cat) return fail("Choose a product.", "catalogId");
  if (!draft.itemCode.trim()) return fail("Store item code is required.", "itemCode");
  if (!/^[A-Za-z0-9-]{4,20}$/.test(draft.itemCode.trim())) return fail("Item codes are 4–20 letters, digits or dashes.", "itemCode");
  db.productMappings ??= [];
  const clash = db.productMappings.find((m) => m.id !== mappingId && m.catalogId === draft.catalogId && m.packSize === draft.packSize && (m.branchId ?? "") === (draft.branchId ?? ""));
  if (clash) return fail(`This product and pack size already maps to ${clash.itemCode}${draft.branchId ? " at this branch" : ""}. One code per branch.`, "packSize");
  const supplier = byId(db.suppliers, draft.supplierId);
  const values = {
    supplierId: draft.supplierId, branchId: draft.branchId || undefined, catalogId: draft.catalogId, packSize: draft.packSize, unit: UNIT[draft.packSize],
    itemCode: draft.itemCode.trim().toUpperCase(), colourNumber: draft.colourNumber?.trim() || undefined, tintFormula: draft.tintFormula?.trim() || undefined, updatedAt: now(), updatedBy: actor.id,
  };
  if (mappingId) {
    const m = byId(db.productMappings, mappingId);
    if (!m) return fail("Mapping not found.");
    Object.assign(m, values);
  } else db.productMappings.push({ id: nextFreeId(db.productMappings, "MAP-"), ...values });
  log(db, actor, SETUP, `Supplier: ${supplier?.name ?? "—"} – Product ${cat.product} mapped to item code ${values.itemCode}, pack ${values.unit} by ${actor.name}`);
  return ok();
}

export function deleteMapping(db: Database, actor: User, mappingId: string) {
  if (!can(actor, "supplier.setup")) return denied(db, actor, SETUP, "delete a product mapping", whoCan("supplier.setup"));
  const m = byId(db.productMappings ?? [], mappingId);
  if (!m) return fail("Mapping not found.");
  const cat = byId(db.catalog, m.catalogId);
  const using = db.purchaseOrders.filter((p) => isOpenOrder(p) && (!m.branchId || p.branchId === m.branchId) && p.lines.some((l) => l.product === cat?.product && l.packs.some((pk) => pk.size === m.packSize)));
  if (using.length) return fail(`Item code ${m.itemCode} is used by open order ${using.map((p) => p.id).join(", ")}. It can't be deleted until those close.`);
  db.productMappings = (db.productMappings ?? []).filter((x) => x.id !== mappingId);
  log(db, actor, SETUP, `Supplier: mapping ${m.itemCode} (${cat?.product ?? "—"}, ${m.unit}) deleted by ${actor.name}`);
  return ok();
}

export function setPackAvailability(db: Database, actor: User, catalogId: string, size: PackSize, available: boolean) {
  if (!can(actor, "catalog.edit")) return denied(db, actor, SETUP, "change pack availability", whoCan("catalog.edit"));
  const cat = byId(db.catalog, catalogId);
  if (!cat) return fail("Product not found.");
  cat.available = available ? Array.from(new Set([...cat.available, size])) : cat.available.filter((s) => s !== size);
  log(db, actor, SETUP, `Supplier: ${cat.product} ${UNIT[size]} marked ${available ? "available" : "unavailable"} by ${actor.name}`);
  return ok();
}

/* ------------------------------------------------------------------ */
/* Submission and evidence (19.3)                                      */
/* ------------------------------------------------------------------ */

export function confirmDestination(db: Database, actor: User, poId: string, confirmed: boolean) {
  if (!can(actor, "supplier.submit")) return denied(db, actor, MODULE, "confirm an order destination", whoCan("supplier.submit"));
  const { po, branch } = orderAndBranch(db, poId);
  if (!po || !branch) return fail("Order not found.");
  if (po.sentAt && !po.uncertainSend) return fail("This order has already been sent.");
  po.destinationConfirmed = confirmed;
  po.destinationConfirmedAt = confirmed ? now() : undefined;
  po.destinationConfirmedBy = confirmed ? actor.id : undefined;
  if (confirmed) po.events.push({ at: now(), by: actor.id, text: `Destination confirmed: ${branch.name} (store ${branch.storeNumber}), ${po.fulfilment === "delivery" ? "delivery to site" : "pickup at branch"}.` });
  return ok();
}

/**
 * Before sending only: choose another supplier and store ("Select Supplier/Store
 * Name") and/or reduce line quantities. Item codes are looked up for the new
 * store at send time. Increases go through a new order, so the limit check
 * that approved this one still holds. A store change clears the destination
 * confirmation.
 */
export function editIssuedOrder(db: Database, actor: User, poId: string, input: { supplierId?: string; branchId?: string; gallons?: Record<string, number> }) {
  if (!can(actor, "po.generate")) return denied(db, actor, MODULE, "edit a generated order", whoCan("po.generate"));
  const { po, branch } = orderAndBranch(db, poId);
  if (!po || !branch) return fail("Order not found.");
  if (po.status !== "issued" || po.sentAt) return fail("Only an order that hasn't been sent can be edited. Use cancellation or replacement after sending.");
  const changes: string[] = [];
  const nextBranch = input.branchId && input.branchId !== po.branchId ? byId(db.branches, input.branchId) : undefined;
  if (input.branchId && input.branchId !== po.branchId) {
    const supplierId = input.supplierId ?? po.supplierId;
    if (!byId(db.suppliers, supplierId)) return fail("Choose a supplier.", "supplier");
    if (!nextBranch || nextBranch.supplierId !== supplierId) return fail("Choose a store of the selected supplier.", "branch");
    if (nextBranch.active === false) return fail(`${nextBranch.name} is deactivated.`, "branch");
    const gaps = branchGaps(nextBranch);
    if (gaps.length) return fail(`${nextBranch.name} setup is incomplete (missing ${gaps.map((g) => g.label.toLowerCase()).join(", ")}).`, "branch");
  }
  // Validate every quantity before changing anything.
  const repacked: { line: POLine; packs: ReturnType<typeof packContainers>; cost: number }[] = [];
  for (const [lineId, gal] of Object.entries(input.gallons ?? {})) {
    const line = po.lines.find((l) => l.id === lineId);
    if (!line) return fail(`Line ${lineId} is not on ${po.id}.`);
    if (gal === line.gallons) continue;
    if (!(gal > 0)) return fail(`${lineId}: enter a quantity above zero. To drop the line, cancel it.`, `qty-${lineId}`);
    if (gal > line.gallons + 1e-9) return fail(`${lineId}: quantities can only go down before sending (was ${line.gallons} gal). Order more on a new order.`, `qty-${lineId}`);
    const cat = db.catalog.find((c) => c.product === line.product);
    if (!cat) return fail(`${line.product} is not in the product library.`);
    const packs = packContainers(gal, cat.available, { strategy: db.procurementSettings?.packingStrategy, cost: cat.cost });
    if (packs.totalGal > line.gallons + 1e-9) return fail(`${lineId}: ${gal} gal packs up to ${packs.totalGal} gal, more than the ${line.gallons} gal ordered.`, `qty-${lineId}`);
    repacked.push({ line, packs, cost: packsCost(packs.packs, cat.cost) });
  }
  if (!nextBranch && repacked.length === 0) return fail("Nothing has changed.");
  const t = now();
  if (nextBranch) {
    const from = byId(db.suppliers, po.supplierId);
    const to = byId(db.suppliers, nextBranch.supplierId)!;
    if (to.id !== po.supplierId) changes.push(`supplier ${from?.name ?? po.supplierId} → ${to.name}`);
    changes.push(`store ${branch.name} (store ${branch.storeNumber}) → ${nextBranch.name} (store ${nextBranch.storeNumber})`);
    po.supplierId = nextBranch.supplierId;
    po.branchId = nextBranch.id;
    po.destinationConfirmed = false;
    po.destinationConfirmedAt = undefined;
    po.destinationConfirmedBy = undefined;
  }
  for (const { line, packs, cost } of repacked) {
    changes.push(`${line.id} ${line.gallons} → ${packs.totalGal} gal`);
    line.packs = packs.packs;
    line.gallons = packs.totalGal;
    line.unitCostPerGal = packs.totalGal > 0 ? cost / packs.totalGal : 0;
  }
  po.events.push({ at: t, by: actor.id, text: `Edited before sending: ${changes.join("; ")}.${nextBranch ? " Destination must be confirmed again." : ""}` });
  log(db, actor, MODULE, `Order ${po.id} edited before sending by ${actor.name}: ${changes.join("; ")}. New total ${money(poValue(po))}`);
  return ok();
}

export interface Evidence {
  sentMessage?: string;
  deliveryReceipt?: string;
  employee?: string;
  callTime?: string;
  handedBy?: string;
  handedAt?: string;
}

function evidenceCheck(method: "print" | "email" | "phone", e: Evidence): { error?: string; field?: string; text?: string; at?: string } {
  if (method === "email") {
    if (!e.sentMessage?.trim()) return { error: "Email orders need the stored sent message before they can be marked Sent.", field: "sentMessage" };
    if (!e.deliveryReceipt?.trim()) return { error: "Email orders need a delivery receipt before they can be marked Sent. A read receipt is not required, but a delivery receipt is.", field: "deliveryReceipt" };
    return { text: `Sent message ${e.sentMessage.trim()} stored; delivery receipt ${e.deliveryReceipt.trim()}` };
  }
  if (method === "phone") {
    if (!e.employee?.trim()) return { error: "Phone orders need the name of the branch employee you spoke with.", field: "employee" };
    if (!e.callTime) return { error: "Phone orders need the call time.", field: "callTime" };
    return { text: `Called branch, spoke with ${e.employee.trim()} at ${dateTime(e.callTime)}`, at: e.callTime };
  }
  if (!e.handedBy?.trim()) return { error: "Printed orders need the person who handed it over.", field: "handedBy" };
  if (!e.handedAt) return { error: "Printed orders need the hand-off date.", field: "handedAt" };
  return { text: `Printed order handed to branch by ${e.handedBy.trim()} on ${dateLong(e.handedAt)}`, at: e.handedAt };
}

/** Transmit over the supplier's API/EDI connector. Evidence is the connector's message ID. */
/**
 * Checks shared by the sandbox and live paths. Pure: the live UI calls it to
 * get the payload before posting to the server, and the send re-runs it.
 */
export function electronicPreflight(db: Database, po: PurchaseOrder): { payload: SupplierOrderPayload; conn: SupplierConnection } | { error: string; field?: string } {
  const supplier = byId(db.suppliers, po.supplierId);
  const conn = supplier?.connection;
  if (!supplier || conn?.type !== "api_edi") return { error: `${supplier?.name ?? "This supplier"} has no API/EDI connection. Send by email, phone or print.`, field: "method" };
  if (conn.health !== "healthy") return { error: `The ${conn.endpointLabel} connection is ${conn.health === "failing" ? "failing" : "not tested"}. Test it under Suppliers, or send manually.`, field: "method" };
  const built = buildSupplierOrder(db, po);
  if ("error" in built) return { error: built.error, field: "method" };
  return { payload: built.payload, conn };
}

/** Result of the server's live transmission, handed back into the store. */
export interface LiveSendResult { ok: boolean; messageId?: string; error?: string }

function transmitElectronic(db: Database, actor: User, po: PurchaseOrder, live?: LiveSendResult): { error?: string; field?: string; text?: string } {
  const pre = electronicPreflight(db, po);
  if ("error" in pre) return pre;
  const { conn } = pre;
  const built = { payload: pre.payload };
  const connector = connectorFor(conn);
  if (conn.mode === "live" && !live) return { error: "This supplier is on a live connection. Send the order through the live connector.", field: "method" };
  const res = conn.mode === "live" ? live! : connector!.transmit(conn, built.payload);
  const sandbox = conn.mode !== "live";
  const tag = sandbox ? " [sandbox]" : ` [live${conn.endpointHost ? `, ${conn.endpointHost}` : ""}]`;
  if (!res.ok) {
    // Never retried automatically: the order stays Issued for a person to decide.
    po.events.push({ at: now(), by: actor.id, text: `Electronic send via ${conn.endpointLabel}${tag} failed: ${res.error}. Nothing was retried.` });
    log(db, actor, MODULE, `Order ${po.id} electronic send via ${conn.endpointLabel}${tag} failed: ${res.error}. Sent by ${actor.name}; not retried.`);
    return { error: `Supplier connection refused the order: ${res.error}`, field: "method" };
  }
  po.transmission = { connector: conn.endpointLabel!, sandbox, messageId: res.messageId!, at: now(), payload: built.payload };
  return { text: `Transmitted via ${conn.endpointLabel}${tag}, message ${res.messageId}, ${built.payload.lines.length} line${built.payload.lines.length === 1 ? "" : "s"}` };
}

/** Guards every send shares. Pure, so the live UI can run them before contacting the server. */
function sendGuards(db: Database, actor: User, poId: string): { error: string; field?: string } | undefined {
  if (!can(actor, "supplier.submit")) return { error: "Only the business owner and office manager submit orders to a supplier." };
  const { po, branch } = orderAndBranch(db, poId);
  if (!po || !branch) return { error: "Order not found." };
  if (po.status !== "issued") return { error: po.uncertainSend ? "This order's receipt is uncertain. Use Resend after recording a branch call." : "This order has already been submitted. Resending needs a recorded branch call first." };
  if (branchGaps(branch).length || branch.active === false) return { error: `${branch.name} setup is incomplete. Complete setup before sending.` };
  if (!po.destinationConfirmed) return { error: "Confirm the branch and destination first. It is a deliberate step, not a default.", field: "destination" };
  return undefined;
}

/**
 * Everything checked before a live send: the send guards and the electronic
 * checks. Returns the exact payload the server should transmit.
 */
export function liveSendPreflight(db: Database, actor: User, poId: string): { payload: SupplierOrderPayload } | { error: string; field?: string } {
  const g = sendGuards(db, actor, poId);
  if (g) return g;
  const pre = electronicPreflight(db, byId(db.purchaseOrders, poId)!);
  if ("error" in pre) return pre;
  if (pre.conn.mode !== "live") return { error: "This supplier uses the sandbox connector.", field: "method" };
  return { payload: pre.payload };
}

export function submitOrder(db: Database, actor: User, poId: string, method: SendMethod, evidence: Evidence, live?: LiveSendResult) {
  if (!can(actor, "supplier.submit")) return denied(db, actor, MODULE, "submit an order to a supplier", whoCan("supplier.submit"));
  const guard = sendGuards(db, actor, poId);
  if (guard) return fail(guard.error, guard.field);
  const { po, branch } = orderAndBranch(db, poId) as { po: PurchaseOrder; branch: Branch };
  const ev = method === "electronic" ? transmitElectronic(db, actor, po, live) : evidenceCheck(method, evidence);
  if (ev.error) return fail(ev.error, ev.field);
  const t = now();
  po.status = "sent";
  po.sendMethod = method;
  po.sentAt = t;
  po.sentBy = actor.id;
  po.sentEvidence = ev.text;
  po.lines.forEach((l) => l.status !== "cancelled" && (l.status = "sent"));
  po.events.push({ at: t, by: actor.id, text: `Sent by ${METHOD_LABEL[method].toLowerCase()} to branch ${branch.storeNumber}. ${ev.text}.` });
  log(db, actor, MODULE, `Order ${po.id} sent to ${branch.name} via ${METHOD_LABEL[method]} by ${actor.name} at ${dateTime(t)}. Evidence: ${ev.text}`);
  return ok();
}

export function acknowledgeOrder(
  db: Database,
  actor: User,
  poId: string,
  input: { method: "confirmation_number" | "supplier_reply" | "call" | "read_receipt"; reference?: string; employee?: string; time?: string },
) {
  if (!can(actor, "supplier.submit")) return denied(db, actor, MODULE, "record a supplier acknowledgment", whoCan("supplier.submit"));
  const { po } = orderAndBranch(db, poId);
  if (!po) return fail("Order not found.");
  if (po.status !== "sent") return fail(po.ackAt ? "Already acknowledged." : "Send the order before recording an acknowledgment.");
  if (input.method === "read_receipt") {
    return fail("A read receipt is not an acknowledgment. Record a supplier reply, an order confirmation number, or a call with a named branch employee and time.", "method");
  }
  if ((input.method === "confirmation_number" || input.method === "supplier_reply") && !input.reference?.trim()) {
    return fail(input.method === "confirmation_number" ? "Enter the order confirmation number." : "Paste or reference the supplier's reply.", "reference");
  }
  if (input.method === "call" && (!input.employee?.trim() || !input.time)) return fail("A call acknowledgment needs the branch employee's name and the call time.", input.employee?.trim() ? "time" : "employee");
  const t = input.method === "call" ? input.time! : now();
  po.ackAt = t;
  po.ackMethod = input.method;
  po.ackRef = input.method === "call" ? `Call with ${input.employee!.trim()}` : input.reference!.trim();
  po.ackBy = input.employee?.trim() || undefined;
  po.status = "acknowledged";
  po.escalation = undefined;
  po.lines.forEach((l) => l.status === "sent" && (l.status = "acknowledged"));
  po.events.push({ at: now(), by: actor.id, text: `Acknowledged. ${input.method === "call" ? `Confirmed by phone with ${input.employee!.trim()}.` : `Confirmation: ${po.ackRef}.`}` });
  log(db, actor, MODULE, `Order ${po.id} acknowledged by ${input.employee?.trim() || "branch"} at ${dateTime(t)}. Confirmation: ${po.ackRef}`);
  return ok();
}

export function markUncertain(db: Database, actor: User, poId: string, note: string) {
  if (!can(actor, "supplier.submit")) return denied(db, actor, MODULE, "mark a send uncertain", whoCan("supplier.submit"));
  const { po } = orderAndBranch(db, poId);
  if (!po) return fail("Order not found.");
  if (po.status !== "sent") return fail("Only a sent, unacknowledged order can be marked uncertain.");
  if (!note.trim()) return fail("Say why receipt is uncertain.", "note");
  po.uncertainSend = true;
  po.uncertainHistory = true;
  po.uncertainAt = now();
  po.events.push({ at: now(), by: actor.id, text: `Receipt marked uncertain: ${note.trim()}` });
  log(db, actor, MODULE, `Order ${po.id} marked receipt uncertain by ${actor.name}. ${note.trim()}`);
  return ok();
}

const OUTCOME_LABEL: Record<POCall["outcome"], string> = {
  confirmed_received: "Branch confirmed they have the order",
  not_received: "Branch did not receive the order",
  no_answer: "No answer",
  cannot_fill: "Branch cannot fill",
  other: "Other",
};
export { OUTCOME_LABEL as CALL_OUTCOME_LABEL };

export function recordCall(db: Database, actor: User, poId: string, input: { employee: string; time: string; outcome: POCall["outcome"]; note?: string }) {
  if (!can(actor, "supplier.submit")) return denied(db, actor, MODULE, "record a branch call", whoCan("supplier.submit"));
  const { po } = orderAndBranch(db, poId);
  if (!po) return fail("Order not found.");
  if (input.outcome !== "no_answer" && !input.employee.trim()) return fail("Name the branch employee you spoke with.", "employee");
  if (!input.time) return fail("Call time is required.", "time");
  const call: POCall = { at: input.time, employee: input.employee.trim() || "—", outcome: input.outcome, note: input.note?.trim() || undefined, by: actor.id };
  po.calls = [...(po.calls ?? []), call];
  if (input.outcome !== "no_answer") po.branchCallConfirmedAt = now();
  po.events.push({ at: now(), by: actor.id, text: `Branch call with ${call.employee}: ${OUTCOME_LABEL[input.outcome]}.${call.note ? " " + call.note : ""}` });
  log(db, actor, MODULE, `Order ${po.id} – Branch call recorded with ${call.employee} at ${dateTime(input.time)} by ${actor.name}. Outcome: ${OUTCOME_LABEL[input.outcome]}`);
  return ok();
}

/** Resend after an uncertain send. Needs a recorded confirmation call first. */
export function resendOrder(db: Database, actor: User, poId: string, method: "print" | "email" | "phone", evidence: Evidence) {
  if (!can(actor, "supplier.submit")) return denied(db, actor, MODULE, "resend an order", whoCan("supplier.submit"));
  const { po, branch } = orderAndBranch(db, poId);
  if (!po || !branch) return fail("Order not found.");
  if (!po.uncertainSend) return fail("Only an order marked uncertain can be resent. The system never retries automatically.");
  const call = (po.calls ?? []).find((c) => c.outcome !== "no_answer" && po.uncertainAt && c.at >= po.uncertainAt.slice(0, 16));
  if (!call && !(po.branchCallConfirmedAt && po.uncertainAt && po.branchCallConfirmedAt >= po.uncertainAt)) {
    return fail("Receipt uncertain — phone the branch and record confirmation before resending.");
  }
  if (!po.destinationConfirmed) return fail("Confirm the branch and destination first.", "destination");
  const ev = evidenceCheck(method, evidence);
  if (ev.error) return fail(ev.error, ev.field);
  const t = now();
  po.uncertainSend = false;
  po.resentAt = t;
  po.resendCount = (po.resendCount ?? 0) + 1;
  po.sendMethod = method;
  po.sentEvidence = `${po.sentEvidence ?? ""} | Resend ${po.resendCount}: ${ev.text}`;
  po.events.push({ at: t, by: actor.id, text: `Resent by ${METHOD_LABEL[method].toLowerCase()} after confirmation call. Original reference ${po.id} kept. ${ev.text}.` });
  log(db, actor, MODULE, `Order ${po.id} resent after confirmation call by ${actor.name}. Original reference preserved: ${po.id}`);
  return ok();
}

export function escalateException(db: Database, actor: User, poId: string) {
  if (!can(actor, "supplier.submit")) return denied(db, actor, MODULE, "escalate an exception", whoCan("supplier.submit"));
  const { po } = orderAndBranch(db, poId);
  if (!po) return fail("Order not found.");
  const ex = ackException(po, db.users, now());
  if (!ex || !ex.overdue) return fail("This order is not overdue for acknowledgment.");
  if (!ex.next) return fail("Already escalated to the business owner.");
  po.escalation = ex.next;
  po.escalatedAt = now();
  log(db, actor, MODULE, `Order ${po.id} flagged for branch call after four working hours. Owner: ${userName(db, po.sentBy)}. Escalated to: ${ESCALATION_LABEL[ex.next]}`);
  return ok();
}

/* ------------------------------------------------------------------ */
/* Per-line status (19.4)                                              */
/* ------------------------------------------------------------------ */

export const FULFIL: LineStatus[] = ["received", "processing", "substitute_available", "ready_for_pickup", "picked_up", "partially_filled", "problem"];

type StatusSource = { kind: "user"; actor: User } | { kind: "supplier"; supplierId: string; name: string; sandbox: boolean };

/**
 * Shared by staff updates and supplier messages: validate, apply, record.
 * Text that matches no known status is kept verbatim and no status is inferred.
 */
function applyLineStatus(db: Database, po: PurchaseOrder, line: POLine, input: { status?: LineStatus; supplierText?: string; substitute?: { product: string; packSize?: PackSize } }, src: StatusSource) {
  if (!po.ackAt) return fail("A send is not an acknowledgment. Record the acknowledgment before fulfilment statuses.");
  const raw = input.supplierText?.trim();
  const mapped = raw ? interpretSupplierStatus(raw) : null;
  const next = input.status ?? mapped ?? undefined;
  if (!next && !raw) return fail("Choose a status or enter the supplier's status text.", "status");
  if (next && !FULFIL.includes(next)) return fail("Choose Received, Processing, Substitute available, Ready for pickup, Picked up / Delivered, Partially filled or Problem.", "status");
  if (next === "problem" && !raw) return fail("Record the supplier's issue text for a Problem status.", "supplierText");
  const offered = input.substitute?.product.trim() || (next === "substitute_available" ? raw : undefined);
  if (next === "substitute_available" && !offered) return fail("Record what the supplier is offering instead.", "supplierText");
  const old = line.status;
  if (next) line.status = next;
  if (raw) line.supplierStatusText = raw;
  if (next === "substitute_available") {
    const cat = db.catalog.find((c) => c.product.toLowerCase() === offered!.toLowerCase());
    line.substituteOffer = { product: offered!, catalogId: cat?.id, packSize: input.substitute?.packSize, at: now() };
  }
  po.status = aggregateStatus(po);
  const who = src.kind === "user" ? src.actor.name : `${src.name} (supplier connection${src.sandbox ? ", sandbox" : ""})`;
  const change = next ? `${LINE_STATUS_LABEL[old]} → ${LINE_STATUS_LABEL[next]}` : "status unchanged";
  po.events.push({
    at: now(), by: src.kind === "user" ? src.actor.id : src.supplierId, source: src.kind === "supplier" ? "supplier" : undefined,
    text: `Line ${line.id}: ${change}${raw ? `. Supplier text retained: "${raw}"` : ""}${raw && !mapped && !input.status ? " (unfamiliar — needs review)" : ""}${next === "substitute_available" ? `. Offered: ${offered} — review through Replace product / pack` : ""}.`,
  });
  const message = `Order ${po.id} line ${line.id} status changed from ${LINE_STATUS_LABEL[old]} to ${next ? LINE_STATUS_LABEL[next] : LINE_STATUS_LABEL[old]} by ${who}. Supplier text retained: "${raw ?? ""}"`;
  if (src.kind === "user") log(db, src.actor, MODULE, message);
  else logSupplier(db, src.supplierId, MODULE, message);
  return ok();
}

/**
 * Set a line's status and/or record the supplier's own wording.
 * No expense is created here (financial reconciliation is feature 33).
 */
export function setLineStatus(db: Database, actor: User, poId: string, lineId: string, input: { status?: LineStatus; supplierText?: string }) {
  if (!can(actor, "po.receive")) return denied(db, actor, MODULE, "update a line status", whoCan("po.receive"));
  const { po } = orderAndBranch(db, poId);
  const line = po?.lines.find((l) => l.id === lineId);
  if (!po || !line) return fail("Order line not found.");
  return applyLineStatus(db, po, line, input, { kind: "user", actor });
}

/**
 * Inbound handler for a supplier connection (the webhook / EDI 855-856 side).
 * No staff member is the actor: every event and log line names the supplier.
 * A message ID already applied is ignored, so a supplier retry changes nothing.
 */
export function receiveSupplierMessage(db: Database, msg: SupplierMessage) {
  const po = byId(db.purchaseOrders, msg.poId);
  if (!po) return fail("Order not found.");
  const supplier = byId(db.suppliers, po.supplierId);
  if (!supplier) return fail("Supplier not found.");
  if (!po.transmission) return fail("This order was not sent electronically, so the supplier connection can't update it.");
  if (po.supplierMessageIds?.includes(msg.messageId)) return ok("duplicate");
  const src = { kind: "supplier" as const, supplierId: supplier.id, name: supplier.name, sandbox: po.transmission.sandbox };
  const tag = src.sandbox ? " [sandbox]" : "";
  if (msg.kind === "order_received") {
    if (po.ackAt) return fail("Already acknowledged.");
    if (!msg.reference.trim()) return fail("Supplier acknowledgment has no reference.");
    const t = now();
    po.ackAt = t;
    po.ackMethod = "electronic";
    po.ackRef = msg.reference.trim();
    po.status = "acknowledged";
    po.escalation = undefined;
    po.lines.forEach((l) => l.status === "sent" && (l.status = "acknowledged"));
    po.events.push({ at: t, by: supplier.id, source: "supplier", text: `Received by supplier${tag}. Confirmation: ${po.ackRef}.` });
    logSupplier(db, supplier.id, MODULE, `Order ${po.id} acknowledged by ${supplier.name} supplier connection${tag} at ${dateTime(t)}. Confirmation: ${po.ackRef}`);
  } else {
    const line = po.lines.find((l) => l.id === msg.lineId);
    if (!line) return fail(`Line ${msg.lineId} is not on ${po.id}.`);
    const res = applyLineStatus(db, po, line, { supplierText: msg.statusText, substitute: msg.substitute, status: msg.substitute ? "substitute_available" : undefined }, src);
    if (!res.ok) return res;
  }
  po.supplierMessageIds = [...(po.supplierMessageIds ?? []), msg.messageId];
  return ok("applied");
}

/**
 * Sandbox helper: stand in for the supplier and push a message through the
 * real inbound handler. The person who pressed it is noted in the event.
 */
/** A supplier message without its ID (distributes over the message kinds). */
export type SupplierMessageInput = SupplierMessage extends infer M ? (M extends unknown ? Omit<M, "messageId"> : never) : never;

export function simulateSupplierMessage(db: Database, actor: User, msg: SupplierMessageInput) {
  if (!can(actor, "supplier.submit")) return denied(db, actor, MODULE, "simulate a supplier message", whoCan("supplier.submit"));
  const po = byId(db.purchaseOrders, msg.poId);
  if (!po?.transmission?.sandbox) return fail("Supplier messages can only be simulated for orders sent through the sandbox connector.");
  const messageId = `${po.transmission.messageId}-R${(po.supplierMessageIds?.length ?? 0) + 1}`;
  const res = receiveSupplierMessage(db, { ...msg, messageId } as SupplierMessage);
  if (res.ok) po.events.push({ at: now(), by: actor.id, text: `Sandbox: supplier message ${messageId} simulated by ${actor.name}.` });
  return res;
}

/* ------------------------------------------------------------------ */
/* Cancellation (Rule 2)                                               */
/* ------------------------------------------------------------------ */

export function requestCancellation(db: Database, actor: User, poId: string, lineId: string, qty: number) {
  if (!can(actor, "supplier.submit")) return denied(db, actor, MODULE, "request a cancellation", whoCan("supplier.submit"));
  const { po } = orderAndBranch(db, poId);
  const line = po?.lines.find((l) => l.id === lineId);
  if (!po || !line) return fail("Order line not found.");
  const open = line.gallons - line.receivedGal - line.cancelledGal;
  if (!(qty > 0) || qty > open + 1e-9) return fail(`Enter up to ${open.toFixed(2)} gal (ordered, not received, not canceled).`, "qty");
  po.cancellations = [...(po.cancellations ?? []), { id: nextFreeId(po.cancellations ?? [], "CX-"), lineId, qtyGal: qty, requestedBy: actor.id, requestedAt: now(), kind: "cancel_request" }];
  po.events.push({ at: now(), by: actor.id, text: `Cancellation of ${qty} gal on line ${lineId} requested. Nothing changes until the branch confirms.` });
  log(db, actor, MODULE, `Order ${po.id} line ${lineId} cancellation of ${qty} gal requested by ${actor.name} (not confirmed — no quantity released)`);
  return ok();
}

/** Office manager: branch-confirmed cancellation or inability to fill. The only way a commitment is released. */
export function confirmCancellation(db: Database, actor: User, poId: string, lineId: string, input: { qty: number; employee: string; kind: "cancel_request" | "cannot_fill"; requestId?: string }) {
  if (!["office_manager", "owner"].includes(actor.role)) return denied(db, actor, MODULE, "confirm a cancellation", "the Office Manager");
  const { po, branch } = orderAndBranch(db, poId);
  const line = po?.lines.find((l) => l.id === lineId);
  if (!po || !line || !branch) return fail("Order line not found.");
  const open = line.gallons - line.receivedGal - line.cancelledGal;
  if (!(input.qty > 0) || input.qty > open + 1e-9) return fail(`Enter up to ${open.toFixed(2)} gal.`, "qty");
  if (!input.employee.trim()) return fail("Name the branch employee who confirmed it. Branch confirmation evidence is required.", "employee");
  const t = now();
  const req = input.requestId ? (po.cancellations ?? []).find((c) => c.id === input.requestId) : undefined;
  if (req) {
    req.confirmedAt = t;
    req.branchEmployee = input.employee.trim();
  } else {
    po.cancellations = [...(po.cancellations ?? []), { id: nextFreeId(po.cancellations ?? [], "CX-"), lineId, qtyGal: input.qty, requestedBy: actor.id, requestedAt: t, confirmedAt: t, branchEmployee: input.employee.trim(), kind: input.kind }];
  }
  line.cancelledGal = roundHalfUp(line.cancelledGal + input.qty, 3);
  if (line.cancelledGal + line.receivedGal + 1e-9 >= line.gallons && line.receivedGal === 0) line.status = "cancelled";
  po.status = po.lines.every((l) => l.status === "cancelled") ? "cancelled" : aggregateStatus(po);
  po.events.push({ at: t, by: actor.id, text: `${input.qty} gal on line ${lineId} ${input.kind === "cannot_fill" ? "confirmed unfillable" : "cancellation confirmed"} by ${input.employee.trim()} at branch ${branch.storeNumber}.` });
  log(db, actor, MODULE, `Order ${po.id} line ${lineId} cancellation confirmed by ${branch.name} (${input.employee.trim()}) at ${dateTime(t)}, recorded by ${actor.name}`);
  return ok();
}

/* ------------------------------------------------------------------ */
/* Delivery date changes                                               */
/* ------------------------------------------------------------------ */

export function changeDeliveryDate(db: Database, actor: User, poId: string, newDate: string, reason: string) {
  if (!can(actor, "supplier.submit")) return denied(db, actor, MODULE, "move a delivery date", whoCan("supplier.submit"));
  const { po } = orderAndBranch(db, poId);
  if (!po || !po.deliveryDate) return fail("Order not found.");
  if (!newDate) return fail("Choose the revised date.", "date");
  if (newDate.slice(0, 10) === po.deliveryDate.slice(0, 10)) return fail("The revised date is the same as the current date.", "date");
  if (!reason.trim()) return fail("Give a reason for the change.", "reason");
  if ((po.deliveryChanges ?? []).some((c) => c.status === "pending_owner")) return fail("A date change is already waiting for the owner.");
  const { days, needs } = deliveryChangeApprover(po.originalDeliveryDate ?? po.deliveryDate, newDate);
  const approveNow = needs === "office_manager" ? ["office_manager", "owner"].includes(actor.role) : actor.role === "owner";
  const change = {
    id: nextFreeId(po.deliveryChanges ?? [], "DC-"), from: po.deliveryDate, to: newDate, days, reason: reason.trim(), requestedBy: actor.id, requestedAt: now(),
    status: approveNow ? ("approved" as const) : ("pending_owner" as const), approvedBy: approveNow ? actor.id : undefined, approvedAt: approveNow ? now() : undefined,
  };
  po.deliveryChanges = [...(po.deliveryChanges ?? []), change];
  po.originalDeliveryDate ??= po.deliveryDate;
  if (approveNow) po.deliveryDate = newDate;
  log(db, actor, MODULE, `Order ${po.id} delivery moved from ${dateLong(change.from)} to ${dateLong(newDate)} by ${actor.name}. Approved by: ${approveNow ? actor.name : "pending scheduler and owner (more than 3 days)"}`);
  return ok(change.status);
}

export function decideDeliveryChange(db: Database, actor: User, poId: string, changeId: string, approve: boolean) {
  if (actor.role !== "owner") return denied(db, actor, MODULE, "approve a delivery move of more than three days", "the Business Owner");
  const { po } = orderAndBranch(db, poId);
  const change = po?.deliveryChanges?.find((c) => c.id === changeId);
  if (!po || !change || change.status !== "pending_owner") return fail("Change not found or already decided.");
  change.status = approve ? "approved" : "rejected";
  change.approvedBy = actor.id;
  change.approvedAt = now();
  if (approve) po.deliveryDate = change.to;
  log(db, actor, MODULE, `Order ${po.id} delivery moved from ${dateLong(change.from)} to ${dateLong(change.to)} by ${userName(db, change.requestedBy)}. ${approve ? "Approved" : "Rejected"} by: ${actor.name}`);
  return ok();
}

/* ------------------------------------------------------------------ */
/* Replacement / substitution (19.A11, Rule 1)                         */
/* ------------------------------------------------------------------ */

export function previewReplacement(db: Database, poId: string, lineId: string, newCatalogId: string, newPackSize: PackSize, isDirectSuccessor: boolean) {
  const po = byId(db.purchaseOrders, poId);
  const line = po?.lines.find((l) => l.id === lineId);
  const oldCat = line && db.catalog.find((c) => c.product === line.product);
  const newCat = byId(db.catalog, newCatalogId);
  if (!po || !line || !newCat) return undefined;
  const job = byId(db.jobs, po.jobId)!;
  const spec = line.specId ? byId(db.specs, line.specId) : undefined;
  const colour = spec ? byId(db.colours, spec.colourId)?.number ?? line.colourLabel : line.colourLabel;
  const packCost = newCat.cost[newPackSize];
  if (packCost === undefined) return { error: `${newCat.product} has no price for that pack size.` };
  const newCostPerGal = packCost / PACK_GALLONS[newPackSize];
  const count = Math.ceil(line.gallons / PACK_GALLONS[newPackSize] - 1e-9);
  const newGallons = count * PACK_GALLONS[newPackSize];
  const orderTotalDelta = roundMoney(newGallons * newCostPerGal - line.gallons * line.unitCostPerGal);
  const approved = line.approvedCostPerGal ?? line.unitCostPerGal;
  const result = replacementDecision({
    before: { brand: oldCat?.manufacturer ?? "", productLine: oldCat?.productLine ?? "", colour, sheen: line.sheen, product: line.product, packSize: line.packs[0]?.size, costPerGal: line.unitCostPerGal },
    after: { brand: newCat.manufacturer, productLine: newCat.productLine, colour, sheen: line.sheen, product: newCat.product, packSize: newPackSize, costPerGal: newCostPerGal },
    jobSigned: job.contractSigned, isDirectSuccessor, approvedCostPerGal: approved, orderTotalDelta,
  });
  return { ...result, newCostPerGal, orderTotalDelta, count, newGallons, newCat, line };
}

export function requestReplacement(db: Database, actor: User, input: { poId: string; lineId: string; newCatalogId: string; newPackSize: PackSize; isDirectSuccessor: boolean }) {
  if (!can(actor, "supplier.submit")) return denied(db, actor, MODULE, "request a replacement", whoCan("supplier.submit"));
  const p = previewReplacement(db, input.poId, input.lineId, input.newCatalogId, input.newPackSize, input.isDirectSuccessor);
  if (!p) return fail("Order line or product not found.");
  if ("error" in p) return fail(p.error!, "packSize");
  const po = byId(db.purchaseOrders, input.poId)!;
  if (p.line.receivedGal > 0) return fail("Part of this line is already received. Record a return or a new order instead.");
  if (p.decision === "change_order") return fail(`${p.reason} Office-only approval is blocked.`);
  if ((po.replacements ?? []).some((r) => r.lineId === input.lineId && r.status === "pending_owner")) return fail("A replacement for this line is already waiting for the owner.");
  const approveNow = p.decision === "office_manager" ? ["office_manager", "owner"].includes(actor.role) : actor.role === "owner";
  const rec = {
    id: nextFreeId(po.replacements ?? [], "RPL-"), lineId: input.lineId, original: `${p.line.product} (${p.line.packs.map((x) => `${x.count}×${x.size}`).join(" + ")})`,
    replacement: `${p.newCat.product} (${p.count}×${input.newPackSize})`, newCatalogId: input.newCatalogId, newPackSize: input.newPackSize,
    oldCostPerGal: p.line.unitCostPerGal, newCostPerGal: p.newCostPerGal, pctChange: p.pct, orderTotalDelta: p.orderTotalDelta, decision: p.decision, reason: p.reason,
    status: approveNow ? ("approved" as const) : ("pending_owner" as const), requestedBy: actor.id, requestedAt: now(), approvedBy: approveNow ? actor.id : undefined,
  };
  po.replacements = [...(po.replacements ?? []), rec];
  if (approveNow) applyReplacement(db, po.id, rec.id);
  log(db, actor, MODULE, `Order ${po.id} line ${input.lineId} – ${rec.original} replaced with ${rec.replacement}, cost change ${(p.pct * 100).toFixed(1)}%, approved by ${approveNow ? actor.name : "pending Business Owner"}`);
  return ok(rec.status);
}

function applyReplacement(db: Database, poId: string, replacementId: string) {
  const po = byId(db.purchaseOrders, poId)!;
  const rec = po.replacements!.find((r) => r.id === replacementId)!;
  const line = po.lines.find((l) => l.id === rec.lineId)!;
  const cat = byId(db.catalog, rec.newCatalogId)!;
  const count = Math.ceil(line.gallons / PACK_GALLONS[rec.newPackSize] - 1e-9);
  line.product = cat.product;
  line.packs = [{ size: rec.newPackSize, count }];
  line.gallons = count * PACK_GALLONS[rec.newPackSize];
  line.unitCostPerGal = rec.newCostPerGal;
  po.events.push({ at: now(), by: rec.approvedBy ?? rec.requestedBy, text: `Line ${line.id} replaced: ${rec.original} → ${rec.replacement}.` });
  // An accepted supplier substitute goes back to the supplier to fill.
  if (line.substituteOffer) {
    line.substituteOffer = undefined;
    if (line.status === "substitute_available") line.status = "processing";
    po.status = aggregateStatus(po);
  }
}

export function decideReplacement(db: Database, actor: User, poId: string, replacementId: string, approve: boolean) {
  if (actor.role !== "owner") return denied(db, actor, MODULE, "approve this substitution", "the Business Owner");
  const po = byId(db.purchaseOrders, poId);
  const rec = po?.replacements?.find((r) => r.id === replacementId);
  if (!po || !rec || rec.status !== "pending_owner") return fail("Replacement not found or already decided.");
  rec.status = approve ? "approved" : "rejected";
  rec.approvedBy = actor.id;
  if (approve) applyReplacement(db, poId, replacementId);
  else {
    const line = po.lines.find((l) => l.id === rec.lineId);
    if (line?.status === "substitute_available") {
      // Declined substitute: someone must call the branch about the original product.
      line.status = "problem";
      line.substituteOffer = undefined;
      po.status = aggregateStatus(po);
      po.events.push({ at: now(), by: actor.id, text: `Line ${line.id}: supplier's substitute declined. Call the branch to fill the original product or cancel the line.` });
    }
  }
  log(db, actor, MODULE, `Order ${po.id} line ${rec.lineId} – ${rec.original} replaced with ${rec.replacement}, cost change ${(rec.pctChange * 100).toFixed(1)}%, ${approve ? "approved" : "rejected"} by ${actor.name}`);
  return ok();
}

/* ------------------------------------------------------------------ */
/* Returns and credits                                                 */
/* ------------------------------------------------------------------ */

export function recordReturn(db: Database, actor: User, input: { poId: string; lineId: string; qty: number; credit: number; confirmed: boolean; reason: string }) {
  if (!can(actor, "supplier.submit")) return denied(db, actor, MODULE, "record a return", whoCan("supplier.submit"));
  const { po } = orderAndBranch(db, input.poId);
  const line = po?.lines.find((l) => l.id === input.lineId);
  if (!po || !line) return fail("Order line not found.");
  if (line.tinted !== false) return fail("Tinted paint is non-returnable. It stays job cost and may move to the leftover shelf instead.", "lineId");
  const pendingQty = (db.returns ?? []).filter((r) => r.poId === po.id && r.lineId === line.id && !r.confirmed).reduce((a, r) => a + r.qtyGal, 0);
  const returnable = line.receivedGal - line.returnedGal - pendingQty;
  if (!(input.qty > 0) || input.qty > returnable + 1e-9) return fail(`Up to ${returnable.toFixed(2)} gal can be returned (received, not already returned).`, "qty");
  if (!(input.credit >= 0)) return fail("Credit must be zero or more.", "credit");
  if (!input.reason.trim()) return fail("Give a reason for the return.", "reason");
  db.returns ??= [];
  const id = nextFreeId(db.returns, "RET-");
  db.returns.push({ id, poId: po.id, lineId: line.id, jobId: po.jobId, qtyGal: input.qty, credit: roundMoney(input.credit), confirmed: input.confirmed, reason: input.reason.trim(), at: now(), by: actor.id });
  if (input.confirmed) {
    line.returnedGal = roundHalfUp(line.returnedGal + input.qty, 3);
    line.creditAmount = roundMoney(line.creditAmount + input.credit);
  }
  po.events.push({ at: now(), by: actor.id, text: `${input.qty} gal returned untinted from line ${line.id}${input.confirmed ? `, credit ${money(input.credit)} confirmed` : ", credit awaiting supplier confirmation"}. Ordered quantity unchanged.` });
  log(db, actor, MODULE, `Order ${po.id} – ${input.qty} gal returned untinted, credit ${money(input.credit)} linked to job ${po.jobId} by ${actor.name}${input.confirmed ? "" : " (credit not yet confirmed)"}`);
  return ok(id);
}

export function confirmReturnCredit(db: Database, actor: User, returnId: string) {
  if (!can(actor, "supplier.submit")) return denied(db, actor, MODULE, "confirm a supplier credit", whoCan("supplier.submit"));
  const r = byId(db.returns ?? [], returnId);
  if (!r || r.confirmed) return fail("Return not found or already confirmed.");
  const po = byId(db.purchaseOrders, r.poId)!;
  const line = po.lines.find((l) => l.id === r.lineId)!;
  r.confirmed = true;
  line.returnedGal = roundHalfUp(line.returnedGal + r.qtyGal, 3);
  line.creditAmount = roundMoney(line.creditAmount + r.credit);
  log(db, actor, MODULE, `Order ${po.id} – ${r.qtyGal} gal returned untinted, credit ${money(r.credit)} linked to job ${po.jobId} confirmed by ${actor.name}`);
  return ok();
}

/** Tinted leftovers can't be returned; they can move to the shelf (still job cost). */
export function moveToShelf(db: Database, actor: User, poId: string, lineId: string, qty: number) {
  if (!can(actor, "po.receive")) return denied(db, actor, MODULE, "move paint to the leftover shelf", whoCan("po.receive"));
  const { po } = orderAndBranch(db, poId);
  const line = po?.lines.find((l) => l.id === lineId);
  if (!po || !line) return fail("Order line not found.");
  if (!(qty > 0) || qty > line.receivedGal + 1e-9) return fail(`Enter up to ${line.receivedGal.toFixed(2)} gal.`, "qty");
  const spec = line.specId ? byId(db.specs, line.specId) : undefined;
  const colour = spec && byId(db.colours, spec.colourId);
  const id = nextFreeId(db.shelfStock, "SH-");
  db.shelfStock.push({
    id, product: line.product, colourName: colour?.name ?? line.colourLabel, colourNumber: colour?.number ?? "", sheen: spec?.sheen ?? "Satin", containerSize: line.packs[0]?.size ?? "gal",
    sealed: true, tintDate: po.ackAt ?? po.createdAt, purchaseDate: po.createdAt, unitCostPerGal: line.unitCostPerGal, source: `Tinted leftover from ${po.id} line ${line.id} (remains job cost)`,
  });
  log(db, actor, MODULE, `Order ${po.id} – ${qty} gal tinted leftover from line ${lineId} moved to shelf stock ${id} by ${actor.name}. Remains job cost for ${po.jobId}`);
  return ok(id);
}

export { poValue };
