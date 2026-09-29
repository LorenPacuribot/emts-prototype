"use client";
/**
 * "Log Material Usage" (patent 20): gallons used on a surface, logged during
 * production. Each entry adds to the surface's actual gallons on the
 * closeout checklist, which feeds estimated-vs-actual, the paint history and
 * future estimates. Logging never changes the crew lead's confirmation.
 */
import { useEffect, useState } from "react";
import type { Job, WorkOrder } from "@/features/types";
import { act, useDb } from "@/features/lib/store";
import { LOG_HOURS_ALLOWED_STATUSES } from "@/features/lib/store/actions/work-orders";
import { closeoutRowsFor, logMaterialUsage } from "@/features/lib/store/actions/property";
import { specForSurface } from "@/features/lib/rules/estimate";
import { surfaceLabel } from "@/features/lib/selectors";
import { toast } from "@/features/lib/toast";
import { Banner, Button, Field, Input, Modal, Select, Textarea } from "@/features/components/ui";
import { fromDateInput, todayInput } from "@/features/components/features/properties/property-shared";

export function LogMaterialModal({ open, onOpenChange, wo, job }: { open: boolean; onOpenChange: (v: boolean) => void; wo: WorkOrder; job: Job }) {
  const db = useDb((d) => d);
  const allowed = LOG_HOURS_ALLOWED_STATUSES.includes(wo.status);
  const rows = closeoutRowsFor(db, job);
  const [surfaceId, setSurfaceId] = useState("");
  const [gallons, setGallons] = useState("");
  const [date, setDate] = useState(todayInput());
  const [note, setNote] = useState("");
  const [error, setError] = useState<{ field?: string; message: string }>();

  useEffect(() => {
    if (!open) return;
    setSurfaceId("");
    setGallons("");
    setDate(todayInput());
    setNote("");
    setError(undefined);
  }, [open]);

  const row = rows.find((r) => r.surfaceId === surfaceId);
  const spec = surfaceId ? specForSurface(db, job.id, surfaceId) : undefined;
  const colour = spec && db.colours.find((c) => c.id === spec.colourId);

  function submit() {
    const r = act(logMaterialUsage, job.id, { surfaceId, gallons: Number(gallons), date: fromDateInput(date) ?? "", note });
    if (!r.ok) return setError({ field: r.field, message: r.error });
    toast.success(`Logged ${Number(gallons)} gal`, `${surfaceLabel(db, surfaceId)}: ${r.value} gal used so far.`);
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Log Material Usage"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!allowed || !surfaceId || !gallons} onClick={submit}>Log Usage</Button>
        </>
      }>
      <div className="space-y-4">
        {!allowed && <Banner tone="warn">Material usage can be logged once the work order is In Progress.</Banner>}
        {error && !error.field && <Banner tone="danger">{error.message}</Banner>}
        <Field label="Surface" required error={error?.field === "surfaceId" ? error.message : undefined}>
          <Select value={surfaceId} onChange={(e) => setSurfaceId(e.target.value)} disabled={!allowed} invalid={error?.field === "surfaceId"}>
            <option value="">Choose a surface…</option>
            {rows.map((r) => (
              <option key={r.surfaceId} value={r.surfaceId}>{surfaceLabel(db, r.surfaceId)}</option>
            ))}
          </Select>
        </Field>
        {surfaceId && (
          <p className="text-xs text-gray-500">
            {colour ? `${colour.manufacturer} ${colour.name} ${colour.number}` : "No colour assigned"}
            {spec?.product ? ` · ${spec.product}` : ""}
            {spec?.sheen ? ` · ${spec.sheen}` : ""}
            {" · "}{row?.actualGallons === undefined ? "nothing logged yet" : `${row.actualGallons} gal logged so far`}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Gallons used" required error={error?.field === "gallons" ? error.message : undefined}>
            <Input type="number" min={0} step={0.25} value={gallons} onChange={(e) => setGallons(e.target.value)} placeholder="e.g. 2.5" disabled={!allowed} invalid={error?.field === "gallons"} />
          </Field>
          <Field label="Date used" required error={error?.field === "date" ? error.message : undefined}>
            <Input type="date" value={date} max={todayInput()} onChange={(e) => setDate(e.target.value)} disabled={!allowed} invalid={error?.field === "date"} />
          </Field>
        </div>
        <Field label="Note" hint="Optional, e.g. opened a second bucket for the back wall">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={!allowed} />
        </Field>
      </div>
    </Modal>
  );
}
