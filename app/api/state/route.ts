import { REMOTE_KEYS } from '@/lib/remote-state';
import { appStateConfig as config } from '@/lib/app-state-server';

// Vercel rejects request bodies over 4.5 MB.
const MAX_VALUE_CHARS = 4_000_000;

export async function GET() {
  const cfg = config();
  if (!cfg) return Response.json({ enabled: false });
  const res = await fetch(`${cfg.table}?select=key,value&key=in.(${REMOTE_KEYS.join(",")})`, { headers: cfg.headers, cache: 'no-store' });
  if (!res.ok) {
    console.error('app_state read failed', res.status, await res.text());
    return Response.json({ error: 'Could not read shared data' }, { status: 502 });
  }
  const rows = (await res.json()) as { key: string; value: string }[];
  return Response.json({ enabled: true, entries: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
}

export async function PUT(req: Request) {
  const cfg = config();
  if (!cfg) return Response.json({ error: 'Shared data is not configured' }, { status: 503 });

  let body: { key?: unknown; value?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { key, value } = body;
  if (typeof key !== 'string' || !(REMOTE_KEYS as readonly string[]).includes(key)) {
    return Response.json({ error: 'Unknown key' }, { status: 400 });
  }
  if (value !== null && typeof value !== 'string') return Response.json({ error: 'Value must be a string or null' }, { status: 400 });
  if (typeof value === 'string' && value.length > MAX_VALUE_CHARS) return Response.json({ error: 'Value too large' }, { status: 413 });

  const res =
    value === null
      ? await fetch(`${cfg.table}?key=eq.${encodeURIComponent(key)}`, { method: 'DELETE', headers: cfg.headers })
      : await fetch(cfg.table, {
          method: 'POST',
          headers: { ...cfg.headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify([{ key, value, updated_at: new Date().toISOString() }]),
        });
  if (!res.ok) {
    console.error('app_state write failed', res.status, await res.text());
    return Response.json({ error: 'Could not save shared data' }, { status: 502 });
  }
  return new Response(null, { status: 204 });
}
