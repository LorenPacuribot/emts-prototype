"use client";
/**
 * Order detail drawer (19 Wireframe): supplier-facing content, destination
 * confirmation, evidence, acknowledgment, per-line status, replacement
 * approval, delivery changes, returns and the full event trail.
 */
import { useRef, useState } from "react";
import {
  AlertTriangle, ArrowUpRight, Building2, CalendarClock, CheckCircle2, ClipboardCheck, Download, FileText, History, PackageCheck, PackageX, PhoneCall, Printer,
  FlaskConical, Pencil, Repeat2, RotateCcw, Send, ShieldAlert, Truck, Undo2,
} from "lucide-react";
import type { POLine, PurchaseOrder } from "@/features/types";
import { act, getDb, useCurrentUser, useDb, useStore } from "@/features/lib/store";
import { sendLiveOrder, useSupplierInbox } from "@/features/lib/integrations/supplier-live";
import {
  acknowledgeOrder, confirmDestination, decideDeliveryChange, decideReplacement, escalateException, liveSendPreflight, simulateSupplierMessage, submitOrder, LINE_STATUS_LABEL,
  type Evidence, type SendMethod,
} from "@/features/lib/store/actions/supplier";
import { approveReceipt } from "@/features/lib/store/actions/materials";
import { byId } from "@/features/lib/selectors";
import { dateLong, dateTime, money } from "@/features/lib/format";
import { PO_STATUS } from "@/features/lib/status";
import { formatPacks } from "@/features/lib/rules/materials";
import { ESCALATION_LABEL, ackException, branchGaps, interpretSupplierStatus, itemCodeFor, lineIdentity, lineValue, poValue } from "@/features/lib/rules/procurement";
import { downloadCsv, printElement } from "@/features/lib/export";
import { now } from "@/features/lib/clock";
import { sourceName, userName } from "@/features/lib/store/helpers";
import { toast } from "@/features/lib/toast";
import { AppLink } from "@/features/lib/navigation";
import { Badge, Banner, Button, CardLabel, Checkbox, Drawer, EmptyState, Field, IdChip, Input, KV, RowMenu, Select } from "@/features/components/ui";
import { jobHref } from "@/features/lib/hrefs";
import { OrderDocument } from "./order-document";
import {
  CallModal, CancelModal, DeliveryModal, EditOrderModal, EvidenceFields, LineStatusModal, ReceiveModal, ReplaceModal, ResendModal, ReturnModal, UncertainModal, useErr,
} from "./order-modals";
import { AckClockChip, PoStatusBadge, minutesLabel, procurementPerms } from "./shared";

export function OrderDrawer({ poId, onClose }: { poId?: string; onClose: () => void }) {
  const db = useDb((d) => d);
  const po = poId ? byId(db.purchaseOrders, poId) : undefined;
  return (
    <Drawer
      open={!!poId}
      onOpenChange={(v) => !v && onClose()}
      width="max-w-3xl"
      title={po ? <span className="flex flex-wrap items-center gap-2">{po.id} <PoStatusBadge po={po} /></span> : "Order"}
      subtitle={po ? <OrderSubtitle po={po} /> : undefined}
    >
      {po ? <OrderBody po={po} /> : <EmptyState title="Order not found" body="It may have been removed, or the demo data was reset." />}
    </Drawer>
  );
}

function OrderSubtitle({ po }: { po: PurchaseOrder }) {
  const db = useDb((d) => d);
  const job = byId(db.jobs, po.jobId);
  const branch = byId(db.branches, po.branchId);
  return (
    <span>
      <AppLink href={jobHref(po.jobId, "materials")} className="font-medium text-brand hover:underline">{job?.name} · {po.jobId}</AppLink> · {branch?.name} (store {branch?.storeNumber || "—"}) · {po.phase}
    </span>
  );
}

function OrderBody({ po }: { po: PurchaseOrder }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const perms = procurementPerms(user);
  // Live supplier replies arrive through the server inbox while this order is open.
  useSupplierInbox();
  useStore((s) => s.clockMode);
  const nowIso = now();
  const docRef = useRef<HTMLDivElement>(null);
  const branch = byId(db.branches, po.branchId);
  const ex = ackException(po, db.users, nowIso);
  const [modal, setModal] = useState<{ kind: string; line?: POLine }>({ kind: "" });
  const close = () => setModal({ kind: "" });
  const pendingDelivery = po.deliveryChanges?.filter((c) => c.status === "pending_owner") ?? [];
  const pendingReplace = po.replacements?.filter((r) => r.status === "pending_owner") ?? [];
  const pendingReceipts = (db.receipts ?? []).filter((r) => r.poId === po.id && r.status === "pending_approval");
  const returns = (db.returns ?? []).filter((r) => r.poId === po.id);
  const waitingAck = po.status === "sent" && !po.ackAt;

  function exportCsv() {
    downloadCsv(`${po.id}.csv`, [
      ["PO", "Line", "Manufacturer", "Product line", "Product", "Colour", "Colour number", "Sheen", "Tint base", "Packs", "Gallons", "Item code", "Status", "Supplier text", ...(perms.seePrices ? ["Unit cost / gal", "Amount"] : []), ...(perms.seeAccount ? ["Account"] : [])],
      ...po.lines.map((l) => ({ l, id: lineIdentity(db, l) })).map(({ l, id }) => [
        po.id, l.id, id.manufacturer, id.productLine, l.product, id.colourName, id.colourNumber, l.sheen, id.tintBase, formatPacks(l.packs), l.gallons,
        l.packs.map((p) => itemCodeFor(db, { product: l.product, packSize: p.size, branchId: po.branchId }) ?? "UNMAPPED").join(" "),
        LINE_STATUS_LABEL[l.status], l.supplierStatusText,
        ...(perms.seePrices ? [l.unitCostPerGal.toFixed(2), lineValue(l).toFixed(2)] : []),
        ...(perms.seeAccount ? [branch?.accountNumber] : []),
      ]),
    ]);
    toast.success("CSV exported", perms.seePrices ? "Priced order downloaded." : "Quantities only — prices are not included for your role.");
  }

  return (
    <>
      {/* ----- Banners ----- */}
      {po.uncertainSend && (
        <Banner tone="warn" title="Receipt uncertain — phone the branch and record confirmation before resending."
          action={perms.submit && <div className="flex gap-2"><Button size="sm" onClick={() => setModal({ kind: "call" })}><PhoneCall className="h-3.5 w-3.5" /> Record call</Button><Button size="sm" variant="primary" onClick={() => setModal({ kind: "resend" })}><Repeat2 className="h-3.5 w-3.5" /> Resend</Button></div>}>
          Marked uncertain {dateTime(po.uncertainAt)}. There is no automatic retry.
        </Banner>
      )}
      {!po.uncertainSend && po.uncertainHistory && (
        <Banner tone="info" title={`Resent ${po.resendCount ?? 1}× after an uncertain send`}>
          Original reference {po.id} preserved. Last resend {dateTime(po.resentAt)}. The first send's uncertainty stays on the record below.
        </Banner>
      )}
      {ex?.overdue && (
        <Banner tone="danger" title="No acknowledgment after four working hours"
          action={perms.submit && ex.next && <Button size="sm" onClick={() => act(escalateException, po.id).ok && toast.success(`Escalated to ${ESCALATION_LABEL[ex.next!]}`)}><ArrowUpRight className="h-3.5 w-3.5" /> Escalate</Button>}>
          Flagged for a branch call. Responsible: <strong>{ex.responsible?.name}</strong> ({ESCALATION_LABEL[ex.step]}{ex.senderAbsent ? ", sender absent" : ""}). Commitment is still held — nothing is released on a timer.
        </Banner>
      )}
      {pendingDelivery.map((c) => (
        <Banner key={c.id} tone="warn" title={`Delivery move of ${c.days} days waiting for the owner`}
          action={perms.isOwner && <div className="flex gap-2"><Button size="sm" onClick={() => act(decideDeliveryChange, po.id, c.id, false).ok && toast.success("Date change rejected")}>Reject</Button><Button size="sm" variant="primary" onClick={() => act(decideDeliveryChange, po.id, c.id, true).ok && toast.success("Date change approved")}>Approve</Button></div>}>
          {dateLong(c.from)} → {dateLong(c.to)}, requested by {userName(db, c.requestedBy)}: {c.reason}
        </Banner>
      ))}
      {pendingReplace.map((r) => (
        <Banner key={r.id} tone="warn" title={`Substitution on ${r.lineId} waiting for the owner`}
          action={perms.isOwner && <div className="flex gap-2"><Button size="sm" onClick={() => act(decideReplacement, po.id, r.id, false).ok && toast.success("Substitution rejected")}>Reject</Button><Button size="sm" variant="primary" onClick={() => act(decideReplacement, po.id, r.id, true).ok && toast.success("Substitution approved")}>Approve</Button></div>}>
          {r.original} → {r.replacement}. {r.reason}
        </Banner>
      ))}
      {pendingReceipts.map((r) => (
        <Banner key={r.id} tone="warn" title={`Over-receipt on ${r.lineId} awaiting office manager approval`}
          action={perms.approveOver && <Button size="sm" variant="primary" onClick={() => act(approveReceipt, r.id).ok && toast.success("Over-receipt approved")}>Approve routing</Button>}>
          Received {r.qtyGal} gal ({r.overGal.toFixed(2)} gal over). {r.toJobCostGal.toFixed(2)} gal to job cost, {r.toShelfGal.toFixed(2)} gal to shelf stock.
        </Banner>
      ))}

      {/* ----- Summary ----- */}
      <KV
        items={[
          ["Status", <span key="s" className="flex flex-wrap items-center gap-2"><PoStatusBadge po={po} /> {po.lines.some((l) => l.status === "ready_for_pickup") && po.status === "acknowledged" && <span className="text-xs text-gray-500">{po.lines.filter((l) => l.status === "ready_for_pickup").length} of {po.lines.length} lines ready — order not fulfilled</span>}</span>],
          ["Sent", po.sentAt ? `${dateTime(po.sentAt)} by ${userName(db, po.sentBy)} via ${po.sendMethod}` : "Not sent"],
          ["Evidence", po.sentEvidence ?? "—"],
          ["Acknowledgment", po.ackAt ? `${dateTime(po.ackAt)} · ${po.ackRef}` : waitingAck ? <AckClockChip key="c" po={po} nowIso={nowIso} /> : "—"],
          ["Delivery / pickup", <span key="d">{dateLong(po.deliveryDate)} {po.originalDeliveryDate && po.originalDeliveryDate.slice(0, 10) !== po.deliveryDate?.slice(0, 10) && <span className="text-gray-500">(original {dateLong(po.originalDeliveryDate)})</span>}</span>],
          ...(perms.seePrices ? ([["Order total", `${money(poValue(po))}${po.approvedTotal !== undefined && Math.abs(poValue(po) - po.approvedTotal) > 0.005 ? ` (approved ${money(po.approvedTotal)})` : ""}`]] as [string, string][]) : []),
          ["Created", `${dateTime(po.createdAt)} by ${userName(db, po.createdBy)}${po.requestId ? ` from ${po.requestId}` : ""}`],
        ]}
      />

      {/* ----- Submission (Preparing) ----- */}
      {po.status === "issued" && (perms.submit ? <SubmitPanel po={po} canEdit={perms.generate} onEdit={(mode) => setModal({ kind: mode === "store" ? "editStore" : "editAmounts" })} /> : (
        <Banner tone="info" title="Waiting for the office to send">
          {user.role === "crew_lead" ? "Crew leads can't submit orders." : "Only the business owner and office manager submit orders to a supplier."}
        </Banner>
      ))}

      {/* ----- Acknowledgment ----- */}
      {waitingAck && !po.uncertainSend && perms.submit && <AckPanel po={po} onCall={() => setModal({ kind: "call" })} onUncertain={() => setModal({ kind: "uncertain" })} />}

      {/* ----- Sandbox supplier replies ----- */}
      {po.transmission?.sandbox && perms.submit && po.status !== "picked_up" && po.status !== "cancelled" && <SandboxSupplierPanel po={po} />}

      {/* ----- Lines ----- */}
      <div>
        <CardLabel icon={<ClipboardCheck />} right={po.ackAt && perms.submit && <Button size="sm" onClick={() => setModal({ kind: "delivery" })}><CalendarClock className="h-3.5 w-3.5" /> Move date</Button>}>Lines</CardLabel>
        <div className="mt-3 space-y-2">
          {po.lines.map((l) => {
            const codes = l.packs.map((p) => itemCodeFor(db, { product: l.product, packSize: p.size, branchId: po.branchId }));
            const unmapped = codes.some((c) => !c);
            const open = l.gallons - l.receivedGal - l.cancelledGal;
            const pendingCx = po.cancellations?.filter((c) => c.lineId === l.id && !c.confirmedAt) ?? [];
            const known = !l.supplierStatusText || !!interpretSupplierStatus(l.supplierStatusText) || !!l.substituteOffer;
            const status = PO_STATUS[l.status] ?? PO_STATUS.open;
            return (
              <div key={l.id} className="rounded-xl border border-line p-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <IdChip>{l.id}</IdChip>
                      <span className="font-semibold text-ink">{l.product}</span>
                      <Badge tone={status.tone}>{status.label}</Badge>
                      {l.tinted === false ? <Badge tone="blue">Untinted · returnable</Badge> : <Badge tone="gray">Tinted · non-returnable</Badge>}
                      {unmapped && <Badge tone="amber">No item code — manual order only</Badge>}
                    </div>
                    <div className="mt-1 text-xs text-gray-600">{[lineIdentity(db, l).manufacturer, l.colourLabel, l.sheen, lineIdentity(db, l).tintBase].filter(Boolean).join(" · ")} · {formatPacks(l.packs)} ({l.gallons} gal){!unmapped && ` · ${codes.join(", ")}`}</div>
                    <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                      <span>Received <strong className="text-ink">{l.receivedGal}</strong></span>
                      <span>Unfilled <strong className={open > 0 && po.ackAt ? "text-amber-700" : "text-ink"}>{Math.max(0, open).toFixed(2)}</strong></span>
                      <span>Cancelled <strong className="text-ink">{l.cancelledGal}</strong></span>
                      <span>Returned <strong className="text-ink">{l.returnedGal}</strong></span>
                      {perms.seePrices && <span className="col-span-2">Amount <strong className="text-ink">{money(lineValue(l))}</strong> ({money(l.unitCostPerGal)}/gal)</span>}
                    </div>
                    {l.supplierStatusText && (
                      <div className={`mt-2 rounded-lg border px-2.5 py-1.5 text-xs ${known ? "border-line bg-gray-50 text-gray-600" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                        {!known && <strong>Needs review · </strong>}Supplier text, kept verbatim: <span className="font-mono">“{l.supplierStatusText}”</span>
                      </div>
                    )}
                    {l.substituteOffer && l.status === "substitute_available" && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                        <span><strong>Substitute offered:</strong> {l.substituteOffer.product}{l.substituteOffer.packSize ? ` (${l.substituteOffer.packSize})` : ""} · {dateTime(l.substituteOffer.at)}</span>
                        {perms.submit && <Button size="sm" className="ml-auto" onClick={() => setModal({ kind: "replace", line: l })}><Repeat2 className="h-3.5 w-3.5" /> Review substitute</Button>}
                      </div>
                    )}
                    {pendingCx.length > 0 && <div className="mt-2 text-xs text-gray-500">Cancellation of {pendingCx.reduce((a, c) => a + c.qtyGal, 0)} gal requested {dateTime(pendingCx[0].requestedAt)} — not confirmed by the branch, so nothing is released.</div>}
                  </div>
                  {(perms.receive || perms.submit) && (
                    <RowMenu items={[
                      ...(perms.receive ? [
                        { label: "Update status", icon: <Truck />, onSelect: () => setModal({ kind: "status", line: l }), disabled: !po.ackAt, reason: "Needs supplier acknowledgment first" },
                        { label: "Receive", icon: <PackageCheck />, onSelect: () => setModal({ kind: "receive", line: l }), disabled: !po.ackAt, reason: "Needs supplier acknowledgment first" },
                      ] : []),
                      ...(perms.submit ? [
                        { label: "Request cancellation", icon: <PackageX />, onSelect: () => setModal({ kind: "cancel", line: l }), disabled: open <= 0 || !po.sentAt, reason: !po.sentAt ? "Not sent yet" : "Nothing open on this line" },
                        { label: "Record branch-confirmed cancellation", icon: <ShieldAlert />, onSelect: () => setModal({ kind: "confirmCancel", line: l }), disabled: open <= 0 || !perms.isOfficeOrOwner || !po.sentAt, reason: !perms.isOfficeOrOwner ? "Office manager only" : "Nothing open on this line" },
                        { label: "Replace product / pack", icon: <Repeat2 />, onSelect: () => setModal({ kind: "replace", line: l }), disabled: l.receivedGal > 0, reason: "Already partly received" },
                        { label: l.tinted === false ? "Record return" : "Move leftover to shelf", icon: <Undo2 />, onSelect: () => setModal({ kind: "return", line: l }), disabled: l.receivedGal <= 0, reason: "Nothing received yet" },
                      ] : []),
                    ]} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ----- Supplier-facing document ----- */}
      <div>
        <CardLabel icon={<FileText />} right={perms.generate && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => printElement(docRef.current, po.id)}><Printer className="h-3.5 w-3.5" /> Print / PDF</Button>
            <Button size="sm" onClick={exportCsv}><Download className="h-3.5 w-3.5" /> CSV</Button>
          </div>
        )}>Supplier-facing order</CardLabel>
        {!perms.generate && <p className="mt-1 text-xs text-gray-500">Prices and account numbers are not shown for your role. Only the owner and office manager download or send priced orders.</p>}
        <div className="mt-3">
          <OrderDocument ref={docRef} db={db} po={po} showPrices={perms.seePrices} showAccount={perms.seeAccount} />
        </div>
      </div>

      {/* ----- Replacements / delivery / returns ----- */}
      {((po.replacements?.length ?? 0) > 0 || (po.deliveryChanges?.length ?? 0) > 0 || returns.length > 0) && (
        <div>
          <CardLabel icon={<RotateCcw />}>Changes, returns and credits</CardLabel>
          <div className="mt-3 space-y-2 text-xs">
            {po.deliveryChanges?.map((c) => (
              <div key={c.id} className="rounded-lg border border-line px-3 py-2">
                <strong>Delivery</strong> {dateLong(c.from)} → {dateLong(c.to)} ({c.days} days) · {c.status === "approved" ? `approved by ${userName(db, c.approvedBy)}` : c.status === "rejected" ? `rejected by ${userName(db, c.approvedBy)}` : "waiting for owner"} · {c.reason}
              </div>
            ))}
            {po.replacements?.map((r) => (
              <div key={r.id} className="rounded-lg border border-line px-3 py-2">
                <strong>Replacement {r.lineId}</strong> {r.original} → {r.replacement} · {(r.pctChange * 100).toFixed(1)}% · {r.status === "pending_owner" ? "waiting for owner" : `${r.status} by ${userName(db, r.approvedBy)}`}
              </div>
            ))}
            {returns.map((r) => (
              <div key={r.id} className="rounded-lg border border-line px-3 py-2">
                <strong>Return {r.id}</strong> · {r.qtyGal} gal from {r.lineId}{perms.seePrices && `, credit ${money(r.credit)}`} · {r.confirmed ? "credit confirmed" : "credit awaiting supplier"} · {r.reason}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ----- Trail ----- */}
      <div>
        <CardLabel icon={<History />}>Order trail</CardLabel>
        <div className="mt-3 space-y-2">
          {[...po.events, ...(po.calls ?? []).map((c) => ({ at: c.at, by: c.by, text: `Call with ${c.employee}: ${c.outcome.replace(/_/g, " ")}${c.note ? ` — ${c.note}` : ""}` }))]
            .sort((a, b) => b.at.localeCompare(a.at))
            .map((ev, i) => (
              <div key={i} className="border-l-2 border-line pl-3 text-xs">
                <div className="text-xxs font-bold uppercase text-gray-400">{dateTime(ev.at)} · {sourceName(db, ev)}</div>
                <div className="text-gray-700">{ev.text}</div>
              </div>
            ))}
        </div>
      </div>

      <ReceiveModal key={`r${modal.line?.id}`} po={modal.kind === "receive" ? po : undefined} lineId={modal.line?.id} onClose={close} />
      <LineStatusModal key={`s${modal.line?.id}`} po={po} line={modal.kind === "status" ? modal.line : undefined} onClose={close} />
      <CancelModal key={`c${modal.kind}${modal.line?.id}`} po={po} line={modal.kind === "cancel" || modal.kind === "confirmCancel" ? modal.line : undefined} mode={modal.kind === "confirmCancel" ? "confirm" : "request"} onClose={close} />
      <ReplaceModal key={`p${modal.line?.id}`} po={po} line={modal.kind === "replace" ? modal.line : undefined} onClose={close} />
      <ReturnModal key={`t${modal.line?.id}`} open={modal.kind === "return"} poId={po.id} lineId={modal.line?.id} onClose={close} />
      <CallModal key={`call${modal.kind}`} po={modal.kind === "call" ? po : undefined} onClose={close} />
      <DeliveryModal key={`d${modal.kind}`} po={modal.kind === "delivery" ? po : undefined} onClose={close} />
      <UncertainModal key={`u${modal.kind}`} po={modal.kind === "uncertain" ? po : undefined} onClose={close} />
      <ResendModal key={`rs${modal.kind}`} po={modal.kind === "resend" ? po : undefined} onClose={close} />
      <EditOrderModal key={`e${modal.kind}`} po={modal.kind === "editStore" || modal.kind === "editAmounts" ? po : undefined} mode={modal.kind === "editStore" ? "store" : "amounts"} onClose={close} />
    </>
  );
}

function SubmitPanel({ po, onEdit, canEdit }: { po: PurchaseOrder; onEdit: (mode: "store" | "amounts") => void; canEdit: boolean }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const branch = byId(db.branches, po.branchId);
  const supplier = byId(db.suppliers, po.supplierId);
  const conn = supplier?.connection;
  const electronic = conn?.type === "api_edi";
  const [method, setMethod] = useState<SendMethod>(electronic && conn?.health === "healthy" ? "electronic" : "email");
  const [ev, setEv] = useState<Evidence>({});
  const [busy, setBusy] = useState(false);
  const { run, e, setErr } = useErr();
  const gaps = branch ? branchGaps(branch) : [];
  const done = () => toast.success("Order sent", method === "electronic" ? `Transmitted${conn?.mode === "live" ? ` to ${conn.endpointHost ?? "the supplier"}` : " to the sandbox connector"}. Supplier replies update this order.` : "The four-working-hour acknowledgment clock has started.");
  const submit = async () => {
    if (method === "electronic" && conn?.mode === "live") {
      // Check everything first, so the supplier never gets an order the app would refuse to record.
      const pre = liveSendPreflight(getDb(), user, po.id);
      if ("error" in pre) return setErr({ field: pre.field, msg: pre.error });
      setBusy(true);
      const result = await sendLiveOrder(pre.payload);
      setBusy(false);
      if (run(act(submitOrder, po.id, "electronic", ev, result))) done();
      return;
    }
    if (run(act(submitOrder, po.id, method, ev))) done();
  };
  return (
    <div className="rounded-xl border border-blue-100 bg-brand-soft/40 p-4">
      <CardLabel icon={<Send />} right={canEdit && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onEdit("store")}><Building2 className="h-3.5 w-3.5" /> Select Supplier/Store Name</Button>
          <Button size="sm" onClick={() => onEdit("amounts")}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
        </div>
      )}>Submit to {supplier?.name ?? "supplier"}</CardLabel>
      <p className="mt-1 text-xs text-gray-500">Status stays Preparing until the destination is confirmed and the evidence is recorded.</p>
      {gaps.length > 0 && <Banner tone="danger" className="mt-3">{branch?.name} setup is incomplete (missing {gaps.map((g) => g.label.toLowerCase()).join(", ")}).</Banner>}
      <div className={`mt-3 rounded-lg border bg-white p-3 ${e("destination") ? "border-red-300" : "border-line"}`}>
        <Checkbox
          checked={po.destinationConfirmed}
          onCheckedChange={(v) => act(confirmDestination, po.id, v)}
          label={<span>I confirm this order goes to <strong>{branch?.name} (store {branch?.storeNumber || "—"})</strong> for <strong>{po.fulfilment === "delivery" ? "delivery to the job site" : "pickup at the branch"}</strong>.</span>}
        />
        {e("destination") && <p className="mt-1 text-xs font-medium text-red-600">{e("destination")}</p>}
      </div>
      <div className="mt-3">
        <EvidenceFields method={method} setMethod={setMethod} ev={ev} setEv={setEv} e={e} electronic={electronic ? { po } : undefined} />
      </div>
      <div className="mt-3 flex justify-end">
        <Button variant="primary" onClick={submit} disabled={busy}><Send className="h-4 w-4" /> {busy ? "Sending…" : "Send Order"}</Button>
      </div>
    </div>
  );
}

const SANDBOX_REPLIES = ["Processing", "Ready for pickup", "Partially filled", "Picked up", "Substitute available", "Custom text"] as const;

/**
 * Stands in for the supplier on sandbox orders. Each button pushes a message
 * through the real inbound handler, so the order updates exactly as it would
 * from a live connection, and the trail names the supplier as the source.
 */
function SandboxSupplierPanel({ po }: { po: PurchaseOrder }) {
  const db = useDb((d) => d);
  const [lineId, setLineId] = useState(po.lines[0]?.id ?? "");
  const [reply, setReply] = useState<(typeof SANDBOX_REPLIES)[number]>("Processing");
  const [text, setText] = useState("");
  const [subId, setSubId] = useState(db.catalog[0]?.id ?? "");
  const send = (msg: Parameters<typeof simulateSupplierMessage>[2]) => {
    if (act(simulateSupplierMessage, msg).ok) toast.success("Supplier message applied", "Sandbox — recorded with the supplier as the source.");
  };
  const sendLine = () => {
    if (reply === "Substitute available") {
      const cat = byId(db.catalog, subId);
      return send({ poId: po.id, kind: "line_status", lineId, statusText: "Substitute available", substitute: { product: cat?.product ?? "", packSize: cat?.available[0] } });
    }
    send({ poId: po.id, kind: "line_status", lineId, statusText: reply === "Custom text" ? text : reply });
  };
  return (
    <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/40 p-4">
      <CardLabel icon={<FlaskConical />} right={<Badge tone="amber">Sandbox</Badge>}>Simulate supplier replies</CardLabel>
      <p className="mt-1 text-xs text-gray-600">No real supplier is connected. These stand in for messages from {po.transmission!.connector} (message {po.transmission!.messageId}).</p>
      {!po.ackAt ? (
        <div className="mt-3">
          <Button size="sm" onClick={() => send({ poId: po.id, kind: "order_received", reference: `${po.transmission!.messageId}-ACK` })}><CheckCircle2 className="h-3.5 w-3.5" /> Supplier: order received</Button>
        </div>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-[110px_1fr_1fr_auto] sm:items-end">
          <Field label="Line">
            <Select value={lineId} onChange={(ev) => setLineId(ev.target.value)}>
              {po.lines.map((l) => <option key={l.id} value={l.id}>{l.id}</option>)}
            </Select>
          </Field>
          <Field label="Supplier reply">
            <Select value={reply} onChange={(ev) => setReply(ev.target.value as typeof reply)}>
              {SANDBOX_REPLIES.map((r) => <option key={r}>{r}</option>)}
            </Select>
          </Field>
          {reply === "Substitute available" ? (
            <Field label="Offered product">
              <Select value={subId} onChange={(ev) => setSubId(ev.target.value)}>
                {db.catalog.map((c) => <option key={c.id} value={c.id}>{c.manufacturer} · {c.product}</option>)}
              </Select>
            </Field>
          ) : reply === "Custom text" ? (
            <Field label="Supplier's text">
              <Input value={text} onChange={(ev) => setText(ev.target.value)} placeholder='e.g. "BO - TINT MACH DOWN"' />
            </Field>
          ) : <div />}
          <Button size="sm" variant="primary" onClick={sendLine}><Send className="h-3.5 w-3.5" /> Push</Button>
        </div>
      )}
    </div>
  );
}

function AckPanel({ po, onCall, onUncertain }: { po: PurchaseOrder; onCall: () => void; onUncertain: () => void }) {
  const [method, setMethod] = useState<"confirmation_number" | "supplier_reply" | "call" | "read_receipt">("confirmation_number");
  const [reference, setReference] = useState("");
  const [employee, setEmployee] = useState("");
  const [time, setTime] = useState("");
  const { run, e, err } = useErr();
  const nowIso = now();
  const ex = ackException(po, [], nowIso);
  const submit = () => {
    if (run(act(acknowledgeOrder, po.id, { method, reference, employee, time: time ? new Date(time).toISOString() : undefined }))) toast.success("Acknowledged", "Quantities now count as purchased (Rule 2).");
  };
  return (
    <div className="rounded-xl border border-line p-4">
      <CardLabel icon={<CheckCircle2 />} right={ex && <span className="text-xs text-gray-500">{ex.overdue ? "Clock expired" : `${minutesLabel(ex.remainingMinutes)} working time left`}</span>}>Record acknowledgment</CardLabel>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="What came back?" required error={e("method")}>
          <Select value={method} onChange={(ev) => setMethod(ev.target.value as typeof method)} invalid={!!e("method")}>
            <option value="confirmation_number">Order confirmation number</option>
            <option value="supplier_reply">Supplier reply</option>
            <option value="call">Call with a named branch employee</option>
            <option value="read_receipt">Read receipt only</option>
          </Select>
        </Field>
        {(method === "confirmation_number" || method === "supplier_reply") && (
          <Field label={method === "confirmation_number" ? "Confirmation number" : "Reply reference"} required error={e("reference")}>
            <Input value={reference} onChange={(ev) => setReference(ev.target.value)} placeholder={method === "confirmation_number" ? "e.g. SW-7248-90112" : "e.g. Reply from orders@7248, 10:14"} invalid={!!e("reference")} />
          </Field>
        )}
        {method === "call" && (
          <>
            <Field label="Branch employee" required error={e("employee")}>
              <Input value={employee} onChange={(ev) => setEmployee(ev.target.value)} invalid={!!e("employee")} />
            </Field>
            <Field label="Call time" required error={e("time")}>
              <Input type="datetime-local" value={time} onChange={(ev) => setTime(ev.target.value)} invalid={!!e("time")} />
            </Field>
          </>
        )}
      </div>
      {err.field === "method" && <Banner tone="danger" className="mt-3">{err.msg}</Banner>}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button onClick={onUncertain}><AlertTriangle className="h-4 w-4" /> Mark send uncertain</Button>
        <Button onClick={onCall}><PhoneCall className="h-4 w-4" /> Record call</Button>
        <Button variant="primary" onClick={submit}><CheckCircle2 className="h-4 w-4" /> Mark acknowledged</Button>
      </div>
    </div>
  );
}
