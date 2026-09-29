"use client";
/**
 * Component 24.4 — the office manager's daily 7 a.m. exception list.
 * Failed downstream actions grouped by type (with retry for the missing
 * action only), plus undeliverable, unsigned and emergency-overdue items.
 */
import { useEffect } from "react";
import { AlertOctagon, CalendarClock, ClipboardList, Clock3, ListChecks, MailX, Receipt, RefreshCw, Scale, ShieldAlert, Siren, Wrench } from "lucide-react";
import type { ChangeOrder, DownstreamKey } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { AppLink } from "@/features/lib/navigation";
import { can, whoCan } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { date, dateLong, dateTime, relDays } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { now } from "@/features/lib/clock";
import { undeliverableStatus, writtenConfirmationStatus } from "@/features/lib/rules/change-orders";
import { coLinkState, currentLink, DOWNSTREAM_KEYS, DOWNSTREAM_LABEL, retryDownstream, runDailyChecks } from "@/features/lib/store/actions/change-orders";
import { PanelHeader as PageHeader } from "@/features/components/features/contacts/details/panel-header";
import { Badge, Banner, Button, Card, CardLabel, EmptyState, IdChip, Stat, StatStrip, Table, TD, TH, THead, TR } from "@/features/components/ui";
import { coHref } from "./shared";

const ICON: Record<DownstreamKey, React.ReactNode> = {
  work_order: <Wrench />,
  materials: <ClipboardList />,
  scheduler: <CalendarClock />,
  billing: <Receipt />,
};


function listTime(nowIso: string) {
  const d = new Date(nowIso);
  d.setHours(7, 0, 0, 0);
  return d.toISOString();
}

/** NEW (feature 24): opened from the Change Order Exceptions dashboard widget. */
export function ChangeOrderExceptionsPanel() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  useEffect(() => {
    act(runDailyChecks);
  }, []);
  const nowIso = now();

  if (!can(user, "co.exceptions")) {
    return (
      <>
        <PageHeader title="Change Order Exceptions" subtitle="Daily 7 a.m. list for the office manager." />
        <EmptyState icon={<ShieldAlert />} title="Not available for your role" body={`The exception list is for the ${whoCan("co.exceptions")}. Switch role in the demo bar.`} />
      </>
    );
  }

  const cos = db.changeOrders.filter((c) => !c.isColourReapproval);
  const failures = DOWNSTREAM_KEYS.map((k) => ({ key: k, items: cos.filter((c) => c.downstream[k] === "failed") }));
  const failCount = failures.reduce((a, g) => a + g.items.length, 0);
  const undeliverable = cos.filter((c) => c.status === "sent" && currentLink(c)?.delivery === "undeliverable");
  const unsigned = cos.filter((c) => {
    const l = currentLink(c);
    if (c.status !== "sent" || !l || l.delivery === "undeliverable") return false;
    const st = coLinkState(c, l, nowIso);
    const daysLeft = (new Date(l.expiresAt).getTime() - new Date(nowIso).getTime()) / 86_400_000;
    return st !== "active" || daysLeft <= 30;
  });
  const emergency = cos.filter((c) => c.emergency && !c.emergency.writtenConfirmedAt);
  const overdue = emergency.filter((c) => writtenConfirmationStatus(c.emergency!.verbalAt, undefined, nowIso).state === "overdue");
  const disputed = cos.filter((c) => c.status === "disputed");

  return (
    <>
      <PageHeader
        eyebrow={<Badge tone="indigo" icon={<Clock3 className="h-3 w-3" />}>Produced {dateTime(listTime(nowIso))}</Badge>}
        title="Change Order Exceptions"
        subtitle="The office manager's daily 7 a.m. list across all jobs. Retry runs only the missing action; succeeded actions are never reapplied."
      />
      <StatStrip className="mb-4">
        <Stat label="Failed downstream actions" value={failCount} tone={failCount ? "danger" : "good"} />
        <Stat label="Undeliverable" value={undeliverable.length} tone={undeliverable.length ? "danger" : "good"} />
        <Stat label="Awaiting signature" value={unsigned.length} tone={unsigned.length ? "warn" : "good"} />
        <Stat label="Emergency written due" value={emergency.length} hint={`${overdue.length} overdue`} tone={overdue.length ? "danger" : emergency.length ? "warn" : "good"} />
        <Stat label="Disputed (owner)" value={disputed.length} tone={disputed.length ? "danger" : "good"} />
      </StatStrip>

      <div className="space-y-4">
        <Card className="p-5">
          <CardLabel icon={<AlertOctagon />}>Failed downstream actions</CardLabel>
          {failCount === 0 ? (
            <EmptyState className="mt-4" icon={<ListChecks />} title="No failed downstream actions." body="Every approved change reached production, purchasing, scheduling and billing." />
          ) : (
            <div className="mt-4 space-y-4">
              {failures.filter((g) => g.items.length).map((g) => (
                <div key={g.key}>
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-gray-400">
                    {ICON[g.key]} {DOWNSTREAM_LABEL[g.key]} <Badge tone="red">{g.items.length}</Badge>
                  </div>
                  <Table>
                    <THead>
                      <tr>
                        <TH>Change order</TH>
                        <TH>Job</TH>
                        <TH>Failed at</TH>
                        <TH>Error</TH>
                        <TH>Other actions</TH>
                        <TH />
                      </tr>
                    </THead>
                    <tbody>
                      {g.items.map((c) => (
                        <TR key={c.id}>
                          <TD><CoLink co={c} /></TD>
                          <TD>{c.jobId}</TD>
                          <TD>{dateTime(c.downstreamMeta?.[g.key]?.at)}</TD>
                          <TD className="w-56 min-w-56 max-w-64 whitespace-normal text-red-700">{c.downstreamMeta?.[g.key]?.error ?? "Failed"}</TD>
                          <TD className="w-56 min-w-56 max-w-64 whitespace-normal">
                            <span className="text-xs text-gray-500">
                              {DOWNSTREAM_KEYS.filter((k) => k !== g.key).map((k) => `${DOWNSTREAM_LABEL[k]}: ${c.downstream[k] === "done" ? "done (locked)" : c.downstream[k].replace("_", " ")}`).join(" · ")}
                            </span>
                          </TD>
                          <TD>
                            <Button size="sm" variant="primary" onClick={() => act(retryDownstream, c.id, g.key).ok && toast.success(`${DOWNSTREAM_LABEL[g.key]} retried for ${c.id}`, "Only the missing action ran.")}>
                              <RefreshCw className="h-3.5 w-3.5" /> Retry
                            </Button>
                          </TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="p-5">
            <CardLabel icon={<MailX />}>Undeliverable approval messages</CardLabel>
            <List
              empty="No bounced messages."
              items={undeliverable.map((c) => {
                const l = currentLink(c)!;
                const u = undeliverableStatus(l.deliveryFailedAt ?? l.sentAt, nowIso);
                return {
                  co: c,
                  detail: `${l.recipient} · ${l.deliveryError ?? "bounced"} · flagged ${dateLong(l.deliveryFailedAt)}`,
                  badge: l.escalatedAt || u.escalate ? <Badge tone="red">Escalated to owner</Badge> : <Badge tone="amber">Office flagged · owner after {date(`${u.escalateAfter}T12:00:00`)}</Badge>,
                };
              })}
            />
          </Card>
          <Card className="p-5">
            <CardLabel icon={<Siren />}>Emergency — written confirmation</CardLabel>
            <List
              empty="No emergency work awaiting written confirmation."
              items={emergency.map((c) => {
                const s = writtenConfirmationStatus(c.emergency!.verbalAt, undefined, nowIso);
                return {
                  co: c,
                  detail: `Verbal ${dateTime(c.emergency!.verbalAt)} · due end of ${date(`${s.dueDay}T12:00:00`)}${c.emergency!.customerCalledAt ? " · customer called" : ""}`,
                  badge: s.state === "overdue" ? <Badge tone="red">Work stopped · owner escalated</Badge> : <Badge tone="amber">{s.workingDaysLeft} working day{s.workingDaysLeft === 1 ? "" : "s"} left</Badge>,
                };
              })}
            />
          </Card>
          <Card className="p-5">
            <CardLabel icon={<Clock3 />}>Unsigned — awaiting the customer</CardLabel>
            <List
              empty="Nothing awaiting signature."
              items={unsigned.map((c) => {
                const l = currentLink(c)!;
                const st = coLinkState(c, l, nowIso);
                return {
                  co: c,
                  detail: `v${l.version} sent ${date(l.sentAt)} to ${l.recipientName} · link expires ${date(l.expiresAt)} (${relDays(l.expiresAt, nowIso)})`,
                  badge: st === "expired" ? <Badge tone="amber">Expired · reissue</Badge> : st === "signer_changed" ? <Badge tone="amber">New link required</Badge> : <Badge tone="blue">Awaiting</Badge>,
                };
              })}
            />
          </Card>
          <Card className="p-5">
            <CardLabel icon={<Scale />}>Disputed — referred to the owner</CardLabel>
            <List
              empty="No disputed change orders."
              items={disputed.map((c) => ({ co: c, detail: `${c.dispute?.note ?? ""} (${dateLong(c.dispute?.at)})`, badge: <Badge tone="red">Owner</Badge> }))}
            />
          </Card>
        </div>
        <Banner tone="info">Undeliverable messages are flagged to the office the same day and escalate to the business owner after two working days. Crews are never rescheduled automatically from this list.</Banner>
      </div>
    </>
  );
}

function CoLink({ co }: { co: ChangeOrder }) {
  const db = useDb((d) => d);
  const job = byId(db.jobs, co.jobId);
  return (
    <AppLink href={coHref(db, co)} className="group block">
      <IdChip tone="blue">{co.id}</IdChip>
      <div className="mt-0.5 max-w-60 truncate text-xs font-medium text-ink group-hover:text-brand">{co.title}</div>
      <div className="text-xs text-gray-500">{job?.name}</div>
    </AppLink>
  );
}

function List({ items, empty }: { items: { co: ChangeOrder; detail: string; badge: React.ReactNode }[]; empty: string }) {
  if (items.length === 0) return <EmptyState className="mt-4" title={empty} />;
  return (
    <div className="mt-3 divide-y divide-line">
      {items.map((i) => (
        <div key={i.co.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
          <div className="min-w-0">
            <CoLink co={i.co} />
            <div className="mt-1 text-xs text-gray-500">{i.detail}</div>
          </div>
          {i.badge}
        </div>
      ))}
    </div>
  );
}
