"use client";
/**
 * QuickBooks sync pieces shared by the Accounting screens (2 Oct 2026, D1).
 * - SyncNowButton: sends the queue straight away; disabled while syncing.
 * - QboSyncTicker: the background sync on the prototype clock. Mounted once
 *   (FeatureShell); every 15 seconds it sends what is due, including retries
 *   whose time has come.
 * - useNeedsAttentionCount: the count badge on the Needs Attention menu item.
 */
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { act, getDb, useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { toast } from "@/features/lib/toast";
import { dueToSend } from "@/features/lib/rules/qbo-sync";
import { needsAttentionRows, processSync, syncActive, syncNow } from "@/features/lib/store/actions/finance";
import { Button } from "@/features/components/ui";

export function SyncNowButton({ size }: { size?: "sm" | "md" }) {
  const user = useCurrentUser();
  const active = useDb((d) => syncActive(d));
  const [syncing, setSyncing] = useState(false);
  if (!can(user, "finance.exchange")) return null;
  const run = () => {
    setSyncing(true);
    // A short pause so the busy state is visible; the simulated QuickBooks answers at once.
    setTimeout(() => {
      const r = act(syncNow);
      setSyncing(false);
      if (!r.ok) return;
      const v = r.value as { accepted: number; failed: number };
      if (v.failed) toast.info("Sync finished", `${v.accepted} accepted, ${v.failed} failed. Failed records retry automatically.`);
      else toast.success("Sync finished", `${v.accepted} accepted by QuickBooks.`);
    }, 700);
  };
  return (
    <Button size={size} variant="primary" disabled={syncing || !active} loading={syncing} onClick={run} title={active ? undefined : "QuickBooks sync is off. Check Settings › Accounting."}>
      <RefreshCw className="h-4 w-4" /> {syncing ? "Syncing…" : "Sync now"}
    </Button>
  );
}

export function QboSyncTicker() {
  useEffect(() => {
    const tick = () => {
      // Only call into the store when something is due, so idle ticks change nothing.
      const db = getDb();
      const at = now();
      if (syncActive(db) && db.exchangeQueue.some((q) => dueToSend(q, at))) act(processSync);
    };
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);
  return null;
}

/** Count for the Needs Attention menu item. */
export function useNeedsAttentionCount(): number {
  return useDb((d) => needsAttentionRows(d).length);
}

/** Records waiting to go: queued, waiting for a parent, or waiting for a retry. */
export function usePendingCount(): number {
  return useDb((d) => d.exchangeQueue.filter((q) => dueToSend(q, "9999", true)).length);
}

