"use client";
/**
 * Estimate Master Books reports (30 Sep call, BK), on the Reports finance
 * tabs next to Income & Expense and Aged Receivables.
 *  - BalanceSheetReport (BK-M6): assets = liabilities + equity, always.
 *  - SalesTaxReport (BK-M13, BK-M12): collected, paid, owed, and
 *    "Record payment to state".
 *  - Complete: JobProfitReport (BK-C3), ContractorsReport and BudgetReport (BK-C6).
 * Every finance report has a Cash / Accrual toggle (BasisToggle), Accrual by default.
 */
import { useState } from "react";
import { CheckCircle2, Download, Scale } from "lucide-react";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { booksOf, canKeepBooks, recordStatePayment } from "@/features/lib/store/actions/ledger";
import {
  balanceSheet, budgetVsActual, contractors1099, incomeStatement, jobProfit, salesTaxSummary, type Basis, type LedgerAccount,
} from "@/features/lib/rules/ledger";
import { money } from "@/features/lib/format";
import { now } from "@/features/lib/clock";
import { downloadCsv } from "@/features/lib/export";
import { toast } from "@/features/lib/toast";
import { cn } from "@/features/lib/cn";
import { Badge, Banner, Button, Card, CardLabel, Field, Input, Modal, NewBadge, Table, TD, TH, THead, TR, VersionBadge } from "@/features/components/ui";

/** Books read with a fallback for data saved before Books existed. */
function useBooks() {
  const db = useDb((d) => d);
  return db.books ?? booksOf(structuredClone(db));
}

export function BasisToggle({ value, onChange }: { value: Basis; onChange: (b: Basis) => void }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex rounded-xl border border-gray-200 bg-gray-100 p-1" role="radiogroup" aria-label="Report basis">
        {(["accrual", "cash"] as const).map((b) => (
          <button key={b} type="button" role="radio" aria-checked={value === b} onClick={() => onChange(b)}
            className={cn("rounded-lg px-3 py-1 text-xs font-bold", value === b ? "bg-white text-primary-700 shadow-sm" : "text-gray-500 hover:text-gray-900")}>
            {b === "accrual" ? "Accrual" : "Cash"}
          </button>
        ))}
      </span>
      <VersionBadge item="BK-M13" />
    </span>
  );
}

const Row = ({ a, amount, strong }: { a: string; amount: number; strong?: boolean }) => (
  <TR><TD className={cn(strong && "font-bold")}>{a}</TD><TD className={cn("text-right tabular-nums", strong && "font-bold", amount < 0 && "text-red-600")}>{money(amount)}</TD></TR>
);
const label = (a: LedgerAccount) => `${a.no} ${a.name}`;

/* ---------- Balance Sheet (BK-M6) ---------- */

export function BalanceSheetReport({ basis }: { basis: Basis }) {
  const books = useBooks();
  const today = now().slice(0, 10);
  const bs = balanceSheet(books.journal, books.accounts, today);
  return (
    <Card className="p-4">
      <CardLabel icon={<Scale />} right={bs.balances ? <Badge tone="green" icon={<CheckCircle2 className="h-3 w-3" />}>Balances</Badge> : <Badge tone="red">Does not balance</Badge>}>
        <span className="inline-flex items-center gap-1.5">Balance Sheet at {today} <VersionBadge item="BK-M6" /></span>
      </CardLabel>
      {basis === "cash" && <Banner tone="info" className="mt-3">A balance sheet is the same on either basis in the prototype. Cash changes the profit reports.</Banner>}
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <Table>
          <THead><tr><TH>Assets</TH><TH className="text-right">Amount</TH></tr></THead>
          <tbody>
            {bs.assets.map((r) => <Row key={r.account.no} a={label(r.account)} amount={r.amount} />)}
            <Row a="Total assets" amount={bs.totalAssets} strong />
          </tbody>
        </Table>
        <Table>
          <THead><tr><TH>Liabilities and equity</TH><TH className="text-right">Amount</TH></tr></THead>
          <tbody>
            {bs.liabilities.map((r) => <Row key={r.account.no} a={label(r.account)} amount={r.amount} />)}
            <Row a="Total liabilities" amount={bs.totalLiabilities} strong />
            {bs.equity.map((r) => <Row key={r.account.no} a={label(r.account)} amount={r.amount} />)}
            <Row a="Current year earnings" amount={bs.earnings} />
            <Row a="Total equity" amount={bs.totalEquity} strong />
            <Row a="Total liabilities and equity" amount={Math.round((bs.totalLiabilities + bs.totalEquity) * 100) / 100} strong />
          </tbody>
        </Table>
      </div>
      <p className="mt-2 text-xs text-gray-500">Profit not yet rolled into 3900 Retained earnings shows as current year earnings. Closing December rolls it in.</p>
    </Card>
  );
}

/* ---------- Sales tax (BK-M13, BK-M12) ---------- */

export function SalesTaxReport({ basis }: { basis: Basis }) {
  const books = useBooks();
  const user = useCurrentUser();
  const year = now().slice(0, 4);
  const t = salesTaxSummary(books.journal, { from: `${year}-01-01` }, basis);
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState("");
  const lines = books.journal.flatMap((e) => e.lines.filter((l) => l.account === "2200").map((l) => ({ e, l }))).sort((a, b) => b.e.date.localeCompare(a.e.date));
  return (
    <Card className="p-4">
      <CardLabel right={canKeepBooks(user) && <Button size="sm" variant="primary" disabled={t.owed <= 0} onClick={() => { setAmount(t.owed.toFixed(2)); setPaying(true); }}>Record payment to state <VersionBadge item="BK-M12" /></Button>}>
        <span className="inline-flex items-center gap-1.5">Sales tax summary <VersionBadge item="BK-M13" /></span>
      </CardLabel>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[["Collected this year", t.collected], ["Paid to the state", t.paid], ["Owed now", t.owed]].map(([k, v]) => (
          <div key={k as string} className="rounded-xl border border-gray-200 p-3">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500">{k}</div>
            <div className="mt-1 font-heading text-2xl font-extrabold tabular-nums text-ink">{money(v as number)}</div>
          </div>
        ))}
      </div>
      {basis === "cash" && <p className="mt-2 text-xs text-gray-500">The prototype books sales tax with the invoice on both bases.</p>}
      <Table className="mt-3">
        <THead><tr><TH>Date</TH><TH>Entry</TH><TH>Reference</TH><TH className="text-right">Collected</TH><TH className="text-right">Paid</TH></tr></THead>
        <tbody>{lines.map(({ e, l }, i) => (
          <TR key={`${e.id}-${i}`}><TD>{e.date}</TD><TD>{e.no}</TD><TD>{e.source.ref} <span className="text-gray-500">{e.party}</span></TD>
            <TD className="text-right tabular-nums">{l.credit ? money(l.credit) : ""}</TD><TD className="text-right tabular-nums">{l.debit ? money(l.debit) : ""}</TD></TR>
        ))}</tbody>
      </Table>
      {paying && (
        <Modal open onOpenChange={(v) => !v && setPaying(false)} title="Record payment to state" size="sm"
          footer={<><Button variant="secondary" onClick={() => setPaying(false)}>Cancel</Button><Button variant="primary" onClick={() => { if (act(recordStatePayment, Number(amount)).ok) { toast.success("Sales tax payment recorded", "Posted: Dr 2200 Sales tax to pay, Cr 1000 Chase Checking."); setPaying(false); } }}>Record payment</Button></>}>
          <Field label="Amount paid"><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <p className="mt-2 text-xs text-gray-500">Owed now: {money(t.owed)}. This records the payment; nothing is paid from here.</p>
        </Modal>
      )}
    </Card>
  );
}

/* ---------- Complete: job profit (BK-C3) ---------- */

export function JobProfitReport({ basis }: { basis: Basis }) {
  const books = useBooks();
  const jobs = [...new Set(books.journal.flatMap((e) => e.lines.map((l) => l.jobId).filter(Boolean) as string[]))].sort();
  const rows = jobs.map((j) => ({ job: j, ...jobProfit(books.journal, j, basis) }));
  return (
    <Card className="p-4">
      <CardLabel><span className="inline-flex items-center gap-1.5">Job profit from Books <VersionBadge item="BK-C3" /></span></CardLabel>
      <p className="mt-1 text-xs text-gray-500">{basis === "accrual" ? "Invoiced income less job costs posted to the job." : "Money collected less job costs paid, per job."} Deposits held are liabilities, not income.</p>
      <Table className="mt-3">
        <THead><tr><TH>Job</TH><TH className="text-right">Income</TH><TH className="text-right">Job costs</TH><TH className="text-right">Profit</TH><TH className="text-right">Deposits held</TH></tr></THead>
        <tbody>{rows.map((r) => (
          <TR key={r.job}><TD className="font-semibold">{r.job}</TD><TD className="text-right tabular-nums">{money(r.income)}</TD><TD className="text-right tabular-nums">{money(r.costs)}</TD>
            <TD className={cn("text-right font-semibold tabular-nums", r.profit < 0 && "text-red-600")}>{money(r.profit)}</TD><TD className="text-right tabular-nums">{money(r.depositsHeld)}</TD></TR>
        ))}</tbody>
      </Table>
    </Card>
  );
}

/* ---------- Complete: 1099 contractors and budget (BK-C6) ---------- */

export function ContractorsReport() {
  const books = useBooks();
  const year = Number(now().slice(0, 4));
  const rows = contractors1099(books.journal, year);
  const csv = () => { downloadCsv(`1099-contractors-${year}.csv`, [["Contractor", "Paid", "Needs 1099"], ...rows.map((r) => [r.party, r.amount, r.needs1099 ? "Yes" : "No"])]); toast.success("1099 list exported"); };
  return (
    <Card className="p-4">
      <CardLabel right={<Button size="sm" onClick={csv}><Download className="h-3.5 w-3.5" /> CSV</Button>}>
        <span className="inline-flex items-center gap-1.5">1099 contractors {year} <VersionBadge item="BK-C6" /></span>
      </CardLabel>
      <p className="mt-1 text-xs text-gray-500">Subcontractors (5100) paid $600 or more in the year need a 1099-NEC.</p>
      <Table className="mt-3">
        <THead><tr><TH>Contractor</TH><TH className="text-right">Paid</TH><TH>1099</TH></tr></THead>
        <tbody>{rows.map((r) => <TR key={r.party}><TD className="font-semibold">{r.party}</TD><TD className="text-right tabular-nums">{money(r.amount)}</TD><TD>{r.needs1099 ? <Badge tone="amber">Needs 1099</Badge> : <Badge tone="gray">Under $600</Badge>}</TD></TR>)}</tbody>
      </Table>
    </Card>
  );
}

export function BudgetReport({ basis }: { basis: Basis }) {
  const books = useBooks();
  const month = now().slice(0, 7);
  const r = { from: `${month}-01`, to: `${month}-31` };
  const rows = budgetVsActual(books.journal, books.accounts, books.budget, r, 1);
  const cash = basis === "cash" ? incomeStatement(books.journal, books.accounts, r, "cash") : undefined;
  return (
    <Card className="p-4">
      <CardLabel><span className="inline-flex items-center gap-1.5">Budget versus actual, {month} <VersionBadge item="BK-C6" /></span></CardLabel>
      {cash && <p className="mt-1 text-xs text-gray-500">Cash basis: actuals below are accrual; cash net profit this month is {money(cash.netProfit)}.</p>}
      <Table className="mt-3">
        <THead><tr><TH>Account</TH><TH className="text-right">Budget</TH><TH className="text-right">Actual</TH><TH className="text-right">Difference</TH></tr></THead>
        <tbody>{rows.map((x) => (
          <TR key={x.account.no}><TD className="font-semibold">{label(x.account)}</TD><TD className="text-right tabular-nums">{money(x.budget)}</TD><TD className="text-right tabular-nums">{money(x.actual)}</TD>
            <TD className={cn("text-right tabular-nums", x.account.type === "Income" ? (x.difference < 0 && "text-red-600") : (x.difference > 0 && "text-red-600"))}>{money(x.difference)}</TD></TR>
        ))}</tbody>
      </Table>
    </Card>
  );
}

