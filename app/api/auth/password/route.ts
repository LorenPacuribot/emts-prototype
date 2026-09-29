import { loadAccounts, loadCredentials, newCredential, saveCredential, sessionFrom, verifyStored, checkSignIn } from '@/lib/auth/server';
import { passwordProblem, PASSWORD_ADMIN_ROLES, usernameOf } from '@/features/lib/auth/auth';

/*
  POST { userId, password, currentPassword? }
  The owner or office manager can set anyone's password. Anyone can change
  their own, after confirming their current password.
*/
export async function POST(req: Request) {
  const s = sessionFrom(req);
  if (!s) return Response.json({ error: 'Sign in again to change a password.' }, { status: 401 });
  let body: { userId?: unknown; password?: unknown; currentPassword?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }
  const userId = typeof body.userId === 'string' ? body.userId : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';

  const accounts = await loadAccounts();
  const actor = accounts.find((a) => a.id === s.uid);
  const target = accounts.find((a) => a.id === userId);
  if (!actor) return Response.json({ error: 'Sign in again to change a password.' }, { status: 401 });
  if (!target) return Response.json({ error: 'That team member no longer exists.', field: 'userId' }, { status: 404 });
  const admin = PASSWORD_ADMIN_ROLES.includes(actor.role ?? '');
  const self = actor.id === target.id;
  if (!admin && !self) return Response.json({ error: "Only the owner or office manager can set other people's passwords." }, { status: 403 });

  const problem = passwordProblem(password);
  if (problem) return Response.json({ error: problem, field: 'password' }, { status: 400 });

  const creds = await loadCredentials();
  if (self && !admin) {
    const cred = creds[target.id];
    const ok = cred ? await verifyStored(cred, current) : (await checkSignIn([target], {}, usernameOf(target), current)).ok;
    if (!ok) return Response.json({ error: 'Your current password is incorrect.', field: 'currentPassword' }, { status: 400 });
  }
  try {
    await saveCredential(await newCredential(target.id, password, actor.id));
  } catch (err) {
    console.error('Password save failed', err);
    return Response.json({ error: "The password couldn't be saved. Try again." }, { status: 502 });
  }
  return Response.json({ ok: true, updatedAt: new Date().toISOString() });
}
