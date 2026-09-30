"use client";
/**
 * Journal (30 Sep call, BK-M3 and BK-M9), in Accounting › Overview.
 * One row per journal line: Date, Entry No., Source, Account, Debit, Credit,
 * Posted by. Each entry can be reversed with a required reason; there is no
 * delete. Exports the general ledger and trial balance as CSV and Excel
 * (BK-M8). Complete version: import a Gusto pay run (BK-C2).
 */
import { Fragment, useState } from "react";
import Link from "next/link";
import { Download, FileSpreadsheet, RotateCcw, Upload } from "lucide-react";
import { act, useCurrentUser } from "@/features/lib/store";
import { canKeepBooks, importGustoPayRun, reverseEntry } from "@/features/lib/store/actions/ledger";
import { generalLedgerRows, isBalanced, totals, trialBalanceRows, type JournalEntry } from "@/features/lib/rules/ledger";
import { money } from "@/features/lib/format";
import { now } from "@/features/lib/clock";
import { downloadCsv, downloadExcel } from "@/features/lib/export";
import { toast } from "@/features/lib/toast";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Button, Card, Field, Input, Modal, NewBadge, Select, Table, TD, TH, THead, TR, Textarea, VersionBadge, FeatureGate } from "@/features/components/ui";
import { FinanceFrame } from "./finance-frame";
import { useBooksData } from "./books-overview";

export function JournalScreen() {
  return (
    <FinanceFrame tab="journal">
      <Journal />
    </FinanceFrame>
  );
}

const SOURCE_HREF: Partial<Record<string, (ref: string) => string>> = {
  invoice: (r) => `/invoices/${r}`, deposit_invoice: (r) => `/invoices/${r}`, payment: (r) => `/invoices/${r}`, card_payment: (r) => `/invoices/${r}`, write_off: (r) => `/invoices/${r}`,
  bill: () => "/accounting/bills", bill_paid: () => "/accounting/bills", card_batch: () => "/accounting/feeds", card_purchase: () => "/accounting/feeds",
  sales_tax_paid: () => "/reports?tab=sales_tax",
};

function Journal() {
  const books = useBooksData();
  const user = useCurrentUser();
  const [account, setAccount] = useState("");
  const [q, setQ] = useState("");
  const [reversing, setReversing] = useState<JournalEntry>();
  const [reason, setReason] = useState("");
  const [gusto, setGusto] = useState(false);
  const name = (no: string) => books.accounts.find((a) => a.no === no)?.name ?? no;
  const entries = [...books.journal]
    .filter((e) => (!account || e.lines.some((l) => l.account === account)) && (!q || `${e.source.ref} ${e.memo} ${e.party ?? ""}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.date.localeCompare(a.date) || b.no - a.no);
  const all = totals(books.journal.flatMap((e) => e.lines));
  const stamp = now().slice(0, 10);

  const exp = (kind: "gl" | "tb", fmt: "csv" | "xls") => {
    const rows = kind === "gl" ? generalLedgerRows(books.journal, books.accounts) : trialBalanceRows(books.journal, books.accounts);
    const file = `${kind === "gl" ? "general-ledger" : "trial-balance"}-${stamp}`;
    if (fmt === "csv") downloadCsv(`${file}.csv`, rows);
    else downloadExcel(`${file}.xls`, kind === "gl" ? "General ledger" : "Trial balance", rows);
    toast.success(`${kind === "gl" ? "General ledger" : "Trial balance"} exported`, fmt === "csv" ? "CSV" : "Excel");
  };

  return (
    <>
      <PageHeader
        eyebrow={<><VersionBadge item="BK-M3" /></>}
        title="Journal"
        subtitle="Every entry in Estimate Master Books. Debits always equal credits."
        details="Mistakes are reversed with a reason: the reversal is a new entry and the original stays. Nothing is ever deleted. A date in a closed month posts on the 1st of the next open month, with a note."
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <FeatureGate item="BK-C2">
              {canKeepBooks(user) && <Button onClick={() => setGusto(true)}><Upload className="h-4 w-4" /> Import Gusto pay run <VersionBadge item="BK-C2" /></Button>}
            </FeatureGate>
          </span>
        }
      />
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-4">
        <span className="mr-auto flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">Export <VersionBadge item="BK-M8" /></span>
        <Button size="sm" onClick={() => exp("gl", "csv")}><Download className="h-3.5 w-3.5" /> General ledger CSV</Button>
        <Button size="sm" onClick={() => exp("gl", "xls")}><FileSpreadsheet className="h-3.5 w-3.5" /> General ledger Excel</Button>
        <Button size="sm" onClick={() => exp("tb", "csv")}><Download className="h-3.5 w-3.5" /> Trial balance CSV</Button>
        <Button size="sm" onClick={() => exp("tb", "xls")}><FileSpreadsheet className="h-3.5 w-3.5" /> Trial balance Excel</Button>
      </Card>
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Select aria-label="Account" value={account} onChange={(e) => setAccount(e.target.value)} className="w-64">
            <option value="">All accounts</option>
            {books.accounts.map((a) => <option key={a.no} value={a.no}>{a.no} {a.name}</option>)}
          </Select>
          <Input aria-label="Search" placeholder="Search reference, memo or name" value={q} onChange={(e) => setQ(e.target.value)} className="w-72" />
          <span className="ml-auto text-xs text-gray-500">{books.journal.length} entries · debits {money(all.debit)} · credits {money(all.credit)}</span>
        </div>
        <Table>
          <THead><tr><TH>Date</TH><TH>Entry No.</TH><TH>Source</TH><TH>Account</TH><TH className="text-right">Debit</TH><TH className="text-right">Credit</TH><TH>Posted by</TH><TH /></tr></THead>
          <tbody>
            {entries.map((e) => {
              const href = e.source.href ?? SOURCE_HREF[e.source.kind]?.(e.source.ref);
              return (
                <Fragment key={e.id}>
                  {e.lines.map((l, i) => (
                    <TR key={`${e.id}-${i}`} className={i === 0 ? "border-t-2 border-gray-100" : undefined}>
                      <TD className="whitespace-nowrap">{i === 0 ? e.date : ""}</TD>
                      <TD className="font-semibold">{i === 0 ? e.no : ""}</TD>
                      <TD className="max-w-[260px] whitespace-normal">
                        {i === 0 && (
                          <>
                            {href ? <Link href={href} className="font-semibold text-primary-700 hover:underline">{e.source.ref}</Link> : <span className="font-semibold">{e.source.ref}</span>}
                            <div className="text-xs text-gray-500">{e.memo}{e.party ? ` · ${e.party}` : ""}</div>
                            {e.note && <div className="text-xs text-amber-700">{e.note}</div>}
                            {e.reversedBy && <Badge tone="gray">Reversed: {e.reversedBy.reason}</Badge>}
                            {!isBalanced(e.lines) && <Badge tone="red">Does not balance</Badge>}
                          </>
                        )}
                      </TD>
                      <TD>{l.account} <span className="text-gray-500">{name(l.account)}</span>{l.jobId && <div className="text-xs text-gray-500">{l.jobId}</div>}</TD>
                      <TD className="text-right tabular-nums">{l.debit ? money(l.debit) : ""}</TD>
                      <TD className="text-right tabular-nums">{l.credit ? money(l.credit) : ""}</TD>
                      <TD className="whitespace-nowrap">{i === 0 ? e.postedBy : ""}</TD>
                      <TD className="text-right">
                        {i === 0 && canKeepBooks(user) && !e.reversedBy && !e.reversesId && e.source.kind !== "year_end" && (
                          <Button size="sm" variant="secondary" onClick={() => { setReason(""); setReversing(e); }}><RotateCcw className="h-3.5 w-3.5" /> Reverse</Button>
                        )}
                      </TD>
                    </TR>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </Table>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">Entries can't be deleted. <VersionBadge item="BK-M9" /></p>
      </Card>

      {reversing && (
        <Modal open onOpenChange={(v) => !v && setReversing(undefined)} title={`Reverse entry ${reversing.no}?`} description="A new entry undoes it. The original stays in the journal." size="sm"
          footer={<><Button variant="secondary" onClick={() => setReversing(undefined)}>Cancel</Button><Button variant="primary" disabled={!reason.trim()} onClick={() => { if (act(reverseEntry, reversing.id, reason).ok) { toast.success(`Entry ${reversing.no} reversed`); setReversing(undefined); } }}>Reverse</Button></>}>
          <Field label="Reason" required><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why it is being reversed" /></Field>
        </Modal>
      )}
      {gusto && <GustoImport onClose={() => setGusto(false)} />}
    </>
  );
}

function GustoImport({ onClose }: { onClose: () => void }) {
  const [ref, setRef] = useState(`GUSTO-${now().slice(5, 10).replace("-", "")}`);
  const [date, setDate] = useState(now().slice(0, 10));
  const [wages, setWages] = useState("6100");
  const [taxes, setTaxes] = useState("505");
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title="Import Gusto pay run" description="Simulated: in the live app this reads the pay run from Gusto. Posts wages to 6300, payroll taxes to 6310, from Chase Checking." size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { if (act(importGustoPayRun, { ref, date, wages: Number(wages), taxes: Number(taxes) }).ok) { toast.success("Pay run imported", `${ref} posted as one journal entry.`); onClose(); } }}>Import</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Pay run"><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        <Field label="Pay date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Gross wages"><Input type="number" step="0.01" value={wages} onChange={(e) => setWages(e.target.value)} /></Field>
        <Field label="Employer taxes"><Input type="number" step="0.01" value={taxes} onChange={(e) => setTaxes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
