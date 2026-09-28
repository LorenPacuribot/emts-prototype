"use client";
/**
 * Alert detail drawer (27.4): every due surface with its own date, its
 * calculated basis and rule version, extensions, suppression / opt-out, and
 * the outcome panel (Contacted, Snoozed, Dismissed, Converted).
 */
import { useState } from "react";
import { BellOff, Check, CheckCircle2, Clock, Layers, PhoneCall, RotateCcw, ShieldCheck, Sparkles, X, XCircle } from "lucide-react";
import type { RepaintAlert, RepaintSchedule } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { decideExtension } from "@/features/lib/store/actions/service";
import { alertEscalation, alertQueueState, effectiveDue, unrelatedOpenEstimates } from "@/features/lib/rules/alerts";
import { byId, currentOwner, propertyAddress, surfaceLabel } from "@/features/lib/selectors";
import { ALERT_OUTCOME, ALERT_QUEUE_STATE } from "@/features/lib/status";
import { can } from "@/features/lib/permissions";
import { date, dateTime } from "@/features/lib/format";
import { now } from "@/features/lib/clock";
import { toast } from "@/features/lib/toast";
import { AppLink } from "@/features/lib/navigation";
import { Badge, Banner, Button, Drawer, Field, IdChip, KV, Modal, Textarea } from "@/features/components/ui";
import { ExtensionModal, OutcomeModal, QualifyModal, ReopenModal, SnoozeModal } from "./alert-modals";
import { NoticeBadge, Section } from "./shared";

export function AlertDrawer({ alertId, onClose }: { alertId?: string; onClose: () => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const alert = byId(db.repaintAlerts, alertId);
  const [outcome, setOutcome] = useState<"contacted" | "dismissed">();
  const [snooze, setSnooze] = useState(false);
  const [qualify, setQualify] = useState(false);
  const [reopen, setReopen] = useState(false);
  const [extFor, setExtFor] = useState<RepaintSchedule>();
  const [rejectFor, setRejectFor] = useState<RepaintSchedule>();
  const [rejectNote, setRejectNote] = useState("");

  if (!alert) return <Drawer open={false} onOpenChange={() => onClose()} title="">{null}</Drawer>;
  const t = now();
  const property = byId(db.properties, alert.propertyId)!;
  const owner = currentOwner(db, property);
  const st = alertQueueState(db, alert, t);
  const esc = alertEscalation(alert, t);
  const officeCan = can(user, "alerts.queue");
  const canPropose = can(user, "alerts.proposeExtension");
  const isOwner = can(user, "alerts.approveExtension");
  const blockContact = st.suppression ? "suppressed" : property.optOut ? "optout" : undefined;
  const resolved = st.state === "resolved";
  const fu = byId(db.followUps, alert.qualification?.followUpId);
  const unrelated = unrelatedOpenEstimates(db, alert.propertyId);
  const schedules = db.repaintSchedules ?? [];

  return (
    <>
      <Drawer
        open={!!alert}
        onOpenChange={(v) => !v && onClose()}
        title={<span className="flex flex-wrap items-center gap-2">Repaint opportunity <IdChip>{alert.id}</IdChip></span>}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            {propertyAddress(property)}
            <Badge tone={ALERT_QUEUE_STATE[st.state].tone}>{ALERT_QUEUE_STATE[st.state].label}</Badge>
            <Badge tone={ALERT_OUTCOME[alert.outcome].tone}>{ALERT_OUTCOME[alert.outcome].label}</Badge>
            {st.escalated && <Badge tone="red">Escalated</Badge>}
          </span>
        }
      >
        {st.escalated && (
          <Banner tone="danger" title={`Escalated to ${byId(db.users, "U-OWNER")?.name} (Business Owner)`}>
            {esc.age} calendar days since this alert was created with no recorded outcome. Viewing it does not count.
          </Banner>
        )}
        {st.suppression && (
          <Banner tone="warn" title={`Suppressed — ${st.suppression.label}`}>
            The alert stays visible so nothing is lost, but there are no contact controls while this applies.
          </Banner>
        )}
        {property.optOut && (
          <Banner tone="info" title="Property has opted out. Internal tracking continues.">
            Recorded {date(property.optOutAt)}{property.optOutSource ? ` — "${property.optOutSource}"` : ""}. Customer contact is blocked on every channel.
          </Banner>
        )}
        {st.state === "snoozed" && (
          <Banner tone="info" title={`Snoozed until ${date(alert.snoozeUntil)}`}>
            {alert.snoozeReason}{alert.outcomeReason ? ` — ${alert.outcomeReason}` : ""}
          </Banner>
        )}
        {alert.backlog && !resolved && <Banner tone="info" title="Imported overdue record (backlog)">Kept out of the live queue. Qualify it from the backlog panel.</Banner>}

        <Section title="Opportunity" icon={<Layers />}>
          <KV
            items={[
              ["Owner (customer)", owner?.name ?? "—"],
              ["Earliest due", date(alert.earliestDue)],
              ["Grouping window end", <span key="w">{date(alert.windowEnd)} <span className="text-[11px] font-normal text-slate-400">(earliest due + 12 months, fixed)</span></span>],
              ["Advance notice basis", <NoticeBadge key="n" basis={alert.noticeBasis} />],
              ["Created", `${dateTime(alert.createdAt)} · ${esc.age} days old${alert.runId ? ` · by ${alert.runId}` : ""}`],
              ["Escalation clock", esc.running ? (esc.escalated ? "Fired — routed to the business owner" : `${esc.daysLeft} days left of 14`) : "Stopped (outcome recorded)"],
              ["Queue owner", byId(db.users, alert.ownerId ?? (st.escalated ? "U-OWNER" : "U-OFFICE"))?.name ?? "—"],
              ["Unrelated open estimates", unrelated.length ? `${unrelated.map((x) => x.id).join(", ")} — does not suppress outreach` : "None"],
            ]}
          />
        </Section>

        <Section title={`Due surfaces (${alert.surfaces.length})`} icon={<Clock />}>
          <div className="space-y-3">
            {[...alert.surfaces].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((s) => {
              const sch = schedules.find((x) => x.applicationId === s.applicationId);
              const app = byId(db.applications, s.applicationId);
              const ext = sch?.extension;
              return (
                <div key={s.applicationId} className="rounded-lg border border-line bg-slate-50/50 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-[13px] font-semibold text-ink">{surfaceLabel(db, s.surfaceId)}</div>
                      <div className="text-[11.5px] text-slate-500">
                        {s.surfaceId} · completed {date(app?.completedAt)} · {app?.product}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[13px] font-bold text-ink">Due {date(s.dueDate)}</div>
                      <div className="text-[11px] text-slate-500">Notice from {date(s.noticeDate)}</div>
                    </div>
                  </div>
                  <ol className="mt-2 flex flex-wrap gap-1.5">
                    {s.basis.map((b, i) => (
                      <li key={i} className="rounded-md border border-line bg-white px-2 py-0.5 text-[11px] text-slate-600">{i + 1}. {b}</li>
                    ))}
                    <li className="rounded-md bg-slate-200/70 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Rule v{s.ruleVersion}</li>
                  </ol>
                  {ext?.status === "pending" && (
                    <Banner tone="warn" className="mt-2" title={`Extension to ${date(ext.proposedDate)} proposed by ${byId(db.users, ext.proposedBy)?.name}`}
                      action={isOwner ? (
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="success" onClick={() => act(decideExtension, sch!.id, true).ok && toast.success("Extension approved", `${s.surfaceId} extended to ${date(ext.proposedDate)}.`)}><Check className="h-3.5 w-3.5" /> Approve</Button>
                          <Button size="sm" onClick={() => { setRejectNote(""); setRejectFor(sch); }}><X className="h-3.5 w-3.5" /> Reject</Button>
                        </div>
                      ) : undefined}>
                      Awaiting owner approval. The alert keeps its original date so nothing goes quiet. Photo {ext.photoId} ({date(ext.photoDate)}): {ext.reason}
                    </Banner>
                  )}
                  {ext?.status === "approved" && sch && (
                    <div className="mt-2 rounded-md bg-emerald-50 px-2.5 py-1.5 text-[11.5px] text-emerald-800">
                      Extended: original {date(sch.dueDate)} → {date(effectiveDue(sch))}, approved by {byId(db.users, ext.decidedBy)?.name} on {date(ext.decidedAt)}. Photo {ext.photoId}.
                    </div>
                  )}
                  {ext?.status === "rejected" && <div className="mt-2 text-[11.5px] text-slate-500">Extension to {date(ext.proposedDate)} rejected: {ext.decisionNote}</div>}
                  {sch && canPropose && ext?.status !== "pending" && ext?.status !== "approved" && !resolved && (
                    <Button size="sm" variant="ghost" className="mt-2 -ml-2" onClick={() => setExtFor(sch)}>
                      <Sparkles className="h-3.5 w-3.5" /> {isOwner ? "Extend after inspection" : "Propose inspection extension"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Outcome" icon={<ShieldCheck />}>
          {!officeCan ? (
            <p className="text-[12.5px] text-slate-500">The office manager owns this queue. You can view the alert and propose inspection extensions.</p>
          ) : resolved ? (
            <div className="space-y-3">
              <div className="text-[12.5px] text-slate-600">
                <strong className="text-ink">{ALERT_OUTCOME[alert.outcome].label}</strong> by {byId(db.users, alert.outcomeBy ?? alert.qualification?.by)?.name ?? "—"} on {dateTime(alert.outcomeAt ?? alert.qualification?.at)}.
                {alert.qualification && ` Qualification: ${alert.qualification.decision} — ${alert.qualification.reason}`}
                {!alert.qualification && alert.outcomeReason && ` ${alert.outcomeReason}`}
              </div>
              {fu && (
                <AppLink href={`/repaint-alerts/follow-ups?fu=${fu.id}`} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand hover:underline">
                  Open follow-up {fu.id} →
                </AppLink>
              )}
              <div><Button size="sm" onClick={() => setReopen(true)}><RotateCcw className="h-3.5 w-3.5" /> Reopen</Button></div>
            </div>
          ) : (
            <div className="space-y-3">
              {blockContact && <p className="text-[12px] text-slate-500">{blockContact === "optout" ? "Property has opted out. Internal tracking continues." : "Suppressed: contact controls are not available."}</p>}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Button disabled={!!blockContact} onClick={() => setOutcome("contacted")} className="justify-center"><PhoneCall className="h-4 w-4" /> Contacted</Button>
                <Button onClick={() => setSnooze(true)} className="justify-center"><BellOff className="h-4 w-4" /> Snooze</Button>
                <Button onClick={() => setOutcome("dismissed")} className="justify-center"><XCircle className="h-4 w-4" /> Dismiss</Button>
                <Button variant="primary" disabled={!!blockContact} onClick={() => setQualify(true)} className="justify-center"><CheckCircle2 className="h-4 w-4" /> Convert</Button>
              </div>
              <p className="text-[11.5px] text-slate-500">Convert runs the qualification gate and creates one follow-up for the whole property. No alert ever emails a customer by itself.</p>
            </div>
          )}
        </Section>

        {(alert.history?.length ?? 0) > 0 && (
          <Section title="History">
            <ul className="space-y-2">
              {[...(alert.history ?? [])].reverse().map((h, i) => (
                <li key={i} className="border-l-2 border-line pl-3 text-[12px]">
                  <div className="text-[10.5px] font-bold uppercase text-slate-400">{dateTime(h.at)} · {byId(db.users, h.by)?.name}</div>
                  <div className="text-slate-700">{h.text}</div>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </Drawer>

      <OutcomeModal alert={outcome ? alert : undefined} kind={outcome ?? "contacted"} onClose={() => setOutcome(undefined)} />
      <SnoozeModal alert={snooze ? alert : undefined} onClose={() => setSnooze(false)} />
      <QualifyModal alert={qualify ? (alert as RepaintAlert) : undefined} onClose={() => setQualify(false)} />
      <ReopenModal alert={reopen ? alert : undefined} onClose={() => setReopen(false)} />
      <ExtensionModal schedule={extFor} onClose={() => setExtFor(undefined)} />
      <Modal open={!!rejectFor} onOpenChange={(v) => !v && setRejectFor(undefined)} size="sm" title="Reject extension"
        footer={<><Button onClick={() => setRejectFor(undefined)}>Cancel</Button><Button variant="dark" onClick={() => { if (rejectFor && act(decideExtension, rejectFor.id, false, rejectNote).ok) { toast.success("Extension rejected"); setRejectFor(undefined); } }}>Reject</Button></>}>
        <Field label="Reason" required>
          <Textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="e.g. Photo shows chalking on the south wall" />
        </Field>
      </Modal>
    </>
  );
}
