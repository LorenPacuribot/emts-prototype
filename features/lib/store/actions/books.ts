/**
 * Feature 33 books (patent §33): checkbook register, bank and card feeds,
 * recurring expenses and financial alerts. Every cost entered here becomes a
 * normal finance record, so job cost, reports and the QuickBooks queue see
 * it once. Recording is never paying: nothing here moves money.
 */
import type { Database, FinanceRecord, User } from "@/features/types";
import type { FeedTransaction, FinanceAlertRule, RecurringExpense, RegisterEntry } from "@/features/types/finance";
import { can, whoCan } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { byId } from "@/features/lib/selectors";
import { roundMoney } from "@/features/lib/rules/rounding";
import { paymentNeedsOwner, postingPeriod } from "@/features/lib/rules/finance";
import { evaluateAlerts, recurringDueDates } from "@/features/lib/rules/books";
import { jobFinancials, queue } from "./finance";
import { notify } from "./notifications";
import { BOOK_COST_CODES } from "@/features/data/seed-finance";
import { denied, fail, log, nextId, ok } from "../helpers";

const MODULE = "Finance";
const iso = (day: string) => new Date(`${day.slice(0, 10)}T12:00:00`).toISOString();

function codeOk(db: Database, code?: string) {
  if (!code) return fail("Choose a cost code.", "costCode");
  const c = db.costCodes.find((x) => x.code === code);
  if (!c) return fail("That cost code doesn't exist.", "costCode");
  if (c.status !== "approved") return fail(`Cost code ${code} is waiting for the owner's approval.`, "costCode");
  return null;
}

function newCostRecord(db: Database, r: Omit<FinanceRecord, "id" | "period" | "origin">): FinanceRecord {
  const p = postingPeriod(r.date, db.financeSettings.closedPeriods);
  const rec: FinanceRecord = { ...r, id: nextId(db, "fin", "FIN-"), period: p.period, postedFromClosedPeriod: p.movedFrom, origin: "estimate_master" };
  db.financeRecords.unshift(rec);
  return rec;
}

/* ------------------------- Checkbook register ------------------------ */

export interface CheckDraft { accountId: string; payee: string; vendorId?: string; amount: number; date: string; purpose: string; jobId?: string; costCode?: string; number?: number }

/** Writes a check: a register line plus the check record that carries the job cost. */
export function writeCheck(db: Database, actor: User, d: CheckDraft) {
  if (!can(actor, "finance.recordPayment")) return denied(db, actor, MODULE, "write a check", whoCan("finance.recordPayment"));
  const acct = byId(db.bankAccounts ?? [], d.accountId);
  if (!acct || acct.kind === "credit_card") return fail("Choose a checking or savings account.", "accountId");
  if (!d.payee.trim()) return fail("Enter who the check is to.", "payee");
  if (!(d.amount > 0)) return fail("Enter the check amount.", "amount");
  if (!d.purpose.trim()) return fail("Say what the check is for.", "purpose");
  const bad = codeOk(db, d.costCode);
  if (bad) return bad;
  const number = d.number || acct.nextCheckNumber || 1001;
  if ((db.checkRegister ?? []).some((e) => e.accountId === acct.id && e.kind === "check" && e.number === number)) return fail(`Check #${number} is already in the register.`, "number");
  const date = iso(d.date || now());
  const held = paymentNeedsOwner(d.amount);
  const rec = newCostRecord(db, {
    type: "check", ref: `CHK-${number}`, party: d.payee.trim(), vendorId: d.vendorId || undefined, amount: roundMoney(d.amount), date, jobId: d.jobId || undefined,
    costCode: d.costCode, paymentMethod: "check", memo: d.purpose.trim(), approvalRequest: held ? { by: actor.id, at: now() } : undefined,
  });
  const entry: RegisterEntry = {
    id: nextId(db, "reg", "REG-"), accountId: acct.id, kind: "check", number, payee: rec.party, vendorId: rec.vendorId, amount: rec.amount, date, purpose: rec.memo!,
    jobId: rec.jobId, costCode: rec.costCode, recordId: rec.id, status: "written", createdBy: actor.id, createdAt: now(),
  };
  rec.checkId = entry.id;
  (db.checkRegister ??= []).push(entry);
  acct.nextCheckNumber = Math.max(acct.nextCheckNumber ?? 0, number + 1);
  if (!held) queue(db, actor, rec, `Check #${number} to ${rec.party}`);
  log(db, actor, MODULE, `Finance: Check #${number} to ${rec.party} for ${rec.amount.toFixed(2)} written in the register by ${actor.name}${rec.jobId ? ` (job ${rec.jobId}, ${rec.costCode})` : ` (${rec.costCode})`}${held ? ". Held for owner approval (above $2,500)" : ""}.`);
  return ok({ id: entry.id, number, held });
}

export function recordDeposit(db: Database, actor: User, d: { accountId: string; payee: string; amount: number; date: string; purpose: string }) {
  if (!can(actor, "finance.recordPayment")) return denied(db, actor, MODULE, "record a deposit", whoCan("finance.recordPayment"));
  const acct = byId(db.bankAccounts ?? [], d.accountId);
  if (!acct) return fail("Choose an account.", "accountId");
  if (!d.payee.trim()) return fail("Enter who the money is from.", "payee");
  if (!(d.amount > 0)) return fail("Enter the deposit amount.", "amount");
  const entry: RegisterEntry = {
    id: nextId(db, "reg", "REG-"), accountId: acct.id, kind: "deposit", payee: d.payee.trim(), amount: roundMoney(d.amount), date: iso(d.date || now()),
    purpose: d.purpose.trim() || "Deposit", status: "written", createdBy: actor.id, createdAt: now(),
  };
  (db.checkRegister ??= []).push(entry);
  log(db, actor, MODULE, `Finance: Deposit of ${entry.amount.toFixed(2)} from ${entry.payee} entered in the ${acct.name} register by ${actor.name}.`);
  return ok(entry.id);
}

export function clearRegisterEntry(db: Database, actor: User, id: string, cleared = true) {
  if (!can(actor, "finance.recordPayment")) return denied(db, actor, MODULE, "mark a register line cleared", whoCan("finance.recordPayment"));
  const e = byId(db.checkRegister ?? [], id);
  if (!e || e.status === "void") return fail("This line can't be cleared.");
  e.status = cleared ? "cleared" : "written";
  e.clearedAt = cleared ? now() : undefined;
  return ok();
}

/** Voids a check: it stays in the register at zero and its cost drops out of job cost. */
export function voidRegisterEntry(db: Database, actor: User, id: string, reason: string) {
  if (!can(actor, "finance.recordPayment")) return denied(db, actor, MODULE, "void a check", whoCan("finance.recordPayment"));
  const e = byId(db.checkRegister ?? [], id);
  if (!e || e.status === "void") return fail("This line is already void.");
  if (!reason.trim()) return fail("Say why it is being voided.", "reason");
  e.status = "void";
  e.voidedAt = now();
  e.voidedBy = actor.id;
  e.voidReason = reason.trim();
  const rec = byId(db.financeRecords, e.recordId);
  if (rec) {
    rec.voidedAt = e.voidedAt;
    rec.voidReason = e.voidReason;
    rec.approvalRequest = undefined;
    // Already in QuickBooks: send the void as a zero-amount correction.
    if (db.exchangeQueue.some((q) => q.recordId === rec.id && q.status !== "queued")) queue(db, actor, { ...rec, amount: 0 }, `Void check ${rec.ref}: ${e.voidReason}`);
    else for (const q of db.exchangeQueue.filter((x) => x.recordId === rec.id && x.status === "queued")) q.payload = { ...q.payload, amount: 0, description: `${q.payload.description} (void)` };
  }
  log(db, actor, MODULE, `Finance: ${e.kind === "check" ? `Check #${e.number}` : "Deposit"} to ${e.payee} (${e.amount.toFixed(2)}) voided by ${actor.name}: ${e.voidReason}. Kept in the register at zero.`);
  return ok();
}

/* --------------------------- Bank and card feeds --------------------- */

export function importFeedRows(db: Database, actor: User, accountId: string, rows: { date: string; description: string; amount: number; externalId?: string }[], origin: FeedTransaction["origin"] = "csv") {
  if (!can(actor, "finance.code")) return denied(db, actor, MODULE, "import bank transactions", whoCan("finance.code"));
  const acct = byId(db.bankAccounts ?? [], accountId);
  if (!acct) return fail("Choose the account these transactions belong to.", "accountId");
  db.feedTransactions ??= [];
  const key = (r: { date: string; description: string; amount: number }) => `${r.date.slice(0, 10)}|${r.description.trim().toLowerCase()}|${r.amount.toFixed(2)}`;
  const seen = new Set(db.feedTransactions.filter((t) => t.accountId === acct.id).map((t) => t.externalId ?? key(t)));
  let added = 0;
  let skipped = 0;
  for (const r of rows) {
    const id = r.externalId ?? key(r);
    if (seen.has(id)) { skipped++; continue; }
    seen.add(id);
    db.feedTransactions.unshift({
      id: nextId(db, "ftx", "FTX-"), source: acct.kind === "credit_card" ? "card" : "bank", accountId: acct.id, externalId: id, date: iso(r.date), description: r.description.trim(),
      amount: roundMoney(r.amount), status: "unreviewed", origin, importedAt: now(), importedBy: actor.id,
    });
    added++;
  }
  log(db, actor, MODULE, `Finance: ${added} ${acct.kind === "credit_card" ? "card" : "bank"} transaction${added === 1 ? "" : "s"} imported to ${acct.name} by ${actor.name}${skipped ? `; ${skipped} already imported, skipped` : ""}.`);
  return ok({ added, skipped });
}

/** Codes a feed line: money out becomes a receipt (job cost), money in becomes other income. */
export function codeFeedTransaction(db: Database, actor: User, id: string, d: { costCode?: string; jobId?: string; vendorId?: string; note?: string }) {
  if (!can(actor, "finance.code")) return denied(db, actor, MODULE, "code a bank transaction", whoCan("finance.code"));
  const t = byId(db.feedTransactions ?? [], id);
  if (!t || t.status !== "unreviewed") return fail("This transaction has already been reviewed.");
  if (t.amount < 0) {
    const bad = codeOk(db, d.costCode);
    if (bad) return bad;
    const vendor = byId(db.vendors, d.vendorId);
    const rec = newCostRecord(db, {
      type: "receipt", ref: `${t.source === "card" ? "CARD" : "BANK"}-${t.id.replace("FTX-", "")}`, party: vendor?.name ?? t.description, vendorId: vendor?.id, amount: roundMoney(-t.amount),
      date: t.date, jobId: d.jobId || undefined, costCode: d.costCode, paymentMethod: t.source === "card" ? "card" : "bank_transfer", feedTxnId: t.id, memo: d.note?.trim() || t.description,
    });
    queue(db, actor, rec, `${t.source === "card" ? "Card" : "Bank"} expense ${t.description}`);
    Object.assign(t, { status: "coded", costCode: d.costCode, jobId: rec.jobId, vendorId: rec.vendorId, recordId: rec.id, note: d.note?.trim() || undefined, reviewedBy: actor.id, reviewedAt: now() });
    log(db, actor, MODULE, `Finance: ${t.description} (${t.amount.toFixed(2)}) coded to ${d.costCode}${rec.jobId ? ` on ${rec.jobId}` : " (overhead)"} by ${actor.name}. Expense ${rec.ref} created.`);
    return ok(rec.id);
  }
  db.otherIncome ??= [];
  const inc = {
    id: nextId(db, "oi", "OI-"), kind: "other" as const, source: t.description, amount: t.amount, date: t.date, period: postingPeriod(t.date, db.financeSettings.closedPeriods).period,
    paymentMethod: "bank_transfer" as const, accountId: t.accountId, feedTxnId: t.id, note: d.note?.trim() || undefined, createdBy: actor.id, createdAt: now(), jobId: d.jobId || undefined,
  };
  db.otherIncome.unshift(inc);
  Object.assign(t, { status: "coded", incomeId: inc.id, jobId: inc.jobId, note: inc.note, reviewedBy: actor.id, reviewedAt: now() });
  log(db, actor, MODULE, `Finance: ${t.description} (${t.amount.toFixed(2)}) recorded as other income ${inc.id} by ${actor.name}.`);
  return ok(inc.id);
}

/** Matches a feed line to a record already in the books: nothing new is created. */
export function matchFeedTransaction(db: Database, actor: User, id: string, recordId: string) {
  if (!can(actor, "finance.code")) return denied(db, actor, MODULE, "match a bank transaction", whoCan("finance.code"));
  const t = byId(db.feedTransactions ?? [], id);
  const rec = byId(db.financeRecords, recordId);
  if (!t || t.status !== "unreviewed") return fail("This transaction has already been reviewed.");
  if (!rec) return fail("Choose the record it matches.");
  if (rec.feedTxnId) return fail(`${rec.ref} is already matched to another bank line.`);
  rec.feedTxnId = t.id;
  Object.assign(t, { status: "matched", recordId: rec.id, jobId: rec.jobId, costCode: rec.costCode, reviewedBy: actor.id, reviewedAt: now() });
  const check = rec.checkId ? byId(db.checkRegister ?? [], rec.checkId) : undefined;
  if (check && check.status === "written") { check.status = "cleared"; check.clearedAt = now(); }
  log(db, actor, MODULE, `Finance: ${t.description} (${t.amount.toFixed(2)}) matched to ${rec.ref} by ${actor.name}. No second expense.${check ? ` Check #${check.number} marked cleared.` : ""}`);
  return ok();
}

export function excludeFeedTransaction(db: Database, actor: User, id: string, note: string) {
  if (!can(actor, "finance.code")) return denied(db, actor, MODULE, "exclude a bank transaction", whoCan("finance.code"));
  const t = byId(db.feedTransactions ?? [], id);
  if (!t || t.status !== "unreviewed") return fail("This transaction has already been reviewed.");
  if (!note.trim()) return fail("Say why it is excluded (e.g. transfer between our accounts).", "note");
  Object.assign(t, { status: "excluded", note: note.trim(), reviewedBy: actor.id, reviewedAt: now() });
  log(db, actor, MODULE, `Finance: ${t.description} (${t.amount.toFixed(2)}) excluded by ${actor.name}: ${t.note}.`);
  return ok();
}

/** Puts a reviewed line back in the queue; the record it created is voided. */
export function undoFeedReview(db: Database, actor: User, id: string) {
  if (!can(actor, "finance.code")) return denied(db, actor, MODULE, "undo a bank review", whoCan("finance.code"));
  const t = byId(db.feedTransactions ?? [], id);
  if (!t || t.status === "unreviewed") return fail("Nothing to undo.");
  const rec = byId(db.financeRecords, t.recordId);
  if (t.status === "coded" && rec) { rec.voidedAt = now(); rec.voidReason = "Bank review undone"; rec.feedTxnId = undefined; }
  if (t.status === "matched" && rec) rec.feedTxnId = undefined;
  if (t.incomeId) { const inc = byId(db.otherIncome ?? [], t.incomeId); if (inc) { inc.voidedAt = now(); inc.voidReason = "Bank review undone"; } }
  Object.assign(t, { status: "unreviewed", recordId: undefined, incomeId: undefined, costCode: undefined, jobId: undefined, vendorId: undefined, note: undefined, reviewedBy: undefined, reviewedAt: undefined });
  log(db, actor, MODULE, `Finance: Review of ${t.description} undone by ${actor.name}; back in the review queue.`);
  return ok();
}

/** Sandbox bank connection: pulls a few realistic lines, as a live feed would. */
export function pullSandboxFeed(db: Database, actor: User, accountId: string) {
  const acct = byId(db.bankAccounts ?? [], accountId);
  if (!acct) return fail("Choose an account.");
  const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  const stamp = new Date().toISOString().slice(0, 13);
  const rows = acct.kind === "credit_card"
    ? [{ date: day(1), description: "SHELL OIL 57442", amount: -68.41 }, { date: day(1), description: "SHERWIN-WILLIAMS #7132", amount: -212.9 }, { date: day(0), description: "HOME DEPOT #0544", amount: -54.17 }]
    : [{ date: day(1), description: "ACH DEPOSIT STRIPE PAYOUT", amount: 1840.0 }, { date: day(0), description: "CHECK 1043", amount: -380.0 }];
  return importFeedRows(db, actor, accountId, rows.map((r) => ({ ...r, externalId: `SBX-${acct.id}-${stamp}-${r.description}` })), "sandbox");
}

/* --------------------------- Recurring expenses ---------------------- */

const HORIZON_DAYS = 60;

/** Saved data from before the books keeps its cost codes; add the overhead codes the recurring seed uses. */
function ensureBookCodes(db: Database) {
  for (const c of BOOK_COST_CODES) {
    if (!db.costCodes.some((x) => x.code === c.code)) db.costCodes.push({ ...c, status: "approved", proposedBy: "U-BOOK", approvedBy: "U-OWNER", approvedAt: now() });
  }
}

/** Keeps expected occurrences generated up to 60 days ahead. Safe to run repeatedly. */
export function generateOccurrences(db: Database, at = now()) {
  ensureBookCodes(db);
  db.recurringOccurrences ??= [];
  const to = new Date(Date.parse(at) + HORIZON_DAYS * 86_400_000).toISOString();
  let added = 0;
  for (const rec of (db.recurringExpenses ?? []).filter((r) => r.active)) {
    const known = new Set(db.recurringOccurrences.filter((o) => o.recurringId === rec.id).map((o) => o.dueDate.slice(0, 10)));
    const firstFrom = new Date(Date.parse(at) - 45 * 86_400_000).toISOString();
    for (const due of recurringDueDates(rec, rec.createdAt > firstFrom ? rec.startDate : firstFrom, to)) {
      if (known.has(due)) continue;
      db.recurringOccurrences.push({ id: nextId(db, "roc", "ROC-"), recurringId: rec.id, dueDate: due, amount: rec.amount, status: "expected" });
      added++;
    }
  }
  return added;
}

export type RecurringDraft = Omit<RecurringExpense, "id" | "createdBy" | "createdAt" | "active"> & { id?: string; active?: boolean };

export function saveRecurring(db: Database, actor: User, d: RecurringDraft) {
  if (!can(actor, "finance.code")) return denied(db, actor, MODULE, "set up a recurring expense", whoCan("finance.code"));
  if (!d.name.trim()) return fail("Name the expense.", "name");
  if (!d.payee.trim()) return fail("Enter who it is paid to.", "payee");
  if (!(d.amount > 0)) return fail("Enter the amount.", "amount");
  if (!d.startDate) return fail("Choose the first due date.", "startDate");
  if (d.endDate && d.endDate < d.startDate) return fail("The end date is before the first due date.", "endDate");
  const bad = codeOk(db, d.costCode);
  if (bad) return bad;
  db.recurringExpenses ??= [];
  const existing = d.id ? byId(db.recurringExpenses, d.id) : undefined;
  const clean = { ...d, name: d.name.trim(), payee: d.payee.trim(), amount: roundMoney(d.amount), reminderDays: Math.max(0, Math.round(d.reminderDays || 0)) };
  if (existing) {
    Object.assign(existing, clean, { active: d.active ?? existing.active });
    // Future expected dates follow the new schedule.
    db.recurringOccurrences = (db.recurringOccurrences ?? []).filter((o) => o.recurringId !== existing.id || o.status !== "expected" || o.dueDate < now().slice(0, 10));
  } else {
    db.recurringExpenses.push({ ...clean, id: nextId(db, "rec", "REC-"), active: d.active ?? true, createdBy: actor.id, createdAt: now() });
  }
  generateOccurrences(db);
  log(db, actor, MODULE, `Finance: Recurring expense ${clean.name} (${clean.amount.toFixed(2)} ${clean.frequency}) ${existing ? "updated" : "set up"} by ${actor.name}.`);
  return ok(existing?.id ?? db.recurringExpenses.at(-1)!.id);
}

export function setRecurringActive(db: Database, actor: User, id: string, active: boolean) {
  if (!can(actor, "finance.code")) return denied(db, actor, MODULE, "pause a recurring expense", whoCan("finance.code"));
  const rec = byId(db.recurringExpenses ?? [], id);
  if (!rec) return fail("Not found.");
  rec.active = active;
  if (!active) db.recurringOccurrences = (db.recurringOccurrences ?? []).filter((o) => o.recurringId !== id || o.status !== "expected");
  else generateOccurrences(db);
  log(db, actor, MODULE, `Finance: Recurring expense ${rec.name} ${active ? "resumed" : "paused"} by ${actor.name}.`);
  return ok();
}

/** Posting an occurrence records the expense (once) with the schedule's cost code. */
export function postOccurrence(db: Database, actor: User, id: string, amount?: number) {
  if (!can(actor, "finance.code")) return denied(db, actor, MODULE, "post a recurring expense", whoCan("finance.code"));
  const o = byId(db.recurringOccurrences ?? [], id);
  const rec = o && byId(db.recurringExpenses ?? [], o.recurringId);
  if (!o || !rec) return fail("Not found.");
  if (o.status !== "expected") return fail(`This one was already ${o.status}.`);
  const amt = roundMoney(amount ?? o.amount);
  if (!(amt > 0)) return fail("Enter the amount paid.", "amount");
  const r = newCostRecord(db, {
    type: "bill", ref: `${rec.id}-${o.dueDate}`, party: rec.payee, vendorId: rec.vendorId, amount: amt, date: iso(o.dueDate), dueDate: iso(o.dueDate), costCode: rec.costCode,
    paymentMethod: rec.paymentMethod, vehicleId: rec.vehicleId, equipmentId: rec.equipmentId, recurringOccurrenceId: o.id, memo: rec.name, paymentStatus: "paid", amountPaid: amt, paymentDate: now(),
  });
  queue(db, actor, r, `${rec.name} (${o.dueDate})`);
  Object.assign(o, { status: "posted", amount: amt, recordId: r.id, postedAt: now(), postedBy: actor.id });
  log(db, actor, MODULE, `Finance: Recurring ${rec.name} for ${o.dueDate} posted by ${actor.name}: ${amt.toFixed(2)} to ${rec.costCode}.`);
  return ok(r.id);
}

export function skipOccurrence(db: Database, actor: User, id: string, reason: string) {
  if (!can(actor, "finance.code")) return denied(db, actor, MODULE, "skip a recurring expense", whoCan("finance.code"));
  const o = byId(db.recurringOccurrences ?? [], id);
  if (!o || o.status !== "expected") return fail("Only an expected payment can be skipped.");
  if (!reason.trim()) return fail("Say why it is skipped.", "reason");
  Object.assign(o, { status: "skipped", skippedReason: reason.trim() });
  log(db, actor, MODULE, `Finance: Recurring payment ${o.id} due ${o.dueDate} skipped by ${actor.name}: ${o.skippedReason}.`);
  return ok();
}

/* --------------------------------- Alerts ---------------------------- */

export function saveAlertRule(db: Database, actor: User, d: Omit<FinanceAlertRule, "id" | "createdBy" | "createdAt"> & { id?: string }) {
  if (!can(actor, "finance.access")) return denied(db, actor, MODULE, "set up a financial alert", whoCan("finance.access"));
  if (!d.name.trim()) return fail("Name the alert.", "name");
  if (!Number.isFinite(d.threshold)) return fail("Enter the limit.", "threshold");
  if (d.metric === "category_spend" && !d.costCode) return fail("Choose the cost code to watch.", "costCode");
  if (d.metric === "vendor_spend" && !d.vendorId) return fail("Choose the vendor to watch.", "vendorId");
  db.financeAlertRules ??= [];
  const existing = d.id ? byId(db.financeAlertRules, d.id) : undefined;
  if (existing) Object.assign(existing, { ...d, name: d.name.trim() });
  else db.financeAlertRules.push({ ...d, name: d.name.trim(), id: nextId(db, "far", "FAR-"), createdBy: actor.id, createdAt: now() });
  log(db, actor, MODULE, `Finance: Alert "${d.name.trim()}" ${existing ? "updated" : "created"} by ${actor.name}.`);
  return ok();
}

export function deleteAlertRule(db: Database, actor: User, id: string) {
  if (!can(actor, "finance.access")) return denied(db, actor, MODULE, "delete a financial alert", whoCan("finance.access"));
  const r = byId(db.financeAlertRules ?? [], id);
  if (!r) return fail("Not found.");
  db.financeAlertRules = db.financeAlertRules!.filter((x) => x.id !== id);
  log(db, actor, MODULE, `Finance: Alert "${r.name}" deleted by ${actor.name}.`);
  return ok();
}

export function jobMargins(db: Database) {
  return db.jobs.filter((j) => j.status !== "completed" && db.estimateBaselines.some((b) => b.jobId === j.id)).map((j) => {
    const f = jobFinancials(db, j.id);
    const b = db.estimateBaselines.find((x) => x.jobId === j.id)!;
    const cost = b.estimate.labourCost + b.estimate.material + b.estimate.subcontractor;
    return { jobId: j.id, projected: f.projected, estimated: f.contractExTax > 0 ? (f.contractExTax - cost) / f.contractExTax : null };
  });
}

/**
 * Raises a notice (and a bell notification for owner, office manager and
 * bookkeeper) for each alert not raised before. Keys make it idempotent.
 */
export function refreshFinanceAlerts(db: Database, actor: User) {
  if (!can(actor, "finance.access")) return ok(0);
  generateOccurrences(db);
  const alerts = evaluateAlerts(db, now(), jobMargins(db));
  db.financeNotices ??= [];
  const known = new Set(db.financeNotices.map((n) => n.key));
  const fresh = alerts.filter((a) => !known.has(a.key));
  const recipients = db.users.filter((u) => ["owner", "office_manager", "bookkeeper"].includes(u.role)).map((u) => u.id);
  for (const a of fresh) {
    db.financeNotices.unshift({ id: nextId(db, "fnt", "FNT-"), key: a.key, kind: a.kind, severity: a.severity, title: a.title, detail: a.detail, href: a.href, raisedAt: now() });
    if (a.severity !== "info") notify(db, recipients, { kind: "finance_alert", title: a.title, body: a.detail, href: a.href ?? "/accounting/alerts" });
  }
  return ok(fresh.length);
}

export function dismissFinanceNotice(db: Database, actor: User, id: string) {
  if (!can(actor, "finance.access")) return denied(db, actor, MODULE, "dismiss an alert", whoCan("finance.access"));
  const n = byId(db.financeNotices ?? [], id);
  if (!n) return fail("Not found.");
  n.dismissedAt = now();
  return ok();
}

export function saveAlertDefaults(db: Database, actor: User, d: { highExpenseFactor: number; rollingMonths: number; marginDropPts: number; arTermsDays: number }) {
  if (!can(actor, "finance.config")) return denied(db, actor, MODULE, "change alert settings", whoCan("finance.config"));
  if (!(d.highExpenseFactor > 0) || !(d.rollingMonths >= 1) || !(d.marginDropPts > 0) || !(d.arTermsDays >= 0)) return fail("Enter positive numbers.");
  db.financeSettings.alertDefaults = { highExpenseFactor: d.highExpenseFactor, rollingMonths: Math.round(d.rollingMonths), marginDropPts: d.marginDropPts };
  db.financeSettings.arTermsDays = Math.round(d.arTermsDays);
  log(db, actor, MODULE, `Finance: Alert settings changed by ${actor.name}.`);
  return ok();
}
