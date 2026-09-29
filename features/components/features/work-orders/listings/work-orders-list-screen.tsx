"use client";
/**
 * Work Orders — live route /work-orders (features/(main)/work-orders/listings).
 * Header, the four stats cards, search, the live status filter and one row
 * per work order (status, number, source chips, job, client, location,
 * start date, crew lead, total hours, View). Nothing here is new.
 */
import { useState } from "react";
import { Calendar, CheckCircle2, Clock, MapPin, PlayCircle, Search, User } from "lucide-react";
import type { WorkOrderStatus } from "@/features/types";
import { useDb } from "@/features/lib/store";
import { AppLink } from "@/features/lib/navigation";
import { workOrderHref } from "@/features/lib/hrefs";
import { WO_STATUS_LABEL, WO_STATUS_TONE } from "@/features/lib/store/actions/work-orders";
import { specForSurface, jobSurfaceHours } from "@/features/lib/rules/estimate";
import { byId, propertyAddress } from "@/features/lib/selectors";
import { date } from "@/features/lib/format";
import { Screen } from "@/features/components/layout/screen";
import { EmptyState, Input, NumberChip, Select, StatusPill } from "@/features/components/ui";

type Filter = "ALL_ACTIVE" | WorkOrderStatus;
const FILTERS: { label: string; value: Filter }[] = [
  { label: "All Active", value: "ALL_ACTIVE" },
  { label: "Pending Deposit", value: "PENDING_DEPOSIT" },
  { label: "Unscheduled", value: "UNSCHEDULED" },
  { label: "Scheduled", value: "SCHEDULED" },
  { label: "In Progress", value: "IN_PROGRESS" },
  { label: "Completed", value: "COMPLETED" },
];

export function WorkOrdersListScreen() {
  const db = useDb((d) => d);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL_ACTIVE");
  const hours = (jobId: string) => {
    const job = byId(db.jobs, jobId);
    return (job?.surfaceIds ?? []).map((id) => byId(db.surfaces, id)).filter(Boolean).reduce((a, s) => a + jobSurfaceHours(db, jobId, s!), 0);
  };
  const list = db.workOrders
    .filter((w) => (filter === "ALL_ACTIVE" ? w.status !== "COMPLETED" : w.status === filter))
    .filter((w) => {
      const job = byId(db.jobs, w.jobId);
      return [w.id, job?.name, byId(db.customers, job?.customerId)?.name].join(" ").toLowerCase().includes(q.toLowerCase());
    })
    .sort((a, b) => (a.startDate ?? "9").localeCompare(b.startDate ?? "9"));
  const stats = [
    { label: "Scheduled Jobs", value: db.workOrders.filter((w) => w.status === "SCHEDULED").length, sub: "Upcoming starts", icon: <Calendar /> },
    { label: "In Progress", value: db.workOrders.filter((w) => w.status === "IN_PROGRESS").length, sub: "Crews on site", icon: <PlayCircle /> },
    { label: "Completed", value: db.workOrders.filter((w) => w.status === "COMPLETED").length, sub: "Ready for invoice", icon: <CheckCircle2 /> },
    { label: "Total Hours", value: db.workOrders.filter((w) => w.status !== "COMPLETED").reduce((a, w) => a + hours(w.jobId), 0).toFixed(1), sub: "Allocated hours", icon: <Clock /> },
  ];
  return (
    <Screen crumbs={[{ label: "Work Orders" }]} bare>
      <div className="mx-auto w-full px-4 py-8 pb-32 md:px-8">
        <div className="mb-10">
          <h1 className="mb-4 font-heading text-3xl font-black tracking-tight text-gray-900 md:text-4xl">Work Orders</h1>
          <p className="text-lg font-medium text-gray-500">Track production schedules and crew assignments.</p>
        </div>
        <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-gray-400">{s.icon} {s.label}</div>
              <div className="font-heading text-3xl font-black text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-500">{s.sub}</div>
            </div>
          ))}
        </div>
        <div className="mb-5 flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search work orders..." className="h-11 pl-9" />
          </div>
          <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="h-11 md:w-56" aria-label="Status">
            {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </Select>
        </div>
        <div className="space-y-3">
          {list.length === 0 && <EmptyState title="No work orders found in this category." />}
          {list.map((w) => {
            const job = byId(db.jobs, w.jobId)!;
            const lead = w.shifts[0]?.memberIds[0] ? byId(db.employees, w.shifts[0].memberIds[0])?.name : byId(db.users, job.crewLeadId)?.name;
            return (
              <AppLink key={w.id} href={workOrderHref(w.id)} className="group block">
                <div className="flex flex-col gap-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-3">
                      <StatusPill tone={WO_STATUS_TONE[w.status]} className="text-xs">{WO_STATUS_LABEL[w.status]}</StatusPill>
                      <span className="font-mono text-xs font-bold text-gray-500">{w.id}</span>
                      {job.estimateId && <NumberChip className="text-xs">EST {job.estimateId}</NumberChip>}
                    </div>
                    <h3 className="mb-1 text-lg font-bold text-gray-900 group-hover:text-primary-700">{job.name}</h3>
                    <div className="flex items-center gap-2 text-sm text-gray-500"><User className="h-3.5 w-3.5" /> {byId(db.customers, job.customerId)?.name}</div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5 border-gray-100 lg:border-x lg:px-6">
                    <div className="flex items-center gap-2 text-sm text-gray-600"><MapPin className="h-3.5 w-3.5 text-gray-500" /><span className="truncate">{propertyAddress(byId(db.properties, job.propertyId))}</span></div>
                    <div className="flex items-center gap-2 text-sm text-gray-600"><Calendar className="h-3.5 w-3.5 text-gray-500" /> Start: {w.startDate ? date(w.startDate) : "TBD"}</div>
                  </div>
                  <div className="lg:w-48">
                    <div className="mb-1.5 text-xxs font-bold uppercase tracking-wider text-gray-500">Crew Lead</div>
                    <div className="text-sm font-bold text-gray-700">{lead ?? "Unassigned"}</div>
                  </div>
                  <div className="flex items-center justify-between gap-4 lg:justify-end">
                    <div className="text-right"><div className="text-xxs font-bold uppercase tracking-wider text-gray-500">Total Hours</div><div className="text-base font-black text-gray-900">{hours(w.jobId).toFixed(2)}</div></div>
                    <span className="inline-flex h-8 items-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-bold text-gray-600 shadow-sm">View</span>
                  </div>
                </div>
              </AppLink>
            );
          })}
        </div>
      </div>
    </Screen>
  );
}
