/*
  Website form endpoint rules (patent 34: the website form is an integrated
  lead channel). Pure so the route handler and the tests share them.

  A submission must carry the organisation's site key, leave the hidden
  honeypot field empty and take at least MIN_FILL_MS to fill in. Each event
  keeps a stable reference: the website may send its own (so a retry never
  duplicates a lead) or the server assigns one.

  Fields (2 Oct 2026, D5):
  - Full name: required, 2 to 80 characters.
  - Phone: US format, 10 digits. Email: a valid address. One of the two is
    required: "Please give us a phone number or email."
  - Property address: optional.
  - "What would you like painted?": Interior, Exterior, Both, Cabinets or
    Other (optional), stored on the lead.
  - Message: optional, up to 1,000 characters.
  Rate limit (D4): 5 submissions per hour per address.
*/
import { leadSourceFor } from '@/features/lib/rules/lead-sources';

export const DEMO_SITE_KEY = 'emts-demo-site-key';
export const HONEYPOT_FIELD = 'company_website';
export const MIN_FILL_MS = 2500;
/** D4: 5 submissions per hour per client address. */
export const RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 } as const;
export const NAME_LENGTH = { min: 2, max: 80 } as const;
export const MESSAGE_MAX = 1000;
export const PAINT_TYPES = ['Interior', 'Exterior', 'Both', 'Cabinets', 'Other'] as const;
export type PaintType = (typeof PAINT_TYPES)[number];
export const THANKS_MESSAGE = "Thanks, we've received your request and will be in touch soon.";
export const CONTACT_REQUIRED = 'Please give us a phone number or email.';
const MAX = { phone: 40, email: 160, address: 200, ref: 80 } as const;

export interface InboxSubmission {
  ref: string;
  name: string;
  phone: string;
  email: string;
  /** D5: property address. `town` carries the same value for older readers. */
  address?: string;
  town: string;
  /** D5: "What would you like painted?" */
  paintType?: PaintType;
  message: string;
  receivedAt: string;
  /** CRM-M5: lead source from the tracked link, the referring site, or Website (leadSourceFor). */
  source?: string;
  /** D6: the raw ?src= tag and referrer, so the app resolves them against the organisation's list. */
  srcTag?: string;
  referrer?: string;
  /** CRM-M5: the tracked link (?l=) the form was opened from. */
  trackedLinkId?: string;
}

export type FormCheck =
  | { ok: true; submission: InboxSubmission; spam?: false }
  /** Spam is accepted silently (200) so bots learn nothing, but never stored. */
  | { ok: true; spam: true }
  | { ok: false; status: number; error: string; field?: string };

const raw = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const str = (v: unknown, max: number) => raw(v).slice(0, max);

/** Ten digits, optionally written with a leading 1 and any punctuation: (214) 555-0161, 214.555.0161, +1 214 555 0161. */
export function isUsPhone(phone: string): boolean {
  return phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '').length === 10;
}

export const isEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

export function checkSubmission(body: unknown, opts: { siteKey: string; now: number; newRef: () => string }): FormCheck {
  if (!body || typeof body !== 'object') return { ok: false, status: 400, error: 'Send the form as JSON or form data.' };
  const b = body as Record<string, unknown>;
  if (b.siteKey !== opts.siteKey) return { ok: false, status: 401, error: 'Unknown site key.', field: 'siteKey' };
  if (str(b[HONEYPOT_FIELD], 200)) return { ok: true, spam: true };
  const startedAt = Number(b.startedAt);
  if (Number.isFinite(startedAt) && startedAt > 0 && opts.now - startedAt < MIN_FILL_MS) return { ok: true, spam: true };

  const name = raw(b.name).replace(/\s+/g, ' ');
  const phone = str(b.phone, MAX.phone);
  const email = str(b.email, MAX.email);
  const message = raw(b.message);
  const paint = raw(b.paintType);
  if (!name) return { ok: false, status: 422, error: 'Enter your full name.', field: 'name' };
  if (name.length < NAME_LENGTH.min || name.length > NAME_LENGTH.max) return { ok: false, status: 422, error: `Your name should be ${NAME_LENGTH.min} to ${NAME_LENGTH.max} characters.`, field: 'name' };
  if (!phone && !email) return { ok: false, status: 422, error: CONTACT_REQUIRED, field: 'phone' };
  if (phone && !isUsPhone(phone)) return { ok: false, status: 422, error: 'Enter a 10-digit US phone number.', field: 'phone' };
  if (email && !isEmail(email)) return { ok: false, status: 422, error: 'That email address does not look right.', field: 'email' };
  if (paint && !(PAINT_TYPES as readonly string[]).includes(paint)) return { ok: false, status: 422, error: 'Pick what you would like painted from the list.', field: 'paintType' };
  if (message.length > MESSAGE_MAX) return { ok: false, status: 422, error: `Keep the message to ${MESSAGE_MAX.toLocaleString('en-US')} characters or fewer.`, field: 'message' };

  const address = str(b.address ?? b.town, MAX.address);
  const srcTag = str(b.src, 40);
  const referrer = str(b.referrer, 300);
  const given = str(b.ref, MAX.ref).replace(/[^A-Za-z0-9_.:-]/g, '');
  return {
    ok: true,
    submission: {
      ref: given ? `WEB-${given}` : opts.newRef(),
      name, phone, email,
      ...(address ? { address } : {}),
      town: address,
      ...(paint ? { paintType: paint as PaintType } : {}),
      message,
      receivedAt: new Date(opts.now).toISOString(),
      source: leadSourceFor({ src: srcTag, referrer }),
      ...(srcTag ? { srcTag } : {}),
      ...(referrer ? { referrer } : {}),
      ...(str(b.l, 40) ? { trackedLinkId: str(b.l, 40).replace(/[^A-Za-z0-9_-]/g, '') } : {}),
    },
  };
}

/** Fixed-window limit per client address. In memory, so per server instance. */
export class RateLimiter {
  private hits = new Map<string, { start: number; count: number }>();
  constructor(private max: number, private windowMs: number) {}
  allow(key: string, now: number): boolean {
    const h = this.hits.get(key);
    if (!h || now - h.start >= this.windowMs) {
      if (this.hits.size > 5000) this.hits.clear();
      this.hits.set(key, { start: now, count: 1 });
      return true;
    }
    h.count += 1;
    return h.count <= this.max;
  }
}

export const INBOX_PREFIX = 'website-inbox:';

/* ---------- Lead source (CRM-M5; 2 Oct 2026, D6: the organisation's list) ---------- */

export { leadSourceFor };

/** The public form link for a tracked link (CRM-M5): /website-form?src={source}&l={linkId}. */
export function trackedLinkPath(link: { id: string; source: string }): string {
  const src = link.source.trim().toLowerCase().replace(/\s+/g, '-');
  return `/website-form?src=${encodeURIComponent(src)}&l=${encodeURIComponent(link.id)}`;
}
