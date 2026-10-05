import { afterEach, describe, expect, it, vi } from 'vitest';
import { accountOf, findAccount, isPublicPath, passwordProblem, safeNext } from '@/features/lib/auth/auth';
import { checkSignIn, hashPassword, lockedFor, newCredential, recordFailure, verifyStored, type StoredCredential } from './server';
import { readCookie, signSession, verifySession } from './session-token';

const accounts = [
  accountOf({ id: 'U-OWNER', name: 'Tim Skelly', email: 'tim@estimatemaster.app', role: 'owner' }),
  accountOf({ id: 'U-OFFICE', name: 'Dana Ruiz', email: 'dana@estimatemaster.app', role: 'office_manager' }),
  { ...accountOf({ id: 'U-CREW', name: 'Luis Ortega', email: 'luis@estimatemaster.app' }), status: 'Inactive' },
];

afterEach(() => vi.unstubAllEnvs());

describe('server sign-in', () => {
  it('stores salted scrypt hashes and verifies them', async () => {
    const a = await hashPassword('a-new-password');
    const b = await hashPassword('a-new-password');
    expect(a.hash).not.toBe(b.hash);
    const cred: StoredCredential = { userId: 'U-OWNER', ...a, updatedAt: '' };
    expect(await verifyStored(cred, 'a-new-password')).toBe(true);
    expect(await verifyStored(cred, 'wrong-password')).toBe(false);
    await expect(newCredential('U-OWNER', 'short', 'U-OWNER')).rejects.toThrow();
  });

  it('signs in by first name, email or first.last, with one message for any failure', async () => {
    const cred = { userId: 'U-OWNER', ...(await hashPassword('owner-password')), updatedAt: '' };
    const creds = { 'U-OWNER': cred };
    expect((await checkSignIn(accounts, creds, 'tim', 'owner-password')).ok).toBe(true);
    expect((await checkSignIn(accounts, creds, 'TIM@estimatemaster.app', 'owner-password')).ok).toBe(true);
    expect((await checkSignIn(accounts, creds, 'tim.skelly', 'owner-password')).ok).toBe(true);
    const wrong = await checkSignIn(accounts, creds, 'tim', 'nope-nope');
    const unknown = await checkSignIn(accounts, creds, 'nobody', 'owner-password');
    expect(wrong).toEqual(unknown);
    expect(findAccount(accounts, 'luis')).toBeUndefined();
  });

  it('accepts demo passwords only while they are allowed, and never once a password is set', async () => {
    vi.stubEnv('AUTH_DEMO_PASSWORDS', 'on');
    expect((await checkSignIn(accounts, {}, 'dana', 'demo-dana')).ok).toBe(true);
    const set = { 'U-OFFICE': { userId: 'U-OFFICE', ...(await hashPassword('dana-real-pass')), updatedAt: '' } };
    expect((await checkSignIn(accounts, set, 'dana', 'demo-dana')).ok).toBe(false);
    vi.stubEnv('AUTH_DEMO_PASSWORDS', 'off');
    expect((await checkSignIn(accounts, {}, 'dana', 'demo-dana')).ok).toBe(false);
  });

  it('lets the owner in with AUTH_OWNER_PASSWORD before any password is set', async () => {
    vi.stubEnv('AUTH_DEMO_PASSWORDS', 'off');
    vi.stubEnv('AUTH_OWNER_PASSWORD', 'first-owner-password');
    expect((await checkSignIn(accounts, {}, 'tim', 'first-owner-password')).ok).toBe(true);
    expect((await checkSignIn(accounts, {}, 'dana', 'first-owner-password')).ok).toBe(false);
  });

  it('locks a username after five failures for fifteen minutes', () => {
    const key = 'ip|tim-lock-test';
    for (let i = 0; i < 5; i++) recordFailure(key, 1000);
    expect(lockedFor(key, 2000)).toBeGreaterThan(0);
    expect(lockedFor(key, 1000 + 15 * 60_000 + 1)).toBe(0);
  });
});

describe('session cookie', () => {
  const secret = 'x'.repeat(40);
  it('verifies its own signature and expiry, and rejects tampering', () => {
    const t = signSession({ uid: 'U-OWNER', iat: 0, exp: 10_000 }, secret);
    expect(verifySession(t, secret, 5_000)?.uid).toBe('U-OWNER');
    expect(verifySession(t, secret, 10_001)).toBeUndefined();
    expect(verifySession(t, 'y'.repeat(40), 5_000)).toBeUndefined();
    const [body, mac] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ uid: 'U-OWNER', iat: 0, exp: 9e15 })).toString('base64url');
    expect(verifySession(`${forged}.${mac}`, secret, 5_000)).toBeUndefined();
    expect(verifySession(`${body}.${mac}.x`, secret, 5_000)).toBeUndefined();
    expect(readCookie(`a=1; emts_session=${t}`, 'emts_session')).toBe(t);
  });
});

describe('route rules', () => {
  it('keeps customer links public and refuses off-site redirects', () => {
    expect(isPublicPath('/login')).toBe(true);
    expect(isPublicPath('/estimates/view')).toBe(true);
    expect(isPublicPath('/estimates/EST-2026-1/client-view')).toBe(true);
    expect(isPublicPath('/dashboard')).toBe(false);
    expect(safeNext('//evil.example')).toBe('/dashboard');
    expect(safeNext('/\\evil.example')).toBe('/dashboard');
    expect(safeNext('/jobs?x=1')).toBe('/jobs?x=1');
    // QA D-01: tab, newline and carriage return are dropped by browsers, turning "/\t/evil.com" into "//evil.com".
    for (const bad of ['/\t/evil.com', '/\n/evil.com', '/\r/evil.com', '/%09/evil.com'.replace('%09', '\t'), ' //evil.com', '/\u0000/evil.com', 'https://evil.com', '/login?next=/x']) {
      expect(safeNext(bad), JSON.stringify(bad)).toBe('/dashboard');
    }
    expect(safeNext('/estimates/EST-2026-1?tab=colors#section-paint-card')).toBe('/estimates/EST-2026-1?tab=colors#section-paint-card');
    expect(passwordProblem('short')).toBeDefined();
  });
});
