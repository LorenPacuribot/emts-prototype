/*
  Server side: which tracked links (CRM-M5) are paused, so the public website
  form refuses a paused link on the server, not only in the visitor's browser
  (QA C-04; spec 02: "Given a paused link, When a visitor opens it, Then the
  form does not show and no lead is created").

  With Supabase the shared copy of the app's data is the source. Without it,
  each browser keeps its own data, so signed-in staff browsers report the
  paused links to the server (PUT /api/website-form/links).
*/
import { appStateConfig } from './app-state-server';

const REPLICA_KEY = 'emts-replica-db-v2';
const memoryPaused = new Set<string>();

export function setPausedLinks(ids: string[]) {
  memoryPaused.clear();
  for (const id of ids) memoryPaused.add(id);
}

/** Paused link ids inside the replica data blob ({ collections: { trackedLinks } }). */
export function pausedIn(raw: string | null | undefined): Set<string> {
  try {
    const db = JSON.parse(raw ?? '') as { collections?: { trackedLinks?: { id?: unknown; status?: unknown }[] } };
    const links = Array.isArray(db.collections?.trackedLinks) ? db.collections!.trackedLinks! : [];
    return new Set(links.filter((l) => l.status === 'paused' && typeof l.id === 'string').map((l) => l.id as string));
  } catch {
    return new Set();
  }
}

export async function isLinkPaused(id: string | undefined): Promise<boolean> {
  if (!id) return false;
  const cfg = appStateConfig();
  if (!cfg) return memoryPaused.has(id);
  const res = await fetch(`${cfg.table}?select=value&key=eq.${REPLICA_KEY}`, { headers: cfg.headers, cache: 'no-store' });
  if (!res.ok) return false;
  const [row] = (await res.json()) as { value: string }[];
  return pausedIn(row?.value).has(id);
}
