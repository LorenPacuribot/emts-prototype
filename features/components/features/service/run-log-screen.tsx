"use client";
/**
 * Feature 27 — Nightly Run Log.
 * Menu: Service > Run Log
 * Each run: timestamp, alerts created, records skipped, failures and the catch-up result.
 */
import { useState } from "react";
import { CheckCircle2, History, Inbox, Moon, OctagonAlert } from "lucide-react";
import type { RunLogEntry } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { resolveRunFailure } from "@/features/lib/store/actions/service";
import { byId } from "@/features/lib/selectors";
import { can } from "@/features/lib/permissions";
import { dateTime } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Button, Card, CardLabel, Drawer, EmptyState, IdChip, KV, Stat, StatStrip, Table, TD, TH, THead, TR } from "@/features/components/ui";
import { ServiceFrame } from "./service-frame";
import { RunControls, RunFailureBanner } from "./run-controls";
import { Section } from "./shared";

export function RunLogScreen() {
  return (
    <ServiceFrame tab="run-log">
      <RunLog />
    </ServiceFrame>
  );
}

function RunLog() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [open, setOpen] = useState<RunLogEntry>();
  const runs = db.runLog;
  const last = runs[0];
  const lastOk = runs.find((r) => !r.failed);
  const unresolved = runs.filter((r) => r.failed && !r.resolvedAt).length;
  const current = open ? byId(db.runLog, open.id) : undefined;

  return (
    <>
      <PageHeader
        title="Run Log"
        subtitle="The nightly job runs at 2 a.m. local time. A failed run stays visible until the office marks it resolved; the next run catches up without duplicates."
        actions={<RunControls />}
      />
      <RunFailureBanner className="mb-4" />
      <StatStrip className="mb-4">
        <Stat label="Last run" value={<span className="text-[15px]">{last ? dateTime(last.ranAt) : "—"}</span>} hint={last ? (last.failed ? "Failed" : "Success") : undefined} tone={last?.failed ? "danger" : "default"} />
        <Stat label="Last successful run" value={<span className="text-[15px]">{lastOk ? dateTime(lastOk.ranAt) : "—"}</span>} />
        <Stat label="Unresolved failures" value={unresolved} tone={unresolved ? "danger" : "good"} />
        <Stat label="Runs recorded" value={runs.length} />
        <Stat label="Customer messages sent by runs" value={0} hint="Alerts are internal only" tone="good" />
      </StatStrip>
      <Card className="p-4">
        <CardLabel icon={<History />}>Nightly runs</CardLabel>
        {runs.length === 0 ? (
          <EmptyState className="mt-4" icon={<Inbox />} title="No runs recorded yet" body="Use Run now to simulate the 2 a.m. job." />
        ) : (
          <Table className="mt-3">
            <THead>
              <tr>
                <TH>Run</TH>
                <TH>Timestamp</TH>
                <TH>Status</TH>
                <TH>Alerts created</TH>
                <TH>Skipped</TH>
                <TH>Failures</TH>
                <TH>Catch-up result</TH>
                <TH>Data gaps</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {runs.map((r) => (
                <TR key={r.id} className="cursor-pointer" onClick={() => setOpen(r)}>
                  <TD><IdChip>{r.id}</IdChip></TD>
                  <TD className="whitespace-nowrap">{dateTime(r.ranAt)}</TD>
                  <TD>
                    {r.failed ? (
                      <Badge tone={r.resolvedAt ? "gray" : "red"} icon={<OctagonAlert className="h-3 w-3" />}>{r.resolvedAt ? "Failed · resolved" : "Failed"}</Badge>
                    ) : (
                      <Badge tone="green" icon={<CheckCircle2 className="h-3 w-3" />}>Success</Badge>
                    )}
                  </TD>
                  <TD className="font-semibold text-ink">{r.created}</TD>
                  <TD>{r.skipped}</TD>
                  <TD>{r.failures ?? (r.failed ? 1 : 0)}</TD>
                  <TD className="max-w-[280px] whitespace-normal text-[12px]">{r.catchUpResult ?? (r.failed ? (runs.find((x) => x.catchUpOf?.includes(r.id)) ? `Caught up by ${runs.find((x) => x.catchUpOf?.includes(r.id))!.id}` : "Pending next run") : "—")}</TD>
                  <TD>{r.unresolved?.length ? <Badge tone="amber">{r.unresolved.length}</Badge> : "—"}</TD>
                  <TD onClick={(e) => e.stopPropagation()}>
                    {r.failed && !r.resolvedAt && can(user, "alerts.queue") && (
                      <Button size="sm" onClick={() => act(resolveRunFailure, r.id).ok && toast.success("Failure marked resolved")}>Mark resolved</Button>
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Drawer open={!!current} onOpenChange={(v) => !v && setOpen(undefined)} title={<span className="flex items-center gap-2"><Moon className="h-4 w-4 text-brand" /> Nightly run {current?.id}</span>} subtitle={current ? dateTime(current.ranAt) : undefined}>
        {current && (
          <>
            <KV
              items={[
                ["Status", current.failed ? (current.resolvedAt ? `Failed — resolved by ${byId(db.users, current.resolvedBy)?.name} ${dateTime(current.resolvedAt)}` : "Failed — unresolved") : "Success"],
                ["Alerts created", current.created],
                ["Records skipped", current.skipped],
                ["Failures", current.failures ?? (current.failed ? 1 : 0)],
                ["Catch-up", current.catchUpResult ?? "—"],
                ["Started by", current.by ? byId(db.users, current.by)?.name : "Scheduler (2 a.m.)"],
                ["Summary", current.note],
              ]}
            />
            {!!current.details?.length && (
              <Section title="Details">
                <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-slate-700">
                  {current.details.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </Section>
            )}
            {!!current.unresolved?.length && (
              <Section title="Unresolved surfaces (data gaps)">
                <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-amber-800">
                  {current.unresolved.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </Section>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
