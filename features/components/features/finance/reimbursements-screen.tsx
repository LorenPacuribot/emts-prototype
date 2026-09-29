"use client";
/**
 * Feature 33 — Reimbursements (component 33.4).
 * Menu: Finance > Reimbursements
 *
 * Every claim needs a receipt photograph. Crew claims: the crew lead
 * approves, the office reviews and matches the original expense so the job
 * isn't charged twice. Office claims need the owner at any value; the owner
 * reviews the office manager's own claim.
 */
import { useState } from "react";
import { Camera, CheckCircle2, Plus, ReceiptText, XCircle } from "lucide-react";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { dateLong, money } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { now } from "@/features/lib/clock";
import { crewApproveClaim, officeReviewClaim, ownerApproveClaim, reimbursementPath, rejectClaim, submitReimbursement } from "@/features/lib/store/actions/finance";
import { employeeFor } from "@/features/lib/store/actions/workforce";
import { userName } from "@/features/lib/store/helpers";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Banner, Button, Card, EmptyState, Field, Input, Modal, Select, Textarea } from "@/features/components/ui";
import { FinanceFrame } from "./finance-frame";

const STEP_LABEL = { crew_lead: "Crew lead approval", office: "Office review", owner: "Owner approval" } as const;

export function ReimbursementsScreen() {
  return (
    <FinanceFrame tab="reimbursements">
      <Reimbursements />
    </FinanceFrame>
  );
}

function Reimbursements() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [creating, setCreating] = useState(false);
  const [rejecting, setRejecting] = useState<string>();
  const [reason, setReason] = useState("");
  const claims = db.reimbursements;

  return (
    <>
      <PageHeader
        title="Reimbursements"
        subtitle="Staff paid back for job expenses, with a receipt and without double-charging the job."
        actions={can(user, "reimburse.submit") && <Button variant="primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Submit claim</Button>}
      />
      <div className="space-y-3" data-tour="reimbursement-list">
        {claims.length === 0 && <EmptyState icon={<ReceiptText />} title="No claims" />}
        {claims.map((c) => {
          const emp = byId(db.employees, c.employeeId);
          const steps = reimbursementPath(db, c.employeeId);
          const done = { crew_lead: !!c.crewApprovedAt, office: !!c.officeReviewedAt, owner: !!c.ownerApprovedAt };
          const due = steps.find((s) => !done[s]);
          const closed = c.status === "rejected" || c.status === "owner_approved";
          const dup = c.duplicateOfRecordId ? byId(db.financeRecords, c.duplicateOfRecordId) : undefined;
          return (
            <Card key={c.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-base font-bold text-ink">{c.id} · {money(c.amount)}</span>
                    {c.status === "rejected" ? <Badge tone="red">Rejected</Badge> : c.status === "owner_approved" ? <Badge tone="green">Approved{c.expenseRef ? ` · ${c.expenseRef}` : ""}</Badge> : <Badge tone="amber">Waiting: {due ? STEP_LABEL[due] : "—"}</Badge>}
                    {dup && <Badge tone="amber">Duplicate suspected — matches {dup.ref}</Badge>}
                  </div>
                  <div className="mt-1 text-xs text-gray-600">{emp?.name} · {c.merchant} · {c.description} · {dateLong(c.date)}</div>
                  <div className="mt-1 text-xs text-gray-500">{c.jobId ?? "No job"} · {c.costCode} · <Camera className="inline h-3 w-3" /> {c.receiptPhoto}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    {steps.map((s) => (
                      <span key={s} className={`rounded-full border px-2 py-0.5 ${done[s] ? "border-green-200 bg-green-50 text-green-700" : "border-line text-gray-500"}`}>
                        {done[s] ? "✓ " : ""}{STEP_LABEL[s]}{done[s] ? ` — ${userName(db, s === "crew_lead" ? c.crewApprovedBy : s === "office" ? c.officeReviewedBy : c.ownerApprovedBy)}` : ""}
                      </span>
                    ))}
                  </div>
                  {c.rejectedReason && <p className="mt-1 text-xs text-red-700">{c.rejectedReason}</p>}
                </div>
                {!closed && (
                  <div className="flex gap-2">
                    {due === "crew_lead" && can(user, "reimburse.crewApprove") && <Button size="sm" onClick={() => act(crewApproveClaim, c.id).ok && toast.success("Approved", "Sent for office review.")}><CheckCircle2 className="h-3.5 w-3.5" /> Approve</Button>}
                    {due === "office" && can(user, "reimburse.officeReview") && <Button size="sm" variant="primary" onClick={() => { const r = act(officeReviewClaim, c.id); if (r.ok) toast.success(r.value ? "Reviewed — duplicate suspected" : "Reviewed", r.value ? "The original expense is already on the job. Reject if it's the same purchase." : "Original expense matched."); }}>Review</Button>}
                    {due === "owner" && can(user, "reimburse.ownerApprove") && <Button size="sm" variant="primary" onClick={() => act(ownerApproveClaim, c.id).ok && toast.success("Approved by the owner")}>Owner approve</Button>}
                    {["crew_lead", "office_manager", "owner"].includes(user.role) && <Button aria-label="Reject" title="Reject" size="sm" variant="ghost" onClick={() => { setRejecting(c.id); setReason(""); }}><XCircle className="h-3.5 w-3.5" /></Button>}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      <ClaimModal open={creating} onClose={() => setCreating(false)} />
      <Modal open={!!rejecting} onOpenChange={(v) => !v && setRejecting(undefined)} size="sm" title="Reject claim"
        footer={<><Button onClick={() => setRejecting(undefined)}>Cancel</Button><Button variant="primary" onClick={() => { if (act(rejectClaim, rejecting!, reason).ok) { toast.success("Claim rejected"); setRejecting(undefined); } }}>Reject</Button></>}>
        <Field label="Reason" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Modal>
    </>
  );
}

function ClaimModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const me = employeeFor(db, user);
  const options = user.role === "crew_lead" ? db.employees.filter((e) => e.crewId && !e.offboardedAt) : me ? [me] : [];
  const [employeeId, setEmployeeId] = useState(me?.id ?? "");
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [description, setDescription] = useState("");
  const [jobId, setJobId] = useState("");
  const [costCode, setCostCode] = useState("SUND");
  const [photo, setPhoto] = useState<string>();
  const [err, setErr] = useState<{ msg: string; field?: string }>();
  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Submit a reimbursement"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => {
        const r = act(submitReimbursement, { employeeId, amount: Number(amount), date: now(), merchant, description, jobId, costCode, receiptPhoto: photo });
        if (r.ok) { toast.success("Claim submitted"); onClose(); setAmount(""); setMerchant(""); setDescription(""); setPhoto(undefined); } else setErr({ msg: r.error, field: r.field });
      }}>Submit</Button></>}
    >
      {!options.length && <Banner tone="info" className="mb-3">Your login isn't linked to an employee record, so there's no one to reimburse.</Banner>}
      <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="Who is being reimbursed" required error={err?.field === "employee" ? err.msg : undefined}>
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">— Select —</option>
            {options.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
        <Field label="Amount" required error={err?.field === "amount" ? err.msg : undefined}><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Merchant" required error={err?.field === "merchant" ? err.msg : undefined}><Input value={merchant} onChange={(e) => setMerchant(e.target.value)} /></Field>
        <Field label="What for"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Job"><Select value={jobId} onChange={(e) => setJobId(e.target.value)}><option value="">— None —</option>{db.jobs.map((j) => <option key={j.id} value={j.id}>{j.id} · {j.name}</option>)}</Select></Field>
        <Field label="Cost code" error={err?.field === "costCode" ? err.msg : undefined}>
          <Select value={costCode} onChange={(e) => setCostCode(e.target.value)}>{db.costCodes.filter((c) => c.status === "approved").map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}</Select>
        </Field>
        <Field label="Receipt photograph" required className="sm:col-span-2" error={err?.field === "receipt" ? err.msg : undefined} hint="The photo is counted, not stored, in the prototype. Text extraction is optional and always human-reviewed.">
          <Input type="file" accept="image/*,application/pdf" onChange={(e) => setPhoto(e.target.files?.[0]?.name)} />
        </Field>
      </div>
    </Modal>
  );
}
