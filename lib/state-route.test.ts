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
