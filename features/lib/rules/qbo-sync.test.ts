/**
 * QuickBooks sync (2 Oct 2026, D1): sync on save, retries, parent first,
 * Start sync gate, Sync Log paging.
 */
import { describe, expect, it } from "vitest";
import {
  defaultSyncLogRange, defaultSyncStartDate, dueToSend, filterSyncLog, nextRetryAt, pageOf, parentFirst, parentKind, plainReason,
  retriesExhausted, startSyncBlocker, syncKindOf, type SyncLogRow,
} from "./qbo-sync";

const t0 = "2026-10-03T22:15:00.000Z"; // a Saturday night: no window any more

describe("D1 — retries", () => {
  it("retries after 1, 5, 30 and 120 minutes", () => {
    expect(nextRetryAt(1, t0)).toBe("2026-10-03T22:16:00.000Z");
    expect(nextRetryAt(2, t0)).toBe("2026-10-03T22:20:00.000Z");
    expect(nextRetryAt(3, t0)).toBe("2026-10-03T22:45:00.000Z");
    expect(nextRetryAt(4, t0)).toBe("2026-10-04T00:15:00.000Z");
  });
  it("moves to Needs Attention when the last retry fails", () => {
    expect(nextRetryAt(5, t0)).toBeUndefined();
    expect(retriesExhausted(4)).toBe(false);
    expect(retriesExhausted(5)).toBe(true);
  });
  it("sends queued records at any hour, and a retry only when it is due", () => {
    expect(dueToSend({ status: "queued" }, t0)).toBe(true);
    expect(dueToSend({ status: "rejected", nextRetryAt: "2026-10-03T22:16:00.000Z" }, t0)).toBe(false);
    expect(dueToSend({ status: "rejected", nextRetryAt: "2026-10-03T22:16:00.000Z" }, "2026-10-03T22:16:00.000Z")).toBe(true);
    expect(dueToSend({ status: "rejected", nextRetryAt: "2026-10-03T22:16:00.000Z" }, t0, true)).toBe(true); // Sync now
    expect(dueToSend({ status: "rejected", needsAttentionAt: t0 }, t0, true)).toBe(false);
    expect(dueToSend({ status: "accepted" }, t0, true)).toBe(false);
  });
});

describe("D1 — parent first", () => {
  it("orders Customer, Project, Invoice, Payment", () => {
    const items = [
      { kind: "payment" as const, queuedAt: "1" }, { kind: "invoice" as const, queuedAt: "1" },
      { kind: "customer" as const, queuedAt: "2" }, { kind: "project" as const, queuedAt: "1" },
    ];
    expect(parentFirst(items).map((i) => i.kind)).toEqual(["customer", "project", "invoice", "payment"]);
  });
  it("names each kind's parent", () => {
    expect(parentKind("payment")).toBe("invoice");
    expect(parentKind("invoice")).toBe("project");
    expect(parentKind("project")).toBe("customer");
    expect(parentKind("customer")).toBeUndefined();
    expect(syncKindOf("deposit")).toBe("payment");
    expect(syncKindOf("bill")).toBe("other");
  });
});

describe("D1 — Start sync gate", () => {
  it("needs the income account and every tax region mapped", () => {
    const regionIds = ["tx_austin", "tx_dallas"];
    expect(startSyncBlocker({ incomeAccount: "4000 Painting Revenue", regionIds, taxMap: { tx_austin: "2200" } })).toBe("Map every tax region first");
    expect(startSyncBlocker({ incomeAccount: "", regionIds, taxMap: { tx_austin: "2200", tx_dallas: "2200" } })).toBe("Map every tax region first");
    expect(startSyncBlocker({ incomeAccount: "4000 Painting Revenue", regionIds, taxMap: { tx_austin: "2200", tx_dallas: "2200" } })).toBeUndefined();
  });
  it("defaults the start date to the first of this month", () => {
    expect(defaultSyncStartDate("2026-10-17T12:00:00")).toBe("2026-10-01");
  });
});

describe("D1 — Sync Log", () => {
  const row = (i: number, at: string): SyncLogRow => ({ key: `r${i}`, at, kind: "invoice", emNumber: `INV-${i}`, direction: "to_qbo", result: "Accepted" });
  it("defaults to the last 7 days, newest first", () => {
    const range = defaultSyncLogRange("2026-10-10T12:00:00.000Z");
    expect(range).toEqual({ from: "2026-10-04", to: "2026-10-10" });
    const rows = filterSyncLog([row(1, "2026-10-03T09:00:00Z"), row(2, "2026-10-05T09:00:00Z"), row(3, "2026-10-09T09:00:00Z")], range.from, range.to);
    expect(rows.map((r) => r.key)).toEqual(["r3", "r2"]);
  });
  it("shows 25 rows per page", () => {
    const rows = Array.from({ length: 60 }, (_, i) => i);
    expect(pageOf(rows, 1).rows).toHaveLength(25);
    expect(pageOf(rows, 3)).toMatchObject({ pages: 3, page: 3 });
    expect(pageOf(rows, 3).rows).toHaveLength(10);
    expect(pageOf(rows, 9).page).toBe(3);
  });
  it("puts errors in plain words", () => {
    expect(plainReason("503 Service Unavailable")).toMatch(/didn't answer/);
  });
});
