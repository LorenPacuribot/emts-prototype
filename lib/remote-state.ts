/*
  Shared demo data. The app keeps its records as a few JSON blobs in
  localStorage; when the server has Supabase configured, those same blobs are
  mirrored to the app_state table (app/api/state) so every visitor sees and
  edits one shared copy. Without Supabase everything stays browser-only.

  Two people editing at once: every save names the version it was based on.
  If someone else saved first, the server refuses the save and returns their
  copy; this browser merges the two record by record (lib/json-merge.ts),
  saves the merge, and tells the screens to reload. Where both changed the
  same field, their value is kept and the clash is reported.
*/
import { mergeJson, type MergeOptions } from './json-merge';

export const REMOTE_KEYS = ['emts-replica-db-v2', 'emts-features-db-v1', 'emts-bridge-tombstones-v2'] as const;
type RemoteKey = (typeof REMOTE_KEYS)[number];

export type RemoteStatus = 'shared' | 'local' | 'offline';

/** Fired after the shared copy replaced this browser's copy of `key`. */
export interface RemoteChange {
  key: RemoteKey;
  /** Fields both people changed; the other person's value was kept. */
  conflicts: string[];
  /** True when this browser's own unsaved edits were merged in. */
  merged: boolean;
}

const MERGE_OPTIONS: Record<RemoteKey, MergeOptions> = {
  'emts-replica-db-v2': {},
  // Who is viewing and the demo clock belong to each browser, not the team.
  'emts-features-db-v1': { mineWins: ['state.currentUserId', 'state.clockMode'] },
  'emts-bridge-tombstones-v2': { setArrays: true },
};

const SAVE_DELAY_MS = 1500;
const LOAD_TIMEOUT_MS = 10000;
const MAX_MERGE_RETRIES = 3;

// Saves are ignored until the shared copy has loaded, so a stale local copy
// written during startup can never overwrite it.
let syncing = false;
/** The server's copy as this browser last saw it: the base for merges. */
const base = new Map<string, { value: string | null; version: string | null }>();
const pending = new Map<string, string | null>();
const inFlight = new Set<string>();
const listeners = new Set<(c: RemoteChange) => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let flushing: Promise<void> | undefined;

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

/** Screens reload their store when the shared copy changes underneath them. */
export function onRemoteChange(fn: (c: RemoteChange) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(c: RemoteChange) {
  for (const fn of listeners) {
    try {
      fn(c);
    } catch (err) {
      console.error(err);
    }
  }
}

type StateBody = { enabled: boolean; denied?: boolean; entries?: Record<string, string>; versions?: Record<string, string> };

/** Customer pages have no staff session; their link's token is what grants access (lib/guest-access.ts). */
function pageHeader(): Record<string, string> {
  try {
    return { 'X-EMTS-Page': window.location.pathname + window.location.search };
  } catch {
    return {};
  }
}

async function fetchState(signal?: AbortSignal): Promise<StateBody | undefined> {
  const res = await fetch('/api/state', { cache: 'no-store', signal, headers: pageHeader() });
  if (res.status === 401) return { enabled: true, denied: true };
  if (!res.ok) return undefined;
  return (await res.json()) as StateBody;
}

/** Loads the shared copy into localStorage. Call before the stores read it. */
export async function loadRemoteState(): Promise<RemoteStatus> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), LOAD_TIMEOUT_MS);
  try {
    const body = await fetchState(ctrl.signal);
    if (!body) return 'offline';
    // Not signed in and no valid customer link: nothing is loaded or shared.
    if (!body.enabled || body.denied) return 'local';
    const entries = body.entries ?? {};
    const versions = body.versions ?? {};
    if (Object.keys(entries).length === 0) {
      // First visit to an empty database: this browser's data seeds it.
      for (const k of REMOTE_KEYS) {
        base.set(k, { value: null, version: null });
        const v = readLocal(k);
        if (v !== null) pending.set(k, v);
      }
    } else {
      for (const k of REMOTE_KEYS) {
        const v = entries[k] ?? null;
        writeLocal(k, v);
        base.set(k, { value: v, version: versions[k] ?? null });
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
  if (!pending.has(key) && base.get(key)?.value === value) return;
  pending.set(key, value);
  schedule();
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush(), SAVE_DELAY_MS);
}

/** Sends queued saves now. Resolves when they are done (tests, page hide). */
export function flush(keepalive = false): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = undefined;
  const run = async () => {
    const batch = [...pending];
    pending.clear();
    for (const [key, value] of batch) {
      inFlight.add(key);
      try {
        await saveKey(key as RemoteKey, value, keepalive);
      } finally {
        inFlight.delete(key);
      }
    }
  };
  flushing = (flushing ?? Promise.resolve()).then(run, run);
  return flushing;
}

async function saveKey(key: RemoteKey, value: string | null, keepalive: boolean) {
  let mine = value;
  const clashes: string[] = [];
  let merged = false;
  for (let attempt = 0; attempt <= MAX_MERGE_RETRIES; attempt++) {
    const known = base.get(key) ?? { value: null, version: null };
    if (known.value === mine) break;
    let res: Response;
    try {
      const body = JSON.stringify({ key, value: mine, baseVersion: known.version });
      res = await fetch('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...pageHeader() },
        body,
        // keepalive requests are capped at 64 KB by browsers.
        keepalive: keepalive && body.length < 60000,
      });
    } catch (err) {
      console.error('Shared data save failed; will retry on the next change.', err);
      if (!pending.has(key)) pending.set(key, mine);
      return;
    }
    if (res.ok) {
      const { version } = (await res.json().catch(() => ({}))) as { version?: string | null };
      base.set(key, { value: mine, version: version ?? null });
      break;
    }
    if (res.status !== 409) {
      console.error(`Shared data save failed (${res.status}); will retry on the next change.`);
      if (!pending.has(key)) pending.set(key, mine);
      return;
    }
    // Someone else saved first: merge their copy with this browser's edits.
    const theirs = (await res.json()) as { value: string | null; version: string | null };
    const result = mergeJson(known.value, mine, theirs.value, MERGE_OPTIONS[key]);
    base.set(key, { value: theirs.value, version: theirs.version });
    clashes.push(...result.conflicts);
    merged = true;
    // A newer local edit made while this save was in flight is merged on its own turn.
    if (pending.has(key)) {
      const later = mergeJson(mine, pending.get(key)!, result.value, MERGE_OPTIONS[key]);
      pending.set(key, later.value);
      clashes.push(...later.conflicts);
      writeLocal(key, later.value);
      emit({ key, conflicts: [...new Set(clashes)], merged });
      return;
    }
    mine = result.value;
    writeLocal(key, mine);
  }
  if (merged) emit({ key, conflicts: [...new Set(clashes)], merged });
}

/**
 * Picks up other people's saves (on focus / tab show). Keys with unsaved
 * edits here are left alone; their next save merges.
 */
export async function refreshRemoteState(): Promise<void> {
  if (!syncing) return;
  let body: StateBody | undefined;
  try {
    body = await fetchState();
  } catch {
    return;
  }
  if (!body?.enabled || body.denied) return;
  for (const k of REMOTE_KEYS) {
    const version = body.versions?.[k] ?? null;
    const value = body.entries?.[k] ?? null;
    const known = base.get(k);
    if (known && known.version === version) continue;
    if (pending.has(k) || inFlight.has(k)) continue;
    base.set(k, { value, version });
    if (readLocal(k) === value) continue;
    writeLocal(k, value);
    emit({ key: k, conflicts: [], merged: false });
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (pending.size) void flush(true);
  });
  const refresh = () => {
    if (document.visibilityState === 'visible') void refreshRemoteState();
  };
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
}
