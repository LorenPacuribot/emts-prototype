"use client";
/**
 * Feature 33 — Unallocated records and job allocation (component 33.2).
 * Menu: Finance > Unallocated
 *
 * QuickBooks records that arrive without a job or cost code are coded here.
 * Allocation rows always sum to the source amount; the residual cent goes
 * to the largest allocation, then the lowest job number (Rule 5). Vehicle
 * and equipment costs stay overhead.
 */
import { useMemo, useState } from "react";
import { Inbox, Plus, Split, Trash2 } from "lucide-react";
import type { FinanceAllocation, FinanceRecord } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { dateLong, money } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { allocationDifference } from "@/features/lib/rules/finance";
import { proposeSplit, saveAllocation, saveSplit, unallocated } from "@/features/lib/store/actions/finance";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Banner, Button, Card, CardLabel, EmptyState, Field, Input, Modal, Select, Table, TD, TH, THead, TR } from "@/features/components/ui";
import { FinanceFrame } from "./finance-frame";
import { TypeBadge } from "./shared";
import { CustomerReview } from "./customer-review";
import { customersToReview } from "@/features/lib/rules/qbo-contacts";
import { PillTabs, VersionBadge, VersionGate } from "@/features/components/ui";
import { useVersion } from "@/features/lib/prototype-version";

export function UnallocatedScreen() {
  return (
    <FinanceFrame tab="unallocated">
      <Unallocated />
    </FinanceFrame>
  );
}

function Unallocated() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [coding, setCoding] = useState<string>();
  const list = unallocated(db);
  const coded = db.financeRecords.filter((r) => r.allocations?.length).slice(0, 8);
  // QB-C1 (Complete): a Customer Review tab beside the records.
  const [tab, setTab] = useState<"records" | "customers">("records");
  const complete = useVersion((s) => s.version === "complete");
  const toReview = customersToReview(db.qboCustomers ?? []).length;

  return (
    <>
      <PageHeader eyebrow={<VersionBadge item="QB-M6" />} title="Unallocated" subtitle="QuickBooks records with no job or cost code, waiting to be coded here." details="QuickBooks never edits a job or cost code, so allocation conflicts can't happen." />
      <VersionGate item="QB-C1">
        <PillTabs className="mb-4" value={tab} onChange={setTab} options={[{ value: "records", label: "Records", count: list.length }, { value: "customers", label: "Customer Review", count: toReview }]} />
      </VersionGate>
      {complete && tab === "customers" ? <CustomerReview /> : <>
      <Card className="mb-4 p-4" data-tour="unallocated-list">
        <CardLabel icon={<Inbox />}>Waiting to be coded</CardLabel>
        <div className="mt-3">
          {list.length === 0 ? <EmptyState icon={<Inbox />} title="Everything is coded" body="New QuickBooks records without a job appear here." /> : (
            <Table>
              <THead><tr><TH>Type</TH><TH>Reference</TH><TH>Party</TH><TH className="text-right">Amount</TH><TH>Date</TH><TH /></tr></THead>
              <tbody>
                {list.map((r) => (
                  <TR key={r.id}>
                    <TD><TypeBadge type={r.type} /></TD>
                    <TD className="font-semibold">{r.ref}<div className="text-xs font-normal text-gray-500">{r.externalRef}</div></TD>
                    <TD className="max-w-[260px] whitespace-normal">{r.party}</TD>
                    <TD className="text-right tabular-nums">{money(r.amount)}{r.purchaseTax ? <div className="text-xs text-gray-500">+ {money(r.purchaseTax)} tax</div> : null}</TD>
                    <TD>{dateLong(r.date)}</TD>
                    <TD>{can(user, "finance.code") && <Button size="sm" variant="primary" onClick={() => setCoding(r.id)}>Code</Button>}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Card>
      <Card className="p-4">
        <CardLabel>Recent allocations</CardLabel>
        <div className="mt-3 space-y-2">
          {coded.length === 0 && <p className="text-xs italic text-gray-500">No allocations yet.</p>}
          {coded.map((r) => (
            <div key={r.id} className="rounded-lg border border-line px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-2"><strong>{r.ref}</strong> · {money(r.amount)} · {r.costCode}</div>
              <div className="mt-1 flex flex-wrap gap-1">{r.allocations!.map((a, i) => <span key={i} className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-600">{a.overhead ? "Overhead" : a.jobId} {money(a.amount)}</span>)}</div>
              {r.residual && <div className="mt-1 text-xs text-gray-500">Residual {money(r.residual.amount)} went to {r.residual.jobId} ({r.residual.rule === "lowest_job_number" ? "tie — lowest job number" : "largest allocation"}).</div>}
            </div>
          ))}
        </div>
      </Card>
      <AllocationModal record={byId(db.financeRecords, coding)} onClose={() => setCoding(undefined)} />
      </>}
    </>
  );
}

function AllocationModal({ record, onClose }: { record?: FinanceRecord; onClose: () => void }) {
  const db = useDb((d) => d);
  const jobs = db.jobs.filter((j) => j.contractSigned);
  const codes = db.costCodes;
  const [costCode, setCostCode] = useState("SUND");
  const [rows, setRows] = useState<(FinanceAllocation & { key: number })[]>([{ key: 1, jobId: jobs[0]?.id, amount: 0 }]);
  const [err, setErr] = useState<string>();
  const amount = record?.amount ?? 0;
  const diff = allocationDifference(amount, rows);
  const splitJobs = useMemo(() => rows.filter((r) => r.jobId && !r.overhead).map((r) => r.jobId!), [rows]);

  const reset = () => { setRows([{ key: 1, jobId: jobs[0]?.id, amount: 0 }]); setErr(undefined); setCostCode("SUND"); };
  const close = () => { reset(); onClose(); };
  const splitEvenly = () => {
    if (!record || !splitJobs.length) return;
    const p = proposeSplit(db, record.id, splitJobs.map((j) => ({ jobId: j, weight: 1 })));
    if (p) setRows(p.rows.map((r, i) => ({ key: i + 1, jobId: r.jobId, amount: r.amount })));
  };

  return (
    <Modal
      open={!!record}
      onOpenChange={(v) => !v && close()}
      size="lg"
      title={`Code ${record?.ref ?? ""}`}
      description={`${record?.party ?? ""} · ${money(amount)}. Rows must sum exactly to the source amount.`}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          {splitJobs.length > 1 && <Button onClick={() => {
            const r = act(saveSplit, record!.id, costCode, splitJobs.map((j) => ({ jobId: j, weight: 1 })));
            if (r.ok) { toast.success("Split evenly and saved", "Any leftover cent went to the largest share."); close(); } else setErr(r.error);
          }}><Split className="h-4 w-4" /> Save even split</Button>}
          <Button variant="primary" disabled={diff !== 0} onClick={() => {
            const r = act(saveAllocation, record!.id, costCode, rows.map(({ key: _k, ...x }) => x));
            if (r.ok) { toast.success("Allocation saved", "Queued for QuickBooks. The job and cost code stay owned here."); close(); } else setErr(r.error);
          }}>Save allocation</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Cost code" required>
          <Select value={costCode} onChange={(e) => setCostCode(e.target.value)} className="w-72">
            {codes.map((c) => <option key={c.code} value={c.code} disabled={c.status !== "approved"}>{c.code} — {c.label}{c.status !== "approved" ? " (awaiting owner)" : ""}</option>)}
          </Select>
        </Field>
        {costCode === "VEH" && <Banner tone="info">Vehicle and equipment costs stay in overhead. Mark the row as overhead.</Banner>}
        {rows.map((row, i) => (
          <div key={row.key} className="flex flex-wrap items-end gap-2">
            <Field label={i === 0 ? "Job" : ""} className="min-w-[220px] flex-1">
              <Select value={row.overhead ? "__oh" : row.jobId ?? ""} onChange={(e) => setRows(rows.map((r) => (r.key === row.key ? { ...r, overhead: e.target.value === "__oh", jobId: e.target.value === "__oh" ? undefined : e.target.value } : r)))}>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.id} · {j.name}</option>)}
                <option value="__oh">Overhead (not a job)</option>
              </Select>
            </Field>
            <Field label={i === 0 ? "Amount" : ""} className="w-36">
              <Input type="number" value={row.amount || ""} onChange={(e) => setRows(rows.map((r) => (r.key === row.key ? { ...r, amount: Number(e.target.value) } : r)))} />
            </Field>
            {rows.length > 1 && <Button variant="ghost" size="icon" aria-label="Remove row" onClick={() => setRows(rows.filter((r) => r.key !== row.key))}><Trash2 className="h-4 w-4" /></Button>}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setRows([...rows, { key: Math.max(...rows.map((r) => r.key)) + 1, jobId: jobs[rows.length % jobs.length]?.id, amount: 0 }])}><Plus className="h-3.5 w-3.5" /> Add row</Button>
          {splitJobs.length > 1 && <Button size="sm" onClick={splitEvenly}><Split className="h-3.5 w-3.5" /> Preview even split</Button>}
        </div>
        <div className={`rounded-lg px-3 py-2 text-xs font-semibold ${diff === 0 ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
          Running total {money(amount - diff)} of {money(amount)} {diff === 0 ? "— balanced" : `— out of balance by ${money(diff)}. Save is disabled.`}
        </div>
        {err && <p className="text-xs font-medium text-red-600">{err}</p>}
        <p className="text-xs text-gray-500">Accounting source references are kept on every row. No allocation creates a second expense. A leftover cent goes to the largest share, then to the lowest job number.</p>
      </div>
    </Modal>
  );
}
