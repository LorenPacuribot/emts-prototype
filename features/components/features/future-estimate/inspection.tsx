"use client";
/**
 * Component 28.2 — Inspection Gate.
 * Exterior: saved site visit with a measurement date and at least one photo.
 * Small interior (one room or <= 400 sq ft walls + ceilings): photos + a call.
 * Evaluated at issue time, so the estimator can build first and inspect after.
 */
import { useState } from "react";
import { Camera, CheckCircle2, ClipboardCheck, PhoneCall, Ruler } from "lucide-react";
import type { RepeatEstimate } from "@/features/types";
import { act, useDb } from "@/features/lib/store";
import { recordInspection, repGate } from "@/features/lib/store/actions/future-estimate";
import { SMALL_INTERIOR_MAX_SQFT } from "@/features/lib/rules/future-estimate";
import { dateLong } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { cn } from "@/features/lib/cn";
import { Banner, Button, Card, CardLabel, Field, Input, KV, Modal, Textarea } from "@/features/components/ui";
import { fromDateInput, toDateInput, todayInput } from "@/features/components/features/properties/property-shared";

export function InspectionPanel({ rep, readOnly, onRecord }: { rep: RepeatEstimate; readOnly: boolean; onRecord: () => void }) {
  const db = useDb((d) => d);
  const { scope, gate } = repGate(db, rep);
  const i = rep.inspection;
  return (
    <Card className="p-5">
      <CardLabel icon={<ClipboardCheck />} right={!readOnly && <Button size="sm" onClick={onRecord}>{i ? "Update" : "Record Inspection"}</Button>}>
        Inspection
      </CardLabel>
      <div className="mt-3 space-y-3">
        {gate.met ? (
          <Banner tone="success" title="Gate met">{gate.summary}</Banner>
        ) : (
          <Banner tone="danger" title="Inspection evidence required">
            <ul className="list-disc pl-4">{gate.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          </Banner>
        )}
        <KV
          items={[
            ["Scope", scope.hasExterior ? "Includes exterior" : `Interior · ${scope.rooms} room${scope.rooms === 1 ? "" : "s"}`],
            ["Walls + ceilings", scope.hasExterior ? "—" : `${scope.wallCeilingSqft} sq ft`],
            ["Small-interior path", gate.smallInteriorAvailable ? "Available" : scope.hasExterior ? "Not for exterior work" : `Unavailable (over ${SMALL_INTERIOR_MAX_SQFT} sq ft and more than one room)`],
            ...(i
              ? ([
                  ["Path", i.path === "site_visit" ? "Site visit" : "Photos + phone call"],
                  ...(i.path === "site_visit"
                    ? ([["Site visit", dateLong(i.visitDate)], ["Measured", i.measurementDate ? dateLong(i.measurementDate) : "Not recorded"]] as [string, string][])
                    : ([["Call", `${dateLong(i.callDate)}${i.callNote ? ` — ${i.callNote}` : ""}`]] as [string, string][])),
                  ["Photographs", String(i.photos)],
                ] as [string, string][])
              : ([["Evidence", "None recorded yet"]] as [string, string][])),
          ]}
        />
      </div>
    </Card>
  );
}

export function InspectionModal({ rep, open, onOpenChange }: { rep: RepeatEstimate; open: boolean; onOpenChange: (v: boolean) => void }) {
  const db = useDb((d) => d);
  const { scope, gate } = repGate(db, rep);
  const i = rep.inspection;
  const [path, setPath] = useState<"site_visit" | "small_interior">(i?.path ?? "site_visit");
  const [visit, setVisit] = useState(toDateInput(i?.visitDate) || todayInput());
  const [measured, setMeasured] = useState(toDateInput(i?.measurementDate));
  const [photos, setPhotos] = useState(i?.photos ?? 0);
  const [callDate, setCallDate] = useState(toDateInput(i?.callDate));
  const [callNote, setCallNote] = useState(i?.callNote ?? "");
  const [err, setErr] = useState<{ field?: string; msg: string }>();

  const save = () => {
    const res = act(recordInspection, rep.id, {
      path,
      visitDate: path === "site_visit" ? fromDateInput(visit) : undefined,
      measurementDate: path === "site_visit" ? fromDateInput(measured) : undefined,
      photos,
      callDate: path === "small_interior" ? fromDateInput(callDate) : undefined,
      callNote,
    });
    if (!res.ok) return setErr({ field: res.field, msg: res.error });
    toast.success(path === "site_visit" ? "Site visit recorded" : "Small-interior evidence recorded", photos === 0 ? "Attach at least one photograph before issuing." : undefined);
    onOpenChange(false);
  };

  const e = (f: string) => (err?.field === f ? err.msg : undefined);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Record inspection"
      description={`${rep.id} · ${scope.hasExterior ? "Exterior work" : `Interior, ${scope.wallCeilingSqft} sq ft walls + ceilings across ${scope.rooms} room${scope.rooms === 1 ? "" : "s"}`}`}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save evidence</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {(["site_visit", "small_interior"] as const).map((p) => {
            const unavailable = p === "small_interior" && !gate.smallInteriorAvailable;
            return (
              <button
                key={p}
                onClick={() => { setPath(p); setErr(undefined); }}
                aria-pressed={path === p}
                className={cn("rounded-xl border px-3 py-3 text-left text-[12.5px]", path === p ? "border-brand bg-brand-soft/40" : "border-line hover:bg-slate-50", unavailable && "opacity-60")}
              >
                <div className="flex items-center gap-2 font-semibold text-ink">
                  {p === "site_visit" ? <Ruler className="h-4 w-4" /> : <PhoneCall className="h-4 w-4" />}
                  {p === "site_visit" ? "Site visit" : "Small interior: photos + call"}
                </div>
                <div className="mt-1 text-slate-500">
                  {p === "site_visit" ? "Visit date, measurement date, at least one photograph." : unavailable ? (scope.hasExterior ? "Not available for exterior work." : `Not available: over ${SMALL_INTERIOR_MAX_SQFT} sq ft and more than one room.`) : "One room, or up to 400 sq ft of walls and ceilings."}
                </div>
              </button>
            );
          })}
        </div>
        {err && !err.field && <Banner tone="danger">{err.msg}</Banner>}
        {err?.field === "path" && <Banner tone="danger">{err.msg}</Banner>}
        {path === "site_visit" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Site visit date" required htmlFor="visit" error={e("visitDate")}>
              <Input id="visit" type="date" value={visit} max={todayInput()} onChange={(ev) => setVisit(ev.target.value)} invalid={!!e("visitDate")} />
            </Field>
            <Field label="Measurement date" htmlFor="measured" error={e("measurementDate")} hint="Required before the quote can be issued.">
              <Input id="measured" type="date" value={measured} max={todayInput()} onChange={(ev) => setMeasured(ev.target.value)} />
            </Field>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone call date" required htmlFor="call" error={e("callDate")}>
              <Input id="call" type="date" value={callDate} max={todayInput()} onChange={(ev) => setCallDate(ev.target.value)} invalid={!!e("callDate")} />
            </Field>
            <Field label="Call notes" htmlFor="callnote" className="sm:col-span-2">
              <Textarea id="callnote" value={callNote} onChange={(ev) => setCallNote(ev.target.value)} placeholder="Who you spoke to, what they described about current condition" />
            </Field>
          </div>
        )}
        <Field label="Photographs" error={e("photos")} hint={path === "site_visit" ? "At least one photograph is needed before issue." : "At least one photograph is required."}>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={() => setPhotos((n) => n + 1)}>
              <Camera className="h-3.5 w-3.5" /> Attach photograph
            </Button>
            <span className="text-[12.5px] text-slate-600">{photos} attached</span>
            {photos > 0 && (
              <>
                <span className="inline-flex items-center gap-1 text-[12px] text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> OK</span>
                <button className="text-[11.5px] text-slate-400 hover:text-red-600" onClick={() => setPhotos((n) => Math.max(0, n - 1))}>Remove one</button>
              </>
            )}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
