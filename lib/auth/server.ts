/*
  Server-side sign-in (patent walkthroughs, step 1: "Log in to Estimate
  Master with a valid username and password").

  - Passwords are stored as scrypt hashes on the server only: in the
    Supabase app_state table under a key the /api/state route never serves,
    or in server memory when Supabase isn't configured (local development).
  - Accounts are the prototype team (the shared feature store's users, or
    the seed team before anything has been shared).
  - A person with no password set yet can sign in with:
      · the demo password, only while demo passwords are allowed
        (AUTH_DEMO_PASSWORDS=on; on by default outside production);
      · for the owner, AUTH_OWNER_PASSWORD, so a new deployment can be
        opened without demo passwords and the owner can set the rest.
*/
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { appStateConfig } from '@/lib/app-state-server';
import { accountOf, findAccount, passwordProblem, SESSION_COOKIE, SESSION_HOURS, type AuthAccount } from '@/features/lib/auth/auth';
import { authSecret, readCookie, signSession, verifySession } from './session-token';

const scrypt = promisify(scryptCb) as (pw: string, salt: string, len: number) => Promise<Buffer>;

export const CREDENTIALS_KEY = 'emts-auth-credentials';
const FEATURE_STATE_KEY = 'emts-features-db-v1';

export interface StoredCredential {
  userId: string;
  salt: string;
  /** hex scrypt(password, salt, 64) */
  hash: string;
  updatedAt: string;
  updatedBy?: string;
}

/* ------------------------------ Hashing ------------------------------ */

export async function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: (await scrypt(password, salt, 64)).toString('hex') };
}

function hexEqual(a: string, b: string) {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

export async function verifyStored(cred: StoredCredential, password: string) {
  return hexEqual((await scrypt(password, cred.salt, 64)).toString('hex'), cred.hash);
}

/*
  Demo passwords (tim / demo-tim …), kept as salted SHA-256 hashes so the
  passwords themselves aren't in the code. Server only; never sent to the
  browser and never shown on screen.
*/
const DEMO_HASHES: Record<string, { salt: string; hash: string }> = {
  'U-OWNER': { salt: '2dc00c3b52f682e256519ffbafae8c27', hash: '666b9f44490dce46f936ce6050370445481b0dc9c21f5401d789258cb65c2aef' },
  'U-OFFICE': { salt: 'f694f9ddcdacaf7384d095f94145d421', hash: '7c832b3b289f8c818ad3a7d1fc26551e1c93bff43252b710032530659467f547' },
  'U-SENIOR': { salt: '89a22f18ddb23be297f4ffafbc4852be', hash: '44d8683ff70fbb5397a0707d319167b7de2c52bc5011ecb18c7901a8a7340d36' },
  'U-EST': { salt: '704bcdd4b8d374328001fd672fe89eea', hash: '663c8e7bd7bded24f9e0779e70ad77fddb294f1c9bca9755ea5c8ad7cc6be836' },
  'U-CREW': { salt: '8fe09984021aa47072085850238b1deb', hash: '8895a2f00e281337fbbb51e84669670cafb7abb9e2db58bb2c0760c582576010' },
  'U-BOOK': { salt: 'f4f0af9c0250171a59cebb9e540c03f5', hash: '0aebeb75366ebdb8bd95e0b023b7730b93bebb8cc60584088d9f3a021d1177ce' },
};

export function demoPasswordsAllowed() {
  const v = process.env.AUTH_DEMO_PASSWORDS?.toLowerCase();
  if (v === 'on' || v === 'true' || v === '1') return true;
  if (v === 'off' || v === 'false' || v === '0') return false;
  return process.env.NODE_ENV !== 'production';
}

function demoPasswordMatches(userId: string, password: string) {
  const d = DEMO_HASHES[userId];
  if (!d) return false;
  return hexEqual(createHash('sha256').update(`${d.salt}:${password}`).digest('hex'), d.hash);
}

function ownerPasswordMatches(password: string) {
  const want = process.env.AUTH_OWNER_PASSWORD;
  if (!want || want.length < 8) return false;
  const a = createHash('sha256').update(password).digest();
  const b = createHash('sha256').update(want).digest();
  return timingSafeEqual(a, b);
}

/* ------------------------------ Storage ------------------------------ */

// Local development without Supabase: kept in server memory until restart.
const g = globalThis as typeof globalThis & { __emtsCreds?: Record<string, StoredCredential> };

export async function loadCredentials(): Promise<Record<string, StoredCredential>> {
  const cfg = appStateConfig();
  if (!cfg) return { ...(g.__emtsCreds ?? {}) };
  const res = await fetch(`${cfg.table}?select=value&key=eq.${CREDENTIALS_KEY}`, { headers: cfg.headers, cache: 'no-store' });
  if (!res.ok) throw new Error(`Credential read failed (${res.status})`);
  const [row] = (await res.json()) as { value: string }[];
  return row ? (JSON.parse(row.value) as Record<string, StoredCredential>) : {};
}

export async function saveCredential(cred: StoredCredential) {
  const cfg = appStateConfig();
  if (!cfg) {
    g.__emtsCreds = { ...(g.__emtsCreds ?? {}), [cred.userId]: cred };
    return;
  }
  const all = { ...(await loadCredentials()), [cred.userId]: cred };
  const res = await fetch(cfg.table, {
    method: 'POST',
    headers: { ...cfg.headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ key: CREDENTIALS_KEY, value: JSON.stringify(all), updated_at: new Date().toISOString() }]),
  });
  if (!res.ok) throw new Error(`Credential save failed (${res.status})`);
}

/** The team: users in the shared feature store, else the seed team. */
export async function loadAccounts(): Promise<AuthAccount[]> {
  const cfg = appStateConfig();
  if (cfg) {
    try {
      const res = await fetch(`${cfg.table}?select=value&key=eq.${FEATURE_STATE_KEY}`, { headers: cfg.headers, cache: 'no-store' });
      if (res.ok) {
        const [row] = (await res.json()) as { value: string }[];
        const users = row ? (JSON.parse(row.value) as { state?: { db?: { users?: { id: string; name: string; email?: string; role?: string }[] } } }).state?.db?.users : undefined;
        if (users?.length) return users.map(accountOf);
      }
    } catch (err) {
      console.error('Team read failed; using the seed team.', err);
    }
  }
  const { createSeed } = await import('@/features/data/seed');
  return createSeed(new Date().toISOString()).users.map(accountOf);
}

/* ---------------------------- Rate limiting -------------------------- */

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;
const attempts = new Map<string, { fails: number; first: number }>();

export function lockedFor(key: string, at = Date.now()): number {
  const a = attempts.get(key);
  if (!a || a.fails < MAX_FAILS) return 0;
  const left = a.first + LOCK_MS - at;
  if (left <= 0) {
    attempts.delete(key);
    return 0;
  }
  return left;
}

export function recordFailure(key: string, at = Date.now()) {
  const a = attempts.get(key);
  if (!a || at - a.first > LOCK_MS) attempts.set(key, { fails: 1, first: at });
  else a.fails += 1;
}

export const clearFailures = (key: string) => attempts.delete(key);

/* ------------------------------ Sign in ------------------------------ */

export type SignInResult = { ok: true; account: AuthAccount } | { ok: false; error: string };

/** One message for an unknown user and a wrong password. */
export async function checkSignIn(accounts: AuthAccount[], creds: Record<string, StoredCredential>, username: string, password: string): Promise<SignInResult> {
  const fail = { ok: false as const, error: 'Username or password is incorrect.' };
  const account = findAccount(accounts, username);
  const cred = account ? creds[account.id] : undefined;
  // Hash even when the account is unknown so the timing is similar.
  const good = await verifyStored(cred ?? { userId: '', salt: 'x', hash: '00', updatedAt: '' }, password);
  if (!account) return fail;
  if (cred) return good ? { ok: true, account } : fail;
  if (demoPasswordsAllowed() && demoPasswordMatches(account.id, password)) return { ok: true, account };
  if (account.role === 'owner' && ownerPasswordMatches(password)) return { ok: true, account };
  return fail;
}

export async function newCredential(userId: string, password: string, updatedBy: string): Promise<StoredCredential> {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  return { userId, ...(await hashPassword(password)), updatedAt: new Date().toISOString(), updatedBy };
}

/* ------------------------------ Sessions ----------------------------- */

export function sessionFrom(req: Request) {
  return verifySession(readCookie(req.headers.get('cookie'), SESSION_COOKIE), authSecret());
}

export function sessionCookie(userId: string, at = Date.now()) {
  const secret = authSecret();
  if (!secret) throw new Error('AUTH_SECRET is not set');
  const exp = at + SESSION_HOURS * 3600_000;
  const token = signSession({ uid: userId, iat: at, exp }, secret);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return { header: `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}${secure}`, expiresAt: new Date(exp).toISOString() };
}

export function clearedCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function clientIp(req: Request) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
}
