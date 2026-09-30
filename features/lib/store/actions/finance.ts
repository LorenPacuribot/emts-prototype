/**
 * Feature 33 — Financial And Accounting Management.
 *
 * QuickBooks Online owns invoices, bills, payments, deposits, checks, credits
 * and the chart of accounts. Estimate Master owns estimates, changes, purchase
 * orders, job allocations and material issues. No field has two editing
 * authorities, and nothing here moves money: these actions record approved
 * financial events and their external references.
 *
 * QuickBooks is simulated. "Run exchange" stands in for the hourly job.
 */
import type { Database, ExchangeItem, FinanceAllocation, FinanceRecord, FinanceRecordType, User } from "@/features/types";
import { can, whoCan } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { byId } from "@/features/lib/selectors";
import { roundMoney } from "@/features/lib/rules/rounding";
import { compareJobNumber } from "@/features/lib/rules/allocation";
import {
  actualMargin, allocateSource, allocationDifference, inExchangeWindow, isDuplicateExpense, matchBill, nextExchangeRun, paymentNeedsOwner,
  periodOf, postingPeriod, projectedMargin, reimbursementSteps, shouldEscalate,
} from "@/features/lib/rules/finance";
import { jobLabourCost } from "@/features/lib/rules/labour-cost";
import { contractSummary, coPricing } from "./change-orders";
import { denied, fail, log, nextId, ok, randomRef, userName } from "../helpers";

const MODULE = "Finance";

/* ------------------------------ Selectors ---------------------------- */

/** Records with the job cost they carry for one job (allocations win over the header job). */
export function recordJobAmount(r: FinanceRecord, jobId: string): number {
  if (r.allocations?.length) return roundMoney(r.allocations.filter((a) => a.jobId === jobId).reduce((x, a) => x + a.amount, 0));
  return r.jobId === jobId && !r.allocations?.some((a) => a.overhead) ? r.amount : 0;
}

const COST_TYPES: FinanceRecordType[] = ["bill", "receipt", "check"];

/** Is this record a live cost (not a settlement, not deleted, not an overhead-only record)? */
function isCost(r: FinanceRecord) {
  return COST_TYPES.includes(r.type) && !r.deletedInQbo && !r.approvalRequest && !r.voidedAt;
}

export interface JobFinancials {
  jobId: string;
  contractExTax: number;
  invoicedExTax: number;
  salesTax: number;
  labour: number;
  material: number;
  subcontractor: number;
  other: number;
  credits: number;
  costToDate: number;
  forecastCost: number;
  actual: number | null;
  projected: number | null;
  unmatched: number;
  inProgress: boolean;
}

/**
 * Job cost to date: Rule 3 labour allocations, supplier bills and receipts
 * including purchase tax, less supplier credits. Customer sales tax is never
 * revenue. Deposits are liabilities, not revenue.
 */
export function jobFinancials(db: Database, jobId: string): JobFinancials {
  const job = byId(db.jobs, jobId)!;
  const invoices = db.financeRecords.filter((r) => r.type === "invoice" && r.jobId === jobId && !r.deletedInQbo);
  const invoicedExTax = roundMoney(invoices.reduce((a, r) => a + r.amount, 0));
  const salesTax = roundMoney(invoices.reduce((a, r) => a + (r.salesTax ?? 0), 0));
  const labour = jobLabourCost(db.labourCosts, jobId);
  let material = 0;
  let subcontractor = 0;
  let other = 0;
  for (const r of db.financeRecords.filter(isCost)) {
    const amt = recordJobAmount(r, jobId);
    if (!amt) continue;
    const share = r.amount ? amt / r.amount : 0;
    const gross = amt + (r.purchaseTax ?? 0) * share;
    if (r.costCode === "SUB") subcontractor += gross;
    else if (r.costCode === "PAINT" || r.costCode === "SUND") material += gross;
    else other += gross;
  }
  const credits = roundMoney(db.financeRecords.filter((r) => r.type === "credit" && r.jobId === jobId && !r.deletedInQbo && r.creditOfRecordId).reduce((a, r) => a + r.amount, 0));
  const costToDate = roundMoney(labour + material + subcontractor + other - credits);
  const summary = contractSummary(db, job);
  const contractExTax = summary.revisedTotal;
  const baseline = db.estimateBaselines.find((b) => b.jobId === jobId);
  const changeCost = db.changeOrders.filter((c) => c.jobId === jobId && (c.status === "approved" || c.status === "disputed"))
    .reduce((a, c) => a + c.lines.reduce((x, l) => x + (l.kind === "add" ? l.cost : -l.cost), 0), 0);
  const estimatedCost = baseline ? baseline.estimate.labourCost + baseline.estimate.material + baseline.estimate.subcontractor + changeCost : costToDate;
  const inProgress = job.status !== "completed";
  const forecastCost = roundMoney(inProgress ? Math.max(costToDate, estimatedCost) : costToDate);
  const unmatched = roundMoney(db.financeRecords.filter((r) => r.type === "bill" && r.jobId === jobId && r.match && r.match.unmatchedValue > 0).reduce((a, r) => a + r.match!.unmatchedValue, 0));
  return {
    jobId, contractExTax, invoicedExTax, salesTax, labour, material: roundMoney(material), subcontractor: roundMoney(subcontractor), other: roundMoney(other), credits, costToDate, forecastCost,
    actual: actualMargin(invoicedExTax, costToDate), projected: inProgress ? projectedMargin(contractExTax, forecastCost) : null, unmatched, inProgress,
  };
}

/** Change-order net for display on the invoice list (pre-tax). */
export function coNet(db: Database, coId: string) {
  const co = byId(db.changeOrders, coId);
  return co ? coPricing(db, co).net : 0;
}

export function latestItem(db: Database, recordId: string): ExchangeItem | undefined {
  return db.exchangeQueue.filter((q) => q.recordId === recordId && !q.supersededBy).sort((a, b) => b.version - a.version)[0];
}

/** Sent to QuickBooks: amounts are then edited in QuickBooks, not here. */
export function isSentToQbo(db: Database, r: FinanceRecord): boolean {
  if (r.origin === "quickbooks") return true;
  return db.exchangeQueue.some((q) => q.recordId === r.id && (q.status === "sent" || q.status === "accepted"));
}

export function unallocated(db: Database): FinanceRecord[] {
  return db.financeRecords.filter((r) => r.origin === "quickbooks" && !r.jobId && !r.costCode && !r.allocations?.length && !r.deletedInQbo && isCost(r));
}

/* ------------------------------ Connection --------------------------- */

export function connectQuickBooks(db: Database, actor: User) {
  if (!can(actor, "finance.connect")) return denied(db, actor, MODULE, "connect QuickBooks Online", whoCan("finance.connect"));
  if (db.financeSettings.qbo.connected) return fail("QuickBooks Online is already connected.");
  db.financeSettings.qbo = { ...db.financeSettings.qbo, connected: true, connectedBy: actor.id, connectedAt: now(), realm: `QBO-${randomRef(6)}` };
  log(db, actor, MODULE, `Finance: QuickBooks Online connection established by ${actor.name} at ${new Date().toLocaleString()}`);
  return ok();
}

/* ------------------------------- Exchange ---------------------------- */

export function queue(db: Database, actor: User, record: FinanceRecord, description: string, extra: Partial<ExchangeItem> = {}) {
  const prior = db.exchangeQueue.filter((q) => q.recordId === record.id);
  const version = prior.reduce((a, q) => Math.max(a, q.version), 0) + 1;
  const item: ExchangeItem = {
    id: nextId(db, "exq", "EXQ-"), recordId: record.id, version, status: "queued",
    payload: { amount: record.amount, jobId: record.jobId, costCode: record.costCode, description },
    idempotencyKey: `${record.id}-v${version}`, queuedAt: now(), queuedBy: actor.id, attempts: [], ...extra,
  };
  db.exchangeQueue.unshift(item);
  log(db, actor, MODULE, `Finance: Record ${record.type} ${record.ref} status Queued at ${new Date().toLocaleString()}. Attempt 0`);
  return item;
}

/**
 * The hourly run (simulated). Queued items are sent; QuickBooks accepts or
 * rejects each one. A repeat send with the same idempotency key never
 * creates a second record. Two failures escalate to the bookkeeper.
 */
export function runExchange(db: Database, actor: User) {
  if (!can(actor, "finance.exchange")) return denied(db, actor, MODULE, "run the QuickBooks exchange", whoCan("finance.exchange"));
  if (!db.financeSettings.qbo.connected) return fail("Connect QuickBooks Online first.");
  const t = new Date(now());
  if (!inExchangeWindow(t)) return fail(`The exchange runs hourly from 6 a.m. to 6 p.m., Monday to Saturday. Next run: ${nextExchangeRun(t).toLocaleString()}.`);
  const queued = db.exchangeQueue.filter((q) => q.status === "queued" && !q.supersededBy);
  if (!queued.length) return fail("Nothing is queued for QuickBooks.");
  const at = t.toISOString();
  let accepted = 0;
  let rejected = 0;
  for (const q of queued) {
    const record = byId(db.financeRecords, q.recordId);
    q.sentAt = at;
    const duplicate = db.exchangeQueue.some((x) => x !== q && x.idempotencyKey === q.idempotencyKey && x.status === "accepted");
    if (q.simulateError && !duplicate) {
      q.status = "rejected";
      q.attempts.push({ at, ok: false, error: q.simulateError });
      rejected++;
      const failures = q.attempts.filter((a) => !a.ok).length;
      log(db, actor, MODULE, `Finance: Record ${record?.type} ${record?.ref ?? q.recordId} status Rejected at ${t.toLocaleString()}. Attempt ${q.attempts.length}`);
      if (shouldEscalate(failures) && !q.escalatedAt) {
        q.escalatedAt = at;
        log(db, actor, MODULE, `Finance: Record ${record?.ref ?? q.recordId} failed twice. Escalated to bookkeeper at ${t.toLocaleString()}`);
      }
      continue;
    }
    q.status = "accepted";
    q.attempts.push({ at, ok: true });
    accepted++;
    if (record && !record.externalRef) record.externalRef = `QBO-${record.type.toUpperCase().slice(0, 3)}-${randomRef(5)}`;
    log(db, actor, MODULE, `Finance: Record ${record?.type} ${record?.ref ?? q.recordId} status Accepted at ${t.toLocaleString()}. Attempt ${q.attempts.length}${duplicate ? " (already in QuickBooks — no duplicate created)" : ""}`);
  }
  db.financeSettings.qbo.lastExchangeAt = at;
  return ok({ accepted, rejected });
}

/** A rejected item can be retried by a person. Automatic retries never happen. */
export function retryItem(db: Database, actor: User, itemId: string) {
  if (!can(actor, "finance.exchange")) return denied(db, actor, MODULE, "retry an exchange item", whoCan("finance.exchange"));
  const q = byId(db.exchangeQueue, itemId);
  if (!q || q.status !== "rejected") return fail("Only a rejected item can be retried.");
  if (q.supersededBy) return fail("This version was replaced by a correction.");
  q.status = "queued";
  log(db, actor, MODULE, `Finance: Record ${q.recordId} re-queued by ${actor.name} after ${q.attempts.filter((a) => !a.ok).length} failure(s).`);
  return ok();
}

/** Only a queued item can be edited. After send, the exact version is preserved. */
export function editQueuedItem(db: Database, actor: User, itemId: string, changes: { amount?: number; jobId?: string; costCode?: string; description?: string }) {
  if (!can(actor, "finance.exchange")) return denied(db, actor, MODULE, "edit an exchange item", whoCan("finance.exchange"));
  const q = byId(db.exchangeQueue, itemId);
  if (!q) return fail("Item not found.");
  if (q.status !== "queued") return fail("This version has been sent and is frozen. Create a correction version instead.");
  if (changes.amount !== undefined && !(changes.amount > 0)) return fail("Enter an amount above zero.", "amount");
  Object.assign(q.payload, Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)));
  const record = byId(db.financeRecords, q.recordId);
  if (record && changes.amount !== undefined && record.origin === "estimate_master") record.amount = roundMoney(changes.amount);
  log(db, actor, MODULE, `Finance: Queued record ${q.recordId} v${q.version} edited before send by ${actor.name}.`);
  return ok();
}

/** A correction after send becomes a new version. The sent or failed version is kept. */
export function createCorrectionVersion(db: Database, actor: User, itemId: string, changes: { amount?: number; costCode?: string; description?: string }) {
  if (!can(actor, "finance.exchange")) return denied(db, actor, MODULE, "correct an exchange item", whoCan("finance.exchange"));
  const q = byId(db.exchangeQueue, itemId);
  if (!q) return fail("Item not found.");
  if (q.status === "queued") return fail("A queued item can be edited directly.");
  if (q.supersededBy) return fail("This version already has a correction.");
  const record = byId(db.financeRecords, q.recordId);
  if (!record) return fail("Record not found.");
  const version = db.exchangeQueue.filter((x) => x.recordId === q.recordId).reduce((a, x) => Math.max(a, x.version), 0) + 1;
  const next: ExchangeItem = {
    id: nextId(db, "exq", "EXQ-"), recordId: q.recordId, version, status: "queued",
    payload: { ...q.payload, ...Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)) },
    idempotencyKey: `${q.recordId}-v${version}`, queuedAt: now(), queuedBy: actor.id, attempts: [], correctionOf: q.id,
  };
  db.exchangeQueue.unshift(next);
  q.supersededBy = next.id;
  log(db, actor, MODULE, `Finance: Record ${record.ref} corrected as new version ${next.id} by ${actor.name}. Sent version preserved.`);
  return ok(next.id);
}

/* ---------------------- QuickBooks returns (simulated) --------------- */

/** An amount edited in QuickBooks overwrites the display value and raises a variance flag. */
export function simulateQboEdit(db: Database, actor: User, recordId: string, newAmount: number) {
  const r = byId(db.financeRecords, recordId);
  if (!r) return fail("Record not found.");
  if (!isSentToQbo(db, r)) return fail("This record hasn't reached QuickBooks yet.");
  if (!(newAmount > 0)) return fail("Enter the amount QuickBooks now shows.", "amount");
  const sent = r.variance?.sent ?? r.amount;
  r.amount = roundMoney(newAmount);
  r.variance = { sent, current: r.amount, at: now() };
  log(db, actor, MODULE, `Finance: Invoice ${r.ref} amount edited in QuickBooks from ${sent.toFixed(2)} to ${r.amount.toFixed(2)}. Variance flag raised for office manager review.`);
  return ok();
}

/** A QuickBooks deletion is flagged for review. The local record is never deleted. */
export function simulateQboDelete(db: Database, actor: User, recordId: string) {
  const r = byId(db.financeRecords, recordId);
  if (!r) return fail("Record not found.");
  if (r.deletedInQbo) return fail("Already flagged as deleted in QuickBooks.");
  r.deletedInQbo = { at: now() };
  log(db, actor, MODULE, `Finance: QuickBooks record ${r.externalRef ?? r.ref} reported deleted. Local record ${r.id} flagged for review, not deleted.`);
  return ok();
}

/** A QuickBooks record arriving with no job or cost code goes to the unallocated list. */
export function simulateQboArrival(db: Database, actor: User) {
  const r: FinanceRecord = {
    id: nextId(db, "fin", "FIN-"), type: "receipt", ref: `QBO receipt ${randomRef(4)}`, externalRef: `QBO-RCT-${randomRef(5)}`,
    party: "Lowe's #1187 — masking film and rollers", amount: 58.37, purchaseTax: 4.82, date: now(), period: periodOf(now()), origin: "quickbooks",
  };
  db.financeRecords.unshift(r);
  log(db, actor, MODULE, `Finance: QuickBooks record ${r.externalRef} arrived without job or cost code. Added to unallocated list.`);
  return ok(r.id);
}

export function reviewVariance(db: Database, actor: User, recordId: string) {
  if (!can(actor, "finance.reviewVariance")) return denied(db, actor, MODULE, "review a QuickBooks variance", whoCan("finance.reviewVariance"));
  const r = byId(db.financeRecords, recordId);
  if (!r?.variance || r.variance.reviewedAt) return fail("No open variance on this record.");
  Object.assign(r.variance, { reviewedBy: actor.id, reviewedAt: now() });
  log(db, actor, MODULE, `Finance: Variance on ${r.ref} reviewed by ${actor.name}. QuickBooks amount ${r.amount.toFixed(2)} stands.`);
  return ok();
}

export function reviewDeletion(db: Database, actor: User, recordId: string, note: string) {
  if (!can(actor, "finance.code")) return denied(db, actor, MODULE, "review a QuickBooks deletion", whoCan("finance.code"));
  const r = byId(db.financeRecords, recordId);
  if (!r?.deletedInQbo || r.deletedInQbo.reviewedAt) return fail("No open deletion flag on this record.");
  if (!note.trim()) return fail("Record what you found.", "note");
  Object.assign(r.deletedInQbo, { reviewedBy: actor.id, reviewedAt: now(), note: note.trim() });
  log(db, actor, MODULE, `Finance: Deletion of ${r.externalRef ?? r.ref} reviewed by ${actor.name}: ${note.trim()}. Local record kept.`);
  return ok();
}

/** Amounts are owned by QuickBooks once sent. */
export function editRecordAmount(db: Database, actor: User, recordId: string, amount: number) {
  const r = byId(db.financeRecords, recordId);
  if (!r) return fail("Record not found.");
  if (isSentToQbo(db, r)) {
    log(db, actor, MODULE, `Blocked: ${actor.name} attempted to edit the amount of ${r.ref} after it reached QuickBooks.`, true);
    return fail("This record is in QuickBooks. Change the amount in QuickBooks; the new value comes back on the next exchange.");
  }
  if (!can(actor, "finance.exchange")) return denied(db, actor, MODULE, "edit a finance record", whoCan("finance.exchange"));
  if (!(amount > 0)) return fail("Enter an amount above zero.", "amount");
  r.amount = roundMoney(amount);
  const q = latestItem(db, r.id);
  if (q?.status === "queued") q.payload.amount = r.amount;
  log(db, actor, MODULE, `Finance: ${r.ref} amount set to ${r.amount.toFixed(2)} before send by ${actor.name}.`);
  return ok();
}

/* ------------------------ Coding and allocation ---------------------- */

function checkCode(db: Database, code?: string) {
  if (!code) return fail("Choose a cost code.", "costCode");
  const c = db.costCodes.find((x) => x.code === code);
  if (!c) return fail("Unknown cost code.", "costCode");
  if (c.status !== "approved") return fail(`Cost code ${code} is waiting for the business owner's approval.`, "costCode");
  return null;
}

/**
 * Save a job allocation. Rows must sum exactly to the source amount;
 * vehicle and equipment costs stay overhead. The job and cost code are
 * owned here and are sent to QuickBooks, never overwritten by it.
 */
export function saveAllocation(db: Database, actor: User, recordId: string, costCode: string, rows: FinanceAllocation[]) {
  if (!can(actor, "finance.code")) return denied(db, actor, MODULE, "allocate a cost", whoCan("finance.code"));
  const r = byId(db.financeRecords, recordId);
  if (!r) return fail("Record not found.");
  const bad = checkCode(db, costCode);
  if (bad) return bad;
  if (!rows.length) return fail("Add at least one allocation row.");
  if (rows.some((x) => !x.overhead && !x.jobId)) return fail("Choose a job for every row, or mark it overhead.", "rows");
  if (costCode === "VEH" && rows.some((x) => !x.overhead)) return fail("Vehicle and equipment costs remain overhead. They are not allocated to jobs.", "rows");
  const diff = allocationDifference(r.amount, rows);
  if (diff !== 0) return fail(`Rows must sum to ${r.amount.toFixed(2)}. Difference: ${diff.toFixed(2)}.`, "rows");
  r.costCode = costCode;
  r.allocations = rows.map((x) => ({ ...x, amount: roundMoney(x.amount) }));
  r.jobId = rows.length === 1 && rows[0].jobId ? rows[0].jobId : undefined;
  queue(db, actor, r, `Job allocation for ${r.ref}`);
  log(db, actor, MODULE, `Finance: Source amount ${r.amount.toFixed(2)} allocated across ${rows.filter((x) => x.jobId).length} jobs by ${actor.name}.${r.residual ? ` Residual ${r.residual.amount.toFixed(2)} assigned to job ${r.residual.jobId} (${r.residual.rule === "lowest_job_number" ? "LowestJobNumber" : "LargestAllocation"})` : ""}`);
  return ok();
}

/** Proportional split with the Rule 5 residual, used to prefill the allocation panel. */
export function proposeSplit(db: Database, recordId: string, weights: { jobId: string; weight: number }[]) {
  const r = byId(db.financeRecords, recordId);
  if (!r) return undefined;
  const split = allocateSource(r.amount, weights);
  return {
    rows: split.rows.map((x) => ({ jobId: x.jobId, amount: x.amount })),
    residual: split.residual && split.receiver ? { amount: split.residual, jobId: split.receiver, rule: split.rule ?? "largest_allocation" } : undefined,
  };
}

export function saveSplit(db: Database, actor: User, recordId: string, costCode: string, weights: { jobId: string; weight: number }[]) {
  const proposal = proposeSplit(db, recordId, weights);
  if (!proposal) return fail("Record not found.");
  const res = saveAllocation(db, actor, recordId, costCode, proposal.rows);
  if (res.ok) {
    const r = byId(db.financeRecords, recordId)!;
    r.residual = proposal.residual as FinanceRecord["residual"];
  }
  return res;
}

/* ----------------------------- Bill matching ------------------------- */

export function matchSupplierBill(db: Database, actor: User, billId: string) {
  if (!can(actor, "finance.code")) return denied(db, actor, MODULE, "match a supplier bill", whoCan("finance.code"));
  const bill = byId(db.financeRecords, billId);
  if (!bill || bill.type !== "bill" || !bill.poId) return fail("Choose a supplier bill linked to a purchase order.");
  const po = byId(db.purchaseOrders, bill.poId);
  if (!po) return fail("Purchase order not found.");
  // Billed against received. Returns are credited separately and stay against the original bill.
  const receipts = db.receipts ?? [];
  const m = matchBill(po.lines.map((l) => ({
    billedGal: l.gallons,
    unitCost: l.unitCostPerGal,
    receivedGal: receipts.filter((x) => x.poId === po.id && x.lineId === l.id).reduce((a, x) => a + x.qtyGal, 0),
  })));
  bill.match = {
    poId: po.id, matchedAt: now(), matchedBy: actor.id, unmatchedGal: m.unmatchedGal, unmatchedValue: m.unmatchedValue,
    note: m.matched ? "Billed quantities agree with received quantities." : `${m.unmatchedGal} gal ($${m.unmatchedValue.toFixed(2)}) billed but not received. Flagged for the bookkeeper.`,
  };
  log(db, actor, MODULE, `Finance: Supplier bill ${bill.ref} matched to purchase order ${po.id} and receipt ${receipts.filter((x) => x.poId === po.id).map((x) => x.id).join(", ") || "none"} by ${actor.name}. Unmatched: ${m.matched ? "none" : `${m.unmatchedGal} gal, ${m.unmatchedValue.toFixed(2)}`}`);
  return ok(m);
}

/** A card settlement pays an existing bill. It is never a second expense. */
export function recordCardSettlement(db: Database, actor: User, billId: string, reference: string) {
  if (!can(actor, "finance.recordPayment")) return denied(db, actor, MODULE, "record a card settlement", whoCan("finance.recordPayment"));
  const bill = byId(db.financeRecords, billId);
  if (!bill || bill.type !== "bill") return fail("Choose the bill this settlement pays.");
  if (bill.paymentStatus === "paid") return fail("That bill is already paid.");
  if (!reference.trim()) return fail("Enter the card statement reference.", "reference");
  const total = roundMoney(bill.amount + (bill.purchaseTax ?? 0));
  const s: FinanceRecord = {
    id: nextId(db, "fin", "FIN-"), type: "card_settlement", ref: reference.trim(), party: "Chase business card", amount: total, date: now(), period: periodOf(now()),
    origin: "quickbooks", externalRef: `QBO-CCP-${randomRef(5)}`, paysRecordId: bill.id, note: `Pays ${bill.ref}. Not an expense.`,
  };
  db.financeRecords.unshift(s);
  bill.paymentStatus = "paid";
  bill.amountPaid = total;
  bill.paymentDate = now();
  log(db, actor, MODULE, `Finance: Card settlement ${s.ref} pays bill ${bill.ref} (${total.toFixed(2)}). No second expense created.`);
  return ok(s.id);
}

/* ------------------------------- Payments ---------------------------- */

/**
 * Record an external payment (a check or bank payment made outside Estimate
 * Master). Above $2,500 the owner's approval is captured first. Recording is
 * never initiating: no money moves from here.
 */
export function recordExternalPayment(db: Database, actor: User, draft: { payee: string; amount: number; reference: string; billId?: string; jobId?: string }) {
  if (!can(actor, "finance.recordPayment")) return denied(db, actor, MODULE, "record an external payment", whoCan("finance.recordPayment"));
  if (!draft.payee.trim()) return fail("Enter the payee.", "payee");
  if (!(draft.amount > 0)) return fail("Enter the amount paid.", "amount");
  if (!draft.reference.trim()) return fail("Enter the check number or bank reference.", "reference");
  const needsOwner = paymentNeedsOwner(draft.amount);
  const r: FinanceRecord = {
    id: nextId(db, "fin", "FIN-"), type: "check", ref: draft.reference.trim(), party: draft.payee.trim(), amount: roundMoney(draft.amount), date: now(), period: periodOf(now()),
    origin: "estimate_master", paysRecordId: draft.billId || undefined, jobId: draft.jobId || undefined,
    approvalRequest: needsOwner ? { by: actor.id, at: now() } : undefined, note: draft.billId ? "Pays an existing bill." : undefined,
  };
  db.financeRecords.unshift(r);
  if (needsOwner) {
    log(db, actor, MODULE, `Finance: External payment ${r.amount.toFixed(2)} to ${r.party} held for owner approval (above $2,500). Requested by ${actor.name}.`);
    return ok({ id: r.id, held: true });
  }
  if (r.paysRecordId) settleBill(db, r);
  queue(db, actor, r, `External payment ${r.ref}`);
  log(db, actor, MODULE, `Finance: External payment ${r.amount.toFixed(2)} to ${r.party} recorded by ${actor.name}. Reference: ${r.ref}`);
  return ok({ id: r.id, held: false });
}

function settleBill(db: Database, payment: FinanceRecord) {
  const bill = byId(db.financeRecords, payment.paysRecordId);
  if (bill) {
    bill.amountPaid = roundMoney((bill.amountPaid ?? 0) + payment.amount);
    bill.paymentStatus = bill.amountPaid >= bill.amount + (bill.purchaseTax ?? 0) - 0.005 ? "paid" : "partial";
    bill.paymentDate = payment.date;
  }
}

export function approvePayment(db: Database, actor: User, recordId: string) {
  if (!can(actor, "finance.approvePayment")) return denied(db, actor, MODULE, "approve an external payment", whoCan("finance.approvePayment"));
  const r = byId(db.financeRecords, recordId);
  if (!r?.approvalRequest || r.ownerApproval) return fail("This payment isn't waiting for approval.");
  r.ownerApproval = { by: actor.id, at: now() };
  r.approvalRequest = undefined;
  if (r.paysRecordId) settleBill(db, r);
  queue(db, actor, r, `External payment ${r.ref}`);
  log(db, actor, MODULE, `Finance: External payment ${r.amount.toFixed(2)} to ${r.party} approved by ${actor.name} at ${new Date().toLocaleString()}. Reference: ${r.ref}`);
  return ok();
}

/** A deposit stays a liability until it is applied to an invoice. */
export function applyDeposit(db: Database, actor: User, depositId: string, invoiceRecordId: string) {
  if (!can(actor, "finance.recordPayment")) return denied(db, actor, MODULE, "apply a deposit", whoCan("finance.recordPayment"));
  const dep = byId(db.financeRecords, depositId);
  const inv = byId(db.financeRecords, invoiceRecordId);
  if (!dep || dep.type !== "deposit" || !dep.liability) return fail("Choose an unapplied deposit.");
  if (!inv || inv.type !== "invoice" || inv.jobId !== dep.jobId) return fail("Choose an invoice on the same job.");
  dep.liability = false;
  dep.appliedToInvoiceId = inv.id;
  inv.amountPaid = roundMoney((inv.amountPaid ?? 0) + dep.amount);
  inv.paymentStatus = inv.amountPaid >= inv.amount + (inv.salesTax ?? 0) - 0.005 ? "paid" : "partial";
  log(db, actor, MODULE, `Finance: Deposit ${dep.ref} (${dep.amount.toFixed(2)}) applied to invoice ${inv.ref} by ${actor.name}. No longer a liability.`);
  return ok();
}

/** A correction dated in a closed period posts to the next open period. */
export function postCorrection(db: Database, actor: User, draft: { jobId: string; amount: number; date: string; note: string }) {
  if (!can(actor, "finance.code")) return denied(db, actor, MODULE, "post a correction", whoCan("finance.code"));
  if (!draft.amount || Number.isNaN(draft.amount)) return fail("Enter the correction amount.", "amount");
  if (!draft.note.trim()) return fail("Say what the correction is for.", "note");
  const iso = new Date(draft.date).toISOString();
  const p = postingPeriod(iso, db.financeSettings.closedPeriods);
  const r: FinanceRecord = {
    id: nextId(db, "fin", "FIN-"), type: "credit", ref: `COR-${randomRef(4)}`, party: "Correction", amount: roundMoney(draft.amount), date: iso, period: p.period,
    origin: "estimate_master", jobId: draft.jobId || undefined, postedFromClosedPeriod: p.movedFrom, note: draft.note.trim(),
  };
  db.financeRecords.unshift(r);
  queue(db, actor, r, `Correction ${r.ref}`);
  if (p.movedFrom) log(db, actor, MODULE, `Finance: Correction for closed period ${p.movedFrom} posted to next period ${p.period} by ${actor.name}`);
  else log(db, actor, MODULE, `Finance: Correction ${r.ref} posted to ${p.period} by ${actor.name}.`);
  return ok(p);
}

export function setRetainageNote(db: Database, actor: User, recordId: string, note: string) {
  if (!can(actor, "finance.config")) return denied(db, actor, MODULE, "record a retainage note", whoCan("finance.config"));
  const r = byId(db.financeRecords, recordId);
  if (!r) return fail("Record not found.");
  r.retainageNote = note.trim() || undefined;
  log(db, actor, MODULE, `Finance: Retainage note on ${r.ref} ${note.trim() ? "set" : "cleared"} by ${actor.name}. There is no retainage engine.`);
  return ok();
}

/* ----------------------------- Reimbursements ------------------------ */

export interface ReimbursementDraft {
  employeeId: string;
  amount: number;
  date: string;
  merchant: string;
  description: string;
  jobId?: string;
  costCode: string;
  receiptPhoto?: string;
}

export function reimbursementPath(db: Database, employeeId: string) {
  const emp = byId(db.employees, employeeId);
  const user = emp?.userId ? byId(db.users, emp.userId) : undefined;
  return reimbursementSteps({ type: emp?.type ?? "hourly", role: user?.role });
}

export function submitReimbursement(db: Database, actor: User, d: ReimbursementDraft) {
  if (!can(actor, "reimburse.submit")) return denied(db, actor, MODULE, "submit a reimbursement", whoCan("reimburse.submit"));
  const emp = byId(db.employees, d.employeeId);
  if (!emp) return fail("Choose who is being reimbursed.", "employee");
  if (emp.userId !== actor.id && actor.role !== "crew_lead") return denied(db, actor, MODULE, "claim for someone else", "the employee or their Crew Lead");
  if (!(d.amount > 0)) return fail("Enter the receipt amount.", "amount");
  if (!d.merchant.trim()) return fail("Enter the merchant.", "merchant");
  if (!d.receiptPhoto) return fail("Receipt photograph required.", "receipt");
  const bad = checkCode(db, d.costCode);
  if (bad) return bad;
  const claim = {
    id: nextId(db, "rmb", "RMB-"), employeeId: emp.id, submittedBy: actor.id, amount: roundMoney(d.amount), date: new Date(d.date).toISOString(), merchant: d.merchant.trim(),
    description: d.description.trim(), jobId: d.jobId || undefined, costCode: d.costCode, receiptPhoto: d.receiptPhoto, status: "submitted" as const,
  };
  db.reimbursements.unshift(claim);
  log(db, actor, MODULE, `Finance: Claim ${claim.id} for ${claim.amount.toFixed(2)} by ${emp.name} – receipt ${d.receiptPhoto} submitted by ${actor.name}.`);
  return ok(claim.id);
}

function nextStatus(db: Database, claimId: string) {
  const c = byId(db.reimbursements, claimId)!;
  const steps = reimbursementPath(db, c.employeeId);
  const done: string[] = [];
  if (c.crewApprovedAt) done.push("crew_lead");
  if (c.officeReviewedAt) done.push("office");
  if (c.ownerApprovedAt) done.push("owner");
  return steps.find((s) => !done.includes(s));
}

function advance(db: Database, actor: User, claimId: string, step: "crew_lead" | "office" | "owner") {
  const c = byId(db.reimbursements, claimId);
  if (!c || c.status === "rejected" || c.status === "owner_approved") return fail("This claim isn't waiting for a decision.");
  const due = nextStatus(db, claimId);
  if (due !== step) return fail(due ? `This claim is waiting for the ${due === "crew_lead" ? "crew lead" : due === "office" ? "office" : "business owner"}.` : "This claim is complete.");
  const emp = byId(db.employees, c.employeeId);
  if (emp?.userId === actor.id) return denied(db, actor, MODULE, "approve your own reimbursement", step === "owner" ? "the Business Owner" : "someone other than the claimant");
  const t = now();
  if (step === "crew_lead") Object.assign(c, { crewApprovedBy: actor.id, crewApprovedAt: t });
  if (step === "office") {
    Object.assign(c, { officeReviewedBy: actor.id, officeReviewedAt: t });
    const dup = db.financeRecords.find((r) => (r.jobId === c.jobId || !r.jobId) && isDuplicateExpense(c, r));
    if (dup) c.duplicateOfRecordId = dup.id;
  }
  if (step === "owner") Object.assign(c, { ownerApprovedBy: actor.id, ownerApprovedAt: t });
  const remaining = nextStatus(db, claimId);
  c.status = !remaining ? "owner_approved" : step === "crew_lead" ? "crew_approved" : "office_reviewed";
  if (!remaining && !c.expenseRef) c.expenseRef = `EXP-${randomRef(5)}`;
  log(db, actor, MODULE, `Finance: Claim ${c.id} for ${c.amount.toFixed(2)} by ${emp?.name} – receipt ${c.receiptPhoto}, crew approved by ${userName(db, c.crewApprovedBy)}, office reviewed by ${userName(db, c.officeReviewedBy)}, owner approval ${userName(db, c.ownerApprovedBy)}`);
  return ok(c.duplicateOfRecordId);
}

export function crewApproveClaim(db: Database, actor: User, claimId: string) {
  if (!can(actor, "reimburse.crewApprove")) return denied(db, actor, MODULE, "approve a crew reimbursement", whoCan("reimburse.crewApprove"));
  return advance(db, actor, claimId, "crew_lead");
}
export function officeReviewClaim(db: Database, actor: User, claimId: string) {
  if (!can(actor, "reimburse.officeReview")) return denied(db, actor, MODULE, "review a reimbursement", whoCan("reimburse.officeReview"));
  return advance(db, actor, claimId, "office");
}
export function ownerApproveClaim(db: Database, actor: User, claimId: string) {
  if (!can(actor, "reimburse.ownerApprove")) return denied(db, actor, MODULE, "approve an office reimbursement", whoCan("reimburse.ownerApprove"));
  return advance(db, actor, claimId, "owner");
}

export function rejectClaim(db: Database, actor: User, claimId: string, reason: string) {
  const c = byId(db.reimbursements, claimId);
  if (!c || c.status === "rejected" || c.status === "owner_approved") return fail("This claim can't be rejected now.");
  if (!["crew_lead", "office_manager", "owner"].includes(actor.role)) return denied(db, actor, MODULE, "reject a reimbursement", "the Crew Lead, Office Manager or Business Owner");
  if (!reason.trim()) return fail("Say why.", "reason");
  Object.assign(c, { status: "rejected", rejectedReason: reason.trim() });
  log(db, actor, MODULE, `Finance: Claim ${c.id} rejected by ${actor.name}. Reason: ${reason.trim()}`);
  return ok();
}

/* ------------------------------ Setup -------------------------------- */

export function requestVendor(db: Database, actor: User, name: string) {
  if (!can(actor, "finance.requestVendor")) return denied(db, actor, MODULE, "request a vendor", whoCan("finance.requestVendor"));
  if (!name.trim()) return fail("Enter the vendor name.", "name");
  if (db.vendors.some((v) => v.name.toLowerCase() === name.trim().toLowerCase())) return fail("That vendor already exists.", "name");
  db.vendors.push({ id: nextId(db, "ven", "VEN-"), name: name.trim(), status: "requested", requestedBy: actor.id, requestedAt: now() });
  log(db, actor, MODULE, `Finance: Vendor ${name.trim()} requested by ${actor.name}. Awaiting owner activation.`);
  return ok();
}

export function activateVendor(db: Database, actor: User, id: string) {
  if (!can(actor, "finance.activateVendor")) return denied(db, actor, MODULE, "activate a vendor", whoCan("finance.activateVendor"));
  const v = byId(db.vendors, id);
  if (!v || v.status !== "requested") return fail("This vendor isn't waiting for activation.");
  Object.assign(v, { status: "active", activatedBy: actor.id, activatedAt: now() });
  log(db, actor, MODULE, `Finance: Vendor ${v.name} requested by ${userName(db, v.requestedBy)}, activated by ${actor.name} at ${new Date().toLocaleString()}`);
  return ok();
}

export function proposeCostCode(db: Database, actor: User, code: string, label: string) {
  if (!can(actor, "finance.config") && !can(actor, "finance.approveCostCode")) return denied(db, actor, MODULE, "propose a cost code", "the Bookkeeper or Business Owner");
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{2,6}$/.test(c)) return fail("Use 2–6 letters for the code.", "code");
  if (!label.trim()) return fail("Enter what the code is for.", "label");
  if (db.costCodes.some((x) => x.code === c)) return fail("That code already exists.", "code");
  db.costCodes.push({ code: c, label: label.trim(), status: "proposed", proposedBy: actor.id });
  log(db, actor, MODULE, `Finance: Job-cost code ${c} Created by ${actor.name}. Awaiting owner approval.`);
  return ok();
}

export function approveCostCode(db: Database, actor: User, code: string) {
  if (!can(actor, "finance.approveCostCode")) return denied(db, actor, MODULE, "approve a job-cost code", whoCan("finance.approveCostCode"));
  const c = db.costCodes.find((x) => x.code === code);
  if (!c || c.status !== "proposed") return fail("This code isn't waiting for approval.");
  Object.assign(c, { status: "approved", approvedBy: actor.id, approvedAt: now() });
  log(db, actor, MODULE, `Finance: Job-cost code ${c.code} Created by ${userName(db, c.proposedBy)}. Approved by ${actor.name}`);
  return ok();
}

/** A mapping change never silently changes a posted transaction. */
export function updateMapping(db: Database, actor: User, id: string, account: string) {
  if (!can(actor, "finance.config")) return denied(db, actor, MODULE, "change an account mapping", whoCan("finance.config"));
  const m = byId(db.accountMappings, id);
  if (!m) return fail("Mapping not found.");
  if (!account.trim()) return fail("Enter the QuickBooks account.", "account");
  const old = m.account;
  Object.assign(m, { account: account.trim(), updatedBy: actor.id, updatedAt: now() });
  log(db, actor, MODULE, `Finance: Account mapping ${m.id} changed from ${old} to ${m.account} by ${actor.name}. Posted transactions unaffected.`);
  return ok();
}

export function closePeriod(db: Database, actor: User, period: string) {
  if (!can(actor, "finance.config")) return denied(db, actor, MODULE, "close a period", whoCan("finance.config"));
  if (db.financeSettings.closedPeriods.includes(period)) return fail("That period is already closed.");
  db.financeSettings.closedPeriods.push(period);
  db.financeSettings.closedPeriods.sort();
  log(db, actor, MODULE, `Finance: Period ${period} closed by ${actor.name}. Later corrections post to the next period.`);
  return ok();
}

export function signOffMigration(db: Database, actor: User) {
  if (!can(actor, "finance.migration")) return denied(db, actor, MODULE, "sign off the migration totals", whoCan("finance.migration"));
  if (db.financeSettings.migrationSignOff) return fail("Already signed off.");
  const batchId = db.migrationTotals[0]?.batchId ?? "MIG-1";
  db.financeSettings.migrationSignOff = { by: actor.id, at: now(), batchId };
  const years = new Set(db.migrationTotals.map((m) => m.year)).size;
  log(db, actor, MODULE, `Finance: ${years} years of comparison totals imported, batch ${batchId}. Reconciled and signed off by ${actor.name} on ${new Date().toLocaleDateString()}`);
  return ok();
}

export function setGustoJournal(db: Database, actor: User, posts: boolean) {
  if (!can(actor, "finance.config")) return denied(db, actor, MODULE, "record the payroll-journal answer", whoCan("finance.config"));
  db.financeSettings.gustoPostsJournal = posts;
  log(db, actor, MODULE, `Finance: Bookkeeper confirmed in writing that Gusto ${posts ? "posts" : "does not post"} the payroll journal. Estimate Master never posts payroll journals.`);
  return ok();
}

export function logAuditExport(db: Database, actor: User, from: string, to: string) {
  if (!can(actor, "finance.auditExport")) return denied(db, actor, MODULE, "produce the audit export", whoCan("finance.auditExport"));
  log(db, actor, MODULE, `Finance: CSV audit export produced by ${actor.name} at ${new Date().toLocaleString()}, covering ${from}–${to}`);
  return ok();
}

export function sortByJob<T extends { jobId?: string }>(rows: T[]) {
  return [...rows].sort((a, b) => (a.jobId && b.jobId ? compareJobNumber(a.jobId, b.jobId) : 0));
}

/* ------------------- 30 Sep call: QuickBooks (X-M2, QB) ------------------- */

/** X-M2: where the books are kept. Missing on older data = QuickBooks when connected. */
export function accountingDestination(db: Database): "none" | "qbo" | "books" {
  return db.financeSettings.destination ?? (db.financeSettings.qbo.connected ? "qbo" : "none");
}

const canChooseDestination = (actor: User) => actor.role === "owner" || can(actor, "finance.connect");

/**
 * X-M2: choose None, QuickBooks Online or Estimate Master Books. Books
 * disconnects QuickBooks; QuickBooks reconnects it (simulated). In the
 * prototype both stay visible for comparison.
 */
export function setAccountingDestination(db: Database, actor: User, destination: "none" | "qbo" | "books") {
  if (!canChooseDestination(actor)) return denied(db, actor, MODULE, "choose the accounting destination", "the owner or the office manager");
  const before = accountingDestination(db);
  if (before === destination) return fail("That is already the accounting destination.");
  db.financeSettings.destination = destination;
  if (destination === "books") db.financeSettings.qbo = { ...db.financeSettings.qbo, connected: false };
  if (destination === "qbo" && !db.financeSettings.qbo.connected) {
    db.financeSettings.qbo = { ...db.financeSettings.qbo, connected: true, connectedBy: actor.id, connectedAt: now(), realm: db.financeSettings.qbo.realm ?? `QBO-${randomRef(6)}` };
  }
  const label = { none: "None", qbo: "QuickBooks Online", books: "Estimate Master Books" }[destination];
  log(db, actor, MODULE, `Finance: accounting destination changed to ${label} by ${actor.name}${destination === "books" ? ". QuickBooks disconnected." : ""}`);
  return ok();
}

const canMatch = (actor: User) => can(actor, "finance.migration") || can(actor, "finance.connect") || actor.role === "owner";

/** QB-M3: link a possible duplicate to the suggested contact, or create a new one. */
export function decideContactMatch(db: Database, actor: User, qboId: string, decision: "link" | "create") {
  if (!canMatch(actor)) return denied(db, actor, MODULE, "match QuickBooks contacts", whoCan("finance.migration"));
  if (!db.qboCustomers?.some((q) => q.id === qboId)) return fail("QuickBooks customer not found.");
  const cm = db.financeSettings.contactMatch ?? { decisions: {} };
  db.financeSettings.contactMatch = { ...cm, decisions: { ...cm.decisions, [qboId]: decision } };
  return ok();
}

/**
 * QB-M3: finish "Match your contacts". Matches are linked, each duplicate
 * follows its decision (link, or a new contact), and every duplicate must
 * have one.
 */
export function completeContactMatch(db: Database, actor: User, links: { qboId: string; customerId: string; duplicate: boolean }[]) {
  if (!canMatch(actor)) return denied(db, actor, MODULE, "match QuickBooks contacts", whoCan("finance.migration"));
  const decisions = db.financeSettings.contactMatch?.decisions ?? {};
  const open = links.filter((l) => l.duplicate && !decisions[l.qboId]);
  if (open.length) return fail(`Choose Link or Create new for ${open.length} possible ${open.length === 1 ? "duplicate" : "duplicates"}.`);
  for (const l of links) {
    const q = db.qboCustomers!.find((x) => x.id === l.qboId);
    if (!q) continue;
    if (!l.duplicate || decisions[l.qboId] === "link") q.customerId = l.customerId;
    else {
      const id = nextId(db, "cust", "C-NEW-");
      db.customers.push({ id, name: q.displayName, email: q.email, phone: q.phone, contactVerified: false, preferredChannel: "email", consentSigned: false, authorisedSigners: [] });
      q.customerId = id;
    }
  }
  db.financeSettings.contactMatch = { decisions, completedAt: now(), completedBy: actor.id };
  log(db, actor, MODULE, `Finance: QuickBooks contacts matched by ${actor.name} (${links.length} QuickBooks customers)`);
  return ok();
}

/** QB-C1: a customer created in QuickBooks: link to a contact, create it as a contact, or ignore it. */
export function reviewQboCustomer(db: Database, actor: User, qboId: string, action: "link" | "create" | "ignore", customerId?: string) {
  if (!can(actor, "finance.code") && !canMatch(actor)) return denied(db, actor, MODULE, "review QuickBooks customers", whoCan("finance.code"));
  const q = db.qboCustomers?.find((x) => x.id === qboId);
  if (!q) return fail("QuickBooks customer not found.");
  if (action === "link") {
    if (!customerId || !db.customers.some((c) => c.id === customerId)) return fail("Choose the contact to link.", "customerId");
    q.customerId = customerId;
  }
  if (action === "create") {
    const id = nextId(db, "cust", "C-NEW-");
    db.customers.push({ id, name: q.displayName, email: q.email, phone: q.phone, contactVerified: false, preferredChannel: "email", consentSigned: false, authorisedSigners: [] });
    q.customerId = id;
  }
  q.review = { status: action === "link" ? "linked" : action === "create" ? "created" : "ignored", by: actor.id, at: now() };
  log(db, actor, MODULE, `Finance: QuickBooks customer ${q.displayName} ${q.review.status} by ${actor.name}`);
  return ok(q.customerId);
}
