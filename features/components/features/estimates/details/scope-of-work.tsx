"use client";
/**
 * "Area & Line Items" section (live: estimates/details/components/scope-of-work.tsx).
 *
 * Rebuilt only as far as the new features need: area blocks with the live
 * columns ITEM, AMOUNT, COATS, COLOR, HOURS, EST. GAL, PAINT SURFACE, the
 * "Add Line Item" row and the "Add to Estimate +" button. Clicking a row in
 * paint mode assigns the colour (live paint bucket). Nothing here is new.
 *
 * Prototype note: the live scope has L / W / H per area, formula columns and
 * priced or descriptive line items. The new features only need measured
 * surfaces, so this stand-in takes the amount in square feet directly.
 */
import { useMemo, useState } from "react";
import { Grid3x3, GripVertical, MoreVertical, PaintBucket, Plus, Trash2 } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { AreaKind, Job, RoomType, SurfaceCondition, SurfaceType } from "@/features/types";
import { act, useDb } from "@/features/lib/store";
import { addEstimateArea, addScopeSurface, assignSurfaceColour, removeScopeSurface, updateScopeSurface } from "@/features/lib/store/actions/estimates";
import { specDemand } from "@/features/lib/rules/procurement";
import { paintSurfaceFor, specForSurface, jobSurfaceHours } from "@/features/lib/rules/estimate";
import { labelRoomType } from "@/features/lib/rules/lifespan";
import { toast } from "@/features/lib/toast";
import { cn } from "@/features/lib/cn";
import { Banner, Button, EstimateSection, Field, Input, Modal, SectionHeader, Select, Swatch } from "@/features/components/ui";

const SURFACE_TYPES: { value: SurfaceType; label: string; unit: string }[] = [
  { value: "walls", label: "Walls", unit: "SQFT" },
  { value: "ceiling", label: "Ceiling", unit: "SQFT" },
  { value: "trim", label: "Trim / Baseboard", unit: "SQFT" },
  { value: "door", label: "Door", unit: "SQFT" },
  { value: "cabinets", label: "Cabinets", unit: "SQFT" },
  { value: "siding", label: "Siding", unit: "SQFT" },
  { value: "body", label: "Exterior body", unit: "SQFT" },
];
const ROOM_TYPES: RoomType[] = ["living_room", "bedroom", "kitchen", "bathroom", "hall_stairs", "exterior_body", "exterior_trim"];
const PAINT_SURFACE_LABEL = { SMOOTH: "Smooth", MEDIUM: "Medium", ROUGH: "Rough" } as const;
const CONDITION_FOR = { SMOOTH: "sound", MEDIUM: "new_drywall", ROUGH: "rough" } as const;

export function ScopeOfWork({ estimateId, job, editable, paintColourId, onPainted }: {
  estimateId: string;
  job: Job;
  editable: boolean;
  paintColourId?: string;
  onPainted?: () => void;
}) {
  const db = useDb((d) => d);
  const [addOpen, setAddOpen] = useState(false);
  const [areaModal, setAreaModal] = useState(false);
  const [itemFor, setItemFor] = useState<string>();

  // Gallons per surface: each surface's share of its specification's demand.
  const galBySurface = useMemo(() => {
    const m = new Map<string, number>();
    for (const spec of db.specs.filter((s) => s.jobId === job.id && s.state !== "superseded")) {
      const line = specDemand(db, spec);
      for (const p of line.parts) m.set(p.surfaceId, (m.get(p.surfaceId) ?? 0) + p.baseNeedGal * (1 + line.waste));
    }
    return m;
  }, [db, job.id]);

  const scope = job.surfaceIds.map((id) => db.surfaces.find((s) => s.id === id)).filter((s) => !!s && !s.removedAt) as NonNullable<ReturnType<typeof db.surfaces.find>>[];
  const areaIds = Array.from(new Set(scope.map((s) => s.areaId)));
  // Areas added on this estimate that don't have a line item yet.
  const emptyAreas = db.areas.filter((a) => a.propertyId === job.propertyId && a.id.startsWith("AR-E") && !db.surfaces.some((s) => s.areaId === a.id)).map((a) => a.id);
  const areas = [...areaIds, ...emptyAreas].map((id) => db.areas.find((a) => a.id === id)!).filter(Boolean);

  function clickRow(surfaceId: string) {
    if (!paintColourId || !editable) return;
    const r = act(assignSurfaceColour, estimateId, surfaceId, paintColourId);
    if (r.ok) {
      toast.success("Color assigned");
      onPainted?.();
    }
  }

  return (
    <EstimateSection id="section-scope">
      <SectionHeader icon={<Grid3x3 />} title="Area & Line Items" />
      {paintColourId && editable && (
        <Banner tone="success" className="mb-4">Paint mode: click a line item to assign the selected color.</Banner>
      )}
      <div className="space-y-6">
        {areas.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">No areas yet. Use “Add to Estimate +” to add the first area.</div>
        )}
        {areas.map((area) => {
          const rows = scope.filter((s) => s.areaId === area.id);
          const totalHrs = rows.reduce((a, s) => a + jobSurfaceHours(db, job.id, s), 0);
          return (
            <div key={area.id} className="overflow-hidden rounded-xl border border-gray-200">
              <div className="flex flex-wrap items-center gap-3 rounded-t-xl bg-gray-50 px-4 py-3">
                <GripVertical className="h-4 w-4 text-gray-300" aria-hidden />
                <span className="font-heading text-base font-bold text-gray-900">{area.name}</span>
                <span className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-gray-500 ring-1 ring-gray-200">{area.kind === "interior" ? "Interior" : "Exterior"} · {labelRoomType(area.roomType)}</span>
                <span className="ml-auto text-xs font-bold text-gray-500">Total Hrs: {totalHrs.toFixed(2)}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {["Item", "Amount (SQFT)", "Coats", "Color", "Hours (HRS)", "Est. Gal", "Paint Surface"].map((h, i) => (
                        <th key={h} className={cn("min-w-[110px] bg-gray-50 px-2 py-2 text-xs font-bold uppercase tracking-wider text-gray-500", i === 0 && "sticky left-0 pl-4 text-left")}>{h}</th>
                      ))}
                      {editable && <th className="w-10 bg-gray-50" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((s) => {
                      const spec = specForSurface(db, job.id, s.id);
                      const colour = spec && db.colours.find((c) => c.id === spec.colourId);
                      const colourNo = colour ? db.colours.filter((c) => c.jobId === job.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).findIndex((c) => c.id === colour.id) + 1 : 0;
                      const ps = paintSurfaceFor(s.condition);
                      return (
                        <tr key={s.id} onClick={() => clickRow(s.id)} className={cn("text-sm", paintColourId && editable ? "cursor-pointer hover:bg-green-50" : "hover:bg-gray-50/50")}>
                          <td className="sticky left-0 bg-white py-2 pl-4 pr-2 font-semibold text-gray-900">
                            {editable ? (
                              <Input defaultValue={s.name} onClick={(e) => e.stopPropagation()} onBlur={(e) => e.target.value !== s.name && act(updateScopeSurface, estimateId, s.id, { name: e.target.value })} className="h-8 min-w-36 text-sm" aria-label="Item" />
                            ) : s.name}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {editable ? (
                              <Input type="number" min={1} defaultValue={s.areaSqft} onClick={(e) => e.stopPropagation()} onBlur={(e) => Number(e.target.value) !== s.areaSqft && act(updateScopeSurface, estimateId, s.id, { areaSqft: Number(e.target.value) })} className="mx-auto h-8 w-24 text-center text-sm" aria-label="Amount" />
                            ) : s.areaSqft}
                          </td>
                          <td className="px-2 py-2 text-center text-gray-700">{spec?.coats ?? 2}</td>
                          <td className="px-2 py-2 text-center">
                            {colour ? (
                              <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-700">
                                <Swatch hex={colour.hex} size="sm" /> #{colourNo}
                              </span>
                            ) : (
                              <span className={cn("text-xs", paintColourId ? "font-semibold text-green-700" : "italic text-gray-400")}>{paintColourId ? <><PaintBucket className="inline h-3.5 w-3.5" /> Click to paint</> : "None"}</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-center text-gray-700">{jobSurfaceHours(db, job.id, s).toFixed(2)}</td>
                          <td className="px-2 py-2 text-center font-semibold text-blue-600">{(galBySurface.get(s.id) ?? 0).toFixed(2)}</td>
                          <td className="px-2 py-2 text-center">
                            {editable ? (
                              <Select value={ps} onClick={(e) => e.stopPropagation()} onChange={(e) => act(updateScopeSurface, estimateId, s.id, { condition: CONDITION_FOR[e.target.value as keyof typeof CONDITION_FOR] as SurfaceCondition })} className="mx-auto h-8 w-28 py-0 text-sm" aria-label="Paint surface">
                                {Object.entries(PAINT_SURFACE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                              </Select>
                            ) : PAINT_SURFACE_LABEL[ps]}
                          </td>
                          {editable && (
                            <td className="pr-2" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenu.Root>
                                <DropdownMenu.Trigger className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Row actions">
                                  <MoreVertical className="h-4 w-4" />
                                </DropdownMenu.Trigger>
                                <DropdownMenu.Portal>
                                  <DropdownMenu.Content align="end" className="z-50 min-w-40 rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
                                    <DropdownMenu.Item onSelect={() => act(removeScopeSurface, estimateId, s.id).ok && toast.success("Row deleted")} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 outline-none data-[highlighted]:bg-red-50">
                                      <Trash2 className="h-4 w-4" /> Delete Row
                                    </DropdownMenu.Item>
                                  </DropdownMenu.Content>
                                </DropdownMenu.Portal>
                              </DropdownMenu.Root>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {rows.length > 0 && (
                      <tr className="bg-gray-50/60 text-xs font-bold text-gray-600">
                        <td className="sticky left-0 bg-gray-50 py-2 pl-4">TOTALS</td>
                        <td className="text-center">{rows.reduce((a, s) => a + s.areaSqft, 0)}</td>
                        <td />
                        <td />
                        <td className="text-center">{totalHrs.toFixed(2)}</td>
                        <td className="text-center">{rows.reduce((a, s) => a + (galBySurface.get(s.id) ?? 0), 0).toFixed(2)}</td>
                        <td />
                        {editable && <td />}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {editable && (
                <div className="border-t border-gray-100 p-3">
                  <button onClick={() => setItemFor(area.id)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 py-2 text-sm font-semibold text-gray-600 hover:border-primary-300 hover:text-primary-700">
                    <Plus className="h-4 w-4" /> Add Line Item
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {editable && (
        <button onClick={() => setAddOpen(true)} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 py-5 text-sm font-bold text-gray-600 hover:border-primary-400 hover:text-primary-700">
          Add to Estimate <Plus className="h-4 w-4" />
        </button>
      )}

      <Modal open={addOpen} onOpenChange={setAddOpen} title="Add to Estimate" description="Choose what you would like to add." size="sm">
        <div className="space-y-2">
          <button onClick={() => { setAddOpen(false); setAreaModal(true); }} className="w-full rounded-xl border border-gray-200 p-4 text-left hover:border-primary-300 hover:bg-primary-50/40">
            <div className="text-sm font-bold text-gray-900">New Area</div>
            <div className="text-xs text-gray-500">A room or elevation with its surfaces.</div>
          </button>
          {["Priced Item", "Descriptive Item"].map((l) => (
            <div key={l} className="w-full cursor-not-allowed rounded-xl border border-gray-100 p-4 text-left opacity-60" title="Existing live option. Not rebuilt in the prototype: the new features don't use it.">
              <div className="text-sm font-bold text-gray-900">{l}</div>
              <div className="text-xs text-gray-500">Existing option, not needed by the new features.</div>
            </div>
          ))}
        </div>
      </Modal>
      <AreaModal open={areaModal} onOpenChange={setAreaModal} estimateId={estimateId} onCreated={(id) => setItemFor(id)} />
      <ItemModal areaId={itemFor} onClose={() => setItemFor(undefined)} estimateId={estimateId} />
    </EstimateSection>
  );
}

function AreaModal({ open, onOpenChange, estimateId, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; estimateId: string; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AreaKind>("interior");
  const [roomType, setRoomType] = useState<RoomType>("living_room");
  const [error, setError] = useState<string>();
  function save() {
    const r = act(addEstimateArea, estimateId, { name, kind, roomType });
    if (!r.ok) return setError(r.error);
    toast.success("Area added");
    setName("");
    setError(undefined);
    onOpenChange(false);
    onCreated(r.value as string);
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="New Area" size="sm" footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" onClick={save}>Add Area</Button></>}>
      <div className="space-y-4">
        <Field label="Area Name" required error={error}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Living Room" invalid={!!error} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as AreaKind)}>
              <option value="interior">Interior</option>
              <option value="exterior">Exterior</option>
            </Select>
          </Field>
          <Field label="Room type" hint="Sets the paint life default (feature 27).">
            <Select value={roomType} onChange={(e) => setRoomType(e.target.value as RoomType)}>
              {ROOM_TYPES.map((r) => <option key={r} value={r}>{labelRoomType(r)}</option>)}
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function ItemModal({ areaId, onClose, estimateId }: { areaId?: string; onClose: () => void; estimateId: string }) {
  const [name, setName] = useState("Walls");
  const [type, setType] = useState<SurfaceType>("walls");
  const [sqft, setSqft] = useState(300);
  const [ps, setPs] = useState<keyof typeof CONDITION_FOR>("SMOOTH");
  const [error, setError] = useState<{ field?: string; message: string }>();
  function save() {
    if (!areaId) return;
    const r = act(addScopeSurface, estimateId, { areaId, name, type, areaSqft: sqft, condition: CONDITION_FOR[ps] });
    if (!r.ok) return setError({ field: r.field, message: r.error });
    toast.success("Line item added");
    setError(undefined);
    onClose();
  }
  return (
    <Modal open={!!areaId} onOpenChange={(v) => !v && onClose()} title="Add Line Item" size="sm" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Add Line Item</Button></>}>
      <div className="space-y-4">
        <Field label="Item" required error={error?.field === "name" ? error.message : undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} invalid={error?.field === "name"} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Surface rate">
            <Select value={type} onChange={(e) => setType(e.target.value as SurfaceType)}>
              {SURFACE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Amount (SQFT)" required error={error?.field === "areaSqft" ? error.message : undefined}>
            <Input type="number" min={1} value={sqft} onChange={(e) => setSqft(Number(e.target.value))} invalid={error?.field === "areaSqft"} />
          </Field>
        </div>
        <Field label="Paint Surface">
          <Select value={ps} onChange={(e) => setPs(e.target.value as keyof typeof CONDITION_FOR)}>
            {Object.entries(PAINT_SURFACE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        {error && !error.field && <Banner tone="danger">{error.message}</Banner>}
      </div>
    </Modal>
  );
}
