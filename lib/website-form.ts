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
  /** CRM-M5: lead source from the tracked link, the referring site, or Website (leadSourceFor). */
  source?: string;
  /** CRM-M5: the tracked link (?l=) the form was opened from. */
  trackedLinkId?: string;
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
      source: leadSourceFor({ src: str(b.src, 40), referrer: str(b.referrer, 300) }),
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

/* ---------- Lead source (CRM-M5) ---------- */

/** Known tags, lower case → the source label leads show. */
const KNOWN_SOURCES: Record<string, string> = {
  facebook: 'Facebook', fb: 'Facebook', instagram: 'Instagram', ig: 'Instagram', google: 'Google', website: 'Website',
  nextdoor: 'Nextdoor', thumbtack: 'Thumbtack', angi: 'Angi', referral: 'Referral', 'yard-sign': 'Yard Sign',
};

/** "spring-mailer" → "Spring Mailer". */
const titleCase = (t: string) =>
  t.split(/[-_\s]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

/**
 * The lead source, in this order:
 *  1. the tracked link's tag (?src=);
 *  2. the referring site: facebook.com → Facebook, instagram.com → Instagram, google → Google;
 *  3. otherwise Website.
 */
export function leadSourceFor({ src, referrer }: { src?: string; referrer?: string }): string {
  const tag = (src ?? '').trim();
  if (tag) return KNOWN_SOURCES[tag.toLowerCase()] ?? titleCase(tag);
  let host = '';
  try {
    host = referrer ? new URL(referrer).hostname.toLowerCase() : '';
  } catch {
    host = '';
  }
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(host)) return 'Facebook';
  if (/(^|\.)instagram\.com$/.test(host)) return 'Instagram';
  if (/(^|\.)google\./.test(host)) return 'Google';
  return 'Website';
}

/** The public form link for a tracked link (CRM-M5): /website-form?src={source}&l={linkId}. */
export function trackedLinkPath(link: { id: string; source: string }): string {
  const src = link.source.trim().toLowerCase().replace(/\s+/g, '-');
  return `/website-form?src=${encodeURIComponent(src)}&l=${encodeURIComponent(link.id)}`;
}
