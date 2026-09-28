"use client";
/**
 * Modal forms for the repaint alert queue: outcome note, snooze, qualify
 * (accept / reject), reopen, inspection extension.
 */
import { useEffect, useState } from "react";
import type { RepaintAlert, RepaintSchedule, SnoozeReason } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { proposeExtension, qualifyAlert, recordAlertOutcome, reopenAlert, snoozeAlert } from "@/features/lib/store/actions/service";
import { REOPEN_REASONS, SNOOZE_REASONS, MAX_EXTENSION_MONTHS } from "@/features/lib/rules/alerts";
import { addMonths } from "@/features/lib/rules/dates";
import { can } from "@/features/lib/permissions";
import { byId, surfaceLabel } from "@/features/lib/selectors";
import { date } from "@/features/lib/format";
import { now } from "@/features/lib/clock";
import { toast } from "@/features/lib/toast";
import { Banner, Button, Checkbox, Field, Input, Modal, Select, Textarea } from "@/features/components/ui";
import { toInputDate } from "./shared";

type Err = { field?: string; message: string } | undefined;

function useErr() {
  const [err, setErr] = useState<Err>();
  return {
    err,
    clear: () => setErr(undefined),
    of: (f: string) => (err?.field === f ? err.message : undefined),
    run: <T,>(res: { ok: true; value?: T } | { ok: false; error: string; field?: string }) => {
      if (!res.ok) setErr({ field: res.field, message: res.error });
      return res.ok;
    },
  };
}

export function OutcomeModal({ alert, kind, onClose }: { alert?: RepaintAlert; kind: "contacted" | "dismissed"; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const e = useErr();
  useEffect(() => {
    setReason("");
    e.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert?.id, kind]);
  const submit = () => {
    if (!alert) return;
    if (e.run(act(recordAlertOutcome, alert.id, kind, reason))) {
      toast.success(kind === "contacted" ? "Marked as contacted" : "Alert dismissed", `${alert.id} outcome recorded.`);
      onClose();
    }
  };
  return (
    <Modal
      open={!!alert}
      onOpenChange={(v) => !v && onClose()}
      size="sm"
      title={kind === "contacted" ? `Record contact · ${alert?.id ?? ""}` : `Dismiss · ${alert?.id ?? ""}`}
      description={kind === "contacted" ? "Contact is made by a person. Recording it stops the 14-day escalation clock." : "The alert is kept with its reason. It can be reopened later."}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>{kind === "contacted" ? "Record contact" : "Dismiss alert"}</Button>
        </>
      }
    >
      <Field label={kind === "contacted" ? "What happened" : "Reason"} required error={e.of("reason")}>
        <Textarea value={reason} onChange={(x) => setReason(x.target.value)} invalid={!!e.of("reason")} placeholder={kind === "contacted" ? "e.g. Spoke with Elena, wants a call back after 5 p.m." : "e.g. Duplicate of an imported record"} />
      </Field>
      {e.err && !e.err.field && <Banner tone="danger" className="mt-3">{e.err.message}</Banner>}
    </Modal>
  );
}

export function SnoozeModal({ alert, onClose }: { alert?: RepaintAlert; onClose: () => void }) {
  const [choice, setChoice] = useState<"3" | "6" | "12" | "date">("3");
  const [dateStr, setDateStr] = useState("");
  const [reason, setReason] = useState<SnoozeReason | "">("");
  const [note, setNote] = useState("");
  const e = useErr();
  useEffect(() => {
    setChoice("3");
    setDateStr("");
    setReason("");
    setNote("");
    e.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert?.id]);
  const preview = choice === "date" ? (dateStr ? date(new Date(`${dateStr}T12:00:00`).toISOString()) : "—") : date(addMonths(now(), Number(choice)));
  const submit = () => {
    if (!alert) return;
    const res = act(snoozeAlert, alert.id, choice === "date" ? "date" : (Number(choice) as 3 | 6 | 12), choice === "date" ? dateStr : undefined, reason, note);
    if (e.run(res)) {
      toast.success("Alert snoozed", `${alert.id} returns to the queue on ${preview}.`);
      onClose();
    }
  };
  return (
    <Modal
      open={!!alert}
      onOpenChange={(v) => !v && onClose()}
      size="sm"
      title={`Snooze · ${alert?.id ?? ""}`}
      description="The alert leaves the live queue and comes back on the snooze date."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>Snooze</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Snooze for" required>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {(["3", "6", "12", "date"] as const).map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={choice === c}
                onClick={() => setChoice(c)}
                className={`h-9 rounded-lg border px-3 text-[12.5px] font-semibold ${choice === c ? "border-ink bg-ink text-white" : "border-line bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                {c === "date" ? "Until a date" : `${c} months`}
              </button>
            ))}
          </div>
        </Field>
        {choice === "date" && (
          <Field label="Snooze until" required error={e.of("date")}>
            <Input type="date" value={dateStr} min={toInputDate(now())} onChange={(x) => setDateStr(x.target.value)} invalid={!!e.of("date")} />
          </Field>
        )}
        <Field label="Reason" required error={e.of("reason")}>
          <Select value={reason} onChange={(x) => setReason(x.target.value as SnoozeReason)} invalid={!!e.of("reason")}>
            <option value="">Choose a reason…</option>
            {SNOOZE_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <Field label="Note" hint="Optional.">
          <Input value={note} onChange={(x) => setNote(x.target.value)} placeholder="e.g. Call back after the holidays" />
        </Field>
        <p className="text-[12px] text-slate-500">Returns to the queue on <strong className="text-ink">{preview}</strong>.</p>
        {e.err && !e.err.field && <Banner tone="danger">{e.err.message}</Banner>}
      </div>
    </Modal>
  );
}

/** Qualification gate (29.1). Accept creates a follow-up at Qualified; reject keeps the alert with its reason. */
export function QualifyModal({ alert, onClose, onDone }: { alert?: RepaintAlert; onClose: () => void; onDone?: (followUpId?: string) => void }) {
  const db = useDb((d) => d);
  const [decision, setDecision] = useState<"accepted" | "rejected">("accepted");
  const [checks, setChecks] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const e = useErr();
  useEffect(() => {
    setDecision("accepted");
    setChecks([]);
    setReason("");
    e.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert?.id]);
  const toggle = (c: string, v: boolean) => setChecks((x) => (v ? [...x, c] : x.filter((y) => y !== c)));
  const submit = () => {
    if (!alert) return;
    const res = act(qualifyAlert, alert.id, { decision, reason, checks });
    if (e.run(res)) {
      const v = res.ok ? res.value : undefined;
      if (v?.rejected) toast.success("Alert rejected", "The reason is stored and the alert is kept.");
      else if (v?.duplicate) toast.success("Linked to existing follow-up", `${v.followUpId} already covers this property. One conversation, not two.`);
      else toast.success("Qualified", `Follow-up ${v?.followUpId} created at status Qualified. Assign an area estimator next.`);
      onDone?.(v?.followUpId);
      onClose();
    }
  };
  const surfaces = alert?.surfaces ?? [];
  return (
    <Modal
      open={!!alert}
      onOpenChange={(v) => !v && onClose()}
      title={`Qualify · ${alert?.id ?? ""}`}
      description="A person reviews every alert before any customer contact. The reason is kept either way."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={decision === "accepted" ? "primary" : "dark"} onClick={submit}>
            {decision === "accepted" ? "Accept and create follow-up" : "Reject alert"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
          {byId(db.properties, alert?.propertyId)?.address} · {surfaces.length} due surface{surfaces.length === 1 ? "" : "s"}: {surfaces.map((s) => surfaceLabel(db, s.surfaceId)).join(", ")}
        </div>
        <Field label="Decision" required>
          <div className="flex gap-2">
            {(["accepted", "rejected"] as const).map((d) => (
              <button key={d} onClick={() => setDecision(d)} aria-pressed={decision === d}
                className={`h-9 flex-1 rounded-lg border text-[12.5px] font-semibold ${decision === d ? "border-ink bg-ink text-white" : "border-line bg-white text-slate-700"}`}>
                {d === "accepted" ? "Accept" : "Reject"}
              </button>
            ))}
          </div>
        </Field>
        {decision === "accepted" && (
          <Field label="Checks" required error={e.of("checks")}>
            <div className="flex flex-col gap-2">
              <Checkbox checked={checks.includes("address")} onCheckedChange={(v) => toggle("address", v)} label="Address is correct" />
              <Checkbox checked={checks.includes("owner")} onCheckedChange={(v) => toggle("owner", v)} label="Owner on file is current" />
              <Checkbox checked={checks.includes("opportunity")} onCheckedChange={(v) => toggle("opportunity", v)} label="Opportunity is real (not already quoted or scheduled)" />
            </div>
          </Field>
        )}
        <Field label="Reason" required error={e.of("reason")} hint="Cover the address, the owner and the opportunity.">
          <Textarea value={reason} onChange={(x) => setReason(x.target.value)} invalid={!!e.of("reason")} placeholder={decision === "accepted" ? "e.g. Owner confirmed by phone; living room and bedroom due together" : "e.g. Owner moved out; house is a rental now"} />
        </Field>
        {e.err && !e.err.field && <Banner tone="danger">{e.err.message}</Banner>}
      </div>
    </Modal>
  );
}

export function ReopenModal({ alert, onClose }: { alert?: RepaintAlert; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const e = useErr();
  useEffect(() => {
    setReason("");
    e.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert?.id]);
  const submit = () => {
    if (!alert) return;
    if (e.run(act(reopenAlert, alert.id, reason))) {
      toast.success("Alert reopened", "It is back in the queue with its history intact.");
      onClose();
    }
  };
  return (
    <Modal open={!!alert} onOpenChange={(v) => !v && onClose()} size="sm" title={`Reopen · ${alert?.id ?? ""}`}
      description="An opportunity reopens only after a sale reassignment, a lost repaint estimate or an inbound enquiry."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Reopen</Button></>}>
      <Field label="Reason" required error={e.of("reason")}>
        <Select value={reason} onChange={(x) => setReason(x.target.value)} invalid={!!e.of("reason")}>
          <option value="">Choose a reason…</option>
          {REOPEN_REASONS.map((r) => <option key={r}>{r}</option>)}
        </Select>
      </Field>
      {e.err && !e.err.field && <Banner tone="danger" className="mt-3">{e.err.message}</Banner>}
    </Modal>
  );
}

/** Inspection extension (27.Q01): estimators propose, the owner approves. */
export function ExtensionModal({ schedule, onClose }: { schedule?: RepaintSchedule; onClose: () => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const owner = can(user, "alerts.approveExtension");
  const [dateStr, setDateStr] = useState("");
  const [reason, setReason] = useState("");
  const [photoName, setPhotoName] = useState("");
  const [photoDate, setPhotoDate] = useState("");
  const e = useErr();
  useEffect(() => {
    setDateStr("");
    setReason("");
    setPhotoName("");
    setPhotoDate(toInputDate(now()));
    e.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule?.id]);
  const submit = () => {
    if (!schedule) return;
    const res = act(proposeExtension, schedule.id, { date: dateStr, reason, photoName, photoDate });
    if (e.run(res)) {
      toast.success(owner ? "Extension approved" : "Extension proposed", owner ? "The service date is extended." : "The owner has been asked to approve. The alert keeps its original date meanwhile.");
      onClose();
    }
  };
  return (
    <Modal
      open={!!schedule}
      onOpenChange={(v) => !v && onClose()}
      title={owner ? "Extend service date" : "Propose inspection extension"}
      description={schedule ? `${surfaceLabel(db, schedule.surfaceId)} · expected ${date(schedule.dueDate)}. The completion date never changes.` : undefined}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>{owner ? "Approve extension" : "Send to owner"}</Button></>}
    >
      <div className="space-y-4">
        {!owner && <Banner tone="info">Estimators may only propose. It takes effect when the business owner approves it.</Banner>}
        <Field label="New service date" required error={e.of("date")} hint={schedule ? `At most ${MAX_EXTENSION_MONTHS / 12} years: no later than ${date(addMonths(schedule.dueDate, MAX_EXTENSION_MONTHS))}.` : undefined}>
          <Input type="date" value={dateStr} onChange={(x) => setDateStr(x.target.value)} invalid={!!e.of("date")} />
        </Field>
        <Field label="Inspection finding" required error={e.of("reason")}>
          <Textarea value={reason} onChange={(x) => setReason(x.target.value)} invalid={!!e.of("reason")} placeholder="e.g. Coating sound, no chalking, minor wear only on the stair side" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Photograph" required error={e.of("photo")}>
            <Input type="file" accept="image/*" onChange={(x) => setPhotoName(x.target.files?.[0]?.name ?? "")} invalid={!!e.of("photo")} className="py-2" />
          </Field>
          <Field label="Photo taken on" required error={e.of("photoDate")}>
            <Input type="date" value={photoDate} max={toInputDate(now())} onChange={(x) => setPhotoDate(x.target.value)} invalid={!!e.of("photoDate")} />
          </Field>
        </div>
        {e.err && !e.err.field && <Banner tone="danger">{e.err.message}</Banner>}
      </div>
    </Modal>
  );
}
