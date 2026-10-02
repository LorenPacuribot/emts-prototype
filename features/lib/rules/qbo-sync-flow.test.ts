/**
 * QuickBooks sync in the store (2 Oct 2026, D1 and D3): sent on save, retries
 * on the prototype clock, Needs Attention, parent first, no duplicates,
 * Start sync gate, and the paid add-on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { produce } from "immer";
import type { ActionResult, Database, ExchangeItem, User } from "@/features/types";
import { createSeed } from "@/features/data/seed";
import {
  connectQuickBooks, disconnectQuickBooks, mapTaxRegion, needsAttentionRows, processSync, queue, reconnectQuickBooks, retryItem, setQuickBooksAddOn,
  simulateQboExpired, startQuickBooksSync, syncNow,
} from "@/features/lib/store/actions/finance";

const NOW = "2026-10-03T22:15:00.000Z"; // Saturday night: the old window was closed
const REGIONS = ["tx_austin", "tx_dallas", "tx_nashville", "tx_none"];

function run<A extends unknown[], R>(db: Database, userId: string, action: (db: Database, actor: User, ...args: A) => ActionResult<R>, ...args: A) {
  let result = { ok: false, error: "not run" } as ActionResult<R>;
  const next = produce(db, (draft) => {
    result = action(draft as Database, draft.users.find((u) => u.id === userId)!, ...args);
  });
  return { db: next, result };
}
const idOf = (r: ActionResult<unknown>) => (r.ok ? String(r.value) : "");
const item = (db: Database, id: string) => db.exchangeQueue.find((q) => q.id === id)!;
const at = (min: number) => new Date(new Date(NOW).getTime() + min * 60_000);

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(NOW)); });
afterEach(() => vi.useRealTimers());

/** Queue a fresh record (a check with a simulated QuickBooks error) and return the new item. */
function queueFailing(db: Database, failures?: number) {
  return run(db, "U-OFFICE", (d, actor) => {
    const rec = d.financeRecords.find((r) => r.id === "FIN-14")!;
    const q = queue(d, actor, rec, "Check to Sherwin-Williams", { simulateError: "503 Service Unavailable", simulateFailures: failures });
    return { ok: true, value: q.id } as ActionResult<string>;
  });
}

describe("D1 — sync on save", () => {
  it("sends a record the moment it is saved, outside the old 6 a.m.–6 p.m. window", () => {
    const r = run(createSeed(NOW), "U-OFFICE", (d, actor) => {
      const rec = d.financeRecords.find((x) => x.id === "FIN-14")!;
      return { ok: true, value: queue(d, actor, rec, "Check").id } as ActionResult<string>;
    });
    expect(item(r.db, idOf(r.result)).status).toBe("accepted");
  });

  it("retries after 1, 5, 30 and 120 minutes, then moves to Needs Attention", () => {
    let { db, result } = queueFailing(createSeed(NOW));
    const id = idOf(result);
    expect(item(db, id).status).toBe("rejected");
    expect(item(db, id).nextRetryAt).toBe(at(1).toISOString());
    // Not due yet: nothing happens.
    db = run(db, "U-OFFICE", processSync).db;
    expect(item(db, id).attempts).toHaveLength(1);
    for (const [min, next] of [[1, 6], [6, 36], [36, 156]] as const) {
      vi.setSystemTime(at(min));
      db = run(db, "U-OFFICE", processSync).db;
      expect(item(db, id).nextRetryAt).toBe(at(next).toISOString());
    }
    vi.setSystemTime(at(156));
    db = run(db, "U-OFFICE", processSync).db;
    const q = item(db, id);
    expect(q.attempts).toHaveLength(5);
    expect(q.needsAttentionAt).toBeDefined();
    expect(q.nextRetryAt).toBeUndefined();
    expect(needsAttentionRows(db).some((r) => r.key === id)).toBe(true);
    // Needs Attention › Retry is manual; a transient error clears.
    const fixed = produce(db, (d) => { item(d as Database, id).simulateFailures = 5; });
    const retried = run(fixed, "U-OFFICE", retryItem, id);
    expect(retried.result.ok).toBe(true);
    expect(item(retried.db, id).status).toBe("accepted");
    expect(needsAttentionRows(retried.db).some((r) => r.key === id)).toBe(false);
  });

  it("Sync now sends a retry straight away", () => {
    const { db, result } = queueFailing(createSeed(NOW), 1);
    const id = idOf(result);
    const r = run(db, "U-OFFICE", syncNow);
    expect(r.result.ok).toBe(true);
    expect(item(r.db, id).status).toBe("accepted");
  });

  it("never creates a duplicate on resend: the idempotency key is kept", () => {
    const { db, result } = queueFailing(createSeed(NOW), 1);
    const id = idOf(result);
    const key = item(db, id).idempotencyKey;
    const r = run(db, "U-OFFICE", syncNow);
    expect(item(r.db, id).idempotencyKey).toBe(key);
    expect(r.db.exchangeQueue.filter((q) => q.idempotencyKey === key && q.status === "accepted")).toHaveLength(1);
  });
});

describe("D1 — parent first", () => {
  it("holds an invoice until its project and customer are accepted", () => {
    const seed = produce(createSeed(NOW), (d) => {
      // A job QuickBooks has never seen, for a contact it has never seen.
      const job = d.jobs.find((j) => j.id === "JOB-2026-5")!;
      d.exchangeQueue = d.exchangeQueue.filter((q) => d.financeRecords.find((r) => r.id === q.recordId)?.jobId !== job.id);
      d.qboCustomers = (d.qboCustomers ?? []).filter((c) => c.customerId !== job.customerId);
    });
    const r = run(seed, "U-OFFICE", (d, actor) => {
      const rec = d.financeRecords.find((x) => x.jobId === "JOB-2026-5" && x.type === "invoice")!;
      const q = queue(d, actor, rec, "Invoice");
      return { ok: true, value: q.id } as ActionResult<string>;
    });
    const sent = r.db.exchangeQueue.filter((q: ExchangeItem) => q.status === "accepted" && q.queuedAt === NOW);
    expect(sent.map((q) => q.kind)).toEqual(expect.arrayContaining(["customer", "project", "invoice"]));
    const order = [...sent].sort((a, b) => a.attempts[0]!.at.localeCompare(b.attempts[0]!.at) || ["customer", "project", "invoice"].indexOf(a.kind!) - ["customer", "project", "invoice"].indexOf(b.kind!));
    expect(order.map((q) => q.kind).slice(0, 3)).toEqual(["customer", "project", "invoice"]);
  });

  it("a child waits while its parent keeps failing", () => {
    const seed = produce(createSeed(NOW), (d) => {
      const job = d.jobs.find((j) => j.id === "JOB-2026-5")!;
      d.exchangeQueue = d.exchangeQueue.filter((q) => d.financeRecords.find((r) => r.id === q.recordId)?.jobId !== job.id);
      d.qboCustomers = (d.qboCustomers ?? []).filter((c) => c.customerId !== job.customerId);
      // The customer will fail.
      d.exchangeQueue.unshift({ id: "EXQ-90", recordId: job.customerId, kind: "customer", version: 1, status: "rejected", payload: { amount: 0, description: "Customer" }, idempotencyKey: `CUS-${job.customerId}-v1`, queuedAt: NOW, queuedBy: "U-OFFICE", attempts: [{ at: NOW, ok: false, error: "503" }], nextRetryAt: at(1).toISOString(), simulateError: "503" });
    });
    const r = run(seed, "U-OFFICE", (d, actor) => {
      const rec = d.financeRecords.find((x) => x.jobId === "JOB-2026-5" && x.type === "invoice")!;
      return { ok: true, value: queue(d, actor, rec, "Invoice").id } as ActionResult<string>;
    });
    const inv = item(r.db, idOf(r.result));
    expect(inv.status).toBe("waiting");
    expect(inv.attempts).toHaveLength(0);
  });
});

describe("D1 — Start sync", () => {
  it("is blocked until every tax region is mapped, then sends contacts and jobs from the start date", () => {
    let db = produce(createSeed(NOW), (d) => { d.financeSettings.qbo.syncStart = undefined; delete d.financeSettings.qbo.taxMap!.tx_none; });
    const blocked = run(db, "U-OFFICE", startQuickBooksSync, { mode: "new_only", regionIds: REGIONS });
    expect(blocked.result).toMatchObject({ ok: false, error: "Map every tax region first" });
    db = run(db, "U-OFFICE", mapTaxRegion, "tx_none", "2200 Sales Tax Payable").db;
    const started = run(db, "U-OFFICE", startQuickBooksSync, { mode: "from_date", from: "2000-01-01", regionIds: REGIONS });
    expect(started.result.ok).toBe(true);
    expect(started.db.financeSettings.qbo.syncStart?.mode).toBe("from_date");
    expect(started.db.exchangeQueue.some((q) => q.kind === "project" && q.status === "accepted")).toBe(true);
  });

  it("does not send before sync has started", () => {
    const db = produce(createSeed(NOW), (d) => { d.financeSettings.qbo.syncStart = undefined; });
    const r = run(db, "U-OFFICE", (d, actor) => {
      const rec = d.financeRecords.find((x) => x.id === "FIN-14")!;
      return { ok: true, value: queue(d, actor, rec, "Check").id } as ActionResult<string>;
    });
    expect(item(r.db, idOf(r.result)).status).toBe("queued");
  });
});

describe("D3 — QuickBooks is a paid add-on", () => {
  it("without the add-on, nothing connects or syncs", () => {
    const off = run(produce(createSeed(NOW), (d) => { d.financeSettings.qbo.connected = false; }), "U-OWNER", setQuickBooksAddOn, false).db;
    expect(run(off, "U-OWNER", connectQuickBooks).result).toMatchObject({ ok: false, error: "Add QuickBooks to your plan." });
    expect(run(off, "U-OWNER", syncNow).result.ok).toBe(false);
  });
  it("with the add-on, the owner and the office manager connect and disconnect; the bookkeeper can't", () => {
    const db = createSeed(NOW);
    expect(run(db, "U-OWNER", disconnectQuickBooks).result.ok).toBe(true);
    expect(run(db, "U-OFFICE", disconnectQuickBooks).result.ok).toBe(true);
    expect(run(db, "U-BOOK", disconnectQuickBooks).result.ok).toBe(false);
  });
});

describe("Tab 1 — contacts and jobs are sent when saved", () => {
  /** A synced demo, then a new contact with a signed job saved after sync started. */
  function withNewContact(leadOnly = false) {
    const synced = run(createSeed(NOW), "U-OFFICE", processSync).db; // sets the baseline: what existed at the start
    return produce(synced, (d) => {
      d.customers.push({ ...d.customers[0]!, id: "C-T-1", name: "Pia Grant", email: "pia@example.com", phone: "(469) 555-0999", leadOnly: leadOnly || undefined });
      // A lead has no job or estimate yet; a contact does.
      if (!leadOnly) d.jobs.push({ ...d.jobs[0]!, id: "JOB-T-1", customerId: "C-T-1", contractSigned: true });
    });
  }
  const sent = (db: Database, kind: string, id: string) => db.exchangeQueue.filter((q) => q.kind === kind && q.recordId === id && q.status === "accepted");

  it("a new contact goes to QuickBooks as a Customer, and its job as a Project under it", () => {
    const r = run(withNewContact(), "U-OFFICE", processSync);
    expect(sent(r.db, "customer", "C-T-1")).toHaveLength(1);
    expect(sent(r.db, "project", "JOB-T-1")).toHaveLength(1);
    expect(sent(r.db, "customer", "C-T-1")[0]!.qboRef).toMatch(/^QBO-CUS-/);
  });
  it("an edited contact sends an update to the same QuickBooks customer", () => {
    let db = run(withNewContact(), "U-OFFICE", processSync).db;
    const first = sent(db, "customer", "C-T-1")[0]!;
    db = produce(db, (d) => { d.customers.find((c) => c.id === "C-T-1")!.email = "pia.grant@example.com"; });
    db = run(db, "U-OFFICE", processSync).db;
    const both = sent(db, "customer", "C-T-1");
    expect(both).toHaveLength(2);
    expect(both.every((q) => q.qboRef === first.qboRef)).toBe(true);
    // Nothing changed since: nothing more is sent.
    expect(run(db, "U-OFFICE", processSync).db.exchangeQueue.length).toBe(db.exchangeQueue.length);
  });
  it("a lead (no job or estimate yet) is never sent", () => {
    const r = run(withNewContact(true), "U-OFFICE", processSync);
    expect(r.db.exchangeQueue.some((q) => q.kind === "customer" && q.recordId === "C-T-1")).toBe(false);
  });
  it("logs the send in tab 1's words", () => {
    const r = run(withNewContact(), "U-OFFICE", processSync);
    expect(r.db.activity.map((a) => a.message).join(" | ")).toMatch(/Finance: Customer Pia Grant sent to QuickBooks as QBO-CUS-/);
  });
});

describe("Tab 1 — an expired connection pauses sync", () => {
  it("records queue while Reconnect is needed, and send once reconnected; admins are told", () => {
    let db = run(createSeed(NOW), "U-OFFICE", simulateQboExpired).db;
    expect(db.notifications?.some((n) => n.kind === "quickbooks" && n.userId === "U-OWNER")).toBe(true);
    const q = run(db, "U-OFFICE", (d, actor) => {
      const rec = d.financeRecords.find((x) => x.id === "FIN-14")!;
      return { ok: true, value: queue(d, actor, rec, "Check").id } as ActionResult<string>;
    });
    db = q.db;
    expect(item(db, idOf(q.result)).status).toBe("queued");
    expect(run(db, "U-OFFICE", syncNow).result.ok).toBe(false);
    db = run(db, "U-OFFICE", reconnectQuickBooks).db;
    expect(item(db, idOf(q.result)).status).toBe("accepted");
  });
});
