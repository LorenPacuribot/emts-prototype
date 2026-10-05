/**
 * Product tour state: which feature's tour is running and which step it is on.
 *
 * There is one short tour per new feature (components/tour/feature-tours.ts),
 * started from the New Features panel or the dashboard's Feature tours card.
 * Kept apart from the demo database so "Reset demo data" never loses the
 * visitor's place, and the tour never writes business records.
 */
"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { safeStorage } from "@/features/lib/store";
import type { FeatureKey } from "@/features/lib/feature-registry";

// v2: one tour per feature (v1 was the single long tour, stop by stop).
export const TOUR_STORAGE_KEY = "emts-prototype-tour-v2";

interface TourState {
  active: boolean;
  /** The feature whose tour is open, or was left part-way. */
  feature?: FeatureKey;
  step: number;
  /** Features whose tour the visitor has finished. */
  completed: FeatureKey[];
  /** Demo user to switch back to after a step that asked for another role. */
  restoreUserId?: string;
  setRestore: (userId: string | undefined) => void;
  go: (feature: FeatureKey, step: number) => void;
  complete: (feature: FeatureKey) => void;
  exit: () => void;
  finish: () => void;
}

export const useTour = create<TourState>()(
  persist(
    (set) => ({
      active: false,
      step: 0,
      completed: [],
      setRestore: (restoreUserId) => set({ restoreUserId }),
      go: (feature, step) => set({ active: true, feature, step }),
      complete: (feature) => set((s) => (s.completed.includes(feature) ? s : { completed: [...s.completed, feature] })),
      exit: () => set({ active: false }),
      finish: () => set({ active: false, feature: undefined, step: 0, restoreUserId: undefined }),
    }),
    { name: TOUR_STORAGE_KEY, storage: createJSONStorage(() => safeStorage) },
  ),
);

/** The feature tour left part-way, if any, so it can be resumed. */
export function resumable(s: Pick<TourState, "active" | "feature" | "step">): FeatureKey | undefined {
  return !s.active && s.feature && s.step > 0 ? s.feature : undefined;
}
