import { clearedCookie, loadAccounts, sessionFrom } from '@/lib/auth/server';
import type { SessionInfo } from '@/features/lib/auth/auth';

/** Who is signed in (from the HttpOnly cookie), or 401. */
export async function GET(req: Request) {
  const s = sessionFrom(req);
  const headers = { 'Cache-Control': 'no-store' };
  if (!s) return Response.json({ session: null }, { status: 401, headers });
  const a = (await loadAccounts()).find((x) => x.id === s.uid && x.status !== 'Inactive');
  // Removed from the team since signing in: end the session.
  if (!a) return Response.json({ session: null }, { status: 401, headers: { ...headers, 'Set-Cookie': clearedCookie() } });
  const session: SessionInfo = { userId: a.id, name: `${a.firstName} ${a.lastName}`.trim(), role: a.role ?? '', expiresAt: new Date(s.exp).toISOString() };
  return Response.json({ session }, { headers });
}
