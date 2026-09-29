"use client";
/**
 * Feature 22 — Mileage (component 22.4).
 * Menu: Workforce > Mileage
 *
 * Evidence-backed claims at the current IRS rate. The rate is maintained
 * annually by the bookkeeper and read at the claim date — never typed on the
 * claim and never hard-coded.
 */
import { useState } from "react";
import { Car, CheckCircle2, Plus, XCircle } from "lucide-react";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { money } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { now } from "@/features/lib/clock";
import { mileageRateOn } from "@/features/lib/rules/payroll";
import { approveMileage, employeeFor, rejectMileage, reviewMileage, setMileageRate, submitMileage } from "@/features/lib/store/actions/workforce";
import { userName } from "@/features/lib/store/helpers";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Banner, Button, Card, CardLabel, EmptyState, Field, Input, Modal, PillTabs, Select, Table, TD, TH, THead, TR, Textarea } from "@/features/components/ui";
import { WorkforceFrame } from "./workforce-frame";
import { dayLabel } from "./shared";

const STATUS = {
  submitted: { label: "Awaiting crew lead", tone: "amber" },
  crew_approved: { label: "Awaiting office review", tone: "blue" },
  reviewed: { label: "Approved", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
} as const;

export function MileageScreen() {
  return (
    <WorkforceFrame tab="mileage">
      <Mileage />
    </WorkforceFrame>
  );
}

function Mileage() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const me = employeeFor(db, user);
  const [creating, setCreating] = useState(false);
  const [rejecting, setRejecting] = useState<string>();
  const [reason, setReason] = useState("");
  const staffView = can(user, "time.viewCrew");
  const claims = db.mileageClaims.filter((c) => staffView || c.employeeId === me?.id);
  const year = new Date(now()).getFullYear();
  const rate = mileageRateOn(now(), db.mileageRates);

  return (
    <>
      <PageHeader
        title="Mileage"
        subtitle="Travel reimbursed at the current IRS rate, with odometer readings or job addresses as evidence. The crew lead approves; the office reviews."
        actions={(me || can(user, "time.clock")) && <Button variant="primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New claim</Button>}
      />
      {!db.payrollSettings.reimbursementMappingConfirmed && (
        <Banner tone="warn" className="mb-4" title="Launch gate: Gusto reimbursement mapping">The bookkeeper confirms the Gusto non-taxable reimbursement mapping in writing before go-live. Approved claims export on that mapping.</Banner>
      )}
      <div className="grid gap-4 xl:grid-cols-[1fr_320px] [&>*]:min-w-0">
        <Card className="p-4">
          <CardLabel icon={<Car />}>Claims</CardLabel>
          <div className="mt-3">
            {claims.length === 0 ? <EmptyState icon={<Car />} title="No mileage claims" body="Claims appear here once submitted." /> : (
              <Table>
                <THead><tr><TH>Claim</TH><TH>Employee</TH><TH>Date</TH><TH>Evidence</TH><TH className="text-right">Miles</TH><TH className="text-right">Amount</TH><TH>Status</TH><TH /></tr></THead>
                <tbody>
                  {claims.map((c) => {
                    const s = STATUS[c.status];
                    return (
                      <TR key={c.id}>
                        <TD className="font-semibold">{c.id}<div className="max-w-[180px] truncate text-xs font-normal text-gray-500" title={c.purpose}>{c.purpose}</div></TD>
                        <TD>{byId(db.employees, c.employeeId)?.name}</TD>
                        <TD>{dayLabel(c.date.slice(0, 10), false)}</TD>
                        <TD className="text-xs">{c.evidence.kind === "odometer" ? `Odometer ${c.evidence.start.toLocaleString()} → ${c.evidence.end.toLocaleString()}` : `${c.evidence.from} → ${c.evidence.to}`}</TD>
                        <TD className="text-right tabular-nums">{c.miles}</TD>
                        <TD className="text-right tabular-nums">{c.amount !== undefined ? <>{money(c.amount)}<div className="text-xs text-gray-500">{c.centsPerMile}¢/mi</div></> : "—"}</TD>
                        <TD><Badge tone={s.tone}>{s.label}</Badge>{c.rejectedReason && <div className="mt-0.5 text-xs text-red-700">{c.rejectedReason}</div>}{c.reviewedBy && <div className="mt-0.5 text-xs text-gray-500">Reviewed by {userName(db, c.reviewedBy)}</div>}</TD>
                        <TD>
                          <div className="flex gap-1">
                            {c.status === "submitted" && can(user, "mileage.approve") && <Button size="sm" onClick={() => act(approveMileage, c.id).ok && toast.success("Claim approved", "Sent to the office for review.")}><CheckCircle2 className="h-3.5 w-3.5" /> Approve</Button>}
                            {c.status === "crew_approved" && can(user, "mileage.review") && <Button size="sm" variant="primary" onClick={() => act(reviewMileage, c.id).ok && toast.success("Claim reviewed", "Amount set from the IRS rate on the claim date.")}>Review</Button>}
                            {(c.status === "submitted" || c.status === "crew_approved") && (can(user, "mileage.approve") || can(user, "mileage.review")) && <Button aria-label="Reject" title="Reject" size="sm" variant="ghost" onClick={() => { setRejecting(c.id); setReason(""); }}><XCircle className="h-3.5 w-3.5" /></Button>}
                          </div>
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </div>
        </Card>
        <RateCard year={year} current={rate?.centsPerMile} setBy={rate ? userName(db, rate.setBy) : undefined} />
      </div>

      <ClaimModal open={creating} onClose={() => setCreating(false)} />
      <Modal
        open={!!rejecting}
        onOpenChange={(v) => !v && setRejecting(undefined)}
        size="sm"
        title="Reject claim"
        footer={<><Button onClick={() => setRejecting(undefined)}>Cancel</Button><Button variant="primary" onClick={() => { if (act(rejectMileage, rejecting!, reason).ok) { toast.success("Claim rejected"); setRejecting(undefined); } }}>Reject</Button></>}
      >
        <Field label="Reason" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Modal>
    </>
  );
}

function RateCard({ year, current, setBy }: { year: number; current?: number; setBy?: string }) {
  const user = useCurrentUser();
  const [value, setValue] = useState("");
  const [y, setY] = useState(String(year));
  return (
    <Card className="p-4">
      <CardLabel>IRS mileage rate</CardLabel>
      {current !== undefined ? (
        <div className="mt-3"><div className="font-display text-2xl font-bold text-ink">{current}¢ <span className="text-sm font-medium text-gray-500">per mile, {year}</span></div><div className="text-xs text-gray-500">Set by {setBy}</div></div>
      ) : (
        <Banner tone="danger" className="mt-3" title="Current IRS mileage rate not set. The bookkeeper must set it.">Claims can be entered but not approved until the rate is set.</Banner>
      )}
      {can(user, "mileage.rate") ? (
        <div className="mt-4 space-y-2">
          <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0">
            <Field label="Year"><Input type="number" value={y} onChange={(e) => setY(e.target.value)} /></Field>
            <Field label="Cents per mile"><Input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="70" /></Field>
          </div>
          <Button size="sm" onClick={() => act(setMileageRate, Number(y), Number(value)).ok && toast.success("IRS rate saved")}>Save rate</Button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-gray-500">Maintained annually by the bookkeeper. No rate is hard-coded.</p>
      )}
    </Card>
  );
}

function ClaimModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const me = employeeFor(db, user);
  const crew = can(user, "time.clock") ? db.employees.filter((e) => !e.offboardedAt && e.type !== "subcontractor") : me ? [me] : [];
  const [employeeId, setEmployeeId] = useState(me?.id ?? "");
  const [date, setDate] = useState(new Date(now()).toISOString().slice(0, 10));
  const [purpose, setPurpose] = useState("");
  const [jobId, setJobId] = useState("");
  const [kind, setKind] = useState<"odometer" | "addresses">("odometer");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [miles, setMiles] = useState("");
  const [err, setErr] = useState<{ msg: string; field?: string }>();
  const submit = () => {
    const r = act(submitMileage, {
      employeeId, date: new Date(`${date}T12:00:00`).toISOString(), purpose, jobId,
      evidence: kind === "odometer" ? { kind, start: start === "" ? undefined : Number(start), end: end === "" ? undefined : Number(end) } : { kind, from, to },
      miles: miles ? Number(miles) : undefined,
    });
    if (r.ok) { toast.success("Claim submitted", "Your crew lead approves it next."); onClose(); setPurpose(""); setStart(""); setEnd(""); setFrom(""); setTo(""); setMiles(""); }
    else setErr({ msg: r.error, field: r.field });
  };
  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title="New mileage claim" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Submit claim</Button></>}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Employee" required error={err?.field === "employee" ? err.msg : undefined}>
            <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">— Select —</option>
              {crew.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </Field>
          <Field label="Date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Purpose" required className="sm:col-span-2" error={err?.field === "purpose" ? err.msg : undefined}><Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Paint pickup for JOB-2026-1" /></Field>
          <Field label="Job (optional)">
            <Select value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">— None —</option>
              {db.jobs.map((j) => <option key={j.id} value={j.id}>{j.id} · {j.name}</option>)}
            </Select>
          </Field>
        </div>
        <PillTabs value={kind} onChange={setKind} options={[{ value: "odometer", label: "Odometer" }, { value: "addresses", label: "Job addresses" }]} />
        {kind === "odometer" ? (
          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <Field label="Start reading" required><Input type="number" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="End reading" required><Input type="number" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3 [&>*]:min-w-0">
            <Field label="From" required><Input value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To" required><Input value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <Field label="Miles" required error={err?.field === "miles" ? err.msg : undefined}><Input type="number" value={miles} onChange={(e) => setMiles(e.target.value)} /></Field>
          </div>
        )}
        {err?.field === "evidence" && <p className="text-xs font-medium text-red-600">{err.msg}</p>}
        <p className="text-xs text-gray-500">The rate is read from the bookkeeper's IRS rate record on approval. It is never entered on the claim.</p>
      </div>
    </Modal>
  );
}
