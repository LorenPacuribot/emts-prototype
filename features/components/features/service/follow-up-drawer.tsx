"use client";
/**
 * Follow-up detail drawer (29): scope, contact, attempt schedule, call record,
 * clocks, linked records and closure. One drawer = one property conversation.
 */
import { useState } from "react";
import {
  AlarmClock, CalendarClock, ClipboardCheck, FileText, Link2, Mail, MessageSquare, Phone, PhoneCall, RotateCcw, ShieldCheck, UserCheck, UserPlus, UserX, XCircle,
} from "lucide-react";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { markEstimateSent, outreachBlock, requestQuote } from "@/features/lib/store/actions/service";
import { followUpClockState, followUpFlags, followUpSurfaceIds, isClosedFollowUp, suppressionFor } from "@/features/lib/rules/alerts";
import { inContactWindow, isConversation } from "@/features/lib/rules/follow-up";
import { byId, currentOwner, propertyAddress, surfaceLabel } from "@/features/lib/selectors";
import { CALL_OUTCOME, ESTIMATE_STATUS, FOLLOWUP_STATUS, JOB_STATUS } from "@/features/lib/status";
import { can } from "@/features/lib/permissions";
import { date, dateTime, money, titleCase } from "@/features/lib/format";
import { now, nowDate } from "@/features/lib/clock";
import { toast } from "@/features/lib/toast";
import { AppLink, useNav } from "@/features/lib/navigation";
import { propertyHref } from "@/features/lib/hrefs";
import { Badge, Banner, Button, Drawer, IdChip, KV, Tooltip } from "@/features/components/ui";
import { AssignModal, CallModal, CloseModal, EmailModal, LinkRepaintModal, OptOutModal, ReconsentModal, ReopenFollowUpModal } from "./follow-up-modals";
import { Section } from "./shared";
import type { CloseDraft } from "@/features/lib/store/actions/service";

export function FollowUpDrawer({ fuId, onClose }: { fuId?: string; onClose: () => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const nav = useNav();
  const fu = byId(db.followUps, fuId);
  const [assign, setAssign] = useState(false);
  const [call, setCall] = useState(false);
  const [email, setEmail] = useState(false);
  const [close, setClose] = useState<CloseDraft["status"] | "open">();
  const [optOut, setOptOut] = useState(false);
  const [reconsent, setReconsent] = useState(false);
  const [reopen, setReopen] = useState<"reopen" | "requalify">();
  const [linkJob, setLinkJob] = useState(false);

  if (!fu) return <Drawer open={false} onOpenChange={() => onClose()} title="">{null}</Drawer>;
  const t = now();
  const property = byId(db.properties, fu.propertyId)!;
  const owner = currentOwner(db, property);
  const alert = byId(db.repaintAlerts, fu.alertId);
  const flags = followUpFlags(db, fu, t);
  const clocks = followUpClockState(db, fu, t);
  const closed = isClosedFollowUp(fu);
  const office = can(user, "followup.qualify");
  const mine = fu.assigneeId === user.id;
  const canWork = can(user, "followup.work") && (office || mine);
  const block = outreachBlock(db, fu);
  const windowCheck = inContactWindow(nowDate());
  const suppression = suppressionFor(db, fu.propertyId, { ignoreEstimateId: fu.estimateId });
  const est = byId(db.estimates, fu.estimateId);
  const job = est ? db.jobs.find((j) => j.estimateId === est.id) : undefined;
  const repaint = byId(db.jobs, fu.completedRepaintJobId);
  const nextIdx = fu.attempts.findIndex((a) => !a.actualAt);
  const nextAttempt = nextIdx >= 0 ? fu.attempts[nextIdx] : undefined;
  const notYet = nextAttempt && nextAttempt.plannedDate.slice(0, 10) > t.slice(0, 10);
  const attemptBlock = !fu.assigneeId ? "Assign the follow-up first." : block ?? (nextIdx < 0 ? "Three attempts made." : notYet ? `Attempt ${nextIdx + 1} is scheduled for ${date(nextAttempt!.plannedDate)}.` : undefined);
  const surfaceIds = followUpSurfaceIds(db, fu);
  const alerts = db.repaintAlerts.filter((a) => a.id === fu.alertId || fu.linkedAlertIds?.includes(a.id));
  const prompt = !closed && est && (est.status === "ACCEPTED" || est.status === "DECLINED");
  const s = FOLLOWUP_STATUS[fu.status];

  const doQuote = () => {
    const res = act(requestQuote, fu.id, "call");
    if (res.ok) {
      toast.success("Quote requested", `${res.value!.requestId} queued. Opening the new estimate from history.`);
      nav.push(propertyHref(fu.propertyId, "history", `&newEstimate=1&followUp=${fu.id}`));
    }
  };

  return (
    <>
      <Drawer
        open={!!fu}
        onOpenChange={(v) => !v && onClose()}
        width="max-w-3xl"
        title={<span className="flex flex-wrap items-center gap-2">Follow-up <IdChip>{fu.id}</IdChip><Badge tone={s.tone}>{s.label}</Badge></span>}
        subtitle={`${propertyAddress(property)} · ${owner?.name ?? "—"}`}
      >
        {prompt && (
          <Banner tone={est!.status === "ACCEPTED" ? "success" : "warn"} title={`Linked estimate ${est!.id} was ${est!.status === "ACCEPTED" ? "accepted" : "lost"}. Close this follow-up?`}
            action={canWork ? <Button size="sm" variant="primary" onClick={() => setClose(est!.status === "ACCEPTED" ? "won" : "lost")}>Close as {est!.status === "ACCEPTED" ? "Won" : "Lost"}</Button> : undefined}>
            The system never closes a follow-up by itself. A person confirms it.
          </Banner>
        )}
        {flags.escalated && flags.driving && (
          <Banner tone="danger" title={`Escalated to ${flags.driving.escalatesTo} — ${flags.driving.label.split(" (")[0]}`}>
            Day {flags.driving.days} of {flags.driving.limit}. Clock source: {date(flags.driving.source)}.
          </Banner>
        )}
        {fu.returnedAt && !fu.assigneeId && !closed && (
          <Banner tone="warn" title="Returned to the queue">Assignee went out of office on {date(fu.returnedAt)}. No clock was paused or reset — reassign now.</Banner>
        )}
        {flags.recycled && (
          <Banner tone="info" title={`Three attempts made. This opportunity will recycle for ${date(fu.recycleDate)}.`}>
            Nothing is sent automatically. It returns for requalification on that date; earlier attempts and consent are kept.
          </Banner>
        )}

        <Section title="Summary" icon={<ClipboardCheck />}
          right={office && !closed ? <Button size="sm" onClick={() => setAssign(true)}><UserPlus className="h-3.5 w-3.5" /> {fu.assigneeId ? "Reassign" : "Assign"}</Button> : undefined}>
          <KV items={[
            ["Assignee", fu.assigneeId ? `${byId(db.users, fu.assigneeId)?.name} · since ${date(fu.assignedAt)}` : <span key="u" className="text-amber-700">Unassigned</span>],
            ["Source alert", <span key="a">{alert ? <AppLink href={`/repaint-alerts?alert=${alert.id}`} className="text-brand hover:underline">{alert.id}</AppLink> : "—"} · created {date(alert?.createdAt)} (system date)</span>],
            ["Qualified", `${dateTime(fu.qualifiedAt)} by ${byId(db.users, fu.qualifiedBy)?.name}${fu.requalifiedAt ? " (requalified)" : ""}`],
            ["Qualification reason", fu.qualifyReason],
            ["Attempts", `${flags.attemptsMade} of 3`],
            ["Next action", flags.next ? date(flags.next) : "—"],
          ]} />
        </Section>

        <Section title={`Scope — one property conversation (${surfaceIds.length})`} icon={<Link2 />}>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {alerts.flatMap((a) => a.surfaces.map((x) => ({ a, x }))).sort((p, q) => p.x.dueDate.localeCompare(q.x.dueDate)).map(({ a, x }) => (
              <li key={x.applicationId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[12.5px]">
                <span><span className="font-semibold text-ink">{surfaceLabel(db, x.surfaceId)}</span> <span className="text-slate-400">· {x.surfaceId}{a.id !== fu.alertId ? ` · linked from ${a.id}` : ""}</span></span>
                <span className="font-semibold">Due {date(x.dueDate)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] text-slate-500">The customer is contacted once about all of these, never once per surface.</p>
        </Section>

        <Section title="Contact" icon={<Phone />}>
          <KV items={[
            ["Customer", `${owner?.name ?? "—"} · ${owner?.phone ?? "no phone"} · ${owner?.email ?? "no email"}`],
            ["Preferred channel", titleCase(owner?.preferredChannel ?? "—")],
            ["Signed consent", owner?.consentSigned ? <Badge key="c" tone="green">On file</Badge> : <Badge key="c" tone="amber">Not signed — email unavailable</Badge>],
            ["Contact window", windowCheck.ok ? <Badge key="w" tone="green">Open now ({nowDate().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })})</Badge> : <span key="w" className="text-red-700">Outside the permitted contact window (8 a.m.–7 p.m., not Sundays or holidays). {windowCheck.reason}</span>],
            ["Opt-out", property.optOut ? <span key="o" className="text-slate-800"><Badge tone="dark">Do not contact</Badge> since {date(property.optOutAt)}{property.optOutSource ? ` — "${property.optOutSource}"` : ""}</span> : "No"],
            ["Suppression", suppression ? suppression.label : "None"],
            ...(property.reconsent?.length ? [["Re-consent", property.reconsent.map((r) => `${date(r.date)}: "${r.statement}"`).join("; ")] as [string, string]] : []),
          ]} />
          <div className="mt-3 flex flex-wrap gap-2">
            {!property.optOut && can(user, "followup.work") && <Button size="sm" onClick={() => setOptOut(true)}><UserX className="h-3.5 w-3.5" /> Record opt-out</Button>}
            {property.optOut && can(user, "followup.reconsent") && <Button size="sm" onClick={() => setReconsent(true)}><UserCheck className="h-3.5 w-3.5" /> Record re-consent</Button>}
            {property.optOut && canWork && !closed && (
              <Button size="sm" onClick={() => act(requestQuote, fu.id, "inbound").ok && toast.success("Inbound quote request logged", "Served without clearing the opt-out.")}>
                <FileText className="h-3.5 w-3.5" /> Log inbound quote request
              </Button>
            )}
          </div>
        </Section>

        <Section title="Attempt schedule — days 1, 14, 35" icon={<CalendarClock />}
          right={!closed && canWork ? (
            <div className="flex flex-wrap gap-1.5">
              <Tooltip content={attemptBlock ?? "Record the call you just made"}>
                <span><Button size="sm" variant="primary" disabled={!!attemptBlock} onClick={() => setCall(true)}><PhoneCall className="h-3.5 w-3.5" /> Record call</Button></span>
              </Tooltip>
              <Tooltip content={attemptBlock ?? (!owner?.consentSigned ? "No signed consent on file" : "Preview, then press Send")}>
                <span><Button size="sm" disabled={!!attemptBlock || !owner?.consentSigned} onClick={() => setEmail(true)}><Mail className="h-3.5 w-3.5" /> Email</Button></span>
              </Tooltip>
              <Tooltip content="Texting is not yet released. It needs the written state texting rules and the local timezone from the business owner and bookkeeper.">
                <span><Button size="sm" disabled><MessageSquare className="h-3.5 w-3.5" /> Text · not yet released</Button></span>
              </Tooltip>
            </div>
          ) : undefined}>
          {!closed && canWork && attemptBlock && <p className="mb-2 text-[12px] text-slate-500">{attemptBlock}</p>}
          <div className="space-y-2">
            {fu.attempts.map((a, i) => {
              const m = a.outcome ? CALL_OUTCOME[a.outcome] : undefined;
              return (
                <div key={a.id} className="rounded-lg border border-line p-3 text-[12.5px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-ink">Attempt {i + 1}</span>
                      <Badge tone="gray">Day {a.plannedDay}</Badge>
                      <span className="text-slate-600">Planned {date(a.plannedDate)}</span>
                      {a.movedFrom && <Badge tone="amber">Moved from {date(a.movedFrom)} ({new Date(a.movedFrom).getUTCDay() === 0 ? "Sunday" : "holiday"})</Badge>}
                    </div>
                    {a.actualAt ? (
                      <span className="flex items-center gap-1.5">{m && <Badge tone={m.tone}>{m.label}</Badge>}<span className="text-slate-500">{dateTime(a.actualAt)} · {a.channel ?? "call"}</span></span>
                    ) : (
                      <span className="text-slate-400">Not made yet</span>
                    )}
                  </div>
                  {a.actualAt && (
                    <div className="mt-1.5 text-slate-600">
                      {a.contactName} — {a.note} <span className="text-slate-400">· by {byId(db.users, a.by)?.name} · next action {date(a.nextActionDate)}</span>
                      {!isConversation(a.outcome) && <span className="ml-1 text-[11px] italic text-slate-400">(attempt only, not a conversation)</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {!!fu.priorAttempts?.length && (
            <p className="mt-2 text-[11.5px] text-slate-500">{fu.priorAttempts.length} attempts from an earlier season are kept on record.</p>
          )}
        </Section>

        <Section title="Clocks (calendar days)" icon={<AlarmClock />}>
          <div className="grid gap-2 sm:grid-cols-3">
            {clocks.clocks.map((c) => {
              const drivingNow = c.key === clocks.driving;
              return (
                <div key={c.key} className={`rounded-lg border p-3 text-[12px] ${drivingNow ? (c.escalated ? "border-red-300 bg-red-50" : "border-brand bg-brand-soft/40") : "border-line"}`}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold text-ink">{c.label.split(" (")[0]}</span>
                    {drivingNow && <Badge tone={c.escalated ? "red" : "blue"}>Driving</Badge>}
                  </div>
                  <div className="mt-1 text-slate-600">{c.state === "not_started" ? "Not started" : `Day ${c.days} of ${c.limit}`}{c.escalated ? " · escalated" : ""}</div>
                  <div className="text-[11px] text-slate-500">Source {c.source ? date(c.source) : "—"} · to {c.escalatesTo}</div>
                  {c.stoppedNote && <div className="text-[11px] text-slate-400">{c.stoppedNote}</div>}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11.5px] text-slate-500">Reassignment restarts the assigned clock only. Absence restarts nothing.</p>
        </Section>

        <Section title="Linked records" icon={<Link2 />}
          right={!closed && canWork && !fu.quoteRequest && !property.optOut ? <Button size="sm" variant="primary" disabled={!!suppression} onClick={doQuote}><FileText className="h-3.5 w-3.5" /> Request quote</Button> : undefined}>
          <KV items={[
            ["Quote request", fu.quoteRequest ? `${fu.quoteRequest.id} · via ${fu.quoteRequest.via} · ${dateTime(fu.quoteRequest.at)}` : "None"],
            ["Estimate", est ? <span key="e" className="flex items-center gap-1.5">{est.id} · {est.title} <Badge tone={ESTIMATE_STATUS[est.status].tone}>{ESTIMATE_STATUS[est.status].label}</Badge>{can(user, "followup.seeDollars") && ` ${money(est.total)}`}</span>
              : fu.quoteRequest ? <AppLink key="e" href={propertyHref(fu.propertyId, "history", `&newEstimate=1&followUp=${fu.id}`)} className="text-brand hover:underline">Build the estimate from history →</AppLink> : "—"],
            ["Job", job ? <span key="j">{job.id} <Badge tone={JOB_STATUS[job.status].tone}>{JOB_STATUS[job.status].label}</Badge></span> : "—"],
            ["Completed repaint", repaint ? `${repaint.id} (reported separately from Won)` : "Not linked"],
            ["Linked duplicate alerts", fu.linkedAlertIds?.length ? fu.linkedAlertIds.join(", ") : "None"],
            ...(fu.newLeadId ? [["New-owner lead", fu.newLeadId] as [string, string]] : []),
            ...(fu.status === "won" && can(user, "followup.seeDollars") ? [["Dollars won", `${money(fu.wonValue)} · signed ${date(fu.wonSignedAt)} (excl. tax and later change orders)`] as [string, string]] : []),
          ]} />
          <div className="mt-3 flex flex-wrap gap-2">
            {est && (est.status === "SENT" || est.status === "VIEWED") && fu.status === "estimate_requested" && canWork && (
              <Button size="sm" onClick={() => act(markEstimateSent, fu.id).ok && toast.success("Status: Estimate sent")}>Mark estimate sent</Button>
            )}
            {canWork && !repaint && db.jobs.some((j) => j.propertyId === fu.propertyId && j.status === "completed") && (
              <Button size="sm" onClick={() => setLinkJob(true)}>Link completed repaint</Button>
            )}
          </div>
        </Section>

        <Section title="Closure" icon={<ShieldCheck />}>
          {closed ? (
            <div className="space-y-2 text-[12.5px]">
              <p>Closed as <strong>{s.label}</strong> on {dateTime(fu.closedAt)}{fu.closedReason ? ` — ${fu.closedReason}` : ""}. Read-only.</p>
              {office && fu.status !== "won" && !flags.recycled && <Button size="sm" onClick={() => setReopen("reopen")}><RotateCcw className="h-3.5 w-3.5" /> Reopen</Button>}
              {office && flags.recycled && (
                <Tooltip content={fu.recycleDate && fu.recycleDate > t ? `Available from ${date(fu.recycleDate)}` : "Start a new season"}>
                  <span><Button size="sm" disabled={!!fu.recycleDate && fu.recycleDate.slice(0, 10) > t.slice(0, 10)} onClick={() => setReopen("requalify")}><RotateCcw className="h-3.5 w-3.5" /> Requalify</Button></span>
                </Tooltip>
              )}
            </div>
          ) : canWork ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => setClose("open")}><XCircle className="h-3.5 w-3.5" /> Close follow-up…</Button>
              <span className="text-[11.5px] text-slate-500">Won needs a sold estimate. Lost and Do not contact need a reason.</span>
            </div>
          ) : (
            <p className="text-[12.5px] text-slate-500">Only the assigned estimator or the office can work this follow-up.</p>
          )}
        </Section>

        <Section title="Status history">
          <ul className="space-y-2">
            {[...fu.history].reverse().map((h, i) => (
              <li key={i} className="border-l-2 border-line pl-3 text-[12px]">
                <div className="text-[10.5px] font-bold uppercase text-slate-400">{dateTime(h.at)} · {byId(db.users, h.by)?.name}</div>
                <div className="text-slate-700">{FOLLOWUP_STATUS[h.status]?.label ?? titleCase(h.status)}{h.note ? ` — ${h.note}` : ""}</div>
              </li>
            ))}
          </ul>
        </Section>
      </Drawer>

      <AssignModal fu={assign ? fu : undefined} onClose={() => setAssign(false)} />
      <CallModal fu={call ? fu : undefined} attemptN={nextIdx + 1} onClose={() => setCall(false)} />
      <EmailModal fu={email ? fu : undefined} onClose={() => setEmail(false)} />
      <CloseModal fu={close ? fu : undefined} initial={close === "open" ? "" : close} onClose={() => setClose(undefined)} />
      <OptOutModal propertyId={optOut ? fu.propertyId : undefined} onClose={() => setOptOut(false)} />
      <ReconsentModal propertyId={reconsent ? fu.propertyId : undefined} onClose={() => setReconsent(false)} />
      <ReopenFollowUpModal fu={reopen ? fu : undefined} requalify={reopen === "requalify"} onClose={() => setReopen(undefined)} />
      <LinkRepaintModal fu={linkJob ? fu : undefined} onClose={() => setLinkJob(false)} />
    </>
  );
}
