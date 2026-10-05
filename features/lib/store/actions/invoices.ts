/**
 * Invoice actions, as the live /invoices/[id] toolbar runs them.
 *
 *   sendInvoice           POST /invoices/:id/send            (SendInvoiceDto)
 *   recordInvoicePayment  POST /invoices/:id/payments        (RecordPaymentDto: amount, paymentMethod, referenceNumber, notes)
 *
 * NEW (feature 33, host needs client confirmation): sending an invoice and
 * recording a payment each queue a record for QuickBooks Online. QuickBooks
 * owns the ledger; the exchange runs from the Accounting page.
 */
import type { Database, FinanceRecord, Invoice, User } from "@/features/types";
import { can, whoCan } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { byId } from "@/features/lib/selectors";
import { periodOf, postingPeriod } from "@/features/lib/rules/finance";
import { roundMoney } from "@/features/lib/rules/rounding";
import { accountingDestination, queue } from "./finance";
import { booksOf, postEvent } from "./ledger";
import { denied, fail, log, nextId, ok } from "../helpers";

const MODULE = "Invoices";

/** One atomic correction, including its accounting adjustment and audit evidence. */
export function reconcileInvoicePayments(db: Database, actor: User, invoiceId: string, proposed: NonNullable<Invoice['payments']>, reason: string) {
  if (!can(actor, 'payment.process')) return denied(db, actor, MODULE, 'correct payments', whoCan('payment.process'));
  const inv = byId(db.invoices, invoiceId);
  if (!inv || inv.status === 'void') return fail('Invoice is missing or canceled.');
  if (!reason.trim()) return fail('Enter a reason for the payment correction.');
  const ids = new Set<string>();
  for (const payment of proposed) {
    if (!payment.id || ids.has(payment.id)) return fail('Each payment needs a unique identifier.');
    ids.add(payment.id);
    if (!Number.isFinite(payment.amount) || roundMoney(payment.amount) <= 0) return fail('Enter a payment of at least $0.01.');
    if (!Number.isFinite(Date.parse(payment.at))) return fail('Enter a valid payment date.');
    if (!['cash', 'check', 'credit_card', 'bank_transfer', 'other'].includes(payment.method)) return fail('Choose a payment method.');
    if (['check', 'bank_transfer'].includes(payment.method) && !payment.reference?.trim()) return fail('Enter the check number or bank reference.');
  }
  const rows = proposed.map((p) => ({ ...p, amount: roundMoney(p.amount), by: inv.payments?.find((old) => old.id === p.id)?.by ?? actor.id }));
  const total = roundMoney(rows.reduce((sum, p) => sum + p.amount, 0));
  if (total > inv.amount) return fail('Payments cannot exceed the invoice total.');
  const before = invoicePaid(inv);
  const delta = roundMoney(total - before);
  const evidence = JSON.stringify({ before: inv.payments ?? [], after: rows });
  const record = invoiceRecord(db, actor, inv);
  inv.payments = rows;
  inv.status = total > 0 ? (total >= inv.amount ? 'paid' : 'partial') : inv.sentAt ? 'sent' : 'draft';
  const job = byId(db.jobs, inv.jobId);
  if (job) job.depositsCollected = roundMoney(job.depositsCollected + delta);
  record.amountPaid = total;
  record.paymentStatus = total > 0 ? (inv.status === 'paid' ? 'paid' : 'partial') : 'unpaid';
  record.paymentDate = rows.length ? rows[rows.length - 1]!.at : undefined;
  if (delta !== 0) {
    const at = now();
    const adjustment: FinanceRecord = {
      id: nextId(db, 'fin', 'FIN-'), type: 'payment', ref: `${invoiceId}-CORRECTION`, party: record.party,
      amount: delta, date: at, period: postingPeriod(at, db.financeSettings.closedPeriods).period,
      jobId: inv.jobId, invoiceId, origin: 'estimate_master',
    };
    db.financeRecords.unshift(adjustment);
    queue(db, actor, adjustment, `Payment adjustment: ${reason.trim()}`);
  }
  queue(db, actor, record, `Payment balance updated: ${reason.trim()}`);
  log(db, actor, MODULE, `Invoice ${invoiceId} payments corrected by ${actor.name}: ${reason.trim()}. ${evidence}`);
  return ok();
}

export function invoicePaid(inv: Invoice): number {
  return roundMoney((inv.payments ?? []).reduce((a, p) => a + p.amount, 0) + (inv.status === "paid" && !inv.payments?.length ? inv.amount : 0));
}

export function invoiceBalance(inv: Invoice): number {
  return inv.status === "void" ? 0 : roundMoney(Math.max(0, inv.amount - invoicePaid(inv)));
}

/**
 * QA B-04: with Estimate Master Books as the destination, a sent invoice and
 * each recorded payment post to the journal (once). The amount the customer
 * owes is what goes to receivables: tax from the invoice lines, the rest income.
 */
function postInvoiceToBooks(db: Database, actor: User, inv: Invoice) {
  if (accountingDestination(db) !== "books" || inv.kind === "credit_note") return;
  if (booksOf(db).journal.some((e) => e.source.kind === "invoice" && e.source.ref === inv.id)) return;
  const subtotal = roundMoney((inv.lines ?? []).reduce((a, l) => a + l.quantity * l.rate, 0));
  const tax = inv.lines?.length ? roundMoney(((subtotal - (inv.discount ?? 0)) * (inv.taxRatePct ?? 0)) / 100) : 0;
  const party = byId(db.customers, byId(db.jobs, inv.jobId)?.customerId)?.name;
  postEvent(db, actor, { kind: "invoice", net: roundMoney(inv.amount - tax), tax, jobId: inv.jobId }, { ref: inv.id, memo: `Invoice ${inv.id}`, party, date: inv.sentAt, href: `/invoices/${inv.id}` });
}

function postPaymentToBooks(db: Database, actor: User, inv: Invoice, payment: { id: string; amount: number; method: string; at: string }, owed: number) {
  if (accountingDestination(db) !== "books") return;
  const kind = payment.method === "credit_card" ? "card_payment" : "payment";
  const party = byId(db.customers, byId(db.jobs, inv.jobId)?.customerId)?.name;
  postEvent(db, actor, { kind, amount: payment.amount, owed, jobId: inv.jobId }, { ref: payment.id, memo: `Payment on ${inv.id}`, party, date: payment.at, href: `/invoices/${inv.id}` });
}

/** The finance record that carries this invoice to QuickBooks, created on first send. */
function invoiceRecord(db: Database, actor: User, inv: Invoice): FinanceRecord {
  const existing = db.financeRecords.find((r) => r.type === "invoice" && r.invoiceId === inv.id);
  if (existing) return existing;
  const job = byId(db.jobs, inv.jobId);
  const r: FinanceRecord = {
    id: nextId(db, "fin", "FIN-"), type: "invoice", ref: inv.id, party: byId(db.customers, job?.customerId)?.name ?? "Customer", amount: inv.amount,
    salesTax: roundMoney((inv.amount * (job?.taxRatePct ?? 0)) / 100), date: now(), period: periodOf(now()), jobId: inv.jobId, invoiceId: inv.id, origin: "estimate_master", paymentStatus: "unpaid",
  };
  db.financeRecords.unshift(r);
  queue(db, actor, r, `Invoice ${inv.id}`);
  return r;
}

export function sendInvoice(db: Database, actor: User, invoiceId: string) {
  if (!can(actor, "invoice.send")) return denied(db, actor, MODULE, "send an invoice", whoCan("invoice.send"));
  const inv = byId(db.invoices, invoiceId);
  if (!inv) return fail("Invoice not found.");
  if (inv.status === "void" || inv.status === "paid") return fail("This invoice is closed.");
  const customer = byId(db.customers, byId(db.jobs, inv.jobId)?.customerId);
  if (!customer?.email) return fail("The client has no email address.");
  if (inv.status === "draft") inv.status = "sent";
  inv.sentAt = now();
  invoiceRecord(db, actor, inv);
  postInvoiceToBooks(db, actor, inv);
  log(db, actor, MODULE, `Invoice ${inv.id} sent to ${customer.email} by ${actor.name} (recorded, not sent: prototype). Queued for QuickBooks.`);
  return ok();
}

export function recordInvoicePayment(db: Database, actor: User, invoiceId: string, input: { amount: number; method: NonNullable<Invoice["payments"]>[number]["method"]; reference?: string; notes?: string }) {
  if (!can(actor, "payment.process")) return denied(db, actor, MODULE, "record a payment", whoCan("payment.process"));
  const inv = byId(db.invoices, invoiceId);
  if (!inv) return fail("Invoice not found.");
  if (inv.status === "void") return fail("This invoice is canceled.");
  const balance = invoiceBalance(inv);
  const amount = roundMoney(input.amount);
  if (!Number.isFinite(input.amount) || !(amount > 0)) return fail("Enter a payment of at least $0.01.", "amount");
  if (amount > balance) return fail(`Maximum: $${balance.toFixed(2)}`, "amount");
  if ((input.method === "check" || input.method === "bank_transfer") && !input.reference?.trim()) return fail("Enter the check number or reference.", "reference");
  const t = now();
  const payment = { id: nextId(db, "pay", "PAY-"), amount, method: input.method, reference: input.reference?.trim() || undefined, notes: input.notes?.trim() || undefined, at: t, by: actor.id };
  inv.payments = [...(inv.payments ?? []), payment];
  // An invoice paid before it was ever sent still reaches the books first.
  postInvoiceToBooks(db, actor, inv);
  postPaymentToBooks(db, actor, inv, payment, balance);
  inv.status = invoiceBalance(inv) <= 0.005 ? "paid" : "partial";
  const job = byId(db.jobs, inv.jobId);
  if (job) job.depositsCollected = roundMoney(job.depositsCollected + amount);

  // NEW (33): the payment goes to QuickBooks against the invoice's record.
  const invRec = invoiceRecord(db, actor, inv);
  invRec.amountPaid = roundMoney((invRec.amountPaid ?? 0) + amount);
  invRec.paymentStatus = inv.status === "paid" ? "paid" : "partial";
  invRec.paymentDate = t;
  const pay: FinanceRecord = {
    id: nextId(db, "fin", "FIN-"), type: "payment", ref: input.reference?.trim() || `${inv.id}-PAY`, party: invRec.party, amount, date: t, period: periodOf(t),
    jobId: inv.jobId, invoiceId: inv.id, origin: "estimate_master",
  };
  db.financeRecords.unshift(pay);
  queue(db, actor, pay, `Payment on ${inv.id}`);
  log(db, actor, MODULE, `Payment $${amount.toFixed(2)} (${input.method}) recorded on invoice ${inv.id} by ${actor.name}. Queued for QuickBooks.`);
  return ok();
}
