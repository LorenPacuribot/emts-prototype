/**
 * Server side of the email / SMS messaging connector. Used only by the route
 * handlers under app/api/messaging.
 *
 * Endpoints, keys and sender identities come from the server environment,
 * never from the browser, and are never returned (status reports only
 * whether each one is set):
 *
 *   MESSAGING_EMAIL_ENDPOINT_URL   https endpoint that accepts { from, to, subject, body, tag }
 *   MESSAGING_EMAIL_API_KEY        sent as "Authorization: Bearer <key>"
 *   MESSAGING_SMS_ENDPOINT_URL     https endpoint that accepts { from, to, body, tag }
 *   MESSAGING_SMS_API_KEY
 *   MESSAGING_FROM_EMAIL           sender address
 *   MESSAGING_FROM_PHONE           sender number (E.164)
 *
 * A channel without an endpoint + key runs in SANDBOX: nothing leaves the
 * server, the message is kept in an in-memory outbox and gets an "SBX-" id.
 */
import { randomUUID } from "node:crypto";

type Env = Record<string, string | undefined>;

export type Channel = "email" | "sms";

export interface SendRequest {
  channel: Channel;
  to: string;
  subject?: string;
  body: string;
  tag?: string;
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  sandbox: boolean;
  error?: string;
}

export interface ChannelStatus {
  live: boolean;
  sandbox: boolean;
  endpointHost?: string;
  endpointSet: boolean;
  credentialSet: boolean;
  fromSet: boolean;
  error?: string;
}

export interface MessagingStatus {
  email: ChannelStatus;
  sms: ChannelStatus;
  sandboxOutbox: number;
}

const ENV = {
  email: { url: "MESSAGING_EMAIL_ENDPOINT_URL", key: "MESSAGING_EMAIL_API_KEY", from: "MESSAGING_FROM_EMAIL" },
  sms: { url: "MESSAGING_SMS_ENDPOINT_URL", key: "MESSAGING_SMS_API_KEY", from: "MESSAGING_FROM_PHONE" },
} as const;

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

export function channelStatus(channel: Channel, env: Env = process.env): ChannelStatus {
  const names = ENV[channel];
  const endpointSet = !!env[names.url];
  const ep = parseEndpoint(env[names.url]);
  const credentialSet = !!env[names.key];
  const fromSet = !!env[names.from];
  let error: string | undefined;
  if (endpointSet && ep.error) error = ep.error;
  else if (endpointSet && !credentialSet) error = "No API key is configured on the server.";
  else if (endpointSet && !fromSet) error = `No sender is configured (${names.from}).`;
  const live = endpointSet && !error;
  return { live, sandbox: !live, endpointHost: ep.url?.host, endpointSet, credentialSet, fromSet, error };
}

export function messagingStatus(env: Env = process.env): MessagingStatus {
  return { email: channelStatus("email", env), sms: channelStatus("sms", env), sandboxOutbox: outbox.length };
}

/* ----------------------------- Validation ----------------------------- */

export const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;

export function isValidEmail(v: string): boolean {
  return v.length <= 254 && EMAIL_RE.test(v);
}

/** Normalise a phone number to E.164. US 10-digit numbers get +1. */
export function normalizePhone(v: string): string | undefined {
  const trimmed = v.trim();
  if (!/^[\d\s\-().+]+$/.test(trimmed)) return undefined;
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : undefined;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return undefined;
}

const MAX = { subject: 200, emailBody: 20000, smsBody: 1600, tag: 64 };

export function validateSend(body: unknown): { req: SendRequest } | { error: string } {
  const b = body as Partial<SendRequest> | undefined;
  if (!b || typeof b !== "object") return { error: "Body must be JSON: { channel, to, subject?, body, tag? }." };
  if (b.channel !== "email" && b.channel !== "sms") return { error: "channel must be 'email' or 'sms'." };
  if (typeof b.to !== "string" || !b.to.trim()) return { error: "to is required." };
  if (typeof b.body !== "string" || !b.body.trim()) return { error: "body is required." };
  if (b.subject !== undefined && typeof b.subject !== "string") return { error: "subject must be text." };
  if (b.tag !== undefined && (typeof b.tag !== "string" || b.tag.length > MAX.tag || !/^[\w.:-]*$/.test(b.tag))) return { error: `tag must be up to ${MAX.tag} letters, digits, '.', ':', '_' or '-'.` };
  const tag = b.tag || undefined;
  if (b.channel === "email") {
    const to = b.to.trim();
    if (!isValidEmail(to)) return { error: "to must be a valid email address." };
    const subject = (b.subject ?? "").trim();
    if (!subject) return { error: "subject is required for email." };
    if (subject.length > MAX.subject || /[\r\n]/.test(subject)) return { error: `subject must be one line of at most ${MAX.subject} characters.` };
    if (b.body.length > MAX.emailBody) return { error: `body must be at most ${MAX.emailBody} characters.` };
    return { req: { channel: "email", to, subject, body: b.body, tag } };
  }
  const to = normalizePhone(b.to);
  if (!to) return { error: "to must be a valid phone number (10-digit US or +E.164)." };
  if (b.body.length > MAX.smsBody) return { error: `SMS body must be at most ${MAX.smsBody} characters.` };
  return { req: { channel: "sms", to, body: b.body, tag } };
}

/* ----------------------------- Sending ----------------------------- */

interface OutboxItem extends SendRequest {
  messageId: string;
  at: string;
}
const g = globalThis as unknown as { __messagingOutbox?: OutboxItem[] };
const outbox: OutboxItem[] = (g.__messagingOutbox ??= []);

export function sandboxOutbox(): readonly OutboxItem[] {
  return outbox;
}

/** Test helper. */
export function clearOutbox() {
  outbox.length = 0;
}

export async function sendMessage(req: SendRequest, opts: { env?: Env; fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<SendResult> {
  const env = opts.env ?? process.env;
  const status = channelStatus(req.channel, env);
  if (status.endpointSet && status.error) return { ok: false, sandbox: false, error: status.error };
  if (!status.live) {
    const messageId = `SBX-${randomUUID()}`;
    outbox.push({ ...req, messageId, at: new Date().toISOString() });
    if (outbox.length > 200) outbox.splice(0, outbox.length - 200);
    return { ok: true, messageId, sandbox: true };
  }
  const names = ENV[req.channel];
  const url = parseEndpoint(env[names.url]).url!;
  const idempotency = randomUUID();
  const payload = req.channel === "email"
    ? { from: env[names.from], to: req.to, subject: req.subject, body: req.body, tag: req.tag }
    : { from: env[names.from], to: req.to, body: req.body, tag: req.tag };
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env[names.key]}`, "Idempotency-Key": idempotency },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
    });
  } catch (e) {
    return { ok: false, sandbox: false, error: `Could not reach ${status.endpointHost}: ${e instanceof Error ? e.message : "network error"}.` };
  }
  if (!res.ok) return { ok: false, sandbox: false, error: `${status.endpointHost} refused the message (HTTP ${res.status}).` };
  const data = (await res.json().catch(() => ({}))) as { messageId?: unknown; id?: unknown };
  const id = typeof data.messageId === "string" ? data.messageId : typeof data.id === "string" ? data.id : undefined;
  if (!id || id.length > 200) return { ok: false, sandbox: false, error: `${status.endpointHost} accepted the request but returned no message ID.` };
  return { ok: true, sandbox: false, messageId: id };
}

/* ----------------------------- Request guards ----------------------------- */

/** Browser calls from this app only: rejects cross-site requests. */
export function sameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** Fixed-window rate limiter kept in memory per server process. */
export function rateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { start: number; count: number }>();
  return (key: string, at = Date.now()): { ok: boolean; retryAfter: number } => {
    const h = hits.get(key);
    if (!h || at - h.start >= windowMs) {
      // Drop only expired windows when the map grows, so a flood of keys cannot reset live limits.
      if (hits.size >= 5000) for (const [k, v] of hits) if (at - v.start >= windowMs) hits.delete(k);
      hits.set(key, { start: at, count: 1 });
      return { ok: true, retryAfter: 0 };
    }
    h.count += 1;
    if (h.count > limit) return { ok: false, retryAfter: Math.ceil((h.start + windowMs - at) / 1000) };
    return { ok: true, retryAfter: 0 };
  };
}
