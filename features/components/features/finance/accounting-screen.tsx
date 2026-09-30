"use client";
/**
 * Feature 33 — Accounting (screen-level wireframe).
 * Menu: Finance > Accounting
 *
 * Connection strip, the ownership legend, and every financial record with
 * its exchange status and flags. A record reached QuickBooks → its amount is
 * edited there, not here. Nothing on this screen initiates a payment.
 */
import { useState } from "react";
import { Banknote, CloudOff, FlaskConical, Landmark, Link2, Lock, RefreshCw, Scissors } from "lucide-react";
import type { FinanceRecord } from "@/features/types";
import { act, useCurrentUser, useDb, useStore } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { dateLong, dateTime, money } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { now } from "@/features/lib/clock";
import { inExchangeWindow, nextExchangeRun } from "@/features/lib/rules/finance";
import {
  applyDeposit, approvePayment, connectQuickBooks, editRecordAmount, isSentToQbo, latestItem, postCorrection, recordExternalPayment, reviewDeletion, reviewVariance, runExchange,
  setRetainageNote, simulateQboArrival, simulateQboDelete, simulateQboEdit,
} from "@/features/lib/store/actions/finance";
import { userName } from "@/features/lib/store/helpers";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Banner, Button, Card, CardLabel, Drawer, EmptyState, Field, Input, KV, Modal, PillTabs, RowMenu, Select, Stat, StatStrip, Table, TD, TH, THead, TR, Textarea } from "@/features/components/ui";
import { FinanceFrame } from "./finance-frame";
import { EXCHANGE_STATUS, OwnershipLegend, RecordFlags, TypeBadge } from "./shared";

type Filter = "all" | "invoices" | "money_in" | "bills" | "other" | "flags";

export function AccountingScreen() {
  return (
    <FinanceFrame tab="accounting">
      <Accounting />
    </FinanceFrame>
  );
}

function Accounting() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  useStore((s) => s.clockMode);
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string>();
  const [paying, setPaying] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const t = new Date(now());
  const qbo = db.financeSettings.qbo;

  const flagged = (r: FinanceRecord) => (!!r.variance && !r.variance.reviewedAt) || (!!r.deletedInQbo && !r.deletedInQbo.reviewedAt) || !!r.approvalRequest;
  const groups: Record<Filter, (r: FinanceRecord) => boolean> = {
    all: () => true,
    invoices: (r) => r.type === "invoice",
    money_in: (r) => r.type === "deposit" || r.type === "payment" || r.type === "refund",
    bills: (r) => r.type === "bill" || r.type === "credit" || r.type === "card_settlement",
    other: (r) => r.type === "receipt" || r.type === "check",
    flags: flagged,
  };
  const rows = [...db.financeRecords].sort((a, b) => b.date.localeCompare(a.date)).filter(groups[filter]);
  const count = (f: Filter) => db.financeRecords.filter(groups[f]).length;
  const liabilities = db.financeRecords.filter((r) => r.liability).reduce((a, r) => a + r.amount, 0);

  const simulate = [
    { label: "QuickBooks edits an invoice amount", icon: <FlaskConical />, onSelect: () => {
      const inv = db.financeRecords.find((r) => r.type === "invoice" && !r.variance && isSentToQbo(db, r));
      if (!inv) return toast.info("No sent invoice without a variance");
      if (act(simulateQboEdit, inv.id, Math.round((inv.amount - 25) * 100) / 100).ok) toast.success("Variance flagged", `${inv.ref} changed in QuickBooks. The office manager reviews it.`);
    } },
    { label: "A record is deleted in QuickBooks", icon: <CloudOff />, onSelect: () => {
      const rec = db.financeRecords.find((r) => r.externalRef && !r.deletedInQbo && (r.type === "receipt" || r.type === "bill"));
      if (!rec) return toast.info("Nothing left to delete");
      if (act(simulateQboDelete, rec.id).ok) toast.success("Deletion flagged", `${rec.ref} is flagged for review. The local record stays.`);
    } },
    { label: "A receipt arrives with no job", icon: <Link2 />, onSelect: () => act(simulateQboArrival).ok && toast.success("Unallocated receipt arrived", "Code it under Unallocated.") },
  ];

  return (
    <>
      <PageHeader
        title="Accounting"
        subtitle="Job-level records exchanged with QuickBooks Online." details="QuickBooks owns amounts and dates; Estimate Master owns the job and cost code."
        actions={
          <>
            {can(user, "finance.recordPayment") && <Button onClick={() => setPaying(true)}><Banknote className="h-4 w-4" /> Record external payment</Button>}
            {can(user, "finance.code") && <Button onClick={() => setCorrecting(true)}><Scissors className="h-4 w-4" /> Post correction</Button>}
            {can(user, "finance.exchange") && <Button variant="primary" onClick={() => { const r = act(runExchange); if (r.ok) { const v = r.value as { accepted: number; rejected: number }; toast.success("Exchange run complete", `${v.accepted} accepted, ${v.rejected} rejected.`); } }}><RefreshCw className="h-4 w-4" /> Run exchange now</Button>}
            <RowMenu label="Simulate QuickBooks" items={simulate} />
          </>
        }
      />

      <Card className="mb-4 p-4" data-tour="qbo-strip">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Landmark className="h-4 w-4 text-brand" />
            <span className="font-display text-sm font-bold text-ink">QuickBooks Online</span>
            {qbo.connected ? <Badge tone="green">Connected · {qbo.realm}</Badge> : <Badge tone="red">Not connected</Badge>}
            <Badge tone={inExchangeWindow(t) ? "blue" : "gray"}>{inExchangeWindow(t) ? "Exchange window open" : "Outside exchange window"}</Badge>
          </div>
          {!qbo.connected && can(user, "finance.connect") && <Button size="sm" variant="primary" onClick={() => act(connectQuickBooks).ok && toast.success("QuickBooks connected")}>Connect</Button>}
        </div>
        <div className="mt-3 grid gap-3 text-xs sm:grid-cols-4 [&>*]:min-w-0">
          <div><div className="text-gray-500">Last successful exchange</div><div className="font-semibold">{dateTime(qbo.lastExchangeAt)}</div></div>
          <div><div className="text-gray-500">Next scheduled run</div><div className="font-semibold">{dateTime(nextExchangeRun(t).toISOString())}</div></div>
          <div><div className="text-gray-500">Window</div><div className="font-semibold">Hourly, 6:00 a.m.–6:00 p.m., Mon–Sat</div></div>
          <div><div className="text-gray-500">Bank feeds</div><div className="font-semibold">Chase feeds stay in QuickBooks — never duplicated here</div></div>
        </div>
      </Card>

      <div className="mb-4"><OwnershipLegend /></div>

      <StatStrip className="mb-4">
        <Stat label="Records" value={db.financeRecords.length} />
        <Stat label="Flags to review" value={count("flags")} tone={count("flags") ? "warn" : "good"} />
        <Stat label="Deposits held" value={money(liabilities)} hint="liabilities until invoiced" />
        <Stat label="Rejected transfers" value={db.exchangeQueue.filter((q) => q.status === "rejected" && !q.supersededBy).length} tone="danger" />
        <Stat label="Closed periods" value={db.financeSettings.closedPeriods.join(", ") || "—"} />
      </StatStrip>

      <PillTabs<Filter>
        className="mb-4"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All", count: count("all") },
          { value: "invoices", label: "Invoices", count: count("invoices") },
          { value: "money_in", label: "Deposits & payments", count: count("money_in") },
          { value: "bills", label: "Bills & credits", count: count("bills") },
          { value: "other", label: "Receipts & checks", count: count("other") },
          { value: "flags", label: "Flags", count: count("flags") },
        ]}
      />

      <Card className="p-4" data-tour="finance-records">
        {rows.length === 0 ? <EmptyState icon={<Landmark />} title="No records in this view" body="Pick another view above to see other records." /> : (
          <Table>
            <THead><tr><TH>Type</TH><TH>Reference</TH><TH>Party</TH><TH className="text-right">Amount</TH><TH>Date</TH><TH>Job / code</TH><TH>Exchange</TH><TH>Flags</TH></tr></THead>
            <tbody>
              {rows.map((r) => {
                const q = latestItem(db, r.id);
                return (
                  <TR key={r.id} className="cursor-pointer" onClick={() => setOpenId(r.id)}>
                    <TD><TypeBadge type={r.type} /></TD>
                    <TD className="font-semibold text-ink">{r.ref}<div className="text-xs font-normal text-gray-500">{r.externalRef ?? "Not yet in QuickBooks"}</div></TD>
                    <TD className="max-w-[220px] whitespace-normal">{r.party}</TD>
                    <TD className="text-right tabular-nums">{money(r.amount)}{r.salesTax ? <div className="text-xs text-gray-500">+ {money(r.salesTax)} sales tax</div> : r.purchaseTax ? <div className="text-xs text-gray-500">+ {money(r.purchaseTax)} purchase tax</div> : null}</TD>
                    <TD className="whitespace-nowrap">{dateLong(r.date)}<div className="text-xs text-gray-500">Period {r.period}</div></TD>
                    <TD>{r.allocations?.length ? `${r.allocations.length} row${r.allocations.length === 1 ? "" : "s"}` : r.jobId ?? <span className="text-amber-700">—</span>}<div className="text-xs text-gray-500">{r.costCode ?? ""}</div></TD>
                    <TD>{q ? <Badge tone={EXCHANGE_STATUS[q.status].tone}>{EXCHANGE_STATUS[q.status].label} v{q.version}</Badge> : r.origin === "quickbooks" ? <Badge tone="gray">From QuickBooks</Badge> : <span className="text-gray-300">—</span>}</TD>
                    <TD><RecordFlags r={r} /></TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <RecordDrawer recordId={openId} onClose={() => setOpenId(undefined)} />
      <PaymentModal open={paying} onClose={() => setPaying(false)} />
      <CorrectionModal open={correcting} onClose={() => setCorrecting(false)} />
    </>
  );
}

function RecordDrawer({ recordId, onClose }: { recordId?: string; onClose: () => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const r = byId(db.financeRecords, recordId);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [retain, setRetain] = useState<string>();
  const [invoice, setInvoice] = useState("");
  if (!r) return <Drawer open={false} onOpenChange={() => onClose()} title="">{null}</Drawer>;
  const sent = isSentToQbo(db, r);
  const q = latestItem(db, r.id);
  const paysOther = r.paysRecordId ? byId(db.financeRecords, r.paysRecordId) : undefined;

  return (
    <Drawer open={!!r} onOpenChange={(v) => !v && onClose()} title={<span className="flex items-center gap-2">{r.ref} <TypeBadge type={r.type} /></span>} subtitle={`${r.party} · ${r.id}`}>
      {r.variance && (
        <Banner tone={r.variance.reviewedAt ? "info" : "warn"} title={`Amount edited in QuickBooks: ${money(r.variance.sent)} → ${money(r.variance.current)}`}
          action={!r.variance.reviewedAt && can(user, "finance.reviewVariance") && <Button size="sm" onClick={() => act(reviewVariance, r.id).ok && toast.success("Variance reviewed")}>Mark reviewed</Button>}>
          {r.variance.reviewedAt ? `Reviewed by ${userName(db, r.variance.reviewedBy)} ${dateTime(r.variance.reviewedAt)}.` : "The local display value now shows the QuickBooks amount. The office manager reviews the difference."}
        </Banner>
      )}
      {r.deletedInQbo && (
        <Banner tone={r.deletedInQbo.reviewedAt ? "info" : "danger"} title="Deleted in QuickBooks — the local record is kept">
          {r.deletedInQbo.reviewedAt ? `Reviewed by ${userName(db, r.deletedInQbo.reviewedBy)}: ${r.deletedInQbo.note}` : (
            can(user, "finance.code") ? (
              <div className="mt-2 flex gap-2"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you find?" /><Button size="sm" onClick={() => act(reviewDeletion, r.id, note).ok && toast.success("Deletion reviewed")}>Record</Button></div>
            ) : "Flagged for review."
          )}
        </Banner>
      )}
      {r.approvalRequest && (
        <Banner tone="warn" title="Awaiting owner approval — above $2,500" action={can(user, "finance.approvePayment") && <Button size="sm" variant="primary" onClick={() => act(approvePayment, r.id).ok && toast.success("Payment approved", "Recorded and queued for QuickBooks.")}>Approve</Button>}>
          Requested by {userName(db, r.approvalRequest.by)} {dateTime(r.approvalRequest.at)}. It is recorded once approved. Estimate Master never initiates the payment.
        </Banner>
      )}
      <KV
        items={[
          ["Amount (pre-tax)", <span key="a" className="inline-flex items-center gap-1.5">{money(r.amount)} {sent && <Lock className="h-3 w-3 text-gray-500" />}</span>],
          ...(r.salesTax ? [["Customer sales tax", `${money(r.salesTax)} — never counted as revenue`] as [string, string]] : []),
          ...(r.purchaseTax ? [["Purchase tax", `${money(r.purchaseTax)} — included in gross job cost`] as [string, string]] : []),
          ["Date · period", `${dateLong(r.date)} · ${r.period}${r.postedFromClosedPeriod ? ` (from closed ${r.postedFromClosedPeriod})` : ""}`],
          ["Job", r.jobId ? `${r.jobId} · ${byId(db.jobs, r.jobId)?.name ?? ""}` : r.allocations?.length ? r.allocations.map((a) => `${a.overhead ? "Overhead" : a.jobId} ${money(a.amount)}`).join(", ") : "Not coded"],
          ["Cost code", r.costCode ?? "—"],
          ["QuickBooks reference", r.externalRef ?? "Not yet sent"],
          ["Exchange", q ? `${EXCHANGE_STATUS[q.status].label} (version ${q.version})` : r.origin === "quickbooks" ? "Arrived from QuickBooks" : "—"],
          ...(r.paymentStatus ? [["Payment status", `${r.paymentStatus}${r.amountPaid ? ` · ${money(r.amountPaid)} paid ${dateLong(r.paymentDate)}` : ""}`] as [string, string]] : []),
          ...(paysOther ? [["Pays", `${paysOther.ref} — not a second expense`] as [string, string]] : []),
          ...(r.accountCredit ? [["Overpayment", `${money(r.accountCredit)} held as account credit`] as [string, string]] : []),
          ...(r.note ? [["Note", r.note] as [string, string]] : []),
        ]}
      />

      {can(user, "finance.exchange") && (
        <Card className="p-4">
          <CardLabel>Amount</CardLabel>
          {sent ? (
            <p className="mt-2 text-xs text-gray-600">This record is in QuickBooks. Amounts are edited in QuickBooks; the new value returns on the next exchange.</p>
          ) : (
            <p className="mt-2 text-xs text-gray-600">Queued, not yet sent — the amount can still be edited here.</p>
          )}
          <div className="mt-2 flex gap-2">
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(r.amount)} className="w-40" />
            <Button size="sm" onClick={() => act(editRecordAmount, r.id, Number(amount)).ok && toast.success("Amount updated before send")}>Edit amount</Button>
          </div>
        </Card>
      )}

      {r.type === "deposit" && r.liability && can(user, "finance.recordPayment") && (
        <Card className="p-4">
          <CardLabel>Apply deposit</CardLabel>
          <p className="mt-1 text-xs text-gray-500">A deposit stays a liability until it is applied to an invoice.</p>
          <div className="mt-2 flex gap-2">
            <Select value={invoice} onChange={(e) => setInvoice(e.target.value)}>
              <option value="">— Choose invoice —</option>
              {db.financeRecords.filter((x) => x.type === "invoice" && x.jobId === r.jobId).map((x) => <option key={x.id} value={x.id}>{x.ref} · {money(x.amount)}</option>)}
            </Select>
            <Button size="sm" onClick={() => act(applyDeposit, r.id, invoice).ok && toast.success("Deposit applied")}>Apply</Button>
          </div>
        </Card>
      )}

      {can(user, "finance.config") && (
        <Card className="p-4">
          <CardLabel>Retainage note (bookkeeper)</CardLabel>
          <p className="mt-1 text-xs text-gray-500">A manual note. There is no retainage engine; bad-debt entries stay in QuickBooks.</p>
          <Textarea className="mt-2" value={retain ?? r.retainageNote ?? ""} onChange={(e) => setRetain(e.target.value)} />
          <Button size="sm" className="mt-2" onClick={() => act(setRetainageNote, r.id, retain ?? "").ok && toast.success("Note saved")}>Save note</Button>
        </Card>
      )}
    </Drawer>
  );
}

function PaymentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDb((d) => d);
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [billId, setBillId] = useState("");
  const [err, setErr] = useState<{ msg: string; field?: string }>();
  const bills = db.financeRecords.filter((r) => r.type === "bill" && r.paymentStatus !== "paid");
  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Record an external payment"
      description="Recording a payment made outside Estimate Master (check, bank transfer). Nothing is sent to a bank. Above $2,500 the owner approves first."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => {
        const r = act(recordExternalPayment, { payee, amount: Number(amount), reference, billId });
        if (r.ok) { const v = r.value as { held: boolean }; toast.success(v.held ? "Held for owner approval" : "Payment recorded", v.held ? "Above $2,500 — the owner approves before it is recorded." : "Queued for QuickBooks."); onClose(); setPayee(""); setAmount(""); setReference(""); setBillId(""); }
        else setErr({ msg: r.error, field: r.field });
      }}>Record</Button></>}
    >
      <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="Payee" required error={err?.field === "payee" ? err.msg : undefined}><Input value={payee} onChange={(e) => setPayee(e.target.value)} /></Field>
        <Field label="Amount" required error={err?.field === "amount" ? err.msg : undefined}><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Check number or bank reference" required error={err?.field === "reference" ? err.msg : undefined}><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        <Field label="Pays bill (optional)">
          <Select value={billId} onChange={(e) => setBillId(e.target.value)}>
            <option value="">— None —</option>
            {bills.map((b) => <option key={b.id} value={b.id}>{b.ref} · {money(b.amount + (b.purchaseTax ?? 0))}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

function CorrectionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDb((d) => d);
  const [jobId, setJobId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<{ msg: string; field?: string }>();
  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Post a correction"
      description={`Closed periods: ${db.financeSettings.closedPeriods.join(", ") || "none"}. A correction dated in a closed period posts to the next open period.`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => {
        const r = act(postCorrection, { jobId, amount: Number(amount), date: date || new Date().toISOString(), note });
        if (r.ok) { const v = r.value as { period: string; movedFrom?: string }; toast.success(`Posted to ${v.period}`, v.movedFrom ? `${v.movedFrom} is closed, so it lands in the next period.` : undefined); onClose(); }
        else setErr({ msg: r.error, field: r.field });
      }}>Post</Button></>}
    >
      <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="Job"><Select value={jobId} onChange={(e) => setJobId(e.target.value)}><option value="">— None —</option>{db.jobs.map((j) => <option key={j.id} value={j.id}>{j.id}</option>)}</Select></Field>
        <Field label="Amount" required error={err?.field === "amount" ? err.msg : undefined}><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Date the correction relates to"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="What it corrects" required error={err?.field === "note" ? err.msg : undefined}><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
