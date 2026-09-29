"use client";
/** Closeout forms: confirm one surface, and the owner-only Record Unknown. */
import { useEffect, useState } from "react";
import type { CloseoutRow, Job, Sheen, UnknownException } from "@/features/types";
import { act, useDb } from "@/features/lib/store";
import { recordUnknown, saveCloseoutRow } from "@/features/lib/store/actions/property";
import { surfaceLabel } from "@/features/lib/selectors";
import { toast } from "@/features/lib/toast";
import { Banner, Button, Field, Input, Modal, Select, Switch, Textarea } from "@/features/components/ui";
import { fromDateInput, toDateInput, todayInput } from "@/features/components/features/properties/property-shared";

const SHEENS: Sheen[] = ["Flat", "Matte", "Eggshell", "Satin", "Semi-Gloss", "Gloss"];
const optNum = (v: string) => (v.trim() === "" ? undefined : Number(v));

export function CloseoutRowModal({ job, row, onClose }: { job: Job; row?: CloseoutRow; onClose: () => void }) {
  const db = useDb((d) => d);
  const [f, setF] = useState({ painted: true, notPaintedReason: "", manufacturer: "", colourName: "", colourNumber: "", hex: "#CBD5E1", product: "", sheen: "", coats: "", date: "", hours: "", gallons: "", photos: "", tint: "" });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    if (!row) return;
    setF({
      painted: row.painted,
      notPaintedReason: row.notPaintedReason ?? "",
      manufacturer: row.manufacturer,
      colourName: row.colourName,
      colourNumber: row.colourNumber,
      hex: row.hex,
      product: row.product,
      sheen: row.sheen ?? "",
      coats: row.coats ? String(row.coats) : "",
      date: toDateInput(row.completedAt),
      hours: row.actualHours === undefined ? "" : String(row.actualHours),
      gallons: row.actualGallons === undefined ? "" : String(row.actualGallons),
      photos: row.photoCount === undefined ? "" : String(row.photoCount),
      tint: row.tintFormula ?? "",
    });
    setErrors({});
  }, [row]);

  if (!row) return null;
  const unknownSheen = row.unknowns.some((u) => u.field === "sheen");
  const unknownDate = row.unknowns.some((u) => u.field === "completedAt");

  const save = (confirm: boolean) => {
    const res = act(saveCloseoutRow, job.id, {
      surfaceId: row.surfaceId,
      painted: f.painted,
      notPaintedReason: f.notPaintedReason,
      manufacturer: f.manufacturer,
      colourName: f.colourName,
      colourNumber: f.colourNumber,
      hex: f.hex,
      product: f.product,
      sheen: (f.sheen || undefined) as Sheen | "Unknown" | undefined,
      coats: optNum(f.coats),
      completedAt: fromDateInput(f.date),
      actualHours: optNum(f.hours),
      actualGallons: optNum(f.gallons),
      photoCount: optNum(f.photos),
      tintFormula: f.tint.trim() || undefined,
    }, confirm);
    if (!res.ok) {
      setErrors({ [res.field ?? "_"]: res.error });
      return;
    }
    toast.success(confirm ? "Surface confirmed" : "Progress saved", confirm ? surfaceLabel(db, row.surfaceId) : "Not yet confirmed. The job can't close until it is.");
    onClose();
  };

  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      size="lg"
      title={`Confirm ${surfaceLabel(db, row.surfaceId)}`}
      description="Prefilled from the approved specification. Change anything that was applied differently."
      footer={<><Button onClick={onClose}>Cancel</Button><Button onClick={() => save(false)}>Save progress</Button><Button variant="primary" onClick={() => save(true)}>Confirm surface</Button></>}
    >
      <div className="space-y-4">
        <Switch checked={f.painted} onCheckedChange={(v) => setF({ ...f, painted: v })} label="This surface was painted on this job" />
        {!f.painted ? (
          <Field label="Why not painted" required error={errors.notPaintedReason}>
            <Input value={f.notPaintedReason} invalid={!!errors.notPaintedReason} onChange={(e) => setF({ ...f, notPaintedReason: e.target.value })} placeholder="Removed from scope by change order" />
          </Field>
        ) : (
          <>
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">Required</div>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Manufacturer" required error={errors.colour} className="sm:col-span-1"><Input value={f.manufacturer} invalid={!!errors.colour} onChange={(e) => setF({ ...f, manufacturer: e.target.value })} /></Field>
              <Field label="Colour name" required className="sm:col-span-1"><Input value={f.colourName} onChange={(e) => setF({ ...f, colourName: e.target.value })} /></Field>
              <Field label="Colour number" required><Input value={f.colourNumber} onChange={(e) => setF({ ...f, colourNumber: e.target.value })} /></Field>
              <Field label="Product"><Input value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })} /></Field>
              <Field label="Sheen" required error={errors.sheen}>
                <Select value={f.sheen} invalid={!!errors.sheen} onChange={(e) => setF({ ...f, sheen: e.target.value })}>
                  <option value="">Choose…</option>
                  {SHEENS.map((s) => <option key={s}>{s}</option>)}
                  {unknownSheen && <option value="Unknown">Unknown (owner-approved)</option>}
                </Select>
              </Field>
              <Field label="Coats" required error={errors.coats}><Input type="number" min={1} step={1} value={f.coats} invalid={!!errors.coats} onChange={(e) => setF({ ...f, coats: e.target.value })} /></Field>
              <Field label="Surface completion date" required={!unknownDate} error={errors.completedAt} className="sm:col-span-2" hint={unknownDate ? "Unknown approved by the owner." : undefined}>
                <Input type="date" value={f.date} max={todayInput()} invalid={!!errors.completedAt} onChange={(e) => setF({ ...f, date: e.target.value })} />
              </Field>
            </div>
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">Optional actuals — leave blank if not recorded</div>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Hours" error={errors.actualHours}><Input type="number" min={0} step={0.25} value={f.hours} invalid={!!errors.actualHours} onChange={(e) => setF({ ...f, hours: e.target.value })} placeholder="Not recorded" /></Field>
              <Field label="Gallons used" error={errors.actualGallons}><Input type="number" min={0} step={0.25} value={f.gallons} invalid={!!errors.actualGallons} onChange={(e) => setF({ ...f, gallons: e.target.value })} placeholder="Not recorded" /></Field>
              <Field label="Photographs" error={errors.photoCount}><Input type="number" min={0} step={1} value={f.photos} invalid={!!errors.photoCount} onChange={(e) => setF({ ...f, photos: e.target.value })} placeholder="0" /></Field>
              <Field label="Tint formula"><Input value={f.tint} onChange={(e) => setF({ ...f, tint: e.target.value })} placeholder="Not recorded" /></Field>
            </div>
            <p className="text-xs text-gray-500">Blank actuals are saved as “Not recorded” — never as zero and never estimated.</p>
          </>
        )}
        {errors._ && <Banner tone="danger">{errors._}</Banner>}
      </div>
    </Modal>
  );
}

export function UnknownModal({ job, row, onClose }: { job: Job; row?: CloseoutRow; onClose: () => void }) {
  const db = useDb((d) => d);
  const [field, setField] = useState<UnknownException["field"]>("sheen");
  const [kind, setKind] = useState<UnknownException["kind"]>("subcontractor");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string>();
  useEffect(() => {
    setReason("");
    setErr(undefined);
  }, [row]);
  if (!row) return null;
  const save = () => {
    const res = act(recordUnknown, job.id, row.surfaceId, field, kind, reason);
    if (!res.ok) return setErr(res.field === "reason" ? res.error : undefined);
    toast.success("Unknown recorded", "The exception and your approval are kept with the application.");
    onClose();
  };
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} size="sm" title="Record Unknown" description={`${surfaceLabel(db, row.surfaceId)} — Business Owner only, for legacy or subcontractor work.`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Approve Unknown</Button></>}>
      <div className="space-y-3">
        <Field label="Field">
          <Select value={field} onChange={(e) => setField(e.target.value as UnknownException["field"])}>
            <option value="colour">Colour</option>
            <option value="sheen">Sheen</option>
            <option value="completedAt">Completion date</option>
          </Select>
        </Field>
        <Field label="Work type">
          <Select value={kind} onChange={(e) => setKind(e.target.value as UnknownException["kind"])}>
            <option value="subcontractor">Subcontractor work</option>
            <option value="legacy">Legacy work</option>
          </Select>
        </Field>
        <Field label="Reason" required error={err}><Textarea value={reason} invalid={!!err} onChange={(e) => setReason(e.target.value)} placeholder="Subcontractor did not return the product sheet." /></Field>
      </div>
    </Modal>
  );
}
