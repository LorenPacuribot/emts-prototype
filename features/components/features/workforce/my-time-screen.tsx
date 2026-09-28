"use client";
/**
 * Feature 22 — Employee screen: own entries for the week, Attest and Dispute.
 * Menu: Workforce > My Time
 *
 * Employees see only their own records. A dispute raised after Wednesday
 * noon goes to the business owner, and if the batch isn't created yet it
 * moves that one day to the next batch.
 */
import { useState } from "react";
import { BadgeCheck, Flag, UserRound } from "lucide-react";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { toast } from "@/features/lib/toast";
import { hm, isAttestationOverdue, attestationDue } from "@/features/lib/rules/payroll";
import { now } from "@/features/lib/clock";
import { attestDay, employeeFor, entryTotals, raiseDispute, weekEntries } from "@/features/lib/store/actions/workforce";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Banner, Button, Card, EmptyState, Field, Modal, Textarea } from "@/features/components/ui";
import { WorkforceFrame } from "./workforce-frame";
import { EntryStateBadge, JobChips, WeekSelect, dayLabel, thisWeek } from "./shared";
import { addDaysToDay } from "@/features/lib/rules/payroll";

export function MyTimeScreen() {
  return (
    <WorkforceFrame tab="my-time">
      <MyTime />
    </WorkforceFrame>
  );
}

function MyTime() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const emp = employeeFor(db, user);
  const [week, setWeek] = useState(addDaysToDay(thisWeek(), -7));
  const [disputing, setDisputing] = useState<string>();
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string>();

  if (!emp) {
    return (
      <>
        <PageHeader title="My Time" />
        <EmptyState icon={<UserRound />} title="No employee record for you" body="Your login isn't linked to an employee, so there is no time to show. The bookkeeper works from payroll results instead." />
      </>
    );
  }

  const entries = weekEntries(db, week).filter((e) => e.employeeId === emp.id).sort((a, b) => a.workDate.localeCompare(b.workDate));
  const total = entries.reduce((a, e) => a + entryTotals(db, e).roundedMinutes, 0);

  return (
    <>
      <PageHeader
        title="My Time"
        subtitle={`${emp.name} — your own days only. Attest each day by the end of the next working day, or dispute it.`}
        actions={<WeekSelect value={week} onChange={setWeek} />}
      />
      {emp.type !== "hourly" && <Banner tone="info" className="mb-4">{emp.type === "salaried" ? "You are salaried: your job-coded time costs jobs but is not exported to Gusto." : "Subcontractor hours are recorded for analysis with zero labour cost."}</Banner>}
      <Card className="mb-4 flex items-center justify-between p-4">
        <span className="text-[12.5px] text-slate-500">Week total (rounded daily)</span>
        <span className="font-display text-xl font-bold text-ink">{hm(total)}</span>
      </Card>
      <div className="space-y-2.5">
        {entries.length === 0 && <EmptyState title="No time this week" body="Days appear here once your crew lead clocks you in." />}
        {entries.map((e) => {
          const t = entryTotals(db, e);
          const overdue = isAttestationOverdue(e, now());
          return (
            <Card key={e.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-[15px] font-bold text-ink">{dayLabel(e.workDate)}</span>
                    <EntryStateBadge state={e.state} />
                    {e.attestedAt ? <Badge tone="green" icon={<BadgeCheck className="h-3 w-3" />}>Attested</Badge> : overdue ? <Badge tone="amber">Attestation overdue</Badge> : <Badge tone="gray">Attest by {attestationDue(e.workDate).toLocaleDateString("en-US", { weekday: "short" })}</Badge>}
                    {e.dispute?.status === "open" && <Badge tone="red">Disputed · {e.dispute.routedTo === "owner" ? "with the owner" : "with the crew lead and office"}</Badge>}
                  </div>
                  <div className="mt-1.5 text-[12.5px] text-slate-600">Worked {hm(t.workedMinutes)}{t.lunchMinutes ? ` · lunch −${hm(t.lunchMinutes)}` : ""} · <strong>{hm(t.roundedMinutes)}</strong></div>
                  <div className="mt-1.5"><JobChips rows={t.byJob} /></div>
                </div>
                <div className="flex gap-2">
                  {!e.attestedAt && (e.state === "open" || e.state === "submitted") && (
                    <Button size="sm" variant="primary" onClick={() => act(attestDay, e.id).ok && toast.success("Day attested")}><BadgeCheck className="h-3.5 w-3.5" /> Attest</Button>
                  )}
                  {e.dispute?.status !== "open" && e.state !== "locked" && e.state !== "paid" && (
                    <Button size="sm" onClick={() => { setDisputing(e.id); setNote(""); setErr(undefined); }}><Flag className="h-3.5 w-3.5" /> Dispute</Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Modal
        open={!!disputing}
        onOpenChange={(v) => !v && setDisputing(undefined)}
        size="sm"
        title="Dispute this day"
        description="Before Wednesday noon it goes to your crew lead and the office manager; after that, to the business owner."
        footer={
          <>
            <Button onClick={() => setDisputing(undefined)}>Cancel</Button>
            <Button variant="primary" onClick={() => {
              const r = act(raiseDispute, disputing!, note);
              if (r.ok) {
                const v = r.value as { routedTo: string; moveToNextBatch: boolean };
                toast.success("Dispute raised", v.routedTo === "owner" ? `Sent to the business owner.${v.moveToNextBatch ? " This day moves to next week's batch — nobody else's pay is delayed." : ""}` : "Sent to your crew lead and the office manager.");
                setDisputing(undefined);
              } else setErr(r.error);
            }}>Raise dispute</Button>
          </>
        }
      >
        <Field label="What's wrong?" required error={err}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} invalid={!!err} placeholder="e.g. I clocked out at 4:30, not 4:00" />
        </Field>
      </Modal>
    </>
  );
}
