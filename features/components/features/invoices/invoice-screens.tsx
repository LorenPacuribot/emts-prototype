"use client";
/**
 * Invoices — live routes /invoices and /invoices/[id] (features/(main)/invoices).
 *
 * Existing: list with Outstanding Balance / Total Collected, search, status
 * filter and one row per invoice; details with the toolbar (Download PDF,
 * Send Invoice / Resend Invoice, Record Payment), the invoice document and
 * Payment History. Record Payment keeps the live modes (Card, Check, Cash,
 * Bank Transfer).
 * NEW (feature 33, needs client confirmation): the QuickBooks column on the
 * list and the "QuickBooks exchange" card on the invoice.
 */
import { useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, CreditCard, DollarSign, Download, Landmark, Search, Send } from "lucide-react";
import type { Invoice } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { AppLink, useNav, useParam } from "@/features/lib/navigation";
import { invoiceHref, jobHref } from "@/features/lib/hrefs";
import { invoiceBalance, invoicePaid, recordInvoicePayment, sendInvoice } from "@/features/lib/store/actions/invoices";
import { byId, propertyAddress } from "@/features/lib/selectors";
import { can } from "@/features/lib/permissions";
import { printElement } from "@/features/lib/export";
import { date, dateTime, money } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { cn } from "@/features/lib/cn";
import { Screen } from "@/features/components/layout/screen";
import { Banner, Button, ConfirmBadge, EmptyState, Field, Input, Modal, NewBadge, NumberChip, Select, StatusPill, Textarea } from "@/features/components/ui";

const STATUS: Record<Invoice["status"], { label: string; tone: "gray" | "amber" | "blue" | "green" }> = {
  draft: { label: "Draft", tone: "gray" },
  sent: { label: "Sent", tone: "amber" },
  partial: { label: "Partially Paid", tone: "blue" },
  paid: { label: "Paid", tone: "green" },
  void: { label: "Cancelled", tone: "gray" },
};

/** NEW (33): the invoice's latest QuickBooks exchange state. */
function useQbo(invoiceId: string) {
  const db = useDb((d) => d);
  const rec = db.financeRecords.find((r) => r.type === "invoice" && r.invoiceId === invoiceId);
  const items = rec ? db.exchangeQueue.filter((q) => q.recordId === rec.id).sort((a, b) => b.version - a.version) : [];
  const latest = items[0];
  const state = !rec ? "Not sent" : rec.deletedInQbo ? "Deleted in QuickBooks" : latest?.status === "accepted" ? "Accepted" : latest?.status === "rejected" ? "Rejected" : latest?.status === "sent" ? "Sent" : "Queued";
  const tone = state === "Accepted" ? "green" : state === "Rejected" || state.startsWith("Deleted") ? "red" : state === "Not sent" ? "gray" : "amber";
  return { rec, items, state, tone: tone as "green" | "red" | "gray" | "amber" };
}

function QboCell({ invoiceId }: { invoiceId: string }) {
  const q = useQbo(invoiceId);
  return <StatusPill tone={q.tone}>{q.state}</StatusPill>;
}

export function InvoicesListScreen() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const nav = useNav();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const showQbo = can(user, "finance.access");
  const list = [...db.invoices]
    .filter((i) => status === "All" || i.status === status)
    .filter((i) => {
      const job = byId(db.jobs, i.jobId);
      return [i.id, job?.name, byId(db.customers, job?.customerId)?.name].join(" ").toLowerCase().includes(q.toLowerCase());
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const outstanding = db.invoices.reduce((a, i) => a + invoiceBalance(i), 0);
  const collected = db.invoices.reduce((a, i) => a + invoicePaid(i), 0);
  return (
    <Screen crumbs={[{ label: "Invoices" }]} bare>
      <div className="mx-auto w-full px-4 py-8 pb-32 md:px-8">
        <h1 className="font-heading text-3xl font-black tracking-tight text-gray-900 md:text-4xl">Invoices</h1>
        <p className="mb-8 mt-2 text-lg text-gray-500">Track payments and outstanding balances.</p>
        <div className="mb-8 grid gap-6 md:grid-cols-2">
          {[["Outstanding Balance", outstanding, <DollarSign key="d" />], ["Total Collected", collected, <CheckCircle2 key="c" />]].map(([l, v, icon]) => (
            <div key={l as string} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500 [&>svg]:h-4 [&>svg]:w-4">{icon} {l}</div>
              <div className="font-heading text-3xl font-black text-gray-900">{money(v as number, { cents: true })}</div>
            </div>
          ))}
        </div>
        <div className="mb-5 flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoices..." className="h-11 pl-9" /></div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 md:w-56" aria-label="Status">
            <option value="All">All</option>
            {(Object.keys(STATUS) as Invoice["status"][]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
          </Select>
        </div>
        {showQbo && <div className="mb-3 flex items-center gap-2 text-xs text-gray-500">QuickBooks column <NewBadge feature={33} /> <ConfirmBadge /></div>}
        <div className="space-y-3">
          {list.length === 0 && <EmptyState title="No invoices found" />}
          {list.map((i) => {
            const job = byId(db.jobs, i.jobId);
            return (
              <div key={i.id} role="link" tabIndex={0} onClick={() => nav.push(invoiceHref(i.id))} onKeyDown={(e) => e.key === "Enter" && nav.push(invoiceHref(i.id))} className="flex cursor-pointer flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <NumberChip>{i.id}</NumberChip>
                    <StatusPill tone={STATUS[i.status].tone}>{STATUS[i.status].label}</StatusPill>
                    {i.kind !== "standard" && <span className="rounded-md bg-purple-50 px-1.5 py-0.5 font-bold text-purple-700">{i.kind === "credit_note" ? "Credit note" : "Supplemental"}</span>}
                    <span className="text-gray-400">• {date(i.createdAt)}</span>
                  </div>
                  <h3 className="mt-1 font-bold text-gray-900">{byId(db.customers, job?.customerId)?.name}</h3>
                  <div className="text-sm text-gray-500">{job?.id} · {job?.name}</div>
                </div>
                {showQbo && <div className="md:w-40" onClick={(e) => e.stopPropagation()}><div className="text-xxs font-bold uppercase tracking-wider text-gray-400">QuickBooks</div><QboCell invoiceId={i.id} /></div>}
                <div className="text-right">
                  <div className="text-xxs font-bold uppercase tracking-wider text-gray-400">Balance Due</div>
                  <div className="text-xl font-black text-gray-900">{money(invoiceBalance(i), { cents: true })}</div>
                  <div className="text-xs text-gray-400">Total: {money(i.amount, { cents: true })}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Screen>
  );
}

export function InvoiceDetailsScreen() {
  const id = useParam("id");
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const inv = byId(db.invoices, id);
  const docRef = useRef<HTMLDivElement>(null);
  const [paying, setPaying] = useState(false);
  if (!inv) {
    return <Screen crumbs={[{ label: "Invoices", href: "/invoices" }, { label: "Invoice Details" }]}><EmptyState title="Invoice not found." /></Screen>;
  }
  const job = byId(db.jobs, inv.jobId);
  const customer = byId(db.customers, job?.customerId);
  const property = byId(db.properties, job?.propertyId);
  const closed = inv.status === "paid" || inv.status === "void";
  const canPay = can(user, "payment.process");
  const canSend = can(user, "invoice.send");
  return (
    <Screen crumbs={[{ label: "Invoices", href: "/invoices" }, { label: "Invoice Details" }]} bare>
      <div className="mx-auto w-full p-4 pb-32 md:p-8">
        <div className="mx-auto max-w-[8.5in]">
          <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
            <AppLink href="/invoices" className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-primary-700"><ArrowLeft className="h-4 w-4" /> Back to Invoices</AppLink>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => printElement(docRef.current, inv.id)}><Download className="h-4 w-4" /> Download PDF</Button>
              {!closed && inv.status === "draft" && (
                <>
                  {canPay && <Button onClick={() => setPaying(true)}>Record Payment</Button>}
                  {canSend && <Button variant="primary" onClick={() => act(sendInvoice, inv.id).ok && toast.success("Invoice sent", "Queued for QuickBooks.")}><Send className="h-4 w-4" /> Send Invoice</Button>}
                </>
              )}
              {!closed && inv.status !== "draft" && (
                <>
                  {canSend && <Button onClick={() => act(sendInvoice, inv.id).ok && toast.success("Invoice resent")}><Send className="h-4 w-4" /> Resend Invoice</Button>}
                  {canPay && <Button variant="primary" onClick={() => setPaying(true)}>Record Payment</Button>}
                </>
              )}
            </div>
          </div>

          <div ref={docRef} className="min-h-[11in] rounded-sm bg-white p-6 shadow-2xl md:p-12">
            <div className="text-center"><h2 className="font-heading text-2xl font-extrabold">{job?.name}</h2><div className="text-sm text-gray-500">Invoice #{inv.id}</div></div>
            <div className="mt-8 flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-6">
              <div><div className="font-heading text-lg font-bold">Estimate Master Painting</div><div className="text-xs text-gray-500">410 Commerce Park, Dallas, TX 75201</div></div>
              <div className="text-right"><div className="text-xxs font-bold uppercase tracking-widest text-gray-400">Balance Due</div><div className="font-heading text-4xl font-black">{money(invoiceBalance(inv), { cents: true })}</div><StatusPill tone={STATUS[inv.status].tone}>{STATUS[inv.status].label}</StatusPill></div>
            </div>
            <div className="grid gap-4 border-b border-gray-200 py-6 sm:grid-cols-3 text-sm">
              <div><div className="text-xxs font-bold uppercase tracking-widest text-gray-400">Client</div><div className="font-semibold">{customer?.name}</div><div className="text-gray-500">{customer?.email}</div></div>
              <div><div className="text-xxs font-bold uppercase tracking-widest text-gray-400">Job Site</div><div>{property ? propertyAddress(property, true) : "No job address specified"}</div></div>
              <div><div className="text-xxs font-bold uppercase tracking-widest text-gray-400">Dates</div><div>Invoice Date: {date(inv.createdAt)}</div></div>
            </div>
            <table className="mt-6 w-full text-sm">
              <thead><tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wider text-gray-500"><th className="py-2">Item</th><th className="py-2 text-right">Price</th></tr></thead>
              <tbody>
                {inv.lines
                  ? inv.lines.map((l) => <tr key={l.id} className="border-b border-gray-100"><td className="py-2">{l.description}{l.quantity !== 1 && ` × ${l.quantity}`}</td><td className="py-2 text-right">{money(l.quantity * l.rate, { cents: true })}</td></tr>)
                  : <tr className="border-b border-gray-100"><td className="py-2">{inv.kind === "standard" ? (inv.amount < (job?.contractValue ?? 0) ? "Deposit" : "Contract work") : inv.kind === "credit_note" ? "Credit note" : "Supplemental: change order"} {inv.changeOrderId && `(${inv.changeOrderId})`}</td><td className="py-2 text-right">{money(inv.amount, { cents: true })}</td></tr>}
              </tbody>
            </table>
            <div className="mt-6 flex justify-end"><div className="w-64 space-y-1 text-sm">
              {!!inv.discount && <div className="flex justify-between text-gray-500"><span>Discount</span><span>−{money(inv.discount, { cents: true })}</span></div>}
              {!!inv.taxRatePct && <div className="flex justify-between text-gray-500"><span>Tax ({inv.taxRatePct}%)</span><span>{money(inv.amount - ((inv.lines ?? []).reduce((s, l) => s + l.quantity * l.rate, 0) - (inv.discount ?? 0)), { cents: true })}</span></div>}
              <div className="flex justify-between border-t-2 border-gray-900 pt-2 font-extrabold"><span>Total</span><span>{money(inv.amount, { cents: true })}</span></div>
              {inv.depositDue !== undefined && <div className="flex justify-between text-gray-500"><span>Deposit due</span><span>{money(inv.depositDue, { cents: true })}</span></div>}
              <div className="flex justify-between text-gray-500"><span>Paid</span><span>{money(invoicePaid(inv), { cents: true })}</span></div>
            </div></div>
            {job && <div className="no-print mt-6 text-xs text-gray-400">Job <AppLink href={jobHref(job.id)} className="font-semibold text-primary-700 hover:underline">{job.id}</AppLink></div>}
          </div>

          {(inv.payments ?? []).length > 0 && (
            <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 font-heading text-lg font-bold"><CreditCard className="h-5 w-5 text-primary-600" /> Payment History</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="border-b border-gray-100"><tr>{["Date", "Type", "Method", "Status", "Amount"].map((h) => <th key={h} className={cn("px-3 py-2 text-xs font-bold uppercase tracking-wider text-gray-500", h === "Amount" && "text-right")}>{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-gray-100">{inv.payments!.map((p) => <tr key={p.id}><td className="px-3 py-2">{dateTime(p.at)}</td><td className="px-3 py-2">Charge</td><td className="px-3 py-2 capitalize">{p.method.replace("_", " ")}{p.reference && ` · ${p.reference}`}</td><td className="px-3 py-2"><StatusPill tone="green">Approved</StatusPill></td><td className="px-3 py-2 text-right font-bold">{money(p.amount, { cents: true })}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
          {can(user, "finance.access") && <QboCard invoiceId={inv.id} />}
        </div>
      </div>
      <PaymentModal open={paying} onOpenChange={setPaying} invoice={inv} />
    </Screen>
  );
}

function QboCard({ invoiceId }: { invoiceId: string }) {
  const q = useQbo(invoiceId);
  return (
    <div className="mt-8 rounded-2xl border border-green-300 bg-white p-6 shadow-sm ring-1 ring-green-100" data-tour="invoice-qbo">
      <h3 className="mb-3 flex flex-wrap items-center gap-2 font-heading text-lg font-bold"><Landmark className="h-5 w-5 text-primary-600" /> QuickBooks exchange <NewBadge feature={33} /> <ConfirmBadge /></h3>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <StatusPill tone={q.tone}>{q.state}</StatusPill>
        {q.rec?.externalRef && <span className="font-mono text-xs text-gray-500">{q.rec.externalRef}</span>}
        {q.rec?.variance && !q.rec.variance.reviewedAt && <span className="text-xs font-semibold text-amber-700">Edited in QuickBooks: variance to review</span>}
      </div>
      {q.items.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-gray-600">{q.items.map((i) => <li key={i.id}>{i.id} · version {i.version} · {i.status} · queued {dateTime(i.queuedAt)}{i.attempts.length ? ` · ${i.attempts.length} attempt(s)` : ""}</li>)}</ul>
      ) : <p className="mt-2 text-xs text-gray-500">Sent to QuickBooks when the invoice is sent. QuickBooks owns the ledger; payments here are recorded, not charged.</p>}
      <AppLink href="/accounting/transfer-queue" className="mt-3 inline-block text-xs font-bold text-primary-700 hover:underline">Open the transfer queue →</AppLink>
    </div>
  );
}

function PaymentModal({ open, onOpenChange, invoice }: { open: boolean; onOpenChange: (v: boolean) => void; invoice: Invoice }) {
  const [mode, setMode] = useState<"credit_card" | "check" | "cash" | "bank_transfer">("check");
  const [amount, setAmount] = useState(String(invoiceBalance(invoice)));
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<{ field?: string; message: string }>();
  function submit() {
    const r = act(recordInvoicePayment, invoice.id, { amount: Number(amount), method: mode, reference: ref, notes });
    if (!r.ok) return setError({ field: r.field, message: r.error });
    toast.success("Payment recorded", "Queued for QuickBooks.");
    onOpenChange(false);
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" title="Record Payment" footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" onClick={submit}>{mode === "credit_card" ? "Charge Card" : "Record Payment"}</Button></>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-gray-50 p-4"><div className="text-xs font-bold uppercase tracking-widest text-gray-400">Balance Due</div><div className="font-heading text-2xl font-black">{money(invoiceBalance(invoice), { cents: true })}</div></div>
        <div className="flex flex-wrap gap-2">
          {([["credit_card", "Credit Card"], ["check", "Check"], ["cash", "Cash"], ["bank_transfer", "Bank Transfer"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} className={cn("rounded-lg border px-3 py-1.5 text-sm font-semibold", mode === k ? "border-primary-600 bg-primary-50 text-primary-700" : "border-gray-200 text-gray-600")}>{l}</button>
          ))}
        </div>
        <Field label="Payment Amount ($)" required error={error?.field === "amount" ? error.message : undefined} hint={`Maximum: ${money(invoiceBalance(invoice), { cents: true })}`}><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={error?.field === "amount"} /></Field>
        {mode === "credit_card" && <Banner tone="info">Card data is tokenized securely by Authorize.Net. PCI compliant. (Card entry is not rebuilt in the prototype: the payment is recorded.)</Banner>}
        {(mode === "check" || mode === "bank_transfer") && <Field label={mode === "check" ? "Check Number / Reference" : "Reference Number"} required error={error?.field === "reference" ? error.message : undefined}><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder={mode === "check" ? "e.g. 1024" : "e.g. TXN-9876"} invalid={error?.field === "reference"} /></Field>}
        <Field label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional payment notes..." /></Field>
        {error && !error.field && <Banner tone="danger">{error.message}</Banner>}
      </div>
    </Modal>
  );
}
