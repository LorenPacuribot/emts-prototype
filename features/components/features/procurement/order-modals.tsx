"use client";
/**
 * Forms used from the order drawer, the Materials tab and the Returns page.
 * Each validates through its store action; field errors show inline.
 */
import { useMemo, useState } from "react";
import type { LineStatus, PackSize, POCall, POLine, PurchaseOrder } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import {
  CALL_OUTCOME_LABEL, LINE_STATUS_LABEL, changeDeliveryDate, confirmCancellation, markUncertain, moveToShelf, previewReplacement, recordCall, recordReturn,
  FULFIL, editIssuedOrder, requestCancellation, requestReplacement, resendOrder, setLineStatus, type Evidence, type SendMethod,
} from "@/features/lib/store/actions/supplier";
import { receiveLine } from "@/features/lib/store/actions/materials";
import { byId } from "@/features/lib/selectors";
import { dateLong, money } from "@/features/lib/format";
import { PACK_LABEL } from "@/features/lib/rules/materials";
import { deliveryChangeApprover, interpretSupplierStatus, routeReceipt } from "@/features/lib/rules/procurement";
import { buildSupplierOrder } from "@/features/lib/integrations/supplier-connector";
import { now } from "@/features/lib/clock";
import { toast } from "@/features/lib/toast";
import { Banner, Button, Checkbox, Field, Input, Modal, PillTabs, Select, Textarea } from "@/features/components/ui";
import { dateInputToIso, nowInput, procurementPerms, todayInput } from "./shared";

type Err = { field?: string; msg?: string };
const valueOf = (res: { ok: boolean }) => (res as { value?: unknown }).value;
function useErr() {
  const [err, setErr] = useState<Err>({});
  const run = (res: { ok: boolean; error?: string; field?: string }) => {
    if (!res.ok) setErr({ field: res.field, msg: res.error });
    return res.ok;
  };
  const e = (f: string) => (err.field === f ? err.msg : undefined);
  return { err, setErr, run, e };
}

/* ------------------------------------------------------------------ */

export function ReceiveModal({ po, lineId, onClose }: { po?: PurchaseOrder; lineId?: string; onClose: () => void }) {
  const user = useCurrentUser();
  const perms = procurementPerms(user);
  const [line, setLine] = useState(lineId ?? po?.lines[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const { run, e } = useErr();
  const l = po?.lines.find((x) => x.id === line);
  const q = Number(qty);
  const preview = l && q > 0 ? routeReceipt(l.gallons - l.cancelledGal, l.receivedGal, q) : undefined;
  const submit = () => {
    if (!po) return;
    if (!qty) return run({ ok: false, field: "qty", error: "Enter the quantity received." });
    const res = act(receiveLine, po.id, line, q);
    if (run(res)) {
      toast.success(valueOf(res) === "pending" ? "Receipt recorded — over-receipt awaiting approval" : "Receipt recorded", `${q} gal on ${po.id} ${line}.`);
      onClose();
    }
  };
  return (
    <Modal open={!!po} onOpenChange={(v) => !v && onClose()} title={`Receive against ${po?.id ?? ""}`} description="Physical possession is what counts as received. Record the quantity to the nearest quarter gallon."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Record receipt</Button></>}>
      <div className="space-y-4">
        <Field label="Line" required>
          <Select value={line} onChange={(ev) => setLine(ev.target.value)}>
            {po?.lines.map((x) => (
              <option key={x.id} value={x.id}>{x.id} · {x.product} · {x.colourLabel} — {x.receivedGal} of {x.gallons - x.cancelledGal} gal received</option>
            ))}
          </Select>
        </Field>
        <Field label="Quantity received now (gal)" required error={e("qty")} hint="Steps of 0.25 gal (one quart).">
          <Input type="number" step="0.25" min="0" value={qty} onChange={(ev) => setQty(ev.target.value)} invalid={!!e("qty")} />
        </Field>
        {preview && preview.overGal > 0 && (
          <Banner tone="warn" title={`Over-receipt ${(preview.overPct * 100).toFixed(1)}% above the ordered quantity`}>
            {preview.toJobCostGal.toFixed(2)} gal becomes job cost (up to 10%).{preview.toShelfGal > 0 && ` ${preview.toShelfGal.toFixed(2)} gal above 10% goes to shelf stock at purchase cost and is credited off the job.`}{" "}
            {perms.approveOver ? "You approve this as you record it." : "The office manager must approve the routing."}
          </Banner>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */


export function LineStatusModal({ po, line, onClose }: { po?: PurchaseOrder; line?: POLine; onClose: () => void }) {
  const [status, setStatus] = useState<LineStatus | "">("");
  const [text, setText] = useState("");
  const { run, e } = useErr();
  const mapped = text.trim() ? interpretSupplierStatus(text) : null;
  const submit = () => {
    if (!po || !line) return;
    const res = act(setLineStatus, po.id, line.id, { status: status || undefined, supplierText: text });
    if (run(res)) {
      toast.success("Line status updated", !status && text && !mapped ? "Supplier text kept verbatim for review. No status was inferred." : undefined);
      onClose();
    }
  };
  return (
    <Modal open={!!line} onOpenChange={(v) => !v && onClose()} title={`Update ${po?.id ?? ""} · ${line?.id ?? ""}`} description="Statuses are per line. One line ready never marks the whole order fulfilled."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Save status</Button></>}>
      <div className="space-y-4">
        <Field label="Status" error={e("status")}>
          <Select value={status} onChange={(ev) => setStatus(ev.target.value as LineStatus)} invalid={!!e("status")}>
            <option value="">— Keep current ({line ? LINE_STATUS_LABEL[line.status] : ""}) —</option>
            {FULFIL.map((s) => <option key={s} value={s}>{LINE_STATUS_LABEL[s]}</option>)}
          </Select>
        </Field>
        {status === "substitute_available" && <p className="text-xs text-amber-800">Type what the supplier is offering below. The line then opens the replacement review.</p>}
        <Field label="Supplier's status text (verbatim)" error={e("supplierText")} hint={text.trim() ? (mapped ? `Matches "${LINE_STATUS_LABEL[mapped]}".` : "Unfamiliar text — it will be kept exactly as typed for human review, and no status will be inferred.") : "Optional. Copy it exactly as the branch wrote or said it."}>
          <Input value={text} onChange={(ev) => setText(ev.target.value)} placeholder='e.g. "BO - TINT MACH DOWN / ETA 2D"' invalid={!!e("supplierText")} />
        </Field>
        <p className="text-xs text-gray-500">A status change never creates an expense. Financial reconciliation happens in accounting.</p>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

export function CancelModal({ po, line, mode, onClose }: { po?: PurchaseOrder; line?: POLine; mode: "request" | "confirm"; onClose: () => void }) {
  const open = line ? line.gallons - line.receivedGal - line.cancelledGal : 0;
  const pending = po?.cancellations?.filter((c) => c.lineId === line?.id && !c.confirmedAt) ?? [];
  const [qty, setQty] = useState(String(pending[0]?.qtyGal ?? open));
  const [employee, setEmployee] = useState("");
  const [kind, setKind] = useState<"cancel_request" | "cannot_fill">("cancel_request");
  const { run, e } = useErr();
  const submit = () => {
    if (!po || !line) return;
    const res = mode === "request"
      ? act(requestCancellation, po.id, line.id, Number(qty))
      : act(confirmCancellation, po.id, line.id, { qty: Number(qty), employee, kind, requestId: pending.find((p) => p.qtyGal === Number(qty))?.id });
    if (run(res)) {
      toast.success(mode === "request" ? "Cancellation requested" : "Cancellation confirmed", mode === "request" ? "No quantity is released until the branch confirms." : "The commitment is released and demand returns to outstanding once.");
      onClose();
    }
  };
  return (
    <Modal open={!!line} onOpenChange={(v) => !v && onClose()} title={mode === "request" ? "Request cancellation" : "Record branch-confirmed cancellation"}
      description={mode === "request" ? "A request the supplier hasn't confirmed changes nothing." : "Only the office manager releases a commitment, and only with branch confirmation."}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant={mode === "confirm" ? "dark" : "primary"} onClick={submit}>{mode === "request" ? "Record request" : "Confirm and release"}</Button></>}>
      <div className="space-y-4">
        <Field label="Quantity (gal)" required error={e("qty")} hint={`${open.toFixed(2)} gal open on ${line?.id}.`}>
          <Input type="number" step="0.25" value={qty} onChange={(ev) => setQty(ev.target.value)} invalid={!!e("qty")} />
        </Field>
        {mode === "confirm" && (
          <>
            <Field label="Confirmed as">
              <PillTabs value={kind} onChange={setKind} options={[{ value: "cancel_request", label: "Cancellation confirmed" }, { value: "cannot_fill", label: "Branch cannot fill" }]} />
            </Field>
            <Field label="Branch employee who confirmed" required error={e("employee")}>
              <Input value={employee} onChange={(ev) => setEmployee(ev.target.value)} placeholder="e.g. Ray (counter)" invalid={!!e("employee")} />
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

export function ReplaceModal({ po, line, onClose }: { po?: PurchaseOrder; line?: POLine; onClose: () => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const perms = procurementPerms(user);
  const current = db.catalog.find((c) => c.product === line?.product);
  // A supplier substitute offer, when there is one, is the starting choice.
  const offer = line?.substituteOffer;
  const [catalogId, setCatalogId] = useState(offer?.catalogId ?? current?.id ?? "");
  const [pack, setPack] = useState<PackSize>(offer ? offer.packSize ?? line?.packs[0]?.size ?? "gal" : line?.packs[0]?.size === "5gal" ? "gal" : "5gal");
  const [successor, setSuccessor] = useState(false);
  const { run, e } = useErr();
  const preview = po && line && catalogId ? previewReplacement(db, po.id, line.id, catalogId, pack, successor) : undefined;
  const cat = byId(db.catalog, catalogId);
  const submit = () => {
    if (!po || !line) return;
    const res = act(requestReplacement, { poId: po.id, lineId: line.id, newCatalogId: catalogId, newPackSize: pack, isDirectSuccessor: successor });
    if (run(res)) {
      toast.success(valueOf(res) === "approved" ? "Replacement approved" : "Sent to the owner for approval");
      onClose();
    }
  };
  const ok = preview && !("error" in preview);
  return (
    <Modal open={!!line} onOpenChange={(v) => !v && onClose()} size="lg" title={`Replace ${line?.id ?? ""} on ${po?.id ?? ""}`} description="Rule 1 decides who approves. No customer document is created for an office-only change."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!ok || (ok && preview.decision === "change_order")} onClick={submit}>{ok && preview.decision === "owner" && user.role !== "owner" ? "Send to owner" : "Approve replacement"}</Button></>}>
      <div className="space-y-4">
        {offer && (
          <Banner tone="warn" title={`Supplier offers a substitute: ${offer.product}`}>
            {offer.catalogId ? "It's preselected below. Rule 1 decides who approves it." : "It isn't in the product library — choose the closest product, or decline and call the branch."}
          </Banner>
        )}
        <div className="rounded-lg bg-gray-50 p-3 text-xs">
          <div className="font-semibold text-ink">Current: {line?.product}</div>
          <div className="text-gray-600">{line?.colourLabel} · {line?.sheen} · {line?.packs.map((p) => `${p.count} × ${PACK_LABEL[p.size]}`).join(" + ")}</div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Replacement product" required>
            <Select value={catalogId} onChange={(ev) => setCatalogId(ev.target.value)}>
              {db.catalog.map((c) => <option key={c.id} value={c.id}>{c.manufacturer} · {c.product}</option>)}
            </Select>
          </Field>
          <Field label="Pack size" required error={e("packSize")}>
            <Select value={pack} onChange={(ev) => setPack(ev.target.value as PackSize)}>
              {(cat?.available ?? []).map((s) => <option key={s} value={s}>{PACK_LABEL[s]}</option>)}
            </Select>
          </Field>
        </div>
        <Checkbox checked={successor} onCheckedChange={setSuccessor} label="Manufacturer-published direct successor of the current product" />
        {preview && "error" in preview && <Banner tone="danger">{preview.error}</Banner>}
        {ok && (
          <Banner tone={preview.decision === "change_order" ? "danger" : preview.decision === "owner" ? "warn" : "success"}
            title={preview.decision === "change_order" ? "Blocked — priced change order with customer signature required" : preview.decision === "owner" ? "Business owner approval required" : "Office manager approves alone"}>
            {preview.reason}
            {perms.seePrices && (
              <div className="mt-1">Cost per gallon {money(line!.approvedCostPerGal ?? line!.unitCostPerGal)} → {money(preview.newCostPerGal)} ({(preview.pct * 100).toFixed(1)}%). Order total change {money(preview.orderTotalDelta)}.</div>
            )}
          </Banner>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

export function ReturnModal({ poId, lineId, onClose, open }: { poId?: string; lineId?: string; open: boolean; onClose: () => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const perms = procurementPerms(user);
  const received = db.purchaseOrders.filter((p) => p.lines.some((l) => l.receivedGal > 0));
  const [po, setPo] = useState(poId ?? received[0]?.id ?? "");
  const order = byId(db.purchaseOrders, po);
  const [line, setLine] = useState(lineId ?? order?.lines[0]?.id ?? "");
  const l = order?.lines.find((x) => x.id === line);
  const [qty, setQty] = useState("");
  const [credit, setCredit] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(true);
  const { run, e } = useErr();
  const tinted = l && l.tinted !== false;
  const submit = () => {
    if (!order || !l) return;
    const res = act(recordReturn, { poId: order.id, lineId: l.id, qty: Number(qty), credit: Number(credit || 0), confirmed, reason });
    if (run(res)) {
      toast.success("Return recorded", `Linked to ${order.id} and job ${order.jobId}. The original ordered quantity is unchanged.`);
      onClose();
    }
  };
  const toShelf = () => {
    if (!order || !l) return;
    const res = act(moveToShelf, order.id, l.id, Number(qty));
    if (run(res)) {
      toast.success("Moved to the leftover shelf", "It remains a job cost.");
      onClose();
    }
  };
  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title="Record return" description="Untinted, unopened product can be returned. The credit links to the original order and job."
      footer={<><Button onClick={onClose}>Cancel</Button>{tinted ? <Button variant="primary" disabled={!perms.receive} onClick={toShelf}>Move to leftover shelf</Button> : <Button variant="primary" onClick={submit}>Record return</Button>}</>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Original order" required>
            <Select value={po} onChange={(ev) => { setPo(ev.target.value); setLine(byId(db.purchaseOrders, ev.target.value)?.lines[0]?.id ?? ""); }}>
              {received.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.jobId}</option>)}
            </Select>
          </Field>
          <Field label="Line" required error={e("lineId")}>
            <Select value={line} onChange={(ev) => setLine(ev.target.value)}>
              {order?.lines.map((x) => <option key={x.id} value={x.id}>{x.id} · {x.product} ({x.tinted === false ? "untinted" : "tinted"})</option>)}
            </Select>
          </Field>
        </div>
        {tinted && (
          <Banner tone="warn" title="Tinted paint is non-returnable">
            It stays a job cost. You can move the leftover to the shelf so another job can use it.
          </Banner>
        )}
        <Field label="Quantity (gal)" required error={e("qty")} hint={l ? `${l.receivedGal} received, ${l.returnedGal} already returned.` : undefined}>
          <Input type="number" step="0.25" value={qty} onChange={(ev) => setQty(ev.target.value)} invalid={!!e("qty")} />
        </Field>
        {!tinted && (
          <>
            {perms.seePrices && (
              <Field label="Credit amount" error={e("credit")} hint="Pre-tax, as the branch issued it.">
                <Input type="number" step="0.01" value={credit} onChange={(ev) => setCredit(ev.target.value)} invalid={!!e("credit")} />
              </Field>
            )}
            <Field label="Reason" required error={e("reason")}>
              <Input value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="e.g. Unopened gallon, scope reduced" invalid={!!e("reason")} />
            </Field>
            <Checkbox checked={confirmed} onCheckedChange={setConfirmed} label="The branch has confirmed the credit (only confirmed credits reduce totals)" />
          </>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

export function CallModal({ po, onClose }: { po?: PurchaseOrder; onClose: () => void }) {
  const [employee, setEmployee] = useState("");
  const [time, setTime] = useState(nowInput(now()));
  const [outcome, setOutcome] = useState<POCall["outcome"]>("confirmed_received");
  const [note, setNote] = useState("");
  const { run, e } = useErr();
  const submit = () => {
    if (!po) return;
    const res = act(recordCall, po.id, { employee, time: time ? new Date(time).toISOString() : "", outcome, note });
    if (run(res)) {
      toast.success("Branch call recorded", outcome === "confirmed_received" ? "Record the acknowledgment next." : undefined);
      onClose();
    }
  };
  return (
    <Modal open={!!po} onOpenChange={(v) => !v && onClose()} title={`Record branch call · ${po?.id ?? ""}`} description="Captured against the same PO reference as any email evidence."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Record call</Button></>}>
      <div className="space-y-4">
        <Field label="Outcome" required>
          <Select value={outcome} onChange={(ev) => setOutcome(ev.target.value as POCall["outcome"])}>
            {Object.entries(CALL_OUTCOME_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Branch employee" required={outcome !== "no_answer"} error={e("employee")}>
            <Input value={employee} onChange={(ev) => setEmployee(ev.target.value)} placeholder="e.g. Ray (counter)" invalid={!!e("employee")} />
          </Field>
          <Field label="Call time" required error={e("time")}>
            <Input type="datetime-local" value={time} onChange={(ev) => setTime(ev.target.value)} invalid={!!e("time")} />
          </Field>
        </div>
        <Field label="Note">
          <Textarea value={note} onChange={(ev) => setNote(ev.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

export function DeliveryModal({ po, onClose }: { po?: PurchaseOrder; onClose: () => void }) {
  const user = useCurrentUser();
  const [date, setDate] = useState(po?.deliveryDate ? todayInput(po.deliveryDate) : "");
  const [reason, setReason] = useState("");
  const { run, e } = useErr();
  const preview = po?.deliveryDate && date ? deliveryChangeApprover(po.originalDeliveryDate ?? po.deliveryDate, dateInputToIso(date)) : undefined;
  const submit = () => {
    if (!po) return;
    const res = act(changeDeliveryDate, po.id, dateInputToIso(date), reason);
    if (run(res)) {
      toast.success(valueOf(res) === "approved" ? "Delivery date moved" : "Sent to the owner", valueOf(res) === "approved" ? "Original, revised date and approver recorded." : "More than three days needs the scheduler and owner.");
      onClose();
    }
  };
  return (
    <Modal open={!!po} onOpenChange={(v) => !v && onClose()} title={`Move delivery · ${po?.id ?? ""}`} description={`Original date ${dateLong(po?.originalDeliveryDate ?? po?.deliveryDate)}. Up to three days: office manager. More: scheduler and owner.`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Save change</Button></>}>
      <div className="space-y-4">
        <Field label="Revised date" required error={e("date")}>
          <Input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} invalid={!!e("date")} />
        </Field>
        {preview && preview.days > 0 && (
          <Banner tone={preview.needs === "owner" ? "warn" : "info"}>
            {preview.days} day{preview.days === 1 ? "" : "s"} from the original date.{" "}
            {preview.needs === "owner" ? (user.role === "owner" ? "You approve as the owner." : "Needs scheduler and owner approval.") : "The office manager approves."}
          </Banner>
        )}
        <Field label="Reason" required error={e("reason")}>
          <Input value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="e.g. Crew rescheduled after rain" invalid={!!e("reason")} />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

export function UncertainModal({ po, onClose }: { po?: PurchaseOrder; onClose: () => void }) {
  const [note, setNote] = useState("");
  const { run, e } = useErr();
  const submit = () => {
    if (!po) return;
    if (run(act(markUncertain, po.id, note))) {
      toast.success("Marked receipt uncertain", "Phone the branch and record the call before any resend.");
      onClose();
    }
  };
  return (
    <Modal open={!!po} onOpenChange={(v) => !v && onClose()} title="Mark send uncertain" description="The system never retries on its own. A person phones the branch first."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Mark uncertain</Button></>}>
      <Field label="Why is receipt uncertain?" required error={e("note")}>
        <Textarea value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="e.g. Email bounced from branch inbox; no reply by noon" invalid={!!e("note")} />
      </Field>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

/** Channel + evidence fields, used for first submission and for resend. */
export function EvidenceFields({ method, setMethod, ev, setEv, e, electronic }: {
  method: SendMethod;
  setMethod: (m: SendMethod) => void;
  ev: Evidence;
  setEv: (e: Evidence) => void;
  e: (f: string) => string | undefined;
  /** Shown when the supplier has an API/EDI connection. */
  electronic?: { po: PurchaseOrder };
}) {
  const options: { value: SendMethod; label: string }[] = [
    ...(electronic ? [{ value: "electronic" as const, label: "Electronic (API/EDI)" }] : []),
    { value: "email", label: "Email" }, { value: "phone", label: "Phone" }, { value: "print", label: "Print" },
  ];
  return (
    <div className="space-y-3">
      <Field label="Channel" required error={e("method")}>
        <PillTabs value={method} onChange={setMethod} options={options} />
      </Field>
      {method === "electronic" && electronic && <ElectronicPreview po={electronic.po} />}
      {method === "email" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Stored sent message" required error={e("sentMessage")} hint="Reference of the saved sent email.">
            <Input value={ev.sentMessage ?? ""} onChange={(x) => setEv({ ...ev, sentMessage: x.target.value })} placeholder="e.g. MSG-20511" invalid={!!e("sentMessage")} />
          </Field>
          <Field label="Delivery receipt" required error={e("deliveryReceipt")} hint="A read receipt is not the same thing.">
            <Input value={ev.deliveryReceipt ?? ""} onChange={(x) => setEv({ ...ev, deliveryReceipt: x.target.value })} placeholder="e.g. DR-20511" invalid={!!e("deliveryReceipt")} />
          </Field>
        </div>
      )}
      {method === "phone" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Branch employee" required error={e("employee")}>
            <Input value={ev.employee ?? ""} onChange={(x) => setEv({ ...ev, employee: x.target.value })} placeholder="e.g. Ray (counter)" invalid={!!e("employee")} />
          </Field>
          <Field label="Call time" required error={e("callTime")}>
            <Input type="datetime-local" value={ev.callTime ? nowInput(ev.callTime) : ""} onChange={(x) => setEv({ ...ev, callTime: x.target.value ? new Date(x.target.value).toISOString() : "" })} invalid={!!e("callTime")} />
          </Field>
        </div>
      )}
      {method === "print" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Handed over by" required error={e("handedBy")}>
            <Input value={ev.handedBy ?? ""} onChange={(x) => setEv({ ...ev, handedBy: x.target.value })} placeholder="e.g. Luis Ortega" invalid={!!e("handedBy")} />
          </Field>
          <Field label="Hand-off date" required error={e("handedAt")}>
            <Input type="date" value={ev.handedAt ? todayInput(ev.handedAt) : ""} onChange={(x) => setEv({ ...ev, handedAt: dateInputToIso(x.target.value) })} invalid={!!e("handedAt")} />
          </Field>
        </div>
      )}
    </div>
  );
}

/** What the connector will transmit: the structured order, or why it can't go. */
function ElectronicPreview({ po }: { po: PurchaseOrder }) {
  const db = useDb((d) => d);
  const conn = byId(db.suppliers, po.supplierId)?.connection;
  const built = buildSupplierOrder(db, po);
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-ink">{conn?.endpointLabel}</span>
        {conn?.sandbox && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">Sandbox — no real supplier is contacted</span>}
        {conn?.mode === "live" && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">Live{conn.endpointHost ? ` · ${conn.endpointHost}` : ""}</span>}
        {conn && conn.health !== "healthy" && <span className="text-red-600">Connection {conn.health === "failing" ? "failing" : "not tested"} — test it under Suppliers.</span>}
      </div>
      {"error" in built ? (
        <p className="mt-2 font-medium text-red-700">{built.error}</p>
      ) : (
        <details className="mt-2">
          <summary className="cursor-pointer text-gray-600">
            Structured order: {built.payload.lines.length} line{built.payload.lines.length === 1 ? "" : "s"}, store {built.payload.storeNumber}, every pack has an item code. Show payload
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded bg-white p-2 font-mono text-xs text-gray-700">{JSON.stringify({ ...built.payload, accountNumber: "••••" }, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

/**
 * Before sending. "store": Select Supplier/Store Name from the configured
 * suppliers. "amounts": reduce line quantities (increases go on a new order).
 */
export function EditOrderModal({ po, mode, onClose }: { po?: PurchaseOrder; mode: "store" | "amounts"; onClose: () => void }) {
  const db = useDb((d) => d);
  const [supplierId, setSupplierId] = useState(po?.supplierId ?? "");
  const [branchId, setBranchId] = useState(po?.branchId ?? "");
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries((po?.lines ?? []).map((l) => [l.id, String(l.gallons)])));
  const { run, e, err } = useErr();
  const branches = db.branches.filter((b) => b.supplierId === supplierId && b.active !== false);
  const submit = () => {
    if (!po) return;
    const input = mode === "store"
      ? { supplierId, branchId }
      : { gallons: Object.fromEntries(Object.entries(qty).map(([k, v]) => [k, Number(v)])) };
    if (run(act(editIssuedOrder, po.id, input))) {
      toast.success("Order updated", mode === "store" ? "Confirm the new destination before sending." : "Packs recalculated.");
      onClose();
    }
  };
  const conn = (id: string) => db.suppliers.find((s) => s.id === id)?.connection;
  return (
    <Modal open={!!po} onOpenChange={(v) => !v && onClose()}
      title={mode === "store" ? "Select Supplier/Store Name" : `Edit amounts · ${po?.id ?? ""}`}
      description={mode === "store" ? "Choose a configured supplier and store for this order. Only possible before sending." : "Reduce quantities before sending. Increases go on a new order."}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Save changes</Button></>}>
      <div className="space-y-4">
        {mode === "store" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Supplier" required error={e("supplier")}>
              <Select value={supplierId} onChange={(ev) => { setSupplierId(ev.target.value); setBranchId(db.branches.find((b) => b.supplierId === ev.target.value && b.active !== false)?.id ?? ""); }} invalid={!!e("supplier")}>
                {db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{conn(s.id)?.type === "api_edi" ? " · API/EDI" : ""}</option>)}
              </Select>
            </Field>
            <Field label="Store name" required error={e("branch")}>
              <Select value={branchId} onChange={(ev) => setBranchId(ev.target.value)} invalid={!!e("branch")}>
                {branches.length === 0 && <option value="">No active stores</option>}
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name} (store {b.storeNumber || "—"})</option>)}
              </Select>
            </Field>
          </div>
        )}
        {mode === "amounts" && <div className="space-y-2">
          {po?.lines.map((l) => (
            <Field key={l.id} label={`${l.id} · ${l.product} · ${l.colourLabel}`} error={e(`qty-${l.id}`)} hint={`Ordered ${l.gallons} gal. Packs are recalculated.`}>
              <Input type="number" step="0.25" min="0.25" max={l.gallons} value={qty[l.id] ?? ""} onChange={(ev) => setQty({ ...qty, [l.id]: ev.target.value })} invalid={!!e(`qty-${l.id}`)} />
            </Field>
          ))}
        </div>}
        {err.msg && !err.field && <Banner tone="danger">{err.msg}</Banner>}
      </div>
    </Modal>
  );
}

export function ResendModal({ po, onClose }: { po?: PurchaseOrder; onClose: () => void }) {
  const [method, setMethod] = useState<SendMethod>("phone");
  const [ev, setEv] = useState<Evidence>({});
  const { run, e } = useErr();
  const submit = () => {
    if (!po || method === "electronic") return;
    if (run(act(resendOrder, po.id, method, ev))) {
      toast.success("Order resent", `Original reference ${po.id} kept. The acknowledgment clock restarts.`);
      onClose();
    }
  };
  return (
    <Modal open={!!po} onOpenChange={(v) => !v && onClose()} title={`Resend ${po?.id ?? ""}`} description="Allowed only after a recorded confirmation call. The original reference and the uncertainty stay on the record."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Resend</Button></>}>
      <EvidenceFields method={method} setMethod={setMethod} ev={ev} setEv={setEv} e={e} />
    </Modal>
  );
}

export { useErr };
export function useOrdersForJob(jobId: string) {
  const db = useDb((d) => d);
  return useMemo(() => db.purchaseOrders.filter((p) => p.jobId === jobId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db.purchaseOrders, jobId]);
}
