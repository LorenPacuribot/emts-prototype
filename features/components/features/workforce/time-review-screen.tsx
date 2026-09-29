"use client";
/**
 * Feature 22 — Time And Payroll (office review, component 22.2).
 * Menu: Workforce > Time And Payroll
 *
 * Everything that must be settled before time can be exported is visible
 * here: flags grouped by type, disputes with their route, and the time that
 * will stay out of the export because it isn't approved.
 */
import { useState } from "react";
import { CheckCheck, ClipboardList, FileSpreadsheet, Send, TriangleAlert } from "lucide-react";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { now } from "@/features/lib/clock";
import { toast } from "@/features/lib/toast";
import { AppLink, useParam } from "@/features/lib/navigation";
import { hm, missingTimeDays } from "@/features/lib/rules/payroll";
import { approveMany, employeeWeek, entryFlags, entrySegments, entryTotals, submitWeek, weekEntries } from "@/features/lib/store/actions/workforce";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Banner, Button, Card, CardLabel, EmptyState, PillTabs, Stat, StatStrip, Table, TD, TH, THead, TR } from "@/features/components/ui";
import { WorkforceFrame } from "./workforce-frame";
import { EntryDrawer } from "./entry-drawer";
import { EntryStateBadge, JobChips, WeekSelect, dayLabel, thisWeek, timeLabel } from "./shared";
import { addDaysToDay } from "@/features/lib/rules/payroll";

type Filter = "all" | "approval" | "conflict" | "no_lunch" | "dispute" | "unattested" | "location";

export function TimeReviewScreen() {
  return (
    <WorkforceFrame tab="review">
      <Review />
    </WorkforceFrame>
  );
}

function Review() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [week, setWeek] = useState(useParam("week") ?? addDaysToDay(thisWeek(), -7));
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | undefined>(useParam("entry"));
  const nowIso = now();
  const payrollDetail = can(user, "time.payrollDetail");

  const entries = weekEntries(db, week).filter((e) => entrySegments(db, e).length > 0);
  const rows = entries
    .map((e) => ({ e, emp: byId(db.employees, e.employeeId)!, totals: entryTotals(db, e), flags: entryFlags(db, e) }))
    .filter((r) => r.emp)
    .sort((a, b) => a.emp.name.localeCompare(b.emp.name) || a.e.workDate.localeCompare(b.e.workDate));
  const has = (r: (typeof rows)[number], k: string) => r.flags.some((f) => f.key === k);
  const filters: Record<Filter, (r: (typeof rows)[number]) => boolean> = {
    all: () => true,
    approval: (r) => r.e.state === "submitted" || (r.e.state === "open" && r.emp.type !== "hourly"),
    conflict: (r) => has(r, "conflict"),
    no_lunch: (r) => has(r, "no_lunch"),
    dispute: (r) => has(r, "dispute"),
    unattested: (r) => has(r, "unattested"),
    location: (r) => has(r, "location"),
  };
  const shown = rows.filter(filters[filter]);
  const count = (f: Filter) => rows.filter(filters[f]).length;

  const sum = (list: typeof rows) => list.reduce((a, r) => a + r.totals.roundedMinutes, 0);
  const approvedMin = sum(rows.filter((r) => ["approved", "locked", "paid"].includes(r.e.state)));
  const pendingMin = sum(rows.filter((r) => r.e.state === "submitted" || r.e.state === "open"));
  const hourly = rows.filter((r) => r.emp.type === "hourly");
  const excluded = hourly.filter((r) => r.e.state === "submitted" || r.e.state === "open" || r.e.dispute?.status === "open");
  const missing = db.employees.map((emp) => ({ emp, days: missingTimeDays(emp, db.timeEntries, week, nowIso) })).filter((m) => m.days.length);

  const weekClass = payrollDetail
    ? [...new Set(hourly.map((r) => r.emp.id))].map((id) => ({ emp: byId(db.employees, id)!, w: employeeWeek(db, id, week) }))
    : [];

  const approveAll = () => {
    const res = act(approveMany, shown.map((r) => r.e.id));
    if (res.ok) {
      const v = res.value as { approved: number; skipped: string[] };
      toast.success(`${v.approved} day${v.approved === 1 ? "" : "s"} approved`, v.skipped.length ? `${v.skipped.length} skipped: conflicts, no-lunch decisions, disputes or entries you can't approve.` : undefined);
    }
  };

  return (
    <>
      <PageHeader
        title="Time And Payroll"
        subtitle="Clocked time, classified and approved before it goes to Gusto. Only approved hours reach job costing and the payroll export."
        actions={
          <>
            <WeekSelect value={week} onChange={setWeek} />
            {can(user, "time.submit") && user.role === "crew_lead" && (
              <Button onClick={() => { const r = act(submitWeek, week); if (r.ok) toast.success(`${r.value} day${r.value === 1 ? "" : "s"} submitted`, "Unattested days are marked for the office."); }}>
                <Send className="h-4 w-4" /> Submit Week
              </Button>
            )}
            {can(user, "time.approve") && <Button onClick={approveAll}><CheckCheck className="h-4 w-4" /> Approve all shown</Button>}
            {can(user, "payroll.batch") && (
              <AppLink href={`/time/batches?week=${week}`}><Button variant="primary"><FileSpreadsheet className="h-4 w-4" /> Create Export Batch</Button></AppLink>
            )}
          </>
        }
      />

      {user.role === "crew_lead" && <Banner tone="info" className="mb-4">You see your crew's hours. Pay figures are never shown to crew leads, on screen or in downloads.</Banner>}

      <StatStrip className="mb-4">
        <Stat label="Total hours" value={hm(sum(rows))} hint="rounded daily totals" />
        <Stat label="Approved" value={hm(approvedMin)} tone="good" />
        <Stat label="Pending" value={hm(pendingMin)} tone={pendingMin ? "warn" : "default"} />
        <Stat label="Disputed" value={count("dispute")} tone={count("dispute") ? "danger" : "good"} />
        <Stat label="Unattested" value={count("unattested")} tone={count("unattested") ? "warn" : "good"} />
        <Stat label="Conflicts" value={count("conflict")} tone={count("conflict") ? "danger" : "good"} />
        <Stat label="Excluded from export" value={hm(sum(excluded))} hint="hourly time not approved" tone={excluded.length ? "warn" : "good"} />
      </StatStrip>

      {missing.length > 0 && (
        <Banner tone="warn" className="mb-4" title="Missing time — flagged Monday 7 a.m., 9 a.m. cutoff">
          {missing.map((m) => `${m.emp.name}: ${m.days.map((d) => dayLabel(d)).join(", ")}`).join(" · ")}
        </Banner>
      )}

      <PillTabs<Filter>
        className="mb-4"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All days", count: rows.length },
          { value: "approval", label: "Needs approval", count: count("approval") },
          { value: "conflict", label: "Offline conflicts", count: count("conflict") },
          { value: "no_lunch", label: "No-lunch", count: count("no_lunch") },
          { value: "dispute", label: "Disputes", count: count("dispute") },
          { value: "unattested", label: "Unattested", count: count("unattested") },
          { value: "location", label: "Location denied", count: count("location") },
        ]}
      />

      <Card className="p-4" data-tour="timesheet-grid">
        {shown.length === 0 ? (
          <EmptyState icon={<ClipboardList />} title="No time in this view" body={rows.length ? "Try another filter." : "Nobody has clocked time in this week yet."} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Employee</TH><TH>Day</TH><TH>Punches</TH><TH>Worked</TH><TH>Lunch</TH><TH>Rounded</TH><TH>Jobs</TH><TH>State</TH><TH>Flags</TH>
              </tr>
            </THead>
            <tbody>
              {shown.map(({ e, emp, totals, flags }) => {
                const segs = entrySegments(db, e).filter((s) => !s.supersededAt);
                return (
                  <TR key={e.id} className="cursor-pointer" onClick={() => setOpenId(e.id)}>
                    <TD>
                      <div className="font-semibold text-ink">{emp.name}</div>
                      <div className="text-xs text-gray-400">{emp.type === "hourly" ? "Hourly" : emp.type === "salaried" ? "Salaried" : "Subcontractor"}</div>
                    </TD>
                    <TD className="whitespace-nowrap">{dayLabel(e.workDate)}</TD>
                    <TD className="whitespace-nowrap tabular-nums text-xs">{timeLabel(segs[0]?.start)} – {segs.every((s) => s.end) ? timeLabel(segs[segs.length - 1]?.end) : "now"}<div className="text-xs text-gray-400">{segs.length} punch{segs.length === 1 ? "" : "es"}</div></TD>
                    <TD className="tabular-nums">{hm(totals.workedMinutes)}</TD>
                    <TD className="tabular-nums">{totals.lunchMinutes ? `−${hm(totals.lunchMinutes)}` : "—"}</TD>
                    <TD className="tabular-nums font-bold text-ink">{hm(totals.roundedMinutes)}</TD>
                    <TD><JobChips rows={totals.byJob} /></TD>
                    <TD><EntryStateBadge state={e.state} /></TD>
                    <TD><div className="flex flex-wrap gap-1">{flags.map((f) => <Badge key={f.key} tone={f.tone}>{f.label}</Badge>)}</div></TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        <Card className="p-4">
          <CardLabel icon={<TriangleAlert />}>Excluded from export</CardLabel>
          <p className="mt-1 text-xs text-gray-500">Hourly time that isn't approved stays out of the Gusto file and stays visible here until it is settled.</p>
          <div className="mt-3 space-y-1.5">
            {excluded.length === 0 && <p className="text-xs italic text-gray-400">Every hourly day this week is approved.</p>}
            {excluded.map((r) => (
              <button key={r.e.id} onClick={() => setOpenId(r.e.id)} className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2 text-left text-xs hover:bg-gray-50">
                <span><strong>{r.emp.name}</strong> · {dayLabel(r.e.workDate)} · {hm(r.totals.roundedMinutes)}</span>
                <span className="text-xs text-gray-500">{r.flags[0]?.label ?? (r.e.state === "open" ? "Not submitted" : "Awaiting approval")}</span>
              </button>
            ))}
          </div>
        </Card>
        {payrollDetail ? (
          <Card className="p-4">
            <CardLabel>Weekly classification</CardLabel>
            <p className="mt-1 text-xs text-gray-500">Overtime starts above 40 hours and lands on the last hours of the week, on the jobs where they fell. Gusto validates the categories.</p>
            <Table className="mt-3">
              <THead><tr><TH>Employee</TH><TH className="text-right">Regular</TH><TH className="text-right">Overtime</TH><TH>Overtime on</TH></tr></THead>
              <tbody>
                {weekClass.map(({ emp, w }) => {
                  const otJobs = w.days.flatMap((d) => d.jobs.filter((j) => j.overtime > 0).map((j) => `${j.jobId ?? "Overhead"} (${dayLabel(d.workDate)})`));
                  return (
                    <TR key={emp.id}>
                      <TD className="font-semibold">{emp.name}</TD>
                      <TD className="text-right tabular-nums">{hm(w.regular)}</TD>
                      <TD className={`text-right tabular-nums ${w.overtime ? "font-bold text-amber-700" : ""}`}>{hm(w.overtime)}</TD>
                      <TD className="text-xs text-gray-500">{otJobs.join(", ") || "—"}</TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        ) : (
          <Card className="p-4">
            <CardLabel>Weekly classification</CardLabel>
            <p className="mt-2 text-xs text-gray-500">Regular and overtime classification is payroll detail, shown to the office manager and business owner.</p>
          </Card>
        )}
      </div>

      <EntryDrawer entryId={openId} onClose={() => setOpenId(undefined)} />
    </>
  );
}
