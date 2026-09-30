'use client';

/*
  Local data store. There is no backend: every screen reads and writes
  through these hooks, and changes are saved to localStorage so they
  survive a page refresh. "Reset demo data" (Help & Support) restores
  lib/sampleData.ts.

  Hooks:
    useCollection('leads')        -> { items, get, add, update, remove, setAll }
    useSingleton('generalConfig') -> [value, update]
    useNextNumber()               -> (entity) => 'EST-2026-16'  (and bumps the counter)
    useLogActivity()              -> (text, entity?, id?) => void
    useDataActions()              -> { reset }
*/
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import type {
  CollectionKey, Collections, Database, DocumentNumbering, ItemOf, SingletonKey, Singletons,
} from './types';
import { createInitialDatabase } from './sampleData';
import { migrateCollections } from './migrate';
import { withNotifyBaseline } from './schedule-notify';
import { withCrmBaseline } from './crm';
import { useVisibility } from '@/features/lib/feature-visibility';
import { uid } from './utils';
import { applyOps, resetBridge, runSync, type BridgeOp } from './bridge/sync';
import { BridgeSync } from './bridge/BridgeSync';
import { getDb as getFeatureDb, useStore as useFeatureStore } from '@/features/lib/store';
import { nextNumber as featureNextNumber } from '@/features/lib/store/helpers';
import { produce } from 'immer';
import { onRemoteChange, remoteSave } from './remote-state';

// v2: core records now come from the feature prototype (lib/bridge).
const STORAGE_KEY = 'emts-replica-db-v2';

type Action =
  | { type: 'replace'; db: Database }
  | { type: 'setCollection'; key: CollectionKey; items: unknown[] }
  | { type: 'add'; key: CollectionKey; item: { id: string } ; atStart?: boolean }
  | { type: 'update'; key: CollectionKey; id: string; patch: object }
  | { type: 'remove'; key: CollectionKey; id: string }
  | { type: 'setSingleton'; key: SingletonKey; patch: unknown }
  | { type: 'bridge'; ops: BridgeOp[] };

function reducer(db: Database, a: Action): Database {
  switch (a.type) {
    case 'replace':
      return a.db;
    case 'bridge':
      return applyOps(db, a.ops);
    case 'setCollection':
      return { ...db, collections: { ...db.collections, [a.key]: a.items } };
    case 'add': {
      const list = db.collections[a.key] as { id: string }[];
      const next = a.atStart ? [a.item, ...list] : [...list, a.item];
      return { ...db, collections: { ...db.collections, [a.key]: next } };
    }
    case 'update': {
      const list = db.collections[a.key] as { id: string }[];
      const next = list.map((x) => (x.id === a.id ? { ...x, ...a.patch } : x));
      return { ...db, collections: { ...db.collections, [a.key]: next } };
    }
    case 'remove': {
      const list = db.collections[a.key] as { id: string }[];
      return { ...db, collections: { ...db.collections, [a.key]: list.filter((x) => x.id !== a.id) } };
    }
    case 'setSingleton': {
      const current = db.singletons[a.key];
      const value = typeof current === 'object' && current !== null ? { ...current, ...(a.patch as object) } : a.patch;
      return { ...db, singletons: { ...db.singletons, [a.key]: value } };
    }
  }
}

interface Ctx {
  db: Database;
  dispatch: React.Dispatch<Action>;
}

const DataContext = createContext<Ctx | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [db, dispatch] = useReducer(reducer, undefined, createInitialDatabase);
  const [ready, setReady] = useState(false);

  // Load saved data once, in the browser only, and again when the shared copy changes.
  useEffect(() => {
    const load = () => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Database;
          // Merge so new collections added in code still appear for old saves.
          const fresh = createInitialDatabase();
          const merged = {
            collections: migrateCollections({ ...fresh.collections, ...saved.collections }, fresh.collections),
            singletons: { ...fresh.singletons, ...saved.singletons },
          };
          const synced = applyOps(merged, runSync(merged, { baseline: true }));
          // Saves from before crew notifications: everyone counts as told about the schedule as it is.
          const notified = saved.collections.scheduleNotifySnapshots ? synced : withNotifyBaseline(synced);
          // Saves from before pipelines: existing sales get their Production cards, quietly.
          dispatch({ type: 'replace', db: saved.collections.productionCards ? notified : withCrmBaseline(notified) });
        } else {
          const fresh = createInitialDatabase();
          dispatch({ type: 'replace', db: withCrmBaseline(withNotifyBaseline(applyOps(fresh, runSync(fresh, { baseline: true })))) });
        }
      } catch (err) {
        /* storage blocked or corrupt: keep sample data */
        console.error(err);
      }
    };
    load();
    setReady(true);
    return onRemoteChange((c) => c.key === STORAGE_KEY && load());
  }, []);

  // Save on every change.
  useEffect(() => {
    if (!ready) return;
    const raw = JSON.stringify(db);
    remoteSave(STORAGE_KEY, raw);
    try {
      window.localStorage.setItem(STORAGE_KEY, raw);
    } catch {
      /* ignore quota / private mode */
    }
  }, [db, ready]);

  const value = useMemo(() => ({ db, dispatch }), [db]);
  if (!ready) return <div className="min-h-screen bg-gray-50" />;
  return (
    <DataContext.Provider value={value}>
      <BridgeSync />
      {children}
    </DataContext.Provider>
  );
}

function useCtx() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useCollection/useSingleton must be used inside <DataProvider>');
  return ctx;
}

/** Raw store access for the bridge (lib/bridge/BridgeSync.tsx). */
export function useStoreInternals() {
  return useCtx();
}

/** Full database, read-only. Prefer useCollection for writes. */
export function useDb(): Database {
  return useCtx().db;
}

export function useCollection<K extends CollectionKey>(key: K) {
  const { db, dispatch } = useCtx();
  const items = db.collections[key] as Collections[K];

  const get = useCallback((id?: string) => (items as ItemOf<K>[]).find((x) => (x as { id: string }).id === id), [items]);

  /** Adds a record. If it has no id, one is generated. Returns the saved record. */
  const add = useCallback(
    (item: Omit<ItemOf<K>, 'id'> & { id?: string }, opts: { atStart?: boolean } = {}) => {
      const withId = { ...item, id: item.id ?? uid(String(key)) } as ItemOf<K> & { id: string };
      dispatch({ type: 'add', key, item: withId, atStart: opts.atStart });
      return withId;
    },
    [dispatch, key],
  );
  const update = useCallback(
    (id: string, patch: Partial<ItemOf<K>>) => dispatch({ type: 'update', key, id, patch: patch as object }),
    [dispatch, key],
  );
  const remove = useCallback((id: string) => dispatch({ type: 'remove', key, id }), [dispatch, key]);
  const setAll = useCallback((next: Collections[K]) => dispatch({ type: 'setCollection', key, items: next as unknown[] }), [dispatch, key]);

  return { items, get, add, update, remove, setAll };
}

export function useSingleton<K extends SingletonKey>(key: K): [Singletons[K], (patch: Partial<Singletons[K]>) => void] {
  const { db, dispatch } = useCtx();
  const set = useCallback((patch: Partial<Singletons[K]>) => dispatch({ type: 'setSingleton', key, patch }), [dispatch, key]);
  return [db.singletons[key], set];
}

/** Current logged-in team member (Kevin Soriano in the sample data). */
export function useCurrentUser() {
  const db = useDb();
  return db.collections.team.find((t) => t.id === db.singletons.currentUserId) ?? db.collections.team[0]!;
}

/* ---------- Document numbering ---------- */

export function formatDocNumber(cfg: DocumentNumbering, serial = cfg.nextSerial, date = new Date()) {
  const n = String(serial).padStart(cfg.paddingLength || 1, '0');
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  switch (cfg.formatType) {
    case 'PREFIX_YEAR_MONTH_SERIAL':
      return `${cfg.prefix}-${yyyy}${mm}-${n}`;
    case 'PREFIX_SERIAL':
      return `${cfg.prefix}-${n}`;
    case 'CUSTOM_SERIAL':
      return `${cfg.customPrefix || cfg.prefix}-${n}`;
    default:
      return `${cfg.prefix}-${yyyy}-${n}`;
  }
}

/**
 * Prototype counter behind each core document number. Leads, estimates, jobs,
 * work orders and invoices are shared with the feature prototype (lib/bridge),
 * so a new number must be free on both sides. New records use the number as
 * their id, like the prototype does.
 */
const FEATURE_COUNTER: Partial<Record<DocumentNumbering['entityType'], string>> = {
  LEAD: 'lead', ESTIMATE: 'estimate', JOB: 'job', WORK_ORDER: 'rwo', INVOICE: 'invoice',
};

/** Returns a function that gives the next number for an entity and bumps the counter. */
export function useNextNumber() {
  const { db, dispatch } = useCtx();
  return useCallback(
    (entity: DocumentNumbering['entityType']) => {
      const cfg = db.collections.documentNumbering.find((d) => d.entityType === entity);
      if (!cfg) return `${entity}-${Date.now()}`;
      const counter = FEATURE_COUNTER[entity];
      let serial = cfg.nextSerial;
      if (counter) {
        const taken = new Set([...db.collections.leads, ...db.collections.estimates, ...db.collections.jobs, ...db.collections.workOrders, ...db.collections.invoices].map((x) => x.id));
        serial = Math.max(serial, (getFeatureDb().counters[counter] ?? 0) + 1);
        while (taken.has(formatDocNumber(cfg, serial)) || getFeatureDb().estimates.some((e) => e.id === formatDocNumber(cfg, serial))) serial++;
        const n = serial;
        useFeatureStore.setState((s) => ({ db: produce(s.db, (d) => { d.counters[counter] = Math.max(d.counters[counter] ?? 0, n - 1); featureNextNumber(d, counter); }) }));
      }
      const number = formatDocNumber(cfg, serial);
      dispatch({ type: 'update', key: 'documentNumbering', id: cfg.id, patch: { nextSerial: serial + 1 } });
      return number;
    },
    [db.collections, dispatch],
  );
}

/** Adds a line to the dashboard Activity feed. */
export function useLogActivity() {
  const { dispatch } = useCtx();
  return useCallback(
    (text: string, entity?: 'lead' | 'estimate' | 'job' | 'invoice', entityId?: string) =>
      dispatch({ type: 'add', key: 'activity', atStart: true, item: { id: uid('ac'), date: new Date().toISOString(), text, entity, entityId } as never }),
    [dispatch],
  );
}

export function useDataActions() {
  const { dispatch } = useCtx();
  return {
    /** Resets both stores (replica and feature prototype) to their demo data. */
    reset: () => {
      remoteSave(STORAGE_KEY, null);
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      resetBridge();
      useFeatureStore.getState().resetDemo();
      // The New Features panel goes back to its defaults too.
      useVisibility.getState().reset();
      const fresh = createInitialDatabase();
      dispatch({ type: 'replace', db: withCrmBaseline(withNotifyBaseline(applyOps(fresh, runSync(fresh, { baseline: true })))) });
    },
  };
}

/* ---------- Common lookups ---------- */

export function useLookups() {
  const db = useDb();
  return useMemo(() => {
    const c = db.collections;
    const byId = <T extends { id: string }>(list: T[]) => (id?: string) => (id ? list.find((x) => x.id === id) : undefined);
    return {
      customer: byId(c.customers),
      lead: byId(c.leads),
      estimate: byId(c.estimates),
      job: byId(c.jobs),
      invoice: byId(c.invoices),
      member: byId(c.team),
      paint: byId(c.paintProducts),
      brand: byId(c.brands),
      surfaceRate: byId(c.surfaceRates),
      areaTemplate: byId(c.areaTemplates),
      estimateType: byId(c.estimateTypes),
      estimateTemplate: byId(c.estimateTemplates),
      terms: byId(c.termsConditions),
      taxRegion: byId(c.taxRegions),
      discount: byId(c.projectDiscounts),
    };
  }, [db]);
}
