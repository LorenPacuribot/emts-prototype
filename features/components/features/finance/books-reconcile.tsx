"use client";
/**
 * Reconcile the checkbook to the bank statement (30 Sep call, Books). Tick
 * the lines on the statement; the difference is statement balance minus
 * (opening balance + ticked lines). "Finish reconcile" stays off until the
 * difference is $0.00 (features/lib/rules/ledger.ts reconcileDifference).
 */
import { useMemo, useState } from "react";
import type { BankAccount, RegisterEntry } from "@/features/types/finance";
import { act, useDb } from "@/features/lib/store";
import { finishReconcile } from "@/features/lib/store/actions/ledger";
import { clearRegisterEntry } from "@/features/lib/store/actions/books";
import { reconcileDifference } from "@/features/lib/rules/ledger";
import { dateLong, money } from "@/features/lib/format";
import { now } from "@/features/lib/clock";
import { toast } from "@/features/lib/toast";
import { cn } from "@/features/lib/cn";
import { Button, Checkbox, Field, Input, Modal, NewBadge, VersionBadge } from "@/features/components/ui";

const signed = (e: RegisterEntry) => (e.kind === "deposit" ? e.amount : -e.amount);

export function ReconcileModal({ account, onClose }: { account: BankAccount; onClose: () => void }) {
  const db = useDb((d) => d);
  const last = (db.books?.reconciliations ?? []).filter((r) => r.account === account.id).at(-1);
  const opening = last?.statementBalance ?? account.openingBalance;
  const entries = useMemo(
    () => (db.checkRegister ?? []).filter((e) => e.accountId === account.id && e.status !== "void" && (!last || e.date.slice(0, 10) > last.statementDate)).sort((a, b) => a.date.localeCompare(b.date)),
    [db.checkRegister, account.id, last],
  );
  const [statementDate, setStatementDate] = useState(now().slice(0, 10));
  const [statement, setStatement] = useState("");
  const [ticked, setTicked] = useState<string[]>(() => entries.filter((e) => e.status === "cleared").map((e) => e.id));
  const diff = reconcileDifference(Number(statement || 0), opening, entries.filter((e) => ticked.includes(e.id)).map(signed));
  const done = statement !== "" && diff === 0;

  const finish = () => {
    const r = act(finishReconcile, { account: account.id, statementDate, statementBalance: Number(statement), openingBalance: opening, ticked: entries.filter((e) => ticked.includes(e.id)).map(signed) });
    if (!r.ok) return;
    for (const e of entries) if (ticked.includes(e.id) && e.status !== "cleared") act(clearRegisterEntry, e.id, true);
    toast.success("Reconciled", `${account.name} agrees with the statement of ${dateLong(statementDate)}.`);
    onClose();
  };

  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={`Reconcile ${account.name}`} size="lg"
      description={<span className="inline-flex items-center gap-1.5">Tick what is on the bank statement. Finish when the difference is $0.00. <NewBadge /><VersionBadge item="BK-M5" /></span>}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className={cn("text-sm font-bold tabular-nums", done ? "text-green-700" : "text-red-600")}>Difference {money(statement === "" ? NaN : diff)}</span>
          <span className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!done} onClick={finish} title={done ? undefined : "The difference must be $0.00"}>Finish reconcile</Button>
          </span>
        </div>
      }>
      <div className="mb-3 grid grid-cols-3 gap-3">
        <Field label="Statement date"><Input type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} /></Field>
        <Field label="Statement ending balance"><Input type="number" step="0.01" value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="0.00" autoFocus /></Field>
        <div><div className="text-xs font-semibold text-gray-500">Opening balance</div><div className="mt-2 font-semibold tabular-nums">{money(opening)}</div></div>
      </div>
      <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">
        {entries.map((e) => (
          <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <Checkbox checked={ticked.includes(e.id)} onCheckedChange={(v) => setTicked((t) => (v ? [...t, e.id] : t.filter((x) => x !== e.id)))} />
            <span className="w-28 shrink-0 text-gray-500">{dateLong(e.date)}</span>
            <span className="min-w-0 flex-1 truncate">{e.number ? `#${e.number} · ` : ""}{e.payee}</span>
            <span className={cn("tabular-nums", signed(e) < 0 ? "text-gray-900" : "text-green-700")}>{money(signed(e))}</span>
          </li>
        ))}
        {entries.length === 0 && <li className="px-3 py-6 text-center text-sm text-gray-500">Nothing new since the last reconcile.</li>}
      </ul>
    </Modal>
  );
}
