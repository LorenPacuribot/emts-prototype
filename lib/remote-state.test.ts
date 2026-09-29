import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

type Put = { key: string; value: string | null; baseVersion: string | null };

/** A fake app_state table with the same conditional-save rule as app/api/state. */
function mockServer(entries: Record<string, string> | null) {
  const rows = new Map(Object.entries(entries ?? {}).map(([k, v]) => [k, { value: v, version: 'v0' }]));
  let n = 0;
  const puts: Put[] = [];
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const p = JSON.parse(init.body as string) as Put;
      puts.push(p);
      const cur = rows.get(p.key);
      if ((cur?.version ?? null) !== p.baseVersion) return Response.json({ value: cur?.value ?? null, version: cur?.version ?? null }, { status: 409 });
      const version = `v${++n}`;
      if (p.value === null) rows.delete(p.key);
      else rows.set(p.key, { value: p.value, version });
      return Response.json({ version: p.value === null ? null : version });
    }
    if (entries === null) return Response.json({ enabled: false });
    return Response.json({
      enabled: true,
      entries: Object.fromEntries([...rows].map(([k, r]) => [k, r.value])),
      versions: Object.fromEntries([...rows].map(([k, r]) => [k, r.version])),
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  /** Someone else saves directly. */
  const otherSaves = (key: string, value: string) => rows.set(key, { value, version: `other${++n}` });
  return { puts, rows, otherSaves };
}

async function load() {
  vi.resetModules();
  return import('./remote-state');
}

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', localStorageStub);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('remote state', () => {
  it('replaces local data with the shared copy and drops keys the copy lacks', async () => {
    store.set('emts-features-db-v1', 'stale');
    store.set('emts-bridge-tombstones-v2', '["x"]');
    mockServer({ 'emts-features-db-v1': 'shared' });
    const m = await load();
    expect(await m.loadRemoteState()).toBe('shared');
    expect(store.get('emts-features-db-v1')).toBe('shared');
    expect(store.has('emts-bridge-tombstones-v2')).toBe(false);
  });

  it('ignores saves before load and debounces saves after it, naming the base version', async () => {
    const { puts } = mockServer({ 'emts-features-db-v1': 'shared' });
    const m = await load();
    m.remoteSave('emts-features-db-v1', 'early');
    await m.loadRemoteState();
    m.remoteSave('emts-features-db-v1', 'shared');
    m.remoteSave('emts-replica-db-v2', 'a');
    m.remoteSave('emts-replica-db-v2', 'b');
    m.remoteSave('some-other-key', 'x');
    await vi.runAllTimersAsync();
    expect(puts).toEqual([{ key: 'emts-replica-db-v2', value: 'b', baseVersion: null }]);
  });

  it('seeds an empty shared database from this browser', async () => {
    store.set('emts-replica-db-v2', 'mine');
    const { puts } = mockServer({});
    const m = await load();
    await m.loadRemoteState();
    await vi.runAllTimersAsync();
    expect(puts).toEqual([{ key: 'emts-replica-db-v2', value: 'mine', baseVersion: null }]);
  });

  it('stays browser-only when the server has no database configured', async () => {
    const { puts } = mockServer(null);
    const m = await load();
    expect(await m.loadRemoteState()).toBe('local');
    m.remoteSave('emts-replica-db-v2', 'a');
    await vi.runAllTimersAsync();
    expect(puts).toEqual([]);
  });

  it('works locally and never saves when the server refuses (no sign-in, no valid link)', async () => {
    store.set('emts-replica-db-v2', 'mine');
    const puts: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => {
      if (init?.method === 'PUT') puts.push(init.body);
      return Response.json({ error: 'Sign in' }, { status: 401 });
    }));
    const m = await load();
    expect(await m.loadRemoteState()).toBe('local');
    m.remoteSave('emts-replica-db-v2', 'changed');
    await vi.runAllTimersAsync();
    expect(puts).toEqual([]);
    expect(store.get('emts-replica-db-v2')).toBe('mine');
  });

  it('merges instead of overwriting when someone else saved first', async () => {
    const baseDb = { collections: { leads: [{ id: 'L-1', stage: 'new' }, { id: 'L-2', stage: 'new' }] } };
    const { rows, otherSaves } = mockServer({ 'emts-replica-db-v2': JSON.stringify(baseDb) });
    const m = await load();
    await m.loadRemoteState();
    const changes: unknown[] = [];
    m.onRemoteChange((c) => changes.push(c));
    otherSaves('emts-replica-db-v2', JSON.stringify({ collections: { leads: [{ id: 'L-1', stage: 'new' }, { id: 'L-2', stage: 'sold' }] } }));
    m.remoteSave('emts-replica-db-v2', JSON.stringify({ collections: { leads: [{ id: 'L-1', stage: 'contacted' }, { id: 'L-2', stage: 'new' }] } }));
    await vi.runAllTimersAsync();
    const merged = { collections: { leads: [{ id: 'L-1', stage: 'contacted' }, { id: 'L-2', stage: 'sold' }] } };
    expect(JSON.parse(rows.get('emts-replica-db-v2')!.value)).toEqual(merged);
    expect(JSON.parse(store.get('emts-replica-db-v2')!)).toEqual(merged);
    expect(changes).toEqual([{ key: 'emts-replica-db-v2', conflicts: [], merged: true }]);
  });

  it("reports a clash on the same field and keeps the other person's value", async () => {
    const { rows, otherSaves } = mockServer({ 'emts-replica-db-v2': '{"leads":[{"id":"L-1","stage":"new"}]}' });
    const m = await load();
    await m.loadRemoteState();
    const changes: { conflicts: string[] }[] = [];
    m.onRemoteChange((c) => changes.push(c));
    otherSaves('emts-replica-db-v2', '{"leads":[{"id":"L-1","stage":"sold"}]}');
    m.remoteSave('emts-replica-db-v2', '{"leads":[{"id":"L-1","stage":"lost"}]}');
    await vi.runAllTimersAsync();
    expect(rows.get('emts-replica-db-v2')!.value).toBe('{"leads":[{"id":"L-1","stage":"sold"}]}');
    expect(changes[0]!.conflicts).toEqual(['leads[L-1].stage']);
  });

  it("picks up other people's saves on refresh", async () => {
    const { otherSaves } = mockServer({ 'emts-replica-db-v2': 'a' });
    const m = await load();
    await m.loadRemoteState();
    const changes: unknown[] = [];
    m.onRemoteChange((c) => changes.push(c));
    otherSaves('emts-replica-db-v2', 'b');
    await m.refreshRemoteState();
    expect(store.get('emts-replica-db-v2')).toBe('b');
    expect(changes).toEqual([{ key: 'emts-replica-db-v2', conflicts: [], merged: false }]);
  });
});
