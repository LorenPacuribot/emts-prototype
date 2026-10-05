import { describe, expect, it } from "vitest";
import { createBooksSeed } from "@/features/data/seed-books";
import {
  reconcileCandidates,
  CHART, SYSTEM_ACCOUNTS, accountProblem, balanceSheet, balances, cashLinesFor, contractors1099, incomeStatement, isBalanced, jobProfit, postingDate,
  postingsFor, reconcileDifference, reversalLines, salesTaxSummary, trialBalance, yearEndLines, type JournalEntry, type LedgerEvent,
} from "./ledger";

const NOW = "2026-09-30T15:00:00.000Z";
const seed = () => createBooksSeed(NOW);
const entry = (id: string, date: string, e: LedgerEvent): JournalEntry => ({
  id, no: 1, date, source: { kind: e.kind, ref: id }, memo: "", lines: postingsFor(e), cash: cashLinesFor(e), postedBy: "t", postedAt: date,
});

const EVERY_EVENT: LedgerEvent[] = [
  { kind: "deposit_invoice", amount: 2000 },
  { kind: "invoice", net: 1000, tax: 82.5 },
  { kind: "invoice", net: 5958, tax: 0, depositsHeld: 2000 },
  { kind: "card_payment", amount: 500 },
  { kind: "payment", amount: 700, owed: 600 },
  { kind: "card_batch", gross: 1000, fee: 29.3 },
  { kind: "refund", amount: 100, afterFinal: false },
  { kind: "refund", amount: 100, afterFinal: true },
  { kind: "write_off", amount: 250 },
  { kind: "bill", amount: 300, account: "5000", jobId: "J1" },
  { kind: "bill", amount: 90, account: "6100" },
  { kind: "bill_paid", amount: 300 },
  { kind: "card_purchase", amount: 45, account: "6000" },
  { kind: "card_bill_paid", amount: 45 },
  { kind: "sales_tax_paid", amount: 82.5 },
  { kind: "owner_draw", amount: 1500 },
  { kind: "opening_balances", balances: [{ account: "1000", amount: 5000 }, { account: "2000", amount: 800 }] },
  { kind: "payroll", wages: 4000, taxes: 306 },
];

describe("posting rules", () => {
  it("every posting balances", () => {
    for (const e of EVERY_EVENT) expect([e.kind, isBalanced(postingsFor(e))]).toEqual([e.kind, true]);
  });

  it("follows the agreed accounts", () => {
    const acc = (e: LedgerEvent) => postingsFor(e).map((l) => `${l.debit ? "Dr" : "Cr"} ${l.account}`);
    expect(acc({ kind: "deposit_invoice", amount: 1 })).toEqual(["Dr 1200", "Cr 2100"]);
    expect(acc({ kind: "invoice", net: 10, tax: 1 })).toEqual(["Dr 1200", "Cr 4000", "Cr 2200"]);
    expect(acc({ kind: "card_payment", amount: 1 })).toEqual(["Dr 1050", "Cr 1200"]);
    expect(acc({ kind: "payment", amount: 1 })).toEqual(["Dr 1000", "Cr 1200"]);
    expect(acc({ kind: "card_batch", gross: 100, fee: 3 })).toEqual(["Dr 1000", "Dr 6200", "Cr 1050"]);
    expect(acc({ kind: "refund", amount: 1, afterFinal: false })).toEqual(["Dr 2100", "Cr 1000"]);
    expect(acc({ kind: "refund", amount: 1, afterFinal: true })).toEqual(["Dr 4000", "Cr 1000"]);
    expect(acc({ kind: "write_off", amount: 1 })).toEqual(["Dr 6900", "Cr 1200"]);
    expect(acc({ kind: "bill", amount: 1, account: "5100" })).toEqual(["Dr 5100", "Cr 2000"]);
    expect(acc({ kind: "bill_paid", amount: 1 })).toEqual(["Dr 2000", "Cr 1000"]);
    expect(acc({ kind: "card_purchase", amount: 1, account: "6500" })).toEqual(["Dr 6500", "Cr 2300"]);
    expect(acc({ kind: "card_bill_paid", amount: 1 })).toEqual(["Dr 2300", "Cr 1000"]);
    expect(acc({ kind: "sales_tax_paid", amount: 1 })).toEqual(["Dr 2200", "Cr 1000"]);
    expect(acc({ kind: "owner_draw", amount: 1 })).toEqual(["Dr 3100", "Cr 1000"]);
    expect(acc({ kind: "opening_balances", balances: [{ account: "1000", amount: 1 }, { account: "2300", amount: 1 }] })).toEqual(["Dr 1000", "Cr 3050", "Dr 3050", "Cr 2300"]);
  });

  it("card batch posts the net to the bank and the fee to 6200", () => {
    const l = postingsFor({ kind: "card_batch", gross: 2000, fee: 58 });
    expect(l.find((x) => x.account === "1000")!.debit).toBe(1942);
    expect(l.find((x) => x.account === "6200")!.debit).toBe(58);
  });

  it("holds an overpayment as a customer credit", () => {
    const l = postingsFor({ kind: "payment", amount: 700, owed: 600 });
    expect(l.find((x) => x.account === "1200")!.credit).toBe(600);
    expect(l.find((x) => x.account === "2100")).toMatchObject({ credit: 100, memo: "Customer credit (overpayment)" });
  });

  it("a reversal undoes the entry and still balances", () => {
    const lines = postingsFor({ kind: "invoice", net: 100, tax: 8 });
    const both = [...lines, ...reversalLines(lines)];
    const b = new Map<string, number>();
    for (const l of both) b.set(l.account, (b.get(l.account) ?? 0) + l.debit - l.credit);
    expect([...b.values()].every((v) => Math.abs(v) < 0.001)).toBe(true);
  });
});

describe("the seed job JOB-2026-37", () => {
  it("income is $7,958.00 and customer deposits are $0.00 after the final invoice", () => {
    const j = jobProfit(seed().journal, "JOB-2026-37");
    expect(j.income).toBe(7958);
    expect(j.depositsHeld).toBe(0);
  });
});

describe("reports on the seeded journal", () => {
  it("every seeded entry balances and the trial balance agrees", () => {
    const s = seed();
    expect(s.journal.every((e) => isBalanced(e.lines))).toBe(true);
    const tb = trialBalance(s.journal, s.accounts);
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it("the balance sheet always balances", () => {
    const s = seed();
    for (const e of s.journal) expect([e.date, balanceSheet(s.journal, s.accounts, e.date).balances]).toEqual([e.date, true]);
    const bs = balanceSheet(s.journal, s.accounts);
    expect(bs.totalAssets).toBe(Math.round((bs.totalLiabilities + bs.totalEquity) * 100) / 100);
  });

  it("still balances after the year-end roll into 3900", () => {
    const s = seed();
    const close = yearEndLines(s.journal, s.accounts, 2026);
    expect(isBalanced(close)).toBe(true);
    const after = [...s.journal, { ...entry("YE", "2026-12-31", { kind: "year_end", lines: close }) }];
    const bs = balanceSheet(after, s.accounts);
    expect(bs.balances).toBe(true);
    expect(bs.earnings).toBe(0);
    const pnl = incomeStatement(s.journal, s.accounts, { from: "2026-01-01", to: "2026-12-31" });
    expect(-(balances(after).get("3900") ?? 0)).toBe(pnl.netProfit);
  });

  it("accrual and cash differ: an unpaid invoice counts only on accrual", () => {
    const s = seed();
    const r = { from: "2026-09-20", to: "2026-09-30" };
    const accrual = incomeStatement(s.journal, s.accounts, r, "accrual");
    const cash = incomeStatement(s.journal, s.accounts, r, "cash");
    expect(accrual.totalIncome).toBeGreaterThan(cash.totalIncome);
  });

  it("sales tax summary shows what is owed to the state", () => {
    const t = salesTaxSummary(seed().journal);
    expect(t.owed).toBe(396);
  });

  it("lists subcontractors who need a 1099", () => {
    const list = contractors1099(seed().journal, 2026);
    expect(list.find((x) => x.party === "Brightline Drywall")).toMatchObject({ amount: 2100, needs1099: true });
    expect(list.find((x) => x.party === "Ortiz Pressure Washing")).toMatchObject({ needs1099: false });
  });
});

describe("closed months", () => {
  it("a closed month rejects the date: it posts on the 1st of the next open month, with a note", () => {
    expect(postingDate("2026-08-14", ["2026-07", "2026-08"])).toEqual({ date: "2026-09-01", note: "Dated 2026-08-14, posted 2026-09-01: August 2026 is closed." });
    expect(postingDate("2026-09-14", ["2026-08"])).toEqual({ date: "2026-09-14" });
  });
});

describe("reconcile", () => {
  it("can finish only when the difference is $0.00", () => {
    expect(reconcileDifference(1000, 800, [150, 50])).toBe(0);
    expect(reconcileDifference(1000, 800, [150])).toBe(50);
  });
});

describe("chart of accounts", () => {
  it("has the 24 preset accounts with the system ones locked", () => {
    expect(CHART).toHaveLength(24);
    expect(CHART.filter((a) => a.system).map((a) => a.no)).toEqual(SYSTEM_ACCOUNTS);
    expect(accountProblem({ no: "6000", name: "X" }, CHART)).toBe("Account 6000 exists.");
    expect(accountProblem({ no: "6600", name: "Training" }, CHART)).toBeUndefined();
  });
});

describe("QA B-06 — reconcile keeps uncleared items", () => {
  it("lists a cheque from before the last statement until it clears", () => {
    const reg = [
      { id: "A", accountId: "BANK", status: "written", date: "2026-08-20T10:00:00.000Z" }, // didn't clear by the 31 Aug statement
      { id: "B", accountId: "BANK", status: "cleared", date: "2026-08-25T10:00:00.000Z" }, // reconciled last time
      { id: "C", accountId: "BANK", status: "written", date: "2026-09-10T10:00:00.000Z" },
      { id: "D", accountId: "BANK", status: "void", date: "2026-09-12T10:00:00.000Z" },
      { id: "E", accountId: "CARD", status: "written", date: "2026-09-12T10:00:00.000Z" },
    ];
    expect(reconcileCandidates(reg, "BANK", "2026-08-31").map((e) => e.id)).toEqual(["A", "C"]);
    expect(reconcileCandidates(reg, "BANK").map((e) => e.id)).toEqual(["A", "B", "C"]);
  });
});
