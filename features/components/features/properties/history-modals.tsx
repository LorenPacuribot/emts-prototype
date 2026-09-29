"use client";
/**
 * Paint History forms: correction (25.3), touch-up, customer-reported work,
 * mark surface removed, add / replace surface, and address correction.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, Send } from "lucide-react";
import type { Application, Property, Sheen, Surface, SurfaceType } from "@/features/types";
import { act, useDb } from "@/features/lib/store";
import { addSurface, correctAddress, correctApplication, logReportedWork, logTouchUp, markSurfaceRemoved, type CorrectionInput } from "@/features/lib/store/actions/property";
import { CORRECTION_FIELDS, correctionNeedsNotice, type CorrectionField } from "@/features/lib/rules/property";
import { surfaceLabel } from "@/features/lib/selectors";
import { toast } from "@/features/lib/toast";
import { Banner, Button, Field, Input, Modal, Select, Swatch, Textarea } from "@/features/components/ui";
import { colourText, fromDateInput, toDateInput, todayInput } from "./property-shared";

const SHEENS: Sheen[] = ["Flat", "Matte", "Eggshell", "Satin", "Semi-Gloss", "Gloss"];
type Errors = Record<string, string | undefined>;

function useErrors() {
  const [errors, setErrors] = useState<Errors>({});
  return {
    errors,
    clear: () => setErrors({}),
    fromResult: (res: { ok: boolean; error?: string; field?: string }) => {
      if (!res.ok) setErrors({ [res.field ?? "_form"]: res.error });
    },
    set: setErrors,
  };
}

/* ---------------------------- Correction ---------------------------- */

export function CorrectionModal({ app, onClose }: { app?: Application; onClose: () => void }) {
  const db = useDb((d) => d);
  const [field, setField] = useState<CorrectionField>("Colour");
  const [reason, setReason] = useState("");
  const [colour, setColour] = useState({ manufacturer: "", name: "", number: "", hex: "#CBD5E1" });
  const [text, setText] = useState("");
  const [coats, setCoats] = useState("");
  const [dateV, setDateV] = useState("");
  const [surfaceId, setSurfaceId] = useState("");
  const [photos, setPhotos] = useState("");
  const e = useErrors();

  useEffect(() => {
    if (!app) return;
    setField("Colour");
    setReason("");
    setColour({ manufacturer: app.manufacturer, name: app.colourName, number: app.colourNumber, hex: app.hex });
    setText(app.sheen);
    setCoats(String(app.coats));
    setDateV(toDateInput(app.completedAt));
    setSurfaceId(app.surfaceId);
    setPhotos(String(app.photoCount));
    e.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id]);

  if (!app) return null;
  const surfaces = db.surfaces.filter((s) => s.propertyId === app.propertyId && !s.removedAt);
  const notice = correctionNeedsNotice(field);

  const changeField = (f: CorrectionField) => {
    setField(f);
    e.clear();
    if (f === "Product") setText(app.product);
    if (f === "Sheen") setText(app.sheen);
  };

  const current: Record<CorrectionField, string> = {
    Colour: colourText(app) + ` (${app.manufacturer})`,
    Product: app.product,
    Sheen: app.sheen,
    Coats: String(app.coats),
    Location: surfaceLabel(db, app.surfaceId),
    "Completion date": app.completedAt ? new Date(app.completedAt).toLocaleDateString() : "Not recorded",
    Photographs: `${app.photoCount} photos`,
  };

  const save = () => {
    const input: CorrectionInput = { field, reason };
    if (field === "Colour") input.colour = colour;
    if (field === "Product" || field === "Sheen") input.text = text;
    if (field === "Coats") input.coats = Number(coats);
    if (field === "Location") input.surfaceId = surfaceId;
    if (field === "Completion date") input.date = fromDateInput(dateV);
    if (field === "Photographs") input.photoCount = photos === "" ? undefined : Number(photos);
    const res = act(correctApplication, app.id, input);
    e.fromResult(res);
    if (res.ok) {
      toast.success("Correction saved", res.value?.noticeRequired ? "Customer notice queued. A person must press Send." : "No customer notice is needed for this change.");
      onClose();
    }
  };

  return (
    <Modal
      open={!!app}
      onOpenChange={(v) => !v && onClose()}
      title={`Correct ${app.id}`}
      description={`${surfaceLabel(db, app.surfaceId)} · the old value, new value, author, date and reason are all kept.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save correction</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Field to correct" htmlFor="cor-field">
          <Select id="cor-field" value={field} onChange={(ev) => changeField(ev.target.value as CorrectionField)}>
            {CORRECTION_FIELDS.map((f) => <option key={f}>{f}</option>)}
          </Select>
        </Field>
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs">
          <span className="text-gray-500">Current value: </span>
          <span className="font-semibold text-ink">{current[field]}</span>
        </div>

        {field === "Colour" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Manufacturer" required error={e.errors.colour}>
              <Input value={colour.manufacturer} invalid={!!e.errors.colour} onChange={(ev) => setColour({ ...colour, manufacturer: ev.target.value })} />
            </Field>
            <Field label="Color name" required>
              <Input value={colour.name} onChange={(ev) => setColour({ ...colour, name: ev.target.value })} />
            </Field>
            <Field label="Color number" required>
              <Input value={colour.number} onChange={(ev) => setColour({ ...colour, number: ev.target.value })} />
            </Field>
            <Field label="Swatch">
              <div className="flex items-center gap-2">
                <Swatch hex={colour.hex} />
                <Input type="color" value={colour.hex} onChange={(ev) => setColour({ ...colour, hex: ev.target.value })} className="h-10 w-20 p-1" aria-label="Swatch color" />
              </div>
            </Field>
          </div>
        )}
        {field === "Product" && (
          <Field label="Corrected product" required error={e.errors.text}>
            <Input value={text} invalid={!!e.errors.text} onChange={(ev) => setText(ev.target.value)} list="catalog-products" />
            <datalist id="catalog-products">{db.catalog.map((c) => <option key={c.id} value={c.product} />)}</datalist>
          </Field>
        )}
        {field === "Sheen" && (
          <Field label="Corrected sheen" required error={e.errors.text}>
            <Select value={text} invalid={!!e.errors.text} onChange={(ev) => setText(ev.target.value)}>
              {SHEENS.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
        )}
        {field === "Coats" && (
          <Field label="Corrected coats" required error={e.errors.coats}>
            <Input type="number" min={1} step={1} value={coats} invalid={!!e.errors.coats} onChange={(ev) => setCoats(ev.target.value)} />
          </Field>
        )}
        {field === "Location" && (
          <Field label="Correct surface" required error={e.errors.surfaceId}>
            <Select value={surfaceId} invalid={!!e.errors.surfaceId} onChange={(ev) => setSurfaceId(ev.target.value)}>
              {surfaces.map((s) => <option key={s.id} value={s.id}>{surfaceLabel(db, s.id)}</option>)}
            </Select>
          </Field>
        )}
        {field === "Completion date" && (
          <Field label="Corrected completion date" required error={e.errors.date}>
            <Input type="date" value={dateV} max={todayInput()} invalid={!!e.errors.date} onChange={(ev) => setDateV(ev.target.value)} />
          </Field>
        )}
        {field === "Photographs" && (
          <Field label="Corrected photograph count" required error={e.errors.photoCount}>
            <Input type="number" min={0} step={1} value={photos} invalid={!!e.errors.photoCount} onChange={(ev) => setPhotos(ev.target.value)} />
          </Field>
        )}

        <Field label="Reason" required htmlFor="cor-reason" error={e.errors.reason} hint="For example: “Crew sheet recorded the wrong sheen; confirmed against the product receipt.”">
          <Textarea id="cor-reason" value={reason} invalid={!!e.errors.reason} onChange={(ev) => setReason(ev.target.value)} />
        </Field>

        {notice ? (
          <Banner tone="warn" title="Customer notice required">
            A change to {field.toLowerCase()} on a shared record notifies the verified current owner. The notice waits until someone presses Send.
          </Banner>
        ) : (
          <Banner tone="info" title="No customer notice">Date and photograph changes do not trigger a notice.</Banner>
        )}
        {e.errors._form && <Banner tone="danger">{e.errors._form}</Banner>}
      </div>
    </Modal>
  );
}

/* ----------------------------- Touch-up ----------------------------- */

export function TouchUpModal({ app, onClose }: { app?: Application; onClose: () => void }) {
  const db = useDb((d) => d);
  const [dateV, setDateV] = useState(todayInput());
  const [note, setNote] = useState("");
  const e = useErrors();
  useEffect(() => {
    setDateV(todayInput());
    setNote("");
    e.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id]);
  if (!app) return null;
  const save = () => {
    const res = act(logTouchUp, app.id, fromDateInput(dateV) ?? "", note);
    e.fromResult(res);
    if (res.ok) {
      toast.success("Touch-up logged", `Attached to ${app.id}. No new application was created.`);
      onClose();
    }
  };
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      size="sm"
      title="Log touch-up"
      description={`Attaches to ${app.id} (${colourText(app)}) on ${surfaceLabel(db, app.surfaceId)}. A partial repaint is a new application instead.`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Log touch-up</Button></>}
    >
      <div className="space-y-4">
        <Field label="Date" required error={e.errors.date}>
          <Input type="date" value={dateV} max={todayInput()} invalid={!!e.errors.date} onChange={(ev) => setDateV(ev.target.value)} />
        </Field>
        <Field label="What was touched up" required error={e.errors.note}>
          <Textarea value={note} invalid={!!e.errors.note} onChange={(ev) => setNote(ev.target.value)} placeholder="Scuffs behind the sofa, 2 sq ft" />
        </Field>
      </div>
    </Modal>
  );
}

/* ----------------------- Customer-reported work ---------------------- */

export function ReportedWorkModal({ open, onClose, property, defaultSurfaceId }: { open: boolean; onClose: () => void; property: Property; defaultSurfaceId?: string }) {
  const db = useDb((d) => d);
  const surfaces = db.surfaces.filter((s) => s.propertyId === property.id && !s.removedAt);
  const blank = { surfaceId: defaultSurfaceId ?? surfaces[0]?.id ?? "", manufacturer: "", colourName: "", colourNumber: "", hex: "#CBD5E1", product: "", sheen: "Unknown" as Sheen | "Unknown", coats: "1", date: "", source: "" };
  const [f, setF] = useState(blank);
  const e = useErrors();
  useEffect(() => {
    if (open) {
      setF(blank);
      e.clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const save = () => {
    const res = act(logReportedWork, property.id, { ...f, coats: Number(f.coats), completedAt: fromDateInput(f.date) });
    e.fromResult(res);
    if (res.ok) {
      toast.success("Recorded as Unverified", "Kept separate from crew-confirmed work and from contractor warranties.");
      onClose();
    }
  };
  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Log customer-reported work"
      description="Work by another contractor or the homeowner. It is labelled Unverified with its source and never treated as confirmed."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Record as Unverified</Button></>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Surface" required className="sm:col-span-2" error={e.errors.surfaceId}>
          <Select value={f.surfaceId} invalid={!!e.errors.surfaceId} onChange={(ev) => setF({ ...f, surfaceId: ev.target.value })}>
            {surfaces.map((s) => <option key={s.id} value={s.id}>{surfaceLabel(db, s.id)}</option>)}
          </Select>
        </Field>
        <Field label="Manufacturer"><Input value={f.manufacturer} onChange={(ev) => setF({ ...f, manufacturer: ev.target.value })} placeholder="Behr" /></Field>
        <Field label="Product"><Input value={f.product} onChange={(ev) => setF({ ...f, product: ev.target.value })} placeholder="Ultra Scuff Defense" /></Field>
        <Field label="Color name" required error={e.errors.colourName}>
          <Input value={f.colourName} invalid={!!e.errors.colourName} onChange={(ev) => setF({ ...f, colourName: ev.target.value })} placeholder="Unknown" />
        </Field>
        <Field label="Color number"><Input value={f.colourNumber} onChange={(ev) => setF({ ...f, colourNumber: ev.target.value })} /></Field>
        <Field label="Sheen">
          <Select value={f.sheen} onChange={(ev) => setF({ ...f, sheen: ev.target.value as Sheen })}>
            <option value="Unknown">Unknown</option>
            {SHEENS.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Coats" required error={e.errors.coats}>
          <Input type="number" min={1} value={f.coats} invalid={!!e.errors.coats} onChange={(ev) => setF({ ...f, coats: ev.target.value })} />
        </Field>
        <Field label="Approximate date" error={e.errors.completedAt}>
          <Input type="date" value={f.date} max={todayInput()} onChange={(ev) => setF({ ...f, date: ev.target.value })} />
        </Field>
        <Field label="Swatch">
          <Input type="color" value={f.hex} onChange={(ev) => setF({ ...f, hex: ev.target.value })} className="h-10 w-20 p-1" aria-label="Swatch color" />
        </Field>
        <Field label="Source" required className="sm:col-span-2" error={e.errors.source} hint="Who told us, how and when.">
          <Input value={f.source} invalid={!!e.errors.source} onChange={(ev) => setF({ ...f, source: ev.target.value })} placeholder="Homeowner phone call — painted by Fresh Coat Co." />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------- Remove / add surface ---------------------- */

export function RemoveSurfaceModal({ surface, onClose }: { surface?: Surface; onClose: () => void }) {
  const db = useDb((d) => d);
  const [dateV, setDateV] = useState(todayInput());
  const [reason, setReason] = useState("");
  const e = useErrors();
  useEffect(() => {
    setDateV(todayInput());
    setReason("");
    e.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface?.id]);
  if (!surface) return null;
  const count = db.applications.filter((a) => a.surfaceId === surface.id).length;
  const save = () => {
    const res = act(markSurfaceRemoved, surface.id, fromDateInput(dateV) ?? "", reason);
    e.fromResult(res);
    if (res.ok) {
      toast.success("Surface marked Removed", `${count} application${count === 1 ? "" : "s"} kept and still openable.`);
      onClose();
    }
  };
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      size="sm"
      title={`Mark ${surface.name} removed`}
      description={surfaceLabel(db, surface.id)}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="dark" className="bg-red-600 hover:bg-red-700" onClick={save}>Mark Removed</Button></>}
    >
      <div className="space-y-4">
        <Banner tone="info">A surface is never deleted. It stays in the tree, struck through, and its {count} application{count === 1 ? "" : "s"} remain in the record.</Banner>
        <Field label="Removal date" required error={e.errors.date}>
          <Input type="date" value={dateV} max={todayInput()} invalid={!!e.errors.date} onChange={(ev) => setDateV(ev.target.value)} />
        </Field>
        <Field label="Reason" required error={e.errors.reason}>
          <Input value={reason} invalid={!!e.errors.reason} onChange={(ev) => setReason(ev.target.value)} placeholder="Wall demolished in kitchen remodel" />
        </Field>
      </div>
    </Modal>
  );
}

const SURFACE_TYPES: SurfaceType[] = ["walls", "ceiling", "trim", "door", "body", "siding", "cabinets"];

export function AddSurfaceModal({ open, onClose, property, onAdded }: { open: boolean; onClose: () => void; property: Property; onAdded: (id: string) => void }) {
  const db = useDb((d) => d);
  const areas = db.areas.filter((a) => a.propertyId === property.id);
  const live = db.surfaces.filter((s) => s.propertyId === property.id && !s.removedAt);
  const blank = { areaId: areas[0]?.id ?? "", name: "", type: "walls" as SurfaceType, sqft: "", replaces: "" };
  const [f, setF] = useState(blank);
  const e = useErrors();
  useEffect(() => {
    if (open) {
      setF(blank);
      e.clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const save = () => {
    const res = act(addSurface, property.id, { areaId: f.areaId, name: f.name, type: f.type, areaSqft: Number(f.sqft), replacesSurfaceId: f.replaces || undefined });
    e.fromResult(res);
    if (res.ok) {
      toast.success("Surface added", f.replaces ? "The replaced surface is marked Removed. Its applications stay accessible." : undefined);
      onAdded(res.value as string);
      onClose();
    }
  };
  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title="Add surface" description="A replacement, such as new siding, is a new surface record. The old surface keeps its history." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Add surface</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Room or elevation" required error={e.errors.areaId}>
          <Select value={f.areaId} onChange={(ev) => setF({ ...f, areaId: ev.target.value, replaces: "" })}>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={f.type} onChange={(ev) => setF({ ...f, type: ev.target.value as SurfaceType })}>
            {SURFACE_TYPES.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
          </Select>
        </Field>
        <Field label="Surface name" required error={e.errors.name}>
          <Input value={f.name} invalid={!!e.errors.name} onChange={(ev) => setF({ ...f, name: ev.target.value })} placeholder="New fibre-cement siding" />
        </Field>
        <Field label="Area (sq ft)" required error={e.errors.areaSqft}>
          <Input type="number" min={1} value={f.sqft} invalid={!!e.errors.areaSqft} onChange={(ev) => setF({ ...f, sqft: ev.target.value })} />
        </Field>
        <Field label="Replaces an existing surface?" className="sm:col-span-2" error={e.errors.replacesSurfaceId}>
          <Select value={f.replaces} onChange={(ev) => setF({ ...f, replaces: ev.target.value })}>
            <option value="">No — this is an additional surface</option>
            {live.filter((s) => s.areaId === f.areaId).map((s) => <option key={s.id} value={s.id}>Replaces {s.name} ({s.id})</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

/* ---------------------------- Address fix ---------------------------- */

export function AddressModal({ open, onClose, property }: { open: boolean; onClose: () => void; property: Property }) {
  const db = useDb((d) => d);
  const [address, setAddress] = useState(property.address);
  const e = useErrors();
  useEffect(() => {
    if (open) {
      setAddress(property.address);
      e.clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const jobs = db.jobs.filter((j) => j.propertyId === property.id).length;
  const save = () => {
    const res = act(correctAddress, property.id, address);
    e.fromResult(res);
    if (res.ok) {
      toast.success("Address corrected", `${property.id} is unchanged. ${jobs} job${jobs === 1 ? "" : "s"} still attached.`);
      onClose();
    }
  };
  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} size="sm" title="Correct address" description="Fixes a typo. The stable identifier behind the address never changes, so earlier jobs stay attached and nothing is merged." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save address</Button></>}>
      <div className="space-y-4">
        <Field label="Street address" required error={e.errors.address}>
          <Input value={address} invalid={!!e.errors.address} onChange={(ev) => setAddress(ev.target.value)} />
        </Field>
        <div className="flex items-start gap-2 text-xs text-gray-500">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> To combine two records for the same address, use a merge request on Owners &amp; Consent. It needs the Business Owner&apos;s individual approval.
        </div>
      </div>
    </Modal>
  );
}

export function SendNoticeButton({ onSend, disabled }: { onSend: () => void; disabled?: boolean }) {
  return (
    <Button size="sm" variant="primary" onClick={onSend} disabled={disabled}>
      <Send className="h-3.5 w-3.5" /> Send notice
    </Button>
  );
}

