"use client";
/**
 * Estimate Master Books in Settings › Accounting (30 Sep call).
 *  - ChartOfAccountsCard (BK-M2): the preset chart; add, edit and deactivate
 *    accounts. System accounts are locked (rename only). The bookkeeper and
 *    the owner edit it.
 *  - MoveFromQuickBooks (BK-C5, Complete): a four-step wizard. It ends with
 *    "Import complete. QuickBooks has been disconnected."
 */
import { useState } from "react";
import { ArrowRightLeft, CheckCircle2, ListTree, Lock, Plus } from "lucide-react";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { completeMoveFromQbo, saveAccount, setAccountActive } from "@/features/lib/store/actions/ledger";
import { balances, naturalBalance, type AccountType, type LedgerAccount } from "@/features/lib/rules/ledger";
import { money, dateLong } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { cn } from "@/features/lib/cn";
import { Badge, Button, Card, CardLabel, Field, Input, Modal, NewBadge, Select, Switch, Table, TD, TH, THead, TR, VersionBadge } from "@/features/components/ui";
import { useBooksData } from "./books-overview";

const TYPES: AccountType[] = ["Bank", "Current asset", "Current liability", "Credit card", "Equity", "Income", "Cost of jobs", "Expense"];

export function ChartOfAccountsCard() {
  const books = useBooksData();
  const user = useCurrentUser();
  const canEdit = user.role === "bookkeeper" || user.role === "owner";
  const b = balances(books.journal);
  const [editing, setEditing] = useState<LedgerAccount | "new">();
  return (
    <Card className="p-4 xl:col-span-2" data-tour="bk-chart">
      <CardLabel icon={<ListTree />} right={canEdit && <Button size="sm" variant="primary" onClick={() => setEditing("new")}><Plus className="h-3.5 w-3.5" /> Add account</Button>}>
        <span className="inline-flex items-center gap-1.5">Chart of accounts (Books) <VersionBadge item="BK-M2" /><VersionBadge item="BK-C7" withNew={false} /></span>
      </CardLabel>
      <p className="mt-1 text-xs text-gray-500">The bookkeeper keeps the chart. System accounts are locked: they can be renamed, not renumbered, retyped or deactivated.</p>
      <Table className="mt-3">
        <THead><tr><TH>No.</TH><TH>Name</TH><TH>Type</TH><TH className="text-right">Balance</TH><TH>Active</TH>{canEdit && <TH />}</tr></THead>
        <tbody>
          {books.accounts.map((a) => (
            <TR key={a.no} className={cn(!a.active && "opacity-60")}>
              <TD className="font-semibold tabular-nums">{a.no}</TD>
              <TD>{a.name} {a.system && <Lock className="ml-1 inline h-3 w-3 text-gray-400" aria-label="System account" />}</TD>
              <TD className="text-xs text-gray-600">{a.type}</TD>
              <TD className="text-right tabular-nums">{money(naturalBalance(a, b.get(a.no) ?? 0))}</TD>
              <TD>{a.system ? <Badge tone="gray">System</Badge> : <Switch checked={a.active} disabled={!canEdit} onCheckedChange={(v) => act(setAccountActive, a.no, v).ok && toast.success(v ? `${a.name} active` : `${a.name} deactivated`)} />}</TD>
              {canEdit && <TD className="text-right"><Button size="sm" variant="ghost" onClick={() => setEditing(a)}>Edit</Button></TD>}
            </TR>
          ))}
        </tbody>
      </Table>
      {editing && <AccountForm account={editing === "new" ? undefined : editing} onClose={() => setEditing(undefined)} />}
    </Card>
  );
}

function AccountForm({ account, onClose }: { account?: LedgerAccount; onClose: () => void }) {
  const [no, setNo] = useState(account?.no ?? "");
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "Expense");
  const locked = !!account?.system;
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={account ? `Edit ${account.no}` : "Add account"} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { if (act(saveAccount, { no: no.trim(), name: name.trim(), type }, account?.no).ok) { toast.success(account ? "Account updated" : "Account added"); onClose(); } }}>Save</Button></>}>
      <div className="grid grid-cols-3 gap-3">
        <Field label="No."><Input value={no} disabled={locked} onChange={(e) => setNo(e.target.value)} /></Field>
        <div className="col-span-2"><Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field></div>
        <div className="col-span-3"><Field label="Type"><Select value={type} disabled={locked} onChange={(e) => setType(e.target.value as AccountType)}>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select></Field></div>
      </div>
      {locked && <p className="mt-2 text-xs text-gray-500">System account: only the name can change.</p>}
    </Modal>
  );
}

/* ---------- Move from QuickBooks (BK-C5) ---------- */

const STEPS = ["Read QuickBooks", "Map accounts", "Opening balances", "Import"];
const QBO_ACCOUNTS: [string, string][] = [
  ["Checking", "1000"], ["Undeposited Funds", "1050"], ["Accounts Receivable (A/R)", "1200"], ["Accounts Payable (A/P)", "2000"],
  ["Customer Deposits", "2100"], ["Sales Tax Payable", "2200"], ["Chase Card", "2300"], ["Painting Revenue", "4000"], ["Job Materials", "5000"], ["Subcontract Labor", "5100"],
];

export function MoveFromQuickBooks() {
  const db = useDb((d) => d);
  const books = useBooksData();
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [map, setMap] = useState<Record<string, string>>(() => Object.fromEntries(QBO_ACCOUNTS));
  const [asOf, setAsOf] = useState(`${new Date().getFullYear()}-01-01`);
  const allowed = user.role === "owner" || user.role === "bookkeeper";
  const b = balances(books.journal, { to: asOf });
  const moved = books.movedFromQboAt;
  const finish = () => {
    if (act(completeMoveFromQbo).ok) {
      toast.success("Import complete. QuickBooks has been disconnected.");
      setStep(4);
    }
  };
  return (
    <Card className="p-4">
      <CardLabel icon={<ArrowRightLeft />}><span className="inline-flex items-center gap-1.5">Move from QuickBooks <VersionBadge item="BK-C5" /></span></CardLabel>
      {moved ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-green-700"><CheckCircle2 className="h-4 w-4" /> Import complete on {dateLong(moved)}. QuickBooks has been disconnected.</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-gray-500">Bring the chart, customers, open invoices and bills, and opening balances into Estimate Master Books. Simulated in the prototype.</p>
          {allowed && <Button size="sm" variant="primary" onClick={() => { setStep(0); setOpen(true); }}>Start</Button>}
        </div>
      )}
      {open && (
        <Modal open onOpenChange={(v) => !v && setOpen(false)} title="Move from QuickBooks" size="lg"
          description={step < 4 ? `Step ${step + 1} of 4: ${STEPS[step]}` : "Done"}
          footer={step < 4 ? (
            <>
              <Button variant="secondary" onClick={() => (step === 0 ? setOpen(false) : setStep(step - 1))}>{step === 0 ? "Cancel" : "Back"}</Button>
              {step < 3 ? <Button variant="primary" onClick={() => setStep(step + 1)}>Next</Button> : <Button variant="primary" onClick={finish}>Import and disconnect QuickBooks</Button>}
            </>
          ) : <Button variant="primary" onClick={() => setOpen(false)}>Done</Button>}>
          <ol className="mb-4 flex gap-2">
            {STEPS.map((s, i) => <li key={s} className={cn("flex-1 rounded-lg border px-2 py-1.5 text-center text-xs font-bold", i < step || step === 4 ? "border-green-200 bg-green-50 text-green-700" : i === step ? "border-primary-300 bg-primary-50 text-primary-700" : "border-gray-200 text-gray-500")}>{i + 1}. {s}</li>)}
          </ol>
          {step === 0 && (
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {[["Accounts", QBO_ACCOUNTS.length], ["Customers", db.qboCustomers?.length ?? 0], ["Open invoices", db.financeRecords.filter((r) => r.type === "invoice" && r.paymentStatus !== "paid").length], ["Open bills", db.financeRecords.filter((r) => r.type === "bill" && r.paymentStatus !== "paid").length]].map(([k, v]) => (
                <div key={k as string} className="rounded-xl border border-gray-200 p-3"><div className="text-xs text-gray-500">{k}</div><div className="font-heading text-2xl font-extrabold">{v}</div></div>
              ))}
            </div>
          )}
          {step === 1 && (
            <Table>
              <THead><tr><TH>QuickBooks account</TH><TH>Books account</TH></tr></THead>
              <tbody>{QBO_ACCOUNTS.map(([q]) => (
                <TR key={q}><TD>{q}</TD><TD><Select value={map[q]} onChange={(e) => setMap({ ...map, [q]: e.target.value })} className="h-8">{books.accounts.map((a) => <option key={a.no} value={a.no}>{a.no} {a.name}</option>)}</Select></TD></TR>
              ))}</tbody>
            </Table>
          )}
          {step === 2 && (
            <>
              <Field label="Opening balances as of"><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-48" /></Field>
              <Table className="mt-3">
                <THead><tr><TH>Account</TH><TH className="text-right">Opening balance</TH></tr></THead>
                <tbody>{books.accounts.filter((a) => ["Bank", "Current asset", "Current liability", "Credit card"].includes(a.type)).map((a) => (
                  <TR key={a.no}><TD>{a.no} {a.name}</TD><TD className="text-right tabular-nums">{money(naturalBalance(a, b.get(a.no) ?? 0))}</TD></TR>
                ))}</tbody>
              </Table>
              <p className="mt-2 text-xs text-gray-500">The other side of each opening balance is 3050 Opening balance equity.</p>
            </>
          )}
          {step === 3 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
              <li>{QBO_ACCOUNTS.length} accounts mapped; customers linked from Match your contacts.</li>
              <li>Open invoices and bills come across with their balances.</li>
              <li>Estimate Master Books becomes the accounting destination.</li>
              <li><b>QuickBooks will be disconnected.</b> Nothing is deleted in QuickBooks.</li>
            </ul>
          )}
          {step === 4 && <p className="flex items-center gap-2 text-sm font-semibold text-green-700"><CheckCircle2 className="h-5 w-5" /> Import complete. QuickBooks has been disconnected.</p>}
        </Modal>
      )}
    </Card>
  );
}
