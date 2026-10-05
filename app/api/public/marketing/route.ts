/*
  Public marketing actions, run on the server against the shared data (QA,
  6 Oct). A tracked link (/r) or landing page (/lp) is open to anyone, so it
  can't save the shared copy itself (/api/state refuses it). Instead it asks
  for exactly one of these, which the server applies with the same rules the
  app uses:

    link_click      recordLinkClick (marketing-growth)
    landing_view    recordLandingView (marketing-engage)
    landing_submit  submitLandingPage (marketing-engage), 5 per hour per address

  Without Supabase there is no shared copy: the reply is { local: true } and
  the page runs the action in its own browser, as before.
*/
import { produce } from 'immer';
import type { ActionResult, Database } from '@/features/types';
import { appStateConfig } from '@/lib/app-state-server';
import { clientIp } from '@/lib/auth/server';
import { RATE_LIMIT, RateLimiter } from '@/lib/website-form';
import { recordLinkClick } from '@/features/lib/store/actions/marketing-growth';
import { recordLandingView, submitLandingPage } from '@/features/lib/store/actions/marketing-engage';

const FEATURE_KEY = 'emts-features-db-v1';
const limiter = new RateLimiter(RATE_LIMIT.max, RATE_LIMIT.windowMs);
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');

type Body = Record<string, unknown>;

function actionFor(b: Body): ((db: Database) => ActionResult<unknown>) | string {
  switch (b.action) {
    case 'link_click': {
      const via = b.via === 'qr' ? 'qr' : 'link';
      const device = b.device === 'mobile' || b.device === 'tablet' ? b.device : 'desktop';
      return (db) => recordLinkClick(db, str(b.code, 60), via, device, str(b.clickId, 80), str(b.referrer, 300) || undefined);
    }
    case 'landing_view':
      return (db) => recordLandingView(db, str(b.slug, 120));
    case 'landing_submit': {
      const raw = b.values && typeof b.values === 'object' ? (b.values as Record<string, unknown>) : {};
      const values = Object.fromEntries(Object.entries(raw).slice(0, 30).map(([k, v]) => [str(k, 60), str(v, 2000)]));
      const utm = b.utm && typeof b.utm === 'object' ? Object.fromEntries(Object.entries(b.utm as Record<string, unknown>).slice(0, 8).map(([k, v]) => [str(k, 40), str(v, 200)])) : undefined;
      return (db) => submitLandingPage(db, str(b.slug, 120), values, str(b.ref, 80), { utm });
    }
    default:
      return 'Unknown action.';
  }
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const run = actionFor(body);
  if (typeof run === 'string') return Response.json({ error: run }, { status: 400 });
  const cfg = appStateConfig();
  if (!cfg) return Response.json({ local: true });
  if (body.action === 'landing_submit' && !limiter.allow(clientIp(req), Date.now())) {
    return Response.json({ ok: false, error: 'Too many submissions. Please try again in an hour, or call us.' }, { status: 429 });
  }

  // Apply to the latest copy; if someone saved in between, read again and retry.
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await fetch(`${cfg.table}?select=value,updated_at&key=eq.${FEATURE_KEY}`, { headers: cfg.headers, cache: 'no-store' });
    if (!cur.ok) break;
    const [row] = (await cur.json()) as { value: string; updated_at: string }[];
    if (!row) return Response.json({ ok: false, error: 'This page isn\'t available.' }, { status: 404 });
    let blob: { state?: { db?: Database } };
    try {
      blob = JSON.parse(row.value);
    } catch {
      break;
    }
    if (!blob.state?.db) break;
    let result: ActionResult<unknown> = { ok: false, error: 'Action did not run' };
    const next = produce(blob.state.db, (draft) => {
      const r = run(draft as Database);
      // Copy the result out while the draft is alive; it may hold draft proxies (QA D-07).
      result = r.ok && r.value && typeof r.value === 'object' ? { ...r, value: JSON.parse(JSON.stringify(r.value)) } : r;
    });
    if (!result.ok) return Response.json(result);
    const value = JSON.stringify({ ...blob, state: { ...blob.state, db: next } });
    const stamp = new Date(Math.max(Date.now(), Date.parse(row.updated_at) + 1)).toISOString();
    const res = await fetch(`${cfg.table}?key=eq.${FEATURE_KEY}&updated_at=eq.${encodeURIComponent(row.updated_at)}`, {
      method: 'PATCH',
      headers: { ...cfg.headers, Prefer: 'return=representation' },
      body: JSON.stringify({ value, updated_at: stamp }),
    });
    if (!res.ok) break;
    const written = (await res.json().catch(() => [])) as unknown[];
    if (written.length) return Response.json(result);
  }
  return Response.json({ ok: false, error: 'We could not save that. Please try again or call us.' }, { status: 502 });
}
