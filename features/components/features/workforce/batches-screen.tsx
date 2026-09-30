"use client";
/**
 * Feature 22 — Export Batches and provider results (component 22.3).
 * Menu: Workforce > Export Batches
 *
 * The boundary with Gusto, where double payment is prevented: creating a
 * batch locks its entries, a batch is never reimported, rejected lines go
 * into a new batch on their own, and paid periods only take adjustments.
 */
import { useState } from "react";
import { Download, FilePlus2, FileSpreadsheet, Lock, MapPinOff, Plus, Undo2 } from "lucide-react";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { dateTime } from "@/features/lib/format";
import { downloadCsv } from "@/features/lib/export";
import { toast } from "@/features/lib/toast";
import { useParam } from "@/features/lib/navigation";
import { addDaysToDay, exportsTime, hm, hours, paydayFor } from "@/features/lib/rules/payroll";
import {
  createAdjustment, createBatch, createCorrectionBatch, entrySegments, entryTotals, markBatchPaid, markCsvDownloaded, purgeGpsData, recordResult, weekEntries,
} from "@/features/lib/store/actions/workforce";
import { userName } from "@/features/lib/store/helpers";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Banner, Button, Card, CardLabel, ConfirmDialog, Drawer, EmptyState, Field, Input, Modal, RowMenu, Select, Table, TD, TH, THead, TR, Textarea } from "@/features/components/ui";
import { WorkforceFrame } from "./workforce-frame";
import { WeekSelect, dayLabel, thisWeek } from "./shared";

const RESULT = { unconfirmed: { label: "Unconfirmed", tone: "amber" }, accepted: { label: "Accepted", tone: "green" }, rejected: { label: "Rejected", tone: "red" } } as const;

export function BatchesScreen() {
  return (
    <WorkforceFrame tab="batches">
      <Batches />
    </WorkforceFrame>
  );
}

function Batches() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [week, setWeek] = useState(useParam("week") ?? addDaysToDay(thisWeek(), -7));
  const [openId, setOpenId] = useState<string>();
  const [confirmCreate, setConfirmCreate] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  const entries = weekEntries(db, week).filter((e) => entrySegments(db, e).length);
  const hourly = entries.filter((e) => { const emp = byId(db.employees, e.employeeId); return emp && exportsTime(emp); });
  const eligible = hourly.filter((e) => e.state === "approved" && !e.batchId && e.dispute?.status !== "open");
  const outstanding = hourly.filter((e) => e.state === "open" || e.state === "submitted" || (e.state === "approved" && e.dispute?.status === "open"));
  const batches = db.payrollBatches;

  return (
    <>
      <PageHeader
        title="Export Batches"
        subtitle="Approved hourly time, sent to Gusto." details="Sent in the bookkeeper-approved CSV mapping. Gusto runs payroll; results come back per employee."
        actions={
          <>
            <WeekSelect value={week} onChange={setWeek} />
            {can(user, "payroll.adjust") && <Button onClick={() => setAdjusting(true)}><Undo2 className="h-4 w-4" /> Paid-period adjustment</Button>}
            {can(user, "payroll.gps") && (
              <Button onClick={() => { const r = act(purgeGpsData); if (r.ok) toast.success(`GPS deleted from ${r.value} punch${r.value === 1 ? "" : "es"}`, "Location older than 90 days. Time records kept."); }}>
                <MapPinOff className="h-4 w-4" /> GPS retention
              </Button>
            )}
            {can(user, "payroll.batch") && (
              <Button variant="primary" disabled={!eligible.length} onClick={() => setConfirmCreate(true)}><FilePlus2 className="h-4 w-4" /> Create Export Batch ({eligible.length})</Button>
            )}
          </>
        }
      />

      {!db.payrollSettings.gustoMappingConfirmed && <Banner tone="warn" className="mb-4" title="Gusto CSV mapping not confirmed">The bookkeeper supplies the mapping before build.</Banner>}

      <Card className="mb-4 p-4">
        <CardLabel icon={<FileSpreadsheet />}>Week of {dayLabel(week, false)} · payday {dayLabel(paydayFor(week))}</CardLabel>
        <div className="mt-3 grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
          <div>
            <div className="text-xs font-semibold text-gray-700">Ready for a batch</div>
            <p className="text-xs text-gray-500">{eligible.length} approved hourly day{eligible.length === 1 ? "" : "s"}, not yet in a batch.</p>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-700">Excluded — stays outstanding</div>
            {outstanding.length === 0 ? <p className="text-xs italic text-gray-500">Nothing outstanding.</p> : (
              <ul className="text-xs text-gray-600">
                {outstanding.map((e) => (
                  <li key={e.id}>{byId(db.employees, e.employeeId)?.name} · {dayLabel(e.workDate)} · {hm(entryTotals(db, e).roundedMinutes)} — {e.dispute?.status === "open" ? "disputed" : e.state === "open" ? "not submitted" : "awaiting approval"}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>

      <div className="space-y-3" data-tour="batch-list">
        {batches.length === 0 && <EmptyState icon={<FileSpreadsheet />} title="No export batches yet" body="Approve a week's time, then create its batch." />}
        {batches.map((b) => {
          const counts = { accepted: b.lines.filter((l) => l.result === "accepted").length, rejected: b.lines.filter((l) => l.result === "rejected").length, unconfirmed: b.lines.filter((l) => l.result === "unconfirmed").length };
          return (
            <Card key={b.id} className="cursor-pointer p-4 transition-shadow hover:shadow-md" onClick={() => setOpenId(b.id)}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Lock className="h-4 w-4 text-indigo-600" />
                    <span className="font-display text-base font-bold text-ink">{b.id}</span>
                    {b.correctionOf && <Badge tone="purple">Correction of {b.correctionOf}</Badge>}
                    {b.paidAt ? <Badge tone="green">Paid {dayLabel(b.paidAt.slice(0, 10), false)}</Badge> : <Badge tone="blue">Awaiting Gusto</Badge>}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">Week of {dayLabel(b.weekStart, false)} · created {dateTime(b.createdAt)} by {userName(db, b.createdBy)} · {b.lines.length} employee{b.lines.length === 1 ? "" : "s"}</div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {counts.accepted > 0 && <Badge tone="green">{counts.accepted} accepted</Badge>}
                  {counts.rejected > 0 && <Badge tone="red">{counts.rejected} rejected</Badge>}
                  {counts.unconfirmed > 0 && <Badge tone="amber">{counts.unconfirmed} unconfirmed</Badge>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {db.payrollAdjustments.length > 0 && (
        <Card className="mt-4 p-4">
          <CardLabel icon={<Undo2 />}>Paid-period adjustments</CardLabel>
          <p className="mt-1 text-xs text-gray-500">New records on the next paycheck. The paid entries are never edited.</p>
          <Table className="mt-3">
            <THead><tr><TH>Adjustment</TH><TH>Employee</TH><TH>Paid week</TH><TH className="text-right">Hours</TH><TH>Payday</TH><TH>Reason</TH></tr></THead>
            <tbody>
              {db.payrollAdjustments.map((a) => (
                <TR key={a.id}>
                  <TD className="font-semibold">{a.id}</TD>
                  <TD>{byId(db.employees, a.employeeId)?.name}</TD>
                  <TD>{dayLabel(a.weekStart, false)}</TD>
                  <TD className="text-right tabular-nums">{a.minutes > 0 ? "+" : ""}{hm(a.minutes)}</TD>
                  <TD>{dayLabel(a.payday)}</TD>
                  <TD className="max-w-xs whitespace-normal text-xs">{a.reason}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <BatchDrawer batchId={openId} onClose={() => setOpenId(undefined)} />
      <ConfirmDialog
        open={confirmCreate}
        onOpenChange={setConfirmCreate}
        tone="primary"
        title={`Create the batch for ${dayLabel(week, false)}?`}
        body={`${eligible.length} approved day${eligible.length === 1 ? "" : "s"} will lock as soon as the batch exists. After that only adjustments are possible. ${outstanding.length} unapproved day${outstanding.length === 1 ? " stays" : "s stay"} out and remain outstanding.`}
        confirmLabel="Create and lock"
        onConfirm={() => { const r = act(createBatch, week); if (r.ok) { toast.success(`Batch ${r.value} created`, "Entries locked. Download the CSV for Gusto."); setOpenId(r.value as string); } }}
      />
      <AdjustmentModal open={adjusting} onClose={() => setAdjusting(false)} />
    </>
  );
}

function BatchDrawer({ batchId, onClose }: { batchId?: string; onClose: () => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const b = byId(db.payrollBatches, batchId);
  const [rejecting, setRejecting] = useState<string>();
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string>();
  if (!b) return <Drawer open={false} onOpenChange={() => onClose()} title="">{null}</Drawer>;
  const canResult = can(user, "payroll.results") && !b.paidAt;

  const csv = () => {
    downloadCsv(`gusto-${b.id}-${b.weekStart}.csv`, [
      ["batch_id", "employee_id", "employee_name", "week_start", "week_end", "regular_hours", "overtime_hours"],
      ...b.lines.map((l) => {
        const emp = byId(db.employees, l.employeeId);
        return [b.id, emp?.gustoId, emp?.name, b.weekStart, addDaysToDay(b.weekStart, 6), hours(l.regularMinutes), hours(l.overtimeMinutes)];
      }),
    ]);
    act(markCsvDownloaded, b.id);
    toast.success("CSV downloaded", "Downloading is not evidence Gusto accepted it. Results stay Unconfirmed until checked.");
  };

  return (
    <Drawer
      open={!!b}
      onOpenChange={(v) => !v && onClose()}
      title={<span className="flex items-center gap-2"><Lock className="h-4 w-4 text-indigo-600" /> {b.id}</span>}
      subtitle={`Week of ${dayLabel(b.weekStart, false)} · entries locked · ${b.correctionOf ? `corrects rejected lines from ${b.correctionOf}` : "original batch"}`}
      footer={
        <>
          <RowMenu label="Batch actions" items={[{ label: "Reimport batch", icon: <FileSpreadsheet />, disabled: true, reason: "A batch is never reimported. Its identity and results are kept.", onSelect: () => undefined }]} />
          <Button onClick={csv}><Download className="h-4 w-4" /> Download CSV</Button>
          {can(user, "payroll.batch") && b.lines.some((l) => l.result === "rejected" && !l.correctedInBatchId) && (
            <Button onClick={() => { const r = act(createCorrectionBatch, b.id); if (r.ok) toast.success(`Correction batch ${r.value} created`, "Only the rejected lines. Compare totals before payroll."); }}>
              <Plus className="h-4 w-4" /> Create correction batch
            </Button>
          )}
          {can(user, "payroll.results") && !b.paidAt && <Button variant="primary" onClick={() => act(markBatchPaid, b.id).ok && toast.success("Recorded as paid", "Paid entries are final.")}>Record payroll paid</Button>}
        </>
      }
    >
      {b.paidAt ? (
        <Banner tone="success" title={`Paid — recorded ${dateTime(b.paidAt)} by ${userName(db, b.paidBy)}`}>Corrections from now on are next-paycheck adjustments.</Banner>
      ) : (
        <Banner tone="warn" title="Check Gusto and confirm">Record each employee's result from Gusto. {b.csvDownloadedAt ? `CSV downloaded ${dateTime(b.csvDownloadedAt)} — that alone is not evidence of acceptance or payment.` : "The CSV hasn't been downloaded yet."}</Banner>
      )}
      <Table>
        <THead><tr><TH>Employee</TH><TH>Gusto ID</TH><TH className="text-right">Regular</TH><TH className="text-right">Overtime</TH><TH>Result</TH>{canResult && <TH />}</tr></THead>
        <tbody>
          {b.lines.map((l) => {
            const emp = byId(db.employees, l.employeeId);
            const r = RESULT[l.result];
            return (
              <TR key={l.employeeId}>
                <TD className="font-semibold">{emp?.name}<div className="text-xs font-normal text-gray-500">{l.entryIds.length} days</div></TD>
                <TD className="text-xs">{emp?.gustoId ?? "—"}</TD>
                <TD className="text-right tabular-nums">{hm(l.regularMinutes)}</TD>
                <TD className="text-right tabular-nums">{hm(l.overtimeMinutes)}</TD>
                <TD>
                  <Badge tone={r.tone}>{r.label}</Badge>
                  {l.resultNote && <div className="mt-1 max-w-[220px] whitespace-normal text-xs text-red-700">{l.resultNote}</div>}
                  {l.correctedInBatchId && <div className="mt-1 text-xs text-gray-500">Corrected in {l.correctedInBatchId}</div>}
                </TD>
                {canResult && (
                  <TD>
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => act(recordResult, b.id, l.employeeId, "accepted").ok && toast.success("Accepted recorded")}>Accepted</Button>
                      <Button size="sm" onClick={() => { setRejecting(l.employeeId); setNote(""); setErr(undefined); }}>Rejected</Button>
                    </div>
                  </TD>
                )}
              </TR>
            );
          })}
        </tbody>
      </Table>
      <p className="text-xs text-gray-500">Totals: {hm(b.lines.reduce((a, l) => a + l.regularMinutes, 0))} regular, {hm(b.lines.reduce((a, l) => a + l.overtimeMinutes, 0))} overtime.</p>
      <Modal
        open={!!rejecting}
        onOpenChange={(v) => !v && setRejecting(undefined)}
        size="sm"
        title="Record a rejected line"
        footer={<><Button onClick={() => setRejecting(undefined)}>Cancel</Button><Button variant="primary" onClick={() => { const r = act(recordResult, b.id, rejecting!, "rejected", note); if (r.ok) { toast.success("Rejection recorded", "Create a correction batch with only this line."); setRejecting(undefined); } else setErr(r.error); }}>Record</Button></>}
      >
        <Field label="Gusto's reason" required error={err}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} invalid={!!err} />
        </Field>
      </Modal>
    </Drawer>
  );
}

function AdjustmentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDb((d) => d);
  const weeks = [...new Set(db.payrollBatches.filter((b) => b.paidAt).map((b) => b.weekStart))];
  const [employeeId, setEmployeeId] = useState("");
  const [week, setWeek] = useState("");
  const [minutes, setMinutes] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<{ msg: string; field?: string }>();
  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Paid-period adjustment"
      description="A new record paid on the next paycheck. The paid entry itself is never edited."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => {
            const r = act(createAdjustment, employeeId, week, Number(minutes), reason);
            if (r.ok) { toast.success(`Adjustment ${r.value} created`); onClose(); setMinutes(""); setReason(""); }
            else setErr({ msg: r.error, field: r.field });
          }}>Create adjustment</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="Employee" required error={err?.field === "employee" ? err.msg : undefined}>
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">— Select —</option>
            {db.employees.filter((e) => e.type === "hourly").map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
        <Field label="Paid week" required>
          <Select value={week} onChange={(e) => setWeek(e.target.value)}>
            <option value="">— Select —</option>
            {weeks.map((w) => <option key={w} value={w}>Week of {dayLabel(w, false)}</option>)}
          </Select>
        </Field>
        <Field label="Minutes (+ or −)" required error={err?.field === "minutes" ? err.msg : undefined}>
          <Input type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="30" />
        </Field>
        <Field label="Reason" required className="sm:col-span-2" error={err?.field === "reason" ? err.msg : !err?.field ? err?.msg : undefined}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
