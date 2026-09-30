/**
 * Estimate Master Books actions (30 Sep call, BK). The posting rules and
 * reports are pure, in features/lib/rules/ledger.ts. Entries are never
 * deleted: a mistake is reversed with a reason. A date in a closed month
 * posts on the 1st of the next open month, with a note.
 */
import type { ActionResult, Database, User } from "@/features/types";
import { now } from "@/features/lib/clock";
import { roundMoney } from "@/features/lib/rules/rounding";
import {
  accountProblem, balances, cashLinesFor, isBalanced, postingDate, postingsFor, reconcileDifference, reversalLines, salesTaxSummary, yearEndLines,
  type JournalEntry, type LedgerAccount, type LedgerEvent,
} from "@/features/lib/rules/ledger";
import { createBooksSeed } from "@/features/data/seed-books";
import { denied, fail, log, nextNumber, ok } from "../helpers";

const MODULE = "Books";

/** Owner, office manager and bookkeeper keep the books. */
export const canKeepBooks = (u: Pick<User, "role">) => u.role === "owner" || u.role === "office_manager" || u.role === "bookkeeper";

/** The books, filled from the seed on data saved before Books existed. */
export function booksOf(db: Database) {
  if (!db.books) db.books = createBooksSeed(now());
  return db.books;
}

export function postEvent(
  db: Database,
  actor: User,
  event: LedgerEvent,
  meta: { date?: string; ref: string; memo: string; party?: string; href?: string },
): ActionResult<JournalEntry> {
  if (!canKeepBooks(actor)) return denied(db, actor, MODULE, "post to the books", "the owner, the office manager or the bookkeeper");
  const lines = postingsFor(event);
  if (!isBalanced(lines)) return fail("This entry does not balance: debits must equal credits.");
  const books = booksOf(db);
  const when = postingDate(meta.date ?? now(), db.financeSettings.closedPeriods);
  const n = nextNumber(db, "je");
  const entry: JournalEntry = {
    id: `JE-${n}`, no: n, date: when.date, source: { kind: event.kind, ref: meta.ref, href: meta.href }, memo: meta.memo, party: meta.party,
    lines, cash: cashLinesFor(event), postedBy: actor.name, postedAt: now(), ...(when.note ? { note: when.note } : {}),
  };
  books.journal.push(entry);
  log(db, actor, MODULE, `Books: entry ${entry.no} posted (${meta.memo}, ${meta.ref})${when.note ? `. ${when.note}` : ""}`);
  return ok(entry);
}

/** BK-M9: undo an entry with a reason. There is no delete. */
export function reverseEntry(db: Database, actor: User, id: string, reason: string) {
  if (!canKeepBooks(actor)) return denied(db, actor, MODULE, "reverse an entry", "the owner, the office manager or the bookkeeper");
  if (!reason.trim()) return fail("Give a reason for the reversal.", "reason");
  const books = booksOf(db);
  const e = books.journal.find((x) => x.id === id);
  if (!e) return fail("Entry not found.");
  if (e.reversedBy) return fail("This entry is already reversed.");
  if (e.reversesId) return fail("A reversal can't be reversed. Post a new entry instead.");
  const when = postingDate(now(), db.financeSettings.closedPeriods);
  const n = nextNumber(db, "je");
  const rev: JournalEntry = {
    id: `JE-${n}`, no: n, date: when.date, source: { kind: "reversal", ref: `Reverses ${e.no}` }, memo: `Reversal of ${e.no}: ${reason.trim()}`, party: e.party,
    lines: reversalLines(e.lines), cash: reversalLines(e.cash ?? []), postedBy: actor.name, postedAt: now(), reversesId: e.id, ...(when.note ? { note: when.note } : {}),
  };
  books.journal.push(rev);
  e.reversedBy = { id: rev.id, reason: reason.trim(), at: now(), by: actor.name };
  log(db, actor, MODULE, `Books: entry ${e.no} reversed by ${actor.name}. Reason: ${reason.trim()}`);
  return ok(rev);
}

/** BK-M11: owner only, with a reason. */
export function writeOffInvoice(db: Database, actor: User, invoiceRef: string, amount: number, reason: string, jobId?: string) {
  if (actor.role !== "owner") return denied(db, actor, MODULE, "write off an invoice", "the owner");
  if (!reason.trim()) return fail("Give a reason for the write-off.", "reason");
  if (!(amount > 0)) return fail("Nothing is left to write off.");
  const r = postEvent(db, actor, { kind: "write_off", amount: roundMoney(amount), jobId }, { ref: invoiceRef, memo: `Written off: ${reason.trim()}`, href: `/invoices/${invoiceRef}` });
  if (!r.ok) return r;
  booksOf(db).writeOffs.push({ invoiceRef, amount: roundMoney(amount), reason: reason.trim(), by: actor.name, at: now(), entryId: r.value!.id });
  return r;
}

/** BK-M12: pay the state what the sales tax summary says is owed. */
export function recordStatePayment(db: Database, actor: User, amount: number) {
  const owed = salesTaxSummary(booksOf(db).journal).owed;
  if (!(amount > 0)) return fail("Enter the amount paid.", "amount");
  if (roundMoney(amount) > owed) return fail(`That is more than the ${owed.toFixed(2)} owed.`, "amount");
  return postEvent(db, actor, { kind: "sales_tax_paid", amount: roundMoney(amount) }, { ref: `TX-${now().slice(0, 7)}`, memo: "Sales tax paid to the state", party: "Texas Comptroller" });
}

/** BK-M10: a card batch reached the bank: the net to 1000, the fee to 6200. */
export function matchCardBatch(db: Database, actor: User, gross: number, fee: number) {
  const waiting = roundMoney(balances(booksOf(db).journal).get("1050") ?? 0);
  if (!(gross > 0)) return fail("Enter the batch total.", "gross");
  if (roundMoney(gross) > waiting) return fail(`Only ${waiting.toFixed(2)} is waiting to be deposited.`, "gross");
  if (fee < 0 || fee >= gross) return fail("The fee must be less than the batch.", "fee");
  return postEvent(db, actor, { kind: "card_batch", gross: roundMoney(gross), fee: roundMoney(fee) }, { ref: `BATCH-${now().slice(5, 10).replace("-", "")}`, memo: "Card batch reached the bank" });
}

/** BK-C2: a Gusto pay run imported as one journal entry. */
export function importGustoPayRun(db: Database, actor: User, run: { ref: string; wages: number; taxes: number; date: string }) {
  if (booksOf(db).journal.some((e) => e.source.kind === "payroll" && e.source.ref === run.ref && !e.reversedBy)) return fail(`Pay run ${run.ref} is already imported.`);
  return postEvent(db, actor, { kind: "payroll", wages: run.wages, taxes: run.taxes }, { date: run.date, ref: run.ref, memo: "Gusto pay run", party: "Gusto" });
}

/* ------------------------- Chart of accounts (BK-M2) ------------------------- */

const canEditChart = (actor: User) => actor.role === "bookkeeper" || actor.role === "owner";

export function saveAccount(db: Database, actor: User, account: Pick<LedgerAccount, "no" | "name" | "type">, editing?: string) {
  if (!canEditChart(actor)) return denied(db, actor, MODULE, "change the chart of accounts", "the bookkeeper or the owner");
  const books = booksOf(db);
  const problem = accountProblem(account, books.accounts, editing);
  if (problem) return fail(problem);
  if (editing) {
    const a = books.accounts.find((x) => x.no === editing);
    if (!a) return fail("Account not found.");
    if (a.system && (account.no !== a.no || account.type !== a.type)) return fail("A system account keeps its number and type. You can rename it.");
    if (a.no !== account.no && books.journal.some((e) => e.lines.some((l) => l.account === a.no))) return fail("This account has entries. Its number can't change.");
    Object.assign(a, account);
  } else books.accounts.push({ ...account, system: false, active: true });
  books.accounts.sort((a, b) => a.no.localeCompare(b.no));
  log(db, actor, MODULE, `Books: account ${account.no} ${account.name} ${editing ? "updated" : "added"} by ${actor.name}`);
  return ok();
}

export function setAccountActive(db: Database, actor: User, no: string, active: boolean) {
  if (!canEditChart(actor)) return denied(db, actor, MODULE, "change the chart of accounts", "the bookkeeper or the owner");
  const a = booksOf(db).accounts.find((x) => x.no === no);
  if (!a) return fail("Account not found.");
  if (a.system && !active) return fail("System accounts can't be deactivated.");
  a.active = active;
  return ok();
}

/* ------------------------------ Reconcile ------------------------------ */

/** Reconcile can only finish when the difference is $0.00. */
export function finishReconcile(db: Database, actor: User, input: { account: string; statementDate: string; statementBalance: number; openingBalance: number; ticked: number[] }) {
  if (!canKeepBooks(actor)) return denied(db, actor, MODULE, "reconcile", "the owner, the office manager or the bookkeeper");
  const diff = reconcileDifference(input.statementBalance, input.openingBalance, input.ticked);
  if (diff !== 0) return fail(`The difference is ${diff.toFixed(2)}. It must be 0.00 to finish.`);
  booksOf(db).reconciliations.push({ account: input.account, statementDate: input.statementDate, statementBalance: input.statementBalance, at: now(), by: actor.name });
  log(db, actor, MODULE, `Books: ${input.account} reconciled to the statement of ${input.statementDate} by ${actor.name}`);
  return ok();
}

/* ------------------------ Move from QuickBooks (BK-C5) ------------------------ */

export function completeMoveFromQbo(db: Database, actor: User) {
  if (actor.role !== "owner" && actor.role !== "bookkeeper") return denied(db, actor, MODULE, "move the books from QuickBooks", "the owner or the bookkeeper");
  const books = booksOf(db);
  books.movedFromQboAt = now();
  db.financeSettings.destination = "books";
  db.financeSettings.qbo = { ...db.financeSettings.qbo, connected: false };
  log(db, actor, MODULE, `Books: import from QuickBooks complete. QuickBooks has been disconnected (${actor.name}).`);
  return ok();
}

/* ------------------------------ Year end ------------------------------ */

/** Closing December rolls the year's profit into 3900 (retained earnings). Called from closePeriod. */
export function rollYearEnd(db: Database, actor: User, year: number) {
  const books = booksOf(db);
  if (books.journal.some((e) => e.source.kind === "year_end" && e.source.ref === `YE-${year}`)) return;
  const lines = yearEndLines(books.journal, books.accounts, year);
  if (!lines.length) return;
  const n = nextNumber(db, "je");
  books.journal.push({
    id: `JE-${n}`, no: n, date: `${year}-12-31`, source: { kind: "year_end", ref: `YE-${year}` }, memo: `Year-end roll ${year} into retained earnings`,
    lines, cash: [], postedBy: actor.name, postedAt: now(),
  });
  log(db, actor, MODULE, `Books: ${year} closed into 3900 Retained earnings by ${actor.name}`);
}
