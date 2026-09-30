"use client";
/**
 * Patent §34 — Marketing automations: estimate follow-up, review request,
 * seasonal reminder, referral request and re-engagement. Turn each on or off
 * (confirmed; turning on is the owner's decision), edit its template and
 * delay, see who is due today (dueAutomationTargets) and "Run now". Sends are
 * sandbox: each one is logged in the run history and the customer's
 * communication history, opted-out customers are skipped, and nobody is
 * messaged twice by the same automation.
 */
import { useMemo, useState } from "react";
import { Pencil, Play, Plus, Workflow } from "lucide-react";
import type { AutomationRun, MarketingAutomation } from "@/features/types/marketing-growth";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can, whoCan } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { now } from "@/features/lib/clock";
import { dateLong, dateTime } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { AUTOMATION_LABEL, dueAutomationTargets, fillTemplate, SERVICE_LABEL } from "@/features/lib/rules/marketing-growth";
import { SMS_MAX } from "@/features/lib/store/actions/marketing-growth";
import { addStandardAutomations, runAutomation, saveAutomation, setAutomationActive } from "@/features/lib/store/actions/marketing-engage";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Banner, Button, Card, EmptyState, Field, Input, Modal, PillTabs, Select, Table, TD, Textarea, TH, THead, TR } from "@/features/components/ui";
import { MarketingFrame } from "./marketing-frame";
import { errFor, GatedButton, SectionTitle, TAP, TAP_SCOPE, useConfirm, type FieldErr } from "./growth-shared";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const RUN_LABEL: Record<AutomationRun["status"], string> = { sent: "Sent", sandbox: "Sent (sandbox)", failed: "Failed", skipped_opt_out: "Skipped: opted out", skipped_no_address: "Skipped: no address" };
const PLACEHOLDERS: Record<MarketingAutomation["kind"], string> = {
  estimate_follow_up: "{{first_name}}, {{name}}, {{estimate}}", review_request: "{{first_name}}, {{name}}, {{job}}", seasonal_reminder: "{{first_name}}, {{name}}",
  referral_request: "{{first_name}}, {{name}}, {{job}}, {{code}} (their referral code)", reengagement: "{{first_name}}, {{name}}",
};
const usesDelay = (k: MarketingAutomation["kind"]) => k === "estimate_follow_up" || k === "review_request" || k === "referral_request";

function triggerText(a: MarketingAutomation): string {
  const days = `${a.delayDays} day${a.delayDays === 1 ? "" : "s"}`;
  if (a.kind === "estimate_follow_up") return `${days} after an estimate is sent and not yet answered`;
  if (a.kind === "review_request") return `${days} after a job is completed, if no review or request yet`;
  if (a.kind === "referral_request") return `${days} after a job is completed`;
  if (a.kind === "seasonal_reminder") return `Each year from ${MONTHS[(a.seasonMonth ?? 1) - 1]} ${a.seasonDay ?? 1}, to customers who had ${a.seasonServices?.length ? a.seasonServices.map((s) => SERVICE_LABEL[s].toLowerCase()).join(" or ") : "any job"}`;
  return `Customers with no job or enquiry for ${a.inactiveDays ?? 365} days, once a year`;
}

export function AutomationsScreen() {
  return <MarketingFrame tab="automations"><Automations /></MarketingFrame>;
}

function Automations() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [editing, setEditing] = useState<MarketingAutomation>();
  const [showDue, setShowDue] = useState<string>();
  const [historyFor, setHistoryFor] = useState("all");
  const { setConfirm, dialog } = useConfirm();
  const autos = db.mktAutomations ?? [];
  const runs = db.mktAutomationRuns ?? [];
  const canPost = can(user, "marketing.post");
  const canApprove = can(user, "marketing.approve");
  const postReason = `Needs ${whoCan("marketing.post")}.`;
  const ownerReason = `Only the ${whoCan("marketing.approve")} can start messages to customers.`;
  const due = useMemo(() => new Map(autos.map((a) => [a.id, dueAutomationTargets(db, a, now())])), [db, autos]);

  const toggle = (a: MarketingAutomation) => setConfirm({
    title: a.active ? `Turn off ${a.name}?` : `Turn on ${a.name}?`, label: a.active ? "Turn off" : "Turn on", tone: a.active ? "danger" : "primary",
    body: a.active ? (
      <ul className="list-disc space-y-1 pl-5"><li>No more {a.channel === "email" ? "emails" : "text messages"} go out from this automation.</li><li>The run history is kept. You can turn it on again later.</li></ul>
    ) : (
      <ul className="list-disc space-y-1 pl-5">
        <li>Sends by {a.channel === "email" ? "email" : "SMS"}: {triggerText(a)}.</li>
        <li>It runs each day. Customers who opted out are skipped and logged; nobody gets it twice.</li>
        <li>Sandbox: messages are recorded, not delivered. You can turn it off at any time.</li>
      </ul>
    ),
    run: () => { if (act(setAutomationActive, a.id, !a.active).ok) toast.success(`${a.name} turned ${a.active ? "off" : "on"}`, a.active ? "No more messages go out from it." : `${dueAutomationTargets(db, { ...a, active: true }, now()).length} due today. Use Run now to send them.`); },
  });
  const runNow = (a: MarketingAutomation) => {
    const targets = due.get(a.id) ?? [];
    const send = targets.filter((t) => !t.optedOut && t.to);
    const skip = targets.length - send.length;
    setConfirm({
      title: `Run ${a.name} now?`, label: `Send to ${send.length}`,
      body: (
        <ul className="list-disc space-y-1 pl-5">
          <li>{send.length} {a.channel === "email" ? "emails" : "text messages"}: {send.slice(0, 6).map((t) => t.name).join(", ")}{send.length > 6 ? `, and ${send.length - 6} more` : ""}.</li>
          <li>{skip} skipped and logged (opted out or no {a.channel === "email" ? "email" : "mobile number"}).</li>
          <li>Each one is added to the run history and the customer&apos;s communication history.</li>
          <li>Sandbox: nothing is delivered. <b>This can&apos;t be undone</b>, and these customers won&apos;t get this automation again.</li>
        </ul>
      ),
      run: () => {
        const r = act(runAutomation, a.id, "manual");
        if (r.ok) { const v = r.value as { sent: number; skipped: number }; toast.success(`${a.name} sent to ${v.sent} ${v.sent === 1 ? "customer" : "customers"}`, `${v.skipped} skipped. Sandbox: recorded in the run history, nothing delivered.`); }
      },
    });
  };
  const addStandard = () => { const r = act(addStandardAutomations); if (r.ok) toast.success(`${r.value} automations added`, "They are off. Edit the wording, then ask the owner to turn them on."); };
  const shownRuns = historyFor === "all" ? runs : runs.filter((r) => r.automationId === historyFor);

  return (
    <>
      <PageHeader title="Automations" subtitle="Messages that go out on their own when something happens." details="For example when an estimate goes unanswered, a job is finished, a season starts, or a customer has gone quiet." />
      <Banner tone="info" className="mb-4" title="Sandbox">Messages are recorded in the run history and the customer&apos;s history; no email or SMS provider is called. Opted-out customers are always skipped.</Banner>
      {autos.length === 0 ? (
        <EmptyState icon={<Workflow />} title="No automations yet" body="Add the five standard automations (estimate follow-up, review request, seasonal reminder, referral request, re-engagement). They start switched off." action={<GatedButton allowed={canPost} reason={postReason} variant="primary" onClick={addStandard}><Plus className="h-4 w-4" /> Add standard automations</GatedButton>} />
      ) : (
        <div className="mb-6 grid gap-3 lg:grid-cols-2 [&>*]:min-w-0">
          {autos.map((a) => {
            const targets = due.get(a.id) ?? [];
            const sent = runs.filter((r) => r.automationId === a.id && (r.status === "sandbox" || r.status === "sent")).length;
            return (
              <Card key={a.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-ink">{a.name}</div>
                    <div className="text-xs text-gray-500">{AUTOMATION_LABEL[a.kind]} · {a.channel === "email" ? "Email" : "SMS"} · {a.id}</div>
                  </div>
                  <Badge tone={a.active ? "green" : "gray"}>{a.active ? "On" : "Off"}</Badge>
                </div>
                <p className="mt-2 text-xs text-gray-700">{triggerText(a)}.</p>
                <p className="mt-1 text-xs text-gray-500">{a.active ? <><b className="text-ink">{targets.length}</b> due today</> : "Off — nobody is due"} · {sent} sent in total{a.lastRunAt ? ` · last run ${dateLong(a.lastRunAt)}` : ""}</p>
                <div className={`mt-3 flex flex-wrap gap-2 ${TAP_SCOPE}`}>
                  <GatedButton allowed={a.active ? canPost : canApprove} reason={a.active ? postReason : ownerReason} size="sm" variant={a.active ? "ghost" : "primary"} onClick={() => toggle(a)}>{a.active ? "Turn off" : "Turn on"}</GatedButton>
                  <GatedButton allowed={canPost} reason={postReason} size="sm" onClick={() => setEditing(a)}><Pencil className="h-3.5 w-3.5" /> Edit template</GatedButton>
                  {a.active && (
                    <GatedButton allowed={canApprove && targets.length > 0} reason={!canApprove ? ownerReason : "Nobody is due today."} size="sm" variant="primary" onClick={() => runNow(a)}><Play className="h-3.5 w-3.5" /> Run now ({targets.length})</GatedButton>
                  )}
                  {a.active && targets.length > 0 && <Button size="sm" variant="ghost" className={TAP} aria-expanded={showDue === a.id} onClick={() => setShowDue(showDue === a.id ? undefined : a.id)}>{showDue === a.id ? "Hide who is due" : "Show who is due"}</Button>}
                </div>
                {showDue === a.id && (
                  <ul className="mt-3 divide-y divide-line rounded-lg border border-line text-xs">
                    {targets.map((t) => (
                      <li key={t.targetKey} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                        <span><b className="text-ink">{t.name}</b> · {t.reason}</span>
                        {t.optedOut ? <Badge tone="amber">Opted out — will be skipped</Badge> : !t.to ? <Badge tone="amber">No {a.channel === "email" ? "email" : "mobile"} — will be skipped</Badge> : <span className="text-gray-500">{t.to}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {autos.length > 0 && (
        <Card className="p-4">
          <SectionTitle right={
            <div className="w-56"><label htmlFor="run-filter" className="sr-only">Show runs for</label>
              <Select id="run-filter" value={historyFor} onChange={(e) => setHistoryFor(e.target.value)}><option value="all">All automations</option>{autos.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
            </div>
          }>Run history ({shownRuns.length})</SectionTitle>
          {shownRuns.length === 0 ? <p className="text-xs text-gray-500">Nothing has been sent yet. Runs appear here with who received each message and who was skipped.</p> : (
            <div className="overflow-x-auto">
              <Table className="relative">
                <THead><tr><TH>When</TH><TH>Automation</TH><TH>Customer</TH><TH>To</TH><TH>Result</TH><TH>How</TH><TH>Message ID</TH></tr></THead>
                <tbody>
                  {shownRuns.slice(0, 100).map((r) => (
                    <TR key={r.id}>
                      <TD className="whitespace-nowrap">{dateTime(r.at)}</TD>
                      <TD className="min-w-40">{byId(autos, r.automationId)?.name ?? r.automationId}</TD>
                      <TD>{r.name}</TD>
                      <TD>{r.to ?? "—"}</TD>
                      <TD><Badge tone={r.status === "sandbox" || r.status === "sent" ? "green" : r.status === "failed" ? "red" : "gray"}>{RUN_LABEL[r.status]}</Badge></TD>
                      <TD className="whitespace-nowrap">{r.trigger === "manual" ? "Run now" : r.trigger === "daily" ? "Daily run" : "Recommendation"}</TD>
                      <TD className="font-mono text-xs">{r.messageId ?? "—"}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card>
      )}
      {editing && <AutomationForm auto={editing} sample={(due.get(editing.id) ?? [])[0]?.vars} onClose={() => setEditing(undefined)} />}
      {dialog}
    </>
  );
}

function AutomationForm({ auto, sample, onClose }: { auto: MarketingAutomation; sample?: Record<string, string>; onClose: () => void }) {
  const [f, setF] = useState({
    channel: auto.channel, delayDays: String(auto.delayDays), subject: auto.subject ?? "", body: auto.body, seasonMonth: String(auto.seasonMonth ?? 3), seasonDay: String(auto.seasonDay ?? 1), inactiveDays: String(auto.inactiveDays ?? 365),
  });
  const [err, setErr] = useState<FieldErr>();
  const e = (k: string) => errFor(err, k);
  const vars = sample ?? { first_name: "Alex", name: "Alex Morgan", estimate: "EST-2026-1", job: "Standard Exterior Repaint", code: "ALEX150" };
  const submit = () => {
    const r = act(saveAutomation, auto.id, {
      channel: f.channel, delayDays: f.delayDays.trim() === "" ? NaN : Number(f.delayDays), subject: f.subject, body: f.body, seasonMonth: Number(f.seasonMonth), seasonDay: Number(f.seasonDay), inactiveDays: Number(f.inactiveDays),
    });
    if (!r.ok) return setErr({ field: r.field, message: r.error });
    toast.success(`${auto.name} saved`, auto.active ? "The next run uses the new wording." : "It's still off.");
    onClose();
  };
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} size="lg" title={`Edit ${auto.name}`} description={`${AUTOMATION_LABEL[auto.kind]}. Placeholders: ${PLACEHOLDERS[auto.kind]}.`}
      footer={<><Button className={TAP} onClick={onClose}>Cancel</Button><Button className={TAP} variant="primary" onClick={submit}>Save automation</Button></>}>
      <div className={`space-y-3 ${TAP_SCOPE}`}>
        <PillTabs value={f.channel} onChange={(c) => setF({ ...f, channel: c })} options={[{ value: "email", label: "Email" }, { value: "sms", label: "SMS" }]} />
        <div className="grid gap-3 sm:grid-cols-3">
          {usesDelay(auto.kind) && <Field label="Send after (days)" htmlFor="au-delay" required error={e("delayDays")}><Input id="au-delay" type="number" min={0} max={365} step={1} value={f.delayDays} invalid={!!e("delayDays")} onChange={(x) => setF({ ...f, delayDays: x.target.value })} /></Field>}
          {auto.kind === "seasonal_reminder" && (
            <>
              <Field label="Month" htmlFor="au-month" error={e("seasonMonth")}><Select id="au-month" value={f.seasonMonth} onChange={(x) => setF({ ...f, seasonMonth: x.target.value })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Select></Field>
              <Field label="Day of month" htmlFor="au-day" error={e("seasonDay")} hint="1 to 28"><Input id="au-day" type="number" min={1} max={28} step={1} value={f.seasonDay} invalid={!!e("seasonDay")} onChange={(x) => setF({ ...f, seasonDay: x.target.value })} /></Field>
            </>
          )}
          {auto.kind === "reengagement" && <Field label="No activity for (days)" htmlFor="au-inactive" error={e("inactiveDays")} hint="At least 30"><Input id="au-inactive" type="number" min={30} step={1} value={f.inactiveDays} invalid={!!e("inactiveDays")} onChange={(x) => setF({ ...f, inactiveDays: x.target.value })} /></Field>}
        </div>
        {f.channel === "email" && <Field label="Subject" htmlFor="au-subj" required error={e("subject")}><Input id="au-subj" value={f.subject} invalid={!!e("subject")} onChange={(x) => setF({ ...f, subject: x.target.value })} /></Field>}
        <Field label="Message" htmlFor="au-body" required error={e("body")} hint={f.channel === "sms" ? `${f.body.length} of ${SMS_MAX} characters. Must include "Reply STOP to opt out".` : 'Must say how to unsubscribe, e.g. "Reply UNSUBSCRIBE to stop these emails."'}>
          <Textarea id="au-body" className="min-h-36" value={f.body} invalid={!!e("body")} onChange={(x) => setF({ ...f, body: x.target.value })} />
        </Field>
        <div className="rounded-lg border border-line bg-gray-50 p-3 text-xs">
          <div className="mb-1 font-semibold text-gray-700">Preview for {vars.name}</div>
          {f.channel === "email" && f.subject && <div className="font-semibold text-ink">{fillTemplate(f.subject, vars)}</div>}
          <div className="whitespace-pre-wrap text-gray-600">{fillTemplate(f.body, vars)}</div>
        </div>
        {err && !["delayDays", "subject", "body", "seasonMonth", "seasonDay", "inactiveDays"].includes(err.field ?? "") && <Banner tone="danger">{err.message}</Banner>}
      </div>
    </Modal>
  );
}
