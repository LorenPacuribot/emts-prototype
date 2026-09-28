"use client";
/**
 * Feature 27 — Repaint Alerts queue.
 * Menu: Service > Repaint Alerts
 *
 * Summary strip, queue filter (Live, Backlog, Snoozed, Escalated, Suppressed),
 * one row per property opportunity, alert detail drawer, backlog panel and
 * the data-gap list of surfaces with no completion date.
 */
import { useMemo, useState } from "react";
import { BellRing, BookOpen, CircleSlash, Download, History, Inbox, Layers } from "lucide-react";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { qualifyBacklogBatch } from "@/features/lib/store/actions/service";
import {
  BACKLOG_BATCH_MAX, alertEscalation, alertQueueState, clockSource, findDuplicateFollowUp, type QueueState,
} from "@/features/lib/rules/alerts";
import { byId, propertyAddress, surfaceLabel } from "@/features/lib/selectors";
import { can } from "@/features/lib/permissions";
import { date, dateTime } from "@/features/lib/format";
import { now } from "@/features/lib/clock";
import { downloadCsv } from "@/features/lib/export";
import { toast } from "@/features/lib/toast";
import { AppLink, useParam } from "@/features/lib/navigation";
import { PageHeader } from "@/features/components/layout/screen";
import {
  Badge, Banner, Button, Card, CardLabel, Checkbox, EmptyState, Field, IdChip, Input, PillTabs, RowMenu, Stat, StatStrip, Table, TD, TH, THead, TR,
} from "@/features/components/ui";
import { ServiceFrame } from "./service-frame";
import { AlertDrawer } from "./alert-drawer";
import { RunControls, RunFailureBanner } from "./run-controls";
import { EscalationBadge, NoticeBadge, OptOutBadge, PropertyCell, SuppressionBadge } from "./shared";

type Filter = "live" | "backlog" | "snoozed" | "escalated" | "suppressed" | "resolved";

export function AlertsScreen() {
  return (
    <ServiceFrame tab="alerts">
      <AlertsQueue />
    </ServiceFrame>
  );
}

function AlertsQueue() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const initial = useParam("alert");
  const [filter, setFilter] = useState<Filter>("live");
  const [open, setOpen] = useState<string | undefined>(initial);
  const t = now();

  const rows = useMemo(
    () =>
      db.repaintAlerts.map((a) => {
        const st = alertQueueState(db, a, t);
        return { a, st, esc: alertEscalation(a, t), optOut: !!byId(db.properties, a.propertyId)?.optOut };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db],
  );
  const is = (s: QueueState) => rows.filter((r) => r.st.state === s);
  const counts: Record<Filter, number> = {
    live: is("live").length,
    backlog: is("backlog").length,
    snoozed: is("snoozed").length,
    escalated: rows.filter((r) => r.st.escalated).length,
    suppressed: is("suppressed").length,
    resolved: is("resolved").length,
  };
  const shown = rows
    .filter((r) => (filter === "escalated" ? r.st.escalated : r.st.state === filter))
    .sort((x, y) => Number(y.st.escalated) - Number(x.st.escalated) || x.a.earliestDue.localeCompare(y.a.earliestDue));
  const lastOk = db.runLog.find((r) => !r.failed);
  const openCount = rows.filter((r) => r.st.state === "live" || r.st.state === "suppressed").filter((r) => !r.a.backlog).length;

  const gaps = useMemo(() => {
    return db.surfaces
      .filter((s) => !s.removedAt)
      .map((s) => ({ s, src: clockSource(db.applications.filter((x) => x.surfaceId === s.id)) }))
      .filter((x) => !x.src.app && x.src.unresolved);
  }, [db]);

  function exportCsv() {
    downloadCsv(`repaint-alerts-${filter}.csv`, [
      ["Alert", "Property", "Address", "Earliest due", "Window end", "Surfaces", "Notice basis", "Age (days)", "Escalated", "Owner", "Suppression", "Opt-out", "Outcome"],
      ...shown.map(({ a, st, esc, optOut }) => [
        a.id, a.propertyId, propertyAddress(byId(db.properties, a.propertyId)), date(a.earliestDue), date(a.windowEnd), a.surfaces.length, a.noticeBasis, esc.age,
        st.escalated ? "Yes" : "No", byId(db.users, a.ownerId ?? "U-OFFICE")?.name, st.suppression?.label ?? "", optOut ? "Yes" : "", a.outcome,
      ]),
    ]);
    toast.success("CSV exported", `${shown.length} alerts downloaded.`);
  }

  return (
    <>
      <PageHeader
        eyebrow={<Badge tone="green">Internal only</Badge>}
        title="Repaint Alerts"
        subtitle="Surfaces entering their advance-notice window, grouped into one opportunity per property. A person reviews every one before any contact."
        actions={
          <>
            <AppLink href="/repaint-alerts/run-log"><Button><History className="h-4 w-4" /> Run Log</Button></AppLink>
            <AppLink href="/settings/repaint-intervals"><Button><BookOpen className="h-4 w-4" /> Lifespan Library</Button></AppLink>
            <Button onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>
            <RunControls />
          </>
        }
      />

      <RunFailureBanner className="mb-4" />
      {!can(user, "alerts.queue") && (
        <Banner tone="info" className="mb-4" title="View only">
          The office manager owns this queue and records outcomes. You can open alerts and propose inspection extensions.
        </Banner>
      )}

      <StatStrip className="mb-4">
        <Stat label="Open alerts" value={openCount} hint="live queue, incl. suppressed" tone="brand" />
        <Stat label="Escalated" value={counts.escalated} hint="to the business owner" tone={counts.escalated ? "danger" : "good"} />
        <Stat label="Snoozed" value={counts.snoozed} />
        <Stat label="Backlog remaining" value={counts.backlog} hint="imported overdue" tone={counts.backlog ? "warn" : "good"} />
        <Stat label="Last successful run" value={<span className="text-[15px]">{lastOk ? dateTime(lastOk.ranAt) : "—"}</span>} hint={lastOk ? `${lastOk.id} · ${lastOk.created} created` : undefined} />
      </StatStrip>

      <PillTabs
        className="mb-4"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "live", label: "Live", count: counts.live },
          { value: "backlog", label: "Backlog", count: counts.backlog },
          { value: "snoozed", label: "Snoozed", count: counts.snoozed },
          { value: "escalated", label: "Escalated", count: counts.escalated },
          { value: "suppressed", label: "Suppressed", count: counts.suppressed },
          { value: "resolved", label: "Resolved", count: counts.resolved },
        ]}
      />

      {filter === "backlog" ? (
        <BacklogPanel rows={shown.map((r) => r.a)} onOpen={setOpen} />
      ) : (
        <Card className="p-4" data-tour="alerts-table">
          {shown.length === 0 ? (
            <EmptyState icon={<Inbox />} title={`No ${filter} alerts`} body={filter === "live" ? "Run the nightly job to check for surfaces entering their notice window." : "Nothing in this view right now."} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Property</TH>
                  <TH>Earliest due</TH>
                  <TH>Window end</TH>
                  <TH>Surfaces</TH>
                  <TH>Notice basis</TH>
                  <TH>Age</TH>
                  <TH>Escalation</TH>
                  <TH>Owner</TH>
                  <TH>Suppression</TH>
                  <TH />
                </tr>
              </THead>
              <tbody>
                {shown.map(({ a, st, esc, optOut }) => (
                  <TR key={a.id} className={`cursor-pointer ${st.state === "suppressed" ? "bg-slate-50 text-slate-500" : ""}`} onClick={() => setOpen(a.id)}>
                    <TD>
                      <div className="flex items-start gap-2">
                        <IdChip>{a.id}</IdChip>
                        <PropertyCell db={db} propertyId={a.propertyId} />
                      </div>
                    </TD>
                    <TD className="font-semibold text-ink">{date(a.earliestDue)}</TD>
                    <TD>{date(a.windowEnd)}</TD>
                    <TD>{a.surfaces.length}</TD>
                    <TD><NoticeBadge basis={a.noticeBasis} /></TD>
                    <TD>{esc.age} d</TD>
                    <TD>{st.state === "resolved" ? <span className="text-[11.5px] text-slate-400">—</span> : <EscalationBadge escalated={st.escalated} age={esc.age} daysLeft={esc.running ? esc.daysLeft : undefined} />}</TD>
                    <TD>{byId(db.users, a.ownerId ?? (st.escalated ? "U-OWNER" : "U-OFFICE"))?.name}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        <SuppressionBadge s={st.suppression} />
                        {optOut && <OptOutBadge />}
                        {st.state === "snoozed" && <Badge tone="amber">Until {date(a.snoozeUntil)}</Badge>}
                        {st.state === "resolved" && <Badge tone={a.outcome === "converted" ? "green" : "gray"}>{a.qualification?.decision === "rejected" ? "Rejected" : a.outcome === "converted" ? `Converted · ${a.qualification?.followUpId ?? ""}` : "Dismissed"}</Badge>}
                      </div>
                    </TD>
                    <TD onClick={(e) => e.stopPropagation()}>
                      <RowMenu items={[{ label: "Open detail", icon: <Layers />, onSelect: () => setOpen(a.id) }]} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      <Card className="mt-4 p-4">
        <CardLabel icon={<CircleSlash />}>Data gaps — no completion date</CardLabel>
        <p className="mt-1 text-[12px] text-slate-500">These surfaces cannot be scheduled. No expected date is ever invented for them.</p>
        {gaps.length === 0 ? (
          <p className="mt-3 text-[12.5px] italic text-slate-400">Every painted surface has a completion date.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {gaps.map(({ s, src }) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-[12.5px]">
                <IdChip>{s.id}</IdChip>
                <span className="font-semibold text-ink">{surfaceLabel(db, s.id)}</span>
                <span className="text-slate-500">{propertyAddress(byId(db.properties, s.propertyId))}</span>
                <Badge tone="amber">Unresolved</Badge>
                <span className="text-[11.5px] text-slate-500">{src.unresolved?.id} · {src.unresolved?.source}. No completion date recorded. This surface cannot be scheduled.</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <AlertDrawer alertId={open} onClose={() => setOpen(undefined)} />
    </>
  );
}

function BacklogPanel({ rows, onOpen }: { rows: import("@/features/types").RepaintAlert[]; onOpen: (id: string) => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [sel, setSel] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string>();
  const t = now();
  const office = can(user, "followup.qualify");
  const info = rows.map((a) => ({
    a,
    dup: findDuplicateFollowUp(db, a.propertyId, a.surfaces.map((s) => s.surfaceId), t),
    st: alertQueueState(db, a, t),
  }));
  const selectable = info.filter((x) => !x.dup && !x.st.suppression);
  const toggle = (id: string, v: boolean) => {
    if (v && sel.length >= BACKLOG_BATCH_MAX) {
      toast.info(`Batch limit is ${BACKLOG_BATCH_MAX}`, "Qualify this batch first, then select the next.");
      return;
    }
    setSel((s) => (v ? [...s, id] : s.filter((x) => x !== id)));
  };
  const selectAll = () => setSel(selectable.slice(0, BACKLOG_BATCH_MAX).map((x) => x.a.id));
  const submit = () => {
    setErr(undefined);
    const res = act(qualifyBacklogBatch, sel, reason);
    if (!res.ok) return setErr(res.field === "reason" ? res.error : undefined);
    const v = res.value as { batchId: string; qualified: string[]; skipped: string[] };
    toast.success(`Backlog batch ${v.batchId} qualified`, `${v.qualified.length} follow-up${v.qualified.length === 1 ? "" : "s"} created${v.skipped.length ? `; skipped ${v.skipped.join(", ")}` : ""}.`);
    setSel([]);
    setReason("");
  };

  return (
    <Card className="p-4">
      <CardLabel icon={<BellRing />} right={<Badge tone="purple">{rows.length} remaining</Badge>}>Backlog — imported overdue records</CardLabel>
      <p className="mt-1 text-[12px] text-slate-500">Kept out of the live queue. Qualify individually or in batches of at most {BACKLOG_BATCH_MAX}. A property with an open follow-up is skipped.</p>
      {rows.length === 0 ? (
        <EmptyState className="mt-4" icon={<Inbox />} title="Backlog is clear" body="Every imported overdue record has been qualified or dismissed." />
      ) : (
        <>
          {office && (
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-line bg-slate-50/60 p-3 sm:flex-row sm:items-end">
              <div className="flex items-center gap-2 text-[12.5px]">
                <Button size="sm" onClick={selectAll}>Select eligible (max {BACKLOG_BATCH_MAX})</Button>
                <span className="font-semibold text-ink">{sel.length} / {BACKLOG_BATCH_MAX} selected</span>
              </div>
              <Field label="Batch reason" required error={err} className="flex-1">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} invalid={!!err} placeholder="e.g. Imported PaintScout history reviewed; owners current" />
              </Field>
              <Button variant="primary" disabled={!sel.length} onClick={submit}>Qualify batch</Button>
            </div>
          )}
          <Table className="mt-3">
            <THead>
              <tr>
                {office && <TH className="w-8" />}
                <TH>Property</TH>
                <TH>Earliest due</TH>
                <TH>Overdue</TH>
                <TH>Surfaces</TH>
                <TH>Duplicate follow-up</TH>
                <TH>Suppression</TH>
              </tr>
            </THead>
            <tbody>
              {info.map(({ a, dup, st }) => (
                <TR key={a.id} className="cursor-pointer" onClick={() => onOpen(a.id)}>
                  {office && (
                    <TD onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={sel.includes(a.id)} disabled={!!dup || !!st.suppression} onCheckedChange={(v) => toggle(a.id, v)} />
                    </TD>
                  )}
                  <TD>
                    <div className="flex items-start gap-2">
                      <IdChip>{a.id}</IdChip>
                      <PropertyCell db={db} propertyId={a.propertyId} />
                    </div>
                  </TD>
                  <TD className="font-semibold text-ink">{date(a.earliestDue)}</TD>
                  <TD>{Math.max(0, Math.floor((new Date(t).getTime() - new Date(a.earliestDue).getTime()) / 86_400_000))} d</TD>
                  <TD>{a.surfaces.length}</TD>
                  <TD>{dup ? <Badge tone="amber">Open {dup.id} — will skip</Badge> : <span className="text-[11.5px] text-slate-400">None</span>}</TD>
                  <TD><SuppressionBadge s={st.suppression} /></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </Card>
  );
}
