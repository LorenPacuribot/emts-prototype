/**
 * Product tour state: which stop and step the guided walkthrough is on.
 *
 * Kept apart from the demo database so "Reset demo data" never loses the
 * visitor's place in the tour, and the tour never writes business records.
 * The stops themselves live in components/tour/tour-steps.ts.
 */
"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { safeStorage } from "@/features/lib/store";

export const TOUR_STORAGE_KEY = "emts-prototype-tour-v1";

interface TourState {
  active: boolean;
  stop: number;
  step: number;
  /** Stop IDs the visitor has stepped all the way through. */
  completed: string[];
  /** Demo user to switch back to after a step that asked for another role. */
  restoreUserId?: string;
  setRestore: (userId: string | undefined) => void;
  go: (stop: number, step: number) => void;
  complete: (stopId: string) => void;
  open: () => void;
  exit: () => void;
  finish: () => void;
}

export const useTour = create<TourState>()(
  persist(
    (set) => ({
      active: false,
      stop: 0,
      step: 0,
      completed: [],
      setRestore: (restoreUserId) => set({ restoreUserId }),
      go: (stop, step) => set({ active: true, stop, step }),
      complete: (stopId) => set((s) => (s.completed.includes(stopId) ? s : { completed: [...s.completed, stopId] })),
      open: () => set({ active: true }),
      exit: () => set({ active: false }),
      finish: () => set({ active: false, stop: 0, step: 0, restoreUserId: undefined }),
    }),
    { name: TOUR_STORAGE_KEY, storage: createJSONStorage(() => safeStorage) },
  ),
);

/** True when a tour was left part-way and can be resumed. */
export function canResume(s: Pick<TourState, "stop" | "step">) {
  return s.stop > 0 || s.step > 0;
}
