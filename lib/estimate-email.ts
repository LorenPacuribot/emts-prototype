/*
  "Send to Customer" by email (patent 11).

  Client Preview and the estimate builder send the estimate through the same
  server connector as the lead messages (/api/messaging,
  features/lib/integrations/messaging-server.ts). Each recipient gets one
  message with the secure customer link. The result of every message is kept
  on the estimate (Estimate.deliveries) so staff can see whether the customer
  got it:
    delivered - the email provider accepted the message (it returned an id)
    sandbox   - the server has no email keys, so nothing left the server
    failed    - not sent; error says why
  The estimate becomes Sent only when at least one message was delivered or
  sandboxed. A failed send keeps its status so it can be retried.

  Pure helpers only (no React), so they can be unit tested.
*/
import type { Estimate, EstimateDelivery, EstimateStatus } from '@/lib/types';
import { publicEstimateHref } from '@/features/lib/hrefs';

/** Same address rule as the server (messaging-server.ts EMAIL_RE), so the modal rejects what the server would. */
export const EMAIL_ADDRESS_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;

export function isEmailAddress(v: string): boolean {
  return v.length <= 254 && EMAIL_ADDRESS_RE.test(v);
}

/** "a@x.com, b@y.com" -> ['a@x.com', 'b@y.com'] (trimmed, blanks and repeats removed). */
export function parseRecipients(to: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of to.split(/[,;]/)) {
    const v = raw.trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out;
}

/** The customer's page: the secure token link when the estimate has one, else its client view. */
export function customerLinkFor(origin: string, estimateId: string, publicToken?: string): string {
  return `${origin}${publicToken ? publicEstimateHref(publicToken) : `/estimates/${encodeURIComponent(estimateId)}/client-view`}`;
}

export interface EstimateEmailInput {
  estimate: Pick<Estimate, 'estimateNumber' | 'title'>;
  customerFirstName?: string;
  companyName: string;
  /** Absolute customer link (customerLinkFor). */
  link: string;
  /** Date the secure link stops working, already formatted for people. */
  linkExpires?: string;
}

export function defaultEstimateSubject(i: Pick<EstimateEmailInput, 'estimate' | 'companyName'>): string {
  return `Your estimate ${i.estimate.estimateNumber} from ${i.companyName}`.replace(/[\r\n]+/g, ' ').trim();
}

export function defaultEstimateMessage(i: Pick<EstimateEmailInput, 'estimate' | 'companyName' | 'customerFirstName'>): string {
  return `Hi ${i.customerFirstName?.trim() || 'there'},\n\nThank you for the opportunity to quote your project. Your estimate for "${i.estimate.title}" is ready to review. Use the secure link below to view the details, sign, and approve.\n\nPlease let us know if you have any questions.\n\n${i.companyName}`;
}

/**
 * The email that goes to the customer. The secure link is always in the body:
 * it is added under the message unless the message already contains it.
 */
export function buildEstimateEmail(i: EstimateEmailInput, custom?: { subject?: string; message?: string }): { subject: string; body: string } {
  const subject = (custom?.subject?.trim() || defaultEstimateSubject(i)).replace(/[\r\n]+/g, ' ');
  const message = (custom?.message?.trim() || defaultEstimateMessage(i)).trimEnd();
  const linkBlock = `View your estimate: ${i.link}${i.linkExpires ? `\n(This secure link works until ${i.linkExpires}.)` : ''}`;
  const body = message.includes(i.link) ? message : `${message}\n\n${linkBlock}`;
  return { subject, body };
}

/** The short SMS version ("Also send via SMS"). */
export function buildEstimateSms(i: EstimateEmailInput): string {
  return `${i.companyName}: your estimate ${i.estimate.estimateNumber} is ready. View, sign and approve: ${i.link}`;
}

/* ---------- The messaging response ---------- */

export type DeliveryOutcome = Pick<EstimateDelivery, 'status' | 'error' | 'providerMessageId'>;

/**
 * Turns the /api/messaging answer into a delivery status.
 * { ok, sandbox, messageId } -> sandbox or delivered; anything else -> failed with the reason.
 */
export function deliveryFromResponse(r: { httpStatus: number; data: unknown } | { networkError: string }): DeliveryOutcome {
  if ('networkError' in r) return { status: 'failed', error: r.networkError || 'Network error' };
  const d = (r.data && typeof r.data === 'object' ? r.data : {}) as { ok?: unknown; sandbox?: unknown; messageId?: unknown; error?: unknown };
  const providerMessageId = typeof d.messageId === 'string' && d.messageId ? d.messageId : undefined;
  if (d.ok === true && r.httpStatus >= 200 && r.httpStatus < 300) {
    return d.sandbox === true ? { status: 'sandbox', providerMessageId } : { status: 'delivered', providerMessageId };
  }
  const error = typeof d.error === 'string' && d.error.trim() ? d.error.trim() : `The messaging service answered HTTP ${r.httpStatus}.`;
  return { status: 'failed', error };
}

/** Posts one message to /api/messaging. Never throws. */
export async function postEstimateMessage(
  req: { channel: 'email' | 'sms'; to: string; subject?: string; body: string; tag?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<DeliveryOutcome> {
  try {
    const res = await fetchImpl('/api/messaging', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    const data = await res.json().catch(() => undefined);
    return deliveryFromResponse({ httpStatus: res.status, data });
  } catch (e) {
    return deliveryFromResponse({ networkError: e instanceof Error ? e.message : 'Network error' });
  }
}

/* ---------- The Sent rule ---------- */

/** True when at least one message reached the provider or the sandbox. */
export function sendSucceeded(deliveries: readonly Pick<EstimateDelivery, 'status'>[]): boolean {
  return deliveries.some((d) => d.status !== 'failed');
}

/**
 * Status after a send: Sent when something went out (delivered or sandbox),
 * an approved estimate stays Approved, and a failed send changes nothing
 * (undefined = keep the current status).
 */
export function statusAfterSend(current: EstimateStatus, deliveries: readonly Pick<EstimateDelivery, 'status'>[]): EstimateStatus | undefined {
  if (!sendSucceeded(deliveries)) return undefined;
  return current === 'Approved' ? 'Approved' : 'Sent';
}

/* ---------- Showing it ---------- */

/** The messages of the most recent send (all recipients and channels). */
export function latestDeliveries(e: Pick<Estimate, 'deliveries'>): EstimateDelivery[] {
  const all = e.deliveries ?? [];
  const last = all[all.length - 1];
  return last ? all.filter((d) => d.sendId === last.sendId) : [];
}

const defaultTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();

/** Badge text; never colour alone. */
export function deliveryText(d: EstimateDelivery, time: (iso: string) => string = defaultTime): string {
  const how = d.channel === 'sms' ? 'Texted' : 'Emailed';
  if (d.status === 'delivered') return `${how} to ${d.to} · Delivered ${time(d.at)}`;
  if (d.status === 'sandbox') return `Sandbox — not really sent to ${d.to}: ${d.channel === 'sms' ? 'SMS' : 'email'} keys not set`;
  return `Failed: ${d.error ?? 'unknown error'} (${d.to})`;
}

/** One line for the estimate's activity log. */
export function deliveryLogText(estimateNumber: string, d: EstimateDelivery): string {
  const ch = d.channel === 'sms' ? 'SMS' : 'Email';
  if (d.status === 'delivered') return `${estimateNumber}: ${ch} to ${d.to} delivered to the provider${d.providerMessageId ? ` (id ${d.providerMessageId})` : ''}`;
  if (d.status === 'sandbox') return `${estimateNumber}: ${ch} to ${d.to} recorded in sandbox, not sent (email keys not set)`;
  return `${estimateNumber}: ${ch} to ${d.to} failed: ${d.error ?? 'unknown error'}`;
}

/** The toast after a send: exactly what happened, and whether the estimate is now Sent. */
export function deliveryToast(deliveries: readonly EstimateDelivery[], status: { before: EstimateStatus; after?: EstimateStatus }): { message: string; variant: 'success' | 'error' | 'info' } {
  const emails = deliveries.filter((d) => d.channel === 'email');
  const list = (ds: readonly EstimateDelivery[]) => ds.map((d) => d.to).join(', ');
  const delivered = emails.filter((d) => d.status === 'delivered');
  const sandbox = emails.filter((d) => d.status === 'sandbox');
  const failed = deliveries.filter((d) => d.status === 'failed');
  const parts: string[] = [];
  if (delivered.length) parts.push(`Estimate emailed to ${list(delivered)}.`);
  if (sandbox.length) parts.push(`Sandbox: nothing was emailed to ${list(sandbox)} because the email keys are not set on the server.`);
  const sms = deliveries.filter((d) => d.channel === 'sms' && d.status !== 'failed');
  if (sms.length) parts.push(sms[0].status === 'sandbox' ? `SMS to ${list(sms)} recorded in sandbox only.` : `SMS sent to ${list(sms)}.`);
  if (failed.length) parts.push(`Failed for ${failed.map((d) => `${d.to} (${d.error ?? 'unknown error'})`).join(', ')}.`);
  if (status.after) parts.push(status.after === status.before ? `Status stays ${status.after}.` : `Marked ${status.after}.`);
  else parts.push(`Not marked Sent: the estimate stays ${status.before}.`);
  const variant = !sendSucceeded(deliveries) ? 'error' : failed.length || sandbox.length ? 'info' : 'success';
  return { message: parts.join(' '), variant };
}
