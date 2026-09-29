import { checkSignIn, clearFailures, clientIp, loadAccounts, loadCredentials, lockedFor, recordFailure, sessionCookie } from '@/lib/auth/server';
import { authSecret } from '@/lib/auth/session-token';
import type { SessionInfo } from '@/features/lib/auth/auth';

/** POST { username, password } → sets the HttpOnly session cookie. */
export async function POST(req: Request) {
  if (!authSecret()) {
    return Response.json({ error: "Sign-in isn't set up on this server yet. Ask the administrator to set AUTH_SECRET." }, { status: 503 });
  }
  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }
  const username = typeof body.username === 'string' ? body.username.slice(0, 200) : '';
  const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
  if (!username.trim() || !password) return Response.json({ error: 'Enter your username and password.' }, { status: 400 });

  const key = `${clientIp(req)}|${username.trim().toLowerCase()}`;
  const wait = lockedFor(key);
  if (wait > 0) {
    const mins = Math.ceil(wait / 60_000);
    return Response.json({ error: `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.` }, { status: 429 });
  }

  let result;
  try {
    result = await checkSignIn(await loadAccounts(), await loadCredentials(), username, password);
  } catch (err) {
    console.error('Sign-in failed', err);
    return Response.json({ error: "Sign-in isn't available right now. Try again in a minute." }, { status: 502 });
  }
  if (!result.ok) {
    recordFailure(key);
    return Response.json({ error: result.error }, { status: 401 });
  }
  clearFailures(key);
  const a = result.account;
  const cookie = sessionCookie(a.id);
  const session: SessionInfo = { userId: a.id, name: `${a.firstName} ${a.lastName}`.trim(), role: a.role ?? '', expiresAt: cookie.expiresAt };
  return Response.json({ session }, { headers: { 'Set-Cookie': cookie.header, 'Cache-Control': 'no-store' } });
}
