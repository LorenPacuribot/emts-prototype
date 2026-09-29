"use client";
/**
 * Feature 19 — browser side of a live supplier connection. Talks only to this
 * app's own /api/suppliers routes; the server holds the endpoint and keys.
 */
import { useEffect } from "react";
import type { SupplierMessage, SupplierOrderPayload } from "@/features/types";
import { getDb, system, useDb } from "@/features/lib/store";
import { receiveSupplierMessage } from "@/features/lib/store/actions/supplier";
import type { LiveStatus, TransmitResult } from "./supplier-server";

const base = (supplierId: string) => `/api/suppliers/${encodeURIComponent(supplierId)}`;

export async function fetchLiveStatus(supplierId: string): Promise<LiveStatus> {
  try {
    const res = await fetch(`${base(supplierId)}/connection`, { cache: "no-store" });
    return (await res.json()) as LiveStatus;
  } catch {
    return { live: false, credentialSet: false, webhookSecretSet: false, error: "The app server could not be reached." };
  }
}

export async function sendLiveOrder(payload: SupplierOrderPayload): Promise<TransmitResult> {
  try {
    const res = await fetch(`${base(payload.supplierId)}/orders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return (await res.json()) as TransmitResult;
  } catch {
    return { ok: false, error: "The app server could not be reached. Nothing was sent." };
  }
}

const cursors = new Map<string, number>();

/** Collect waiting supplier messages once and apply them to their orders. */
export async function pollSupplierInbox(supplierId: string): Promise<number> {
  let data: { cursor: number; messages: SupplierMessage[] };
  try {
    const res = await fetch(`${base(supplierId)}/inbox?after=${cursors.get(supplierId) ?? 0}`, { cache: "no-store" });
    if (!res.ok) return 0;
    data = await res.json();
    if (!Array.isArray(data.messages)) return 0;
  } catch {
    return 0;
  }
  let applied = 0;
  for (const msg of data.messages) {
    const po = getDb().purchaseOrders.find((p) => p.id === msg.poId);
    // Only this supplier's electronically sent orders; repeats are ignored by message ID.
    if (!po || po.supplierId !== supplierId || !po.transmission || po.transmission.sandbox) continue;
    if (system(receiveSupplierMessage, msg).ok) applied += 1;
  }
  cursors.set(supplierId, data.cursor);
  return applied;
}

/**
 * While a screen showing orders is open, collect supplier replies every
 * `intervalMs` for suppliers with an open live-sent order.
 */
export function useSupplierInbox(intervalMs = 10000) {
  const db = useDb((d) => d);
  const suppliers = Array.from(new Set(
    db.purchaseOrders.filter((p) => p.transmission && !p.transmission.sandbox && !["picked_up", "cancelled"].includes(p.status)).map((p) => p.supplierId),
  )).sort().join(",");
  useEffect(() => {
    if (!suppliers) return;
    const ids = suppliers.split(",");
    const tick = () => ids.forEach((id) => void pollSupplierInbox(id));
    tick();
    const t = setInterval(tick, intervalMs);
    return () => clearInterval(t);
  }, [suppliers, intervalMs]);
}
