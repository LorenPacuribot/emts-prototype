/*
  Public website form endpoint (patent 34). The organisation's website posts
  enquiries here. Accepted submissions wait in an inbox (app_state rows keyed
  website-inbox:<ref>, or server memory without Supabase); a signed-in app
  turns each one into a lead with submitWebsiteForm, which is idempotent by
  reference, then removes it from the inbox.

  POST   public: JSON or form data. Needs siteKey; see lib/website-form.ts.
  GET    pending submissions (the app polls this).
  DELETE ?ref=<ref> once the lead is recorded.
*/
import { randomUUID } from 'node:crypto';
import { appStateConfig } from '@/lib/app-state-server';
import { checkSubmission, DEMO_SITE_KEY, INBOX_PREFIX, RATE_LIMIT, RateLimiter, type InboxSubmission } from '@/lib/website-form';

const SITE_KEY = process.env.WEBSITE_FORM_SITE_KEY || DEMO_SITE_KEY;
// 2 Oct 2026 (D4): 5 submissions per hour per address.
const limiter = new RateLimiter(RATE_LIMIT.max, RATE_LIMIT.windowMs);
const memoryInbox = new Map<string, InboxSubmission>();

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

async function readBody(req: Request): Promise<unknown> {
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return req.json();
  if (type.includes('form')) return Object.fromEntries((await req.formData()).entries());
  return undefined;
}

export async function POST(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
  if (!limiter.allow(ip, Date.now())) {
    return Response.json({ error: 'Too many submissions. Please try again in an hour, or call us.' }, { status: 429, headers: { ...CORS, 'Retry-After': String(RATE_LIMIT.windowMs / 1000) } });
  }
  let body: unknown;
  try {
    body = await readBody(req);
  } catch {
    return Response.json({ error: 'Invalid form body.' }, { status: 400, headers: CORS });
  }
  const check = checkSubmission(body, { siteKey: SITE_KEY, now: Date.now(), newRef: () => `WEB-${randomUUID().slice(0, 13).toUpperCase()}` });
  if (!check.ok) return Response.json({ error: check.error, field: check.field }, { status: check.status, headers: CORS });
  if (check.spam) return Response.json({ received: true }, { headers: CORS });

  const sub = check.submission;
  const cfg = appStateConfig();
  if (!cfg) {
    // Same reference again replaces the waiting copy: still one lead.
    memoryInbox.set(sub.ref, sub);
  } else {
    const res = await fetch(cfg.table, {
      method: 'POST',
      headers: { ...cfg.headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{ key: INBOX_PREFIX + sub.ref, value: JSON.stringify(sub), updated_at: sub.receivedAt }]),
    });
    if (!res.ok) {
      console.error('website inbox write failed', res.status, await res.text());
      return Response.json({ error: 'We could not save your request. Please call us.' }, { status: 502, headers: CORS });
    }
  }
  return Response.json({ received: true, ref: sub.ref }, { status: 201, headers: CORS });
}

export async function GET() {
  const cfg = appStateConfig();
  if (!cfg) return Response.json({ submissions: [...memoryInbox.values()] });
  const res = await fetch(`${cfg.table}?select=value&key=like.${encodeURIComponent(INBOX_PREFIX)}*&order=updated_at.asc`, { headers: cfg.headers, cache: 'no-store' });
  if (!res.ok) return Response.json({ error: 'Could not read the website inbox' }, { status: 502 });
  const rows = (await res.json()) as { value: string }[];
  const submissions = rows.flatMap((r) => {
    try {
      return [JSON.parse(r.value) as InboxSubmission];
    } catch {
      return [];
    }
  });
  return Response.json({ submissions });
}

export async function DELETE(req: Request) {
  const ref = new URL(req.url).searchParams.get('ref');
  if (!ref) return Response.json({ error: 'ref is required' }, { status: 400 });
  const cfg = appStateConfig();
  if (!cfg) {
    memoryInbox.delete(ref);
    return new Response(null, { status: 204 });
  }
  const res = await fetch(`${cfg.table}?key=eq.${encodeURIComponent(INBOX_PREFIX + ref)}`, { method: 'DELETE', headers: cfg.headers });
  if (!res.ok) return Response.json({ error: 'Could not clear the inbox entry' }, { status: 502 });
  return new Response(null, { status: 204 });
}
