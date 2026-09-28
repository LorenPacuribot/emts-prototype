"use client";
/**
 * Consumables allowance and equipment rentals — the second and third demand
 * sources, kept separate from measured paint demand (18 Design Sequence 2b, 2c).
 */
import { useState } from "react";
import { Pencil, Plus, Trash2, Truck, Wrench } from "lucide-react";
import type { EquipmentRental, Job } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { removeRental, saveRental } from "@/features/lib/store/actions/materials";
import { money, num } from "@/features/lib/format";
import { jobConsumables } from "@/features/lib/rules/procurement";
import { toast } from "@/features/lib/toast";
import { Button, Card, CardLabel, ConfirmDialog, EmptyState, Field, Input, Modal, RowMenu, Table, TD, TH, THead, TR } from "@/features/components/ui";
import { procurementPerms } from "@/features/components/features/procurement/shared";
import { useErr } from "@/features/components/features/procurement/order-modals";

export function ConsumablesPanel({ job }: { job: Job }) {
  const db = useDb((d) => d);
  const c = jobConsumables(db, job);
  return (
    <Card className="p-4">
      <CardLabel icon={<Wrench />}>Consumables allowance</CardLabel>
      <p className="mt-1 text-[11.5px] text-slate-500">Fixed rates, a separate line from measured paint: $35 per interior repaint room, $55 per never-painted room, exterior $150 per job plus $25 per 1,000 sq ft (prorated, once per job).</p>
      <div className="mt-3 space-y-1.5 text-[12.5px]">
        {c.rooms.map((r) => (
          <div key={r.id} className="flex justify-between border-b border-dashed border-line pb-1.5">
            <span>{r.name} <span className="text-slate-400">· {r.neverPainted ? "new construction" : "interior repaint"}</span></span>
            <span className="tabular-nums">{money(r.amount)}</span>
          </div>
        ))}
        {c.hasExterior && (
          <>
            <div className="flex justify-between border-b border-dashed border-line pb-1.5"><span>Exterior job base</span><span className="tabular-nums">{money(c.exteriorBase)}</span></div>
            <div className="flex justify-between border-b border-dashed border-line pb-1.5"><span>Exterior {num(c.exteriorSqft)} sq ft × $25 / 1,000 <span className="text-slate-400">(measured, not coat-adjusted)</span></span><span className="tabular-nums">{money(c.exteriorPerThousand)}</span></div>
          </>
        )}
        {c.rooms.length === 0 && !c.hasExterior && <EmptyState title="No rooms or elevations in scope." />}
        <div className="flex justify-between pt-1 font-bold text-ink"><span>Total allowance</span><span className="tabular-nums">{money(c.total)}</span></div>
      </div>
    </Card>
  );
}

export function RentalsPanel({ job, readOnly }: { job: Job; readOnly: boolean }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const perms = procurementPerms(user);
  const rentals = (db.equipmentRentals ?? []).filter((r) => r.jobId === job.id);
  const [edit, setEdit] = useState<{ open: boolean; rental?: EquipmentRental }>({ open: false });
  const [removing, setRemoving] = useState<EquipmentRental>();
  const canEdit = !readOnly && perms.requestOrder;
  return (
    <Card className="p-4">
      <CardLabel icon={<Truck />} right={canEdit && <Button size="sm" onClick={() => setEdit({ open: true })}><Plus className="h-3.5 w-3.5" /> Add rental</Button>}>Equipment rentals</CardLabel>
      <p className="mt-1 text-[11.5px] text-slate-500">Entered by hand. Rentals are never calculated automatically.</p>
      <div className="mt-3">
        {rentals.length === 0 ? <EmptyState icon={<Truck />} title="No rentals on this job." body="Add lifts, sprayers or scaffolding the crew needs." /> : (
          <Table>
            <THead><tr><TH>Equipment</TH><TH>Vendor</TH><TH className="text-right">Days</TH>{perms.seePrices && <TH className="text-right">Cost</TH>}<TH /></tr></THead>
            <tbody>
              {rentals.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium text-ink">{r.description}</TD>
                  <TD>{r.vendor ?? "—"}</TD>
                  <TD className="text-right">{r.days}</TD>
                  {perms.seePrices && <TD className="text-right tabular-nums">{money(r.cost)}</TD>}
                  <TD>{canEdit && <RowMenu items={[{ label: "Edit", icon: <Pencil />, onSelect: () => setEdit({ open: true, rental: r }) }, { label: "Remove", icon: <Trash2 />, danger: true, onSelect: () => setRemoving(r) }]} />}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      <RentalModal key={edit.rental?.id ?? `n${edit.open}`} open={edit.open} jobId={job.id} rental={edit.rental} onClose={() => setEdit({ open: false })} />
      <ConfirmDialog open={!!removing} onOpenChange={(v) => !v && setRemoving(undefined)} title={`Remove "${removing?.description}"?`} body="The rental row is removed from this job. This is logged." confirmLabel="Remove"
        onConfirm={() => removing && act(removeRental, removing.id).ok && toast.success("Rental removed")} />
    </Card>
  );
}

function RentalModal({ open, jobId, rental, onClose }: { open: boolean; jobId: string; rental?: EquipmentRental; onClose: () => void }) {
  const user = useCurrentUser();
  const perms = procurementPerms(user);
  const [desc, setDesc] = useState(rental?.description ?? "");
  const [vendor, setVendor] = useState(rental?.vendor ?? "");
  const [days, setDays] = useState(String(rental?.days ?? 1));
  const [cost, setCost] = useState(rental?.cost !== undefined ? String(rental.cost) : "");
  const { run, e } = useErr();
  const save = () => {
    if (run(act(saveRental, jobId, { description: desc, vendor, days: Number(days), cost: cost === "" ? undefined : Number(cost) }, rental?.id))) {
      toast.success(rental ? "Rental updated" : "Rental added");
      onClose();
    }
  };
  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title={rental ? "Edit rental" : "Add rental"} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Equipment" required error={e("description")} className="sm:col-span-2"><Input value={desc} onChange={(ev) => setDesc(ev.target.value)} placeholder="e.g. 40 ft boom lift" invalid={!!e("description")} /></Field>
        <Field label="Vendor"><Input value={vendor} onChange={(ev) => setVendor(ev.target.value)} /></Field>
        <Field label="Days" required error={e("days")}><Input type="number" min="1" value={days} onChange={(ev) => setDays(ev.target.value)} invalid={!!e("days")} /></Field>
        {perms.seePrices && <Field label="Cost" error={e("cost")}><Input type="number" step="0.01" value={cost} onChange={(ev) => setCost(ev.target.value)} invalid={!!e("cost")} /></Field>}
      </div>
    </Modal>
  );
}
