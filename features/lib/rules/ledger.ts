/**
 * Estimate Master Books: the ledger (30 Sep call, BK). Pure.
 *
 * - CHART: the preset chart of accounts. System accounts can't be deleted.
 * - postingsFor(event): the balanced journal lines for a business event
 *   (the posting table agreed with the client). Every entry's debits equal
 *   its credits.
 * - Reports read the journal: trial balance, balance sheet, income
 *   statement (accrual or cash), sales tax summary, job profit, 1099
 *   contractors, budget versus actual.
 * - A date in a closed month posts on the 1st of the next open month, with
 *   a note (postingDate).
 */
import { roundMoney } from "./rounding";
import { nextPeriod, postingPeriod } from "./finance";

/* ------------------------------ Accounts ------------------------------ */

export type AccountType = "Bank" | "Current asset" | "Current liability" | "Credit card" | "Equity" | "Income" | "Cost of jobs" | "Expense";

export interface LedgerAccount {
  no: string;
  name: string;
  type: AccountType;
  system: boolean;
  active: boolean;
}

export const SYSTEM_ACCOUNTS = ["1000", "1050", "1200", "2000", "2100", "2200", "3050", "3900", "4000", "6200", "6900"];

const RAW: [string, string, AccountType][] = [
  ["1000", "Chase Checking", "Bank"],
  ["1050", "Payments to deposit", "Current asset"],
  ["1200", "Money owed by customers", "Current asset"],
  ["2000", "Money owed to suppliers", "Current liability"],
  ["2100", "Customer deposits", "Current liability"],
  ["2200", "Sales tax to pay", "Current liability"],
  ["2300", "Chase Card", "Credit card"],
  ["3000", "Owner's equity", "Equity"],
  ["3050", "Opening balance equity", "Equity"],
  ["3100", "Owner draws", "Equity"],
  ["3900", "Retained earnings", "Equity"],
  ["4000", "Painting income", "Income"],
  ["4100", "Other income", "Income"],
  ["5000", "Paint and materials", "Cost of jobs"],
  ["5100", "Subcontractors", "Cost of jobs"],
  ["5200", "Equipment rental", "Cost of jobs"],
  ["6000", "Vehicle and fuel", "Expense"],
  ["6100", "Insurance", "Expense"],
  ["6200", "Card processing fees", "Expense"],
  ["6300", "Wages", "Expense"],
  ["6310", "Payroll taxes", "Expense"],
  ["6400", "Advertising", "Expense"],
  ["6500", "Office and software", "Expense"],
  ["6900", "Bad debts", "Expense"],
];

export const CHART: LedgerAccount[] = RAW.map(([no, name, type]) => ({ no, name, type, system: SYSTEM_ACCOUNTS.includes(no), active: true }));

const ASSET: AccountType[] = ["Bank", "Current asset"];
const LIABILITY: AccountType[] = ["Current liability", "Credit card"];
const PNL: AccountType[] = ["Income", "Cost of jobs", "Expense"];

/** Debit-normal accounts: assets, costs, expenses, and owner draws (it reduces equity). */
export const debitNormal = (a: Pick<LedgerAccount, "type" | "no">) => ASSET.includes(a.type) || a.type === "Cost of jobs" || a.type === "Expense" || a.no === "3100";

/** Why an account change is refused, or undefined. */
export function accountProblem(next: Pick<LedgerAccount, "no" | "name">, all: LedgerAccount[], editing?: string): string | undefined {
  if (!/^\d{4}$/.test(next.no)) return "Use a four-digit account number.";
  if (!next.name.trim()) return "Enter an account name.";
  if (all.some((a) => a.no === next.no && a.no !== editing)) return `Account ${next.no} exists.`;
  return undefined;
}

/* ------------------------------ Postings ------------------------------ */

export interface JournalLine {
  account: string;
  debit: number;
  credit: number;
  jobId?: string;
  memo?: string;
}

export type LedgerEvent =
  | { kind: "deposit_invoice"; amount: number; jobId?: string }
  /** Progress or final invoice. A final invoice moves the job's held deposits into income. */
  | { kind: "invoice"; net: number; tax: number; jobId?: string; depositsHeld?: number }
  /** Customer payment. `owed` = what the customer owes; anything over is held as a customer credit. */
  | { kind: "card_payment"; amount: number; owed?: number; jobId?: string }
  | { kind: "payment"; amount: number; owed?: number; jobId?: string }
  | { kind: "card_batch"; gross: number; fee: number }
  | { kind: "refund"; amount: number; afterFinal: boolean; jobId?: string }
  | { kind: "write_off"; amount: number; jobId?: string }
  | { kind: "bill"; amount: number; account: string; jobId?: string }
  | { kind: "bill_paid"; amount: number; account?: string }
  | { kind: "card_purchase"; amount: number; account: string; jobId?: string }
  | { kind: "card_bill_paid"; amount: number }
  | { kind: "sales_tax_paid"; amount: number }
  | { kind: "owner_draw"; amount: number }
  /** Asset balances debit the account; liability balances credit it. The other side is 3050. */
  | { kind: "opening_balances"; balances: { account: string; amount: number }[] }
  /** BK-C2: a Gusto pay run imported as a journal entry. */
  | { kind: "payroll"; wages: number; taxes: number }
  | { kind: "year_end"; lines: JournalLine[] }
  | { kind: "manual"; lines: JournalLine[] };

export type LedgerEventKind = LedgerEvent["kind"];

const dr = (account: string, amount: number, extra: Partial<JournalLine> = {}): JournalLine => ({ account, debit: roundMoney(amount), credit: 0, ...extra });
const cr = (account: string, amount: number, extra: Partial<JournalLine> = {}): JournalLine => ({ account, debit: 0, credit: roundMoney(amount), ...extra });

const LIABILITY_NOS = ["2000", "2100", "2200", "2300"];

/** The journal lines for an event. Zero lines are dropped. */
export function postingsFor(e: LedgerEvent): JournalLine[] {
  const job = "jobId" in e && e.jobId ? { jobId: e.jobId } : {};
  const lines: JournalLine[] = (() => {
    switch (e.kind) {
      case "deposit_invoice":
        return [dr("1200", e.amount, job), cr("2100", e.amount, job)];
      case "invoice":
        return [
          dr("1200", e.net + e.tax, job), cr("4000", e.net, job), cr("2200", e.tax, job),
          ...(e.depositsHeld ? [dr("2100", e.depositsHeld, { ...job, memo: "Deposits held for this job" }), cr("4000", e.depositsHeld, { ...job, memo: "Deposits held for this job" })] : []),
        ];
      case "card_payment":
      case "payment": {
        const bank = e.kind === "card_payment" ? "1050" : "1000";
        const applied = e.owed === undefined ? e.amount : Math.min(e.amount, Math.max(0, e.owed));
        const over = roundMoney(e.amount - applied);
        return [dr(bank, e.amount, job), cr("1200", applied, job), ...(over > 0 ? [cr("2100", over, { ...job, memo: "Customer credit (overpayment)" })] : [])];
      }
      case "card_batch":
        return [dr("1000", e.gross - e.fee), dr("6200", e.fee), cr("1050", e.gross)];
      case "refund":
        return [dr(e.afterFinal ? "4000" : "2100", e.amount, job), cr("1000", e.amount, job)];
      case "write_off":
        return [dr("6900", e.amount, job), cr("1200", e.amount, job)];
      case "bill":
        return [dr(e.account, e.amount, job), cr("2000", e.amount, job)];
      case "bill_paid":
        return [dr("2000", e.amount), cr("1000", e.amount)];
      case "card_purchase":
        return [dr(e.account, e.amount, job), cr("2300", e.amount, job)];
      case "card_bill_paid":
        return [dr("2300", e.amount), cr("1000", e.amount)];
      case "sales_tax_paid":
        return [dr("2200", e.amount), cr("1000", e.amount)];
      case "owner_draw":
        return [dr("3100", e.amount), cr("1000", e.amount)];
      case "opening_balances":
        return e.balances.flatMap((b) =>
          LIABILITY_NOS.includes(b.account) ? [dr("3050", b.amount), cr(b.account, b.amount)] : [dr(b.account, b.amount), cr("3050", b.amount)],
        );
      case "payroll":
        return [dr("6300", e.wages), dr("6310", e.taxes), cr("1000", e.wages + e.taxes)];
      case "year_end":
      case "manual":
        return e.lines;
    }
  })();
  return lines.filter((l) => l.debit !== 0 || l.credit !== 0);
}

/**
 * Cash-basis profit and loss lines for an event: income when a customer
 * pays, costs when money goes out. Balance-sheet-only events give none.
 */
export function cashLinesFor(e: LedgerEvent): JournalLine[] {
  switch (e.kind) {
    case "card_payment":
    case "payment": {
      const applied = e.owed === undefined ? e.amount : Math.min(e.amount, Math.max(0, e.owed));
      return applied ? [cr("4000", applied, "jobId" in e && e.jobId ? { jobId: e.jobId } : {})] : [];
    }
    case "refund":
      return e.afterFinal ? [dr("4000", e.amount)] : [];
    case "card_batch":
      return [dr("6200", e.fee)];
    case "bill_paid":
      return [dr(e.account ?? "5000", e.amount)];
    case "card_purchase":
      return [dr(e.account, e.amount, e.jobId ? { jobId: e.jobId } : {})];
    case "payroll":
      return [dr("6300", e.wages), dr("6310", e.taxes)];
    default:
      return [];
  }
}

export const totals = (lines: JournalLine[]) => ({
  debit: roundMoney(lines.reduce((s, l) => s + l.debit, 0)),
  credit: roundMoney(lines.reduce((s, l) => s + l.credit, 0)),
});

export function isBalanced(lines: JournalLine[]): boolean {
  const t = totals(lines);
  return t.debit === t.credit && t.debit > 0;
}

/** The lines that undo an entry. */
export const reversalLines = (lines: JournalLine[]): JournalLine[] => lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));

/* ------------------------------ Journal ------------------------------- */

export interface JournalEntry {
  id: string; // JE-1
  no: number;
  /** Posting date, YYYY-MM-DD. */
  date: string;
  source: { kind: LedgerEventKind | "reversal"; ref: string; href?: string };
  memo: string;
  party?: string;
  lines: JournalLine[];
  /** Cash-basis profit and loss lines (cashLinesFor). */
  cash?: JournalLine[];
  postedBy: string;
  postedAt: string;
  /** Set on a reversal: the entry it undoes. */
  reversesId?: string;
  /** Set on an entry that was reversed. Entries are never deleted. */
  reversedBy?: { id: string; reason: string; at: string; by: string };
  /** e.g. "Dated 2026-08-14, posted 2026-10-01: August is closed." */
  note?: string;
}

/** A date in a closed month posts on the 1st of the next open month, with a note. */
export function postingDate(date: string, closedPeriods: string[]): { date: string; note?: string } {
  const p = postingPeriod(date, closedPeriods);
  if (!p.movedFrom) return { date: date.slice(0, 10) };
  const moved = `${p.period}-01`;
  const month = new Date(`${p.movedFrom}-01T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return { date: moved, note: `Dated ${date.slice(0, 10)}, posted ${moved}: ${month} is closed.` };
}

export { nextPeriod };

/* ------------------------------ Reports ------------------------------- */

export type Basis = "accrual" | "cash";
interface Range { from?: string; to?: string }
const inRange = (d: string, r: Range) => (!r.from || d >= r.from) && (!r.to || d <= r.to);

/** Debit minus credit per account. */
export function balances(entries: JournalEntry[], r: Range = {}, basis: Basis = "accrual"): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) {
    if (!inRange(e.date, r)) continue;
    for (const l of basis === "cash" ? e.cash ?? [] : e.lines) out.set(l.account, roundMoney((out.get(l.account) ?? 0) + l.debit - l.credit));
  }
  return out;
}

/** Balance shown the natural way round for the account (positive = normal). */
export const naturalBalance = (a: LedgerAccount, raw: number) => roundMoney(debitNormal(a) ? raw : -raw) || 0;

export function trialBalance(entries: JournalEntry[], accounts: LedgerAccount[], asOf?: string) {
  const b = balances(entries, { to: asOf });
  const rows = accounts
    .map((a) => ({ account: a, debit: Math.max(0, b.get(a.no) ?? 0), credit: Math.max(0, -(b.get(a.no) ?? 0)) }))
    .filter((r) => r.debit || r.credit);
  return { rows, totalDebit: roundMoney(rows.reduce((s, r) => s + r.debit, 0)), totalCredit: roundMoney(rows.reduce((s, r) => s + r.credit, 0)) };
}

/**
 * Balance sheet at a date. Profit not yet rolled into 3900 shows as
 * "Current year earnings", so assets always equal liabilities plus equity.
 */
export function balanceSheet(entries: JournalEntry[], accounts: LedgerAccount[], asOf?: string) {
  const b = balances(entries, { to: asOf });
  const row = (a: LedgerAccount) => ({ account: a, amount: naturalBalance(a, b.get(a.no) ?? 0) });
  const assets = accounts.filter((a) => ASSET.includes(a.type)).map(row).filter((r) => r.amount);
  const liabilities = accounts.filter((a) => LIABILITY.includes(a.type)).map(row).filter((r) => r.amount);
  const equityRows = accounts.filter((a) => a.type === "Equity").map((a) => ({ account: a, amount: roundMoney(-(b.get(a.no) ?? 0)) || 0 })).filter((r) => r.amount);
  const earnings = roundMoney(-accounts.filter((a) => PNL.includes(a.type)).reduce((s, a) => s + (b.get(a.no) ?? 0), 0)) || 0;
  const totalAssets = roundMoney(assets.reduce((s, r) => s + r.amount, 0));
  const totalLiabilities = roundMoney(liabilities.reduce((s, r) => s + r.amount, 0));
  const totalEquity = roundMoney(equityRows.reduce((s, r) => s + r.amount, 0) + earnings);
  return { assets, liabilities, equity: equityRows, earnings, totalAssets, totalLiabilities, totalEquity, balances: roundMoney(totalAssets - totalLiabilities - totalEquity) === 0 };
}

export function incomeStatement(entries: JournalEntry[], accounts: LedgerAccount[], r: Range, basis: Basis = "accrual") {
  const b = balances(entries.filter((e) => e.source.kind !== "year_end"), r, basis);
  const rows = (type: AccountType) =>
    accounts.filter((a) => a.type === type).map((a) => ({ account: a, amount: naturalBalance(a, b.get(a.no) ?? 0) })).filter((x) => x.amount);
  const income = rows("Income");
  const costs = rows("Cost of jobs");
  const expenses = rows("Expense");
  const sum = (xs: { amount: number }[]) => roundMoney(xs.reduce((s, x) => s + x.amount, 0));
  const grossProfit = roundMoney(sum(income) - sum(costs));
  return { income, costs, expenses, totalIncome: sum(income), totalCosts: sum(costs), totalExpenses: sum(expenses), grossProfit, netProfit: roundMoney(grossProfit - sum(expenses)) };
}

/** Sales tax collected and paid in a range, and what is still owed to the state. */
export function salesTaxSummary(entries: JournalEntry[], r: Range = {}, basis: Basis = "accrual") {
  let collected = 0;
  let paid = 0;
  for (const e of entries) {
    if (!inRange(e.date, r)) continue;
    // Cash basis: tax counts as collected once the customer has paid, which the prototype books with the invoice.
    for (const l of e.lines) {
      if (l.account !== "2200") continue;
      collected += l.credit;
      paid += l.debit;
    }
  }
  const owedNow = roundMoney(-(balances(entries).get("2200") ?? 0)) || 0;
  return { collected: roundMoney(collected), paid: roundMoney(paid), owed: owedNow, basis };
}

/** Income and job costs posted against one job (BK-C3). */
export function jobProfit(entries: JournalEntry[], jobId: string, basis: Basis = "accrual") {
  let income = 0;
  let costs = 0;
  let deposits = 0;
  for (const e of entries) {
    for (const l of basis === "cash" ? e.cash ?? [] : e.lines) {
      if (l.jobId !== jobId) continue;
      if (l.account === "4000") income += l.credit - l.debit;
      if (["5000", "5100", "5200"].includes(l.account)) costs += l.debit - l.credit;
    }
    if (basis === "accrual") for (const l of e.lines) if (l.jobId === jobId && l.account === "2100") deposits += l.credit - l.debit;
  }
  return { income: roundMoney(income), costs: roundMoney(costs), profit: roundMoney(income - costs), depositsHeld: roundMoney(deposits) };
}

/** Year-end roll: every profit and loss account for the year is closed into 3900 (retained earnings). */
export function yearEndLines(entries: JournalEntry[], accounts: LedgerAccount[], year: number): JournalLine[] {
  const b = balances(entries.filter((e) => e.source.kind !== "year_end"), { from: `${year}-01-01`, to: `${year}-12-31` });
  const lines: JournalLine[] = [];
  let net = 0;
  for (const a of accounts.filter((x) => PNL.includes(x.type))) {
    const v = b.get(a.no) ?? 0;
    if (!v) continue;
    lines.push(v > 0 ? cr(a.no, v, { memo: `Close ${year}` }) : dr(a.no, -v, { memo: `Close ${year}` }));
    net += v;
  }
  if (!lines.length) return [];
  lines.push(net > 0 ? dr("3900", net, { memo: `Net result ${year}` }) : cr("3900", -net, { memo: `Net result ${year}` }));
  return lines;
}

/** BK-C6: subcontractors paid $600 or more in a year need a 1099. */
export function contractors1099(entries: JournalEntry[], year: number, threshold = 600) {
  const byParty = new Map<string, number>();
  for (const e of entries) {
    if (!e.date.startsWith(String(year)) || !e.party) continue;
    for (const l of e.lines) if (l.account === "5100") byParty.set(e.party, roundMoney((byParty.get(e.party) ?? 0) + l.debit - l.credit));
  }
  return [...byParty.entries()].map(([party, amount]) => ({ party, amount, needs1099: amount >= threshold })).sort((a, b) => b.amount - a.amount);
}

/** BK-C6: budget against actual for a range (budget is per month per account). */
export function budgetVsActual(entries: JournalEntry[], accounts: LedgerAccount[], budget: Record<string, number>, r: { from: string; to: string }, months: number) {
  const b = balances(entries.filter((e) => e.source.kind !== "year_end"), r);
  return accounts
    .filter((a) => budget[a.no] !== undefined)
    .map((a) => {
      const actual = naturalBalance(a, b.get(a.no) ?? 0);
      const planned = roundMoney((budget[a.no] ?? 0) * months);
      return { account: a, budget: planned, actual, difference: roundMoney(actual - planned) };
    });
}

/* ------------------------------ Reconcile ----------------------------- */

/** Statement balance minus the book balance of what is ticked. Reconcile can only finish at 0.00. */
export function reconcileDifference(statementBalance: number, openingBalance: number, ticked: number[]): number {
  return roundMoney(statementBalance - openingBalance - ticked.reduce((s, x) => s + x, 0));
}

/* ------------------------------ Exports ------------------------------- */

export function generalLedgerRows(entries: JournalEntry[], accounts: LedgerAccount[]): (string | number)[][] {
  const name = (no: string) => accounts.find((a) => a.no === no)?.name ?? no;
  return [
    ["Date", "Entry No.", "Source", "Account", "Account name", "Debit", "Credit", "Job", "Memo", "Posted by"],
    ...[...entries].sort((a, b) => a.date.localeCompare(b.date) || a.no - b.no).flatMap((e) =>
      e.lines.map((l) => [e.date, e.no, e.source.ref, l.account, name(l.account), l.debit || "", l.credit || "", l.jobId ?? "", l.memo ?? e.memo, e.postedBy]),
    ),
  ];
}

export function trialBalanceRows(entries: JournalEntry[], accounts: LedgerAccount[], asOf?: string): (string | number)[][] {
  const tb = trialBalance(entries, accounts, asOf);
  return [
    ["Account", "Account name", "Type", "Debit", "Credit"],
    ...tb.rows.map((r) => [r.account.no, r.account.name, r.account.type, r.debit || "", r.credit || ""]),
    ["", "Total", "", tb.totalDebit, tb.totalCredit],
  ];
}
