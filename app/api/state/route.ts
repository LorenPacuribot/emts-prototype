import { REMOTE_KEYS } from '@/lib/remote-state';
import { appStateConfig as config } from '@/lib/app-state-server';

// Vercel rejects request bodies over 4.5 MB.
const MAX_VALUE_CHARS = 4_000_000;

type Row = { key: string; value: string; updated_at: string };

export async function GET() {
  const cfg = config();
  if (!cfg) return Response.json({ enabled: false });
  const res = await fetch(`${cfg.table}?select=key,value,updated_at&key=in.(${REMOTE_KEYS.join(",")})`, { headers: cfg.headers, cache: 'no-store' });
  if (!res.ok) {
    console.error('app_state read failed', res.status, await res.text());
    return Response.json({ error: 'Could not read shared data' }, { status: 502 });
  }
  const rows = (await res.json()) as Row[];
  return Response.json({
    enabled: true,
    entries: Object.fromEntries(rows.map((r) => [r.key, r.value])),
    versions: Object.fromEntries(rows.map((r) => [r.key, r.updated_at])),
  });
}

/*
  Saves are conditional: the browser sends the version it last loaded
  (baseVersion). If someone else saved since, nothing is written and the
  reply is 409 with their copy, so the browser can merge instead of
  overwriting their work (lib/json-merge.ts).
*/
export async function PUT(req: Request) {
  const cfg = config();
  if (!cfg) return Response.json({ error: 'Shared data is not configured' }, { status: 503 });

  let body: { key?: unknown; value?: unknown; baseVersion?: unknown };
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
  const legacy = !('baseVersion' in body);
  const base = body.baseVersion;
  if (!legacy && base !== null && typeof base !== 'string') return Response.json({ error: 'baseVersion must be a string or null' }, { status: 400 });

  const byKey = `key=eq.${encodeURIComponent(key)}`;
  const onBase = typeof base === 'string' ? `&updated_at=eq.${encodeURIComponent(base)}` : '';
  const returning = { ...cfg.headers, Prefer: 'return=representation' };
  // Always move the version forward, even for two saves in the same millisecond.
  const stamp = new Date(Math.max(Date.now(), typeof base === 'string' ? Date.parse(base) + 1 || 0 : 0)).toISOString();

  let res: Response;
  if (legacy) {
    // A tab opened before this release: keep its old last-save-wins behaviour.
    res =
      value === null
        ? await fetch(`${cfg.table}?${byKey}`, { method: 'DELETE', headers: returning })
        : await fetch(cfg.table, {
            method: 'POST',
            headers: { ...cfg.headers, Prefer: 'resolution=merge-duplicates,return=representation' },
            body: JSON.stringify([{ key, value, updated_at: stamp }]),
          });
  } else if (value === null) {
    res = await fetch(`${cfg.table}?${byKey}${onBase}`, { method: 'DELETE', headers: returning });
  } else if (typeof base === 'string') {
    res = await fetch(`${cfg.table}?${byKey}${onBase}`, { method: 'PATCH', headers: returning, body: JSON.stringify({ value, updated_at: stamp }) });
  } else {
    // No base: only create the row if nobody else has.
    res = await fetch(cfg.table, {
      method: 'POST',
      headers: { ...cfg.headers, Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify([{ key, value, updated_at: stamp }]),
    });
  }
  if (!res.ok) {
    console.error('app_state write failed', res.status, await res.text());
    return Response.json({ error: 'Could not save shared data' }, { status: 502 });
  }
  const written = (await res.json().catch(() => [])) as Row[];
  if (written.length > 0 || legacy) {
    return Response.json({ version: value === null ? null : (written[0]?.updated_at ?? stamp) });
  }

  // Nothing matched the base version: someone else saved first (or it was already gone).
  const cur = await fetch(`${cfg.table}?select=value,updated_at&${byKey}`, { headers: cfg.headers, cache: 'no-store' });
  if (!cur.ok) return Response.json({ error: 'Could not read shared data' }, { status: 502 });
  const [row] = (await cur.json()) as Row[];
  if (!row && value === null) return Response.json({ version: null });
  return Response.json({ error: 'Someone else saved first', value: row?.value ?? null, version: row?.updated_at ?? null }, { status: 409 });
}
