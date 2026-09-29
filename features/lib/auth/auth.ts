/**
 * Sign-in rules shared by the server (app/api/auth, proxy.ts) and the browser.
 *
 * Passwords are checked on the server only (lib/auth/server.ts). The browser
 * never sees a password hash; the session is an HttpOnly signed cookie that
 * page scripts can't read or forge. The browser only learns who is signed in
 * from GET /api/auth/session (features/lib/auth/client-session.ts).
 */

export const SESSION_COOKIE = "emts_session";
export const SESSION_HOURS = 12;
export const MIN_PASSWORD_LENGTH = 8;

/** Minimal account shape: a prototype team member. */
export interface AuthAccount {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role?: string;
  status?: string;
}

/** What the browser learns about the signed-in person. */
export interface SessionInfo {
  userId: string;
  name: string;
  role: string;
  expiresAt: string;
}

export function passwordProblem(password: string): string | undefined {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > 128) return "Use at most 128 characters.";
  if (/^\s|\s$/.test(password)) return "The password can't start or end with a space.";
  return undefined;
}

/** Username for an account: the first name in lower case ("tim"). */
export function usernameOf(a: Pick<AuthAccount, "firstName">): string {
  return a.firstName.trim().toLowerCase().replace(/\s+/g, "");
}

/** Splits "Tim Skelly" into an account. */
export function accountOf(u: { id: string; name: string; email?: string; role?: string }): AuthAccount {
  const [firstName = u.name, ...rest] = u.name.trim().split(/\s+/);
  return { id: u.id, firstName, lastName: rest.join(" "), email: u.email ?? "", role: u.role };
}

/** Match a typed username against email, first name, or first.last. */
export function findAccount<T extends AuthAccount>(accounts: T[], username: string): T | undefined {
  const u = username.trim().toLowerCase();
  if (!u) return undefined;
  return accounts.find((a) => {
    if (a.status === "Inactive") return false;
    const full = `${a.firstName}.${a.lastName}`.toLowerCase().replace(/\s+/g, "");
    return (a.email && a.email.toLowerCase() === u) || usernameOf(a) === u || full === u;
  });
}

/** Roles that can set other people's passwords. */
export const PASSWORD_ADMIN_ROLES = ["owner", "office_manager"];

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
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.startsWith("/login")) return "/dashboard";
  return next;
}
