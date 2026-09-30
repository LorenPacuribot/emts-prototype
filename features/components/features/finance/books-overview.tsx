"use client";
/**
 * Estimate Master Books, inside Accounting (30 Sep call, BK). Books is a mode
 * of /accounting, not a new sidebar item. It shows when the accounting
 * destination is Books and, in the prototype, can always be opened to
 * compare with QuickBooks.
 *  - BooksOverview (BK-M1): Cash in bank, Owed to you, You owe, Profit this month.
 *  - PaymentsToDepositCard (BK-M10): card payments not yet in the bank;
 *    "Match batch" posts the net to 1000 and the fee to 6200. Also on the
 *    checkbook and the feeds.
 *  - Unpaid invoices with an owner-only "Write off" (reason required), and
 *    customer credits from overpayments (BK-M11).
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, CreditCard, Landmark, ReceiptText } from "lucide-react";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { booksOf, canKeepBooks, matchCardBatch, writeOffInvoice } from "@/features/lib/store/actions/ledger";
import { balances, incomeStatement, type JournalEntry } from "@/features/lib/rules/ledger";
import { roundMoney } from "@/features/lib/rules/rounding";
import { money } from "@/features/lib/format";
import { now } from "@/features/lib/clock";
import { toast } from "@/features/lib/toast";
import { Badge, Button, Card, CardLabel, EmptyState, Field, Input, Modal, NewBadge, Stat, StatStrip, Table, TD, TH, THead, TR, Textarea, VersionBadge } from "@/features/components/ui";

export function useBooksData() {
  const db = useDb((d) => d);
  return useMemo(() => db.books ?? booksOf(structuredClone(db)), [db]);
}

/** Money each invoice still has open on 1200, from the journal. */
export function openInvoices(journal: JournalEntry[]) {
  const by = new Map<string, { ref: string; party?: string; jobId?: string; open: number; date: string }>();
  for (const e of journal) {
    if (e.source.kind === "opening_balances") continue;
    for (const l of e.lines) {
      if (l.account !== "1200") continue;
      const cur = by.get(e.source.ref) ?? { ref: e.source.ref, party: e.party, jobId: l.jobId, open: 0, date: e.date };
      cur.open = roundMoney(cur.open + l.debit - l.credit);
      by.set(e.source.ref, cur);
    }
  }
  return [...by.values()].filter((x) => x.open > 0.004).sort((a, b) => a.date.localeCompare(b.date));
}

export function PaymentsToDepositCard() {
  const books = useBooksData();
  const user = useCurrentUser();
  const waiting = roundMoney(balances(books.journal).get("1050") ?? 0);
  // The newest card payments that make up what is still waiting (older ones are already batched).
  const payments: JournalEntry[] = [];
  let left = waiting;
  for (const e of [...books.journal].reverse()) {
    if (left <= 0.004) break;
    if (e.source.kind !== "card_payment" || e.reversedBy) continue;
    payments.push(e);
    left = roundMoney(left - (e.lines.find((l) => l.account === "1050")?.debit ?? 0));
  }
  const [open, setOpen] = useState(false);
  const [gross, setGross] = useState("");
  const [fee, setFee] = useState("");
  return (
    <Card className="mb-4 p-4">
      <CardLabel icon={<CreditCard />} right={canKeepBooks(user) && <Button size="sm" variant="primary" disabled={waiting <= 0} onClick={() => { setGross(waiting.toFixed(2)); setFee((Math.round(waiting * 2.9 + 30) / 100).toFixed(2)); setOpen(true); }}>Match batch</Button>}>
        <span className="inline-flex items-center gap-1.5">Payments to deposit <VersionBadge item="BK-M10" /></span>
      </CardLabel>
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <span className="font-heading text-2xl font-extrabold tabular-nums text-ink">{money(waiting)}</span>
        <span className="text-xs text-gray-500">card payments taken, not yet in Chase Checking (1050)</span>
      </div>
      {waiting > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-gray-600">
          {payments.map((e) => <li key={e.id}>{e.date} · {e.source.ref} · {e.party} · {money(e.lines.find((l) => l.account === "1050")?.debit ?? 0)}</li>)}
        </ul>
      )}
      {open && (
        <Modal open onOpenChange={(v) => !v && setOpen(false)} title="Match card batch" description="When the processor's deposit reaches the bank: the net goes to 1000, the fee to 6200 Card processing fees." size="sm"
          footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => { const r = act(matchCardBatch, Number(gross), Number(fee)); if (r.ok) { toast.success("Batch matched", `${money(Number(gross) - Number(fee))} to Chase Checking, ${money(Number(fee))} fee to 6200.`); setOpen(false); } }}>Match batch</Button></>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Batch total (gross)"><Input type="number" step="0.01" value={gross} onChange={(e) => setGross(e.target.value)} /></Field>
            <Field label="Processing fee"><Input type="number" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} /></Field>
          </div>
          <p className="mt-2 text-xs text-gray-500">Deposited to the bank: <b>{money(roundMoney(Number(gross || 0) - Number(fee || 0)))}</b></p>
        </Modal>
      )}
    </Card>
  );
}

export function BooksOverview() {
  const books = useBooksData();
  const user = useCurrentUser();
  const b = balances(books.journal);
  const month = now().slice(0, 7);
  const pnl = incomeStatement(books.journal, books.accounts, { from: `${month}-01`, to: `${month}-31` });
  const cash = roundMoney(b.get("1000") ?? 0);
  const owedToYou = roundMoney(b.get("1200") ?? 0);
  const youOwe = roundMoney(-((b.get("2000") ?? 0) + (b.get("2300") ?? 0)));
  const unpaid = openInvoices(books.journal);
  const credits = books.journal.flatMap((e) => e.lines.filter((l) => l.account === "2100" && l.memo === "Customer credit (overpayment)").map((l) => ({ e, l })));
  const [writing, setWriting] = useState<{ ref: string; open: number; jobId?: string }>();
  const [reason, setReason] = useState("");

  return (
    <>
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
        <BookOpen className="h-4 w-4" /> Estimate Master Books <VersionBadge item="BK-M1" />
      </div>
      <StatStrip className="mb-4">
        <Stat label="Cash in bank" value={money(cash)} hint="1000 Chase Checking" />
        <Stat label="Owed to you" value={money(owedToYou)} hint="1200 Money owed by customers" />
        <Stat label="You owe" value={money(youOwe)} hint="Suppliers and the Chase card" tone={youOwe > 0 ? "warn" : "default"} />
        <Stat label="Profit this month" value={money(pnl.netProfit)} tone={pnl.netProfit < 0 ? "danger" : "good"} hint="Accrual" />
      </StatStrip>

      <PaymentsToDepositCard />

      <Card className="mb-4 p-4">
        <CardLabel icon={<ReceiptText />}>
          <span className="inline-flex items-center gap-1.5">Unpaid invoices <VersionBadge item="BK-M11" /></span>
        </CardLabel>
        {unpaid.length === 0 ? <EmptyState title="Nothing owed" body="Every invoice in the books is paid." /> : (
          <Table className="mt-3">
            <THead><tr><TH>Invoice</TH><TH>Customer</TH><TH>Job</TH><TH className="text-right">Open</TH><TH /></tr></THead>
            <tbody>{unpaid.map((x) => (
              <TR key={x.ref}>
                <TD className="font-semibold">{x.ref}</TD><TD>{x.party}</TD><TD>{x.jobId ?? "—"}</TD><TD className="text-right tabular-nums">{money(x.open)}</TD>
                <TD className="text-right">
                  {user.role === "owner"
                    ? <Button size="sm" variant="danger" onClick={() => { setReason(""); setWriting(x); }}>Write off</Button>
                    : <span className="text-xs text-gray-500">Owner writes off</span>}
                </TD>
              </TR>
            ))}</tbody>
          </Table>
        )}
        {credits.length > 0 && (
          <div className="mt-3 text-xs text-gray-600">
            <div className="mb-1 font-semibold text-gray-700">Customer credits (overpayments held in 2100)</div>
            {credits.map(({ e, l }) => <div key={e.id}>{e.party ?? e.source.ref} · {money(l.credit)} · {e.date}</div>)}
          </div>
        )}
        {books.writeOffs.length > 0 && (
          <div className="mt-3 space-y-1 text-xs text-gray-600">
            {books.writeOffs.map((w) => <div key={w.entryId}><Badge tone="gray">Written off</Badge> {w.invoiceRef} · {money(w.amount)} · {w.reason} · {w.by}</div>)}
          </div>
        )}
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <span className="flex items-center gap-2 text-sm text-gray-700"><Landmark className="h-4 w-4 text-gray-500" /> {books.journal.length} journal entries. Every one balances; mistakes are reversed, never deleted.</span>
        <Link href="/accounting/journal" className="text-sm font-bold text-primary-700 hover:underline">Open the journal →</Link>
      </Card>

      {writing && (
        <Modal open onOpenChange={(v) => !v && setWriting(undefined)} title={`Write off ${writing.ref}?`} description={`${money(writing.open)} moves to 6900 Bad debts. Only the owner can do this.`} size="sm"
          footer={<><Button variant="secondary" onClick={() => setWriting(undefined)}>Cancel</Button><Button variant="danger-solid" disabled={!reason.trim()} onClick={() => { if (act(writeOffInvoice, writing.ref, writing.open, reason, writing.jobId).ok) { toast.success(`${writing.ref} written off`, "Posted: Dr 6900 Bad debts, Cr 1200."); setWriting(undefined); } }}>Write off</Button></>}>
          <Field label="Reason" required><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this won't be collected" /></Field>
        </Modal>
      )}
    </>
  );
}
