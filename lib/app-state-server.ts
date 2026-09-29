/* Server-only access to the Supabase app_state table (see lib/remote-state.ts). */

export function appStateConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return undefined;
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  // New-style sb_secret_ keys go in apikey only; legacy JWT keys also need Authorization.
  if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`;
  return { table: `${url.replace(/\/$/, '')}/rest/v1/app_state`, headers };
}
