import { describe, expect, it } from "vitest";
import { produce } from "immer";
import { createSeed } from "@/features/data/seed";
import type { Database } from "@/features/types";
import { matchContacts } from "@/features/lib/rules/qbo-contacts";
import { accountingDestination, completeContactMatch, decideContactMatch, reviewQboCustomer, setAccountingDestination } from "./finance";

const seed = () => createSeed("2026-06-10T15:00:00.000Z");
const user = (db: Database, id: string) => db.users.find((u) => u.id === id)!;
function run<A extends unknown[]>(db: Database, by: string, fn: (d: Database, u: ReturnType<typeof user>, ...a: A) => { ok: boolean; error?: string }, ...args: A) {
  let result: { ok: boolean; error?: string } = { ok: false };
  const next = produce(db, (d) => { result = fn(d as Database, user(d as Database, by), ...args); });
  return { db: next, result };
}

describe("accounting destination (X-M2)", () => {
  it("starts on QuickBooks when it is connected", () => {
    expect(accountingDestination(seed())).toBe("qbo");
  });

  it("choosing Books disconnects QuickBooks, and the choice is stored with the data", () => {
    const { db, result } = run(seed(), "U-OWNER", setAccountingDestination, "books" as const);
    expect(result.ok).toBe(true);
    expect(db.financeSettings.destination).toBe("books");
    expect(db.financeSettings.qbo.connected).toBe(false);
    // The feature store persists the whole database, so a reload reads it back.
    const reloaded = JSON.parse(JSON.stringify(db)) as Database;
    expect(accountingDestination(reloaded)).toBe("books");
    const back = run(db, "U-OWNER", setAccountingDestination, "qbo" as const).db;
    expect(back.financeSettings.qbo.connected).toBe(true);
  });

  it("is the owner's or the office manager's decision", () => {
    expect(run(seed(), "U-EST", setAccountingDestination, "books" as const).result.ok).toBe(false);
  });
});

describe("match your contacts (QB-M3)", () => {
  it("needs a decision for every possible duplicate, then links and creates", () => {
    let db = seed();
    const m = matchContacts(db.customers.filter((c) => !c.leadOnly), db.qboCustomers!);
    const links = [
      ...m.matched.map((x) => ({ qboId: x.qbo.id, customerId: x.customerId, duplicate: false })),
      ...m.duplicates.map((x) => ({ qboId: x.qbo.id, customerId: x.customerId, duplicate: true })),
    ];
    // D2: the seed has one: QuickBooks' "Jeremy Irons" carries Olivia Bennett's email.
    expect(m.duplicates.map((d) => d.qbo.id)).toEqual(["QBO-C-108"]);
    expect(run(db, "U-BOOK", completeContactMatch, links).result.error).toMatch(/Choose Link or Create new for 1 possible duplicate/);
    const linked = run(run(db, "U-BOOK", decideContactMatch, "QBO-C-108", "link" as const).db, "U-BOOK", completeContactMatch, links);
    expect(linked.result.ok).toBe(true);
    expect(linked.db.qboCustomers!.find((q) => q.id === "QBO-C-108")!.customerId).toBe(m.duplicates[0]!.customerId);
    db = run(db, "U-BOOK", decideContactMatch, "QBO-C-108", "create" as const).db;
    const before = db.customers.length;
    const r = run(db, "U-BOOK", completeContactMatch, links);
    expect(r.result.ok).toBe(true);
    expect(r.db.customers.length).toBe(before + 1);
    expect(r.db.financeSettings.contactMatch?.completedAt).toBeTruthy();
  });
});

describe("customer review (QB-C1)", () => {
  it("creates, links or ignores a customer made in QuickBooks", () => {
    const db = seed();
    const created = run(db, "U-BOOK", reviewQboCustomer, "QBO-C-201", "create" as const, undefined);
    expect(created.db.qboCustomers!.find((q) => q.id === "QBO-C-201")!.review?.status).toBe("created");
    expect(created.db.customers.some((c) => c.name === "Harbor View HOA")).toBe(true);
    expect(run(db, "U-BOOK", reviewQboCustomer, "QBO-C-202", "link" as const, undefined).result.ok).toBe(false);
    expect(run(db, "U-BOOK", reviewQboCustomer, "QBO-C-202", "link" as const, "C-SAM").db.qboCustomers!.find((q) => q.id === "QBO-C-202")!.customerId).toBe("C-SAM");
    expect(run(db, "U-BOOK", reviewQboCustomer, "QBO-C-202", "ignore" as const, undefined).db.qboCustomers!.find((q) => q.id === "QBO-C-202")!.review?.status).toBe("ignored");
  });
});
