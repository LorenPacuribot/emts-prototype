"use client";
/**
 * Work Order Details — live route /work-orders/[id]
 * (features/(main)/work-orders/details/templates/index.tsx).
 *
 * Live section order, with the new features added where the map puts them:
 *   header card (+ Client / Schedule) · Job Location | Crew & Schedule ·
 *   Instructions · Paint Color Card (3, 18 states) · Materials (NEW 18) ·
 *   Paint Orders (NEW 19) · Job Details · Crew Clock (NEW 22) · Time Log (22) ·
 *   Field Notes & Feed.
 * "Mark Complete" opens the NEW closeout (25). The kebab gains
 * "+ Create Change Order" (NEW 24).
 */
import { useState } from "react";
import { CheckCircle2, ClipboardCheck, ClipboardList, FilePlus2, Info, MoreVertical, Play, Share2, Timer, Trash2, CalendarX2, CalendarPlus, BadgeDollarSign } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { Job, WorkOrder } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { useParam, AppLink, useNav } from "@/features/lib/navigation";
import { markUnscheduled, renderedHoursBySurface, setWorkOrderStatus, WO_STATUS_LABEL, WO_STATUS_TONE } from "@/features/lib/store/actions/work-orders";
import { jobChangeOrders } from "@/features/lib/store/actions/change-orders";
import { closeoutRowsFor } from "@/features/lib/store/actions/property";
import { specForSurface, jobSurfaceHours } from "@/features/lib/rules/estimate";
import { byId } from "@/features/lib/selectors";
import { can } from "@/features/lib/permissions";
import { estimateHref, leadHref } from "@/features/lib/hrefs";
import { sendPhotoToMarketing } from "@/features/lib/store/actions/marketing";
import { toast } from "@/features/lib/toast";
import { Screen } from "@/features/components/layout/screen";
import { Button, Drawer, EmptyState, LiveCard, NewBadge, NumberChip, StatusPill, Tooltip } from "@/features/components/ui";
import { CloseoutPanel } from "@/features/components/features/closeout/closeout-panel";
import { MaterialsSections } from "@/features/components/features/materials/materials-sections";
import { LogHoursModal } from "./log-hours-modal";
import {
  ClientScheduleSection, CrewCard, CrewClockCard, FieldNotesSection, InstructionsSection, JobDetailsSection, LocationCard, ScheduleModal, TimeLogSection, WoPaintColorCard,
} from "./wo-sections";

export function WorkOrderDetailsScreen() {
  const id = useParam("id");
  const db = useDb((d) => d);
  const wo = byId(db.workOrders, id);
  const job = wo && byId(db.jobs, wo.jobId);
  return (
    <Screen crumbs={[{ label: "Work Orders", href: "/work-orders" }, { label: "Work Order Details" }]} bare>
      <div className="min-h-screen bg-gray-50 pb-32">
        <div className="mx-auto max-w-[1100px] space-y-8 p-4 md:p-8">
          {!wo || !job ? (
            <EmptyState icon={<ClipboardList />} title="Not Found" body="This work order doesn't exist." action={<AppLink href="/work-orders"><Button>Back to Work Orders</Button></AppLink>} />
          ) : (
            <WorkOrderDetails wo={wo} job={job} />
          )}
        </div>
      </div>
    </Screen>
  );
}

function WorkOrderDetails({ wo, job }: { wo: WorkOrder; job: Job }) {
  const [logHours, setLogHours] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [closeout, setCloseout] = useState(false);
  return (
    <>
      <LiveCard>
        <WoHeader wo={wo} job={job} onLogHours={() => setLogHours(true)} onSchedule={() => setSchedule(true)} onMarkComplete={() => setCloseout(true)} />
        <div className="my-8 h-px bg-gray-100" />
        <ClientScheduleSection wo={wo} job={job} onEditSchedule={() => setSchedule(true)} />
      </LiveCard>
      <div className="grid gap-8 lg:grid-cols-2">
        <LocationCard wo={wo} job={job} />
        <CrewCard wo={wo} />
      </div>
      <InstructionsSection wo={wo} />
      <WoPaintColorCard job={job} />
      <MaterialsSections job={job} />
      <JobDetailsSection wo={wo} job={job} />
      <CrewClockCard wo={wo} job={job} />
      <TimeLogSection wo={wo} job={job} />
      <FieldNotesSection wo={wo} extraAttachmentAction={(attId) => <UseInMarketing wo={wo} attId={attId} />} />

      <LogHoursModal open={logHours} onOpenChange={setLogHours} wo={wo} job={job} />
      <ScheduleModal key={`${wo.id}-${schedule}`} open={schedule} onOpenChange={setSchedule} wo={wo} />
      <Drawer open={closeout} onOpenChange={setCloseout} width="max-w-4xl" title={<span className="inline-flex items-center gap-2">Mark Complete · Closeout <NewBadge feature={25} /></span>} subtitle={`${wo.id} · ${job.name}`}>
        <CloseoutPanel job={job} />
      </Drawer>
    </>
  );
}

/** NEW (34): copy a site photo into the marketing media library. */
function UseInMarketing({ wo, attId }: { wo: WorkOrder; attId: string }) {
  const user = useCurrentUser();
  const att = wo.attachments.find((a) => a.id === attId);
  if (!att?.fileType.startsWith("image") || !can(user, "marketing.post")) return null;
  if (att.mediaAssetId) return <AppLink href="/marketing/media" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline"><Share2 className="h-3 w-3" /> In media library</AppLink>;
  return (
    <button type="button" data-tour="wo-use-in-marketing" onClick={() => { const r = act(sendPhotoToMarketing, wo.id, attId); if (r.ok) toast.success("Added to the media library", `${r.value} — check it for identifying details before posting.`); }}
      className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-primary-700">
      <Share2 className="h-3 w-3" /> Use in marketing <NewBadge feature={34} />
    </button>
  );
}

function WoHeader({ wo, job, onLogHours, onSchedule, onMarkComplete }: { wo: WorkOrder; job: Job; onLogHours: () => void; onSchedule: () => void; onMarkComplete: () => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const nav = useNav();
  const customer = byId(db.customers, job.customerId);
  const estimate = byId(db.estimates, job.estimateId);
  const rendered = Array.from(renderedHoursBySurface(wo).values()).reduce((a, b) => a + b, 0);
  const totalHours = job.surfaceIds.map((id) => byId(db.surfaces, id)).filter(Boolean).reduce((a, s) => a + jobSurfaceHours(db, job.id, s!), 0);
  const assigned = wo.shifts.reduce((a, s) => {
    const days = Math.max(1, Math.round((Date.parse(s.endDate) - Date.parse(s.startDate)) / 86400000) + 1);
    const [h1, m1] = s.startTime.split(":").map(Number);
    const [h2, m2] = s.endTime.split(":").map(Number);
    return a + days * s.memberIds.length * (h2 + m2 / 60 - h1 - m1 / 60 - 1);
  }, 0);
  const openCos = jobChangeOrders(db, job.id).filter((c) => !["approved", "rejected", "disputed"].includes(c.status));
  const rows = closeoutRowsFor(db, job);
  const confirmed = rows.filter((r) => r.confirmedBy).length;
  const canStatus = can(user, "workOrder.updateStatus");

  function status(to: WorkOrder["status"]) {
    const r = act(setWorkOrderStatus, wo.id, to);
    if (r.ok) toast.success(`Status changed to ${WO_STATUS_LABEL[to]}`);
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between" data-tour="wo-header">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={WO_STATUS_TONE[wo.status]}>{WO_STATUS_LABEL[wo.status]}</StatusPill>
          <NumberChip>{wo.id}</NumberChip>
          {estimate && <AppLink href={estimateHref(estimate.id)} className="rounded-md border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-xs font-bold text-blue-700 hover:bg-blue-100">EST {estimate.id}</AppLink>}
          {job.leadId && <AppLink href={leadHref(job.leadId)} className="rounded-md border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-xs font-bold text-blue-700 hover:bg-blue-100">LEAD {job.leadId}</AppLink>}
          {openCos.length > 0 && (
            <AppLink href={estimate ? estimateHref(estimate.id, "section-change-orders") : "#"} className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-bold text-amber-700">
              {openCos.length} open change order{openCos.length === 1 ? "" : "s"} <NewBadge feature={24} />
            </AppLink>
          )}
          {wo.status === "IN_PROGRESS" && (
            <span className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-1.5 py-0.5 text-xs font-bold text-green-700">
              Closeout {confirmed}/{rows.length} surfaces confirmed <NewBadge feature={25} />
            </span>
          )}
        </div>
        <h1 className="mt-3 font-heading text-2xl font-extrabold tracking-tight text-gray-900 md:text-3xl">{job.name}</h1>
        <div className="text-sm text-gray-500">{customer?.name}</div>
      </div>

      <div className="flex flex-col gap-3 lg:items-end">
        <div className="flex gap-6 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <Tooltip content="Painting hours from the estimate's production rates">
            <div><div className="flex items-center gap-1 text-xxs font-bold uppercase tracking-widest text-gray-400">Total Hours <Info className="h-3 w-3" /></div><div className="text-lg font-black text-gray-900">{totalHours.toFixed(2)}</div></div>
          </Tooltip>
          <div><div className="text-xxs font-bold uppercase tracking-widest text-gray-400">Assigned</div><div className="text-lg font-black text-gray-900">{assigned.toFixed(1)}</div></div>
          <div><div className="text-xxs font-bold uppercase tracking-widest text-gray-400">Rendered</div><div className="text-lg font-black text-primary-600">{rendered.toFixed(2)}</div></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can(user, "workOrder.logTime") && <Button className="h-11 px-5 font-black" onClick={onLogHours} data-tour="log-hours"><Timer className="h-4 w-4" /> Log Hours</Button>}
          {wo.status === "PENDING_DEPOSIT" && canStatus && <Button variant="primary" className="h-11 px-5 font-black shadow-lg shadow-primary-500/20" onClick={() => status("UNSCHEDULED")}><BadgeDollarSign className="h-4 w-4" /> Confirm Deposit</Button>}
          {wo.status === "UNSCHEDULED" && can(user, "workOrder.manageSchedule") && <Button variant="primary" className="h-11 px-5 font-black shadow-lg shadow-primary-500/20" onClick={onSchedule}><CalendarPlus className="h-4 w-4" /> Schedule</Button>}
          {wo.status === "SCHEDULED" && canStatus && <Button variant="primary" className="h-11 px-5 font-black shadow-lg shadow-primary-500/20" onClick={() => status("IN_PROGRESS")}><Play className="h-4 w-4" /> Start Job</Button>}
          {wo.status === "IN_PROGRESS" && canStatus && (
            <Button variant="primary" className="h-11 px-5 font-black shadow-lg shadow-primary-500/20" onClick={onMarkComplete} data-tour="mark-complete">
              <CheckCircle2 className="h-4 w-4" /> Mark Complete
            </Button>
          )}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50" aria-label="More">
              <MoreVertical className="h-4 w-4" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-56 rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
                <Item icon={<Share2 />} disabled label="Share Work Order" />
                <Item icon={<CalendarPlus />} label="Edit Schedule" onSelect={onSchedule} disabled={wo.status === "PENDING_DEPOSIT" || wo.status === "COMPLETED"} />
                <Item icon={<CalendarX2 />} label="Mark Unscheduled" disabled={wo.status !== "SCHEDULED"} onSelect={() => act(markUnscheduled, wo.id).ok && toast.success("Status changed to Unscheduled")} />
                {estimate && job.contractSigned && can(user, "co.build") && (
                  <Item icon={<FilePlus2 />} label={<span className="inline-flex items-center gap-2">Create Change Order <NewBadge feature={24} /></span>} onSelect={() => nav.push(`${estimateHref(estimate.id)}?newco=1#section-change-orders`)} />
                )}
                {wo.status === "IN_PROGRESS" && <Item icon={<ClipboardCheck />} label={<span className="inline-flex items-center gap-2">Closeout checklist <NewBadge feature={25} /></span>} onSelect={onMarkComplete} />}
                <Item icon={<Trash2 />} disabled danger label="Delete Work Order" />
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </div>
  );
}

function Item({ icon, label, onSelect, disabled, danger }: { icon: React.ReactNode; label: React.ReactNode; onSelect?: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <DropdownMenu.Item disabled={disabled} onSelect={onSelect} className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 data-[highlighted]:bg-gray-100 [&>svg]:h-4 [&>svg]:w-4 ${danger ? "text-red-600" : ""}`}>
      {icon} {label}
    </DropdownMenu.Item>
  );
}
