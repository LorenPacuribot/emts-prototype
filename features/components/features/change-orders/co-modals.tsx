"use client";
/** Forms used by the change-order builder (feature 24). Each validates inline and toasts on success. */
import { useEffect, useMemo, useState } from "react";
import { Camera, Scissors, Send, ShieldCheck } from "lucide-react";
import type { ChangeOrder, ChangeOrderLine, ChangeOrderType, DownstreamKey, Job } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { can } from "@/features/lib/permissions";
import { byId, surfaceLabel } from "@/features/lib/selectors";
import { money } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { now } from "@/features/lib/clock";
import { CO_TYPE } from "@/features/lib/status";
import { emergencyEligible, EMERGENCY_LIMIT, lineSell, writtenConfirmationStatus } from "@/features/lib/rules/change-orders";
import {
  allowedRecipients, classifyColourCheck, coPricing, createChangeOrder, createColourReapproval, currentLink, DOWNSTREAM_KEYS, DOWNSTREAM_LABEL,
  jobChangeOrders, raiseEmergency, recordApproval, recordRejection, reissueLink, saveLine, sendChangeOrder, specTintedOrOrdered, splitChangeOrder,
  verifyRecipient, type ColourCheckInput, type LineDraft,
} from "@/features/lib/store/actions/change-orders";
import { Banner, Button, Checkbox, Field, Input, Modal, PillTabs, Select, Textarea } from "@/features/components/ui";
import { TYPE_HELP } from "./shared";

type Err = { field?: string; message: string } | null;

function ErrorBanner({ error }: { error: Err }) {
  if (!error) return null;
  return <Banner tone="danger" className="mb-4">{error.message}</Banner>;
}
const fe = (error: Err, f: string) => (error?.field === f ? error.message : undefined);

/* ------------------------------ New CO ------------------------------ */

const TYPES = Object.keys(CO_TYPE) as ChangeOrderType[];

export function NewCoModal({ open, onOpenChange, job, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; job: Job; onCreated: (id: string) => void }) {
  const db = useDb((d) => d);
  const [type, setType] = useState<ChangeOrderType>("addition");
  const [title, setTitle] = useState("");
  const [parentId, setParentId] = useState("");
  const [cc, setCc] = useState<ColourCheckInput>({ specId: "", toColourName: "", toColourNumber: "", sheenChanges: false, brandOrLineChanges: false, priceChanges: false, tintedOrOrdered: false });
  const [error, setError] = useState<Err>(null);
  const specs = db.specs.filter((s) => s.jobId === job.id && s.state !== "superseded");
  const parents = jobChangeOrders(db, job.id).filter((c) => c.status !== "rejected");

  useEffect(() => {
    if (open) {
      setType("addition");
      setTitle("");
      setParentId("");
      setError(null);
      setCc({ specId: "", toColourName: "", toColourNumber: "", sheenChanges: false, brandOrLineChanges: false, priceChanges: false, tintedOrOrdered: false });
    }
  }, [open]);

  const decision = type === "no_cost_colour_change" && cc.specId ? classifyColourCheck(db, job.id, cc) : null;

  function pickSpec(specId: string) {
    setCc({ ...cc, specId, tintedOrOrdered: specId ? specTintedOrOrdered(db, specId) : false });
  }

  function create() {
    const res = act(createChangeOrder, job.id, { type, title, parentId: parentId || undefined, colourCheck: type === "no_cost_colour_change" ? cc : undefined });
    if (!res.ok) return setError({ field: res.field, message: res.error });
    toast.success(`${res.value} created`, "Add or remove scope lines to build it.");
    onOpenChange(false);
    onCreated(res.value as string);
  }

  function recordCra() {
    const res = act(createColourReapproval, job.id, cc);
    if (!res.ok) return setError({ field: res.field, message: res.error });
    toast.success(`${res.value} recorded`, "Colour Re-approval recorded. No change order was raised.");
    onOpenChange(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="New change order"
      description={`${job.id} · signed contract. The change order records only the difference against the last approved scope.`}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          {type === "no_cost_colour_change" && (
            <Button onClick={recordCra} disabled={!cc.specId}>
              <ShieldCheck className="h-4 w-4" /> Record as Colour Re-approval
            </Button>
          )}
          <Button variant="primary" onClick={create}>
            Create change order
          </Button>
        </>
      }
    >
      <ErrorBanner error={error} />
      <div className="space-y-4">
        <Field label="Change type" required error={fe(error, "type")}>
          <div className="grid gap-2 sm:grid-cols-2">
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${type === t ? "border-brand bg-brand-soft/60" : "border-line hover:bg-slate-50"}`}
                aria-pressed={type === t}
              >
                <div className="text-[13px] font-semibold text-ink">{CO_TYPE[t].label}</div>
                <div className="text-[11.5px] text-slate-500">{TYPE_HELP[t]}</div>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Title" required htmlFor="nco-title" error={fe(error, "title")} hint="Short and recognisable, e.g. “Add detached garage”.">
          <Input id="nco-title" value={title} invalid={!!fe(error, "title")} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Parent change order (optional)" htmlFor="nco-parent" error={fe(error, "parentId")} hint="Use when this change depends on another one. It can be drafted now, but not sent until the parent is resolved.">
          <Select id="nco-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">None</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id} · {p.title} ({p.status.replace(/_/g, " ")})
              </option>
            ))}
          </Select>
        </Field>

        {type === "no_cost_colour_change" && (
          <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
            <div className="text-[12px] font-semibold text-indigo-900">Rule 1 check — does this need a change order or a Colour Re-approval?</div>
            <Field label="Specification" required htmlFor="nco-spec" error={fe(error, "specId")}>
              <Select id="nco-spec" value={cc.specId} invalid={!!fe(error, "specId")} onChange={(e) => pickSpec(e.target.value)}>
                <option value="">Choose…</option>
                {specs.map((s) => {
                  const c = byId(db.colours, s.colourId);
                  return (
                    <option key={s.id} value={s.id}>
                      {s.id} · {c?.name} {c?.number} · {s.sheen ?? "—"} · {s.productLine ?? "no line"}
                    </option>
                  );
                })}
              </Select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="New colour name" required htmlFor="nco-cn" error={fe(error, "toColour")}>
                <Input id="nco-cn" value={cc.toColourName} onChange={(e) => setCc({ ...cc, toColourName: e.target.value })} placeholder="e.g. Agreeable Gray" />
              </Field>
              <Field label="New colour number" required htmlFor="nco-cnum">
                <Input id="nco-cnum" value={cc.toColourNumber} onChange={(e) => setCc({ ...cc, toColourNumber: e.target.value })} placeholder="e.g. SW 7029" />
              </Field>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Checkbox checked={cc.sheenChanges} onCheckedChange={(v) => setCc({ ...cc, sheenChanges: v })} label="Sheen changes too" />
              <Checkbox checked={cc.brandOrLineChanges} onCheckedChange={(v) => setCc({ ...cc, brandOrLineChanges: v })} label="Brand or product line changes" />
              <Checkbox checked={cc.priceChanges} onCheckedChange={(v) => setCc({ ...cc, priceChanges: v })} label="The price changes" />
              <Checkbox checked={cc.tintedOrOrdered} onCheckedChange={(v) => setCc({ ...cc, tintedOrOrdered: v })} label="Affected paint already tinted or ordered" />
            </div>
            {cc.specId && specTintedOrOrdered(db, cc.specId) && <p className="text-[11.5px] text-slate-500">A supplier order already includes this specification, so its paint counts as ordered.</p>}
            {decision && decision.kind === "colour_reapproval" && (
              <Banner tone="success" title="Qualifies for a Colour Re-approval">
                {decision.reason} Record it as a Colour Re-approval — never both a re-approval and a change order.
              </Banner>
            )}
            {decision && decision.kind === "change_order" && <Banner tone="warn" title="A priced change order is required">{decision.reason}</Banner>}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------ Lines ------------------------------- */

export function LineModal({ co, line, open, onClose }: { co: ChangeOrder; line?: ChangeOrderLine; open: boolean; onClose: () => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const job = byId(db.jobs, co.jobId)!;
  const surfaces = db.surfaces.filter((s) => s.propertyId === job.propertyId && !s.removedAt);
  const blank = (): LineDraft => ({ kind: ["addition", "product_substitution", "no_cost_colour_change"].includes(co.type) ? "add" : "remove", description: "", cost: 0, treatment: "billable" });
  const [d, setD] = useState<LineDraft>(blank());
  const [costText, setCostText] = useState("");
  const [sqftText, setSqftText] = useState("");
  // Optional labour / material breakdown (patent 24). When on, cost = hours × rate + material.
  const [breakdown, setBreakdown] = useState(false);
  const [hoursText, setHoursText] = useState("");
  const [rateText, setRateText] = useState("");
  const [materialText, setMaterialText] = useState("");
  const [error, setError] = useState<Err>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const str = (v?: number) => (v === undefined ? "" : String(v));
    if (line) {
      setD({ ...line, treatment: line.treatment ?? "billable" });
      setCostText(String(line.cost));
      setSqftText(str(line.sqft));
      setBreakdown(line.laborHours !== undefined || line.materialCost !== undefined);
      setHoursText(str(line.laborHours));
      setRateText(str(line.laborRate));
      setMaterialText(str(line.materialCost));
    } else {
      setD(blank());
      setCostText("");
      setSqftText("");
      setBreakdown(false);
      setHoursText("");
      setRateText("");
      setMaterialText("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, line]);

  const optNum = (t: string) => (t === "" ? undefined : Number(t));
  const laborCost = (Number(hoursText) || 0) * (Number(rateText) || 0);
  const materialCost = Number(materialText) || 0;
  const cost = breakdown ? laborCost + materialCost : costText === "" ? NaN : Number(costText);
  const canCost = can(user, "co.seeCost");

  function pickSurface(id: string) {
    const s = byId(db.surfaces, id);
    setD({ ...d, surfaceId: id || undefined, description: d.description || (s ? surfaceLabel(db, id) : "") });
    if (s && !sqftText) setSqftText(String(s.areaSqft));
  }

  function save() {
    if (breakdown && hoursText === "" && materialText === "") return setError({ field: "laborHours", message: "Enter labour hours, material cost, or both." });
    if (!breakdown && costText === "") return setError({ field: "cost", message: "Enter the cost before markup (0 is allowed)." });
    const parts = breakdown
      ? { laborHours: optNum(hoursText) ?? 0, laborRate: optNum(rateText), materialCost: optNum(materialText) ?? 0 }
      : { laborHours: undefined, laborRate: undefined, materialCost: undefined };
    const res = act(saveLine, co.id, { ...d, ...parts, cost, sqft: sqftText === "" ? undefined : Number(sqftText) }, line?.id);
    if (!res.ok) return setError({ field: res.field, message: res.error });
    toast.success(line ? "Line updated" : "Line added", co.id);
    onClose();
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={line ? `Edit line ${line.id}` : "Add scope line"}
      description="Record only the difference against the signed scope."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>{line ? "Save line" : "Add line"}</Button>
        </>
      }
    >
      <ErrorBanner error={error} />
      <div className="space-y-4">
        <PillTabs
          value={d.kind}
          onChange={(k) => setD({ ...d, kind: k, treatment: k === "remove" && d.treatment === "stranded_paint" ? "billable" : d.treatment })}
          options={[
            { value: "add", label: "Add scope" },
            { value: "remove", label: "Remove scope" },
          ]}
        />
        <Field label="Surface (optional)" htmlFor="ln-surface" hint="Picks up the measured area from the property record.">
          <Select id="ln-surface" value={d.surfaceId ?? ""} onChange={(e) => pickSurface(e.target.value)}>
            <option value="">Not linked to a surface</option>
            {surfaces.map((s) => (
              <option key={s.id} value={s.id}>
                {surfaceLabel(db, s.id)} · {s.areaSqft} sq ft
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description" required htmlFor="ln-desc" error={fe(error, "description")}>
          <Input id="ln-desc" value={d.description} invalid={!!fe(error, "description")} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="e.g. Detached garage — siding, 2 coats" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Measurement (sq ft)" htmlFor="ln-sqft" error={fe(error, "sqft")}>
            <Input id="ln-sqft" type="number" min={0} value={sqftText} invalid={!!fe(error, "sqft")} onChange={(e) => setSqftText(e.target.value)} />
          </Field>
          <Field label="Product" htmlFor="ln-prod">
            <Input id="ln-prod" value={d.product ?? ""} onChange={(e) => setD({ ...d, product: e.target.value })} />
          </Field>
          <Field label="Colour" htmlFor="ln-col">
            <Input id="ln-col" value={d.colour ?? ""} onChange={(e) => setD({ ...d, colour: e.target.value })} />
          </Field>
        </div>
        {canCost && (
          <div className="space-y-3 rounded-xl border border-gray-200 p-3">
            <Checkbox checked={breakdown} onCheckedChange={setBreakdown} label="Break the cost down into labour and material" />
            {breakdown && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Labour hours" htmlFor="ln-hours" error={fe(error, "laborHours")}>
                  <Input id="ln-hours" type="number" min={0} step={0.25} value={hoursText} invalid={!!fe(error, "laborHours")} onChange={(e) => setHoursText(e.target.value)} />
                </Field>
                <Field label="Labour rate ($/h)" htmlFor="ln-rate" error={fe(error, "laborRate")} hint={laborCost ? `Labour ${money(laborCost)}` : undefined}>
                  <Input id="ln-rate" type="number" min={0} step="0.01" value={rateText} invalid={!!fe(error, "laborRate")} onChange={(e) => setRateText(e.target.value)} />
                </Field>
                <Field label="Material cost" htmlFor="ln-mat" error={fe(error, "materialCost")} hint="Paint and sundries">
                  <Input id="ln-mat" type="number" min={0} step="0.01" value={materialText} invalid={!!fe(error, "materialCost")} onChange={(e) => setMaterialText(e.target.value)} />
                </Field>
              </div>
            )}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {canCost ? (
            <Field label="Cost before markup" required htmlFor="ln-cost" error={fe(error, "cost")} hint={!Number.isNaN(cost) ? `Customer price at the original ${co.markupPct}% markup: ${money(lineSell(cost, co.markupPct))}` : "Internal cost; the customer never sees it."}>
              {breakdown ? (
                <Input id="ln-cost" value={money(cost)} readOnly className="bg-gray-50 font-semibold" />
              ) : (
                <Input id="ln-cost" type="number" min={0} step="0.01" value={costText} invalid={!!fe(error, "cost")} onChange={(e) => setCostText(e.target.value)} />
              )}
            </Field>
          ) : (
            <Banner tone="info">Pricing is entered by an estimator.</Banner>
          )}
          <Field label="Cost treatment" htmlFor="ln-treat" error={fe(error, "treatment")}>
            <Select id="ln-treat" value={d.treatment ?? "billable"} onChange={(e) => setD({ ...d, treatment: e.target.value as LineDraft["treatment"] })}>
              <option value="billable">Billable</option>
              <option value="stranded_paint">Nonreturnable tinted paint (billed on this CO)</option>
              <option value="absorbed_labour">Labour cancelled inside 24 h (contractor absorbs)</option>
            </Select>
          </Field>
        </div>
        {d.treatment === "stranded_paint" && <Banner tone="info">Stranded paint is billed here once. It is kept as job cost and follows the leftover-stock process without being billed again.</Banner>}
        {d.treatment === "absorbed_labour" && <Banner tone="info">Labour cancelled inside 24 hours is absorbed by the contractor. It is kept as job cost and not charged to the customer.</Banner>}
      </div>
    </Modal>
  );
}

/* ------------------------------ Split ------------------------------- */

export function SplitModal({ co, onClose, onSplit }: { co?: ChangeOrder; onClose: () => void; onSplit: (id: string) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<Err>(null);
  useEffect(() => {
    setPicked([]);
    setTitle(co ? `${co.title} (part 2)` : "");
    setError(null);
  }, [co]);
  if (!co) return null;
  return (
    <Modal
      open={!!co}
      onOpenChange={(v) => !v && onClose()}
      title={`Split ${co.id}`}
      description="A customer accepts or rejects a whole change order. Move the lines they have not agreed to into a separate change order."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              const res = act(splitChangeOrder, co.id, picked, title);
              if (!res.ok) return setError({ field: res.field, message: res.error });
              toast.success("Change order split", `${picked.length} line(s) moved to ${res.value}. Both are drafts.`);
              onClose();
              onSplit(res.value as string);
            }}
          >
            <Scissors className="h-4 w-4" /> Move to new change order
          </Button>
        </>
      }
    >
      <ErrorBanner error={error} />
      <div className="space-y-4">
        <Field label="Lines to move" required error={fe(error, "lines")}>
          <div className="space-y-2">
            {co.lines.map((l) => (
              <div key={l.id} className="rounded-lg border border-line px-3 py-2">
                <Checkbox checked={picked.includes(l.id)} onCheckedChange={(v) => setPicked(v ? [...picked, l.id] : picked.filter((x) => x !== l.id))} label={<span>{l.kind === "add" ? "+" : "−"} {l.description}</span>} />
              </div>
            ))}
          </div>
        </Field>
        <Field label="New change order title" required htmlFor="sp-title" error={fe(error, "title")}>
          <Input id="sp-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        {co.status !== "draft" && <Banner tone="warn">{co.id} returns to draft as a new version. Its current approval link is superseded.</Banner>}
      </div>
    </Modal>
  );
}

/* ------------------------- Recipient + send ------------------------- */

export function VerifyRecipientModal({ co, onClose }: { co?: ChangeOrder; onClose: () => void }) {
  const db = useDb((d) => d);
  const job = co && byId(db.jobs, co.jobId);
  const customer = job && byId(db.customers, job.customerId);
  const options = allowedRecipients(customer);
  const [choice, setChoice] = useState("0");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<Err>(null);
  useEffect(() => {
    if (!co) return;
    setChoice("0");
    setName(options[0]?.name ?? "");
    setAddress(co.recipient ?? options[0]?.address ?? "");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [co]);
  if (!co || !customer) return null;
  function pick(v: string) {
    setChoice(v);
    if (v === "other") {
      setName("");
      setAddress("");
    } else {
      setName(options[Number(v)].name);
      setAddress(options[Number(v)].address);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title="Verify recipient"
      description={`Checked against ${customer.name}'s customer record before anything is sent.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              const res = act(verifyRecipient, co.id, { name, address });
              if (!res.ok) return setError({ field: res.field, message: res.error });
              toast.success("Recipient verified", `${name} is authorised on the account.`);
              onClose();
            }}
          >
            <ShieldCheck className="h-4 w-4" /> Verify
          </Button>
        </>
      }
    >
      <ErrorBanner error={error} />
      <div className="space-y-4">
        <Field label="Who will approve" required htmlFor="vr-who">
          <Select id="vr-who" value={choice} onChange={(e) => pick(e.target.value)}>
            {options.map((o, i) => (
              <option key={i} value={String(i)}>
                {o.name} — {o.role}
              </option>
            ))}
            <option value="other">Someone not listed on the account…</option>
          </Select>
        </Field>
        {choice === "other" && (
          <Field label="Name" required htmlFor="vr-name" error={fe(error, "name")} hint="e.g. a property manager acting for the owner.">
            <Input id="vr-name" value={name} invalid={!!fe(error, "name")} onChange={(e) => setName(e.target.value)} />
          </Field>
        )}
        <Field label="Email or portal login" required htmlFor="vr-addr" error={fe(error, "address")}>
          <Input id="vr-addr" value={address} invalid={!!fe(error, "address")} onChange={(e) => setAddress(e.target.value)} placeholder="name@example.com" />
        </Field>
        <p className="text-[11.5px] text-slate-500">
          Authorised on this account: {options.map((o) => `${o.name} (${o.role})`).join(", ")}. A property manager must already be listed on the account before their approval is accepted.
        </p>
      </div>
    </Modal>
  );
}

export function SendModal({ co, reissue, onClose }: { co?: ChangeOrder; reissue?: boolean; onClose: () => void }) {
  const [channel, setChannel] = useState<"portal" | "email">("portal");
  useEffect(() => setChannel(co?.channel ?? "portal"), [co]);
  if (!co) return null;
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={reissue ? `Reissue approval link · ${co.id}` : `Send ${co.id} v${co.version ?? 1}`}
      description={`To ${co.recipientName ?? ""} <${co.recipient ?? ""}>. A person presses send; there is no automatic resend (Rule 4).`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              const res = reissue ? act(reissueLink, co.id, channel) : act(sendChangeOrder, co.id, channel);
              if (res.ok) {
                toast.success(reissue ? "New link sent" : "Change order sent", `Link ${res.value} expires in 30 days.`);
                onClose();
              }
            }}
          >
            <Send className="h-4 w-4" /> {reissue ? "Send new link" : "Send"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Channel">
          <PillTabs
            value={channel}
            onChange={setChannel}
            options={[
              { value: "portal", label: "Customer portal (preferred)" },
              { value: "email", label: "Email" },
            ]}
          />
        </Field>
        <p className="text-[12px] text-slate-500">Verbal approval is not offered. It is accepted only for emergency work strictly below $500.00.</p>
        {reissue && <Banner tone="warn">The current link is superseded and blocked. The customer will see a message pointing them to the new link.</Banner>}
        <p className="text-[11.5px] text-slate-400">The prototype records the send; no real message leaves the browser.</p>
      </div>
    </Modal>
  );
}

/* ---------------------------- Decision ------------------------------ */

type DecisionKind = "approved" | "rejected" | "partial";

export function DecisionModal({ co, onClose, onSplit }: { co?: ChangeOrder; onClose: () => void; onSplit: () => void }) {
  const db = useDb((d) => d);
  const job = co && byId(db.jobs, co.jobId);
  const customer = job && byId(db.customers, job.customerId);
  const options = allowedRecipients(customer);
  const [kind, setKind] = useState<DecisionKind>("approved");
  const [signer, setSigner] = useState("");
  const [channel, setChannel] = useState<"portal" | "email">("portal");
  const [evidence, setEvidence] = useState("");
  const [reason, setReason] = useState("");
  const [failAction, setFailAction] = useState<"" | DownstreamKey>("");
  const [error, setError] = useState<Err>(null);
  useEffect(() => {
    if (!co) return;
    setKind("approved");
    setSigner(co.recipientName ?? options[0]?.name ?? "");
    setChannel(currentLink(co)?.channel ?? "portal");
    setEvidence("");
    setReason("");
    setFailAction("");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [co]);
  if (!co) return null;

  function submit() {
    const res =
      kind === "approved"
        ? act(recordApproval, co!.id, { signer, channel, evidenceRef: evidence, failAction: failAction || undefined })
        : act(recordRejection, co!.id, { signer, reason });
    if (!res.ok) return setError({ field: res.field, message: res.error });
    toast.success(kind === "approved" ? "Approval recorded" : "Rejection recorded", kind === "approved" ? "Downstream updates attempted." : "Dependent drafts were repriced.");
    onClose();
  }

  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      size="lg"
      title={`Record customer decision · ${co.id} v${co.version ?? 1}`}
      description="The decision covers the whole change order."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {kind === "partial" ? (
            <Button variant="primary" onClick={() => { onClose(); onSplit(); }}>
              <Scissors className="h-4 w-4" /> Split change order
            </Button>
          ) : (
            <Button variant={kind === "approved" ? "success" : "dark"} onClick={submit}>
              {kind === "approved" ? "Record approval" : "Record rejection"}
            </Button>
          )}
        </>
      }
    >
      <ErrorBanner error={error} />
      <div className="space-y-4">
        <PillTabs
          value={kind}
          onChange={(k) => { setKind(k); setError(null); }}
          options={[
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
            { value: "partial", label: "Agreed to only part" },
          ]}
        />
        {kind === "partial" ? (
          <Banner tone="warn" title="Partial acceptance is not allowed">
            A customer approves or rejects the whole change order. Split the agreed lines and the rest into separate change orders, then send each one for its own decision.
          </Banner>
        ) : (
          <>
            <Field label={kind === "approved" ? "Signed by" : "Declined by"} required htmlFor="dc-signer" error={fe(error, "signer")} hint={`Authorised on the account: ${options.map((o) => o.name).join(", ")}`}>
              <Input id="dc-signer" list="dc-signers" value={signer} invalid={!!fe(error, "signer")} onChange={(e) => setSigner(e.target.value)} />
              <datalist id="dc-signers">
                {options.map((o) => (
                  <option key={o.name} value={o.name} />
                ))}
              </datalist>
            </Field>
            {kind === "approved" ? (
              <>
                <Field label="Channel" error={fe(error, "channel")}>
                  <PillTabs
                    value={channel}
                    onChange={setChannel}
                    options={[
                      { value: "portal", label: "Portal signature" },
                      { value: "email", label: "Written email reply" },
                    ]}
                  />
                </Field>
                <Field label="Evidence reference" required htmlFor="dc-ev" error={fe(error, "evidenceRef")} hint="Portal signature ID, or the email reply's date, time and sender.">
                  <Input id="dc-ev" value={evidence} invalid={!!fe(error, "evidenceRef")} onChange={(e) => setEvidence(e.target.value)} placeholder={channel === "portal" ? "Portal signature PS-…" : "Email reply 9/24 10:14 from …"} />
                </Field>
                <Field label="Demo: simulate a downstream failure" htmlFor="dc-fail" hint="Shows the exception list and retry path.">
                  <Select id="dc-fail" value={failAction} onChange={(e) => setFailAction(e.target.value as DownstreamKey | "")}>
                    <option value="">None — all four succeed</option>
                    {DOWNSTREAM_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {DOWNSTREAM_LABEL[k]} fails
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            ) : (
              <>
                <Field label="Customer's reason" required htmlFor="dc-reason" error={fe(error, "reason")}>
                  <Textarea id="dc-reason" value={reason} invalid={!!fe(error, "reason")} onChange={(e) => setReason(e.target.value)} />
                </Field>
                <p className="text-[11.5px] text-slate-500">Rejected means refused before the work began. Payment refused for work already done is a dispute — record it from the approved change order.</p>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/* ---------------------------- Emergency ----------------------------- */

function localInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EmergencyModal({ co, onClose }: { co?: ChangeOrder; onClose: () => void }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const owner = db.users.find((u) => u.role === "owner");
  const office = db.users.find((u) => u.role === "office_manager");
  const [findings, setFindings] = useState("");
  const [photos, setPhotos] = useState(0);
  const [authoriserId, setAuthoriserId] = useState(owner?.id ?? "");
  const [unreachable, setUnreachable] = useState(false);
  const [verbalAt, setVerbalAt] = useState(localInput(now()));
  const [msg, setMsg] = useState("");
  const [error, setError] = useState<Err>(null);
  useEffect(() => {
    if (!co) return;
    setFindings("");
    setPhotos(0);
    setAuthoriserId(owner?.id ?? "");
    setUnreachable(false);
    setVerbalAt(localInput(now()));
    setMsg("");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [co]);
  const pricing = useMemo(() => (co ? coPricing(db, co) : undefined), [db, co]);
  if (!co || !pricing) return null;
  const eligible = emergencyEligible(pricing.total);
  const due = writtenConfirmationStatus(new Date(verbalAt).toISOString(), undefined, now()).dueDay;
  const showMoney = can(user, "co.seePrices");
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      size="lg"
      title={`Raise emergency work · ${co.id}`}
      description="Urgent work may start on verbal approval only when it is strictly below $500.00. Evidence is captured the same day."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              const res = act(raiseEmergency, co.id, { findings, photos, authoriserId, ownerUnreachable: unreachable, verbalAt: new Date(verbalAt).toISOString(), customerMessageRef: msg });
              if (!res.ok) return setError({ field: res.field, message: res.error });
              toast.success("Emergency work authorised", "Written confirmation countdown started.");
              onClose();
            }}
          >
            Record authorisation
          </Button>
        </>
      }
    >
      <ErrorBanner error={error} />
      {eligible ? (
        <Banner tone="info" className="mb-4" title={showMoney ? `This change totals ${money(pricing.total)} — below the $${EMERGENCY_LIMIT}.00 limit` : "This change is below the $500.00 emergency limit"}>
          Written confirmation will be due by the end of {new Date(`${due}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} (two working days).
        </Banner>
      ) : (
        <Banner tone="danger" className="mb-4" title="Verbal approval does not qualify">
          The emergency path is only for work strictly below $500.00{showMoney ? `; this change totals ${money(pricing.total)}` : ""}. Exactly $500.00 does not qualify. Get written approval first.
        </Banner>
      )}
      <div className="space-y-4">
        <Field label="Findings" required htmlFor="em-find" error={fe(error, "findings")}>
          <Textarea id="em-find" value={findings} invalid={!!fe(error, "findings")} onChange={(e) => setFindings(e.target.value)} placeholder="What was found and why it can't wait" />
        </Field>
        <Field label="Photographs" required error={fe(error, "photographs")}>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={() => setPhotos(photos + 1)}>
              <Camera className="h-3.5 w-3.5" /> Attach photo
            </Button>
            <span className="text-[12.5px] text-slate-600">{photos} attached</span>
            {photos > 0 && <Button size="sm" variant="ghost" onClick={() => setPhotos(0)}>Clear</Button>}
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Authorised by" required htmlFor="em-auth" error={fe(error, "authoriser")}>
            <Select id="em-auth" value={authoriserId} onChange={(e) => setAuthoriserId(e.target.value)}>
              {owner && <option value={owner.id}>{owner.name} — Business Owner</option>}
              {office && <option value={office.id}>{office.name} — Office Manager</option>}
            </Select>
          </Field>
          <Field label="Verbal authorisation time" required htmlFor="em-time" error={fe(error, "same-day capture (the verbal authorisation must be today)")}>
            <Input id="em-time" type="datetime-local" value={verbalAt} onChange={(e) => setVerbalAt(e.target.value)} />
          </Field>
        </div>
        {authoriserId === office?.id && <Checkbox checked={unreachable} onCheckedChange={setUnreachable} label="The business owner was unreachable" />}
        <Field label="Customer text or email" required htmlFor="em-msg" error={fe(error, "customer text or email")} hint="Paste or reference the customer's message agreeing to the work.">
          <Input id="em-msg" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder='Text from customer 8:12 a.m.: "Yes, go ahead"' />
        </Field>
      </div>
    </Modal>
  );
}

/* ----------------------------- Generic ------------------------------ */

export function NoteModal({ open, title, description, label, confirmLabel, placeholder, extra, onClose, onSubmit }: {
  open: boolean;
  title: string;
  description?: string;
  label: string;
  confirmLabel: string;
  placeholder?: string;
  extra?: React.ReactNode;
  onClose: () => void;
  onSubmit: (note: string) => { ok: boolean; error?: string; field?: string };
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (open) {
      setNote("");
      setError(undefined);
    }
  }, [open]);
  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              const res = onSubmit(note);
              if (!res.ok) return setError(res.error);
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {extra}
      <Field label={label} required htmlFor="note-f" error={error}>
        <Textarea id="note-f" value={note} invalid={!!error} placeholder={placeholder} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}
