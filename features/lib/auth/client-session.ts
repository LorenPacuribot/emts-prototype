/**
 * The browser's view of the sign-in session. The session itself is an
 * HttpOnly cookie the page can't read; this asks the server who is signed in
 * (GET /api/auth/session) and keeps the answer for synchronous checks.
 */
import type { SessionInfo } from "./auth";

export const AUTH_EVENT = "emts-auth-change";

let cached: SessionInfo | null | undefined;
let inflight: Promise<SessionInfo | null> | undefined;

function announce() {
  try {
    window.dispatchEvent(new Event(AUTH_EVENT));
  } catch {
    /* not in a browser */
  }
}

function set(s: SessionInfo | null) {
  const changed = JSON.stringify(s) !== JSON.stringify(cached ?? null);
  cached = s;
  if (changed) announce();
}

/** The last known session (undefined before the first check or once expired). */
export function getSession(at = Date.now()): SessionInfo | undefined {
  if (!cached) return undefined;
  if (Date.parse(cached.expiresAt) <= at) return undefined;
  return cached;
}

/** Has the server been asked yet? */
export const sessionChecked = () => cached !== undefined;

/** Asks the server who is signed in. */
export function loadSession(): Promise<SessionInfo | null> {
  inflight ??= (async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
      const body = (await res.json().catch(() => ({}))) as { session?: SessionInfo | null };
      set(res.ok ? body.session ?? null : null);
    } catch {
      // Offline: keep what we knew.
      if (cached === undefined) set(null);
    } finally {
      inflight = undefined;
    }
    return cached ?? null;
  })();
  return inflight;
}

export type SignInResult = { ok: true; session: SessionInfo } | { ok: false; error: string };

export async function signIn(username: string, password: string): Promise<SignInResult> {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ username, password }),
    });
    const body = (await res.json().catch(() => ({}))) as { session?: SessionInfo; error?: string };
    if (!res.ok || !body.session) return { ok: false, error: body.error ?? "Sign-in failed. Try again." };
    set(body.session);
    return { ok: true, session: body.session };
  } catch {
    return { ok: false, error: "Can't reach the server. Check your connection and try again." };
  }
}

export async function signOut() {
  set(null);
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  } catch {
    /* the cookie expires on its own */
  }
}

export type PasswordResult = { ok: true } | { ok: false; error: string; field?: string };

export async function setPassword(userId: string, password: string, currentPassword?: string): Promise<PasswordResult> {
  try {
    const res = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ userId, password, currentPassword }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; field?: string };
    if (!res.ok) return { ok: false, error: body.error ?? "The password couldn't be saved.", field: body.field };
    announce();
    return { ok: true };
  } catch {
    return { ok: false, error: "Can't reach the server. Check your connection and try again." };
  }
}

/** When each person's password was last set. */
export async function passwordDates(): Promise<Record<string, { updatedAt: string }>> {
  try {
    const res = await fetch("/api/auth/accounts", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return {};
    return ((await res.json()) as { passwords?: Record<string, { updatedAt: string }> }).passwords ?? {};
  } catch {
    return {};
  }
}
