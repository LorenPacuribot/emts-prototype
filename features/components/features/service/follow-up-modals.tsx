"use client";
/** Modal forms for follow-ups (feature 29). Every one validates inline and toasts on success. */
import { useEffect, useState } from "react";
import { Mail, UserX } from "lucide-react";
import type { ContactAttempt, FollowUp } from "@/features/types";
import { act, useDb } from "@/features/lib/store";
import {
  assignFollowUp, closeFollowUp, linkCompletedRepaint, recordCall, recordOptOut, recordReconsent, reopenFollowUp, requalifyFollowUp, sendReminderEmail,
  type CloseDraft,
} from "@/features/lib/store/actions/service";
import { REOPEN_REASONS, signedValue } from "@/features/lib/rules/alerts";
import { byId, currentOwner, propertyAddress } from "@/features/lib/selectors";
import { CALL_OUTCOME } from "@/features/lib/status";
import { date, money } from "@/features/lib/format";
import { now } from "@/features/lib/clock";
import { can } from "@/features/lib/permissions";
import { useCurrentUser } from "@/features/lib/store";
import { toast } from "@/features/lib/toast";
import { Banner, Button, Checkbox, Field, Input, Modal, Select, Textarea } from "@/features/components/ui";
import { toInputDate } from "./shared";

type R = { ok: true; value?: unknown } | { ok: false; error: string; field?: string };

function useForm() {
  const [err, setErr] = useState<{ field?: string; message: string }>();
  return {
    err,
    reset: () => setErr(undefined),
    of: (f: string) => (err?.field === f ? err.message : undefined),
    general: err && !err.field ? err.message : undefined,
    check: (r: R) => {
      if (!r.ok) setErr({ field: r.field, message: r.error });
      return r.ok;
    },
  };
}

export function AssignModal({ fu, onClose }: { fu?: FollowUp; onClose: () => void }) {
  const db = useDb((d) => d);
  const [userId, setUserId] = useState("");
  const f = useForm();
  const property = byId(db.properties, fu?.propertyId);
  const estimators = db.users.filter((u) => u.role === "senior_estimator" || u.role === "estimator");
  useEffect(() => {
    const areaMatch = estimators.find((u) => u.area === property?.city && !u.outOfOffice);
    setUserId(areaMatch?.id ?? "");
    f.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fu?.id]);
  const submit = () => {
    if (!fu) return;
    if (f.check(act(assignFollowUp, fu.id, userId))) {
      toast.success(fu.assigneeId ? "Reassigned" : "Assigned", `${fu.id} → ${byId(db.users, userId)?.name}. Assigned clock started; the alert clock is unchanged.`);
      onClose();
    }
  };
  return (
    <Modal open={!!fu} onOpenChange={(v) => !v && onClose()} size="sm" title={fu?.assigneeId ? `Reassign · ${fu.id}` : `Assign · ${fu?.id ?? ""}`}
      description={`${property?.address}, ${property?.city}. Assign the area estimator.`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>{fu?.assigneeId ? "Reassign" : "Assign"}</Button></>}>
      <div className="space-y-3">
        <Field label="Estimator" required error={f.of("assignee")}>
          <Select value={userId} onChange={(e) => setUserId(e.target.value)} invalid={!!f.of("assignee")}>
            <option value="">Choose an estimator…</option>
            {estimators.map((u) => (
              <option key={u.id} value={u.id} disabled={u.outOfOffice}>
                {u.name} · {u.area ?? "—"} area{u.outOfOffice ? " · out of office" : ""}{u.id === fu?.assigneeId ? " · current" : ""}
              </option>
            ))}
          </Select>
        </Field>
        {fu?.assigneeId && <p className="text-[12px] text-slate-500">Reassignment restarts the 7-day assigned clock. It never restarts the 14-day alert clock.</p>}
        {f.general && <Banner tone="danger">{f.general}</Banner>}
      </div>
    </Modal>
  );
}

const OUTCOMES: NonNullable<ContactAttempt["outcome"]>[] = ["reached", "wants_quote", "declined", "opt_out", "no_answer", "left_message", "wrong_number"];

export function CallModal({ fu, attemptN, onClose }: { fu?: FollowUp; attemptN: number; onClose: () => void }) {
  const db = useDb((d) => d);
  const owner = fu ? currentOwner(db, byId(db.properties, fu.propertyId)!) : undefined;
  const [contactName, setContactName] = useState("");
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<ContactAttempt["outcome"] | "">("");
  const [next, setNext] = useState("");
  const f = useForm();
  useEffect(() => {
    setContactName(owner?.name ?? "");
    setNote("");
    setOutcome("");
    setNext("");
    f.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fu?.id]);
  const submit = () => {
    if (!fu) return;
    const res = act(recordCall, fu.id, { contactName, note, outcome: outcome ?? "", nextActionDate: next });
    if (f.check(res)) {
      const v = res.ok ? res.value : undefined;
      if (v?.recycled) toast.success("Attempt recorded — recycled", `Three attempts with no response. Recycles for ${date(v.recycled)}. Nothing is sent automatically.`);
      else toast.success(v?.conversation ? "Conversation recorded" : "Unsuccessful attempt recorded", v?.conversation ? `Attempt ${v.attempt} of 3.` : `Attempt ${v?.attempt} of 3. Not counted as a conversation.`);
      onClose();
    }
  };
  const meta = outcome ? CALL_OUTCOME[outcome] : undefined;
  return (
    <Modal open={!!fu} onOpenChange={(v) => !v && onClose()} title={`Record call · attempt ${attemptN} of 3`}
      description={`${fu?.id} · ${owner?.name ?? ""} ${owner?.phone ?? ""}. Calls are made by a person; recordings are not captured.`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Save call record</Button></>}>
      <div className="space-y-4">
        <Field label="Who was contacted (or who you tried to reach)" required error={f.of("contactName")}>
          <Input value={contactName} onChange={(e) => setContactName(e.target.value)} invalid={!!f.of("contactName")} />
        </Field>
        <Field label="Outcome" required error={f.of("outcome")}>
          <Select value={outcome ?? ""} onChange={(e) => setOutcome(e.target.value as ContactAttempt["outcome"])} invalid={!!f.of("outcome")}>
            <option value="">Choose the outcome…</option>
            <optgroup label="Spoke with the customer">
              {OUTCOMES.filter((o) => CALL_OUTCOME[o].conversation).map((o) => <option key={o} value={o}>{CALL_OUTCOME[o].label}</option>)}
            </optgroup>
            <optgroup label="Unsuccessful (not a conversation)">
              {OUTCOMES.filter((o) => !CALL_OUTCOME[o].conversation).map((o) => <option key={o} value={o}>{CALL_OUTCOME[o].label}</option>)}
            </optgroup>
          </Select>
        </Field>
        {meta && (
          <p className="text-[12px] text-slate-500">
            {meta.conversation ? "Counts as a conversation with the customer." : "Counts as an attempt only — never as a conversation."}
            {outcome === "wants_quote" && " A quote request enters the quote queue."}
            {outcome === "declined" && " The current opportunity closes as Lost (not a permanent opt-out)."}
            {outcome === "opt_out" && " The property is opted out on every channel until the office records re-consent."}
          </p>
        )}
        <Field label="Note" required error={f.of("note")}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} invalid={!!f.of("note")} placeholder="e.g. Wants the price before spring; call back after 5 p.m." />
        </Field>
        <Field label="Next action date" required error={f.of("nextActionDate")}>
          <Input type="date" value={next} min={toInputDate(now())} onChange={(e) => setNext(e.target.value)} invalid={!!f.of("nextActionDate")} />
        </Field>
        {f.general && <Banner tone="danger">{f.general}</Banner>}
      </div>
    </Modal>
  );
}

/** Rule 4: the email is only ever sent by a person pressing Send. */
export function EmailModal({ fu, onClose }: { fu?: FollowUp; onClose: () => void }) {
  const db = useDb((d) => d);
  const property = byId(db.properties, fu?.propertyId);
  const owner = property ? currentOwner(db, property) : undefined;
  const [next, setNext] = useState("");
  const f = useForm();
  useEffect(() => {
    setNext("");
    f.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fu?.id]);
  const submit = () => {
    if (!fu) return;
    const res = act(sendReminderEmail, fu.id, next);
    if (f.check(res)) {
      toast.success("Reminder email sent", `Sent to ${owner?.email} by you. Logged as an attempt.`);
      onClose();
    }
  };
  return (
    <Modal open={!!fu} onOpenChange={(v) => !v && onClose()} size="lg" title="Send reminder email"
      description="A person must press Send. The email offers a Request a quote link — there is no self-booking calendar."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}><Mail className="h-4 w-4" /> Send email</Button></>}>
      <div className="space-y-4">
        <div className="rounded-xl border border-line bg-slate-50/60 p-4 text-[12.5px] leading-relaxed text-slate-700">
          <div className="mb-2 text-[11px] text-slate-500">To: {owner?.email ?? "—"} · Subject: Time for a fresh coat at {property?.address}?</div>
          <p>Hi {owner?.name?.split(" ")[0]},</p>
          <p className="mt-2">Our records show some of the paint we applied at {propertyAddress(property)} is coming up to its usual repaint time. This is an estimate from our experience, not a warranty.</p>
          <p className="mt-2">If you would like a price, use the link below and we will be in touch.</p>
          <p className="mt-3"><span className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-white">Request a quote</span></p>
          <p className="mt-3 text-slate-500">Reply STOP or tell us if you would rather not hear from us about future work.</p>
        </div>
        <Field label="Next action date" required error={f.of("nextActionDate")}>
          <Input type="date" value={next} min={toInputDate(now())} onChange={(e) => setNext(e.target.value)} invalid={!!f.of("nextActionDate")} />
        </Field>
        {f.general && <Banner tone="danger">{f.general}</Banner>}
      </div>
    </Modal>
  );
}

export function CloseModal({ fu, initial, onClose }: { fu?: FollowUp; initial?: CloseDraft["status"]; onClose: () => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [status, setStatus] = useState<CloseDraft["status"]>("");
  const [reason, setReason] = useState("");
  const [sold, setSold] = useState(false);
  const [phone, setPhone] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const f = useForm();
  useEffect(() => {
    setStatus(initial ?? "");
    setReason("");
    setSold(false);
    setPhone(false);
    setNewName("");
    setNewPhone("");
    f.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fu?.id, initial]);
  const est = byId(db.estimates, fu?.estimateId);
  const sv = signedValue(db, fu?.estimateId);
  const submit = () => {
    if (!fu) return;
    const res = act(closeFollowUp, fu.id, { status, reason, propertySold: sold, confirmedByPhone: phone, newOwnerName: newName, newOwnerPhone: newPhone });
    if (f.check(res)) {
      toast.success(`Follow-up closed as ${sold ? "Lost — Property sold" : { won: "Won", lost: "Lost", deferred: "Deferred", do_not_contact: "Do not contact", "": "" }[status]}`, `${fu.id} is now read-only.`);
      onClose();
    }
  };
  return (
    <Modal open={!!fu} onOpenChange={(v) => !v && onClose()} title={`Close · ${fu?.id ?? ""}`}
      description="A person closes every follow-up. The system only prompts."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Close follow-up</Button></>}>
      <div className="space-y-4">
        <Field label="Close as" required error={f.of("status")}>
          <Select value={status} onChange={(e) => { setStatus(e.target.value as CloseDraft["status"]); setSold(false); }} invalid={!!f.of("status")}>
            <option value="">Choose…</option>
            <option value="won">Won — signed contract</option>
            <option value="lost">Lost</option>
            <option value="deferred">Deferred</option>
            <option value="do_not_contact">Do not contact</option>
          </Select>
        </Field>
        {status === "won" && (
          <Banner tone={est?.status === "ACCEPTED" ? "success" : "warn"} title={est?.status === "ACCEPTED" ? `Linked estimate ${est.id} is sold` : "Won needs a sold estimate"}>
            {est?.status === "ACCEPTED"
              ? can(user, "followup.seeDollars") ? `Dollars won: ${money(sv.value)} — ${sv.source}. Attributed to the signature month. Won is not the same as a completed repaint.` : "The signed value is recorded for the monthly measures."
              : "Link the signed estimate first. Won means a signed contract."}
          </Banner>
        )}
        {status === "lost" && (
          <Checkbox checked={sold} onCheckedChange={setSold} label="Property sold (ownership correction)" />
        )}
        {sold ? (
          <div className="space-y-3 rounded-xl border border-line p-3">
            <Field label="Confirmation" required error={f.of("confirmedByPhone")}>
              <Checkbox checked={phone} onCheckedChange={setPhone} label="I confirmed the sale with the owner by phone" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="New owner name" hint="Optional. Creates a new-owner lead where contact is permitted.">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
              </Field>
              <Field label="New owner phone">
                <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
              </Field>
            </div>
            <p className="text-[11.5px] text-slate-500">The old owner's consent is never copied to the new owner.</p>
          </div>
        ) : (
          <Field label="Reason" required={status === "lost" || status === "do_not_contact"} error={f.of("reason")}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} invalid={!!f.of("reason")}
              placeholder={status === "do_not_contact" ? "What the customer said" : status === "won" ? "Optional" : "e.g. Went with another painter"} />
          </Field>
        )}
        {f.general && <Banner tone="danger">{f.general}</Banner>}
      </div>
    </Modal>
  );
}

export function OptOutModal({ propertyId, onClose }: { propertyId?: string; onClose: () => void }) {
  const [source, setSource] = useState("");
  const f = useForm();
  useEffect(() => { setSource(""); f.reset(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [propertyId]);
  const submit = () => {
    if (!propertyId) return;
    if (f.check(act(recordOptOut, propertyId, source))) {
      toast.success("Opt-out recorded", "Every channel is blocked for this property. Internal alerts continue.");
      onClose();
    }
  };
  return (
    <Modal open={!!propertyId} onOpenChange={(v) => !v && onClose()} size="sm" title="Record opt-out"
      description="Blocks outreach on every channel for the whole property."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="dark" onClick={submit}><UserX className="h-4 w-4" /> Record opt-out</Button></>}>
      <Field label="What the customer said" required error={f.of("source")}>
        <Textarea value={source} onChange={(e) => setSource(e.target.value)} invalid={!!f.of("source")} placeholder="e.g. Please take us off your call list" />
      </Field>
    </Modal>
  );
}

export function ReconsentModal({ propertyId, onClose }: { propertyId?: string; onClose: () => void }) {
  const [d, setD] = useState("");
  const [statement, setStatement] = useState("");
  const f = useForm();
  useEffect(() => { setD(toInputDate(now())); setStatement(""); f.reset(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [propertyId]);
  const submit = () => {
    if (!propertyId) return;
    if (f.check(act(recordReconsent, propertyId, d, statement))) {
      toast.success("Re-consent recorded", "Future contact is restored for this property.");
      onClose();
    }
  };
  return (
    <Modal open={!!propertyId} onOpenChange={(v) => !v && onClose()} size="sm" title="Record explicit re-consent"
      description="Office only. Needed before any future outreach to an opted-out property."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Record re-consent</Button></>}>
      <div className="space-y-3">
        <Field label="Date the customer asked" required error={f.of("date")}>
          <Input type="date" value={d} max={toInputDate(now())} onChange={(e) => setD(e.target.value)} invalid={!!f.of("date")} />
        </Field>
        <Field label="What the customer said" required error={f.of("statement")}>
          <Textarea value={statement} onChange={(e) => setStatement(e.target.value)} invalid={!!f.of("statement")} placeholder={'e.g. "Yes, please call me about repainting the back of the house."'} />
        </Field>
        {f.general && <Banner tone="danger">{f.general}</Banner>}
      </div>
    </Modal>
  );
}

export function ReopenFollowUpModal({ fu, requalify, onClose }: { fu?: FollowUp; requalify?: boolean; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const f = useForm();
  useEffect(() => { setReason(""); f.reset(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [fu?.id]);
  const submit = () => {
    if (!fu) return;
    const res = requalify ? act(requalifyFollowUp, fu.id, reason) : act(reopenFollowUp, fu.id, reason);
    if (f.check(res)) {
      toast.success(requalify ? "Requalified" : "Follow-up reopened", requalify ? "A new day 1 / 14 / 35 schedule has started. Earlier attempts and consent are kept." : "Same opportunity ID, so it is counted once.");
      onClose();
    }
  };
  return (
    <Modal open={!!fu} onOpenChange={(v) => !v && onClose()} size="sm" title={requalify ? `Requalify · ${fu?.id ?? ""}` : `Reopen · ${fu?.id ?? ""}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>{requalify ? "Requalify" : "Reopen"}</Button></>}>
      {requalify ? (
        <Field label="Qualification reason" required error={f.of("reason")}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} invalid={!!f.of("reason")} placeholder="e.g. New season; owner still on file" />
        </Field>
      ) : (
        <Field label="Reason" required error={f.of("reason")}>
          <Select value={reason} onChange={(e) => setReason(e.target.value)} invalid={!!f.of("reason")}>
            <option value="">Choose…</option>
            {REOPEN_REASONS.map((r) => <option key={r}>{r}</option>)}
          </Select>
        </Field>
      )}
      {f.general && <Banner tone="danger" className="mt-3">{f.general}</Banner>}
    </Modal>
  );
}

export function LinkRepaintModal({ fu, onClose }: { fu?: FollowUp; onClose: () => void }) {
  const db = useDb((d) => d);
  const [jobId, setJobId] = useState("");
  const f = useForm();
  const jobs = db.jobs.filter((j) => j.propertyId === fu?.propertyId);
  useEffect(() => { setJobId(""); f.reset(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [fu?.id]);
  const submit = () => {
    if (!fu) return;
    if (f.check(act(linkCompletedRepaint, fu.id, jobId))) {
      toast.success("Completed repaint linked", "Reported separately from Won.");
      onClose();
    }
  };
  return (
    <Modal open={!!fu} onOpenChange={(v) => !v && onClose()} size="sm" title="Link completed repaint"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Link</Button></>}>
      <Field label="Completed job at this property" required error={f.of("job")}>
        <Select value={jobId} onChange={(e) => setJobId(e.target.value)} invalid={!!f.of("job")}>
          <option value="">Choose…</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.id} · {j.name} · {j.status.replace(/_/g, " ")}</option>)}
        </Select>
      </Field>
      {jobs.length === 0 && <p className="mt-2 text-[12px] text-slate-500">No jobs at this property yet.</p>}
    </Modal>
  );
}
