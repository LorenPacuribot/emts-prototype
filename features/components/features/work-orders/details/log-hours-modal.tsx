"use client";
/**
 * "Log Rendered Hours" (live: work-orders/details/modals/log-hours.tsx).
 *
 * Existing: hours and notes per surface, grouped by area, "Est: / Rendered:"
 * totals, TOTAL TO LOG, and the IN_PROGRESS-only rule.
 * NEW (feature 22): Crew member and Work date (live: always the logged-in
 * user, today), and optional Start / End. With times, the hours also go to
 * payroll as a clocked segment that the office approves.
 */
import { useEffect, useMemo, useState } from "react";
import type { Job, WorkOrder } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { LOG_HOURS_ALLOWED_STATUSES, logWorkOrderHours, renderedHoursBySurface } from "@/features/lib/store/actions/work-orders";
import { employeeFor } from "@/features/lib/store/actions/workforce";
import { specForSurface, jobSurfaceHours } from "@/features/lib/rules/estimate";
import { workDateOf } from "@/features/lib/rules/payroll";
import { now } from "@/features/lib/clock";
import { byId } from "@/features/lib/selectors";
import { toast } from "@/features/lib/toast";
import { Banner, Button, Field, Input, LiveLabel, Modal, NewBadge, Select, Textarea } from "@/features/components/ui";

export function LogHoursModal({ open, onOpenChange, wo, job }: { open: boolean; onOpenChange: (v: boolean) => void; wo: WorkOrder; job: Job }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const allowed = LOG_HOURS_ALLOWED_STATUSES.includes(wo.status);
  const rendered = renderedHoursBySurface(wo);
  const crew = useMemo(() => {
    const ids = new Set(wo.shifts.flatMap((s) => s.memberIds));
    return db.employees.filter((e) => ids.has(e.id) || e.userId === user.id);
  }, [db.employees, wo.shifts, user.id]);
  const [hours, setHours] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [employeeId, setEmployeeId] = useState("");
  const [workDate, setWorkDate] = useState(workDateOf(now()));
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<{ field?: string; message: string }>();

  useEffect(() => {
    if (!open) return;
    setHours({});
    setNotes({});
    setError(undefined);
    setEmployeeId(employeeFor(db, user)?.id ?? crew[0]?.id ?? "");
    setWorkDate(workDateOf(now()));
    setStart("");
    setEnd("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const surfaces = job.surfaceIds.map((id) => byId(db.surfaces, id)).filter((s) => !!s && !s.removedAt) as NonNullable<ReturnType<typeof byId<(typeof db.surfaces)[number]>>>[];
  const areas = Array.from(new Set(surfaces.map((s) => s.areaId))).map((id) => byId(db.areas, id)!);
  const total = Object.values(hours).reduce((a, v) => a + (Number(v) || 0), 0);

  function submit() {
    const r = act(logWorkOrderHours, wo.id, {
      entries: Object.entries(hours).map(([surfaceId, v]) => ({ surfaceId, hours: Number(v) || 0, notes: notes[surfaceId] })),
      employeeId: employeeId || undefined,
      workDate,
      start: start || undefined,
      end: end || undefined,
    });
    if (!r.ok) return setError({ field: r.field, message: r.error });
    toast.success(`Logged ${total} hours successfully`, start ? "Sent to Time for approval." : undefined);
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" title="Log Rendered Hours"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div className="text-xs font-bold uppercase tracking-widest text-gray-500">Total to log <span className="ml-1 text-base font-black text-gray-900">{total.toFixed(2)} hrs</span></div>
          <div className="flex gap-2">
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="primary" disabled={!allowed || total === 0} onClick={submit}>Log Hours</Button>
          </div>
        </div>
      }>
      <div className="space-y-5">
        {!allowed && (
          <Banner tone="warn">Cannot log time when work order is in {wo.status} status. Allowed statuses: {LOG_HOURS_ALLOWED_STATUSES.join(", ")}.</Banner>
        )}
        <div className="rounded-xl border border-green-200 bg-green-50/40 p-4">
          <div className="mb-3 flex items-center gap-2"><LiveLabel className="text-green-800">Who and when</LiveLabel><NewBadge feature={22} /></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Crew member" error={error?.field === "employeeId" ? error.message : undefined}>
              <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={!allowed} invalid={error?.field === "employeeId"}>
                <option value="">Me ({user.name})</option>
                {crew.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </Field>
            <Field label="Work date" error={error?.field === "workDate" ? error.message : undefined}>
              <Input type="date" value={workDate} max={workDateOf(now())} onChange={(e) => setWorkDate(e.target.value)} disabled={!allowed} />
            </Field>
            <Field label="Start (optional)">
              <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} disabled={!allowed} />
            </Field>
            <Field label="End (optional)" error={error?.field === "end" ? error.message : undefined}>
              <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} disabled={!allowed} invalid={error?.field === "end"} />
            </Field>
          </div>
          <p className="mt-2 text-xs text-gray-500">With a start and end, the time goes to payroll as a clocked segment. Only approved hours count for payroll and job cost.</p>
        </div>

        <p className="text-sm text-gray-500">Enter rendered hours for each surface. Only surfaces with hours entered will be logged.</p>
        {areas.map((a) => {
          const rows = surfaces.filter((s) => s.areaId === a.id);
          const est = rows.reduce((x, s) => x + jobSurfaceHours(db, job.id, s), 0);
          const ren = rows.reduce((x, s) => x + (rendered.get(s.id) ?? 0), 0);
          return (
            <div key={a.id} className="rounded-xl border border-gray-200">
              <div className="flex items-center justify-between rounded-t-xl bg-gray-50 px-4 py-2">
                <span className="text-sm font-bold text-gray-900">{a.name}</span>
                <span className="text-xs text-gray-500">Est: {est.toFixed(1)}h / Rendered: {ren.toFixed(1)}h</span>
              </div>
              <div className="divide-y divide-gray-100">
                {rows.map((s) => (
                  <div key={s.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{s.name}</div>
                        <div className="text-xs text-gray-500">Est: {jobSurfaceHours(db, job.id, s).toFixed(1)}h · Rendered: {(rendered.get(s.id) ?? 0).toFixed(1)}h</div>
                      </div>
                      <label className="flex items-center gap-2 text-xxs font-bold uppercase tracking-widest text-gray-500">
                        Log Hours
                        <Input type="number" min={0} step={0.25} placeholder="0" value={hours[s.id] ?? ""} onChange={(e) => setHours({ ...hours, [s.id]: e.target.value })} disabled={!allowed} className="h-9 w-24 text-right" aria-label={`Log hours for ${s.name}`} />
                      </label>
                    </div>
                    {Number(hours[s.id]) > 0 && (
                      <Textarea className="mt-2" rows={2} placeholder="Optional notes for this surface..." value={notes[s.id] ?? ""} onChange={(e) => setNotes({ ...notes, [s.id]: e.target.value })} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {error && !["employeeId", "workDate", "end"].includes(error.field ?? "") && <Banner tone="danger">{error.message}</Banner>}
      </div>
    </Modal>
  );
}
