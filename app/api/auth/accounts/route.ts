import { loadCredentials, sessionFrom } from '@/lib/auth/server';

/** When each person's password was last set (never the hashes). Signed-in staff only. */
export async function GET(req: Request) {
  if (!sessionFrom(req)) return Response.json({ error: 'Sign in first.' }, { status: 401 });
  const creds = await loadCredentials();
  const passwords = Object.fromEntries(Object.values(creds).map((c) => [c.userId, { updatedAt: c.updatedAt }]));
  return Response.json({ passwords }, { headers: { 'Cache-Control': 'no-store' } });
}
