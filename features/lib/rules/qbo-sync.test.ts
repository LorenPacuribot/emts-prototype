/**
 * QuickBooks sync (2 Oct 2026, D1): sync on save, retries, parent first,
 * Start sync gate, Sync Log paging.
 */
import { describe, expect, it } from "vitest";
import {
  customerFingerprint, defaultSyncLogRange, defaultSyncStartDate, dueToSend, filterSyncLog, nextRetryAt, pageOf, parentFirst, parentKind, plainReason,
  qboLogText, retentionStart, retriesExhausted, startSyncBlocker, syncKindOf, type SyncLogRow,
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
  const all = { incomeAccount: "4000 Painting Revenue", depositAccount: "1050 Undeposited Funds", cardMethod: "Credit Card" };
  const regionIds = ["tx_austin", "tx_dallas"];
  const mapped = { tx_austin: "2200", tx_dallas: "2200" };
  it("is disabled with \"Map every tax region first\" until every tax region is mapped", () => {
    expect(startSyncBlocker({ ...all, regionIds, taxMap: { tx_austin: "2200" } })).toBe("Map every tax region first");
  });
  it("needs every sync option: income account, deposit account and card payment method", () => {
    expect(startSyncBlocker({ ...all, incomeAccount: "", regionIds, taxMap: mapped })).toMatch(/income account, deposit account and card payment method/);
    expect(startSyncBlocker({ ...all, depositAccount: undefined, regionIds, taxMap: mapped })).toBeDefined();
    expect(startSyncBlocker({ ...all, cardMethod: " ", regionIds, taxMap: mapped })).toBeDefined();
    expect(startSyncBlocker({ ...all, regionIds, taxMap: mapped })).toBeUndefined();
  });
  it("defaults the start date to the first of this month", () => {
    expect(defaultSyncStartDate("2026-10-17T12:00:00")).toBe("2026-10-01");
  });
});

describe("D1 — Sync Log", () => {
  const row = (i: number, at: string, p: Partial<SyncLogRow> = {}): SyncLogRow => ({ key: `r${i}`, at, kind: "invoice", emNumber: `INV-${i}`, direction: "to_qbo", result: "Sent", ...p });
  it("defaults to the last 7 days, newest first", () => {
    const range = defaultSyncLogRange("2026-10-10T12:00:00.000Z");
    expect(range).toEqual({ from: "2026-10-04", to: "2026-10-10" });
    const rows = filterSyncLog([row(1, "2026-10-03T09:00:00Z"), row(2, "2026-10-05T09:00:00Z"), row(3, "2026-10-09T09:00:00Z")], range);
    expect(rows.map((r) => r.key)).toEqual(["r3", "r2"]);
  });
  it("filters by record type and result (Sent, Updated, Received, Failed)", () => {
    const rows = [row(1, "2026-10-05T09:00:00Z"), row(2, "2026-10-05T10:00:00Z", { kind: "payment", result: "Received" }), row(3, "2026-10-05T11:00:00Z", { result: "Failed" })];
    expect(filterSyncLog(rows, { kind: "payment" }).map((r) => r.key)).toEqual(["r2"]);
    expect(filterSyncLog(rows, { result: "Failed" }).map((r) => r.key)).toEqual(["r3"]);
  });
  it("keeps 12 months", () => {
    expect(retentionStart("2026-10-10T12:00:00.000Z")).toBe("2025-10-10");
    const rows = [row(1, "2025-09-01T09:00:00Z"), row(2, "2026-01-05T09:00:00Z")];
    expect(filterSyncLog(rows, { from: "2020-01-01", nowIso: "2026-10-10T12:00:00.000Z" }).map((r) => r.key)).toEqual(["r2"]);
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

describe("Tab 1 — activity log strings, word for word", () => {
  it("writes each line as tab 1 lists it", () => {
    expect(qboLogText.connect("Technologia", "Tim Skelly", "10/2/2026, 9:00 AM")).toBe("Finance: QuickBooks Online company Technologia connected by Tim Skelly at 10/2/2026, 9:00 AM.");
    expect(qboLogText.disconnect("Tim Skelly", "T")).toBe("Finance: QuickBooks Online disconnected by Tim Skelly at T.");
    expect(qboLogText.options("Tim Skelly", "Payments deposit to", "1000", "1050")).toBe("Finance: QuickBooks sync options changed by Tim Skelly: Payments deposit to from 1000 to 1050.");
    expect(qboLogText.sent("Invoice", "INV-2026-118", "QBO-INV-1")).toBe("Finance: Invoice INV-2026-118 sent to QuickBooks as QBO-INV-1.");
    expect(qboLogText.failed("Customer", "Beth Carver", 5, "Busy")).toBe("Finance: Customer Beth Carver failed to sync after 5 attempts. Reason: Busy.");
    expect(qboLogText.variance("INV-2026-112", "$2,000.00", "$1,950.00")).toBe("Finance: Invoice INV-2026-112 amount changed in QuickBooks from $2,000.00 to $1,950.00.");
    expect(qboLogText.deleted("QBO-CHK-1", "Check", "Check 1188")).toBe("Finance: QuickBooks record QBO-CHK-1 reported deleted. Check Check 1188 flagged for review.");
    expect(qboLogText.review("Hannah Brooks", "created as contact", "Tim Skelly")).toBe("Finance: QuickBooks Customer Hannah Brooks created as contact by Tim Skelly.");
  });
  it("spots a contact edit by name, email or phone", () => {
    const a = customerFingerprint({ name: "Ann Lee", email: "Ann@x.co", phone: "(214) 555-0100" });
    expect(customerFingerprint({ name: "Ann Lee", email: "ann@x.co", phone: "214-555-0100" })).toBe(a);
    expect(customerFingerprint({ name: "Ann Lee", email: "ann@y.co", phone: "214-555-0100" })).not.toBe(a);
  });
});
