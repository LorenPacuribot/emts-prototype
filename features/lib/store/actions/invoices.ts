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
import { periodOf } from "@/features/lib/rules/finance";
import { roundMoney } from "@/features/lib/rules/rounding";
import { queue } from "./finance";
import { denied, fail, log, nextId, ok } from "../helpers";

const MODULE = "Invoices";

export function invoicePaid(inv: Invoice): number {
  return roundMoney((inv.payments ?? []).reduce((a, p) => a + p.amount, 0) + (inv.status === "paid" && !inv.payments?.length ? inv.amount : 0));
}

export function invoiceBalance(inv: Invoice): number {
  return inv.status === "void" ? 0 : roundMoney(Math.max(0, inv.amount - invoicePaid(inv)));
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
  log(db, actor, MODULE, `Invoice ${inv.id} sent to ${customer.email} by ${actor.name} (recorded, not sent: prototype). Queued for QuickBooks.`);
  return ok();
}

export function recordInvoicePayment(db: Database, actor: User, invoiceId: string, input: { amount: number; method: NonNullable<Invoice["payments"]>[number]["method"]; reference?: string; notes?: string }) {
  if (!can(actor, "payment.process")) return denied(db, actor, MODULE, "record a payment", whoCan("payment.process"));
  const inv = byId(db.invoices, invoiceId);
  if (!inv) return fail("Invoice not found.");
  if (inv.status === "void") return fail("This invoice is cancelled.");
  const balance = invoiceBalance(inv);
  if (!(input.amount > 0)) return fail("Enter the payment amount.", "amount");
  if (input.amount > balance + 0.005) return fail(`Maximum: $${balance.toFixed(2)}`, "amount");
  if ((input.method === "check" || input.method === "bank_transfer") && !input.reference?.trim()) return fail("Enter the check number or reference.", "reference");
  const t = now();
  inv.payments = [...(inv.payments ?? []), { id: nextId(db, "pay", "PAY-"), amount: roundMoney(input.amount), method: input.method, reference: input.reference?.trim() || undefined, notes: input.notes?.trim() || undefined, at: t, by: actor.id }];
  inv.status = invoiceBalance(inv) <= 0.005 ? "paid" : "partial";
  const job = byId(db.jobs, inv.jobId);
  if (job) job.depositsCollected = roundMoney(job.depositsCollected + input.amount);

  // NEW (33): the payment goes to QuickBooks against the invoice's record.
  const invRec = invoiceRecord(db, actor, inv);
  invRec.amountPaid = roundMoney((invRec.amountPaid ?? 0) + input.amount);
  invRec.paymentStatus = inv.status === "paid" ? "paid" : "partial";
  invRec.paymentDate = t;
  const pay: FinanceRecord = {
    id: nextId(db, "fin", "FIN-"), type: "payment", ref: input.reference?.trim() || `${inv.id}-PAY`, party: invRec.party, amount: roundMoney(input.amount), date: t, period: periodOf(t),
    jobId: inv.jobId, invoiceId: inv.id, origin: "estimate_master",
  };
  db.financeRecords.unshift(pay);
  queue(db, actor, pay, `Payment on ${inv.id}`);
  log(db, actor, MODULE, `Payment $${input.amount.toFixed(2)} (${input.method}) recorded on invoice ${inv.id} by ${actor.name}. Queued for QuickBooks.`);
  return ok();
}
