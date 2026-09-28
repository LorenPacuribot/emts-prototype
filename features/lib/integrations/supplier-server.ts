/**
 * Feature 19 — server side of a live supplier API/EDI connection.
 * Used only by the route handlers under app/api/suppliers.
 *
 * Everything sensitive comes from the server environment, never from the
 * browser: the endpoint URL (so the send route can't be pointed at an
 * arbitrary address), the API key and the webhook secret. Nothing here
 * returns a secret; status calls report only whether each one is set.
 *
 *   SUPPLIER_<ID>_ENDPOINT_URL    e.g. SUPPLIER_SUP_SW_ENDPOINT_URL
 *   SUPPLIER_<ID>_API_KEY
 *   SUPPLIER_<ID>_WEBHOOK_SECRET
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { PackSize, SupplierMessage, SupplierOrderPayload } from "@/features/types";
import { envName } from "./supplier-connector";

export { envName };

type Env = Record<string, string | undefined>;


export interface LiveStatus {
  live: boolean;
  endpointHost?: string;
  credentialSet: boolean;
  webhookSecretSet: boolean;
  error?: string;
}

/** Only http://localhost for development; anything else must be https. */
function parseEndpoint(raw: string | undefined): { url?: URL; error?: string } {
  if (!raw) return { error: "No endpoint URL is configured on the server." };
  try {
    const url = new URL(raw);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return { error: "The endpoint must use https." };
    return { url };
  } catch {
    return { error: "The configured endpoint URL is not valid." };
  }
}

export function connectionStatus(supplierId: string, env: Env = process.env): LiveStatus {
  const ep = parseEndpoint(env[envName(supplierId, "ENDPOINT_URL")]);
  const credentialSet = !!env[envName(supplierId, "API_KEY")];
  const webhookSecretSet = !!env[envName(supplierId, "WEBHOOK_SECRET")];
  const error = ep.error ?? (credentialSet ? undefined : "No API key is configured on the server.");
  return { live: !error, endpointHost: ep.url?.host, credentialSet, webhookSecretSet, error };
}

const PACKS: PackSize[] = ["qt", "gal", "5gal"];
const str = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 200;

/** Shape check for an order coming from the browser before it is forwarded. */
export function validatePayload(body: unknown, supplierId: string): { payload: SupplierOrderPayload } | { error: string } {
  const p = body as SupplierOrderPayload;
  if (!p || typeof p !== "object") return { error: "Body must be a JSON order." };
  if (p.supplierId !== supplierId) return { error: "Order is for a different supplier." };
  if (!str(p.poId) || !str(p.storeNumber) || !str(p.jobRef)) return { error: "Order is missing its PO, store number or job reference." };
  if (!Array.isArray(p.lines) || p.lines.length === 0 || p.lines.length > 200) return { error: "Order needs between 1 and 200 lines." };
  for (const l of p.lines) {
    if (!str(l.lineId) || !str(l.product) || typeof l.gallons !== "number" || !(l.gallons > 0)) return { error: "Each line needs an ID, product and quantity." };
    if (!Array.isArray(l.packs) || l.packs.some((k) => !PACKS.includes(k.size) || !Number.isInteger(k.count) || k.count < 1 || !str(k.itemCode))) {
      return { error: `Line ${l.lineId} has an invalid pack or a missing item code.` };
    }
  }
  return { payload: p };
}

export interface TransmitResult { ok: boolean; messageId?: string; error?: string; status?: number }

/** POST the order to the supplier's endpoint with the server-held key. */
export async function transmitOrder(supplierId: string, payload: SupplierOrderPayload, opts: { env?: Env; fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<TransmitResult> {
  const env = opts.env ?? process.env;
  const status = connectionStatus(supplierId, env);
  if (!status.live) return { ok: false, error: status.error };
  const url = parseEndpoint(env[envName(supplierId, "ENDPOINT_URL")]).url!;
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env[envName(supplierId, "API_KEY")]}`, "Idempotency-Key": payload.poId },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
    });
  } catch (e) {
    return { ok: false, error: `Could not reach ${status.endpointHost}: ${e instanceof Error ? e.message : "network error"}.` };
  }
  if (!res.ok) return { ok: false, status: res.status, error: `${status.endpointHost} refused the order (HTTP ${res.status}).` };
  const data = (await res.json().catch(() => ({}))) as { messageId?: unknown };
  if (!str(data.messageId)) return { ok: false, error: `${status.endpointHost} accepted the request but returned no message ID.` };
  return { ok: true, messageId: data.messageId as string };
}

/* ----------------------------- Webhook ----------------------------- */

export function sign(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

/** Constant-time check of the X-Supplier-Signature header. */
export function verifySignature(secret: string | undefined, body: string, header: string | null): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from(sign(secret, body));
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function validateMessage(body: unknown): { msg: SupplierMessage } | { error: string } {
  const m = body as SupplierMessage;
  if (!m || typeof m !== "object" || !str(m.messageId) || !str(m.poId)) return { error: "Message needs a messageId and poId." };
  if (m.kind === "order_received") return str(m.reference) ? { msg: m } : { error: "order_received needs a reference." };
  if (m.kind === "line_status") {
    if (!str(m.lineId) || !str(m.statusText)) return { error: "line_status needs a lineId and statusText." };
    if (m.substitute && !str(m.substitute.product)) return { error: "substitute needs a product." };
    return { msg: m };
  }
  return { error: "Unknown message kind." };
}

/*
 * Inbox: verified supplier messages wait here until the app collects them.
 * In memory, so it lasts as long as the server process. A production
 * deployment would put this in the database behind the same functions.
 */
interface Inbox { seq: number; items: { seq: number; msg: SupplierMessage }[] }
const store = globalThis as unknown as { __supplierInbox?: Map<string, Inbox> };
const inboxes: Map<string, Inbox> = (store.__supplierInbox ??= new Map<string, Inbox>());

export function pushInbox(supplierId: string, msg: SupplierMessage): number {
  const box = inboxes.get(supplierId) ?? { seq: 0, items: [] };
  if (box.items.some((i) => i.msg.messageId === msg.messageId)) return box.seq;
  box.seq += 1;
  box.items.push({ seq: box.seq, msg });
  if (box.items.length > 500) box.items.splice(0, box.items.length - 500);
  inboxes.set(supplierId, box);
  return box.seq;
}

export function readInbox(supplierId: string, after = 0): { cursor: number; messages: SupplierMessage[] } {
  const box = inboxes.get(supplierId);
  if (!box) return { cursor: after, messages: [] };
  return { cursor: box.seq, messages: box.items.filter((i) => i.seq > after).map((i) => i.msg) };
}

/** Test helper. */
export function clearInbox() {
  inboxes.clear();
}
