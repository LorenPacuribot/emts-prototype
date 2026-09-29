/*
  Website form endpoint rules (patent 34: the website form is an integrated
  lead channel). Pure so the route handler and the tests share them.

  A submission must carry the organisation's site key, leave the hidden
  honeypot field empty, take at least MIN_FILL_MS to fill in, and give a
  name plus a phone or an email. Each event keeps a stable reference: the
  website may send its own (so a retry never duplicates a lead) or the
  server assigns one.
*/

export const DEMO_SITE_KEY = 'emts-demo-site-key';
export const HONEYPOT_FIELD = 'company_website';
export const MIN_FILL_MS = 2500;
const MAX = { name: 120, phone: 40, email: 160, town: 160, message: 2000, ref: 80 } as const;

export interface InboxSubmission {
  ref: string;
  name: string;
  phone: string;
  email: string;
  town: string;
  message: string;
  receivedAt: string;
}

export type FormCheck =
  | { ok: true; submission: InboxSubmission; spam?: false }
  /** Spam is accepted silently (200) so bots learn nothing, but never stored. */
  | { ok: true; spam: true }
  | { ok: false; status: number; error: string; field?: string };

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function checkSubmission(body: unknown, opts: { siteKey: string; now: number; newRef: () => string }): FormCheck {
  if (!body || typeof body !== 'object') return { ok: false, status: 400, error: 'Send the form as JSON or form data.' };
  const b = body as Record<string, unknown>;
  if (b.siteKey !== opts.siteKey) return { ok: false, status: 401, error: 'Unknown site key.', field: 'siteKey' };
  if (str(b[HONEYPOT_FIELD], 200)) return { ok: true, spam: true };
  const startedAt = Number(b.startedAt);
  if (Number.isFinite(startedAt) && startedAt > 0 && opts.now - startedAt < MIN_FILL_MS) return { ok: true, spam: true };

  const name = str(b.name, MAX.name);
  const phone = str(b.phone, MAX.phone);
  const email = str(b.email, MAX.email);
  if (!name) return { ok: false, status: 422, error: 'Enter your name.', field: 'name' };
  if (!phone && !email) return { ok: false, status: 422, error: 'Enter a phone number or an email so we can reach you.', field: 'phone' };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, status: 422, error: 'That email address does not look right.', field: 'email' };
  if (phone && phone.replace(/\D/g, '').length < 7) return { ok: false, status: 422, error: 'That phone number looks too short.', field: 'phone' };

  const given = str(b.ref, MAX.ref).replace(/[^A-Za-z0-9_.:-]/g, '');
  return {
    ok: true,
    submission: {
      ref: given ? `WEB-${given}` : opts.newRef(),
      name, phone, email,
      town: str(b.town, MAX.town),
      message: str(b.message, MAX.message),
      receivedAt: new Date(opts.now).toISOString(),
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
