"use client";
/**
 * One employee day (feature 22, component 22.2): raw punches, lunch,
 * rounded total, job allocation, flags, and every action the viewer's role
 * allows. Nothing here edits a locked or paid day.
 */
import { punchTagLabel } from "@/features/lib/rules/shift-tag";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Lock, MapPinOff, RotateCcw, Scale, UtensilsCrossed, WifiOff } from "lucide-react";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { dateTime } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { ACTIVITY_LABEL, approverFor, canApproveEntry, elapsedMinutes, hm } from "@/features/lib/rules/payroll";
import {
  approveEntry, decideNoLunch, employeeUser, entryConflicts, entryFlags, entrySegments, entryTotals, overridePunch, reopenEntry, resolveConflict, resolveDispute, setNoLunch,
} from "@/features/lib/store/actions/workforce";
import { userName } from "@/features/lib/store/helpers";
import { Badge, Banner, Button, CardLabel, Drawer, Field, Input, KV, Modal, Table, TD, TH, THead, TR, Textarea } from "@/features/components/ui";
import { EntryStateBadge, JobChips, dayLabel, timeLabel } from "./shared";

export function EntryDrawer({ entryId, onClose }: { entryId?: string; onClose: () => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const entry = byId(db.timeEntries, entryId);
  const [override, setOverride] = useState<{ segmentId: string; field: "start" | "end" }>();
  const [noLunchReason, setNoLunchReason] = useState("");
  const [outcome, setOutcome] = useState("");
  const [err, setErr] = useState<string>();
  if (!entry) return <Drawer open={false} onOpenChange={() => onClose()} title="">{null}</Drawer>;

  const emp = byId(db.employees, entry.employeeId)!;
  const segs = entrySegments(db, entry);
  const totals = entryTotals(db, entry);
  const conflicts = entryConflicts(db, entry);
  const flags = entryFlags(db, entry);
  const approver = approverFor(employeeUser(db, emp)?.role);
  const approveCheck = canApproveEntry(user, emp, employeeUser(db, emp));
  const locked = entry.state === "locked" || entry.state === "paid";
  const payrollDetail = can(user, "time.payrollDetail");

  return (
    <Drawer
      open={!!entry}
      onOpenChange={(v) => !v && onClose()}
      title={<span className="flex flex-wrap items-center gap-2">{emp.name} · {dayLabel(entry.workDate)} <EntryStateBadge state={entry.state} /></span>}
      subtitle={`${entry.id} · approved by ${approver.label}${emp.type !== "hourly" ? ` · ${emp.type === "salaried" ? "Salaried — job-cost time only, not exported" : "Subcontractor — hours flagged, zero labor cost"}` : ""}`}
      footer={
        <>
          {entry.state === "approved" && can(user, "time.override") && (
            <Button onClick={() => act(reopenEntry, entry.id).ok && toast.success("Day reopened", "Approval history kept.")}><RotateCcw className="h-4 w-4" /> Reopen</Button>
          )}
          {(entry.state === "submitted" || (entry.state === "open" && emp.type !== "hourly")) && can(user, "time.approve") && (
            approveCheck.ok ? (
              <Button variant="primary" onClick={() => act(approveEntry, entry.id).ok && toast.success("Day approved", `${emp.name} · ${dayLabel(entry.workDate)}`)}>
                <CheckCircle2 className="h-4 w-4" /> Approve
              </Button>
            ) : (
              <span className="text-xs text-gray-500">{approveCheck.reason}</span>
            )
          )}
        </>
      }
    >
      {locked && (
        <Banner tone="info" title={entry.state === "paid" ? "Paid — never edited" : `Locked in ${entry.batchId}`}>
          {entry.state === "paid" ? "Corrections to a paid period are new next-paycheck adjustments (Export Batches)." : "Creating an export batch locked this day. Only an adjustment is possible now."}
        </Banner>
      )}
      {flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {flags.map((f) => <Badge key={f.key} tone={f.tone}>{f.label}</Badge>)}
        </div>
      )}

      {conflicts.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50/40 p-4">
          <CardLabel icon={<WifiOff />}>Offline conflict</CardLabel>
          <p className="mt-1 text-xs text-gray-600">Both records are kept. The crew lead chooses the correct one before approval. The other stays visible, superseded, with zero hours. The system never chooses and never merges.</p>
          {conflicts.map(([off, on]) => (
            <div key={off.id + on.id} className="mt-3 grid gap-2 sm:grid-cols-2 [&>*]:min-w-0">
              {[off, on].map((s) => (
                <div key={s.id} className="rounded-lg border border-line bg-white p-3 text-xs">
                  <div className="flex items-center gap-2"><Badge tone={s.source === "offline" ? "blue" : "gray"}>{s.source === "offline" ? "Offline" : "Online"}</Badge> <span className="font-semibold">{s.id}</span></div>
                  <div className="mt-1 tabular-nums">{timeLabel(s.start)} – {timeLabel(s.end)} · {hm(s.end ? elapsedMinutes(s.start, s.end) : 0)}</div>
                  {can(user, "time.resolveConflict") && !locked && (
                    <Button size="sm" className="mt-2" onClick={() => act(resolveConflict, s.id, s.id === off.id ? on.id : off.id).ok && toast.success("Conflict resolved", `Kept ${s.id}. The other record is superseded.`)}>
                      Keep this record
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ))}
          {!can(user, "time.resolveConflict") && <p className="mt-2 text-xs font-semibold text-red-700">Waiting for the crew lead to choose.</p>}
        </div>
      )}

      <div>
        <CardLabel icon={<Scale />}>Punches</CardLabel>
        <Table className="mt-2">
          <THead><tr><TH>Punch</TH><TH>Job / activity</TH><TH>In</TH><TH>Out</TH><TH>Elapsed</TH><TH>Source</TH>{can(user, "time.override") && !locked && <TH />}</tr></THead>
          <tbody>
            {segs.map((s) => (
              <TR key={s.id} className={s.supersededAt ? "opacity-50" : ""}>
                <TD className="font-semibold">{s.id}{s.supersededAt && <div className="text-xs font-normal text-red-600">Superseded — 0 hours</div>}</TD>
                <TD>{s.jobId ?? <span className="text-gray-500">Overhead</span>}<div className="text-xs text-gray-500">{ACTIVITY_LABEL[s.activity]}</div>{punchTagLabel(db, s) && <div className="text-xs font-medium text-gray-500">{punchTagLabel(db, s)}</div>}</TD>
                <TD className="tabular-nums">{timeLabel(s.start)}</TD>
                <TD className="tabular-nums">{s.end ? timeLabel(s.end) : <Badge tone="green">Clocked in</Badge>}</TD>
                <TD className="tabular-nums">{s.end ? hm(elapsedMinutes(s.start, s.end)) : "—"}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={s.source === "offline" ? "blue" : "gray"}>{s.source === "offline" ? "Offline" : "Online"}</Badge>
                    {s.location === "denied" && <Badge tone="amber" icon={<MapPinOff className="h-3 w-3" />}>Location denied</Badge>}
                    {s.location === "purged" && <Badge tone="gray">GPS deleted (90 days)</Badge>}
                    {s.queued && <Badge tone="amber">Queued on device</Badge>}
                  </div>
                </TD>
                {can(user, "time.override") && !locked && (
                  <TD>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setErr(undefined); setOverride({ segmentId: s.id, field: "start" }); }}>In</Button>
                      {s.end && <Button size="sm" variant="ghost" onClick={() => { setErr(undefined); setOverride({ segmentId: s.id, field: "end" }); }}>Out</Button>}
                    </div>
                  </TD>
                )}
              </TR>
            ))}
          </tbody>
        </Table>
        <p className="mt-1.5 text-xs text-gray-500">Punches are never rounded. Only the employee's daily total is rounded, after lunch.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
        <div className="rounded-xl border border-line p-4">
          <CardLabel>Daily total</CardLabel>
          <KV
            className="mt-3"
            items={[
              ["Worked", hm(totals.workedMinutes)],
              ["Lunch", totals.lunchMinutes ? `−${hm(totals.lunchMinutes)} (shift over 6 hours)` : entry.noLunch?.decision === "approved" ? "None — no-lunch approved" : "None"],
              ["After lunch", hm(totals.netMinutes)],
              ["Rounded (nearest 15)", <span key="r" className="font-bold">{hm(totals.roundedMinutes)}</span>],
            ]}
          />
        </div>
        <div className="rounded-xl border border-line p-4">
          <CardLabel>Job allocation</CardLabel>
          <div className="mt-3"><JobChips rows={totals.byJob} /></div>
          <p className="mt-2 text-xs text-gray-500">
            Split in proportion to recorded minutes.{totals.residualTo ? ` The residual minute went to ${totals.residualTo} (most hours; ties go to the lowest job number).` : ""} Travel is charged to the second job; training and rained-out time is overhead.
          </p>
          {!payrollDetail && <p className="mt-1 text-xs text-gray-500">Regular and overtime classification is shown to the office manager and owner.</p>}
        </div>
      </div>

      <div className="rounded-xl border border-line p-4">
        <CardLabel icon={<UtensilsCrossed />}>No-lunch exception</CardLabel>
        {entry.noLunch ? (
          <div className="mt-2 text-xs">
            <p>Flagged by {userName(db, entry.noLunch.by)}: “{entry.noLunch.reason}”</p>
            {entry.noLunch.decision ? (
              <p className="mt-1 font-semibold">{entry.noLunch.decision === "approved" ? "Approved" : "Rejected"} by {userName(db, entry.noLunch.decidedBy)} — {entry.noLunch.decision === "approved" ? "no lunch deducted" : "30 minutes deducted"}.</p>
            ) : can(user, "time.decideNoLunch") && !locked ? (
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="primary" onClick={() => act(decideNoLunch, entry.id, "approved").ok && toast.success("No-lunch approved")}>Approve no-lunch</Button>
                <Button size="sm" onClick={() => act(decideNoLunch, entry.id, "rejected").ok && toast.success("No-lunch rejected", "30 minutes will be deducted.")}>Reject</Button>
              </div>
            ) : (
              <p className="mt-1 text-amber-700">Waiting for the office's decision.</p>
            )}
          </div>
        ) : entry.state === "open" && can(user, "time.submit") ? (
          <div className="mt-2 space-y-2">
            <Field label="Crew's reason (required before submission)" error={err}>
              <Input value={noLunchReason} onChange={(e) => setNoLunchReason(e.target.value)} placeholder="e.g. worked through lunch to finish before rain" invalid={!!err} />
            </Field>
            <Button size="sm" onClick={() => { const r = act(setNoLunch, entry.id, noLunchReason); if (r.ok) { toast.success("No-lunch flag set", "The office decides after submission."); setNoLunchReason(""); } else setErr(r.error); }}>Flag no lunch</Button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-gray-500">No flag. Lunch is deducted automatically on shifts over six hours.</p>
        )}
      </div>

      {entry.dispute && (
        <div className={`rounded-xl border p-4 ${entry.dispute.status === "open" ? "border-red-200 bg-red-50/30" : "border-line"}`}>
          <CardLabel icon={<AlertTriangle />}>Dispute</CardLabel>
          <p className="mt-2 text-xs">“{entry.dispute.note}” — raised {dateTime(entry.dispute.raisedAt)}</p>
          <p className="mt-1 text-xs text-gray-600">
            Routed to {entry.dispute.routedTo === "owner" ? "the Business Owner (raised after Wednesday noon)" : "the Crew Lead and Office Manager"}.
            {entry.dispute.movedToNextBatch && " This entry dropped out of the current batch and goes into the next one. Nobody else's pay is delayed."}
          </p>
          {entry.dispute.status === "resolved" ? (
            <p className="mt-2 text-xs font-semibold">Resolved by {userName(db, entry.dispute.resolvedBy)}: {entry.dispute.outcome}</p>
          ) : (entry.dispute.routedTo === "owner" ? user.role === "owner" : ["crew_lead", "office_manager", "owner"].includes(user.role)) ? (
            <div className="mt-2 space-y-2">
              <Textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Outcome, e.g. clock-out corrected to 4:30 p.m. by override" className="min-h-14" />
              <Button size="sm" onClick={() => {
                if (act(resolveDispute, entry.id, outcome).ok) {
                  toast.success("Dispute resolved");
                  setOutcome("");
                }
              }}>Record outcome</Button>
            </div>
          ) : null}
        </div>
      )}

      {entry.overrides.length > 0 && (
        <div>
          <CardLabel>Overrides</CardLabel>
          <ul className="mt-2 space-y-1 text-xs">
            {entry.overrides.map((o, i) => (
              <li key={i} className="rounded-lg bg-gray-50 px-3 py-2">
                {o.segmentId} {o.field}: <span className="line-through">{timeLabel(o.oldValue)}</span> → <strong>{timeLabel(o.newValue)}</strong> by {userName(db, o.by)} — {o.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <CardLabel icon={<Lock />}>History</CardLabel>
        <ul className="mt-2 space-y-1 text-xs text-gray-600">
          {entry.attestedAt && <li>Attested by the employee {dateTime(entry.attestedAt)}</li>}
          {entry.unattested && <li className="text-amber-700">Submitted by the crew lead without the employee's attestation.</li>}
          {[...entry.history].reverse().map((h, i) => <li key={i}>{dateTime(h.at)} — {userName(db, h.by)}: {h.text}</li>)}
          {!entry.history.length && !entry.attestedAt && <li className="italic text-gray-500">No history yet.</li>}
        </ul>
      </div>

      <OverrideModal target={override} onClose={() => setOverride(undefined)} />
    </Drawer>
  );
}

function OverrideModal({ target, onClose }: { target?: { segmentId: string; field: "start" | "end" }; onClose: () => void }) {
  const db = useDb((d) => d);
  const seg = byId(db.timeSegments, target?.segmentId);
  const current = seg && target ? seg[target.field] : undefined;
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<{ msg: string; field?: string }>();
  const local = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  };
  return (
    <Modal
      open={!!target}
      onOpenChange={(v) => !v && onClose()}
      size="sm"
      title={`Override ${target?.field === "start" ? "clock-in" : "clock-out"}`}
      description="The original value and your reason are both kept."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => {
            const r = act(overridePunch, target!.segmentId, target!.field, value || local(current), reason);
            if (r.ok) { toast.success("Punch overridden", "Original value kept."); setValue(""); setReason(""); onClose(); }
            else setErr({ msg: r.error, field: r.field });
          }}>Save override</Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-gray-600">Currently {timeLabel(current)} on {seg?.id}.</p>
        <Field label="New time" required error={err?.field === "value" ? err.msg : undefined}>
          <Input type="datetime-local" value={value || local(current)} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label="Reason" required error={err?.field === "reason" ? err.msg : err && !err.field ? err.msg : undefined}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} invalid={err?.field === "reason"} />
        </Field>
      </div>
    </Modal>
  );
}
