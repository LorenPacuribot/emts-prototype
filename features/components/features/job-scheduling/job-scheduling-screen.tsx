"use client";
/**
 * Job Scheduling — live route /job-scheduling, the v2 screen behind the
 * `new-job-scheduling` flag (features/(main)/job-scheduling/v2).
 *
 * Rebuilt only as far as feature 22 needs:
 * - Job view: this week's scheduled work orders by day, plus Unscheduled Jobs.
 * - Crew › Hours: the live CrewHoursGrid (Member, Capacity, one column per
 *   day with job chips and "{assigned} / {capacity}h").
 *   NEW (22): each day also shows the hours actually clocked, and how many
 *   of them are approved. Only approved hours count for payroll and job cost.
 */
import { useMemo, useState } from "react";
import { Briefcase, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { useDb } from "@/features/lib/store";
import { AppLink } from "@/features/lib/navigation";
import { workOrderHref } from "@/features/lib/hrefs";
import { addDaysToDay, localDay, weekStartOf } from "@/features/lib/rules/payroll";
import { now } from "@/features/lib/clock";
import { byId } from "@/features/lib/selectors";
import { cn } from "@/features/lib/cn";
import { Screen } from "@/features/components/layout/screen";
import { NewBadge, Tooltip } from "@/features/components/ui";

const JOB_COLORS = ["bg-blue-500", "bg-emerald-500", "bg-purple-500", "bg-amber-500", "bg-pink-500", "bg-cyan-600"];
const DAY_CAPACITY = 9; // live: 9h workday (8 to 17)

export function JobSchedulingScreen() {
  const db = useDb((d) => d);
  const [view, setView] = useState<"job" | "crew">("crew");
  const [weekStart, setWeekStart] = useState(weekStartOf(localDay(new Date(now()))));
  const days = Array.from({ length: 7 }, (_, i) => addDaysToDay(weekStart, i));
  const colour = (jobId: string) => JOB_COLORS[db.jobs.findIndex((j) => j.id === jobId) % JOB_COLORS.length];

  // Assigned hours per member per day, from work-order shifts (live WOShift dayAllocations).
  const assigned = useMemo(() => {
    const m = new Map<string, { jobId: string; hours: number; start: string; end: string }[]>();
    for (const wo of db.workOrders.filter((w) => w.status !== "COMPLETED")) {
      for (const s of wo.shifts) {
        const [h1, m1] = s.startTime.split(":").map(Number);
        const [h2, m2] = s.endTime.split(":").map(Number);
        const hrs = Math.max(0, h2 + m2 / 60 - h1 - m1 / 60 - 1);
        for (const d of days) {
          const dow = new Date(`${d}T12:00:00`).getDay();
          if (d < s.startDate.slice(0, 10) || d > s.endDate.slice(0, 10) || dow === 0) continue;
          for (const id of s.memberIds) {
            const k = `${id}|${d}`;
            m.set(k, [...(m.get(k) ?? []), { jobId: wo.jobId, hours: hrs, start: s.startTime, end: s.endTime }]);
          }
        }
      }
    }
    return m;
  }, [db.workOrders, days]);

  // NEW (22): clocked and approved hours per member per day.
  const actual = (employeeId: string, day: string) => {
    const segs = db.timeSegments.filter((s) => s.employeeId === employeeId && s.workDate === day && s.end && !s.supersededAt);
    const hours = segs.reduce((a, s) => a + (Date.parse(s.end!) - Date.parse(s.start)) / 3600000, 0);
    const state = db.timeEntries.find((e) => e.employeeId === employeeId && e.workDate === day)?.state;
    const approved = state === "approved" || state === "locked" || state === "paid";
    return { hours, approved, state };
  };

  const crew = db.employees.filter((e) => !e.offboardedAt && e.type !== "salaried");
  const scheduled = db.workOrders.filter((w) => w.status === "SCHEDULED" || w.status === "IN_PROGRESS");
  const unscheduled = db.workOrders.filter((w) => w.status === "UNSCHEDULED" || w.status === "PENDING_DEPOSIT");

  return (
    <Screen crumbs={[{ label: "Job Scheduling" }]} bare>
      <div className="w-full px-4 py-8 pb-32 md:px-8">
        <h1 className="font-heading text-3xl font-black tracking-tight text-gray-900 md:text-4xl">Job Scheduling</h1>
        <p className="mt-2 text-lg text-gray-500">Schedule won jobs onto a calendar and manage crew assignments.</p>

        <div className="mt-6 flex gap-2">
          {([["job", "Job", <Briefcase key="b" className="h-4 w-4" />], ["crew", "Crew", <Users key="u" className="h-4 w-4" />]] as const).map(([k, l, icon]) => (
            <button key={k} onClick={() => setView(k)} className={cn("flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold", view === k ? "bg-primary-600 text-white shadow-lg shadow-primary-500/20" : "border border-gray-200 bg-white text-gray-600")}>{icon}{l}</button>
          ))}
        </div>

        <div className="my-6 flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <button onClick={() => setWeekStart(addDaysToDay(weekStart, -7))} className="rounded-lg p-2 hover:bg-gray-100" aria-label="Previous week"><ChevronLeft className="h-5 w-5" /></button>
          <div className="text-center">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Week</div>
            <h3 className="font-heading text-lg font-bold text-gray-900">{fmt(days[0])} – {fmt(days[6])}</h3>
          </div>
          <button onClick={() => setWeekStart(addDaysToDay(weekStart, 7))} className="rounded-lg p-2 hover:bg-gray-100" aria-label="Next week"><ChevronRight className="h-5 w-5" /></button>
        </div>

        {view === "crew" ? (
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm" data-tour="crew-hours">
            <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 text-xs text-gray-500">
              <span className="font-bold uppercase tracking-widest text-gray-400">Hours</span>
              <span className="ml-auto inline-flex items-center gap-1.5">Clocked / approved hours per day <NewBadge feature={22} /></span>
            </div>
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="w-44 px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">Member</th>
                  <th className="w-36 px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">Capacity</th>
                  {days.map((d) => {
                    const dayAssigned = crew.reduce((a, e) => a + (assigned.get(`${e.id}|${d}`) ?? []).reduce((x, c) => x + c.hours, 0), 0);
                    return (
                      <th key={d} className="min-w-[140px] px-3 py-3 text-xs">
                        <div className="font-bold uppercase text-gray-500">{new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })} {new Date(`${d}T12:00:00`).getDate()}</div>
                        <div className="font-normal text-gray-400">{dayAssigned.toFixed(0)} / {crew.length * DAY_CAPACITY}h</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {crew.map((e) => {
                  const week = days.reduce((a, d) => a + (assigned.get(`${e.id}|${d}`) ?? []).reduce((x, c) => x + c.hours, 0), 0);
                  const cap = Math.min(45, DAY_CAPACITY * 6);
                  const over = week > cap;
                  return (
                    <tr key={e.id}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">{e.name[0]}</span><div><div className="font-semibold text-gray-900">{e.name}</div><div className="text-xs text-gray-400">{e.type}</div></div></div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-bold text-gray-800">{week.toFixed(0)} / {cap}h</div>
                        <div className={cn("text-xs", over ? "text-red-600" : "text-gray-400")}>{over ? `${(week - cap).toFixed(0)}h over` : `${(cap - week).toFixed(0)}h free`}</div>
                        <div className="mt-1 h-1.5 rounded-full bg-gray-100"><div className={cn("h-1.5 rounded-full", over ? "bg-red-500" : week === cap ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.min(100, (week / cap) * 100)}%` }} /></div>
                      </td>
                      {days.map((d) => {
                        const chips = assigned.get(`${e.id}|${d}`) ?? [];
                        const a = actual(e.id, d);
                        return (
                          <td key={d} className="px-3 py-2 align-top">
                            <div className="space-y-1">
                              {chips.map((c, i) => {
                                const job = byId(db.jobs, c.jobId);
                                const wo = db.workOrders.find((w) => w.jobId === c.jobId);
                                return (
                                  <AppLink key={i} href={wo ? workOrderHref(wo.id) : "#"} className={cn("block rounded-lg px-2 py-1 text-[11px] font-semibold text-white", colour(c.jobId))}>
                                    <div className="truncate">{job?.name} ({c.jobId})</div>
                                    <div className="opacity-80">{c.start}–{c.end} · {c.hours}h</div>
                                  </AppLink>
                                );
                              })}
                              {a.hours > 0 && (
                                <Tooltip content={a.approved ? "Approved for payroll" : `Clocked, not approved yet (${a.state ?? "open"})`}>
                                  <div className={cn("rounded-md border px-2 py-0.5 text-[11px] font-bold", a.approved ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 bg-gray-50 text-gray-600")}>
                                    {a.approved ? "Approved" : "Clocked"} {a.hours.toFixed(1)}h
                                  </div>
                                </Tooltip>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
              {days.map((d) => (
                <div key={d} className="min-h-40 rounded-2xl border border-gray-200 bg-white p-3">
                  <div className="mb-2 text-xs font-bold uppercase text-gray-500">{new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</div>
                  <div className="space-y-1.5">
                    {scheduled.filter((w) => w.startDate && w.endDate && d >= w.startDate.slice(0, 10) && d <= w.endDate.slice(0, 10)).map((w) => (
                      <AppLink key={w.id} href={workOrderHref(w.id)} className={cn("block rounded-lg px-2 py-1 text-[11px] font-semibold text-white", colour(w.jobId))}>{byId(db.jobs, w.jobId)?.name}</AppLink>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <h3 className="mb-3 font-heading text-base font-bold text-gray-900">Unscheduled Jobs</h3>
              {unscheduled.length === 0 && <p className="text-sm text-gray-400">All jobs are scheduled.</p>}
              {unscheduled.map((w) => (
                <AppLink key={w.id} href={workOrderHref(w.id)} className="mb-2 block rounded-xl border border-gray-200 p-3 hover:border-primary-300">
                  <div className="text-sm font-bold text-gray-900">{byId(db.jobs, w.jobId)?.name}</div>
                  <div className="text-xs text-gray-500">{w.id} · {w.status === "PENDING_DEPOSIT" ? "Pending Deposit" : "Unscheduled"}</div>
                </AppLink>
              ))}
            </div>
          </div>
        )}
      </div>
    </Screen>
  );
}

function fmt(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
