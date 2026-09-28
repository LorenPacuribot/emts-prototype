/** Tiny toast queue (not persisted). Rendered by <Toaster /> in the shell. */
import { create } from "zustand";

export interface ToastItem {
  id: number;
  kind: "success" | "error" | "info";
  title: string;
  body?: string;
}

interface ToastState {
  items: ToastItem[];
  push: (t: Omit<ToastItem, "id">) => void;
  dismiss: (id: number) => void;
}

let seq = 0;
let successSuppressedUntil = 0;

/** Used by lib/export when the hosted demo blocks a download. */
export function suppressSuccessToast(ms = 100) {
  successSuppressedUntil = Date.now() + ms;
}

export const useToasts = create<ToastState>((set) => ({
  items: [],
  push: (t) => {
    const id = ++seq;
    set((s) => ({ items: [...s.items, { ...t, id }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), t.kind === "error" ? 6000 : 3500);
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

export const toast = {
  success: (title: string, body?: string) => {
    if (Date.now() < successSuppressedUntil) return;
    useToasts.getState().push({ kind: "success", title, body });
  },
  error: (title: string, body?: string) => useToasts.getState().push({ kind: "error", title, body }),
  info: (title: string, body?: string) => useToasts.getState().push({ kind: "info", title, body }),
};
