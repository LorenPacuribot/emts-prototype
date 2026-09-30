import { describe, expect, it } from "vitest";
import { produce } from "immer";
import { createSeed } from "@/features/data/seed";
import type { ActionResult, Database, User } from "@/features/types";
import { balanceSheet, balances, isBalanced, salesTaxSummary } from "@/features/lib/rules/ledger";
import { closePeriod } from "./finance";
import {
  completeMoveFromQbo, finishReconcile, importGustoPayRun, matchCardBatch, postEvent, recordStatePayment, reverseEntry, saveAccount, setAccountActive, writeOffInvoice,
} from "./ledger";

const seed = () => createSeed("2026-09-30T15:00:00.000Z");
function run<A extends unknown[], R>(db: Database, by: string, fn: (d: Database, u: User, ...a: A) => ActionResult<R>, ...args: A) {
  let result = { ok: false } as ActionResult<R>;
  const next = produce(db, (d) => { result = fn(d as Database, (d as Database).users.find((u) => u.id === by)!, ...args); });
  return { db: next, result };
}
const journal = (db: Database) => db.books!.journal;

describe("posting to the books", () => {
  it("a closed month rejects the posting: it goes on the 1st of the next open month with a note", () => {
    const db = seed();
    const closed = db.financeSettings.closedPeriods.at(-1)!; // last month
    const r = run(db, "U-BOOK", postEvent, { kind: "owner_draw", amount: 100 }, { date: `${closed}-15`, ref: "DRAW-X", memo: "Owner draw" });
    expect(r.result.ok).toBe(true);
    const e = journal(r.db).at(-1)!;
    expect(e.date.slice(8)).toBe("01");
    expect(e.date > `${closed}-31`).toBe(true);
    expect(e.note).toMatch(/is closed\.$/);
  });

  it("reversal needs a reason, keeps the original and balances; there is no delete", () => {
    const db = seed();
    const id = journal(db)[1]!.id;
    expect(run(db, "U-BOOK", reverseEntry, id, " ").result.ok).toBe(false);
    const r = run(db, "U-BOOK", reverseEntry, id, "Posted twice");
    expect(r.result.ok).toBe(true);
    expect(journal(r.db).find((e) => e.id === id)!.reversedBy?.reason).toBe("Posted twice");
    expect(journal(r.db).length).toBe(journal(db).length + 1);
    expect(isBalanced(journal(r.db).at(-1)!.lines)).toBe(true);
    expect(run(r.db, "U-BOOK", reverseEntry, id, "Again").result.ok).toBe(false);
  });

  it("write-off is for the owner only, with a reason", () => {
    const db = seed();
    expect(run(db, "U-BOOK", writeOffInvoice, "INV-2026-121", 5196, "Customer moved away").result.ok).toBe(false);
    expect(run(db, "U-OWNER", writeOffInvoice, "INV-2026-121", 5196, "").result.ok).toBe(false);
    const r = run(db, "U-OWNER", writeOffInvoice, "INV-2026-121", 5196, "Customer moved away", "JOB-2026-40");
    expect(r.result.ok).toBe(true);
    expect(r.db.books!.writeOffs).toHaveLength(1);
    expect(balances(journal(r.db)).get("6900")).toBe(5196);
  });

  it("records a payment to the state, never more than is owed", () => {
    const db = seed();
    const owed = salesTaxSummary(journal(db)).owed;
    expect(run(db, "U-BOOK", recordStatePayment, owed + 1).result.ok).toBe(false);
    const r = run(db, "U-BOOK", recordStatePayment, owed);
    expect(salesTaxSummary(journal(r.db)).owed).toBe(0);
  });

  it("Match batch posts the fee to 6200 and empties Payments to deposit", () => {
    const db = seed();
    const waiting = balances(journal(db)).get("1050")!;
    expect(waiting).toBe(1500);
    const r = run(db, "U-OFFICE", matchCardBatch, 1500, 43.8);
    expect(r.result.ok).toBe(true);
    expect(balances(journal(r.db)).get("1050") ?? 0).toBe(0);
    expect(journal(r.db).at(-1)!.lines.find((l) => l.account === "6200")!.debit).toBe(43.8);
  });

  it("imports a Gusto pay run once", () => {
    const db = seed();
    const r = run(db, "U-BOOK", importGustoPayRun, { ref: "GUSTO-0926", wages: 6100, taxes: 505, date: "2026-09-26" });
    expect(r.result.ok).toBe(true);
    expect(run(r.db, "U-BOOK", importGustoPayRun, { ref: "GUSTO-0926", wages: 6100, taxes: 505, date: "2026-09-26" }).result.ok).toBe(false);
  });

  it("the balance sheet still balances after all of that", () => {
    let db = seed();
    db = run(db, "U-OWNER", writeOffInvoice, "INV-2026-121", 5196, "Gone", "JOB-2026-40").db;
    db = run(db, "U-OFFICE", matchCardBatch, 1500, 43.8).db;
    db = run(db, "U-BOOK", reverseEntry, journal(db)[5]!.id, "Test").db;
    expect(balanceSheet(journal(db), db.books!.accounts).balances).toBe(true);
  });
});

describe("chart of accounts", () => {
  it("adds and edits accounts; system accounts can't be deactivated or renumbered", () => {
    const db = seed();
    const added = run(db, "U-BOOK", saveAccount, { no: "6600", name: "Training", type: "Expense" as const }, undefined);
    expect(added.result.ok).toBe(true);
    expect(run(db, "U-BOOK", setAccountActive, "1000", false).result.ok).toBe(false);
    expect(run(db, "U-BOOK", saveAccount, { no: "1001", name: "Chase", type: "Bank" as const }, "1000").result.ok).toBe(false);
    expect(run(db, "U-BOOK", saveAccount, { no: "1000", name: "Chase Business Checking", type: "Bank" as const }, "1000").result.ok).toBe(true);
    expect(run(db, "U-EST", saveAccount, { no: "6700", name: "X", type: "Expense" as const }, undefined).result.ok).toBe(false);
  });
});

describe("reconcile and year end", () => {
  it("reconcile cannot finish until the difference is $0.00", () => {
    const db = seed();
    const base = { account: "1000", statementDate: "2026-09-30", openingBalance: 1000 };
    expect(run(db, "U-BOOK", finishReconcile, { ...base, statementBalance: 1200, ticked: [150] }).result).toMatchObject({ ok: false, error: expect.stringMatching(/must be 0\.00/) });
    expect(run(db, "U-BOOK", finishReconcile, { ...base, statementBalance: 1200, ticked: [150, 50] }).result.ok).toBe(true);
  });

  it("closing December rolls the year into 3900", () => {
    const db = produce(seed(), (d) => { d.financeSettings.closedPeriods = d.financeSettings.closedPeriods.filter((p) => p !== "2026-12"); });
    const r = run(db, "U-BOOK", closePeriod, "2026-12");
    expect(r.result.ok).toBe(true);
    const ye = journal(r.db).find((e) => e.source.kind === "year_end")!;
    expect(isBalanced(ye.lines)).toBe(true);
    expect(balanceSheet(journal(r.db), r.db.books!.accounts).earnings).toBe(0);
  });

  it("moving from QuickBooks ends with QuickBooks disconnected", () => {
    const r = run(seed(), "U-OWNER", completeMoveFromQbo);
    expect(r.db.financeSettings.qbo.connected).toBe(false);
    expect(r.db.financeSettings.destination).toBe("books");
  });
});
