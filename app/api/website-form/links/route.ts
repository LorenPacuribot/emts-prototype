/*
  Tracked link status for the public website form (QA C-04).

  GET ?l=<linkId>   public: { paused } so the hosted form says it isn't taking requests.
  PUT { paused }    staff only, without Supabase: the signed-in app reports its paused links.
*/
import { appStateConfig } from '@/lib/app-state-server';
import { sessionFrom } from '@/lib/auth/server';
import { isLinkPaused, setPausedLinks } from '@/lib/tracked-link-status';

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('l') ?? undefined;
  return Response.json({ paused: await isLinkPaused(id) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: Request) {
  if (!sessionFrom(req)) return Response.json({ error: 'Sign in first.' }, { status: 401 });
  // With shared data the server reads the links itself; nothing to store.
  if (appStateConfig()) return new Response(null, { status: 204 });
  let body: { paused?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const ids = Array.isArray(body.paused) ? body.paused.filter((x): x is string => typeof x === 'string').slice(0, 500) : [];
  setPausedLinks(ids);
  return new Response(null, { status: 204 });
}
