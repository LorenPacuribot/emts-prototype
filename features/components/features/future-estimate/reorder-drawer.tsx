"use client";
/**
 * Touch-up reorder detail: quantity, payment, stock check, approval,
 * fulfilment, cancellation and the refund panel (Component 28.4).
 */
import { useState } from "react";
import {
  Ban, CheckCircle2, CircleDollarSign, Clock, FlaskConical, Info, PackageCheck, PaintBucket, Receipt, ShieldCheck, Trash2, UserRound,
} from "lucide-react";
import type { TouchUpReorder } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import {
  approveReorder, cancelReorder, deleteReorderDraft, fulfilReorder, logCustomerAppliedWork, recordRefund, recordStockCheck, setReorderPayment,
  updateReorderQuantity, type StockCheckDraft,
} from "@/features/lib/store/actions/future-estimate";
import { PAYMENT_BLOCKED, paymentAllowsApproval, reorderQuantity, stockCheckResult, workingDaysUntil } from "@/features/lib/rules/future-estimate";
import { formatPacks } from "@/features/lib/rules/materials";
import { can } from "@/features/lib/permissions";
import { byId, catalogFor, surfaceLabel } from "@/features/lib/selectors";
import { dateLong, dateTime } from "@/features/lib/format";
import { now } from "@/features/lib/clock";
import { toast } from "@/features/lib/toast";
import { REORDER_STATUS } from "@/features/lib/status";
import { cn } from "@/features/lib/cn";
import { Badge, Banner, Button, CardLabel, Checkbox, ConfirmDialog, Drawer, Field, IdChip, Input, KV, Modal, PillTabs, Select, Swatch, Textarea } from "@/features/components/ui";
import { fromDateInput, toDateInput, todayInput } from "@/features/components/features/properties/property-shared";
import { QTY_PRESETS } from "./reorder-form";

export function ReorderDrawer({ reorder, onClose }: { reorder?: TouchUpReorder; onClose: () => void }) {
  return (
    <Drawer
      open={!!reorder}
      onOpenChange={(v) => !v && onClose()}
      title={reorder ? <span className="flex flex-wrap items-center gap-2">{reorder.id} <Badge tone={REORDER_STATUS[reorder.status].tone}>{REORDER_STATUS[reorder.status].label}</Badge></span> : ""}
      subtitle="Touch-up reorder · property-linked paint sale"
    >
      {reorder && <Body key={reorder.id} r={reorder} onClose={onClose} />}
    </Drawer>
  );
}

function Body({ r, onClose }: { r: TouchUpReorder; onClose: () => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const canAct = can(user, "reorder.approve");
  const app = byId(db.applications, r.applicationId)!;
  const cat = catalogFor(db, app.product);
  const draft = r.status === "draft";
  const [cancelOpen, setCancelOpen] = useState<"customer_cancelled" | "unfillable">();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [workOpen, setWorkOpen] = useState(false);

  return (
    <>
      <div className="flex items-start gap-3 rounded-xl border border-line p-3">
        <Swatch hex={app.hex} size="lg" />
        <KV
          className="flex-1"
          items={[
            ["Colour", `${app.colourName} ${app.colourNumber}`],
            ["Product · sheen", `${app.product} · ${app.sheen}`],
            ["Surface", surfaceLabel(db, app.surfaceId)],
            ["Linked record", <span key="l" className="flex flex-wrap gap-1"><IdChip>{r.propertyId}</IdChip><IdChip tone="blue">{app.jobId ?? "No job"}</IdChip><IdChip>{app.id}</IdChip></span>],
            ...(r.touchUpRequestId ? ([["From request", r.touchUpRequestId]] as [string, string][]) : []),
            ["Started", `${dateTime(r.createdAt)} by ${byId(db.users, r.createdBy)?.name}`],
            ...(r.note ? ([["Note", r.note]] as [string, string][]) : []),
          ]}
        />
      </div>

      <Banner tone="info" title="Paint sale only">
        Selling paint never creates an application record and never resets the repaint clock. Customer-applied work can be logged afterwards as Unverified.
      </Banner>

      {!canAct && <Banner tone="info" title="Read-only for your role">The Office Manager and the Business Owner handle touch-up reorders.</Banner>}

      <QuantityPanel r={r} editable={draft && canAct} available={cat?.available ?? []} />
      <PaymentPanel r={r} editable={draft && canAct} />
      <StockPanel r={r} editable={draft && canAct} />

      {r.status === "cancelled" && <RefundPanel r={r} canAct={canAct} />}

      {r.status === "fulfilled" && (
        <section className="space-y-2">
          <CardLabel icon={<PackageCheck />}>Fulfilled</CardLabel>
          <p className="text-[12.5px] text-slate-600">Handed over {dateTime(r.fulfilledAt)}. No application history was created; the repaint schedule for {surfaceLabel(db, app.surfaceId)} is unchanged.</p>
          {canAct && <Button size="sm" onClick={() => setWorkOpen(true)}><UserRound className="h-3.5 w-3.5" /> Log customer-applied work (Unverified)</Button>}
        </section>
      )}

      {canAct && (draft || r.status === "approved") && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          {draft && (
            <Button
              variant="primary"
              onClick={() => act(approveReorder, r.id).ok && toast.success(`${r.id} approved`, "Linked to the property. Fill it when ready.")}
            >
              <ShieldCheck className="h-4 w-4" /> Approve
            </Button>
          )}
          {r.status === "approved" && (
            <Button variant="success" onClick={() => act(fulfilReorder, r.id).ok && toast.success(`${r.id} fulfilled`, "Paint sale recorded. No application history created.")}>
              <PackageCheck className="h-4 w-4" /> Fulfil
            </Button>
          )}
          <Button variant="danger" onClick={() => setCancelOpen("customer_cancelled")}><Ban className="h-4 w-4" /> Cancel order</Button>
          <Button variant="danger" onClick={() => setCancelOpen("unfillable")}>Mark unfillable</Button>
          {draft && <Button variant="ghost" onClick={() => setDeleteOpen(true)}><Trash2 className="h-4 w-4" /> Delete draft</Button>}
        </div>
      )}

      <ConfirmDialog
        open={!!cancelOpen}
        onOpenChange={(v) => !v && setCancelOpen(undefined)}
        title={cancelOpen === "unfillable" ? `Mark ${r.id} unfillable?` : `Cancel ${r.id}?`}
        body={r.payment === "prepaid_cleared" ? "This order was prepaid. A refund to the original payment method becomes due within five working days. The payment itself is handled outside Estimate Master." : "No cleared prepayment is recorded, so no refund is due."}
        confirmLabel={cancelOpen === "unfillable" ? "Mark unfillable" : "Cancel order"}
        onConfirm={() => cancelOpen && act(cancelReorder, r.id, cancelOpen).ok && toast.success(`${r.id} cancelled`, r.payment === "prepaid_cleared" ? "Refund due within five working days." : undefined)}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete draft ${r.id}?`}
        body={r.touchUpRequestId ? `The draft is removed and ${r.touchUpRequestId} goes back to Acknowledged.` : "The draft is removed."}
        confirmLabel="Delete draft"
        onConfirm={() => { if (act(deleteReorderDraft, r.id).ok) { toast.success("Draft deleted", r.id); onClose(); } }}
      />
      {workOpen && <CustomerWorkModal r={r} onClose={() => setWorkOpen(false)} />}
    </>
  );
}

function QuantityPanel({ r, editable, available }: { r: TouchUpReorder; editable: boolean; available: ("qt" | "gal" | "5gal")[] }) {
  const [qty, setQty] = useState(String(r.requestedGal ?? r.gallons));
  const [purpose, setPurpose] = useState(r.purpose ?? "touch_up");
  const q = reorderQuantity({ requestedGal: Number(qty), purpose, available });
  const changed = Number(qty) !== (r.requestedGal ?? r.gallons) || purpose !== (r.purpose ?? "touch_up");
  return (
    <section className="space-y-2">
      <CardLabel icon={<PaintBucket />}>Quantity</CardLabel>
      <KV items={[["Requested", `${r.requestedGal ?? r.gallons} gal`], ["Order", `${formatPacks(r.packs)} (${r.gallons} gal)`], ["Purpose", r.purpose === "non_touch_up" ? "Other small order" : "Touch-up"]]} />
      {(r.excessGal ?? 0) > 0 && (
        <p className="text-[12px] text-slate-500">{r.excessGal} gal over the request because of pack sizes{r.purpose === "non_touch_up" ? "; the excess goes to shelf stock on fulfilment." : "; it goes to the customer with the order."}</p>
      )}
      {editable && (
        <div className="space-y-2 rounded-xl border border-line p-3">
          <PillTabs value={purpose} onChange={setPurpose} options={[{ value: "touch_up", label: "Touch-up" }, { value: "non_touch_up", label: "Other small order" }]} />
          <div className="flex flex-wrap items-center gap-2">
            <Input type="number" min={0} step={0.25} className="w-24" value={qty} onChange={(e) => setQty(e.target.value)} invalid={!q.ok} aria-label="Quantity in gallons" />
            {QTY_PRESETS.map((p) => <Button key={p.label} size="sm" variant={Number(qty) === p.gal ? "dark" : "secondary"} onClick={() => setQty(String(p.gal))}>{p.label}</Button>)}
          </div>
          {!q.ok ? <p className="text-[11.5px] font-medium text-red-600">{q.error}</p> : q.note && <p className="text-[11.5px] text-amber-700">{q.note}</p>}
          <Button size="sm" disabled={!changed} onClick={() => act(updateReorderQuantity, r.id, Number(qty), purpose).ok && toast.success("Quantity updated")}>Set quantity</Button>
        </div>
      )}
    </section>
  );
}

function PaymentPanel({ r, editable }: { r: TouchUpReorder; editable: boolean }) {
  const [payment, setPayment] = useState(r.payment);
  const [method, setMethod] = useState(r.paymentMethod ?? "");
  const [source, setSource] = useState(r.paymentSource ?? "");
  const [err, setErr] = useState<{ field?: string; msg: string }>();
  const save = () => {
    const res = act(setReorderPayment, r.id, payment, { method, source });
    if (!res.ok) return setErr({ field: res.field, msg: res.error });
    setErr(undefined);
    toast.success("Payment status saved");
  };
  return (
    <section className="space-y-2">
      <CardLabel icon={<CircleDollarSign />}>Payment</CardLabel>
      {paymentAllowsApproval(r.payment) ? (
        <Banner tone="success" title={r.payment === "on_account" ? "On account" : "Prepayment cleared"}>
          {r.paymentMethod && `${r.paymentMethod}. `}Source: {r.paymentSource}
        </Banner>
      ) : (
        <Banner tone="danger" title="Payment blocked">{PAYMENT_BLOCKED}</Banner>
      )}
      {editable && (
        <div className="space-y-3 rounded-xl border border-line p-3">
          <PillTabs
            value={payment}
            onChange={(v) => { setPayment(v); setErr(undefined); }}
            options={[{ value: "unpaid", label: "Unpaid" }, { value: "prepaid_cleared", label: "Prepayment cleared" }, { value: "on_account", label: "On account" }]}
          />
          {payment === "prepaid_cleared" && (
            <Field label="Payment method" required htmlFor="pm" error={err?.field === "method" ? err.msg : undefined}>
              <Input id="pm" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Card, check #, cash" invalid={err?.field === "method"} />
            </Field>
          )}
          {payment !== "unpaid" && (
            <Field
              label={payment === "on_account" ? "Bookkeeper receivables information" : "How the payment was verified as cleared"}
              required
              htmlFor="ps"
              error={err?.field === "source" ? err.msg : undefined}
              hint={payment === "on_account" ? "e.g. Grace Kim's receivables report, date, account standing." : undefined}
            >
              <Input id="ps" value={source} onChange={(e) => setSource(e.target.value)} invalid={err?.field === "source"} />
            </Field>
          )}
          <Button size="sm" onClick={save}>Confirm payment status</Button>
        </div>
      )}
    </section>
  );
}

function StockPanel({ r, editable }: { r: TouchUpReorder; editable: boolean }) {
  const db = useDb((d) => d);
  const app = byId(db.applications, r.applicationId)!;
  const matching = db.shelfStock.filter((s) => s.colourNumber === app.colourNumber && !s.reservedJobId);
  const sc = r.stockCheck;
  const [supply, setSupply] = useState<StockCheckDraft["supply"]>(r.supply ?? "new_order");
  const [stockId, setStockId] = useState(sc?.stockId ?? matching[0]?.id ?? "");
  const stock = byId(db.shelfStock, stockId);
  const [brand, setBrand] = useState(sc?.brand ?? app.manufacturer);
  const [code, setCode] = useState(sc?.code ?? app.colourNumber);
  const [sheen, setSheen] = useState(sc?.sheen ?? String(app.sheen));
  const [tint, setTint] = useState(toDateInput(sc?.tintDate ?? stock?.tintDate));
  const [issues, setIssues] = useState<StockCheckDraft["issues"]>(sc?.issues ?? []);
  const [cans, setCans] = useState(r.customerCansNote ?? "");
  const [err, setErr] = useState<{ field?: string; msg: string }>();

  const preview = supply !== "new_order" ? stockCheckResult({
    tintDate: fromDateInput(tint), nowIso: now(), issues,
    brandMatches: brand.trim().toLowerCase() === app.manufacturer.toLowerCase(),
    codeMatches: code.replace(/\s/g, "").toLowerCase() === app.colourNumber.replace(/\s/g, "").toLowerCase(),
    sheenMatches: sheen.toLowerCase() === String(app.sheen).toLowerCase(),
  }) : undefined;

  const save = () => {
    const res = act(recordStockCheck, r.id, { supply, stockId, customerCansNote: cans, brand, code, sheen, tintDate: fromDateInput(tint), issues });
    if (!res.ok) return setErr({ field: res.field, msg: res.error });
    setErr(undefined);
    const v = res.value as { result: string };
    if (v.result === "Rematch required") toast.error("Rematch required", "This stock can't be issued. Switch to a new order.");
    else toast.success(supply === "new_order" ? "New order selected" : "Stock check recorded: usable");
  };
  const toggleIssue = (i: StockCheckDraft["issues"][number], v: boolean) => setIssues(v ? [...issues, i] : issues.filter((x) => x !== i));

  return (
    <section className="space-y-2">
      <CardLabel icon={<FlaskConical />}>Stock check</CardLabel>
      <KV items={[["Supply", r.supply === "company_stock" ? `Company shelf stock ${sc?.stockId ?? ""}` : r.supply === "customer_cans" ? "Customer-owned cans (not company stock)" : "New order, tinted from the colour record"]]} />
      {sc && (
        <div className={cn("rounded-xl border p-3 text-[12.5px]", sc.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50")}>
          <div className={cn("flex items-center gap-1.5 font-semibold", sc.ok ? "text-emerald-800" : "text-red-800")}>
            {sc.ok ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />} {sc.ok ? "Usable" : "Rematch required"}
          </div>
          <div className="mt-1 text-slate-700">Brand {sc.brand}, code {sc.code}, sheen {sc.sheen}, tint date {sc.tintDate ? dateLong(sc.tintDate) : "none"}. {sc.ok ? "" : `Failed: ${sc.note}. This stock can't be issued; the surface must be rematched.`}</div>
          <div className="mt-1 text-[11px] text-slate-500">Checked {dateTime(sc.checkedAt)} by {byId(db.users, sc.checkedBy)?.name}</div>
        </div>
      )}
      {editable && (
        <div className="space-y-3 rounded-xl border border-line p-3">
          <PillTabs
            value={supply}
            onChange={(v) => { setSupply(v); setErr(undefined); }}
            options={[{ value: "new_order", label: "New order" }, { value: "company_stock", label: `Company stock (${matching.length})` }, { value: "customer_cans", label: "Customer's cans" }]}
          />
          {supply === "company_stock" && (
            <Field label="Shelf stock item" required htmlFor="stk" error={err?.field === "stockId" ? err.msg : undefined}>
              <Select id="stk" value={stockId} onChange={(e) => { setStockId(e.target.value); setTint(toDateInput(byId(db.shelfStock, e.target.value)?.tintDate)); }}>
                <option value="">Choose…</option>
                {matching.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.product} {s.colourName} {s.sheen} · {s.containerSize} · tinted {dateLong(s.tintDate)}</option>)}
              </Select>
              {matching.length === 0 && <p className="text-[11.5px] italic text-slate-400">No unreserved shelf stock in this colour.</p>}
            </Field>
          )}
          {supply === "customer_cans" && (
            <Field label="Customer's cans" required htmlFor="cans" error={err?.field === "customerCansNote" ? err.msg : undefined} hint="Recorded separately. Never added to company stock.">
              <Textarea id="cans" value={cans} onChange={(e) => setCans(e.target.value)} placeholder="e.g. 1 part-used gallon in customer's garage" />
            </Field>
          )}
          {supply !== "new_order" && (
            <>
              <p className="text-[11.5px] text-slate-500">Read these off the can itself. Physical check required before issuing existing paint.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Brand" required htmlFor="sb" error={err?.field === "brand" ? err.msg : undefined}><Input id="sb" value={brand} onChange={(e) => setBrand(e.target.value)} /></Field>
                <Field label="Colour code" required htmlFor="sc" error={err?.field === "code" ? err.msg : undefined}><Input id="sc" value={code} onChange={(e) => setCode(e.target.value)} /></Field>
                <Field label="Sheen" required htmlFor="ss" error={err?.field === "sheen" ? err.msg : undefined}>
                  <Select id="ss" value={sheen} onChange={(e) => setSheen(e.target.value)}>
                    {["Flat", "Matte", "Eggshell", "Satin", "Semi-Gloss", "Gloss"].map((s) => <option key={s}>{s}</option>)}
                  </Select>
                </Field>
                <Field label="Tint date" htmlFor="st"><Input id="st" type="date" max={todayInput()} value={tint} onChange={(e) => setTint(e.target.value)} /></Field>
              </div>
              <div className="flex flex-wrap gap-4">
                <Checkbox checked={issues.includes("skinning")} onCheckedChange={(v) => toggleIssue("skinning", v)} label="Skinning" />
                <Checkbox checked={issues.includes("separation")} onCheckedChange={(v) => toggleIssue("separation", v)} label="Separation" />
                <Checkbox checked={issues.includes("unlabelled")} onCheckedChange={(v) => toggleIssue("unlabelled", v)} label="Unlabelled" />
              </div>
              {preview && (
                <Banner tone={preview.result === "Usable" ? "success" : "danger"} title={`Outcome: ${preview.result}`}>
                  {preview.reasons.length ? preview.reasons.join("; ") : "Matches the record, sound and under two years old."}
                </Banner>
              )}
            </>
          )}
          <Button size="sm" onClick={save}>{supply === "new_order" ? "Use new order" : "Record stock check"}</Button>
        </div>
      )}
    </section>
  );
}

function RefundPanel({ r, canAct }: { r: TouchUpReorder; canAct: boolean }) {
  const db = useDb((d) => d);
  if (!r.refundDueAt) {
    return (
      <section className="space-y-2">
        <CardLabel icon={<Receipt />}>Cancelled</CardLabel>
        <p className="text-[12.5px] text-slate-600">{r.cancelReason === "unfillable" ? "Unfillable" : "Cancelled"} {dateLong(r.cancelledAt)}. No cleared prepayment was recorded, so no refund is due.</p>
      </section>
    );
  }
  const left = workingDaysUntil(now(), r.refundDueAt);
  return (
    <section className="space-y-2">
      <CardLabel icon={<Receipt />}>Refund</CardLabel>
      {r.refundRecordedAt ? (
        <Banner tone="success" title={`Refund recorded ${dateLong(r.refundRecordedAt)}`}>
          To the original method ({r.paymentMethod}) by {byId(db.users, r.refundRecordedBy)?.name}. Due by {dateLong(r.refundDueAt)}.
        </Banner>
      ) : (
        <Banner
          tone={left < 0 ? "danger" : "warn"}
          title={<span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Refund due {dateLong(r.refundDueAt)} · {left < 0 ? `${-left} working day${left === -1 ? "" : "s"} overdue` : `${left} working day${left === 1 ? "" : "s"} left`}</span>}
          action={canAct && <Button size="sm" variant="primary" onClick={() => act(recordRefund, r.id).ok && toast.success("Refund recorded", r.id)}>Refund recorded</Button>}
        >
          {r.cancelReason === "unfillable" ? "Order unfillable." : "Order cancelled."} Refund {r.gallons} gal order to the original method ({r.paymentMethod}) within five working days of {dateLong(r.cancelledAt)}.
          <span className="mt-1 flex items-center gap-1 text-[11.5px]"><Info className="h-3 w-3" /> The payment itself is made outside Estimate Master; record it here once done.</span>
        </Banner>
      )}
    </section>
  );
}

function CustomerWorkModal({ r, onClose }: { r: TouchUpReorder; onClose: () => void }) {
  const [date, setDate] = useState(todayInput());
  const [note, setNote] = useState("");
  const [err, setErr] = useState<{ field?: string; msg: string }>();
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      size="sm"
      title="Log customer-applied work"
      description="Logged as Unverified without crew confirmation. It never resets the repaint clock."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              const res = act(logCustomerAppliedWork, r.id, fromDateInput(date) ?? "", note);
              if (!res.ok) return setErr({ field: res.field, msg: res.error });
              toast.success("Logged as Unverified", "Repaint clock unchanged.");
              onClose();
            }}
          >
            Log work
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Date applied (per customer)" required htmlFor="cw-d" error={err?.field === "date" ? err.msg : undefined}>
          <Input id="cw-d" type="date" max={todayInput()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="What the customer reported" required htmlFor="cw-n" error={err?.field === "note" ? err.msg : undefined}>
          <Textarea id="cw-n" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Touched up baseboard scratches in living room" invalid={err?.field === "note"} />
        </Field>
      </div>
    </Modal>
  );
}
