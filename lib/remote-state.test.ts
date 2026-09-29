import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

function mockServer(entries: Record<string, string> | null) {
  const puts: { key: string; value: string | null }[] = [];
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      puts.push(JSON.parse(init.body as string));
      return new Response(null, { status: 204 });
    }
    return Response.json(entries === null ? { enabled: false } : { enabled: true, entries });
  });
  vi.stubGlobal('fetch', fetchMock);
  return puts;
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

  it('ignores saves before load and debounces saves after it', async () => {
    const puts = mockServer({ 'emts-features-db-v1': 'shared' });
    const m = await load();
    m.remoteSave('emts-features-db-v1', 'early');
    await m.loadRemoteState();
    m.remoteSave('emts-features-db-v1', 'shared');
    m.remoteSave('emts-replica-db-v2', 'a');
    m.remoteSave('emts-replica-db-v2', 'b');
    m.remoteSave('some-other-key', 'x');
    await vi.runAllTimersAsync();
    expect(puts).toEqual([{ key: 'emts-replica-db-v2', value: 'b' }]);
  });

  it('seeds an empty shared database from this browser', async () => {
    store.set('emts-replica-db-v2', 'mine');
    const puts = mockServer({});
    const m = await load();
    await m.loadRemoteState();
    await vi.runAllTimersAsync();
    expect(puts).toEqual([{ key: 'emts-replica-db-v2', value: 'mine' }]);
  });

  it('stays browser-only when the server has no database configured', async () => {
    const puts = mockServer(null);
    const m = await load();
    expect(await m.loadRemoteState()).toBe('local');
    m.remoteSave('emts-replica-db-v2', 'a');
    await vi.runAllTimersAsync();
    expect(puts).toEqual([]);
  });
});
