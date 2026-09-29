"use client";
/** Component 18.3 — Leftover Shelf Panel. */
import { useState } from "react";
import { ArrowRightLeft, Check, PackageOpen, X } from "lucide-react";
import type { ShelfStock } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { confirmShelf, rejectShelf, transferShelf } from "@/features/lib/store/actions/materials";
import { dateLong, money } from "@/features/lib/format";
import { PACK_LABEL } from "@/features/lib/rules/materials";
import { shelfCandidates, type DemandLine, type ShelfCandidate } from "@/features/lib/rules/procurement";
import { now } from "@/features/lib/clock";
import { userName } from "@/features/lib/store/helpers";
import { toast } from "@/features/lib/toast";
import { Badge, Button, Card, CardLabel, EmptyState, Field, Input, Modal, Select } from "@/features/components/ui";
import { cn } from "@/features/lib/cn";
import { dateInputToIso, procurementPerms, todayInput } from "@/features/components/features/procurement/shared";
import { useErr } from "@/features/components/features/procurement/order-modals";

export function ShelfPanel({ lines, readOnly }: { lines: DemandLine[]; readOnly: boolean }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const perms = procurementPerms(user);
  const nowIso = now();
  const [confirming, setConfirming] = useState<{ c: ShelfCandidate; line: DemandLine }>();
  const [rejecting, setRejecting] = useState<{ c: ShelfCandidate; line: DemandLine }>();
  const [transferring, setTransferring] = useState<ShelfStock>();
  const groups = lines.filter((l) => l.spec.product).map((line) => ({ line, candidates: shelfCandidates(db, line, nowIso) })).filter((g) => g.candidates.length > 0);

  return (
    <Card className="p-4">
      <CardLabel icon={<PackageOpen />}>Leftover shelf</CardLabel>
      <p className="mt-1 text-xs text-gray-500">Proposed only when product, color and sheen match, the container is sealed and under two years old. A proposal changes nothing until a person checks it.</p>
      <div className="mt-3 space-y-3">
        {groups.length === 0 && <EmptyState icon={<PackageOpen />} title="No matching shelf stock." body="Nothing on the shelf matches this job's product, color and sheen." />}
        {groups.map(({ line, candidates }) => (
          <div key={line.specId}>
            <div className="mb-1.5 text-xs font-bold uppercase tracking-[0.12em] text-gray-500">{line.colourName} · {line.spec.product} · {line.spec.sheen}</div>
            <div className="space-y-1.5">
              {candidates.map((c) => {
                const s = c.stock;
                const ageMonths = Math.floor(c.ageDays / 30.44);
                return (
                  <div key={s.id} className={cn("flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-xs",
                    c.state === "reserved_here" ? "border-green-200 bg-green-50/60" : c.state === "proposed" ? "border-line bg-gray-50" : "border-line bg-white opacity-70")}>
                    <span className="font-semibold text-ink">{s.id}</span>
                    <span className="text-gray-600">{PACK_LABEL[s.containerSize]} · {s.tintDate ? "tinted" : "bought"} {dateLong(s.tintDate ?? s.purchaseDate)} · {ageMonths} mo</span>
                    {c.state === "proposed" && <span className="italic text-gray-500">Not confirmed — purchase need unchanged.</span>}
                    {c.state === "reserved_here" && <Badge tone="green" className="whitespace-normal">Reserved to this job · {s.measuredGal} gal checked by {userName(db, s.confirmedBy)} {dateLong(s.checkDate)}</Badge>}
                    {c.state === "reserved_elsewhere" && <Badge tone="gray" className="whitespace-normal">Unavailable — reserved to {s.reservedJobId}</Badge>}
                    {(c.state === "too_old" || c.state === "unsealed") && <Badge tone="gray" className="whitespace-normal">Not proposed — {c.reason}</Badge>}
                    {c.state === "rejected" && <Badge tone="gray" className="whitespace-normal">Rejected for this job — {c.reason}</Badge>}
                    {perms.seePrices && s.unitCostPerGal !== undefined && <span className="text-gray-400">{money(s.unitCostPerGal)}/gal</span>}
                    <span className="ml-auto flex gap-1.5">
                      {c.state === "proposed" && !readOnly && perms.confirmShelf && (
                        <>
                          <Button size="sm" onClick={() => setRejecting({ c, line })}><X className="h-3.5 w-3.5" /> Reject</Button>
                          <Button size="sm" variant="primary" onClick={() => setConfirming({ c, line })}><Check className="h-3.5 w-3.5" /> Confirm</Button>
                        </>
                      )}
                      {c.state === "reserved_here" && perms.generate && <Button size="sm" onClick={() => setTransferring(s)}><ArrowRightLeft className="h-3.5 w-3.5" /> Transfer</Button>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <ConfirmShelfModal key={confirming?.c.stock.id} item={confirming} onClose={() => setConfirming(undefined)} />
      <RejectShelfModal key={`r${rejecting?.c.stock.id}`} item={rejecting} onClose={() => setRejecting(undefined)} />
      <TransferModal key={`t${transferring?.id}`} stock={transferring} onClose={() => setTransferring(undefined)} />
    </Card>
  );
}

function ConfirmShelfModal({ item, onClose }: { item?: { c: ShelfCandidate; line: DemandLine }; onClose: () => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [qty, setQty] = useState("");
  const [checker, setChecker] = useState(user.id);
  const [date, setDate] = useState(todayInput(now()));
  const { run, e } = useErr();
  const save = () => {
    if (!item) return;
    const res = act(confirmShelf, { stockId: item.c.stock.id, jobId: item.line.jobId, specId: item.line.specId, measuredGal: qty === "" ? NaN : Number(qty), checkerId: checker, checkDate: date ? dateInputToIso(date) : "" });
    if (run(res)) {
      toast.success("Shelf stock reserved", `${qty} gal of ${item.c.stock.id} reserved to ${item.line.jobId}. Purchase need reduced.`);
      onClose();
    }
  };
  return (
    <Modal open={!!item} onOpenChange={(v) => !v && onClose()} title={`Confirm ${item?.c.stock.id ?? ""}`} description="Physically check the container. Confirming reserves it to this job and removes it from every other job at once."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Confirm and reserve</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Measured quantity (gal)" required error={e("measured")} hint="To the nearest quarter gallon.">
          <Input type="number" step="0.25" min="0" value={qty} onChange={(ev) => setQty(ev.target.value)} invalid={!!e("measured")} />
        </Field>
        <Field label="Checked by" required error={e("checker")}>
          <Select value={checker} onChange={(ev) => setChecker(ev.target.value)} invalid={!!e("checker")}>
            <option value="">Choose…</option>
            {db.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <Field label="Check date" required error={e("checkDate")}>
          <Input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} invalid={!!e("checkDate")} />
        </Field>
      </div>
    </Modal>
  );
}

function RejectShelfModal({ item, onClose }: { item?: { c: ShelfCandidate; line: DemandLine }; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const { run, e } = useErr();
  const save = () => {
    if (item && run(act(rejectShelf, item.c.stock.id, item.line.jobId, reason))) {
      toast.success("Proposal rejected", "It won't be proposed to this job again.");
      onClose();
    }
  };
  return (
    <Modal open={!!item} onOpenChange={(v) => !v && onClose()} title={`Reject ${item?.c.stock.id ?? ""}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Reject proposal</Button></>}>
      <Field label="Reason" required error={e("reason")}>
        <Input value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="e.g. Skin on top, can dented" invalid={!!e("reason")} />
      </Field>
    </Modal>
  );
}

function TransferModal({ stock, onClose }: { stock?: ShelfStock; onClose: () => void }) {
  const db = useDb((d) => d);
  const [to, setTo] = useState("");
  const { run, e } = useErr();
  const cost = (stock?.measuredGal ?? 0) * (stock?.unitCostPerGal ?? 0);
  const save = () => {
    if (stock && run(act(transferShelf, stock.id, to))) {
      toast.success("Stock transferred", `${stock.reservedJobId} credited, ${to} debited at ${money(cost)}.`);
      onClose();
    }
  };
  return (
    <Modal open={!!stock} onOpenChange={(v) => !v && onClose()} title={`Transfer ${stock?.id ?? ""}`} description={`Credits ${stock?.reservedJobId} and debits the receiving job at transfer cost (${money(cost)}). Reviewed monthly by the bookkeeper.`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Transfer</Button></>}>
      <Field label="Receiving job" required error={e("toJob")}>
        <Select value={to} onChange={(ev) => setTo(ev.target.value)} invalid={!!e("toJob")}>
          <option value="">Choose a job…</option>
          {db.jobs.filter((j) => j.id !== stock?.reservedJobId).map((j) => <option key={j.id} value={j.id}>{j.id} · {j.name}</option>)}
        </Select>
      </Field>
    </Modal>
  );
}
