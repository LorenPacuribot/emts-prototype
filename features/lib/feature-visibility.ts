/**
 * What the New Features panel switches on and off (dashboard, #new-features).
 *
 * - showNew: the master switch. Off hides every new feature everywhere; the
 *   prototype then looks like the live app. The rows keep their ticks, so
 *   turning it back on restores each one as it was.
 * - rows: per feature, Minimal and Complete. Complete builds on Minimal:
 *   ticking Complete ticks Minimal, unticking Minimal unticks Complete.
 * - showBadges: the green NEW badges and Minimal / Complete markers on
 *   screens. Off by default.
 *
 * Hiding is display only: nothing is deleted or changed. Saved in this
 * browser under emts-new-features; "Reset demo data" puts the defaults back.
 */
"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { safeStorage } from "@/features/lib/store";
import { FEATURE_KEYS, type FeatureKey } from "./feature-registry";

export const VISIBILITY_STORAGE_KEY = "emts-new-features";

export type Part = "minimal" | "complete";
export type Rows = Record<FeatureKey, { minimal: boolean; complete: boolean }>;

export interface VisibilityState {
  showNew: boolean;
  showBadges: boolean;
  rows: Rows;
}

export const defaultRows = (): Rows => Object.fromEntries(FEATURE_KEYS.map((k) => [k, { minimal: true, complete: false }])) as Rows;
export const defaultVisibility = (): VisibilityState => ({ showNew: true, showBadges: false, rows: defaultRows() });

/* ------------------------------ Pure rules ------------------------------ */

/** Ticking Complete also ticks Minimal. */
export function withComplete(rows: Rows, key: FeatureKey, on: boolean): Rows {
  return { ...rows, [key]: on ? { minimal: true, complete: true } : { ...rows[key], complete: false } };
}

/** Unticking Minimal also unticks Complete. */
export function withMinimal(rows: Rows, key: FeatureKey, on: boolean): Rows {
  return { ...rows, [key]: on ? { ...rows[key], minimal: true } : { minimal: false, complete: false } };
}

export const allMinimalRows = (): Rows => Object.fromEntries(FEATURE_KEYS.map((k) => [k, { minimal: true, complete: false }])) as Rows;
export const allCompleteRows = (): Rows => Object.fromEntries(FEATURE_KEYS.map((k) => [k, { minimal: true, complete: true }])) as Rows;

/**
 * Is this part of these features showing? False when the master switch is
 * off; otherwise true when any listed feature has the part on.
 */
export function isOn(state: Pick<VisibilityState, "showNew" | "rows">, keys: FeatureKey | FeatureKey[], part: Part = "minimal"): boolean {
  if (!state.showNew) return false;
  const list = Array.isArray(keys) ? keys : [keys];
  return list.some((k) => (part === "complete" ? state.rows[k]?.minimal && state.rows[k]?.complete : state.rows[k]?.minimal));
}

/** Feature 3 → 'f3'. */
export const keyForFeature = (n: number) => `f${n}` as FeatureKey;

const PREFIX_KEY: Record<string, FeatureKey> = { QB: "qb", CRM: "crm", JS: "js", RP: "rp", BK: "bk", X: "qb" };

/** 'CRM-C4' → { key: 'crm', part: 'complete' }. X items follow QuickBooks. */
export function keyForItem(id: string): { key: FeatureKey; part: Part } {
  const [prefix = "", rest = ""] = id.split("-");
  return { key: PREFIX_KEY[prefix] ?? "qb", part: rest.startsWith("C") ? "complete" : "minimal" };
}

/**
 * A gate's props, resolved to feature keys and a part. Props combine: a part
 * labelled feature={33} featureKey="bk" shows when either is on.
 */
export function gateTarget(p: { feature?: number | number[]; item?: string; featureKey?: FeatureKey | FeatureKey[]; part?: Part }): { keys: FeatureKey[]; part: Part } {
  const keys: FeatureKey[] = [];
  let part: Part = p.part ?? "minimal";
  if (p.item) {
    const t = keyForItem(p.item);
    keys.push(t.key);
    part = t.part;
  }
  if (p.featureKey) keys.push(...(Array.isArray(p.featureKey) ? p.featureKey : [p.featureKey]));
  const list = p.feature === undefined ? [] : Array.isArray(p.feature) ? p.feature : [p.feature];
  keys.push(...list.map(keyForFeature));
  return { keys: [...new Set(keys)], part };
}

/* ------------------------------ The store ------------------------------ */

interface Store extends VisibilityState {
  setShowNew: (on: boolean) => void;
  setShowBadges: (on: boolean) => void;
  setMinimal: (key: FeatureKey, on: boolean) => void;
  setComplete: (key: FeatureKey, on: boolean) => void;
  allMinimal: () => void;
  allComplete: () => void;
  reset: () => void;
}

export const useVisibility = create<Store>()(
  persist(
    (set) => ({
      ...defaultVisibility(),
      setShowNew: (showNew) => set({ showNew }),
      setShowBadges: (showBadges) => set({ showBadges }),
      setMinimal: (key, on) => set((s) => ({ rows: withMinimal(s.rows, key, on) })),
      setComplete: (key, on) => set((s) => ({ rows: withComplete(s.rows, key, on) })),
      allMinimal: () => set({ rows: allMinimalRows() }),
      allComplete: () => set({ rows: allCompleteRows() }),
      reset: () => set(defaultVisibility()),
    }),
    {
      name: VISIBILITY_STORAGE_KEY,
      storage: createJSONStorage(() => safeStorage),
      // Features added later get their default row; saved rows are kept.
      merge: (persisted, current) => {
        const saved = persisted as Partial<VisibilityState> | undefined;
        return { ...current, ...saved, rows: { ...defaultRows(), ...(saved?.rows ?? {}) } };
      },
    },
  ),
);

/** Hook form of isOn for components. */
export function useIsOn(target: { feature?: number | number[]; item?: string; featureKey?: FeatureKey | FeatureKey[]; part?: Part }): boolean {
  const showNew = useVisibility((s) => s.showNew);
  const rows = useVisibility((s) => s.rows);
  const t = gateTarget(target);
  if (!t.keys.length) return showNew;
  return isOn({ showNew, rows }, t.keys, t.part);
}

/** A filter function for lists (tabs, nav items, columns). */
export function useFeatureFilter() {
  const showNew = useVisibility((s) => s.showNew);
  const rows = useVisibility((s) => s.rows);
  return (target: { feature?: number | number[]; item?: string; featureKey?: FeatureKey | FeatureKey[]; part?: Part }) => {
    const t = gateTarget(target);
    if (!t.keys.length) return showNew;
    return isOn({ showNew, rows }, t.keys, t.part);
  };
}
