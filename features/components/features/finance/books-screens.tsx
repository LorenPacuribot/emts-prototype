"use client";
/**
 * Feature 33 books (patent §33), under Accounting:
 * - Checkbook: register per account with running balance; write a check
 *   (it becomes job cost and goes to QuickBooks), enter a deposit, clear, void.
 * - Bank & Card Feeds: imported lines wait for review — match to a record,
 *   code as an expense or income, or exclude. CSV import or sandbox pull.
 * - Recurring: overheads on a schedule; each due date is posted or skipped.
 * - Alerts: built-in alerts (high spend, overdue AR/AP, margin, recurring due)
 *   plus the contractor's own rules; new alerts reach the bell.
 * - Search: any word across every finance record.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, Bell, BellOff, CheckCircle2, CircleDollarSign, FileUp, Link2, Pause, Pencil, Play, Plus, RefreshCw, Repeat, Search as SearchIcon, Trash2, Undo2, Wallet } from "lucide-react";
import type { AlertMetric, AlertPeriod, FeedTransaction, FinanceAlertRule, Frequency, RecurringExpense, RecurringKind } from "@/features/types/finance";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { dateLong, money } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { AppLink, useParam } from "@/features/lib/navigation";
import {
  clearRegisterEntry, codeFeedTransaction, deleteAlertRule, dismissFinanceNotice, excludeFeedTransaction, importFeedRows, jobMargins, matchFeedTransaction, postOccurrence,
  pullSandboxFeed, recordDeposit, refreshFinanceAlerts, saveAlertRule, saveRecurring, setRecurringActive, skipOccurrence, undoFeedReview, voidRegisterEntry, writeCheck,
} from "@/features/lib/store/actions/books";
import { evaluateAlerts, feedMatches, monthlyEquivalent, parseFeedCsv, registerLines, ruleValue, searchFinance, type SearchKind } from "@/features/lib/rules/books";
import { now } from "@/features/lib/clock";
import { userName } from "@/features/lib/store/helpers";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Banner, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, PillTabs, Select, Stat, StatStrip, Switch, Table, TD, TH, THead, TR } from "@/features/components/ui";
import { FinanceFrame } from "./finance-frame";
import { PaymentsToDepositCard } from "./books-overview";
import { ReconcileModal } from "./books-reconcile";
import { canKeepBooks } from "@/features/lib/store/actions/ledger";
import { VersionBadge } from "@/features/components/ui";

const cents = (n: number) => money(n, { cents: true });
const today = () => now().slice(0, 10);

/** Cost code and job pickers shared by the forms. */
function useCodeOptions() {
  const db = useDb((d) => d);
  return {
    codes: db.costCodes.filter((c) => c.status === "approved" && c.code !== "LAB"),
    jobs: db.jobs.map((j) => ({ id: j.id, label: `${j.id} · ${j.name}` })),
    vendors: db.vendors.filter((v) => v.status === "active"),
  };
}

function CodeSelect({ value, onChange, invalid }: { value?: string; onChange: (v: string) => void; invalid?: boolean }) {
  const { codes } = useCodeOptions();
  return (
    <Select value={value ?? ""} onChange={(e) => onChange(e.target.value)} invalid={invalid}>
      <option value="">Choose a cost code…</option>
      {codes.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.label}</option>)}
    </Select>
  );
}

function JobSelect({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const { jobs } = useCodeOptions();
  return (
    <Select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">No job (overhead)</option>
      {jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
    </Select>
  );
}

/* ================================ Checkbook ================================ */

export function CheckbookScreen() {
  return <FinanceFrame tab="checkbook"><Checkbook /></FinanceFrame>;
}

function Checkbook() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const accounts = (db.bankAccounts ?? []).filter((a) => a.kind !== "credit_card");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [form, setForm] = useState<"check" | "deposit">();
  const [voiding, setVoiding] = useState<string>();
  const [reason, setReason] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const acct = byId(accounts, accountId) ?? accounts[0];
  if (!acct) return <EmptyState icon={<Wallet />} title="No bank accounts yet" body="Add the operating account to start the checkbook register." />;
  const { lines, balance, cleared } = registerLines(acct, db.checkRegister ?? []);
  const canWrite = can(user, "finance.recordPayment");

  return (
    <>
      <PageHeader
        eyebrow={<VersionBadge item="BK-M5" withNew={false} />}
        title="Checkbook"
        subtitle="Every check written and deposit made, with the running balance." details="A check carries its job and cost code into job cost and the QuickBooks queue. Nothing here moves money."
        actions={(canWrite || canKeepBooks(user)) && (
          <div className="flex flex-wrap gap-2">
            {canKeepBooks(user) && <Button onClick={() => setReconciling(true)}><CheckCircle2 className="h-4 w-4" /> Reconcile <VersionBadge item="BK-M5" /></Button>}
            {canWrite && <><Button onClick={() => setForm("deposit")}><Plus className="h-4 w-4" /> Enter deposit</Button>
            <Button variant="primary" onClick={() => setForm("check")}><Pencil className="h-4 w-4" /> Write check</Button></>}
          </div>
        )}
      />
      {accounts.length > 1 && <div className="mb-4"><PillTabs value={acct.id} onChange={setAccountId} options={accounts.map((a) => ({ value: a.id, label: `${a.name} ••${a.last4}` }))} /></div>}
      <PaymentsToDepositCard />
      <StatStrip className="mb-4">
        <Stat label="Register balance" value={cents(balance)} tone={balance < 0 ? "danger" : "default"} />
        <Stat label="Cleared balance" value={cents(cleared)} hint="Lines the bank has cleared" />
        <Stat label="Outstanding" value={cents(balance - cleared)} hint={`${lines.filter((l) => l.entry.status === "written").length} not yet cleared`} />
        <Stat label="Next check" value={`#${acct.nextCheckNumber ?? 1001}`} />
      </StatStrip>
      <Card className="overflow-x-auto p-0">
        <Table>
          <THead><tr><TH>Date</TH><TH>No.</TH><TH>Payee / purpose</TH><TH>Job · code</TH><TH className="text-right">Payment</TH><TH className="text-right">Deposit</TH><TH className="text-right">Balance</TH><TH>Status</TH>{canWrite && <TH />}</tr></THead>
          <tbody>
            <TR><TD className="text-gray-500">{dateLong(acct.openingDate)}</TD><TD /><TD className="text-gray-500">Opening balance</TD><TD /><TD /><TD /><TD className="text-right font-semibold tabular-nums">{cents(acct.openingBalance)}</TD><TD /><TD /></TR>
            {lines.map(({ entry: e, balance: b }) => {
              const rec = byId(db.financeRecords, e.recordId);
              return (
                <TR key={e.id} className={e.status === "void" ? "opacity-60" : ""}>
                  <TD className="whitespace-nowrap">{dateLong(e.date)}</TD>
                  <TD className="tabular-nums">{e.number ?? "—"}</TD>
                  <TD className="min-w-48">
                    <div className={`font-semibold text-ink ${e.status === "void" ? "line-through" : ""}`}>{e.payee}</div>
                    <div className="text-xs text-gray-500">{e.purpose}{e.voidReason && ` · Void: ${e.voidReason}`}</div>
                  </TD>
                  <TD className="text-xs">{e.jobId ?? (e.kind === "check" ? "Overhead" : "")}{e.costCode && <span className="text-gray-500"> · {e.costCode}</span>}</TD>
                  <TD className="text-right tabular-nums">{e.kind === "check" ? cents(e.amount) : ""}</TD>
                  <TD className="text-right tabular-nums">{e.kind === "deposit" ? cents(e.amount) : ""}</TD>
                  <TD className="text-right font-semibold tabular-nums">{cents(b)}</TD>
                  <TD>
                    {e.status === "void" ? <Badge tone="red">Void</Badge> : e.status === "cleared" ? <Badge tone="green">Cleared</Badge> : <Badge tone="gray">Written</Badge>}
                    {rec?.approvalRequest && <Badge tone="amber" className="ml-1">Owner approval</Badge>}
                  </TD>
                  {canWrite && (
                    <TD className="whitespace-nowrap text-right">
                      {e.status !== "void" && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => act(clearRegisterEntry, e.id, e.status !== "cleared")}>{e.status === "cleared" ? "Unclear" : "Mark cleared"}</Button>
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => { setVoiding(e.id); setReason(""); }}><Ban className="h-3.5 w-3.5" /> Void</Button>
                        </>
                      )}
                    </TD>
                  )}
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Card>
      <p className="mt-2 text-xs text-gray-500">Checks above $2,500 are held for the owner&apos;s approval (Accounting › Transfer Queue) before they go to QuickBooks. A voided check stays listed at zero.</p>
      {form && <RegisterForm kind={form} accountId={acct.id} onClose={() => setForm(undefined)} />}
      {reconciling && <ReconcileModal account={acct} onClose={() => setReconciling(false)} />}
      <Modal
        open={!!voiding}
        onOpenChange={(v) => !v && setVoiding(undefined)}
        size="sm"
        title="Void this line?"
        description="It stays in the register at zero for the audit trail. A check's cost is removed from job cost; if QuickBooks already has it, a zero correction is queued."
        footer={<><Button onClick={() => setVoiding(undefined)}>Cancel</Button><Button variant="danger" onClick={() => { if (act(voidRegisterEntry, voiding!, reason).ok) { toast.success("Voided"); setVoiding(undefined); } }}>Void</Button></>}
      >
        <Field label="Reason" required><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Printed with the wrong amount" autoFocus /></Field>
      </Modal>
    </>
  );
}

function RegisterForm({ kind, accountId, onClose }: { kind: "check" | "deposit"; accountId: string; onClose: () => void }) {
  const db = useDb((d) => d);
  const { vendors } = useCodeOptions();
  const acct = byId(db.bankAccounts ?? [], accountId)!;
  const [f, setF] = useState({ payee: "", vendorId: "", amount: "", date: today(), purpose: "", jobId: "", costCode: "", number: String(acct.nextCheckNumber ?? 1001) });
  const [err, setErr] = useState<{ field?: string; message: string }>();
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const submit = () => {
    const r = kind === "check"
      ? act(writeCheck, { accountId, payee: f.payee, vendorId: f.vendorId || undefined, amount: Number(f.amount), date: f.date, purpose: f.purpose, jobId: f.jobId || undefined, costCode: f.costCode || undefined, number: Number(f.number) || undefined })
      : act(recordDeposit, { accountId, payee: f.payee, amount: Number(f.amount), date: f.date, purpose: f.purpose });
    if (!r.ok) return setErr({ field: r.field, message: r.error });
    const v = r.value as { number?: number; held?: boolean } | string;
    toast.success(kind === "check" ? `Check #${typeof v === "object" ? v.number : ""} written` : "Deposit entered", typeof v === "object" && v.held ? "Held for the owner's approval before it goes to QuickBooks." : undefined);
    onClose();
  };
  const e = (k: string) => (err?.field === k ? err.message : undefined);
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={kind === "check" ? "Write check" : "Enter deposit"}
      description={`${acct.name} ••${acct.last4}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>{kind === "check" ? "Write check" : "Enter deposit"}</Button></>}
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          {kind === "check" && <Field label="Check no." error={e("number")}><Input type="number" value={f.number} onChange={(x) => set("number", x.target.value)} /></Field>}
          <Field label="Date" required><Input type="date" value={f.date} onChange={(x) => set("date", x.target.value)} /></Field>
          <Field label="Amount" required error={e("amount")}><Input type="number" min={0} step={0.01} value={f.amount} onChange={(x) => set("amount", x.target.value)} invalid={!!e("amount")} placeholder="0.00" /></Field>
        </div>
        <Field label={kind === "check" ? "Pay to" : "Received from"} required error={e("payee")}>
          <Input list={kind === "check" ? "vendor-names" : undefined} value={f.payee} invalid={!!e("payee")} onChange={(x) => { const v = vendors.find((y) => y.name === x.target.value); setF((s) => ({ ...s, payee: x.target.value, vendorId: v?.id ?? "" })); }} />
          <datalist id="vendor-names">{vendors.map((v) => <option key={v.id} value={v.name} />)}</datalist>
        </Field>
        <Field label={kind === "check" ? "What it's for" : "Memo"} required={kind === "check"} error={e("purpose")}><Input value={f.purpose} invalid={!!e("purpose")} onChange={(x) => set("purpose", x.target.value)} /></Field>
        {kind === "check" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Job"><JobSelect value={f.jobId} onChange={(v) => set("jobId", v)} /></Field>
            <Field label="Cost code" required error={e("costCode")}><CodeSelect value={f.costCode} onChange={(v) => set("costCode", v)} invalid={!!e("costCode")} /></Field>
          </div>
        )}
        {err && !["number", "amount", "payee", "purpose", "costCode"].includes(err.field ?? "") && <Banner tone="danger">{err.message}</Banner>}
      </div>
    </Modal>
  );
}

/* ============================ Bank and card feeds ============================ */

export function FeedsScreen() {
  return <FinanceFrame tab="feeds"><Feeds /></FinanceFrame>;
}

function Feeds() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [tab, setTab] = useState<"unreviewed" | "reviewed">("unreviewed");
  const [importing, setImporting] = useState(false);
  const txns = (db.feedTransactions ?? []).slice().sort((a, b) => b.date.localeCompare(a.date));
  const open = txns.filter((t) => t.status === "unreviewed");
  const done = txns.filter((t) => t.status !== "unreviewed");
  const connected = db.financeSettings.connectors?.bank?.mode === "live";
  const canCode = can(user, "finance.code");

  return (
    <>
      <PageHeader
        eyebrow={<><VersionBadge item="BK-M5" withNew={false} /><VersionBadge item="BK-C1" withNew={false} /></>}
        title="Bank & Card Feeds"
        subtitle="Bank and card transactions waiting to be matched, coded or excluded." details="Each transaction waits here until someone matches, codes or excludes it. Matching to a record already in the books never creates a second expense."
        actions={canCode && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setImporting(true)}><FileUp className="h-4 w-4" /> Import CSV</Button>
            {(db.bankAccounts ?? []).map((a) => (
              <Button key={a.id} onClick={() => { const r = act(pullSandboxFeed, a.id); if (r.ok) { const v = r.value as { added: number; skipped: number }; toast.success(v.added ? `${v.added} new transaction${v.added === 1 ? "" : "s"}` : "Already up to date", `${a.name} (sandbox)`); } }}>
                <RefreshCw className="h-4 w-4" /> Pull {a.kind === "credit_card" ? "card" : "bank"}
              </Button>
            ))}
          </div>
        )}
      />
      <PaymentsToDepositCard />
      {!connected && <Banner tone="info" className="mb-4" title="Sandbox feed">No bank connection is configured, so Pull adds sample lines. CSV import works with any bank&apos;s export.</Banner>}
      <div className="mb-4"><PillTabs kind="view" value={tab} onChange={setTab} options={[{ value: "unreviewed", label: `To review (${open.length})` }, { value: "reviewed", label: `Reviewed (${done.length})` }]} /></div>
      {tab === "unreviewed" ? (
        open.length ? <div className="space-y-3">{open.map((t) => <FeedRow key={t.id} t={t} />)}</div> : <EmptyState icon={<CheckCircle2 />} title="Nothing to review" body="New bank and card lines appear here after an import or pull." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <Table>
            <THead><tr><TH>Date</TH><TH>Description</TH><TH className="text-right">Amount</TH><TH>Outcome</TH><TH>By</TH>{canCode && <TH />}</tr></THead>
            <tbody>
              {done.map((t) => (
                <TR key={t.id}>
                  <TD className="whitespace-nowrap">{dateLong(t.date)}</TD>
                  <TD><div className="font-semibold text-ink">{t.description}</div><div className="text-xs text-gray-500">{t.source === "card" ? "Card" : "Bank"} · {byId(db.bankAccounts ?? [], t.accountId)?.name}</div></TD>
                  <TD className={`text-right tabular-nums ${t.amount < 0 ? "" : "text-green-700"}`}>{cents(t.amount)}</TD>
                  <TD className="text-xs">
                    {t.status === "matched" && <Badge tone="indigo">Matched {byId(db.financeRecords, t.recordId)?.ref}</Badge>}
                    {t.status === "coded" && <Badge tone="green">{t.incomeId ? `Other income ${t.incomeId}` : `Coded ${t.costCode}${t.jobId ? ` · ${t.jobId}` : ""}`}</Badge>}
                    {t.status === "excluded" && <Badge tone="gray">Excluded: {t.note}</Badge>}
                  </TD>
                  <TD className="text-xs text-gray-500">{userName(db, t.reviewedBy)}</TD>
                  {canCode && <TD className="text-right"><Button size="sm" variant="ghost" onClick={() => act(undoFeedReview, t.id).ok && toast.success("Back in the review queue")}><Undo2 className="h-3.5 w-3.5" /> Undo</Button></TD>}
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      {importing && <ImportModal onClose={() => setImporting(false)} />}
    </>
  );
}

function FeedRow({ t }: { t: FeedTransaction }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const { vendors } = useCodeOptions();
  const matches = useMemo(() => feedMatches(db, t), [db, t]);
  const [mode, setMode] = useState<"code" | "exclude">();
  const [f, setF] = useState({ costCode: "", jobId: "", vendorId: vendors.find((v) => t.description.toLowerCase().includes(v.name.toLowerCase().split(" ")[0]!))?.id ?? "", note: "" });
  const canCode = can(user, "finance.code");
  const out = t.amount < 0;
  const submit = () => {
    if (mode === "exclude") return act(excludeFeedTransaction, t.id, f.note).ok && toast.success("Excluded");
    const r = act(codeFeedTransaction, t.id, { costCode: f.costCode || undefined, jobId: f.jobId || undefined, vendorId: f.vendorId || undefined, note: f.note });
    if (r.ok) toast.success(out ? "Expense recorded" : "Income recorded", out ? `${f.costCode}${f.jobId ? ` on ${f.jobId}` : " (overhead)"}` : undefined);
  };
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-base font-bold text-ink">{t.description}</div>
          <div className="text-xs text-gray-500">{dateLong(t.date)} · {t.source === "card" ? "Card" : "Bank"} · {byId(db.bankAccounts ?? [], t.accountId)?.name}{t.origin === "sandbox" && " · sandbox"}</div>
        </div>
        <div className={`font-display text-lg font-bold tabular-nums ${out ? "text-ink" : "text-green-700"}`}>{cents(t.amount)}</div>
      </div>
      {canCode && (
        <>
          {matches.length > 0 && !mode && (
            <div className="mt-3 space-y-2">
              {matches.slice(0, 3).map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-xs">
                  <span><b>Looks like {r.ref}</b> · {r.party} · {cents(r.amount + (r.purchaseTax ?? 0))} · {dateLong(r.date)}{r.jobId && ` · ${r.jobId}`}</span>
                  <Button size="sm" variant="primary" onClick={() => act(matchFeedTransaction, t.id, r.id).ok && toast.success("Matched", `No second expense for ${r.ref}.`)}><Link2 className="h-3.5 w-3.5" /> Match</Button>
                </div>
              ))}
            </div>
          )}
          {mode ? (
            <div className="mt-3 space-y-3 rounded-lg border border-line bg-gray-50 p-3">
              {mode === "code" && out && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Cost code" required><CodeSelect value={f.costCode} onChange={(v) => setF({ ...f, costCode: v })} /></Field>
                  <Field label="Job"><JobSelect value={f.jobId} onChange={(v) => setF({ ...f, jobId: v })} /></Field>
                  <Field label="Vendor">
                    <Select value={f.vendorId} onChange={(e) => setF({ ...f, vendorId: e.target.value })}>
                      <option value="">Use the description</option>
                      {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </Select>
                  </Field>
                </div>
              )}
              {mode === "code" && !out && <p className="text-xs text-gray-600">Money in that isn&apos;t a customer payment (a refund, rebate or interest) is recorded as other income.</p>}
              <Field label={mode === "exclude" ? "Why exclude it" : "Note"} required={mode === "exclude"}><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={mode === "exclude" ? "e.g. Transfer between our own accounts" : "Optional"} /></Field>
              <div className="flex justify-end gap-2">
                <Button size="sm" onClick={() => setMode(undefined)}>Cancel</Button>
                <Button size="sm" variant="primary" onClick={submit}>{mode === "exclude" ? "Exclude" : out ? "Record expense" : "Record income"}</Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setMode("code")}><CircleDollarSign className="h-3.5 w-3.5" /> {out ? "Code as expense" : "Record as income"}</Button>
              <Button size="sm" variant="ghost" onClick={() => setMode("exclude")}>Exclude</Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const db = useDb((d) => d);
  const accounts = db.bankAccounts ?? [];
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => (text ? parseFeedCsv(text) : undefined), [text]);
  const submit = () => {
    if (!parsed?.rows.length) return;
    const r = act(importFeedRows, accountId, parsed.rows);
    if (r.ok) {
      const v = r.value as { added: number; skipped: number };
      toast.success(`${v.added} transaction${v.added === 1 ? "" : "s"} imported`, v.skipped ? `${v.skipped} already imported were skipped.` : undefined);
      onClose();
    }
  };
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title="Import bank or card CSV" description="Columns: date, description and amount (or debit and credit). Lines already imported are skipped." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!parsed?.rows.length} onClick={submit}>Import {parsed?.rows.length ? parsed.rows.length : ""} line{parsed?.rows.length === 1 ? "" : "s"}</Button></>}>
      <div className="space-y-3">
        <Field label="Account"><Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ••{a.last4}</option>)}</Select></Field>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { setName(file.name); setText(await file.text()); } }} />
        <Button onClick={() => fileRef.current?.click()}><FileUp className="h-4 w-4" /> {name || "Choose CSV file"}</Button>
        {parsed && (
          <div className="rounded-lg border border-line p-3 text-xs">
            <div className="font-semibold text-ink">{parsed.rows.length} line{parsed.rows.length === 1 ? "" : "s"} ready</div>
            {parsed.rows.slice(0, 5).map((r, i) => <div key={i} className="flex justify-between gap-2 text-gray-600"><span className="truncate">{r.date} · {r.description}</span><span className="tabular-nums">{cents(r.amount)}</span></div>)}
            {parsed.errors.length > 0 && <div className="mt-2 text-amber-700">{parsed.errors.length} line{parsed.errors.length === 1 ? "" : "s"} skipped: {parsed.errors.slice(0, 3).join("; ")}</div>}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ============================ Recurring expenses ============================ */

export function RecurringScreen() {
  return <FinanceFrame tab="recurring"><Recurring /></FinanceFrame>;
}

const FREQ: Record<Frequency, string> = { weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", annual: "Yearly" };
const KIND: Record<RecurringKind, string> = { subscription: "Subscription", insurance: "Insurance", rent: "Rent", utilities: "Utilities", vehicle: "Vehicle", loan: "Loan", other: "Other" };

function Recurring() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [editing, setEditing] = useState<RecurringExpense | "new">();
  const [skipping, setSkipping] = useState<string>();
  const [reason, setReason] = useState("");
  const recs = db.recurringExpenses ?? [];
  const occ = (db.recurringOccurrences ?? []).filter((o) => o.status === "expected").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const canEdit = can(user, "finance.code");
  useEffect(() => { act(refreshFinanceAlerts); }, []);
  const monthly = recs.filter((r) => r.active).reduce((a, r) => a + monthlyEquivalent(r), 0);
  const t = today();

  return (
    <>
      <PageHeader eyebrow={<VersionBadge item="BK-C8" withNew={false} />} title="Recurring Expenses" subtitle="Insurance, rent, leases and subscriptions on a schedule." details="Each due date is posted once paid, so it counts as an expense exactly once." actions={canEdit && <Button variant="primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add recurring expense</Button>} />
      <StatStrip className="mb-4">
        <Stat label="Monthly overhead" value={cents(monthly)} hint={`${recs.filter((r) => r.active).length} active`} />
        <Stat label="Due in 30 days" value={cents(occ.filter((o) => o.dueDate <= new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)).reduce((a, o) => a + o.amount, 0))} />
        <Stat label="Overdue to post" value={occ.filter((o) => o.dueDate < t).length} tone={occ.some((o) => o.dueDate < t) ? "warn" : "default"} />
      </StatStrip>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] [&>*]:min-w-0">
        <Card className="p-4">
          <div className="mb-2 text-xxs font-bold uppercase tracking-[0.12em] text-gray-500">Upcoming</div>
          {occ.length === 0 ? <EmptyState icon={<Repeat />} title="Nothing due in the next 60 days" body="Payments from active recurring expenses show here as they come due." /> : (
            <div className="divide-y divide-line">
              {occ.map((o) => {
                const r = byId(recs, o.recurringId);
                if (!r) return null;
                const late = o.dueDate < t;
                return (
                  <div key={o.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <div className="w-28 shrink-0 text-xs"><div className={`font-semibold ${late ? "text-amber-700" : "text-ink"}`}>{dateLong(o.dueDate)}</div>{late && <div className="text-xs text-amber-700">Overdue</div>}</div>
                    <div className="min-w-0 flex-1 text-sm"><div className="font-semibold text-ink">{r.name}</div><div className="text-xs text-gray-500">{r.payee} · {r.costCode}</div></div>
                    <div className="tabular-nums font-semibold">{cents(o.amount)}</div>
                    {canEdit && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="primary" onClick={() => act(postOccurrence, o.id).ok && toast.success("Posted", `${r.name} recorded as an expense.`)}>Post</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setSkipping(o.id); setReason(""); }}>Skip</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <div className="space-y-3">
          {recs.length === 0 && <EmptyState icon={<Repeat />} title="No recurring expenses yet" body="Add rent, insurance or subscriptions as recurring expenses, and each payment shows under Upcoming as it comes due." />}
          {recs.map((r) => (
            <Card key={r.id} className={`p-4 ${r.active ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-ink">{r.name}</div>
                  <div className="text-xs text-gray-500">{KIND[r.kind]} · {r.payee} · {r.costCode}</div>
                  <div className="mt-1 text-xs"><b>{cents(r.amount)}</b> {FREQ[r.frequency].toLowerCase()} · remind {r.reminderDays} day{r.reminderDays === 1 ? "" : "s"} before{r.endDate && ` · ends ${dateLong(r.endDate)}`}</div>
                </div>
                {!r.active && <Badge tone="gray">Paused</Badge>}
              </div>
              {canEdit && (
                <div className="mt-2 flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => act(setRecurringActive, r.id, !r.active)}>{r.active ? <><Pause className="h-3.5 w-3.5" /> Pause</> : <><Play className="h-3.5 w-3.5" /> Resume</>}</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
      {editing && <RecurringForm rec={editing === "new" ? undefined : editing} onClose={() => setEditing(undefined)} />}
      <Modal open={!!skipping} onOpenChange={(v) => !v && setSkipping(undefined)} size="sm" title="Skip this payment?" description="Nothing is recorded for this date. The schedule continues." footer={<><Button onClick={() => setSkipping(undefined)}>Cancel</Button><Button variant="primary" onClick={() => { if (act(skipOccurrence, skipping!, reason).ok) { toast.success("Skipped"); setSkipping(undefined); } }}>Skip payment</Button></>}>
        <Field label="Reason" required><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Waived this month" autoFocus /></Field>
      </Modal>
    </>
  );
}

function RecurringForm({ rec, onClose }: { rec?: RecurringExpense; onClose: () => void }) {
  const { vendors } = useCodeOptions();
  const [f, setF] = useState({
    name: rec?.name ?? "", kind: rec?.kind ?? ("insurance" as RecurringKind), payee: rec?.payee ?? "", vendorId: rec?.vendorId ?? "", amount: rec ? String(rec.amount) : "", costCode: rec?.costCode ?? "",
    frequency: rec?.frequency ?? ("monthly" as Frequency), startDate: rec?.startDate.slice(0, 10) ?? today(), endDate: rec?.endDate?.slice(0, 10) ?? "", reminderDays: String(rec?.reminderDays ?? 3),
  });
  const [err, setErr] = useState<{ field?: string; message: string }>();
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const e = (k: string) => (err?.field === k ? err.message : undefined);
  const submit = () => {
    const r = act(saveRecurring, { id: rec?.id, name: f.name, kind: f.kind, payee: f.payee, vendorId: f.vendorId || undefined, amount: Number(f.amount), costCode: f.costCode, frequency: f.frequency, startDate: f.startDate, endDate: f.endDate || undefined, reminderDays: Number(f.reminderDays), active: rec?.active });
    if (!r.ok) return setErr({ field: r.field, message: r.error });
    toast.success(rec ? "Recurring expense updated" : "Recurring expense added");
    onClose();
  };
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={rec ? "Edit recurring expense" : "Add recurring expense"} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Save</Button></>}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required error={e("name")}><Input value={f.name} invalid={!!e("name")} onChange={(x) => set("name", x.target.value)} placeholder="General liability insurance" /></Field>
          <Field label="Type"><Select value={f.kind} onChange={(x) => set("kind", x.target.value)}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        </div>
        <Field label="Paid to" required error={e("payee")}>
          <Input list="rec-vendors" value={f.payee} invalid={!!e("payee")} onChange={(x) => { const v = vendors.find((y) => y.name === x.target.value); setF((s) => ({ ...s, payee: x.target.value, vendorId: v?.id ?? "" })); }} />
          <datalist id="rec-vendors">{vendors.map((v) => <option key={v.id} value={v.name} />)}</datalist>
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Amount" required error={e("amount")}><Input type="number" min={0} step={0.01} value={f.amount} invalid={!!e("amount")} onChange={(x) => set("amount", x.target.value)} /></Field>
          <Field label="How often"><Select value={f.frequency} onChange={(x) => set("frequency", x.target.value)}>{Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Cost code" required error={e("costCode")}><CodeSelect value={f.costCode} onChange={(v) => set("costCode", v)} invalid={!!e("costCode")} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="First due" required error={e("startDate")}><Input type="date" value={f.startDate} onChange={(x) => set("startDate", x.target.value)} /></Field>
          <Field label="Ends" hint="Optional" error={e("endDate")}><Input type="date" value={f.endDate} onChange={(x) => set("endDate", x.target.value)} /></Field>
          <Field label="Remind days before"><Input type="number" min={0} value={f.reminderDays} onChange={(x) => set("reminderDays", x.target.value)} /></Field>
        </div>
        {err && !["name", "payee", "amount", "costCode", "startDate", "endDate"].includes(err.field ?? "") && <Banner tone="danger">{err.message}</Banner>}
      </div>
    </Modal>
  );
}

/* ================================== Alerts ================================== */

export function AlertsScreen() {
  return <FinanceFrame tab="alerts"><Alerts /></FinanceFrame>;
}

const METRIC: Record<AlertMetric, string> = {
  total_expenses: "Total expenses", category_spend: "Spend in a cost code", vendor_spend: "Spend with a vendor", revenue: "Revenue invoiced", gross_margin: "Gross margin (%)",
  ar_overdue: "Overdue receivables", ap_overdue: "Overdue bills", other_income: "Other income",
};
const PERIOD: Record<AlertPeriod, string> = { week: "week", month: "month", quarter: "quarter", year: "year" };

function Alerts() {
  const db = useDb((d) => d);
  const [editing, setEditing] = useState<FinanceAlertRule | "new">();
  const [deleting, setDeleting] = useState<string>();
  useEffect(() => { act(refreshFinanceAlerts); }, []);
  const current = useMemo(() => evaluateAlerts(db, now(), jobMargins(db)), [db]);
  const liveKeys = new Set(current.map((a) => a.key));
  const notices = (db.financeNotices ?? []).filter((n) => !n.dismissedAt);
  const active = notices.filter((n) => liveKeys.has(n.key));
  const cleared = notices.filter((n) => !liveKeys.has(n.key)).slice(0, 10);
  const tone = { critical: "red", warn: "amber", info: "blue" } as const;

  return (
    <>
      <PageHeader title="Financial Alerts" subtitle="Unusual spending, overdue invoices and bills, slipping margins and payments coming due." details="Recurring payments coming due and your own rules show here too. New alerts also reach the bell for the owner, office manager and bookkeeper." actions={<Button variant="primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New alert rule</Button>} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] [&>*]:min-w-0">
        <div className="space-y-3">
          {active.length === 0 && <EmptyState icon={<BellOff />} title="No alerts right now" body="Everything is inside its limits." />}
          {active.map((n) => (
            <Card key={n.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><Bell className="h-4 w-4 text-gray-500" /><span className="font-semibold text-ink">{n.title}</span><Badge tone={tone[n.severity]}>{n.severity === "critical" ? "Critical" : n.severity === "warn" ? "Warning" : "Heads up"}</Badge></div>
                  <div className="mt-1 text-xs text-gray-600">{n.detail}</div>
                  <div className="mt-1 text-xs text-gray-500">Raised {dateLong(n.raisedAt)}</div>
                </div>
                <div className="flex gap-1">
                  {n.href && <AppLink href={n.href} className="inline-flex h-8 items-center rounded-lg border border-line bg-white px-3 text-xs font-semibold text-ink hover:bg-gray-50">Open</AppLink>}
                  <Button size="sm" variant="ghost" onClick={() => act(dismissFinanceNotice, n.id)}>Dismiss</Button>
                </div>
              </div>
            </Card>
          ))}
          {cleared.length > 0 && (
            <details className="rounded-xl border border-line bg-white p-3 text-xs">
              <summary className="cursor-pointer font-semibold text-gray-600">Resolved ({cleared.length})</summary>
              <ul className="mt-2 space-y-1 text-gray-500">{cleared.map((n) => <li key={n.id}>{dateLong(n.raisedAt)} · {n.title}</li>)}</ul>
            </details>
          )}
        </div>
        <Card className="p-4">
          <div className="mb-2 text-xxs font-bold uppercase tracking-[0.12em] text-gray-500">Your alert rules</div>
          {(db.financeAlertRules ?? []).length === 0 && <p className="text-xs text-gray-500">No rules yet. Built-in alerts still run.</p>}
          <div className="divide-y divide-line">
            {(db.financeAlertRules ?? []).map((r) => {
              const v = ruleValue(db, r, now());
              const pct = r.metric === "gross_margin";
              return (
                <div key={r.id} className={`py-2.5 ${r.active ? "" : "opacity-60"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-sm"><div className="font-semibold text-ink">{r.name}</div><div className="text-xs text-gray-500">{METRIC[r.metric]}{r.costCode ? ` (${r.costCode})` : ""}{r.vendorId ? ` (${byId(db.vendors, r.vendorId)?.name})` : ""} {r.comparator} {pct ? `${r.threshold}%` : cents(r.threshold)} per {PERIOD[r.period]}</div><div className="text-xs text-gray-600">Now: {pct ? `${v.toFixed(1)}%` : cents(v)}</div></div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" aria-label={`Delete ${r.name}`} onClick={() => setDeleting(r.id)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 border-t border-line pt-3 text-xs text-gray-500">Built in: a cost code more than {Math.round((db.financeSettings.alertDefaults?.highExpenseFactor ?? 0.5) * 100)}% above its {db.financeSettings.alertDefaults?.rollingMonths ?? 3}-month average, invoices past {db.financeSettings.arTermsDays ?? 30}-day terms, bills past their due date, a job margin {db.financeSettings.alertDefaults?.marginDropPts ?? 5} points below estimate, and recurring payments inside their reminder window.</p>
        </Card>
      </div>
      {editing && <RuleForm rule={editing === "new" ? undefined : editing} onClose={() => setEditing(undefined)} />}
      <ConfirmDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(undefined)} title="Delete this alert rule?" body="It stops checking. Alerts it already raised stay in the history." confirmLabel="Delete rule" onConfirm={() => { if (deleting) act(deleteAlertRule, deleting); setDeleting(undefined); }} />
    </>
  );
}

function RuleForm({ rule, onClose }: { rule?: FinanceAlertRule; onClose: () => void }) {
  const { vendors } = useCodeOptions();
  const [f, setF] = useState({ name: rule?.name ?? "", metric: rule?.metric ?? ("category_spend" as AlertMetric), comparator: rule?.comparator ?? ("above" as "above" | "below"), threshold: rule ? String(rule.threshold) : "", period: rule?.period ?? ("month" as AlertPeriod), costCode: rule?.costCode ?? "", vendorId: rule?.vendorId ?? "", active: rule?.active ?? true });
  const [err, setErr] = useState<{ field?: string; message: string }>();
  const e = (k: string) => (err?.field === k ? err.message : undefined);
  const submit = () => {
    const r = act(saveAlertRule, { id: rule?.id, name: f.name, metric: f.metric, comparator: f.comparator, threshold: Number(f.threshold), period: f.period, costCode: f.metric === "category_spend" ? f.costCode : undefined, vendorId: f.metric === "vendor_spend" ? f.vendorId : undefined, active: f.active });
    if (!r.ok) return setErr({ field: r.field, message: r.error });
    act(refreshFinanceAlerts);
    toast.success(rule ? "Alert rule updated" : "Alert rule created");
    onClose();
  };
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={rule ? "Edit alert rule" : "New alert rule"} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Save rule</Button></>}>
      <div className="space-y-3">
        <Field label="Name" required error={e("name")}><Input value={f.name} invalid={!!e("name")} onChange={(x) => setF({ ...f, name: x.target.value })} placeholder="Paint spend over $5,000 this month" /></Field>
        <Field label="Watch"><Select value={f.metric} onChange={(x) => setF({ ...f, metric: x.target.value as AlertMetric })}>{Object.entries(METRIC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        {f.metric === "category_spend" && <Field label="Cost code" required error={e("costCode")}><CodeSelect value={f.costCode} onChange={(v) => setF({ ...f, costCode: v })} invalid={!!e("costCode")} /></Field>}
        {f.metric === "vendor_spend" && <Field label="Vendor" required error={e("vendorId")}><Select value={f.vendorId} onChange={(x) => setF({ ...f, vendorId: x.target.value })}><option value="">Choose…</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="When it is"><Select value={f.comparator} onChange={(x) => setF({ ...f, comparator: x.target.value as "above" | "below" })}><option value="above">Above</option><option value="below">Below</option></Select></Field>
          <Field label={f.metric === "gross_margin" ? "Limit (%)" : "Limit ($)"} required error={e("threshold")}><Input type="number" value={f.threshold} invalid={!!e("threshold")} onChange={(x) => setF({ ...f, threshold: x.target.value })} /></Field>
          <Field label="Each"><Select value={f.period} onChange={(x) => setF({ ...f, period: x.target.value as AlertPeriod })}>{Object.entries(PERIOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        </div>
        <Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} label="Rule is on" />
        {err && !["name", "threshold", "costCode", "vendorId"].includes(err.field ?? "") && <Banner tone="danger">{err.message}</Banner>}
      </div>
    </Modal>
  );
}

/* ================================== Search ================================== */

export function FinanceSearchScreen() {
  return <FinanceFrame tab="search"><FinanceSearch /></FinanceFrame>;
}

const KIND_LABEL: Record<SearchKind, string> = { record: "Record", check: "Register", feed: "Bank/card line", recurring: "Recurring", income: "Other income", vendor: "Vendor", claim: "Reimbursement" };

function FinanceSearch() {
  const db = useDb((d) => d);
  const initial = useParam("q") ?? "";
  const [q, setQ] = useState(initial);
  const [kind, setKind] = useState<SearchKind | "all">("all");
  useEffect(() => setQ(initial), [initial]);
  const hits = useMemo(() => searchFinance(db, q), [db, q]);
  const shown = kind === "all" ? hits : hits.filter((h) => h.kind === kind);
  const kinds = [...new Set(hits.map((h) => h.kind))];
  return (
    <>
      <PageHeader title="Search the Books" subtitle="Search the books by any field. Every word must match." details="Fields searched: reference, payee, vendor, amount, job, cost code, memo, date and status." />
      <div className="relative mb-3">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. sherwin JOB-2026-1, 450, check 1188, fuel" className="pl-9" aria-label="Search the books" />
      </div>
      {q.trim() && kinds.length > 1 && (
        <div className="mb-3"><PillTabs value={kind} onChange={setKind} options={[{ value: "all" as const, label: `All (${hits.length})` }, ...kinds.map((k) => ({ value: k, label: `${KIND_LABEL[k]} (${hits.filter((h) => h.kind === k).length})` }))]} /></div>
      )}
      {!q.trim() ? (
        <EmptyState icon={<SearchIcon />} title="Type to search every finance record" body="Invoices, bills, receipts, checks, bank and card lines, recurring expenses, other income, vendors and reimbursements." />
      ) : shown.length === 0 ? (
        <EmptyState icon={<SearchIcon />} title="No matches" body="Try fewer words, or part of a reference or amount." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <Table>
            <THead><tr><TH>Type</TH><TH>Record</TH><TH>Date</TH><TH className="text-right">Amount</TH><TH>Matched on</TH></tr></THead>
            <tbody>
              {shown.map((h) => (
                <TR key={`${h.kind}-${h.id}`}>
                  <TD><Badge tone="gray">{KIND_LABEL[h.kind]}</Badge></TD>
                  <TD className="min-w-56"><AppLink href={h.href} className="font-semibold text-brand hover:underline">{h.title}</AppLink><div className="text-xs text-gray-500">{h.detail}</div></TD>
                  <TD className="whitespace-nowrap text-xs">{h.date ? dateLong(h.date) : "—"}</TD>
                  <TD className="text-right tabular-nums">{h.amount !== undefined ? cents(h.amount) : "—"}</TD>
                  <TD className="text-xs text-gray-500">{h.matched.join(", ")}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      {shown.length >= 200 && <p className="mt-2 text-xs text-gray-500">Showing the first 200. Add a word to narrow it down.</p>}
    </>
  );
}
