"use client";
/**
 * Component 18.5 — Order builder: supplier, branch, phase, delivery date,
 * line selection and the limit check. Estimators request submission and see
 * pass/fail only; the office manager or owner generates the priced order.
 * Generation is idempotent: this builder carries one generation key, so a
 * repeated click returns the same order.
 */
import { useMemo, useState } from "react";
import { FilePlus2, Eye, Send, ShieldCheck, UserCheck } from "lucide-react";
import type { Job } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { generateOrder, previewLimit, requestSubmission, type OrderDraft } from "@/features/lib/store/actions/materials";
import { byId } from "@/features/lib/selectors";
import { money } from "@/features/lib/format";
import { formatPacks, packContainers, ESTIMATOR_ORDER_LIMIT, OWNER_LIFETIME_LIMIT } from "@/features/lib/rules/materials";
import { branchGaps, lineState, packsCost, type DemandLine } from "@/features/lib/rules/procurement";
import { now } from "@/features/lib/clock";
import { toast } from "@/features/lib/toast";
import { Badge, Banner, Button, Checkbox, Field, Input, Modal, PillTabs, Select, Textarea } from "@/features/components/ui";
import { cn } from "@/features/lib/cn";
import { dateInputToIso, procurementPerms } from "@/features/components/features/procurement/shared";

export function OrderBuilder({ open, job, lines, onClose, onViewOrder }: { open: boolean; job: Job; lines: DemandLine[]; onClose: () => void; onViewOrder: (id: string) => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const perms = procurementPerms(user);
  const [key, setKey] = useState(() => `GEN-${job.id}-${Math.random().toString(36).slice(2, 10)}`);
  const [generated, setGenerated] = useState<string>();
  const [supplierId, setSupplierId] = useState("SUP-SW");
  const branches = db.branches.filter((b) => b.supplierId === supplierId);
  const [branchId, setBranchId] = useState(branches.find((b) => branchGaps(b).length === 0)?.id ?? branches[0]?.id ?? "");
  const [phase, setPhase] = useState("");
  const [date, setDate] = useState("");
  const [fulfilment, setFulfilment] = useState<"pickup" | "delivery">("pickup");
  const [contact, setContact] = useState(byId(db.users, job.crewLeadId)?.name ?? "");
  const [phone, setPhone] = useState("(214) 555-0199");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<{ field?: string; msg?: string }>({});
  const [ownerRoute, setOwnerRoute] = useState(false);

  const orderable = lines.filter((l) => l.blocked.length === 0).map((l) => ({ l, s: lineState(db, job.id, l.specId, l.needGal) }));
  const [sel, setSel] = useState<Record<string, { on: boolean; qty: string }>>(() =>
    Object.fromEntries(orderable.map(({ l, s }) => [l.specId, { on: s.orderableNow > 0, qty: s.orderableNow > 0 ? String(s.orderableNow) : "" }])),
  );

  const draft: OrderDraft = {
    jobId: job.id, supplierId, branchId, phase, deliveryDate: date ? dateInputToIso(date) : "", fulfilment, pickupContact: contact, pickupPhone: phone,
    lines: Object.entries(sel).filter(([, v]) => v.on).map(([specId, v]) => ({ specId, gallons: Number(v.qty) })),
  };
  const preview = useMemo(() => previewLimit(db, user, draft), [db, user, JSON.stringify(draft)]); // eslint-disable-line react-hooks/exhaustive-deps
  const limit = "error" in preview ? undefined : preview;
  const e = (f: string) => (err.field === f ? err.msg : undefined);

  function request() {
    const res = act(requestSubmission, draft, note);
    if (res.ok) {
      toast.success(`Request ${res.value} sent to the office`, "The office manager generates the priced order.");
      onClose();
    } else setErr({ field: res.field, msg: res.error });
  }
  function generate() {
    const res = act(generateOrder, { ...draft, key });
    if (res.ok) {
      setGenerated(res.value as string);
      toast.success(`Order ${res.value} generated`, "Confirm the destination and send it from the order.");
    } else {
      setErr({ field: res.field, msg: res.error });
      if (res.field === "owner") setOwnerRoute(true);
    }
  }

  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} size="xl" title={perms.generate ? "Generate order" : "Request order submission"}
      description={perms.generate ? "Priced order on the JOB-PO-01 sequence. Generating twice never creates a second commitment." : "You approve demand and request submission. The office generates the priced order."}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          {generated ? (
            <>
              <Button onClick={() => { setGenerated(undefined); setKey(`GEN-${job.id}-${Math.random().toString(36).slice(2, 10)}`); }}><FilePlus2 className="h-4 w-4" /> Start a new order</Button>
              <Button variant="primary" onClick={() => onViewOrder(generated)}><Eye className="h-4 w-4" /> View order {generated}</Button>
            </>
          ) : perms.generate ? (
            <>
              {ownerRoute && <Button onClick={request}><UserCheck className="h-4 w-4" /> Route to owner</Button>}
              <Button variant="primary" onClick={generate} disabled={!!("error" in preview && !draft.lines.length)}><ShieldCheck className="h-4 w-4" /> Generate priced order</Button>
            </>
          ) : (
            <Button variant="primary" onClick={request}><Send className="h-4 w-4" /> Request submission</Button>
          )}
        </>
      }
    >
      {generated && <Banner tone="success" className="mb-4" title={`Order ${generated} is committed`}>Clicking Generate again returns this same order. Use “Start a new order” for a genuinely new commitment.</Banner>}
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Supplier" required error={e("supplier")}>
              <Select value={supplierId} onChange={(ev) => { setSupplierId(ev.target.value); setBranchId(db.branches.find((b) => b.supplierId === ev.target.value)?.id ?? ""); }}>
                {db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Branch" required error={e("branch")}>
              <Select value={branchId} onChange={(ev) => setBranchId(ev.target.value)} invalid={!!e("branch")}>
                {branches.length === 0 && <option value="">No branches</option>}
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.storeNumber ? ` (${b.storeNumber})` : ""}{branchGaps(b).length ? " — setup incomplete" : ""}</option>)}
              </Select>
            </Field>
            <Field label="Phase" required error={e("phase")}>
              <Input value={phase} onChange={(ev) => setPhase(ev.target.value)} placeholder="e.g. Phase 2 — Body top-up" invalid={!!e("phase")} />
            </Field>
            <Field label={fulfilment === "pickup" ? "Pickup date" : "Delivery date"} required error={e("deliveryDate")}>
              <Input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} invalid={!!e("deliveryDate")} />
            </Field>
            <Field label="Pickup or delivery">
              <PillTabs value={fulfilment} onChange={setFulfilment} options={[{ value: "pickup", label: "Pickup" }, { value: "delivery", label: "Delivery" }]} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Pickup contact"><Input value={contact} onChange={(ev) => setContact(ev.target.value)} /></Field>
              <Field label="Phone"><Input value={phone} onChange={(ev) => setPhone(ev.target.value)} /></Field>
            </div>
          </div>

          <div>
            <div className="mb-2 text-[12px] font-semibold text-slate-700">Lines <span className="font-normal text-slate-400">— quantities default to orderable now (Rule 2)</span></div>
            {e("lines") && <p className="mb-2 text-[11.5px] font-medium text-red-600">{e("lines")}</p>}
            <div className="space-y-2">
              {orderable.length === 0 && <p className="text-[12.5px] italic text-slate-400">No orderable lines.</p>}
              {orderable.map(({ l, s }) => {
                const v = sel[l.specId] ?? { on: false, qty: "" };
                const q = Number(v.qty);
                const packs = q > 0 && l.catalog ? packContainers(q, l.catalog.available, { strategy: db.procurementSettings?.packingStrategy, cost: l.catalog.cost }) : undefined;
                const disabled = s.orderableNow <= 0;
                return (
                  <div key={l.specId} className={cn("flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-[12.5px]", v.on ? "border-brand/40 bg-brand-soft/30" : "border-line")}>
                    <Checkbox checked={v.on} disabled={disabled} onCheckedChange={(on) => setSel({ ...sel, [l.specId]: { ...v, on } })} label={<span className="font-semibold text-ink">{l.colourName} · {l.spec.product}</span>} />
                    <span className="text-slate-500">{l.specId} · orderable now {s.orderableNow.toFixed(2)} gal</span>
                    {disabled && <Badge tone={s.sentUnacknowledged > 0 ? "blue" : "gray"}>{s.sentUnacknowledged > 0 && s.outstanding > 0 ? "Already ordered, awaiting acknowledgment" : "Nothing outstanding"}</Badge>}
                    {!disabled && (
                      <span className="ml-auto flex items-center gap-2">
                        <Input type="number" step="0.25" className="h-8 w-24" value={v.qty} onChange={(ev) => setSel({ ...sel, [l.specId]: { ...v, qty: ev.target.value } })} aria-label={`Quantity for ${l.specId}`} />
                        <span className="whitespace-nowrap text-slate-600">{packs ? formatPacks(packs.packs) : "—"}</span>
                        {perms.seePrices && packs && l.catalog && <span className="whitespace-nowrap tabular-nums text-slate-500">{money(packsCost(packs.packs, l.catalog.cost))}</span>}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {!perms.generate && (
            <Field label="Note to the office">
              <Textarea value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Anything the buyer should know" />
            </Field>
          )}
        </div>

        <LimitPanel limit={limit} error={"error" in preview ? preview.error : undefined} seePrices={perms.seePrices} />
      </div>
    </Modal>
  );
}

function LimitPanel({ limit, error, seePrices }: { limit?: { orderValue: number; windowTotal: number; lifetimeTotal: number; estimatorPass: boolean; needs: string }; error?: string; seePrices: boolean }) {
  const pctWindow = limit ? Math.min(100, (limit.windowTotal / ESTIMATOR_ORDER_LIMIT) * 100) : 0;
  const pctLife = limit ? Math.min(100, (limit.lifetimeTotal / OWNER_LIFETIME_LIMIT) * 100) : 0;
  return (
    <div className="space-y-3 rounded-xl border border-line bg-slate-50/60 p-4">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-600">Limit check</div>
      {!limit ? (
        <p className="text-[12px] text-slate-500">{error ?? "Complete the order to run the check."}</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Badge tone={limit.needs === "none" ? "green" : "red"}>{limit.needs === "none" ? "Pass" : "Fail"}</Badge>
            <span className="text-[12px] text-slate-600">{limit.needs === "none" ? "No extra approval needed" : limit.needs === "owner" ? "Owner approval required" : "Office manager approval required"}</span>
          </div>
          <div>
            <div className="flex justify-between text-[11.5px] text-slate-600"><span>Estimator 7-day window</span><span>{seePrices ? `${money(limit.windowTotal)} / $1,500` : `${Math.round(pctWindow)}% of limit`}</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200"><div className={cn("h-full rounded-full", limit.estimatorPass ? "bg-emerald-500" : "bg-red-500")} style={{ width: `${pctWindow}%` }} /></div>
          </div>
          <div>
            <div className="flex justify-between text-[11.5px] text-slate-600"><span>Lifetime job purchasing</span><span>{seePrices ? `${money(limit.lifetimeTotal)} / $3,000` : `${Math.round(pctLife)}% of limit`}</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200"><div className={cn("h-full rounded-full", limit.needs === "owner" ? "bg-red-500" : "bg-brand")} style={{ width: `${pctLife}%` }} /></div>
          </div>
          {seePrices && <div className="text-[12px] text-slate-600">This order: <strong className="text-ink">{money(limit.orderValue)}</strong> pre-tax, pre-shipping</div>}
          <p className="text-[11px] text-slate-400">Same-job orders in the last seven calendar days combine. Confirmed cancellations and issued credits reduce both totals; unconfirmed requests don't.{!seePrices && " Prices are not shown for your role."}</p>
          {error && <Banner tone="danger">{error}</Banner>}
        </>
      )}
      <p className="text-[11px] text-slate-400">Checked {new Date(now()).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</p>
    </div>
  );
}
