/*
  Shared demo data. The app keeps its records as a few JSON blobs in
  localStorage; when the server has Supabase configured, those same blobs are
  mirrored to the app_state table (app/api/state) so every visitor sees and
  edits one shared copy. Without Supabase everything stays browser-only.
*/

export const REMOTE_KEYS = ['emts-replica-db-v2', 'emts-features-db-v1', 'emts-bridge-tombstones-v2'] as const;
type RemoteKey = (typeof REMOTE_KEYS)[number];

export type RemoteStatus = 'shared' | 'local' | 'offline';

const SAVE_DELAY_MS = 1500;
const LOAD_TIMEOUT_MS = 10000;

// Saves are ignored until the shared copy has loaded, so a stale local copy
// written during startup can never overwrite it.
let syncing = false;
const lastSent = new Map<string, string | null>();
const pending = new Map<string, string | null>();
let timer: ReturnType<typeof setTimeout> | undefined;

const isRemoteKey = (k: string): k is RemoteKey => (REMOTE_KEYS as readonly string[]).includes(k);

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the stores fall back to memory */
  }
}

/** Loads the shared copy into localStorage. Call before the stores read it. */
export async function loadRemoteState(): Promise<RemoteStatus> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), LOAD_TIMEOUT_MS);
  try {
    const res = await fetch('/api/state', { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) return 'offline';
    const body = (await res.json()) as { enabled: boolean; entries?: Record<string, string> };
    if (!body.enabled) return 'local';
    const entries = body.entries ?? {};
    if (Object.keys(entries).length === 0) {
      // First visit to an empty database: this browser's data seeds it.
      for (const k of REMOTE_KEYS) {
        const v = readLocal(k);
        if (v !== null) pending.set(k, v);
      }
    } else {
      for (const k of REMOTE_KEYS) {
        const v = entries[k] ?? null;
        writeLocal(k, v);
        lastSent.set(k, v);
      }
    }
    syncing = true;
    if (pending.size) schedule();
    return 'shared';
  } catch {
    return 'offline';
  } finally {
    clearTimeout(t);
  }
}

/** Queues a localStorage write (null = removal) for the shared copy. */
export function remoteSave(key: string, value: string | null) {
  if (!syncing || !isRemoteKey(key)) return;
  if (!pending.has(key) && lastSent.get(key) === value) return;
  pending.set(key, value);
  schedule();
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush(), SAVE_DELAY_MS);
}

async function flush(keepalive = false) {
  timer = undefined;
  const batch = [...pending];
  pending.clear();
  for (const [key, value] of batch) {
    if (lastSent.get(key) === value) continue;
    try {
      const body = JSON.stringify({ key, value });
      const res = await fetch('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
        // keepalive requests are capped at 64 KB by browsers.
        keepalive: keepalive && body.length < 60000,
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      lastSent.set(key, value);
    } catch (err) {
      console.error('Shared data save failed; will retry on the next change.', err);
      if (!pending.has(key)) pending.set(key, value);
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (pending.size) void flush(true);
  });
}
