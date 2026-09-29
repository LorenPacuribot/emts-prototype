"use client";
/**
 * Feature 29 — Repainting Follow-Up Workflow.
 * Menu: Service > Follow-Ups
 *
 * Summary strip, queue filter (Unqualified, Qualified, Assigned, Overdue,
 * Escalated, Recycled, Closed), assignee filter, the follow-up list, the
 * qualification gate for unqualified alerts, and team availability.
 */
import { useMemo, useState } from "react";
import { BarChart3, CheckCircle2, Download, Inbox, PhoneCall, UserCog, UserPlus } from "lucide-react";
import type { FollowUp, RepaintAlert } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { setOutOfOffice } from "@/features/lib/store/actions/service";
import { alertEscalation, alertQueueState, followUpFlags, suppressionFor } from "@/features/lib/rules/alerts";
import { byId, propertyAddress } from "@/features/lib/selectors";
import { FOLLOWUP_STATUS } from "@/features/lib/status";
import { can, ROLE_LABEL } from "@/features/lib/permissions";
import { date } from "@/features/lib/format";
import { now } from "@/features/lib/clock";
import { downloadCsv } from "@/features/lib/export";
import { toast } from "@/features/lib/toast";
import { AppLink, useParam } from "@/features/lib/navigation";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Banner, Button, Card, CardLabel, EmptyState, IdChip, PillTabs, RowMenu, Select, Stat, StatStrip, Switch, Table, TD, TH, THead, TR } from "@/features/components/ui";
import { ServiceFrame } from "./service-frame";
import { FollowUpDrawer } from "./follow-up-drawer";
import { AssignModal } from "./follow-up-modals";
import { QualifyModal } from "./alert-modals";
import { AlertDrawer } from "./alert-drawer";
import { EscalationBadge, OptOutBadge, PropertyCell, SuppressionBadge } from "./shared";

type Filter = "unqualified" | "qualified" | "assigned" | "overdue" | "escalated" | "recycled" | "closed";

export function FollowUpsScreen() {
  return (
    <ServiceFrame tab="follow-ups">
      <FollowUps />
    </ServiceFrame>
  );
}

function FollowUps() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const office = can(user, "followup.qualify");
  const initialFu = useParam("fu");
  const [filter, setFilter] = useState<Filter>(initialFu ? "assigned" : office ? "unqualified" : "assigned");
  const [assignee, setAssignee] = useState<string>(office ? "all" : user.id);
  const [openFu, setOpenFu] = useState<string | undefined>(initialFu);
  const [openAlert, setOpenAlert] = useState<string>();
  const [qualify, setQualify] = useState<RepaintAlert>();
  const [assignFor, setAssignFor] = useState<FollowUp>();
  const t = now();

  const unqualified = useMemo(
    () => db.repaintAlerts.filter((a) => alertQueueState(db, a, t).state === "live").sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db],
  );
  const fus = useMemo(() => db.followUps.map((f) => ({ f, x: followUpFlags(db, f, t) })), [db, t]);
  const byAssignee = fus.filter(({ f }) => assignee === "all" || (assignee === "none" ? !f.assigneeId : f.assigneeId === assignee));
  const pick: Record<Exclude<Filter, "unqualified">, (x: (typeof fus)[number]["x"]) => boolean> = {
    qualified: (x) => x.unassigned,
    assigned: (x) => x.assigned,
    overdue: (x) => x.overdue,
    escalated: (x) => x.escalated,
    recycled: (x) => x.recycled,
    closed: (x) => x.closed && !x.recycled,
  };
  const count = (k: Exclude<Filter, "unqualified">) => byAssignee.filter(({ x }) => pick[k](x)).length;
  const rows = filter === "unqualified" ? [] : byAssignee.filter(({ x }) => pick[filter](x));
  const escalatedToOwner = unqualified.filter((a) => alertEscalation(a, t).escalated).length;
  const estimators = db.users.filter((u) => u.role === "senior_estimator" || u.role === "estimator");

  function exportCsv() {
    downloadCsv(`follow-ups-${filter}.csv`, [
      ["Follow-up", "Property", "Status", "Assignee", "Source alert date", "Qualified", "Attempts", "Next action", "Driving clock", "Clock source", "Opt-out"],
      ...byAssignee.map(({ f, x }) => [
        f.id, propertyAddress(byId(db.properties, f.propertyId)), FOLLOWUP_STATUS[f.status].label, byId(db.users, f.assigneeId)?.name ?? "Unassigned",
        date(byId(db.repaintAlerts, f.alertId)?.createdAt), date(f.qualifiedAt), `${x.attemptsMade}/3`, date(x.next), x.driving?.label ?? "—", date(x.driving?.source),
        byId(db.properties, f.propertyId)?.optOut ? "Yes" : "",
      ]),
    ]);
    toast.success("CSV exported", `${byAssignee.length} follow-ups downloaded.`);
  }

  return (
    <>
      <PageHeader
        title="Follow-Ups"
        subtitle="One property conversation per qualified alert. Calls are made by people, and every email needs a person to press send."
        actions={
          <>
            {office && <Button onClick={() => setFilter("qualified")}><UserPlus className="h-4 w-4" /> Assign</Button>}
            <AppLink href="/repaint-alerts/monthly-measures"><Button><BarChart3 className="h-4 w-4" /> Monthly Measures</Button></AppLink>
            <Button onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>
          </>
        }
      />

      <StatStrip className="mb-4">
        <Stat label="Unqualified alerts" value={unqualified.length} hint="waiting at the gate" tone="brand" />
        <Stat label="Qualified & unassigned" value={fus.filter(({ x }) => x.unassigned).length} tone={fus.some(({ x }) => x.unassigned) ? "warn" : "good"} />
        <Stat label="Assigned & overdue" value={fus.filter(({ x }) => x.overdue).length} tone={fus.some(({ x }) => x.overdue) ? "danger" : "good"} />
        <Stat label="Escalated to owner" value={escalatedToOwner} hint="unqualified alerts past 14 days (the Escalated tab lists follow-ups)" tone={escalatedToOwner ? "danger" : "good"} />
        <Stat label="Recycled" value={fus.filter(({ x }) => x.recycled).length} hint="for next season" />
      </StatStrip>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <PillTabs
          value={filter}
          onChange={setFilter}
          options={[
            ...(office ? [{ value: "unqualified" as const, label: "Unqualified", count: unqualified.length }] : []),
            { value: "qualified", label: "Qualified", count: count("qualified") },
            { value: "assigned", label: "Assigned", count: count("assigned") },
            { value: "overdue", label: "Overdue", count: count("overdue") },
            { value: "escalated", label: "Escalated", count: count("escalated") },
            { value: "recycled", label: "Recycled", count: count("recycled") },
            { value: "closed", label: "Closed", count: count("closed") },
          ]}
        />
        {filter !== "unqualified" && (
          <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="h-9 w-full lg:w-56" aria-label="Assignee filter">
            <option value="all">All assignees</option>
            <option value="none">Unassigned</option>
            {estimators.map((u) => <option key={u.id} value={u.id}>{u.name}{u.id === user.id ? " (me)" : ""}</option>)}
          </Select>
        )}
      </div>

      {filter === "unqualified" ? (
        <Card className="p-4" data-tour="followups-table">
          <CardLabel icon={<CheckCircle2 />}>Qualification gate</CardLabel>
          <p className="mt-1 text-xs text-gray-500">An alert alone never starts a contact sequence. Accept or reject each one with a reason.</p>
          {unqualified.length === 0 ? (
            <EmptyState className="mt-4" icon={<Inbox />} title="No alerts waiting" body="New alerts from the nightly run appear here." />
          ) : (
            <Table className="mt-3">
              <THead><tr><TH>Property</TH><TH>Alert date</TH><TH>Surfaces</TH><TH>Earliest due</TH><TH>Countdown to owner</TH><TH>Opt-out</TH><TH /></tr></THead>
              <tbody>
                {unqualified.map((a) => {
                  const esc = alertEscalation(a, t);
                  const optOut = byId(db.properties, a.propertyId)?.optOut;
                  return (
                    <TR key={a.id} className="cursor-pointer" onClick={() => setOpenAlert(a.id)}>
                      <TD><div className="flex items-start gap-2"><IdChip>{a.id}</IdChip><PropertyCell db={db} propertyId={a.propertyId} /></div></TD>
                      <TD>{date(a.createdAt)} <span className="text-xs text-gray-500">· {esc.age} d</span></TD>
                      <TD>{a.surfaces.length}</TD>
                      <TD className="font-semibold text-ink">{date(a.earliestDue)}</TD>
                      <TD><EscalationBadge escalated={esc.escalated} age={esc.age} daysLeft={esc.running ? esc.daysLeft : undefined} /></TD>
                      <TD>{optOut ? <OptOutBadge /> : "—"}</TD>
                      <TD onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="secondary" disabled={!!optOut} onClick={() => setQualify(a)}>Qualify</Button>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      ) : (
        <Card className="p-4" data-tour="followups-table">
          {rows.length === 0 ? (
            <EmptyState icon={<PhoneCall />} title={`No ${filter} follow-ups`} body={assignee !== "all" ? "Try All assignees." : "Nothing in this view right now."} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Property</TH><TH>Status</TH><TH>Assignee</TH><TH>Alert date</TH><TH>Qualified</TH><TH>Attempts</TH><TH>Next action</TH><TH>Active clock</TH><TH>Suppression / opt-out</TH><TH />
                </tr>
              </THead>
              <tbody>
                {rows.map(({ f, x }) => {
                  const st = FOLLOWUP_STATUS[f.status];
                  const p = byId(db.properties, f.propertyId);
                  const sup = suppressionFor(db, f.propertyId, { ignoreEstimateId: f.estimateId });
                  return (
                    <TR key={f.id} className="cursor-pointer" onClick={() => setOpenFu(f.id)}>
                      <TD><div className="flex items-start gap-2"><IdChip>{f.id}</IdChip><PropertyCell db={db} propertyId={f.propertyId} /></div></TD>
                      <TD><Badge tone={st.tone}>{st.label}</Badge></TD>
                      <TD>{f.assigneeId ? byId(db.users, f.assigneeId)?.name : <span className="font-semibold text-amber-700">Unassigned</span>}</TD>
                      <TD>{date(byId(db.repaintAlerts, f.alertId)?.createdAt)}</TD>
                      <TD>{date(f.qualifiedAt)}</TD>
                      <TD>{x.attemptsMade} / 3</TD>
                      <TD className={x.overdue ? "font-semibold text-red-600" : ""}>{x.closed ? "—" : date(x.next)}</TD>
                      <TD>
                        {x.driving ? (
                          <div>
                            <Badge tone={x.driving.escalated ? "red" : "blue"}>{x.driving.key === "unassigned" ? "Unassigned 3-day" : x.driving.key === "assigned" ? "Assigned 7-day" : "Alert 14-day"} · day {x.driving.days}</Badge>
                            <div className="mt-0.5 text-xs text-gray-500">from {date(x.driving.source)}</div>
                          </div>
                        ) : <span className="text-xs text-gray-500">Stopped</span>}
                      </TD>
                      <TD><div className="flex flex-wrap gap-1">{p?.optOut ? <OptOutBadge /> : <SuppressionBadge s={sup} />}</div></TD>
                      <TD onClick={(e) => e.stopPropagation()}>
                        <RowMenu items={[
                          { label: "Open", icon: <PhoneCall />, onSelect: () => setOpenFu(f.id) },
                          ...(office ? [{ label: f.assigneeId ? "Reassign" : "Assign", icon: <UserPlus />, onSelect: () => setAssignFor(f), disabled: x.closed, reason: "Closed" }] : []),
                        ]} />
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {office && (
        <Card className="mt-4 p-4" data-tour="team-availability">
          <CardLabel icon={<UserCog />}>Team availability</CardLabel>
          <p className="mt-1 text-xs text-gray-500">Marking an estimator out of office returns their open follow-ups to the queue at once. No clock pauses or resets.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {estimators.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
                <div className="text-xs">
                  <div className="font-semibold text-ink">{u.name}</div>
                  <div className="text-gray-500">{ROLE_LABEL[u.role]} · {u.area ?? "—"} area · {db.followUps.filter((f) => f.assigneeId === u.id && !followUpFlags(db, f, t).closed).length} open</div>
                </div>
                <Switch
                  checked={!!u.outOfOffice}
                  label={<span className="text-xs">{u.outOfOffice ? "Out of office" : "Available"}</span>}
                  onCheckedChange={(v) => {
                    const res = act(setOutOfOffice, u.id, v);
                    if (res.ok) toast.success(v ? `${u.name} is out of office` : `${u.name} is available`, v && (res.value as string[]).length ? `${(res.value as string[]).join(", ")} returned to the queue.` : undefined);
                  }}
                />
              </div>
            ))}
          </div>
        </Card>
      )}
      {!office && can(user, "followup.work") && (
        <Banner tone="info" className="mt-4">You see your own follow-ups by default. The office qualifies alerts and assigns the area estimator.</Banner>
      )}

      <FollowUpDrawer fuId={openFu} onClose={() => setOpenFu(undefined)} />
      <AlertDrawer alertId={openAlert} onClose={() => setOpenAlert(undefined)} />
      <QualifyModal alert={qualify} onClose={() => setQualify(undefined)} onDone={(id) => { if (id) { setFilter("qualified"); setOpenFu(id); } }} />
      <AssignModal fu={assignFor} onClose={() => setAssignFor(undefined)} />
    </>
  );
}
