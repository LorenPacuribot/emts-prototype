"use client";
/**
 * Feature 33 — QuickBooks exchange queue (component 33.1).
 * Menu: Finance > Transfer Queue
 *
 * Queued items can be edited. Sent items are frozen: a correction becomes a
 * new version and the sent or failed version is kept. Two failures escalate
 * to the bookkeeper. Repeat sends never create a second QuickBooks record.
 */
import { useState } from "react";
import { ArrowLeftRight, GitBranch, Pencil, RefreshCw, RotateCcw } from "lucide-react";
import type { ExchangeItem } from "@/features/types";
import { act, useCurrentUser, useDb, useStore } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { dateTime, money } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { now } from "@/features/lib/clock";
import { nextExchangeRun } from "@/features/lib/rules/finance";
import { createCorrectionVersion, editQueuedItem, retryItem, runExchange } from "@/features/lib/store/actions/finance";
import { userName } from "@/features/lib/store/helpers";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PillTabs, Table, TD, TH, THead, TR } from "@/features/components/ui";
import { FinanceFrame } from "./finance-frame";
import { EXCHANGE_STATUS } from "./shared";

type Filter = "all" | ExchangeItem["status"] | "escalated";

export function QueueScreen() {
  return (
    <FinanceFrame tab="queue">
      <Queue />
    </FinanceFrame>
  );
}

function Queue() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  useStore((s) => s.clockMode);
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<{ item: ExchangeItem; mode: "edit" | "correct" }>();
  const pick: Record<Filter, (q: ExchangeItem) => boolean> = {
    all: () => true, queued: (q) => q.status === "queued", sent: (q) => q.status === "sent", accepted: (q) => q.status === "accepted", rejected: (q) => q.status === "rejected",
    escalated: (q) => !!q.escalatedAt && !q.supersededBy,
  };
  const rows = db.exchangeQueue.filter(pick[filter]);
  const n = (f: Filter) => db.exchangeQueue.filter(pick[f]).length;

  return (
    <>
      <PageHeader
        title="Transfer Queue"
        subtitle={`Records moving between Estimate Master and QuickBooks. Next run ${dateTime(nextExchangeRun(new Date(now())).toISOString())}.`}
        actions={can(user, "finance.exchange") && <Button variant="primary" onClick={() => { const r = act(runExchange); if (r.ok) { const v = r.value as { accepted: number; rejected: number }; toast.success("Exchange run complete", `${v.accepted} accepted, ${v.rejected} rejected.`); } }}><RefreshCw className="h-4 w-4" /> Run exchange now</Button>}
      />
      <PillTabs<Filter>
        className="mb-4"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All", count: n("all") }, { value: "queued", label: "Queued", count: n("queued") }, { value: "sent", label: "Sent", count: n("sent") },
          { value: "accepted", label: "Accepted", count: n("accepted") }, { value: "rejected", label: "Rejected", count: n("rejected") }, { value: "escalated", label: "Escalated to bookkeeper", count: n("escalated") },
        ]}
      />
      <Card className="p-4" data-tour="transfer-queue">
        {rows.length === 0 ? <EmptyState icon={<ArrowLeftRight />} title="Nothing in this view" /> : (
          <Table>
            <THead><tr><TH>Item</TH><TH>Record</TH><TH className="text-right">Amount</TH><TH>Job / code</TH><TH>Status</TH><TH>Attempts</TH><TH /></tr></THead>
            <tbody>
              {rows.map((q) => {
                const r = byId(db.financeRecords, q.recordId);
                const s = EXCHANGE_STATUS[q.status];
                const fails = q.attempts.filter((a) => !a.ok);
                return (
                  <TR key={q.id} className={q.supersededBy ? "opacity-60" : ""}>
                    <TD className="font-semibold">{q.id}<div className="text-[11px] font-normal text-slate-400">v{q.version} · key {q.idempotencyKey}</div></TD>
                    <TD className="max-w-[240px] whitespace-normal">{q.payload.description}<div className="text-[11px] text-slate-400">{r?.ref}</div></TD>
                    <TD className="text-right tabular-nums">{money(q.payload.amount)}</TD>
                    <TD>{q.payload.jobId ?? "—"}<div className="text-[11px] text-slate-400">{q.payload.costCode ?? ""}</div></TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={s.tone}>{s.label}</Badge>
                        {q.escalatedAt && <Badge tone="red">Escalated to bookkeeper</Badge>}
                        {q.supersededBy && <Badge tone="gray">Replaced by {q.supersededBy}</Badge>}
                        {q.correctionOf && <Badge tone="purple">Correction of {q.correctionOf}</Badge>}
                      </div>
                      {fails.length > 0 && <div className="mt-1 text-[11px] text-red-700">{fails[fails.length - 1].error}</div>}
                    </TD>
                    <TD className="text-[12px]">{q.attempts.length ? `${q.attempts.length} (${fails.length} failed)` : "—"}<div className="text-[11px] text-slate-400">{q.sentAt ? `sent ${dateTime(q.sentAt)}` : `queued ${dateTime(q.queuedAt)} by ${userName(db, q.queuedBy)}`}</div></TD>
                    <TD>
                      {can(user, "finance.exchange") && !q.supersededBy && (
                        <div className="flex gap-1">
                          {q.status === "queued" && <Button size="sm" onClick={() => setEditing({ item: q, mode: "edit" })}><Pencil className="h-3.5 w-3.5" /> Edit</Button>}
                          {q.status === "rejected" && <Button size="sm" onClick={() => act(retryItem, q.id).ok && toast.success("Re-queued", "It goes on the next run.")}><RotateCcw className="h-3.5 w-3.5" /> Retry</Button>}
                          {q.status !== "queued" && <Button size="sm" onClick={() => setEditing({ item: q, mode: "correct" })}><GitBranch className="h-3.5 w-3.5" /> Correction version</Button>}
                        </div>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      <EditModal target={editing} onClose={() => setEditing(undefined)} />
    </>
  );
}

function EditModal({ target, onClose }: { target?: { item: ExchangeItem; mode: "edit" | "correct" }; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [err, setErr] = useState<string>();
  const item = target?.item;
  return (
    <Modal
      open={!!target}
      onOpenChange={(v) => !v && onClose()}
      size="sm"
      title={target?.mode === "edit" ? `Edit queued ${item?.id}` : `Correction version for ${item?.id}`}
      description={target?.mode === "edit" ? "Not sent yet, so it can still be edited." : "The sent version stays exactly as it was. The correction is a new queued version."}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => {
        const changes = { amount: amount ? Number(amount) : undefined, description: description || undefined };
        const r = target!.mode === "edit" ? act(editQueuedItem, item!.id, changes) : act(createCorrectionVersion, item!.id, changes);
        if (r.ok) { toast.success(target!.mode === "edit" ? "Queued item updated" : "Correction version queued"); setAmount(""); setDescription(""); onClose(); }
        else setErr(r.error);
      }}>{target?.mode === "edit" ? "Save" : "Queue correction"}</Button></>}
    >
      <div className="space-y-3">
        <Field label="Amount" error={err}><Input type="number" value={amount} placeholder={String(item?.payload.amount ?? "")} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Description"><Input value={description} placeholder={item?.payload.description} onChange={(e) => setDescription(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
