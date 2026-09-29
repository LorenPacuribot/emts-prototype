"use client";
/**
 * Job Details — live route /jobs/[id] (features/(main)/jobs/details/templates/index.tsx).
 *
 * Rebuilt as the live page: no tabs. Header (status, number, source chips,
 * Change Status, View Work Order), Financials and Schedule on the left,
 * Job Progress and the Work Order Details card on the right. Everything a
 * feature adds to a job lives on the work order or the estimate instead.
 */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowLeft, Briefcase, Calendar, ChevronDown, ClipboardList, DollarSign, ExternalLink, FileText } from "lucide-react";
import type { Job } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { useParam, AppLink } from "@/features/lib/navigation";
import { byId } from "@/features/lib/selectors";
import { can } from "@/features/lib/permissions";
import { estimateHref, invoiceHref, leadHref, workOrderHref } from "@/features/lib/hrefs";
import { renderedHoursBySurface, WO_STATUS_LABEL, WO_STATUS_TONE } from "@/features/lib/store/actions/work-orders";
import { setJobStage } from "@/features/lib/store/actions/jobs";
import { jobFinancials } from "@/features/lib/store/actions/finance";
import { specForSurface, jobSurfaceHours } from "@/features/lib/rules/estimate";
import { date, money } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { cn } from "@/features/lib/cn";
import { Screen } from "@/features/components/layout/screen";
import { Button, CardTitle, ConfirmBadge, EmptyState, LiveCard, LiveLabel, NewBadge, NumberChip, StatusPill } from "@/features/components/ui";

/** Live JOB_STAGES and DISPLAY_TO_API_STATUS. */
export const JOB_STAGES: { label: string; status: Job["status"] | "marketing" }[] = [
  { label: "Confirmed", status: "confirmed" },
  { label: "Scheduled", status: "scheduled" },
  { label: "In Production", status: "in_production" },
  { label: "Touch Up", status: "touch_up" },
  { label: "Ready for Inspection", status: "ready_for_inspection" },
  { label: "Completed", status: "completed" },
  { label: "Marketing", status: "marketing" },
];
export const JOB_STATUS_DISPLAY: Record<string, { label: string; tone: "gray" | "green" | "blue" | "purple" | "amber" | "indigo" }> = {
  unscheduled: { label: "Unscheduled", tone: "gray" },
  confirmed: { label: "Confirmed", tone: "green" },
  scheduled: { label: "Scheduled", tone: "blue" },
  in_production: { label: "In Production", tone: "purple" },
  touch_up: { label: "Touch Up", tone: "amber" },
  ready_for_inspection: { label: "Ready for Inspection", tone: "indigo" },
  completed: { label: "Completed", tone: "green" },
};

export function JobDetailsScreen() {
  const id = useParam("id");
  const db = useDb((d) => d);
  const job = byId(db.jobs, id);
  return (
    <Screen crumbs={[{ label: "Jobs", href: "/jobs" }, { label: "Job Details" }]} bare>
      <div className="min-h-screen w-full bg-gray-50/50 p-4 pb-32 md:p-8">
        <AppLink href="/jobs" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-primary-700"><ArrowLeft className="h-4 w-4" /> Back to Jobs</AppLink>
        {!job || job.status === "estimating" ? (
          <EmptyState icon={<Briefcase />} title="Job not found." body={job ? "This estimate hasn't been accepted yet, so there is no job." : undefined}
            action={job?.estimateId ? <AppLink href={estimateHref(job.estimateId)}><Button>Open the estimate</Button></AppLink> : undefined} />
        ) : (
          <JobDetails job={job} />
        )}
      </div>
    </Screen>
  );
}

function JobDetails({ job }: { job: Job }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const wo = db.workOrders.find((w) => w.jobId === job.id);
  const invoices = db.invoices.filter((i) => i.jobId === job.id);
  const paid = invoices.filter((i) => i.status === "paid").reduce((a, i) => a + i.amount, 0) || job.depositsCollected;
  const total = job.contractValue;
  const stageIndex = JOB_STAGES.findIndex((s) => s.status === job.status);
  const display = JOB_STATUS_DISPLAY[job.status] ?? { label: job.status, tone: "gray" as const };
  const estHours = job.surfaceIds.map((id) => byId(db.surfaces, id)).filter(Boolean).reduce((a, s) => a + jobSurfaceHours(db, job.id, s!), 0);
  const rendered = wo ? Array.from(renderedHoursBySurface(wo).values()).reduce((a, b) => a + b, 0) : 0;

  function change(status: Job["status"] | "marketing") {
    const r = act(setJobStage, job.id, status);
    if (r.ok) toast.success(`Job status updated to ${JOB_STAGES.find((s) => s.status === status)?.label}`);
  }

  return (
    <div className="space-y-8">
      <LiveCard>
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={display.tone} dot>{display.label}</StatusPill>
              <NumberChip>{job.id}</NumberChip>
              {job.estimateId && <AppLink href={estimateHref(job.estimateId)} className="rounded-md border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">EST {job.estimateId}</AppLink>}
              {job.leadId && <AppLink href={leadHref(job.leadId)} className="rounded-md border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">LEAD {job.leadId}</AppLink>}
            </div>
            <h1 className="mt-3 font-heading text-3xl font-extrabold tracking-tight text-gray-900">{job.name}</h1>
            <div className="text-sm text-gray-500">{byId(db.customers, job.customerId)?.name}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {can(user, "job.updateStatus") && (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild><Button className="h-11 px-5 font-black">Change Status <ChevronDown className="h-4 w-4" /></Button></DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-52 rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
                    {JOB_STAGES.filter((s) => s.label !== "Scheduled" && s.label !== "In Production").map((s) => (
                      <DropdownMenu.Item key={s.label} onSelect={() => change(s.status)} className="cursor-pointer rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-gray-100">{s.label}</DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}
            {wo && <AppLink href={workOrderHref(wo.id)}><Button variant="primary" className="h-11 px-5 font-black shadow-lg shadow-primary-500/20"><ClipboardList className="h-4 w-4" /> View Work Order</Button></AppLink>}
          </div>
        </div>
      </LiveCard>

      <div className="grid gap-8 lg:grid-cols-12">
        <div className="space-y-8 lg:col-span-4">
          {can(user, "job.viewFinancials") && (
            <LiveCard>
              <CardTitle icon={<DollarSign />} right={invoices[0] && <AppLink href={invoiceHref(invoices[0].id)} className="text-xs font-bold text-primary-700 hover:underline">View Invoice</AppLink>}>Financials</CardTitle>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Total Price</span><b>{money(total, { cents: true })}</b></div>
                <div className="flex justify-between"><span className="text-gray-500">Paid to Date</span><b className="text-green-700">{money(paid, { cents: true })}</b></div>
                <div className="mt-2 flex justify-between border-t border-gray-100 pt-2"><span className="text-xs font-bold uppercase tracking-widest text-gray-400">Balance Due</span><b className="text-lg">{money(total - paid, { cents: true })}</b></div>
              </div>
            </LiveCard>
          )}
          {can(user, "finance.access") && <JobCostCard jobId={job.id} />}
          <LiveCard>
            <CardTitle icon={<Calendar />}>Schedule</CardTitle>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><LiveLabel>Start Date</LiveLabel><div className="font-semibold">{job.scheduleStart ? date(job.scheduleStart) : "TBD"}</div></div>
              <div><LiveLabel>End Date</LiveLabel><div className="font-semibold">{job.scheduleEnd ? date(job.scheduleEnd) : "TBD"}</div></div>
            </div>
            {wo && <AppLink href={workOrderHref(wo.id)} className="mt-3 inline-block text-xs font-bold text-primary-700 hover:underline">Schedule Job on the work order</AppLink>}
          </LiveCard>
        </div>
        <div className="space-y-8 lg:col-span-8">
          <LiveCard>
            <CardTitle icon={<Briefcase />}>Job Progress</CardTitle>
            <div className="flex flex-wrap gap-2">
              {JOB_STAGES.map((s, i) => (
                <div key={s.label} className={cn("flex-1 rounded-lg border px-2 py-2 text-center text-xs font-bold", i <= stageIndex ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 bg-white text-gray-400")}>{s.label}</div>
              ))}
            </div>
          </LiveCard>
          <LiveCard>
            <CardTitle icon={<FileText />}>Work Order Details</CardTitle>
            {wo ? (
              <div>
                <div className="flex flex-wrap items-center gap-2"><NumberChip>{wo.id}</NumberChip><StatusPill tone={WO_STATUS_TONE[wo.status]}>{WO_STATUS_LABEL[wo.status]}</StatusPill></div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div><LiveLabel>Painting</LiveLabel><div className="font-bold">{estHours.toFixed(2)} hrs</div></div>
                  <div><LiveLabel>Total</LiveLabel><div className="font-bold">{estHours.toFixed(2)} hrs</div></div>
                  <div><LiveLabel>Rendered</LiveLabel><div className="font-bold text-primary-700">{rendered.toFixed(2)} hrs</div></div>
                </div>
                <p className="mt-4 text-sm text-gray-500">View full work order for crew instructions, task list, and surface details.</p>
                <AppLink href={workOrderHref(wo.id)} className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-primary-700 hover:underline">Open work order <ExternalLink className="h-3.5 w-3.5" /></AppLink>
              </div>
            ) : <p className="text-sm text-gray-500">Work order has not been generated yet.</p>}
          </LiveCard>
        </div>
      </div>
    </div>
  );
}

/** NEW (feature 33, needs client confirmation): job cost allocated from QuickBooks records (Rules 3 and 5). */
function JobCostCard({ jobId }: { jobId: string }) {
  const db = useDb((d) => d);
  const f = jobFinancials(db, jobId);
  const margin = f.actual ?? f.projected;
  return (
    <LiveCard isNew data-tour="job-cost">
      <CardTitle icon={<DollarSign />} badge={<NewBadge feature={33} />}>Job Cost</CardTitle>
      <div className="-mt-3 mb-3"><ConfirmBadge /></div>
      <div className="space-y-1.5 text-sm">
        {[["Contract (ex tax)", f.contractExTax], ["Invoiced (ex tax)", f.invoicedExTax], ["Labour (approved hours, Rule 3)", f.labour], ["Material", f.material], ["Other", f.other + f.subcontractor], ["Cost to date", f.costToDate]].map(([l, v]) => (
          <div key={l as string} className="flex justify-between gap-2"><span className="text-gray-500">{l}</span><b>{money(v as number, { cents: true })}</b></div>
        ))}
        <div className="mt-2 flex justify-between border-t border-gray-100 pt-2"><span className="text-xs font-bold uppercase tracking-widest text-gray-400">{f.actual !== null ? "Margin" : "Projected margin"}</span><b>{margin === null ? "—" : `${(margin * 100).toFixed(1)}%`}</b></div>
        {f.unmatched > 0 && <p className="text-xs text-amber-700">{money(f.unmatched)} of supplier bills not yet matched to orders.</p>}
      </div>
    </LiveCard>
  );
}
