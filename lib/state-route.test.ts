import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, PUT } from '@/app/api/state/route';
import { sessionCookie } from '@/lib/auth/server';

const feature = JSON.stringify({ state: { db: { estimates: [{ id: 'E-1', publicToken: 'tok-123' }] } } });

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://db.example');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
  // A fake app_state table: reads return both blobs, writes succeed.
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init?.method || init.method === 'GET') {
      return Response.json([
        { key: 'emts-features-db-v1', value: feature, updated_at: 'v1' },
        { key: 'emts-replica-db-v2', value: '{}', updated_at: 'v1' },
      ]);
    }
    return Response.json([{ key: 'emts-replica-db-v2', value: '{"x":1}', updated_at: 'v2' }]);
  }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const req = (headers: Record<string, string> = {}, body?: unknown) =>
  new Request('http://local/api/state', body ? { method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) } : { headers });
const staff = () => ({ cookie: sessionCookie('U-OWNER').header.split(';')[0]! });
const save = { key: 'emts-replica-db-v2', value: '{"x":1}', baseVersion: 'v1' };

describe('/api/state access', () => {
  it('refuses anonymous reads and writes', async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req({ 'x-emts-page': '/estimates/view?token=guess' }))).status).toBe(401);
    expect((await PUT(req({}, save))).status).toBe(401);
  });

  it('serves signed-in staff', async () => {
    const res = await GET(req(staff()));
    expect(res.status).toBe(200);
    expect(Object.keys((await res.json()).entries)).toContain('emts-replica-db-v2');
    expect((await PUT(req(staff(), save))).status).toBe(200);
  });

  it('serves a customer page whose link carries a valid token', async () => {
    const page = { 'x-emts-page': '/estimates/view?token=tok-123' };
    expect((await GET(req(page))).status).toBe(200);
    expect((await PUT(req(page, save))).status).toBe(200);
  });
});

describe('/api/state guests (QA, 6 Oct: X-EMTS-Page is client-sent)', () => {
  const featureDb = JSON.stringify({ state: { db: {
    estimates: [{ id: 'E-1', publicToken: 'tok-123' }],
    mktLinks: [{ id: 'L-1', code: 'FALL-IG', active: true }],
    leads: [{ id: 'LEAD-1', name: 'Private Person', phone: '2145550100' }],
    users: [{ id: 'U-OWNER', name: 'Tim', role: 'owner', email: 'tim@example.com' }],
    financeSettings: { qbo: { realm: 'R' } },
  } } });
  const replicaDb = JSON.stringify({ collections: {}, singletons: { paymentGateway: { provider: 'Stripe', apiLoginId: 'LOGIN-SECRET', transactionKey: 'KEY-SECRET' } } });
  let writes: string[] = [];
  beforeEach(() => {
    writes = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        return Response.json([
          { key: 'emts-features-db-v1', value: featureDb, updated_at: 'v1' },
          { key: 'emts-replica-db-v2', value: replicaDb, updated_at: 'v1' },
        ]);
      }
      writes.push(String(init.body));
      return Response.json([{ key: 'emts-replica-db-v2', value: '{}', updated_at: 'v2' }]);
    }));
  });

  it('a public marketing page reads a redacted, read-only copy', async () => {
    const res = await GET(req({ 'x-emts-page': '/r/FALL-IG' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.readOnly).toBe(true);
    expect(Object.keys(body.entries)).toEqual(['emts-features-db-v1']);
    const db = JSON.parse(body.entries['emts-features-db-v1']).state.db;
    expect(db.leads).toEqual([]);
    expect(db.mktLinks).toHaveLength(1);
    expect(db.users).toEqual([{ id: 'U-OWNER', name: 'Tim', role: 'owner' }]);
    expect(db.financeSettings).toBeUndefined();
  });

  it('a public marketing page can never save', async () => {
    expect((await PUT(req({ 'x-emts-page': '/r/FALL-IG' }, save))).status).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it('a customer link never sees, or changes, the payment gateway credentials', async () => {
    const got = await (await GET(req({ 'x-emts-page': '/estimates/view?token=tok-123' }))).json();
    const gw = JSON.parse(got.entries['emts-replica-db-v2']).singletons.paymentGateway;
    expect(gw.apiLoginId).toBeUndefined();
    expect(gw.transactionKey).toBeUndefined();
    const tampered = JSON.stringify({ collections: {}, singletons: { paymentGateway: { provider: 'Stripe', apiLoginId: 'ATTACKER', transactionKey: 'ATTACKER' } } });
    const res = await PUT(req({ 'x-emts-page': '/estimates/view?token=tok-123' }, { key: 'emts-replica-db-v2', value: tampered, baseVersion: 'v1' }));
    expect(res.status).toBe(200);
    const written = JSON.parse(JSON.parse(writes.at(-1)!).value).singletons.paymentGateway;
    expect(written).toMatchObject({ apiLoginId: 'LOGIN-SECRET', transactionKey: 'KEY-SECRET' });
  });

  it('staff still read everything', async () => {
    const got = await (await GET(req(staff()))).json();
    expect(JSON.parse(got.entries['emts-replica-db-v2']).singletons.paymentGateway.apiLoginId).toBe('LOGIN-SECRET');
  });
});
