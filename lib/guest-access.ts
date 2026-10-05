/*
  Which customer pages may use the shared data without a staff sign-in.

  /api/state answers only a signed-in staff session, or a request from a
  customer page whose link carries a valid token for a record in the shared
  data (lib/remote-state.ts sends the page address in X-EMTS-Page):

    /estimates/view?token=T          an estimate's customer token
    /estimates/<id>/client-view?t=T  the same token on the replica page
    /paint-record/view?token=T       a QR paint record or Paint Passport (not revoked)
    /r/<code>                        an active tracked marketing link
    /lp/<slug>                       a published landing page

  Anyone else (no sign-in, no valid link) gets 401.

  Two levels (QA, 6 Oct): a link with a secret token ("token": estimate and
  paint record links) may save, as the customer signs or requests a touch-up.
  A public marketing page ("public": /r and /lp, which anyone can name in the
  header) only reads a redacted copy and saves nothing; its clicks, views and
  form submissions go through /api/public/marketing instead.
*/

export type GuestLevel = "token" | "public";

type Rec = Record<string, unknown>;
const list = (db: Rec | undefined, key: string): Rec[] => (Array.isArray(db?.[key]) ? (db![key] as Rec[]) : []);
const clean = (s: string | null | undefined) => (s ?? '').trim();

/** The feature store's database inside its saved blob ({ state: { db } }). */
export function featureDbOf(raw: string | null | undefined): Rec | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { state?: { db?: Rec } };
    return parsed.state?.db;
  } catch {
    return undefined;
  }
}

/** True when `page` (path + query) is a customer link with a valid token in `db`. */
export function guestAllowed(page: string | null | undefined, db: Rec | undefined): boolean {
  return guestLevel(page, db) !== null;
}

/** How far a request from `page` may use the shared data without a staff session. */
export function guestLevel(page: string | null | undefined, db: Rec | undefined): GuestLevel | null {
  if (!page || !db) return null;
  let url: URL;
  try {
    url = new URL(page, 'http://local');
  } catch {
    return null;
  }
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const q = url.searchParams;

  const estimateToken = (t: string) => !!t && list(db, 'estimates').some((e) => e.publicToken === t);
  if (path === '/estimates/view') return estimateToken(clean(q.get('token'))) ? 'token' : null;
  if (/^\/estimates\/[^/]+\/client-view$/.test(path)) return estimateToken(clean(q.get('t'))) ? 'token' : null;

  if (path === '/paint-record/view') {
    const ref = clean(q.get('token') ?? q.get('ref'));
    if (!ref) return null;
    const live = (r: Rec) => r.ref === ref && !r.revokedAt;
    return list(db, 'qrLinks').some(live) || list(db, 'paintPassports').some(live) ? 'token' : null;
  }

  const r = path.match(/^\/r\/([^/]+)$/);
  if (r) {
    const code = decodeURIComponent(r[1]!).trim().toUpperCase().replace(/\s+/g, '');
    return list(db, 'mktLinks').some((l) => l.code === code && l.active === true) ? 'public' : null;
  }

  const lp = path.match(/^\/lp\/([^/]+)$/);
  if (lp) {
    const slug = decodeURIComponent(lp[1]!).trim().toLowerCase();
    return list(db, 'mktLandingPages').some((p) => p.slug === slug && p.status === 'published') ? 'public' : null;
  }
  return null;
}
