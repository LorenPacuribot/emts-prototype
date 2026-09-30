/*
  Signed session tokens for the emts_session cookie. Server only (proxy.ts
  and the /api/auth routes both run on Node).

  token = base64url(JSON payload) + "." + base64url(HMAC-SHA256(secret, payload))
*/
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SessionPayload {
  /** User id. */
  uid: string;
  /** Issued at, ms. */
  iat: number;
  /** Expires at, ms. */
  exp: number;
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');
const sign = (data: string, secret: string) => createHmac('sha256', secret).update(data).digest('base64url');

export function signSession(p: SessionPayload, secret: string): string {
  const body = b64(JSON.stringify(p));
  return `${body}.${sign(body, secret)}`;
}

export function verifySession(token: string | undefined, secret: string | undefined, at = Date.now()): SessionPayload | undefined {
  if (!token || !secret) return undefined;
  const [body, mac, extra] = token.split('.');
  if (!body || !mac || extra !== undefined) return undefined;
  const want = Buffer.from(sign(body, secret));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return undefined;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (typeof p.uid !== 'string' || typeof p.exp !== 'number' || p.exp <= at) return undefined;
    return p;
  } catch {
    return undefined;
  }
}

/**
 * Prototype sign-in. On by default: the sign-in page is shown, but any
 * username and password get in (see app/api/auth/login). Set AUTH_MODE=real
 * to check real passwords again before real customer data is entered.
 */
export function demoLogin(): boolean {
  return process.env.AUTH_MODE?.toLowerCase() !== 'real';
}

/**
 * The signing secret. With real sign-in, production needs AUTH_SECRET (32+
 * characters); without it nobody can sign in. Development, and the prototype
 * sign-in, fall back to a fixed secret.
 */
export function authSecret(): string | undefined {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV !== 'production' || demoLogin()) return 'emts-local-development-only-secret-not-for-production';
  return undefined;
}

/** Reads one cookie from a Cookie header. */
export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}
