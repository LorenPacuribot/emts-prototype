"use client";
/**
 * Feature 22 — Time and Payroll (office review, component 22.2).
 * Menu: Workforce > Time and Payroll
 *
 * Everything that must be settled before time can be exported is visible
 * here: flags grouped by type, disputes with their route, and the time that
 * will stay out of the export because it isn't approved.
 *
 * Layout follows the live Contacts page: four stat cards, one timesheet card
 * grouped by employee, and two list cards. Text is 15px, labels 12–13px.
 */
import { useState, type ReactNode } from "react";
import { CheckCheck, ChevronRight, ClipboardList, FileSpreadsheet, Send } from "lucide-react";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { byId } from "@/features/lib/selectors";
import { now } from "@/features/lib/clock";
import { toast } from "@/features/lib/toast";
import { cn } from "@/features/lib/cn";
import { AppLink, useParam } from "@/features/lib/navigation";
import { hm, missingTimeDays } from "@/features/lib/rules/payroll";
import { approveMany, employeeWeek, entryFlags, entrySegments, entryTotals, submitWeek, weekEntries } from "@/features/lib/store/actions/workforce";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Button, Card, EmptyState } from "@/features/components/ui";
import { WorkforceFrame } from "./workforce-frame";
import { EntryDrawer } from "./entry-drawer";
import { ENTRY_STATE, EntryStateBadge, JobChips, WeekSelect, dayLabel, employeeTypeLabel, thisWeek, timeLabel } from "./shared";
import { addDaysToDay } from "@/features/lib/rules/payroll";

type Filter = "all" | "approval" | "conflict" | "no_lunch" | "dispute" | "unattested" | "location";

/** 48px header buttons, tightened on phones so two fit side by side. */
const phoneBtn = "min-w-0 px-3 text-sm sm:px-5 sm:text-base";

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

  // Display-only groupings of the rows above (no new maths).
  const totalMin = sum(rows);
  const attention = count("dispute") + count("unattested") + count("conflict");
  const groups: { emp: (typeof rows)[number]["emp"]; list: typeof rows }[] = [];
  for (const r of shown) {
    const last = groups[groups.length - 1];
    if (last && last.emp.id === r.emp.id) last.list.push(r);
    else groups.push({ emp: r.emp, list: [r] });
  }
  const filterOptions: { value: Filter; label: string }[] = [
    { value: "all", label: "All days" },
    { value: "approval", label: "Needs approval" },
    { value: "conflict", label: "Offline conflicts" },
    { value: "no_lunch", label: "No lunch" },
    { value: "dispute", label: "Disputes" },
    { value: "unattested", label: "Unattested" },
    { value: "location", label: "Location denied" },
  ];
  const scrollToExcluded = () => document.getElementById("excluded-from-export")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <>
      <PageHeader
        title="Time and Payroll"
        lead
        subtitle="Approve clocked time before it goes to Gusto." details="Only approved hours reach job costing and the payroll export."
        actions={
          // Phone: week select full width, the buttons two to a row under it. Wide screens: one row.
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap lg:flex-nowrap">
            <WeekSelect value={week} onChange={setWeek} className="col-span-2 h-12 w-full sm:w-auto" />
            {can(user, "time.submit") && user.role === "crew_lead" && (
              <Button size="lg" className={phoneBtn} onClick={() => { const r = act(submitWeek, week); if (r.ok) toast.success(`${r.value} day${r.value === 1 ? "" : "s"} submitted`, "Unattested days are marked for the office."); }}>
                <Send className="hidden h-4 w-4 sm:block" /> Submit Week
              </Button>
            )}
            {can(user, "time.approve") && <Button size="lg" className={phoneBtn} onClick={approveAll}><CheckCheck className="hidden h-4 w-4 sm:block" /> Approve all shown</Button>}
            {can(user, "payroll.batch") && (
              <AppLink href={`/time/batches?week=${week}`} className="min-w-0"><Button size="lg" variant="primary" className={cn(phoneBtn, "w-full")}><FileSpreadsheet className="hidden h-4 w-4 sm:block" /> Create export batch</Button></AppLink>
            )}
          </div>
        }
      />

      {user.role === "crew_lead" && (
        <div role="status" className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-5 py-3.5 text-[15px] text-blue-900">
          You see your crew's hours. Pay figures are never shown to crew leads, on screen or in downloads.
        </div>
      )}

      {/* Four stat cards: 2×2 on phones, one row on wide screens. */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:gap-5 xl:grid-cols-4">
        <StatTile label="Total hours" value={hm(totalMin)}>
          {rows.length} day{rows.length === 1 ? "" : "s"} · rounded daily totals
        </StatTile>
        <StatTile label="Approved" value={hm(approvedMin)} valueClass="text-green-700">
          <div className="h-2 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={`${totalMin ? Math.round((approvedMin / totalMin) * 100) : 0}% of hours approved`}>
            <div className="h-full rounded-full bg-green-600" style={{ width: `${totalMin ? Math.min(100, (approvedMin / totalMin) * 100) : 0}%` }} />
          </div>
          <div className="mt-2 font-semibold text-amber-700">{hm(pendingMin)} pending approval</div>
        </StatTile>
        <StatTile label="Needs attention" value={attention} valueClass={attention ? "text-red-700" : undefined} className={attention ? "border-red-300" : undefined}>
          <ul className="space-y-0.5">
            {([["dispute", "Disputed"], ["unattested", "Unattested"], ["conflict", "Offline conflicts"]] as const).map(([f, label]) => (
              <li key={f}>
                <button
                  type="button"
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                  className={cn("-mx-1.5 flex w-[calc(100%+0.75rem)] items-center justify-between rounded-md px-1.5 py-0.5 text-left hover:bg-gray-50", filter === f && "bg-primary-50 text-primary-700")}
                >
                  <span>{label}</span>
                  <span className={cn("font-bold tabular-nums", count(f) ? "text-ink" : "text-gray-500")}>{count(f)}</span>
                </button>
              </li>
            ))}
          </ul>
        </StatTile>
        <StatTile label="Excluded from export" value={hm(sum(excluded))} valueClass={excluded.length ? "text-amber-700" : undefined}>
          <div>Hourly time not approved yet</div>
          <button type="button" onClick={scrollToExcluded} className="mt-1 font-semibold text-primary-700 hover:underline">
            See the list
          </button>
        </StatTile>
      </div>

      {missing.length > 0 && (
        <div role="status" className="mb-6 flex flex-col gap-1 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5 text-[15px] text-amber-900 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p className="min-w-0">
            <strong>Missing time:</strong>{" "}
            {missing.map((m) => `${m.emp.name} has no hours for ${m.days.map((d) => dayLabel(d)).join(", ")}`).join("; ")}.
          </p>
          <span className="shrink-0 text-[13px] text-amber-800">Flagged Monday 7 a.m. · cutoff 9 a.m.</span>
        </div>
      )}

      <Card className="overflow-hidden" data-tour="timesheet-grid">
        {/* Card header: filters on the left, the count on the right. */}
        <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 md:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div role="group" aria-label="Filter days" className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
            {filterOptions.map((o) => {
              const on = filter === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setFilter(o.value)}
                  aria-pressed={on}
                  className={cn(
                    "flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors md:h-10",
                    on ? "border-primary-300 bg-primary-50 text-primary-700" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                  )}
                >
                  {o.label}
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold tabular-nums", on ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600")}>{count(o.value)}</span>
                </button>
              );
            })}
          </div>
          <p className="shrink-0 text-sm text-gray-500" aria-live="polite">Showing {shown.length} of {rows.length} days</p>
        </div>

        {shown.length === 0 ? (
          <div className="p-4 md:p-6">
            <EmptyState icon={<ClipboardList />} title="No time in this view" body={rows.length ? "Try another filter." : "Nobody has clocked time in this week yet."} />
          </div>
        ) : (
          <div>
            {/* Column labels (desktop only). */}
            <div className="hidden grid-cols-[7.5rem_minmax(9rem,1fr)_minmax(10rem,1fr)_minmax(0,1.4fr)_minmax(10rem,1.1fr)_1.25rem] gap-4 bg-gray-50 px-6 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-gray-500 md:grid" aria-hidden>
              <span>Day</span><span>Punches</span><span>Hours</span><span>Jobs</span><span>Status</span><span />
            </div>
            {groups.map(({ emp, list }) => (
              <section key={emp.id} aria-label={emp.name} className="px-4 pb-4 md:px-0 md:pb-0">
                <div className="flex items-center justify-between gap-3 py-4 md:border-t md:border-gray-200 md:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-bold text-primary-700" aria-hidden>{initialsOf(emp.name)}</span>
                    <div className="min-w-0">
                      <div className="truncate text-[17px] font-bold text-ink">{emp.name}</div>
                      <div className="text-[13px] text-gray-500">{employeeTypeLabel(emp.type)}</div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-[15px] text-gray-600">
                    {list.length} day{list.length === 1 ? "" : "s"} · <span className="font-bold tabular-nums text-ink">{hm(sum(list))}</span> rounded
                  </div>
                </div>
                <div className="space-y-2 md:space-y-0">
                  {list.map(({ e, totals, flags }) => {
                    const segs = entrySegments(db, e).filter((s) => !s.supersededAt);
                    const range = `${timeLabel(segs[0]?.start)} – ${segs.every((s) => s.end) ? timeLabel(segs[segs.length - 1]?.end) : "now"}`;
                    const punches = `${segs.length} punch${segs.length === 1 ? "" : "es"}`;
                    const split = `${hm(totals.workedMinutes)} worked${totals.lunchMinutes ? ` · ${hm(totals.lunchMinutes)} lunch` : ""}`;
                    const status = (
                      <>
                        <EntryStateBadge state={e.state} />
                        {flags[0] && <Badge tone={flags[0].tone}>{flags[0].label}</Badge>}
                        {flags.length > 1 && <span className="text-xs font-semibold text-gray-500">+{flags.length - 1} more</span>}
                      </>
                    );
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setOpenId(e.id)}
                        aria-label={`Open ${emp.name}, ${dayLabel(e.workDate)}: ${hm(totals.roundedMinutes)} rounded, ${ENTRY_STATE[e.state].label}${flags.length ? `, ${flags.map((f) => f.label).join(", ")}` : ""}`}
                        className="block w-full rounded-xl border border-gray-200 bg-white p-4 text-left text-[15px] transition-colors hover:bg-gray-50 md:grid md:grid-cols-[7.5rem_minmax(9rem,1fr)_minmax(10rem,1fr)_minmax(0,1.4fr)_minmax(10rem,1.1fr)_1.25rem] md:items-center md:gap-4 md:rounded-none md:border-0 md:border-t md:border-gray-100 md:px-6 md:py-3.5"
                      >
                        {/* Phone card */}
                        <span className="flex items-baseline justify-between gap-3 md:hidden">
                          <span className="font-semibold text-ink">{dayLabel(e.workDate)}</span>
                          <span className="text-lg font-bold tabular-nums text-ink">{hm(totals.roundedMinutes)}</span>
                        </span>
                        <span className="mt-1 block text-sm text-gray-600 md:hidden">
                          <span className="tabular-nums">{range}</span> · {punches}
                          <span className="block text-gray-500">{split}</span>
                        </span>
                        <span className="mt-3 flex flex-wrap items-center gap-1.5 md:hidden">
                          {status}
                        </span>
                        <span className="mt-2 block md:hidden"><JobChips rows={totals.byJob} large /></span>

                        {/* Desktop row */}
                        <span className="hidden font-semibold text-ink md:block">{dayLabel(e.workDate)}</span>
                        <span className="hidden md:block">
                          <span className="block tabular-nums text-gray-800">{range}</span>
                          <span className="block text-[13px] text-gray-500">{punches}</span>
                        </span>
                        <span className="hidden md:block">
                          <span className="block font-bold tabular-nums text-ink">{hm(totals.roundedMinutes)}</span>
                          <span className="block text-[13px] tabular-nums text-gray-500">{split}</span>
                        </span>
                        <span className="hidden min-w-0 md:block"><JobChips rows={totals.byJob} large /></span>
                        <span className="hidden flex-wrap items-center gap-1.5 md:flex">{status}</span>
                        <ChevronRight className="hidden h-5 w-5 text-gray-400 md:block" aria-hidden />
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-6 grid gap-5 xl:grid-cols-2 [&>*]:min-w-0">
        <Card className="p-5 md:p-7" id="excluded-from-export">
          <h2 className="font-heading text-xl font-bold text-ink">Excluded from export</h2>
          <p className="mt-1 text-[15px] text-gray-500">Hourly time that isn't approved stays out of the Gusto file and stays visible here until it is settled.</p>
          {excluded.length === 0 ? (
            <p className="mt-4 text-[15px] text-gray-500">Every hourly day this week is approved.</p>
          ) : (
            <ul className="mt-4">
              {excluded.map((r) => (
                <li key={r.e.id} className="border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setOpenId(r.e.id)}
                    className="-mx-2 flex w-[calc(100%+1rem)] flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-3 text-left text-[15px] hover:bg-gray-50"
                  >
                    <span>
                      <strong className="text-ink">{r.emp.name}</strong> · {dayLabel(r.e.workDate)} · <span className="tabular-nums">{hm(r.totals.roundedMinutes)}</span>
                    </span>
                    <Badge tone={r.flags[0]?.tone ?? (r.e.state === "open" ? "gray" : "blue")}>
                      {r.flags[0]?.label ?? (r.e.state === "open" ? "Not submitted" : "Awaiting approval")}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {payrollDetail ? (
          <Card className="p-5 md:p-7">
            <h2 className="font-heading text-xl font-bold text-ink">Weekly classification</h2>
            <p className="mt-1 text-[15px] text-gray-500">Overtime starts above 40 hours and lands on the last hours of the week, on the jobs where they fell. Gusto validates the categories.</p>
            <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Regular and overtime by employee">
              <table className="w-full text-left text-[15px]">
                <thead>
                  <tr className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
                    <th className="pb-2 pr-4 font-bold">Employee</th>
                    <th className="pb-2 pr-4 text-right font-bold">Regular</th>
                    <th className="pb-2 pr-4 text-right font-bold">Overtime</th>
                    <th className="pb-2 font-bold">Overtime on</th>
                  </tr>
                </thead>
                <tbody>
                  {weekClass.map(({ emp, w }) => {
                    const otJobs = w.days.flatMap((d) => d.jobs.filter((j) => j.overtime > 0).map((j) => `${j.jobId ?? "Overhead"} (${dayLabel(d.workDate)})`));
                    return (
                      <tr key={emp.id} className="border-t border-gray-100 align-top">
                        <td className="whitespace-nowrap py-3 pr-4 font-semibold text-ink">{emp.name}</td>
                        <td className="py-3 pr-4 text-right tabular-nums">{hm(w.regular)}</td>
                        <td className={cn("py-3 pr-4 text-right tabular-nums", w.overtime ? "font-bold text-amber-700" : "")}>{hm(w.overtime)}</td>
                        <td className="py-3 text-sm text-gray-500">{otJobs.join(", ") || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card className="p-5 md:p-7">
            <h2 className="font-heading text-xl font-bold text-ink">Weekly classification</h2>
            <p className="mt-1 text-[15px] text-gray-500">Regular and overtime classification is payroll detail, shown to the office manager and business owner.</p>
          </Card>
        )}
      </div>

      <EntryDrawer entryId={openId} onClose={() => setOpenId(undefined)} />
    </>
  );
}

/** Stat card in the live StatCard look: 13px uppercase label, 34px number. */
function StatTile({ label, value, valueClass, className, children }: { label: string; value: ReactNode; valueClass?: string; className?: string; children?: ReactNode }) {
  return (
    <Card className={cn("flex flex-col p-4 md:p-7", className)}>
      <div className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500 md:text-[13px]">{label}</div>
      <div className={cn("mt-2 font-heading text-[26px] font-extrabold leading-none tabular-nums text-ink md:text-[34px]", valueClass)}>{value}</div>
      {children && <div className="mt-3 text-sm text-gray-500 md:text-[15px]">{children}</div>}
    </Card>
  );
}

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}
