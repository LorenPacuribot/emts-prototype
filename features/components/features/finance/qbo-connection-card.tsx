"use client";
/**
 * The QuickBooks card in Settings › Accounting (2 Oct 2026, D1 and D3).
 *
 * - D3: QuickBooks is a paid add-on. Without it the card is locked ("Add
 *   QuickBooks to your plan.") and has no Connect button. With it, Owner and
 *   Admin connect, disconnect and set the sync options.
 * - D1: Start sync stays disabled ("Map every tax region first") until the
 *   income account and every tax region are mapped. Then it asks: send
 *   contacts and jobs from a start date (default the first of this month),
 *   or send new records only. After that, records are sent on save.
 */
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Lock, Plug, Unplug, Wifi } from "lucide-react";
import { useCollection, useSingleton } from "@/lib/store";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { dateLong, dateTime } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { now } from "@/features/lib/clock";
import { defaultSyncStartDate, dueToSend, startSyncBlocker } from "@/features/lib/rules/qbo-sync";
import { userName } from "@/features/lib/store/helpers";
import {
  connectQuickBooks, contactMatchPending, disconnectQuickBooks, hasQuickBooksAddOn, mapTaxRegion, qboCompanyName, reconnectQuickBooks, startQuickBooksSync, syncOptions,
} from "@/features/lib/store/actions/finance";
import { Badge, Banner, Button, ConfirmDialog, Input, VersionBadge } from "@/features/components/ui";
import { SyncNowButton, useSyncing } from "./qbo-sync-parts";

export function QboConnectionCard() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const q = db.financeSettings.qbo;
  const manage = can(user, "finance.connect");
  const syncing = useSyncing();
  const [bp] = useSingleton("businessProfile");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const waiting = db.exchangeQueue.filter((x) => dueToSend(x, "9999", true)).length;

  if (!hasQuickBooksAddOn(db)) {
    return (
      <div className="mb-8 max-w-3xl rounded-2xl border border-gray-200 bg-gray-50 p-6 shadow-sm md:p-8" data-tour="qbo-locked">
        <div className="flex items-center gap-2 text-xxs font-bold uppercase tracking-widest text-gray-500"><Lock className="h-3.5 w-3.5" /> QuickBooks Online</div>
        <p className="mt-3 text-base font-semibold text-gray-900">Add QuickBooks to your plan.</p>
        <p className="mt-1 text-sm text-gray-600">QuickBooks is a paid add-on. Once it is on your plan, the owner or an admin connects it here.</p>
      </div>
    );
  }

  // States (tab 1, Component 1): Not connected, Connected, Syncing, Reconnect needed.
  const state = !q.connected ? "off" : q.expiredAt ? "expired" : syncing ? "syncing" : "on";
  const company = qboCompanyName(db);
  const banner = {
    off: { box: "border-gray-200 bg-gray-50", icon: "text-gray-400", title: "Not connected", body: "Connect QuickBooks Online to send contacts, jobs, invoices and payments as they are saved." },
    on: { box: "border-green-200 bg-green-50", icon: "text-green-600", title: "Connected", body: `${company} · connected by ${userName(db, q.connectedBy)} on ${dateLong(q.connectedAt)} · last sync ${dateTime(q.lastExchangeAt)}` },
    syncing: { box: "border-blue-200 bg-blue-50", icon: "text-blue-600", title: "Syncing", body: `${company} · sending the queue now` },
    expired: { box: "border-amber-200 bg-amber-50", icon: "text-amber-600", title: "Reconnect needed", body: `Sync is paused. ${waiting} ${waiting === 1 ? "record is" : "records are"} waiting.` },
  }[state];
  const badge = { off: <Badge tone="gray">Not connected</Badge>, on: <Badge tone="green">Connected</Badge>, syncing: <Badge tone="blue" icon={<Loader2 className="h-3 w-3 animate-spin" />}>Syncing</Badge>, expired: <Badge tone="amber">Reconnect needed</Badge> }[state];

  return (
    <div className="mb-8 max-w-3xl space-y-4" data-tour="qb-connection">
      <div className={`flex gap-3 rounded-xl border p-4 ${banner.box}`} role={state === "expired" ? "alert" : "status"}>
        {state === "expired" ? <AlertTriangle className={`h-5 w-5 shrink-0 ${banner.icon}`} /> : <CheckCircle2 className={`h-5 w-5 shrink-0 ${banner.icon}`} />}
        <div className="text-sm">
          <div className="font-bold text-gray-900">{banner.title}</div>
          <div className="text-gray-600">{banner.body}</div>
        </div>
      </div>
      <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-wrap items-center gap-2 text-xxs font-bold uppercase tracking-widest text-gray-500">QuickBooks Online {badge} <VersionBadge item="QB-M1" withNew={false} /></div>
        <p className="text-sm text-gray-600">QuickBooks owns the ledger. Estimate Master sends customers, projects, invoices and payments when they are saved, and receives bills. Nothing here moves money.</p>
        <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
          {state === "off" && manage && (
            <Button variant="primary" onClick={() => act(connectQuickBooks, bp.companyName).ok && toast.success("QuickBooks connected", bp.companyName)}><Plug className="h-4 w-4" /> Connect</Button>
          )}
          {state === "expired" && manage && (
            <Button variant="primary" onClick={() => act(reconnectQuickBooks).ok && toast.success("QuickBooks reconnected", "Waiting records are being sent.")}><Plug className="h-4 w-4" /> Reconnect</Button>
          )}
          {state !== "off" && (
            <>
              {state !== "expired" && <Button disabled={!manage} onClick={() => toast.success("Connection OK", "QuickBooks answered (simulated).")}><Wifi className="h-4 w-4" /> Test Connection</Button>}
              {manage && <Button onClick={() => setConfirmDisconnect(true)}><Unplug className="h-4 w-4" /> Disconnect</Button>}
            </>
          )}
          {!manage && <span className="self-center text-xs text-gray-500">The owner or an admin connects QuickBooks.</span>}
        </div>
        {q.connected && <StartSync manage={manage} />}
      </div>
      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Disconnect QuickBooks?"
        body={`Stop syncing with ${company}? Records already in QuickBooks stay there.`}
        confirmLabel="Disconnect"
        onConfirm={() => act(disconnectQuickBooks).ok && toast.success("QuickBooks disconnected", "Nothing is sent until it is connected again.")}
      />
    </div>
  );
}

function StartSync({ manage }: { manage: boolean }) {
  const db = useDb((d) => d);
  const regions = useCollection("taxRegions").items;
  const q = db.financeSettings.qbo;
  // Every sync option is required (income, deposit, card method, each tax region).
  const options = syncOptions(db);
  const income = options.incomeAccount;
  // QA B-02: no sync until "Match your contacts" is finished.
  const blocker = startSyncBlocker({ ...options, regionIds: regions.map((r) => r.id) }) ?? (contactMatchPending(db) ? "Finish Match your contacts below first, so no customer is created twice in QuickBooks." : undefined);
  const [mode, setMode] = useState<"from_date" | "new_only">("from_date");
  const [from, setFrom] = useState(defaultSyncStartDate(now()));
  const [edits, setEdits] = useState<Record<string, string>>({});

  return (
    <div className="space-y-4 border-t border-gray-100 pt-4" data-tour="qb-sync-options">
      <div>
        <div className="text-sm font-bold text-gray-900">Tax regions</div>
        <p className="text-xs text-gray-500">Each tax region needs its QuickBooks account before sync starts. Income account: <b>{income || "not set"}</b>, deposit account: <b>{options.depositAccount || "not set"}</b>, card payment method: <b>{options.cardMethod || "not set"}</b> (sync options below).</p>
        <div className="mt-2 space-y-1.5">
          {regions.map((r) => {
            const value = edits[r.id] ?? q.taxMap?.[r.id] ?? "";
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-40 shrink-0 text-gray-700">{r.name}</span>
                <Input value={value} disabled={!manage} placeholder="QuickBooks tax account" onChange={(e) => setEdits({ ...edits, [r.id]: e.target.value })} className="h-8 max-w-xs" aria-label={`QuickBooks account for ${r.name}`} />
                {manage && (edits[r.id] ?? q.taxMap?.[r.id] ?? "") !== (q.taxMap?.[r.id] ?? "") && (
                  <Button size="sm" onClick={() => { if (act(mapTaxRegion, r.id, value, r.name).ok) { const next = { ...edits }; delete next[r.id]; setEdits(next); toast.success(value.trim() ? "Tax region mapped" : "Tax region unmapped", r.name); } }}>Save</Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {q.syncStart ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
          <span>
            <b>Sync is on.</b> Records are sent when they are saved.{" "}
            <span className="text-gray-600">Started {dateLong(q.syncStart.at)} · {q.syncStart.mode === "from_date" ? `contacts and jobs from ${dateLong(q.syncStart.from)}` : "new records only"}.</span>
          </span>
          <SyncNowButton size="sm" />
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-gray-200 p-4">
          <div className="text-sm font-bold text-gray-900">Start sync</div>
          {blocker ? (
            <Banner tone="warn">{blocker}</Banner>
          ) : (
            <div className="space-y-2 text-sm" role="radiogroup" aria-label="What to send first">
              <label className="flex items-center gap-2">
                <input type="radio" name="sync-start" checked={mode === "from_date"} onChange={() => setMode("from_date")} />
                Send contacts and jobs from a start date
                <Input type="date" value={from} disabled={mode !== "from_date"} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40" aria-label="Start date" />
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="sync-start" checked={mode === "new_only"} onChange={() => setMode("new_only")} />
                Send new records only
              </label>
            </div>
          )}
          <Button variant="primary" disabled={!!blocker || !manage} title={blocker} onClick={() => {
            const r = act(startQuickBooksSync, { mode, from, regionIds: regions.map((x) => x.id) });
            if (r.ok) toast.success("Sync started", "Records are now sent when they are saved.");
          }}>
            Start sync
          </Button>
        </div>
      )}
    </div>
  );
}
