"use client";
/**
 * Feature 33 — QuickBooks sync (component 33.1), as decided on 2 Oct 2026 (D1).
 * Menu: Accounting › Sync Log and Accounting › Needs Attention.
 *
 * Records are sent when they are saved. A failed send retries after 1, 5, 30
 * and 120 minutes; when those retries run out it moves to Needs Attention.
 * - Sync Log (/accounting/transfer-queue): every send and every change that
 *   came back from QuickBooks. Last 7 days by default, 25 rows a page,
 *   newest first.
 * - Needs Attention (/accounting/needs-attention): failed records with the
 *   reason in plain words, and QuickBooks variance and deletion flags.
 *   Retry, Open record, and Dismiss for the flags.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, ExternalLink, RotateCcw, X } from "lucide-react";
import { act, useCurrentUser, useDb, useStore } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { dateTime } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { now } from "@/features/lib/clock";
import { SYNC_KIND_LABEL, defaultSyncLogRange, filterSyncLog, pageOf } from "@/features/lib/rules/qbo-sync";
import { needsAttentionRows, retryItem, reviewDeletion, reviewVariance, syncLogRows, type AttentionRow } from "@/features/lib/store/actions/finance";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Button, Card, EmptyState, Field, Input, Table, TD, TH, THead, TR, VersionBadge } from "@/features/components/ui";
import { FinanceFrame } from "./finance-frame";
import { SyncNowButton } from "./qbo-sync-parts";

export function QueueScreen() {
  return (
    <FinanceFrame tab="queue">
      <SyncLog />
    </FinanceFrame>
  );
}

export function NeedsAttentionScreen() {
  return (
    <FinanceFrame tab="attention">
      <NeedsAttention />
    </FinanceFrame>
  );
}

const RESULT_TONE = { Accepted: "green", Failed: "red", "Changed in QuickBooks": "amber", "Deleted in QuickBooks": "red", "Created in QuickBooks": "blue" } as const;

function SyncLog() {
  const db = useDb((d) => d);
  useStore((s) => s.clockMode);
  const initial = defaultSyncLogRange(now());
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [page, setPage] = useState(1);
  const all = filterSyncLog(syncLogRows(db), from, to);
  const p = pageOf(all, page);

  return (
    <>
      <PageHeader
        eyebrow={<VersionBadge item="QB-M5" withNew={false} />}
        title="Sync Log"
        subtitle="Every record sent to QuickBooks and every change that came back. Records are sent when they are saved."
        actions={<SyncNowButton />}
      />
      <Card className="p-4" data-tour="transfer-queue">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="From"><Input type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" /></Field>
          <Field label="To"><Input type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" /></Field>
          <span className="ml-auto pb-2 text-xs text-gray-500">{all.length} {all.length === 1 ? "entry" : "entries"}</span>
        </div>
        {all.length === 0 ? <EmptyState icon={<CheckCircle2 />} title="Nothing synced in these dates" body="Widen the dates to see older entries." /> : (
          <>
            <Table>
              <THead><tr><TH>Time</TH><TH>Record type</TH><TH>EM number</TH><TH>QuickBooks ref</TH><TH>Direction</TH><TH>Result</TH></tr></THead>
              <tbody>
                {p.rows.map((r) => (
                  <TR key={r.key}>
                    <TD className="whitespace-nowrap">{dateTime(r.at)}</TD>
                    <TD>{SYNC_KIND_LABEL[r.kind]}</TD>
                    <TD className="font-semibold">{r.emNumber}</TD>
                    <TD className="font-mono text-xs">{r.qboRef ?? "—"}</TD>
                    <TD>
                      {r.direction === "to_qbo"
                        ? <span className="inline-flex items-center gap-1"><ArrowUpRight className="h-3.5 w-3.5 text-gray-500" /> To QuickBooks</span>
                        : <span className="inline-flex items-center gap-1"><ArrowDownLeft className="h-3.5 w-3.5 text-gray-500" /> From QuickBooks</span>}
                    </TD>
                    <TD>
                      <Badge tone={RESULT_TONE[r.result]}>{r.result}</Badge>
                      {r.error && <div className="mt-1 text-xs text-red-700">{r.error}</div>}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            {p.pages > 1 && (
              <div className="mt-3 flex items-center justify-end gap-2 text-xs text-gray-600">
                <Button size="sm" disabled={p.page <= 1} onClick={() => setPage(p.page - 1)}>Previous</Button>
                <span>Page {p.page} of {p.pages}</span>
                <Button size="sm" disabled={p.page >= p.pages} onClick={() => setPage(p.page + 1)}>Next</Button>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}

function NeedsAttention() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const router = useRouter();
  useStore((s) => s.clockMode);
  const rows = needsAttentionRows(db);

  const open = (r: AttentionRow) => {
    if (r.type !== "failure") return router.push(`/accounting?mode=qbo&record=${r.record.id}`);
    if (r.kind === "customer") return router.push(`/contacts/${r.item.recordId}`);
    if (r.kind === "project") return router.push(`/jobs/${r.item.recordId}`);
    router.push(`/accounting?mode=qbo&record=${r.item.recordId}`);
  };
  const retry = (r: Extract<AttentionRow, { type: "failure" }>) => {
    const res = act(retryItem, r.item.id);
    if (res.ok) toast.success(res.value === "waiting" ? "Sent after its parent" : "Accepted by QuickBooks", r.emNumber);
  };
  const dismiss = (r: AttentionRow) => {
    const res = r.type === "variance" ? act(reviewVariance, r.record.id) : r.type === "deletion" ? act(reviewDeletion, r.record.id, "Dismissed from Needs Attention.") : undefined;
    if (res?.ok) toast.success("Dismissed", r.emNumber);
  };

  return (
    <>
      <PageHeader
        title="Needs Attention"
        subtitle="Records QuickBooks kept turning down after the automatic retries, and changes made in QuickBooks to review."
        actions={<SyncNowButton />}
      />
      <Card className="p-4">
        {rows.length === 0 ? <EmptyState icon={<CheckCircle2 />} title="Everything is in sync." /> : (
          <Table>
            <THead><tr><TH>Record</TH><TH>Reason</TH><TH>First failure</TH><TH className="text-right">Attempts</TH><TH /></tr></THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.key}>
                  <TD>
                    <div className="font-semibold">{r.emNumber}</div>
                    <div className="text-xs text-gray-500">{SYNC_KIND_LABEL[r.kind]}{r.type !== "failure" && <> · <Badge tone={r.type === "variance" ? "amber" : "red"}>{r.type === "variance" ? "Changed in QuickBooks" : "Deleted in QuickBooks"}</Badge></>}</div>
                  </TD>
                  <TD className="max-w-[360px] whitespace-normal">{r.reason}</TD>
                  <TD className="whitespace-nowrap">{dateTime(r.firstFailureAt)}</TD>
                  <TD className="text-right tabular-nums">{r.type === "failure" ? r.attempts : "—"}</TD>
                  <TD>
                    <div className="flex flex-wrap justify-end gap-1">
                      {r.type === "failure" && can(user, "finance.exchange") && <Button size="sm" variant="primary" onClick={() => retry(r)}><RotateCcw className="h-3.5 w-3.5" /> Retry</Button>}
                      <Button size="sm" onClick={() => open(r)}><ExternalLink className="h-3.5 w-3.5" /> Open record</Button>
                      {r.type === "variance" && can(user, "finance.reviewVariance") && <Button size="sm" onClick={() => dismiss(r)}><X className="h-3.5 w-3.5" /> Dismiss</Button>}
                      {r.type === "deletion" && can(user, "finance.code") && <Button size="sm" onClick={() => dismiss(r)}><X className="h-3.5 w-3.5" /> Dismiss</Button>}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
