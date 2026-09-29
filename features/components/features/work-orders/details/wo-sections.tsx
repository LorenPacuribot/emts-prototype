"use client";
/**
 * Sections of the live work order page (features/(main)/work-orders/details/components/*).
 * Existing sections copy the live labels. New parts carry <NewBadge />.
 */
import { useState } from "react";
import {
  Calendar, Check, CheckCircle2, ClipboardList, Clock, Droplet, FileText, ImagePlus, LogIn, LogOut, MapPin, MessageSquare, Paintbrush, Pencil, Play,
  Timer, UserRound, Users, X,
} from "lucide-react";
import type { Job, WorkOrder } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import {
  addAttachment, addFieldNote, addShift, FIELD_NOTE_STATUSES, LOG_HOURS_ALLOWED_STATUSES, logWorkOrderHours, removeShift, renderedHoursBySurface, scheduleWorkOrder,
  updateSiteInstructions, updateWorkOrderTimeEntry,
} from "@/features/lib/store/actions/work-orders";
import { clockIn, clockOut } from "@/features/lib/store/actions/workforce";
import { jobDemand, lineState } from "@/features/lib/rules/procurement";
import { formatPacks } from "@/features/lib/rules/materials";
import { specForSurface, jobSurfaceHours } from "@/features/lib/rules/estimate";
import { openSegment } from "@/features/lib/rules/payroll";
import { byId, surfaceLabel } from "@/features/lib/selectors";
import { can } from "@/features/lib/permissions";
import { AppLink } from "@/features/lib/navigation";
import { contactHref } from "@/features/lib/hrefs";
import { SPEC_STATE } from "@/features/lib/status";
import { date, dateTime } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { cn } from "@/features/lib/cn";
import { Badge, Banner, Button, CardTitle, ConfirmDialog, Field, Input, LiveCard, LiveLabel, Modal, NewBadge, Swatch, Textarea, Tooltip } from "@/features/components/ui";

const TIME_STATE_TONE = { open: "gray", submitted: "blue", approved: "green", locked: "purple", paid: "green" } as const;
const TIME_STATE_LABEL = { open: "Open", submitted: "Submitted", approved: "Approved", locked: "In export batch", paid: "Paid" } as const;

/* ------------------------------------------------------------------ */

export function ClientScheduleSection({ wo, job, onEditSchedule }: { wo: WorkOrder; job: Job; onEditSchedule: () => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const customer = byId(db.customers, job.customerId);
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <LiveLabel className="mb-2">Client</LiveLabel>
        {customer ? (
          <AppLink href={contactHref(customer.id)} className="group block">
            <div className="flex items-center gap-2 font-bold text-gray-900 group-hover:text-primary-700">{customer.name} <span className="hidden rounded-md bg-primary-50 px-1.5 text-[10px] font-bold text-primary-700 group-hover:inline">View Profile</span></div>
            <div className="text-sm text-gray-500">{customer.email}</div>
            <div className="text-sm text-gray-500">{customer.phone}</div>
          </AppLink>
        ) : <span className="text-sm text-gray-400">No client assigned</span>}
      </div>
      <div>
        <div className="mb-2 flex items-center gap-2">
          <LiveLabel>Schedule</LiveLabel>
          {can(user, "workOrder.manageSchedule") && wo.status !== "PENDING_DEPOSIT" && wo.status !== "COMPLETED" && (
            <button onClick={onEditSchedule} className="text-gray-400 hover:text-primary-600" aria-label="Edit Schedule"><Pencil className="h-3.5 w-3.5" /></button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><div className="text-xs text-gray-400">Start Date</div><div className="font-semibold text-gray-900">{wo.startDate ? date(wo.startDate) : "TBD"}</div></div>
          <div><div className="text-xs text-gray-400">End Date</div><div className="font-semibold text-gray-900">{wo.endDate ? date(wo.endDate) : "TBD"}</div></div>
        </div>
      </div>
    </div>
  );
}

export function ScheduleModal({ open, onOpenChange, wo }: { open: boolean; onOpenChange: (v: boolean) => void; wo: WorkOrder }) {
  const [start, setStart] = useState(wo.startDate?.slice(0, 10) ?? "");
  const [end, setEnd] = useState(wo.endDate?.slice(0, 10) ?? "");
  const [error, setError] = useState<{ field?: string; message: string }>();
  function save() {
    const r = act(scheduleWorkOrder, wo.id, { startDate: start, endDate: end });
    if (!r.ok) return setError({ field: r.field, message: r.error });
    toast.success(wo.status === "UNSCHEDULED" ? "Status changed to Scheduled" : "Schedule updated");
    onOpenChange(false);
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" title="Edit Schedule" footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" onClick={save}>Save Changes</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start Date" required error={error?.field === "startDate" ? error.message : undefined}><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="End Date" required error={error?.field === "endDate" ? error.message : undefined}><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      {error && !error.field && <Banner tone="danger" className="mt-3">{error.message}</Banner>}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

export function LocationCard({ wo, job }: { wo: WorkOrder; job: Job }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const p = byId(db.properties, job.propertyId);
  const [editing, setEditing] = useState(false);
  const [gate, setGate] = useState(wo.gateCode ?? "");
  const [notes, setNotes] = useState(wo.accessNotes ?? "");
  return (
    <LiveCard>
      <CardTitle icon={<MapPin />} right={can(user, "workOrder.addNotes") && <button onClick={() => setEditing(true)} className="text-gray-400 hover:text-primary-600" aria-label="Edit Location"><Pencil className="h-4 w-4" /></button>}>Job Location</CardTitle>
      <div className="font-semibold text-gray-900">{p?.address ?? "No address set"}</div>
      <div className="text-sm text-gray-500">{p && `${p.city}, ${p.state} ${p.zip}`}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3"><LiveLabel>Gate / Access Code</LiveLabel><div className="mt-1 font-mono text-sm font-bold text-gray-800">{wo.gateCode || "—"}</div></div>
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3"><LiveLabel>Access Notes</LiveLabel><div className="mt-1 text-sm text-gray-700">{wo.accessNotes || "—"}</div></div>
      </div>
      <div className="mt-4 flex h-28 items-center justify-center rounded-xl border border-gray-100 bg-[repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6_10px,#f9fafb_10px,#f9fafb_20px)] text-xs text-gray-400">Map (Google Maps in the live app)</div>
      <Modal open={editing} onOpenChange={setEditing} size="sm" title="Edit Job Location"
        footer={<><Button onClick={() => setEditing(false)}>Cancel</Button><Button variant="primary" onClick={() => { act(updateSiteInstructions, wo.id, { gateCode: gate, accessNotes: notes }).ok && toast.success("Location updated"); setEditing(false); }}>Save Changes</Button></>}>
        <div className="space-y-3">
          <Field label="Gate/Access Code (Optional)"><Input value={gate} onChange={(e) => setGate(e.target.value)} placeholder="e.g. 1234" /></Field>
          <Field label="Access Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></Field>
        </div>
      </Modal>
    </LiveCard>
  );
}

export function CrewCard({ wo }: { wo: WorkOrder }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string>();
  const canManage = can(user, "workOrder.manageCrew");
  return (
    <LiveCard>
      <CardTitle icon={<Users />} right={canManage && <Button size="sm" onClick={() => setAdding(true)}>+ Add Shift</Button>}>Crew &amp; Schedule</CardTitle>
      {wo.shifts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">No crews assigned yet.{canManage && <div className="mt-2"><Button size="sm" onClick={() => setAdding(true)}>Assign Crew</Button></div>}</div>
      ) : (
        <div className="space-y-3">
          {wo.shifts.map((s) => (
            <div key={s.id} className="rounded-xl border border-gray-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-gray-900">{s.name || "Unnamed Shift"}</div>
                  <div className="text-xs text-gray-500">{date(s.startDate)} – {date(s.endDate)} · <span className="rounded-md bg-gray-100 px-1.5 py-0.5">{fmtTime(s.startTime)} - {fmtTime(s.endTime)}</span></div>
                </div>
                {canManage && <button onClick={() => setRemoving(s.id)} className="text-gray-300 hover:text-red-600" aria-label="Delete Shift"><X className="h-4 w-4" /></button>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.memberIds.length === 0 && <span className="text-xs text-gray-400">No members assigned</span>}
                {s.memberIds.map((id) => {
                  const e = byId(db.employees, id);
                  return <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white py-0.5 pl-0.5 pr-2 text-xs font-semibold text-gray-700"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">{e?.name[0]}</span>{e?.name.split(" ")[0]}</span>;
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <ShiftModal open={adding} onOpenChange={setAdding} wo={wo} />
      <ConfirmDialog open={!!removing} onOpenChange={(v) => !v && setRemoving(undefined)} title="Delete Shift" body={`Are you sure you want to delete "${wo.shifts.find((s) => s.id === removing)?.name || "Unnamed Shift"}"? All members will be unassigned.`} confirmLabel="Delete"
        onConfirm={() => removing && act(removeShift, wo.id, removing).ok && toast.success("Shift deleted")} />
    </LiveCard>
  );
}

function ShiftModal({ open, onOpenChange, wo }: { open: boolean; onOpenChange: (v: boolean) => void; wo: WorkOrder }) {
  const db = useDb((d) => d);
  const [name, setName] = useState("");
  const [start, setStart] = useState(wo.startDate?.slice(0, 10) ?? "");
  const [end, setEnd] = useState(wo.endDate?.slice(0, 10) ?? "");
  const [t1, setT1] = useState("08:00");
  const [t2, setT2] = useState("17:00");
  const [members, setMembers] = useState<string[]>([]);
  const [error, setError] = useState<{ field?: string; message: string }>();
  function save() {
    const r = act(addShift, wo.id, { name, startDate: start, endDate: end, startTime: t1, endTime: t2, memberIds: members });
    if (!r.ok) return setError({ field: r.field, message: r.error });
    toast.success("Crew assigned");
    onOpenChange(false);
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" title="Assign Crew & Schedule" footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" onClick={save}>Confirm Schedule</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Shift Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Prep Team" /></Field>
          <Field label="Default Start (24h)" required><Input type="time" value={t1} onChange={(e) => setT1(e.target.value)} /></Field>
          <Field label="Default End (24h)" required error={error?.field === "endTime" ? error.message : undefined}><Input type="time" value={t2} onChange={(e) => setT2(e.target.value)} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Start Date" required error={error?.field === "startDate" ? error.message : undefined}><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="End Date" required error={error?.field === "endDate" ? error.message : undefined}><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <div>
          <LiveLabel className="mb-2">Crew Member</LiveLabel>
          <div className="flex flex-wrap gap-2">
            {db.employees.filter((e) => !e.offboardedAt && e.type !== "salaried").map((e) => (
              <button key={e.id} onClick={() => setMembers(members.includes(e.id) ? members.filter((m) => m !== e.id) : [...members, e.id])}
                className={cn("rounded-full border px-3 py-1 text-sm font-semibold", members.includes(e.id) ? "border-primary-500 bg-primary-50 text-primary-700" : "border-gray-200 text-gray-600")}>
                {e.name}
              </button>
            ))}
          </div>
          {error?.field === "memberIds" && <p className="mt-1 text-xs font-medium text-red-600">{error.message}</p>}
        </div>
        {error && !error.field && <Banner tone="danger">{error.message}</Banner>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

export function InstructionsSection({ wo }: { wo: WorkOrder }) {
  const user = useCurrentUser();
  const [editing, setEditing] = useState(false);
  const [company, setCompany] = useState(wo.companyResponsibilities.join("\n"));
  const [customer, setCustomer] = useState(wo.customerResponsibilities.join("\n"));
  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {wo.areasExcluded && <LiveCard><CardTitle icon={<X />}>Areas Excluded</CardTitle><p className="text-sm text-gray-700">{wo.areasExcluded}</p></LiveCard>}
      {wo.existingConditions && <LiveCard><CardTitle icon={<FileText />}>Existing Conditions</CardTitle><p className="text-sm text-gray-700">{wo.existingConditions}</p></LiveCard>}
      {([["Company Responsibilities", wo.companyResponsibilities], ["Customer Responsibilities", wo.customerResponsibilities]] as const).map(([t, list], i) => (
        <LiveCard key={t}>
          <CardTitle icon={<ClipboardList />} right={i === 0 && can(user, "workOrder.addNotes") && <button onClick={() => setEditing(true)} className="text-gray-400 hover:text-primary-600" aria-label="Edit Site Instructions"><Pencil className="h-4 w-4" /></button>}>{t}</CardTitle>
          {list.length ? <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">{list.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="text-sm text-gray-400">--</p>}
        </LiveCard>
      ))}
      <Modal open={editing} onOpenChange={setEditing} title="Edit Site Instructions" size="lg"
        footer={<><Button onClick={() => setEditing(false)}>Cancel</Button><Button variant="primary" onClick={() => { act(updateSiteInstructions, wo.id, { companyResponsibilities: lines(company), customerResponsibilities: lines(customer) }).ok && toast.success("Site instructions updated"); setEditing(false); }}>Save Changes</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Company Responsibilities" hint="One per line"><Textarea rows={6} value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
          <Field label="Customer Responsibilities" hint="One per line"><Textarea rows={6} value={customer} onChange={(e) => setCustomer(e.target.value)} /></Field>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Live read-only Paint Color Card (work-orders/details/components/paint-color-card.tsx):
 * TOTAL PAINT TO BUY, per-colour GALLONS and CONTAINERS TO BUY.
 * NEW (3): approval state per colour; ordering is blocked until approved.
 * NEW (18): outstanding and orderable-now quantities per colour (Rule 2).
 */
export function WoPaintColorCard({ job }: { job: Job }) {
  const db = useDb((d) => d);
  const lines = jobDemand(db, job.id);
  const colours = db.colours.filter((c) => c.jobId === job.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const total = lines.reduce((a, l) => a + l.needGal, 0);
  return (
    <LiveCard id="section-paint-card">
      <CardTitle icon={<Paintbrush />} right={<div className="text-right"><LiveLabel>Total Paint To Buy</LiveLabel><div className="flex items-center justify-end gap-1 text-lg font-black text-blue-600"><Droplet className="h-4 w-4" /> {total.toFixed(1)} gal</div></div>}>Paint Color Card</CardTitle>
      {colours.length === 0 ? <p className="text-sm text-gray-400">No paint assigned.</p> : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {colours.map((c, i) => {
            const cl = lines.filter((l) => l.spec.colourId === c.id);
            const gallons = cl.reduce((a, l) => a + l.needGal, 0);
            const states = Array.from(new Set(cl.map((l) => l.spec.state)));
            const approved = cl.length > 0 && cl.every((l) => l.spec.state === "approved");
            const q = cl.map((l) => lineState(db, job.id, l.specId, l.needGal));
            const outstanding = q.reduce((a, s) => a + s.outstanding, 0);
            const orderable = cl.reduce((a, l, idx) => a + (l.blocked.length === 0 ? q[idx].orderableNow : 0), 0);
            return (
              <div key={c.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white font-mono text-sm font-bold text-gray-700 ring-1 ring-gray-200">#{i + 1}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-sm font-bold text-gray-900"><Swatch hex={c.hex} size="sm" /> {c.name}</div>
                      <div className="text-xs text-gray-500">{cl[0]?.spec.product ?? "—"}</div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{cl.map((l) => l.spec.sheen).filter(Boolean).join(" / ") || "—"}</div>
                    </div>
                  </div>
                  <div className="text-right"><LiveLabel>Gallons</LiveLabel><div className="text-lg font-black text-gray-900">{gallons.toFixed(1)}</div></div>
                </div>
                <div className="mt-3"><LiveLabel className="mb-1">Containers To Buy</LiveLabel>
                  <div className="flex flex-wrap gap-1">{cl.map((l) => formatPacks(l.packs.packs)).filter(Boolean).join(" + ").split(" + ").filter(Boolean).map((p, k) => <span key={k} className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-xs font-semibold text-gray-700">{p}</span>)}</div>
                </div>
                <div className="mt-3 space-y-1.5 border-t border-dashed border-gray-200 pt-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-gray-500">Approval <NewBadge feature={3} /></span>
                    <span className="flex flex-wrap justify-end gap-1">{states.map((s) => <Badge key={s} tone={SPEC_STATE[s].tone}>{SPEC_STATE[s].label}</Badge>)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-gray-500">Outstanding · orderable <NewBadge feature={18} /></span>
                    <span className="font-bold text-gray-800">{outstanding.toFixed(2)} · {orderable.toFixed(2)} gal</span>
                  </div>
                  {!approved && <p className="font-semibold text-amber-700">Not orderable until the customer approves this colour.</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </LiveCard>
  );
}

/* ------------------------------------------------------------------ */

/** Live "Job Details": per area, per surface, with PREPARATION, PAINT and the inline RENDERED input. */
export function JobDetailsSection({ wo, job }: { wo: WorkOrder; job: Job }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const rendered = renderedHoursBySurface(wo);
  const canLog = can(user, "workOrder.logTime") && LOG_HOURS_ALLOWED_STATUSES.includes(wo.status);
  const surfaces = job.surfaceIds.map((id) => byId(db.surfaces, id)).filter((s) => !!s && !s.removedAt) as NonNullable<ReturnType<typeof byId<(typeof db.surfaces)[number]>>>[];
  const areas = Array.from(new Set(surfaces.map((s) => s.areaId))).map((id) => byId(db.areas, id)!);
  const colours = db.colours.filter((c) => c.jobId === job.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  function blurRendered(surfaceId: string, value: string) {
    const next = Number(value);
    const before = rendered.get(surfaceId) ?? 0;
    if (!value || next === before) return;
    if (next < before) return toast.error("Rendered hours can only be increased. Use time log to edit entries.");
    const r = act(logWorkOrderHours, wo.id, { entries: [{ surfaceId, hours: +(next - before).toFixed(2) }] });
    if (r.ok) toast.success(`Logged ${(next - before).toFixed(2)} hours`);
  }

  return (
    <LiveCard>
      <div className="mb-5 flex items-center justify-between"><h2 className="font-heading text-xl font-bold text-gray-900">Job Details</h2><span className="text-sm text-gray-500">{surfaces.length} Total Surfaces</span></div>
      {areas.length === 0 && <p className="text-sm text-gray-400">No areas or surfaces found.</p>}
      <div className="space-y-5">
        {areas.map((a) => {
          const rows = surfaces.filter((s) => s.areaId === a.id);
          const est = rows.reduce((x, s) => x + jobSurfaceHours(db, job.id, s), 0);
          const ren = rows.reduce((x, s) => x + (rendered.get(s.id) ?? 0), 0);
          return (
            <div key={a.id} className="overflow-hidden rounded-xl border border-gray-200">
              <div className="flex items-center justify-between bg-gray-50 px-4 py-3">
                <span className="font-bold text-gray-900">{a.name}</span>
                <span className="flex gap-4 text-xs"><span><span className="font-bold uppercase tracking-widest text-gray-400">Total Hours</span> <b className="text-gray-900">{est.toFixed(2)}</b></span><span><span className="font-bold uppercase tracking-widest text-gray-400">Rendered</span> <b className="text-primary-700">{ren.toFixed(2)}</b></span></span>
              </div>
              <div className="divide-y divide-gray-100">
                {rows.map((s) => {
                  const spec = specForSurface(db, job.id, s.id);
                  const colour = spec && byId(db.colours, spec.colourId);
                  const n = colour ? colours.findIndex((c) => c.id === colour.id) + 1 : 0;
                  const seq = (spec?.coatSequence ?? []).join(" ").toLowerCase();
                  const prep = { Wash: seq.includes("clean") || seq.includes("wash"), Scrape: seq.includes("sand") || seq.includes("scrape"), Caulk: seq.includes("caulk"), Prime: !!spec?.primer && !spec.primer.startsWith("No primer") };
                  return (
                    <div key={s.id} className="grid gap-3 px-4 py-3 md:grid-cols-12 md:items-center">
                      <div className="md:col-span-4">
                        <div className="text-sm font-semibold text-gray-900">{s.name}</div>
                        <div className="mt-1 flex flex-wrap gap-1 text-[10px] font-bold"><span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">{s.areaSqft} SQFT</span><span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">COATS {spec?.coats ?? 2}</span></div>
                      </div>
                      <div className="md:col-span-3">
                        <LiveLabel className="mb-1">Preparation</LiveLabel>
                        <div className="flex flex-wrap gap-1">{Object.entries(prep).map(([k, v]) => <span key={k} className={cn("inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold", v ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400")}>{v ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}{k}</span>)}</div>
                      </div>
                      <div className="md:col-span-3">
                        <LiveLabel className="mb-1">Paint</LiveLabel>
                        {colour ? <div className="text-xs text-gray-700"><b>#{n}</b> {colour.name} · {spec?.product} · {spec?.sheen}</div> : <span className="text-xs text-gray-400">None assigned</span>}
                      </div>
                      <div className="flex items-center gap-3 md:col-span-2 md:justify-end">
                        <div className="text-right"><LiveLabel>Total Hrs</LiveLabel><div className="text-sm font-bold">{jobSurfaceHours(db, job.id, s).toFixed(2)}</div></div>
                        <div><LiveLabel>Rendered</LiveLabel>
                          <Input type="number" step={0.5} min={0} key={rendered.get(s.id) ?? 0} defaultValue={rendered.get(s.id) ?? 0} disabled={!canLog} onBlur={(e) => blurRendered(s.id, e.target.value)} className="h-8 w-20 text-right" aria-label={`Rendered hours ${s.name}`} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </LiveCard>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Live "Time Log": one row per entry, editable hours and notes.
 * NEW (22): crew member, work date and the day's payroll state; approved or
 * exported days are locked. Clocked time for this job is listed below.
 */
export function TimeLogSection({ wo, job }: { wo: WorkOrder; job: Job }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [editing, setEditing] = useState<string>();
  const [h, setH] = useState("");
  const [n, setN] = useState("");
  const segments = db.timeSegments.filter((s) => s.jobId === job.id && !s.supersededAt).sort((a, b) => b.start.localeCompare(a.start)).slice(0, 12);
  if (wo.timeEntries.length === 0 && segments.length === 0) return null;
  const entries = [...wo.timeEntries].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  const dayState = (employeeId?: string, workDate?: string) => (employeeId && workDate ? db.timeEntries.find((x) => x.employeeId === employeeId && x.workDate === workDate)?.state : undefined);
  return (
    <LiveCard data-tour="wo-time-log">
      <CardTitle icon={<Clock />} right={<span className="text-sm text-gray-500">{entries.length} Entries</span>}>Time Log</CardTitle>
      <div className="divide-y divide-gray-100">
        {entries.map((e) => {
          const who = byId(db.users, e.loggedBy);
          const emp = e.employeeId ? byId(db.employees, e.employeeId) : undefined;
          const state = dayState(e.employeeId, e.workDate);
          return (
            <div key={e.id} className="flex items-start gap-3 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700">{(emp?.name ?? who?.name ?? "?")[0]}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-bold text-gray-900">{who?.name}</span>
                  <span className="text-xs text-gray-400">{dateTime(e.loggedAt)}</span>
                  {emp && <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600"><UserRound className="h-3 w-3" />{emp.name} · {e.workDate && date(e.workDate)} <NewBadge feature={22} /></span>}
                  {state && <Badge tone={TIME_STATE_TONE[state]}>{TIME_STATE_LABEL[state]}</Badge>}
                </div>
                <div className="text-xs text-gray-500">{surfaceLabel(db, e.surfaceId).replace(" · ", " — ")}</div>
                {editing === e.id ? (
                  <div className="mt-2 flex flex-wrap items-start gap-2">
                    <Input type="number" step={0.25} value={h} onChange={(ev) => setH(ev.target.value)} className="h-9 w-24" aria-label="Hours" />
                    <Textarea rows={2} value={n} onChange={(ev) => setN(ev.target.value)} placeholder="Optional notes..." className="min-w-48 flex-1" />
                    <Button size="sm" variant="primary" onClick={() => { const r = act(updateWorkOrderTimeEntry, wo.id, e.id, { renderedHours: Number(h), notes: n }); if (r.ok) { toast.success("Entry updated"); setEditing(undefined); } }}>Save</Button>
                    <Button size="sm" onClick={() => setEditing(undefined)}>Cancel</Button>
                  </div>
                ) : (
                  <div className="mt-0.5 text-sm text-gray-800"><b>{e.renderedHours.toFixed(2)}h</b>{e.notes && ` — ${e.notes}`}</div>
                )}
              </div>
              {editing !== e.id && can(user, "workOrder.logTime") && (
                <Tooltip content={state === "approved" || state === "locked" || state === "paid" ? `Locked: the day is ${TIME_STATE_LABEL[state].toLowerCase()}` : "Edit"}>
                  <button disabled={state === "approved" || state === "locked" || state === "paid"} onClick={() => { setEditing(e.id); setH(String(e.renderedHours)); setN(e.notes ?? ""); }} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30" aria-label="Edit entry"><Pencil className="h-4 w-4" /></button>
                </Tooltip>
              )}
            </div>
          );
        })}
      </div>
      {segments.length > 0 && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/30 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500">Clocked time on this job <NewBadge feature={22} /></div>
          <div className="grid gap-1.5 text-sm">
            {segments.map((s) => {
              const st = dayState(s.employeeId, s.workDate);
              return (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-gray-700"><b>{byId(db.employees, s.employeeId)?.name}</b> · {date(s.workDate)} · {new Date(s.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–{s.end ? new Date(s.end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "now"} · {s.activity.replace("_", " ")}</span>
                  <span className="flex items-center gap-2">{st && <Badge tone={TIME_STATE_TONE[st]}>{TIME_STATE_LABEL[st]}</Badge>}<AppLink href="/time" className="text-xs font-bold text-primary-700 hover:underline">Review in Time</AppLink></span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </LiveCard>
  );
}

/** NEW (22): the crew lead clocks each crew member in and out on this job. */
export function CrewClockCard({ wo, job }: { wo: WorkOrder; job: Job }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  if (!can(user, "time.clock") || wo.status !== "IN_PROGRESS") return null;
  const ids = Array.from(new Set(wo.shifts.flatMap((s) => s.memberIds)));
  const crew = ids.map((id) => byId(db.employees, id)).filter((e) => !!e && !e.offboardedAt) as NonNullable<ReturnType<typeof byId<(typeof db.employees)[number]>>>[];
  return (
    <LiveCard isNew data-tour="wo-crew-clock">
      <CardTitle icon={<Timer />} badge={<NewBadge feature={22} />}>Crew Clock</CardTitle>
      <p className="-mt-3 mb-4 text-sm text-gray-500">Clock the crew in and out on this job. Punches go to Time for the office to approve; only approved hours count for payroll and job cost.</p>
      {crew.length === 0 ? <p className="text-sm text-gray-400">Assign crew to a shift first.</p> : (
        <div className="grid gap-2 sm:grid-cols-2">
          {crew.map((e) => {
            const open = openSegment(db.timeSegments, e.id);
            const here = open?.jobId === job.id;
            return (
              <div key={e.id} className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white p-3">
                <div>
                  <div className="text-sm font-bold text-gray-900">{e.name}</div>
                  <div className="text-xs text-gray-500">{open ? `Clocked in ${new Date(open.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${here ? "" : ` at ${open.jobId ?? "overhead"}`}` : "Not clocked in"}</div>
                </div>
                {open ? (
                  <Button size="sm" onClick={() => act(clockOut, e.id).ok && toast.success(`${e.name} clocked out`)}><LogOut className="h-3.5 w-3.5" /> Clock out</Button>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => act(clockIn, e.id, job.id, "application").ok && toast.success(`${e.name} clocked in`)}><LogIn className="h-3.5 w-3.5" /> Clock in</Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </LiveCard>
  );
}

/* ------------------------------------------------------------------ */

/** Live "Field Notes & Feed" with "Site Photos & Attachments". */
export function FieldNotesSection({ wo, extraAttachmentAction }: { wo: WorkOrder; extraAttachmentAction?: (attId: string) => React.ReactNode }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [note, setNote] = useState("");
  const allowed = FIELD_NOTE_STATUSES.includes(wo.status);
  function upload(files: FileList | null) {
    for (const f of Array.from(files ?? [])) act(addAttachment, wo.id, { fileName: f.name, fileType: f.type || "application/octet-stream", fileSize: f.size });
    if (files?.length) toast.success("Uploaded", "Recorded, not stored (prototype).");
  }
  return (
    <LiveCard>
      <LiveLabel className="mb-1">Project Log</LiveLabel>
      <CardTitle icon={<MessageSquare />}>Field Notes &amp; Feed</CardTitle>
      <div className="space-y-3">
        {wo.fieldNotes.length === 0 && <p className="text-sm text-gray-400">No detailed notes logged yet.</p>}
        {wo.fieldNotes.map((n) => (
          <div key={n.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <div className="text-xs text-gray-400"><b className="text-gray-700">{byId(db.users, n.authorId)?.name}</b> · {dateTime(n.createdAt)}</div>
            <div className="mt-1 text-sm text-gray-800">{n.content}</div>
          </div>
        ))}
      </div>
      {can(user, "workOrder.addNotes") && (
        <div className="mt-4">
          <LiveLabel className="mb-2">Add New Note</LiveLabel>
          {!allowed && <Banner tone="warn" className="mb-2">Notes can be added while the work order is Scheduled or In Progress.</Banner>}
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Share a specific instruction, gate code, or site update..." disabled={!allowed} />
          <div className="mt-2 flex justify-end"><Button variant="primary" size="sm" disabled={!allowed || !note.trim()} onClick={() => { if (act(addFieldNote, wo.id, note).ok) { setNote(""); toast.success("Note saved"); } }}>Save Note</Button></div>
        </div>
      )}
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between"><h3 className="font-heading text-base font-bold text-gray-900">Site Photos &amp; Attachments</h3><span className="text-sm text-gray-500">{wo.attachments.length} items</span></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {wo.attachments.map((a) => (
            <div key={a.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="flex h-24 items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 text-gray-400">{a.fileType.startsWith("image") ? <ImagePlus className="h-6 w-6" /> : <FileText className="h-6 w-6" />}</div>
              <div className="p-2">
                <div className="truncate text-xs font-semibold text-gray-800" title={a.fileName}>{a.caption ?? a.fileName}</div>
                <div className="text-[11px] text-gray-400">{date(a.createdAt)}</div>
                {extraAttachmentAction?.(a.id)}
              </div>
            </div>
          ))}
          {can(user, "workOrder.addAttachments") && (
            <label className="flex h-full min-h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-200 text-sm font-semibold text-gray-500 hover:border-primary-300 hover:text-primary-700">
              <ImagePlus className="h-5 w-5" /> Upload Photos / Files
              <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={(e) => upload(e.target.files)} />
            </label>
          )}
        </div>
      </div>
    </LiveCard>
  );
}

function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
