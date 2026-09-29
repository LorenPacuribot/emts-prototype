"use client";
/**
 * Feature 22 — Mobile Clock (component 22.1).
 * Menu: Workforce > Mobile Clock
 *
 * The crew lead clocks the crew in and out at the job. Signal and location
 * are simulated with two switches: punches taken offline are queued on the
 * device and keep their captured time; a denied location records a flag and
 * never blocks clock-in.
 */
import { punchTagLabel } from "@/features/lib/rules/shift-tag";
import { useState } from "react";
import { ArrowRightLeft, LogIn, LogOut, MapPinOff, RefreshCw, Smartphone, WifiOff, FlaskConical } from "lucide-react";
import type { ActivityCode } from "@/features/types";
import { act, useCurrentUser, useDb, useStore } from "@/features/lib/store";
import { byId } from "@/features/lib/selectors";
import { toast } from "@/features/lib/toast";
import { AppLink } from "@/features/lib/navigation";
import { ACTIVITY_LABEL, OVERHEAD_ACTIVITIES, conflictPairs, elapsedMinutes, hm, openSegment } from "@/features/lib/rules/payroll";
import { now } from "@/features/lib/clock";
import { changeJob, clockIn, clockOut, setActivity, syncOffline } from "@/features/lib/store/actions/workforce";
import { PageHeader } from "@/features/components/layout/screen";
import { Badge, Banner, Button, Card, CardLabel, EmptyState, Field, Modal, Select, Switch } from "@/features/components/ui";
import { WorkforceFrame } from "./workforce-frame";
import { timeLabel } from "./shared";

const ACTIVITIES = Object.keys(ACTIVITY_LABEL) as ActivityCode[];

export function ClockScreen() {
  return (
    <WorkforceFrame tab="clock">
      <Clock />
    </WorkforceFrame>
  );
}

function Clock() {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  useStore((s) => s.clockMode);
  const [offline, setOffline] = useState(false);
  const [denied, setDenied] = useState(false);
  const [jobId, setJobId] = useState("JOB-2026-1");
  const [activity, setAct] = useState<ActivityCode>("application");
  const [changing, setChanging] = useState<string>();
  const [newJob, setNewJob] = useState("");
  const opts = { offline, locationDenied: denied };

  const jobs = db.jobs.filter((j) => j.status !== "completed" && j.contractSigned);
  const crew = db.employees.filter((e) => e.crewId === "CREW-1" && !e.offboardedAt);
  const queued = db.timeSegments.filter((s) => s.queued);
  const conflicts = conflictPairs(db.timeSegments).length;
  const overhead = OVERHEAD_ACTIVITIES.includes(activity);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        eyebrow={<Badge tone="blue" icon={<Smartphone className="h-3 w-3" />}>Crew lead phone</Badge>}
        title="Mobile Clock"
        subtitle="Clock the crew in and out at the job. Pick the job and activity first."
      />

      {denied && <p className="mb-4 flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><MapPinOff className="h-3.5 w-3.5 shrink-0" /> Location is off. Clock-in still works — each punch records a flag and the crew is prompted to turn location on. There is no continuous tracking.</p>}

      {queued.length > 0 && (
        <Banner
          tone="warn"
          className="mb-4"
          title={`Offline — ${queued.length} punch${queued.length === 1 ? "" : "es"} queued. They will sync automatically.`}
          action={<Button size="sm" disabled={offline} onClick={() => { const r = act(syncOffline); if (r.ok) toast.success("Punches synchronised", "Original timestamps kept, marked Offline."); }}><RefreshCw className="h-3.5 w-3.5" /> Sync now</Button>}
        >
          {offline ? "Turn signal back on to sync." : "Signal is back. Sync now, or they upload on the next punch."} Queued punches are never dropped.
        </Banner>
      )}
      {conflicts > 0 && (
        <Banner tone="danger" className="mb-4" title={`${conflicts} offline conflict${conflicts === 1 ? "" : "s"} to resolve`} action={<AppLink href="/time"><Button size="sm">Review</Button></AppLink>}>
          An offline punch overlaps a later online punch. You choose which one is right; the other stays visible with zero hours.
        </Banner>
      )}

      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="Job" required hint={overhead ? "Training and rained-out time is overhead — no job is charged." : undefined}>
          <Select value={overhead ? "" : jobId} disabled={overhead} onChange={(e) => setJobId(e.target.value)} aria-label="Job">
            <option value="">— Select job —</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.id} · {j.name}</option>)}
          </Select>
        </Field>
        <Field label="Activity">
          <Select value={activity} onChange={(e) => setAct(e.target.value as ActivityCode)} aria-label="Activity">
            {ACTIVITIES.map((a) => <option key={a} value={a}>{ACTIVITY_LABEL[a]}</option>)}
          </Select>
        </Field>
      </Card>

      <div className="space-y-2.5" data-tour="clock-roster">
        {crew.length === 0 && <EmptyState title="No crew members" body="Add employees to the crew under Employees & Crews." />}
        {crew.map((e) => {
          const seg = openSegment(db.timeSegments, e.id);
          return (
            <Card key={e.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-display text-base font-bold text-ink">{e.name}{e.userId === user.id && <span className="ml-1.5 text-xs font-medium text-gray-400">(you)</span>}</div>
                  {seg ? (
                    <div className="mt-0.5 text-xs text-gray-600">
                      In since {timeLabel(seg.start)} · {seg.jobId ?? "Overhead"}{seg.shiftId ? ` · ${punchTagLabel(db, seg)}` : ""} · {ACTIVITY_LABEL[seg.activity]} · {hm(elapsedMinutes(seg.start, now()))}
                      <div className="mt-1 flex flex-wrap gap-1">
                        {seg.source === "offline" && <Badge tone="blue" icon={<WifiOff className="h-3 w-3" />}>Offline</Badge>}
                        {seg.queued && <Badge tone="amber">Queued</Badge>}
                        {seg.location === "denied" && <Badge tone="amber">Location denied</Badge>}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-0.5 text-xs text-gray-400">Not clocked in</div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  {seg ? (
                    <Button size="sm" variant="primary" onClick={() => act(clockOut, e.id, opts).ok && toast.success(`${e.name} clocked out`, offline ? "Queued until signal returns." : undefined)}>
                      <LogOut className="h-3.5 w-3.5" /> Clock Out
                    </Button>
                  ) : (
                    <Button size="sm" variant="primary" onClick={() => act(clockIn, e.id, overhead ? undefined : jobId, activity, opts).ok && toast.success(`${e.name} clocked in`, offline ? "Queued on this phone with the captured time." : denied ? "Location flag recorded." : undefined)}>
                      <LogIn className="h-3.5 w-3.5" /> Clock In
                    </Button>
                  )}
                  {seg && (
                    <Button size="sm" onClick={() => { setChanging(e.id); setNewJob(""); }}>
                      <ArrowRightLeft className="h-3.5 w-3.5" /> Change Job
                    </Button>
                  )}
                </div>
              </div>
              {seg && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                  {ACTIVITIES.map((a) => (
                    <button
                      key={a}
                      onClick={() => act(setActivity, e.id, a, opts).ok && toast.success(`${e.name}: ${ACTIVITY_LABEL[a]}`)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${seg.activity === a ? "border-ink bg-ink text-white" : "border-line bg-white text-gray-600 hover:bg-gray-50"}`}
                    >
                      {ACTIVITY_LABEL[a]}
                    </button>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Modal
        open={!!changing}
        onOpenChange={(v) => !v && setChanging(undefined)}
        size="sm"
        title={`Change job — ${byId(db.employees, changing)?.name ?? ""}`}
        description="Ends the current punch and starts travel. Travel between jobs is charged to the second job."
        footer={
          <>
            <Button onClick={() => setChanging(undefined)}>Cancel</Button>
            <Button variant="primary" onClick={() => { if (act(changeJob, changing!, newJob, opts).ok) { toast.success("Job changed", `Travel charged to ${newJob}.`); setChanging(undefined); } }}>Start travel</Button>
          </>
        }
      >
        <Field label="Travelling to" required>
          <Select value={newJob} onChange={(e) => setNewJob(e.target.value)}>
            <option value="">— Select job —</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.id} · {j.name}</option>)}
          </Select>
        </Field>
      </Modal>

      {/* Prototype-only device simulation (M5): out of the crew's way, still one click away. */}
      <details className="mt-6 rounded-xl border border-dashed border-amber-400 bg-amber-50/50 p-4" open={offline || denied || undefined}>
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-amber-900">
          <FlaskConical className="h-4 w-4" aria-hidden /> Demo controls
          <span className="rounded bg-amber-200/70 px-1 text-xxs font-bold uppercase tracking-wide">Demo</span>
        </summary>
        <div className="mt-3 space-y-2">
          <p className="text-xs text-amber-900/80">Simulate the crew lead's phone.</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Switch checked={offline} onCheckedChange={setOffline} label={<span className="text-xs">No signal</span>} />
            <Switch checked={denied} onCheckedChange={setDenied} label={<span className="text-xs">Location permission denied</span>} />
          </div>
        </div>
      </details>
    </div>
  );
}
