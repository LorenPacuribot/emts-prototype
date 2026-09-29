"use client";
/** Job Management list — replica of the live /jobs page. */
import { useMemo, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronRight as Chevron, CircleDot, Clock3, FileText, MapPin, Search, Users } from "lucide-react";
import { useDb } from "@/features/lib/store";
import { AppLink } from "@/features/lib/navigation";
import { byId, propertyAddress } from "@/features/lib/selectors";
import { JOB_STATUS } from "@/features/lib/status";
import { date } from "@/features/lib/format";
import type { JobStatus } from "@/features/types";
import { Screen, PageHeader } from "@/features/components/layout/screen";
import { Badge, Card, EmptyState, IdChip, Input, MicroLabel, PillTabs, Select } from "@/features/components/ui";
import { jobHref } from "@/features/lib/hrefs";

type Filter = "all" | JobStatus | "marketing";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All Active" },
  { value: "unscheduled", label: "Unscheduled" },
  { value: "confirmed", label: "Confirmed" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_production", label: "In Production" },
  { value: "touch_up", label: "Touch Up" },
  { value: "ready_for_inspection", label: "Ready for Inspection" },
  { value: "completed", label: "Completed" },
  { value: "marketing", label: "Marketing" },
];

const STATUS_ICON: Partial<Record<JobStatus, React.ReactNode>> = {
  unscheduled: <Clock3 className="h-3 w-3" />,
  scheduled: <Calendar className="h-3 w-3" />,
  in_production: <CircleDot className="h-3 w-3" />,
};

export function JobsListScreen() {
  const db = useDb((d) => d);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [pageSize, setPageSize] = useState(10);

  const jobs = useMemo(() => {
    return [...db.jobs]
      .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }))
      .filter((j) => j.status !== "estimating")
      .filter((j) => (filter === "all" ? j.status !== "completed" : filter === "marketing" ? false : j.status === filter))
      .filter((j) => {
        if (!q) return true;
        const p = byId(db.properties, j.propertyId);
        const c = byId(db.customers, j.customerId);
        return [j.id, j.name, p?.address, p?.city, c?.name].join(" ").toLowerCase().includes(q.toLowerCase());
      });
  }, [db, filter, q]);

  const shown = jobs.slice(0, pageSize);

  return (
    <Screen crumbs={[{ label: "Jobs" }]}>
      <PageHeader title="Job Management" subtitle="Mission control for active projects." />
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative xl:w-[336px]">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <Input placeholder="Search jobs..." value={q} onChange={(e) => setQ(e.target.value)} className="h-9 pl-10" aria-label="Search jobs" />
        </div>
        <PillTabs options={FILTERS} value={filter} onChange={setFilter} />
      </div>

      <div className="space-y-3">
        {shown.length === 0 && <EmptyState title="No jobs match" body="Try another filter or clear the search." />}
        {shown.map((job) => {
          const p = byId(db.properties, job.propertyId);
          const s = JOB_STATUS[job.status];
          return (
            <AppLink key={job.id} href={jobHref(job.id)} className="block">
              <Card className="flex items-center gap-4 px-5 py-4 transition-shadow hover:shadow-md">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <IdChip>{job.id}</IdChip>
                    <Badge tone={s.tone} icon={STATUS_ICON[job.status]}>
                      {s.label}
                    </Badge>
                    {job.estimateId && (
                      <IdChip tone="blue" icon={<FileText className="h-2.5 w-2.5" />}>
                        {job.estimateId}
                      </IdChip>
                    )}
                    {job.leadId && (
                      <IdChip tone="blue" icon={<Users className="h-2.5 w-2.5" />}>
                        {job.leadId}
                      </IdChip>
                    )}
                  </div>
                  <div className="mt-2 font-display text-base font-bold text-ink">{job.name}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                    <MapPin className="h-3.5 w-3.5" /> {propertyAddress(p)}
                  </div>
                </div>
                <div className="hidden border-l border-line pl-6 sm:block sm:w-56">
                  <MicroLabel>Schedule</MicroLabel>
                  {job.scheduleStart ? (
                    <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-ink">
                      <Calendar className="h-3.5 w-3.5 text-brand" /> {date(job.scheduleStart)} <span className="text-gray-300">-</span> {date(job.scheduleEnd)}
                    </div>
                  ) : (
                    <div className="mt-1 text-xs italic text-gray-500">Not scheduled</div>
                  )}
                </div>
                <div className="border-l border-line pl-4">
                  <Chevron className="h-4 w-4 text-gray-300" />
                </div>
              </Card>
            </AppLink>
          );
        })}
      </div>

      <div className="mt-5 flex flex-col items-center justify-between gap-3 sm:flex-row">
        <span className="text-xs text-gray-600">
          Showing {shown.length} out of {jobs.length} results
        </span>
        <div className="flex items-center gap-2">
          {[ChevronsLeft, ChevronLeft].map((I, i) => (
            <span key={i} className="flex h-6 w-6 items-center justify-center rounded-md border border-line text-gray-300">
              <I className="h-3.5 w-3.5" />
            </span>
          ))}
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand text-xs font-bold text-white">1</span>
          {[ChevronRight, ChevronsRight].map((I, i) => (
            <span key={i} className="flex h-6 w-6 items-center justify-center rounded-md border border-line text-gray-300">
              <I className="h-3.5 w-3.5" />
            </span>
          ))}
        </div>
        <Select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-9 w-32" aria-label="Page size">
          <option value={10}>Show 10</option>
          <option value={25}>Show 25</option>
        </Select>
      </div>
    </Screen>
  );
}
