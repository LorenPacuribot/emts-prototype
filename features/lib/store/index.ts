/**
 * The prototype database.
 *
 * - One Zustand store holds the whole Database, saved to localStorage.
 * - Screens read with `useDb(selector)` and change data with `act(action, ...args)`.
 * - `resetDemo()` puts the clean seed data back.
 *
 * To connect a real backend later, replace `act()` with API calls. The
 * action functions in lib/store/actions/* describe exactly what each API
 * endpoint has to do.
 */
"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { produce } from "immer";
import type { ActionResult, Database, User } from "@/features/types";
import { createSeed } from "@/features/data/seed";
import { now, setClockMode, type ClockMode } from "@/features/lib/clock";
import { toast } from "@/features/lib/toast";

// Own key inside the merged replica app (the standalone prototype used emts-prototype-db-v2).
export const STORAGE_KEY = "emts-features-db-v1";

/** localStorage that never throws (private windows, blocked storage). */
const memory = new Map<string, string>();
export const safeStorage = {
  getItem: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return memory.get(k) ?? null;
    }
  },
  setItem: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      memory.set(k, v);
    }
  },
  removeItem: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      memory.delete(k);
    }
  },
};

interface StoreState {
  db: Database;
  currentUserId: string;
  clockMode: ClockMode;
  setUser: (id: string) => void;
  setClock: (mode: ClockMode) => void;
  resetDemo: () => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      db: createSeed(now()),
      currentUserId: "U-OFFICE",
      clockMode: "real",
      setUser: (id) => set({ currentUserId: id }),
      setClock: (mode) => {
        setClockMode(mode);
        set({ clockMode: mode });
      },
      resetDemo: () => {
        set({ db: createSeed(now()) });
        toast.success("Demo data reset", "All records are back to the clean demo seed.");
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => safeStorage),
      // Data saved before a release that added collections (Phase 2) gets the
      // missing ones, and their ID counters, from a fresh seed. Nothing the
      // visitor changed is overwritten.
      merge: (persisted, current) => {
        const saved = persisted as Partial<StoreState> | undefined;
        if (!saved?.db) return current;
        const seed = createSeed(now());
        return { ...current, ...saved, db: { ...seed, ...saved.db, counters: { ...seed.counters, ...saved.db.counters } } };
      },
      onRehydrateStorage: () => (state) => {
        if (state) setClockMode(state.clockMode);
      },
    },
  ),
);

export function useDb<T>(selector: (db: Database) => T): T {
  return useStore((s) => selector(s.db));
}

export function useCurrentUser(): User {
  return useStore((s) => s.db.users.find((u) => u.id === s.currentUserId) ?? s.db.users[0]);
}

export function getDb(): Database {
  return useStore.getState().db;
}

type Action<A extends unknown[], R> = (db: Database, actor: User, ...args: A) => ActionResult<R>;

/**
 * Run an action against the database as the current user.
 * Shows an error toast when the action fails (unless `silent`).
 */
export function act<A extends unknown[], R>(action: Action<A, R>, ...args: A): ActionResult<R> {
  const state = useStore.getState();
  const actor = state.db.users.find((u) => u.id === state.currentUserId)!;
  let result: ActionResult<R> = { ok: false, error: "Action did not run" };
  const next = produce(state.db, (draft) => {
    result = action(draft as Database, actor, ...args);
  });
  useStore.setState({ db: next });
  if (!result.ok) toast.error("Action blocked", result.error);
  return result;
}

/**
 * Run a system action: one with no staff actor, such as a supplier message
 * arriving over an integration. It still validates before mutating.
 */
export function system<A extends unknown[], R>(action: (db: Database, ...args: A) => ActionResult<R>, ...args: A): ActionResult<R> {
  let result: ActionResult<R> = { ok: false, error: "Action did not run" };
  const next = produce(useStore.getState().db, (draft) => {
    result = action(draft as Database, ...args);
  });
  useStore.setState({ db: next });
  return result;
}

/*
 * Note for contributors: selectors passed to useDb must return stable values
 * (a record, a primitive, or the db itself). Returning a new object or array
 * each call causes an infinite render loop. Derive lists inside the component
 * from `useDb((d) => d)` instead.
 */
