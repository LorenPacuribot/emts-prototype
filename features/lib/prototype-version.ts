/**
 * Prototype version switch (X-M1): Minimal or Complete, plus "Hide markers".
 *
 * Every item from the 30 Sep call has an ID such as CRM-M3 or CRM-C4. The
 * letter after the dash decides the version: M items always show, C items
 * show only when the Prototype bar is set to Complete. Kept apart from the
 * demo database so "Reset demo data" keeps the chosen version.
 */
"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { safeStorage } from "@/features/lib/store";

export const VERSION_STORAGE_KEY = "emts-prototype-version";

export type PrototypeVersion = "minimal" | "complete";

interface VersionState {
  version: PrototypeVersion;
  hideMarkers: boolean;
  setVersion: (version: PrototypeVersion) => void;
  setHideMarkers: (hide: boolean) => void;
}

export const useVersion = create<VersionState>()(
  persist(
    (set) => ({
      version: "minimal",
      hideMarkers: false,
      setVersion: (version) => set({ version }),
      setHideMarkers: (hideMarkers) => set({ hideMarkers }),
    }),
    { name: VERSION_STORAGE_KEY, storage: createJSONStorage(() => safeStorage) },
  ),
);

/** True for Complete items (the ID contains "-C", e.g. CRM-C4). */
export function isCompleteItem(id: string): boolean {
  return id.includes("-C");
}

/** Minimal items always show; Complete items only in the Complete version. */
export function isVisible(id: string, version: PrototypeVersion): boolean {
  return !isCompleteItem(id) || version === "complete";
}
