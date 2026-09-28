"use client";
/**
 * Materials tab panels: preliminary shopping list, recalculation
 * comparison, pending approvals and the job's orders with receiving.
 */
import { useEffect, useRef, useState } from "react";
import { Check, ClipboardList, Eye, FilePlus2, PackageCheck, Printer, X } from "lucide-react";
import type { Job, MaterialCalcSnapshot, OrderRequest } from "@/features/types";
import { act, useCurrentUser, useDb, useStore } from "@/features/lib/store";
import { acceptRecalculation, approveReceipt, decideAdjustment, generateOrder, logPreliminaryList, rejectRequest } from "@/features/lib/store/actions/materials";
import { byId, propertyAddress } from "@/features/lib/selectors";
import { dateLong, dateTime, money } from "@/features/lib/format";
import { formatPacks } from "@/features/lib/rules/materials";
import { COVERAGE_LABEL, poValue, type DemandLine } from "@/features/lib/rules/procurement";
import { printElement } from "@/features/lib/export";
import { now } from "@/features/lib/clock";
import { userName } from "@/features/lib/store/helpers";
import { toast } from "@/features/lib/toast";
import { Badge, Banner, Button, Card, CardLabel, EmptyState, Field, Modal, Table, TD, TH, THead, TR, Textarea } from "@/features/components/ui";
import { AckClockChip, PoStatusBadge, ReceivedBar, procurementPerms } from "@/features/components/features/procurement/shared";
import { ReceiveModal } from "@/features/components/features/procurement/order-modals";

/* ------------------------------------------------------------------ */

export function PreliminaryListModal({ open, job, lines, onClose }: { open: boolean; job: Job; lines: DemandLine[]; onClose: () => void }) {
  const db = useDb((d) => d);
  const ref = useRef<HTMLDivElement>(null);
  const property = byId(db.properties, job.propertyId);
  useEffect(() => {
    if (open) act(logPreliminaryList, job.id);
  }, [open, job.id]);
  const printable = lines.filter((l) => l.spec.product && l.catalog && l.parts.length);
  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} size="lg" title="Preliminary shopping list" description="For planning only. It carries no PO number and can't be submitted to a supplier."
      footer={<><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => printElement(ref.current, `${job.id} preliminary list`)}><Printer className="h-4 w-4" /> Print / Save PDF</Button></>}>
      <div ref={ref} className="rounded-xl border-2 border-dashed border-amber-300 p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700">Preliminary — not a purchase order</div>
            <div className="font-display text-[16px] font-bold text-ink">{job.name}</div>
            <div className="text-[12px] text-slate-500">{job.id} · {propertyAddress(property, true)}</div>
          </div>
          <div className="text-right text-[11px] text-slate-500">No PO number<br />{dateLong(now())}</div>
        </div>
        {printable.length === 0 ? <p className="text-[12.5px] italic text-slate-400">No specifications with a product and surfaces yet.</p> : (
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400">
                <th className="border-b py-1">Product</th><th className="border-b py-1">Colour</th><th className="border-b py-1">Sheen</th><th className="border-b py-1 text-right">Need</th><th className="border-b py-1">Packs</th><th className="border-b py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {printable.map((l) => (
                <tr key={l.specId}>
                  <td className="border-b py-1.5 pr-2">{l.spec.product}</td>
                  <td className="border-b py-1.5 pr-2">{l.colourName} {l.colourNumber}</td>
                  <td className="border-b py-1.5 pr-2">{l.spec.sheen ?? "—"}</td>
                  <td className="border-b py-1.5 pr-2 text-right tabular-nums">{l.needGal.toFixed(2)} gal</td>
                  <td className="border-b py-1.5 pr-2">{formatPacks(l.packs.packs)}</td>
                  <td className="border-b py-1.5">{l.blocked.length ? "Not yet orderable" : "Orderable"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-[10.5px] text-slate-400">Quantities follow the coverage, waste and packing rules. Prices are not shown on a preliminary list.</p>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

export function RecalcModal({ open, job, lines, snapshot, onClose }: { open: boolean; job: Job; lines: DemandLine[]; snapshot?: MaterialCalcSnapshot; onClose: () => void }) {
  const db = useDb((d) => d);
  const calcBy = userName(db, snapshot?.calculatedBy);
  const accept = () => {
    if (act(acceptRecalculation, job.id).ok) {
      toast.success("Calculation accepted", "The new figures are now the ordering baseline.");
      onClose();
    }
  };
  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} size="lg" title="Recalculate demand" description="Compare the previous figures with the new result. The previous figures stay in use until you accept."
      footer={<><Button onClick={onClose}>Keep previous</Button><Button variant="primary" onClick={accept}><Check className="h-4 w-4" /> Accept new result</Button></>}>
      <Table>
        <THead><tr><TH>Line</TH><TH>Coverage</TH><TH>Waste</TH><TH className="text-right">Coat-adj. area</TH><TH className="text-right">Previous need</TH><TH className="text-right">New need</TH></tr></THead>
        <tbody>
          {lines.map((l) => {
            const p = snapshot?.lines.find((s) => s.specId === l.specId);
            const changed = !p || p.adjustedNeedGal !== l.calculatedNeedGal || p.rate !== l.rate || p.waste !== l.waste;
            return (
              <TR key={l.specId} className={changed ? "bg-amber-50/50" : undefined}>
                <TD className="font-semibold text-ink">{l.specId} · {l.colourName}</TD>
                <TD>{p && p.rate !== l.rate ? <><s className="text-slate-400">{p.rate}</s> → </> : null}{l.rate} <span className="text-slate-400">({COVERAGE_LABEL[l.source]})</span></TD>
                <TD>{p && p.waste !== l.waste ? <><s className="text-slate-400">{Math.round(p.waste * 100)}%</s> → </> : null}{Math.round(l.waste * 100)}%</TD>
                <TD className="text-right tabular-nums">{l.coatSqft}</TD>
                <TD className="text-right tabular-nums">{p ? p.adjustedNeedGal.toFixed(3) : "—"}</TD>
                <TD className="text-right font-semibold tabular-nums">{l.calculatedNeedGal.toFixed(3)}</TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
      {snapshot && <p className="mt-2 text-[11.5px] text-slate-500">Previous calculation {dateTime(snapshot.calculatedAt)} by {calcBy}.</p>}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

export function ApprovalsPanel({ job, onViewOrder }: { job: Job; onViewOrder: (id: string) => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const perms = procurementPerms(user);
  const adjustments = db.demandAdjustments.filter((a) => a.jobId === job.id && a.status === "pending_approval");
  const requests = (db.orderRequests ?? []).filter((r) => r.jobId === job.id && r.status === "requested");
  const [rejecting, setRejecting] = useState<{ kind: "adj" | "req"; id: string }>();
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string>();
  if (!adjustments.length && !requests.length) return null;

  const generate = (r: OrderRequest) => {
    const res = act(generateOrder, { key: `REQ:${r.id}`, requestId: r.id, jobId: r.jobId, supplierId: r.supplierId, branchId: r.branchId ?? "", phase: r.phase, deliveryDate: r.deliveryDate ?? "", fulfilment: r.fulfilment, lines: r.lines.map((l) => ({ specId: l.specId, gallons: l.gallons })) });
    if (res.ok) {
      toast.success(`Order ${res.value} generated from ${r.id}`);
      onViewOrder(res.value as string);
    }
  };

  return (
    <Card className="border-amber-200 p-4">
      <CardLabel icon={<ClipboardList />}>Waiting for approval</CardLabel>
      <div className="mt-3 space-y-2">
        {adjustments.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2 text-[12.5px]">
            <Badge tone="amber">Adjustment {a.id}</Badge>
            <span><strong>{a.specId}</strong> {a.baselineGal.toFixed(3)} → {a.proposedGal.toFixed(3)} gal ({a.pct >= 0 ? "+" : ""}{(a.pct * 100).toFixed(1)}%) by {userName(db, a.by)} — “{a.note}”</span>
            <span className="ml-auto flex flex-wrap gap-1.5">
              {perms.approveAdjust ? (
                <>
                  <Button size="sm" onClick={() => { setRejecting({ kind: "adj", id: a.id }); setNote(""); setErr(undefined); }}><X className="h-3.5 w-3.5" /> Reject</Button>
                  <Button size="sm" variant="primary" onClick={() => act(decideAdjustment, a.id, true).ok && toast.success("Adjustment approved", "The line now uses the approved quantity.")}><Check className="h-3.5 w-3.5" /> Approve</Button>
                </>
              ) : <span className="text-[11.5px] text-slate-500">Owner or office manager to approve — not yet in effect</span>}
            </span>
          </div>
        ))}
        {requests.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2 text-[12.5px]">
            <Badge tone="amber">Request {r.id}</Badge>
            <span>{r.lines.map((l) => `${l.specId} ${formatPacks(l.packs)}`).join(", ")} · {byId(db.branches, r.branchId)?.name} · by {userName(db, r.requestedBy)} · limit {r.limit.estimatorPass ? "pass" : "fail"}{r.limit.needs !== "none" && ` · needs ${r.limit.needs === "owner" ? "owner" : "office manager"}`}</span>
            <span className="ml-auto flex flex-wrap gap-1.5">
              {perms.generate ? (
                <>
                  <Button size="sm" onClick={() => { setRejecting({ kind: "req", id: r.id }); setNote(""); setErr(undefined); }}><X className="h-3.5 w-3.5" /> Reject</Button>
                  <Button size="sm" variant="primary" disabled={r.limit.needs === "owner" && user.role !== "owner"} onClick={() => generate(r)}><FilePlus2 className="h-3.5 w-3.5" /> Generate priced order</Button>
                </>
              ) : <span className="text-[11.5px] text-slate-500">Waiting for the office</span>}
            </span>
          </div>
        ))}
      </div>
      <Modal open={!!rejecting} onOpenChange={(v) => !v && setRejecting(undefined)} title="Reject" footer={<><Button onClick={() => setRejecting(undefined)}>Cancel</Button><Button variant="primary" onClick={() => {
        const res = rejecting!.kind === "adj" ? act(decideAdjustment, rejecting!.id, false, note) : act(rejectRequest, rejecting!.id, note);
        if (res.ok) { toast.success("Rejected"); setRejecting(undefined); } else setErr(res.error);
      }}>Reject</Button></>}>
        <Field label="Reason" required error={err}><Textarea value={note} onChange={(e) => setNote(e.target.value)} invalid={!!err} /></Field>
      </Modal>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

export function JobOrdersPanel({ job, onOpen }: { job: Job; onOpen: (id: string) => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const perms = procurementPerms(user);
  const orders = db.purchaseOrders.filter((p) => p.jobId === job.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pending = (db.receipts ?? []).filter((r) => r.jobId === job.id && r.status === "pending_approval");
  const [receiving, setReceiving] = useState<string>();
  useStore((s) => s.clockMode);
  const nowIso = now();
  return (
    <Card className="p-4">
      <CardLabel icon={<PackageCheck />}>Orders and receiving</CardLabel>
      {pending.map((r) => (
        <Banner key={r.id} tone="warn" className="mt-3" title={`Over-receipt on ${r.poId} ${r.lineId} awaiting office manager`}
          action={perms.approveOver && <Button size="sm" variant="primary" onClick={() => act(approveReceipt, r.id).ok && toast.success("Over-receipt approved")}>Approve</Button>}>
          {r.qtyGal} gal received · {r.toJobCostGal.toFixed(2)} gal to job cost, {r.toShelfGal.toFixed(2)} gal to shelf stock at purchase cost.
        </Banner>
      ))}
      <div className="mt-3">
        {orders.length === 0 ? <EmptyState icon={<PackageCheck />} title="No orders yet." body="Generate an order from the approved demand above." /> : (
          <Table>
            <THead><tr><TH>PO</TH><TH>Phase</TH><TH>Branch</TH><TH>Status</TH><TH>Ack</TH><TH>Received</TH>{perms.seePrices && <TH className="text-right">Total</TH>}<TH /></tr></THead>
            <tbody>
              {orders.map((p) => (
                <TR key={p.id}>
                  <TD className="font-semibold text-ink">{p.id}</TD>
                  <TD>{p.phase}</TD>
                  <TD>{byId(db.branches, p.branchId)?.name}</TD>
                  <TD><PoStatusBadge po={p} /></TD>
                  <TD><AckClockChip po={p} nowIso={nowIso} /></TD>
                  <TD><ReceivedBar po={p} /></TD>
                  {perms.seePrices && <TD className="text-right tabular-nums">{money(poValue(p))}</TD>}
                  <TD>
                    <div className="flex gap-1.5">
                      {perms.receive && p.ackAt && <Button size="sm" onClick={() => setReceiving(p.id)}><PackageCheck className="h-3.5 w-3.5" /> Receive</Button>}
                      <Button size="sm" onClick={() => onOpen(p.id)}><Eye className="h-3.5 w-3.5" /> Open</Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      <ReceiveModal key={receiving} po={receiving ? byId(db.purchaseOrders, receiving) : undefined} onClose={() => setReceiving(undefined)} />
    </Card>
  );
}

