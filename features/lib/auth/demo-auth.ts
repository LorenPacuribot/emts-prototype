/**
 * Demo sign-in. NOT production security.
 *
 * Everything here runs in the browser: passwords are checked against
 * salted SHA-256 hashes (Web Crypto) kept in localStorage, and the session
 * is a localStorage record. It keeps casual visitors on the sign-in screen
 * and lets the demo switch between team members; it does not protect data,
 * since anyone with the browser can read or change localStorage.
 *
 * Plaintext passwords are never stored. The seed passwords below are shown
 * as hints on the sign-in page, and only their salted hashes are kept.
 */

export interface DemoCredential {
  userId: string;
  salt: string;
  /** hex SHA-256 of `${salt}:${password}` */
  hash: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface DemoSession {
  userId: string;
  signedInAt: string;
  expiresAt: string;
}

/** Minimal account shape: a replica team member or a prototype user. */
export interface DemoAccount {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status?: string;
}

export const CREDENTIALS_KEY = "emts-demo-credentials-v1";
export const SESSION_KEY = "emts-demo-session-v1";
export const AUTH_EVENT = "emts-demo-auth-change";
export const MIN_PASSWORD_LENGTH = 8;
const SESSION_HOURS = 12;

/** Seed demo passwords (shown as hints on /login). Hashes precomputed with the same scheme. */
export const SEED_HINTS: { userId: string; username: string; password: string }[] = [
  { userId: "U-OWNER", username: "tim", password: "demo-tim" },
  { userId: "U-OFFICE", username: "dana", password: "demo-dana" },
  { userId: "U-SENIOR", username: "marcus", password: "demo-marcus" },
  { userId: "U-EST", username: "priya", password: "demo-priya" },
  { userId: "U-CREW", username: "luis", password: "demo-luis" },
  { userId: "U-BOOK", username: "grace", password: "demo-grace" },
];

const SEED_AT = "2026-01-01T00:00:00.000Z";
export const SEED_CREDENTIALS: Record<string, DemoCredential> = {
  "U-OWNER": { userId: "U-OWNER", salt: "2dc00c3b52f682e256519ffbafae8c27", hash: "666b9f44490dce46f936ce6050370445481b0dc9c21f5401d789258cb65c2aef", updatedAt: SEED_AT },
  "U-OFFICE": { userId: "U-OFFICE", salt: "f694f9ddcdacaf7384d095f94145d421", hash: "7c832b3b289f8c818ad3a7d1fc26551e1c93bff43252b710032530659467f547", updatedAt: SEED_AT },
  "U-SENIOR": { userId: "U-SENIOR", salt: "89a22f18ddb23be297f4ffafbc4852be", hash: "44d8683ff70fbb5397a0707d319167b7de2c52bc5011ecb18c7901a8a7340d36", updatedAt: SEED_AT },
  "U-EST": { userId: "U-EST", salt: "704bcdd4b8d374328001fd672fe89eea", hash: "663c8e7bd7bded24f9e0779e70ad77fddb294f1c9bca9755ea5c8ad7cc6be836", updatedAt: SEED_AT },
  "U-CREW": { userId: "U-CREW", salt: "8fe09984021aa47072085850238b1deb", hash: "8895a2f00e281337fbbb51e84669670cafb7abb9e2db58bb2c0760c582576010", updatedAt: SEED_AT },
  "U-BOOK": { userId: "U-BOOK", salt: "f4f0af9c0250171a59cebb9e540c03f5", hash: "0aebeb75366ebdb8bd95e0b023b7730b93bebb8cc60584088d9f3a021d1177ce", updatedAt: SEED_AT },
};

/* ----------------------------- Hashing ----------------------------- */

const toHex = (buf: ArrayBuffer | Uint8Array) => Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

export function makeSalt(bytes = 16): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return toHex(a);
}

/** hex SHA-256 of `${salt}:${password}` using Web Crypto. */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  return toHex(await crypto.subtle.digest("SHA-256", data));
}

/** Constant-time string comparison (same length hex strings). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function passwordProblem(password: string): string | undefined {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > 128) return "Use at most 128 characters.";
  if (/^\s|\s$/.test(password)) return "The password can't start or end with a space.";
  return undefined;
}

export async function createCredential(userId: string, password: string, updatedBy?: string, salt = makeSalt()): Promise<DemoCredential> {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  return { userId, salt, hash: await hashPassword(password, salt), updatedAt: new Date().toISOString(), updatedBy };
}

export async function verifyPassword(cred: DemoCredential | undefined, password: string): Promise<boolean> {
  if (!cred) return false;
  return safeEqual(await hashPassword(password, cred.salt), cred.hash);
}

/* ----------------------------- Accounts ---------------------------- */

/** Username for an account: the first name in lower case ("tim"). */
export function usernameOf(a: Pick<DemoAccount, "firstName">): string {
  return a.firstName.trim().toLowerCase().replace(/\s+/g, "");
}

/** Match a typed username against email, first name, or first.last. */
export function findAccount<T extends DemoAccount>(accounts: T[], username: string): T | undefined {
  const u = username.trim().toLowerCase();
  if (!u) return undefined;
  return accounts.find((a) => {
    if (a.status === "Inactive") return false;
    const full = `${a.firstName}.${a.lastName}`.toLowerCase().replace(/\s+/g, "");
    return a.email.toLowerCase() === u || usernameOf(a) === u || full === u;
  });
}

export type SignInResult = { ok: true; account: DemoAccount } | { ok: false; error: string };

/** Same message for an unknown user and a wrong password. */
export async function checkSignIn<T extends DemoAccount>(accounts: T[], creds: Record<string, DemoCredential>, username: string, password: string): Promise<SignInResult> {
  const account = findAccount(accounts, username);
  const cred = account ? creds[account.id] : undefined;
  // Hash even when the account is unknown so the timing is similar.
  const good = await verifyPassword(cred ?? { userId: "", salt: "x", hash: "0".repeat(64), updatedAt: "" }, password);
  if (!account || !cred || !good) return { ok: false, error: "Username or password is incorrect." };
  return { ok: true, account };
}

/* ----------------------------- Storage ----------------------------- */

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked */
  }
  try {
    window.dispatchEvent(new Event(AUTH_EVENT));
  } catch {
    /* not in a browser */
  }
}

/** Seeded credentials overlaid with the ones set in Settings → Team Access. */
export function loadCredentials(): Record<string, DemoCredential> {
  return { ...SEED_CREDENTIALS, ...(read<Record<string, DemoCredential>>(CREDENTIALS_KEY) ?? {}) };
}

export function saveCredential(cred: DemoCredential) {
  const saved = read<Record<string, DemoCredential>>(CREDENTIALS_KEY) ?? {};
  write(CREDENTIALS_KEY, { ...saved, [cred.userId]: cred });
}

export function getSession(at = Date.now()): DemoSession | undefined {
  const s = read<DemoSession>(SESSION_KEY);
  if (!s || typeof s.userId !== "string") return undefined;
  if (Date.parse(s.expiresAt) <= at) return undefined;
  return s;
}

export function startSession(userId: string, at = Date.now()): DemoSession {
  const s = { userId, signedInAt: new Date(at).toISOString(), expiresAt: new Date(at + SESSION_HOURS * 3600_000).toISOString() };
  write(SESSION_KEY, s);
  return s;
}

export function endSession() {
  write(SESSION_KEY, undefined);
}

/* ----------------------------- Route guard ------------------------- */

/** Pages anyone can open without signing in. */
export function isPublicPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/login") return true;
  if (/^\/(api|lp|r|passport)(\/|$)/.test(p)) return true;
  if (p === "/paint-record/view" || p.startsWith("/paint-record/view/")) return true;
  if (p === "/estimates/view" || p.startsWith("/estimates/view/")) return true;
  if (p === "/website-form") return true;
  if (/\/client-view$/.test(p)) return true;
  return false;
}

/** Only same-app relative paths are accepted as the post-login destination. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/login")) return "/dashboard";
  return next;
}
