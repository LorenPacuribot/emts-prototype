"use client";
/**
 * Public estimate — live route /estimates/view/[token]
 * (features/(main)/estimates/client-preview/templates/index.tsx).
 * No login, no app shell (listed in PUBLIC_ROUTES in proxy.ts).
 *
 * Existing: header, status banners, the estimate document (Client / Job
 * Site / Dates, scope without prices, Paint Colors, total, acceptance),
 * floating actions (Print PDF, Decline, Accept Estimate) and the Accept
 * modal (Full Name + E-Signature).
 * NEW (feature 3): colour approval state beside each paint colour.
 * NEW (feature 24): "Change orders for your approval": the customer approves
 * or declines a sent change order here, with their signature as evidence.
 */
import { Suspense, useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, FileDiff, Printer, SearchX, ThumbsDown } from "lucide-react";
import type { ChangeOrder, Estimate } from "@/features/types";
import { act, useDb } from "@/features/lib/store";
import { acceptEstimateByToken, declineEstimateByToken, openPublicEstimate } from "@/features/lib/store/actions/estimates";
import { coPricing, currentLink, customerDecideChangeOrder, jobChangeOrders } from "@/features/lib/store/actions/change-orders";
import { customerCanAccept, DEFAULT_DEPOSIT_PERCENT } from "@/features/lib/rules/estimate-lifecycle";
import { specForSurface } from "@/features/lib/rules/estimate";
import { useParam } from "@/features/lib/navigation";
import { useHydrated } from "@/features/lib/hooks";
import { printElement } from "@/features/lib/export";
import { byId } from "@/features/lib/selectors";
import { BUSINESS } from "@/features/lib/rules/property";
import { dateLong, money } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { Logo } from "@/features/components/layout/icon-rail";
import { Banner, Button, ConfirmDialog, Field, Input, Modal, NewBadge, Skeleton, Swatch, Textarea, Toaster, TooltipProvider } from "@/features/components/ui";
import { CoDocument } from "@/features/components/features/change-orders/co-document";
import { SignatureCanvas } from "./signature-canvas";
import { estimateTotals as builderTotals } from '@/lib/calculations';

export function PublicEstimateScreen() {
  const hydrated = useHydrated();
  return (
    <TooltipProvider>
    <div className="min-h-screen bg-gray-100">
      {hydrated ? (
        <Suspense fallback={<Skeleton className="mx-auto mt-10 h-96 max-w-3xl" />}>
          <PublicEstimate />
        </Suspense>
      ) : (
        <Skeleton className="mx-auto mt-10 h-96 max-w-3xl" />
      )}
      <Toaster />
    </div>
    </TooltipProvider>
  );
}

function PublicEstimate() {
  const token = useParam("token");
  const db = useDb((d) => d);
  const estimate = db.estimates.find((e) => e.publicToken === token);
  const opened = useRef(false);
  const docRef = useRef<HTMLDivElement>(null);
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);

  useEffect(() => {
    if (token && !opened.current) {
      opened.current = true;
      act(openPublicEstimate, token);
    }
  }, [token]);

  if (!estimate) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <SearchX className="mx-auto h-10 w-10 text-gray-300" />
        <h1 className="mt-4 font-heading text-xl font-bold text-gray-900">This estimate link isn&apos;t valid</h1>
        <p className="mt-2 text-sm text-gray-500">If you received a newer link, please use that one, or call us at {BUSINESS.phone}.</p>
      </div>
    );
  }

  const customer = byId(db.customers, estimate.customerId);
  const property = byId(db.properties, estimate.propertyId);
  const job = estimate.jobId ? byId(db.jobs, estimate.jobId) : undefined;
  const canAccept = customerCanAccept(estimate.status);
  const pendingCos = job ? jobChangeOrders(db, job.id).filter((c) => c.status === "sent" && currentLink(c)) : [];

  return (
    <>
      <header className="no-print sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 font-heading font-extrabold text-gray-900"><Logo className="h-8 w-8" /> {BUSINESS.name}</div>
          <div className="text-xs text-gray-500">{BUSINESS.phone}</div>
        </div>
      </header>

      <section className="bg-gradient-to-br from-primary-700 to-primary-900 px-4 py-12 text-white">
        <div className="mx-auto max-w-5xl">
          <div className="text-sm font-semibold text-primary-100">Hi {customer?.name.split(" ")[0]},</div>
          <h1 className="mt-1 font-heading text-3xl font-extrabold md:text-4xl">{estimate.title}</h1>
          <p className="mt-2 text-primary-100">{property?.address}, {property?.city}</p>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-4 py-8 pb-32">
        {estimate.status === "EXPIRED" && <Banner tone="warn" className="mb-6" title="This estimate has expired">Please contact us for an updated estimate.</Banner>}
        {estimate.status === "DECLINED" && <Banner tone="info" className="mb-6" title="This estimate has been declined">Thank you for letting us know. We hope to work with you in the future.</Banner>}
        {estimate.status === "ACCEPTED" && <Banner tone="success" className="mb-6" title="This estimate has been accepted">Thank you for your business!</Banner>}
        {estimate.status === "PENDING_REAPPROVAL" && <Banner tone="warn" className="mb-6" title="This estimate has been updated">Your contractor revised the scope — please review the new totals and re-sign to approve.</Banner>}

        {pendingCos.length > 0 && <ChangeOrdersForApproval cos={pendingCos} defaultSigner={customer?.name ?? ""} />}

        <div ref={docRef} id="estimate" className="mx-auto min-h-[11in] max-w-[8.5in] bg-white p-6 shadow-2xl md:p-12">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-6">
            <div className="flex items-center gap-3">
              <Logo className="h-12 w-12" />
              <div>
                <div className="font-heading text-lg font-bold">{BUSINESS.name}</div>
                <div className="text-xs text-gray-500">410 Commerce Park, Dallas, TX 75201</div>
              </div>
            </div>
            <div className="text-right text-sm">
              <div className="text-xxs font-bold uppercase tracking-widest text-gray-400">Estimator</div>
              <div className="font-semibold">{byId(db.users, estimate.estimatorId)?.name ?? "Not assigned"}</div>
              <div className="mt-1 font-mono text-xs text-gray-500">#{estimate.id}</div>
            </div>
          </div>

          <div className="grid gap-6 border-b border-gray-200 py-6 sm:grid-cols-3">
            <Info label="Client" lines={[customer?.name ?? "", customer?.email ?? "", customer?.phone ?? ""]} />
            <Info label="Job Site" lines={[property?.address ?? "", property ? `${property.city}, ${property.state} ${property.zip}` : ""]} />
            <Info label="Dates" lines={[`Estimate Date: ${dateLong(estimate.estimateDate ?? estimate.createdAt)}`, `Valid Until: ${dateLong(estimate.validUntil)}`]} />
          </div>

          {job && <Scope jobId={job.id} />}
          {!!estimate.pricingSnapshot?.lineItems.some((l) => l.optional && !l.selected) && <section className="my-4 rounded-xl border border-gray-200 p-4"><h3 className="font-bold">Optional work</h3><p className="text-xs text-gray-500">Not included in the current total. You can choose these items when accepting.</p>{estimate.pricingSnapshot.lineItems.filter((l) => l.optional && !l.selected).map((l) => <div key={l.id} className="flex justify-between py-1 text-sm"><span>{l.description}</span><span>{money(l.total, { cents: true })} before tax and discount</span></div>)}</section>}
          {job && <PaintColorsSection jobId={job.id} />}

          <div className="mt-8 flex justify-end">
            <div className="w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between border-t-2 border-gray-900 pt-2 text-lg font-extrabold"><span>Total</span><span>{money(estimate.total, { cents: true })}</span></div>
              <div className="text-xs text-gray-500">{DEFAULT_DEPOSIT_PERCENT}% deposit due at signing.</div>
            </div>
          </div>

          {estimate.signatureName && estimate.status === "ACCEPTED" && (
            <div className="mt-8 rounded-xl border border-gray-200 p-4">
              <div className="text-xxs font-bold uppercase tracking-widest text-gray-400">Acceptance</div>
              <div className="mt-2 font-heading text-xl italic text-gray-800">{estimate.signatureName}</div>
              <div className="mt-1 grid grid-cols-2 border-t border-gray-200 pt-1 text-xs text-gray-400"><span>Signature</span><span className="text-right">Date: {dateLong(estimate.acceptedAt)}</span></div>
            </div>
          )}
          <div className="mt-8 border-t border-gray-200 pt-4 text-xs text-gray-500">
            <div className="font-bold uppercase tracking-widest text-gray-400">Terms &amp; Conditions</div>
            <p className="mt-1">Work is guaranteed for two years against peeling and flaking. Color changes after signing may need a change order.</p>
          </div>
        </div>
      </main>

      <div className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-2">
          <Button onClick={() => printElement(docRef.current, `${estimate.id} estimate`)}><Printer className="h-4 w-4" /> Print PDF</Button>
          {canAccept && estimate.status !== "PENDING_REAPPROVAL" && (
            <Button onClick={() => setDeclining(true)}><ThumbsDown className="h-4 w-4" /> Decline</Button>
          )}
          {canAccept && (
            <Button variant="primary" className="h-11 px-6 font-black" onClick={() => setAccepting(true)} data-tour="accept-estimate">
              <CheckCircle2 className="h-4 w-4" /> Accept Estimate
            </Button>
          )}
        </div>
      </div>

      <AcceptModal open={accepting} onOpenChange={setAccepting} estimate={estimate} />
      <ConfirmDialog
        open={declining}
        onOpenChange={setDeclining}
        title="Decline Estimate"
        body="Are you sure you want to decline this estimate? This action cannot be undone."
        confirmLabel="Yes, Decline"
        onConfirm={() => act(declineEstimateByToken, token!).ok && toast.success("Estimate declined")}
      />
    </>
  );
}

function Info({ label, lines }: { label: string; lines: string[] }) {
  return (
    <div>
      <div className="text-xxs font-bold uppercase tracking-widest text-gray-400">{label}</div>
      {lines.filter(Boolean).map((l, i) => <div key={i} className={i === 0 ? "font-semibold text-gray-900" : "text-sm text-gray-500"}>{l}</div>)}
    </div>
  );
}

function Scope({ jobId }: { jobId: string }) {
  const db = useDb((d) => d);
  const job = byId(db.jobs, jobId)!;
  const surfaces = job.surfaceIds.map((id) => byId(db.surfaces, id)).filter((s) => !!s && !s.removedAt) as NonNullable<ReturnType<typeof byId<(typeof db.surfaces)[number]>>>[];
  const areas = Array.from(new Set(surfaces.map((s) => s.areaId))).map((id) => byId(db.areas, id)!);
  return (
    <div className="py-6">
      <div className="mb-3 font-heading text-lg font-bold text-gray-900">Scope of Work</div>
      {areas.map((a) => (
        <div key={a.id} className="mb-4">
          <div className="text-sm font-bold text-gray-800">{a.name}</div>
          <table className="mt-1 w-full text-sm">
            <tbody>
              {surfaces.filter((s) => s.areaId === a.id).map((s) => {
                const spec = specForSurface(db, job.id, s.id);
                const colour = spec && byId(db.colours, spec.colourId);
                return (
                  <tr key={s.id} className="border-b border-gray-100">
                    <td className="py-1.5 text-gray-700">{s.name}</td>
                    <td className="py-1.5 text-right text-gray-500">{spec?.coats ?? 2} coats</td>
                    <td className="py-1.5 pl-4 text-right text-gray-500">{colour ? `${colour.name} ${colour.number}` : "Color to be confirmed"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function PaintColorsSection({ jobId }: { jobId: string }) {
  const db = useDb((d) => d);
  const colours = db.colours.filter((c) => c.jobId === jobId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!colours.length) return null;
  return (
    <div className="border-t border-gray-200 py-6">
      <div className="mb-3 font-heading text-lg font-bold text-gray-900">Paint Colors</div>
      <div className="grid gap-3 sm:grid-cols-2">
        {colours.map((c) => {
          const specs = db.specs.filter((s) => s.colourId === c.id && s.state !== "superseded");
          const approved = specs.length > 0 && specs.every((s) => s.state === "approved");
          return (
            <div key={c.id} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3">
              <Swatch hex={c.hex} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-gray-900">{c.name} <span className="font-normal text-gray-500">{c.number}</span></div>
                <div className="text-xs text-gray-500">{specs.map((s) => `${s.product ?? c.manufacturer} · ${s.sheen ?? ""}`).join(" / ") || c.manufacturer}</div>
              </div>
              <span className="flex items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${approved ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                  {approved ? "Approved" : "Awaiting your approval"}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-gray-500">Accepting this estimate approves the colors and finishes listed, unless a color still needs a sample.</p>
    </div>
  );
}

function AcceptModal({ open, onOpenChange, estimate }: { open: boolean; onOpenChange: (v: boolean) => void; estimate: Estimate }) {
  const [name, setName] = useState("");
  const [signed, setSigned] = useState(false);
  const [clearKey, setClearKey] = useState(0);
  const [error, setError] = useState<{ field?: string; message: string }>();
  const [selected, setSelected] = useState<string[] | null>(null);
  const options = estimate.pricingSnapshot?.lineItems.filter((l) => l.optional) ?? [];
  const selectedIds = selected ?? options.filter((l) => l.selected).map((l) => l.id);
  const agreedTotal = estimate.pricingSnapshot && options.length ? builderTotals({ ...estimate.pricingSnapshot, lineItems: estimate.pricingSnapshot.lineItems.map((l) => l.optional ? { ...l, selected: selectedIds.includes(l.id) } : l) }).total : estimate.total;
  function accept() {
    const r = act(acceptEstimateByToken, estimate.publicToken!, { signatureName: name, signed, selectedOptionalIds: options.length ? selectedIds : undefined });
    if (!r.ok) return setError({ field: r.field, message: r.error });
    toast.success("Estimate accepted", "Thank you! We'll be in touch to schedule your project.");
    onOpenChange(false);
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" title="Accept Estimate"
      footer={<><Button onClick={() => onOpenChange(false)}>Back</Button><Button variant="primary" onClick={accept}><Check className="h-4 w-4" /> Accept Estimate</Button></>}>
      <div className="space-y-5">
        <div className="flex items-center justify-between rounded-xl bg-primary-600 p-4 text-white">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-primary-100">Total Agreed Price</div>
            <div className="font-heading text-2xl font-black">{money(agreedTotal, { cents: true })}</div>
          </div>
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold">Pending Acceptance</span>
        </div>
        <div className="rounded-xl border border-gray-200 p-4 text-sm">
          <div className="font-bold text-gray-900">Payment &amp; Deposit Terms:</div>
          <div className="text-gray-600">{DEFAULT_DEPOSIT_PERCENT}% deposit due at signing. Balance due on completion.</div>
        </div>
        {options.length > 0 && <section><h3 className="font-bold">Optional work</h3><p className="text-xs text-gray-500">Select the work to include. Item prices are before tax and discount.</p>{options.map((line) => <label key={line.id} className="flex gap-2 py-2 text-sm"><input type="checkbox" checked={selectedIds.includes(line.id)} onChange={(ev) => setSelected(ev.target.checked ? [...selectedIds, line.id] : selectedIds.filter((id) => id !== line.id))} />{line.description} — {money(line.total, { cents: true })}</label>)}</section>}
        <Field label="Full Name" required error={error?.field === "signatureName" ? error.message : undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. John Smith" invalid={error?.field === "signatureName"} />
        </Field>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700">E-Signature<span className="ml-0.5 text-red-500">*</span></span>
            <button onClick={() => setClearKey((k) => k + 1)} className="text-xs font-bold text-primary-700 hover:underline">Clear</button>
          </div>
          <SignatureCanvas onChange={setSigned} clearKey={clearKey} />
          {error?.field === "signature" && <p className="mt-1 text-xs font-medium text-red-600">{error.message}</p>}
        </div>
        {error && !error.field && <Banner tone="danger">{error.message}</Banner>}
        <p className="text-xs text-gray-500">By signing above, you agree to the terms and conditions detailed in this estimate.</p>
      </div>
    </Modal>
  );
}

/** NEW (feature 24): the customer's change-order decision, on their estimate page. */
function ChangeOrdersForApproval({ cos, defaultSigner }: { cos: ChangeOrder[]; defaultSigner: string }) {
  const db = useDb((d) => d);
  const [open, setOpen] = useState<ChangeOrder>();
  return (
    <div className="mx-auto mb-8 max-w-[8.5in] rounded-2xl border-2 border-green-300 bg-white p-5 shadow-lg" data-tour="public-change-orders">
      <div className="flex items-center gap-2">
        <FileDiff className="h-5 w-5 text-primary-600" />
        <h2 className="font-heading text-lg font-bold text-gray-900">Change orders for your approval</h2>
        <NewBadge feature={24} className="no-print" />
      </div>
      <p className="mt-1 text-sm text-gray-500">Your contractor sent changes to the signed scope. Review each one and approve or decline it as a whole.</p>
      <div className="mt-4 space-y-2">
        {cos.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 p-3">
            <div>
              <div className="text-sm font-bold text-gray-900">{c.title}</div>
              <div className="text-xs text-gray-500">{c.id} · version {c.version ?? 1} · {money(coPricing(db, c).total, { cents: true })}</div>
            </div>
            <Button variant="primary" size="sm" onClick={() => setOpen(c)}>Review &amp; sign</Button>
          </div>
        ))}
      </div>
      <CoDecisionModal co={open} onClose={() => setOpen(undefined)} defaultSigner={defaultSigner} />
    </div>
  );
}

function CoDecisionModal({ co, onClose, defaultSigner }: { co?: ChangeOrder; onClose: () => void; defaultSigner: string }) {
  const [name, setName] = useState(defaultSigner);
  const [signed, setSigned] = useState(false);
  const [clearKey, setClearKey] = useState(0);
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"approve" | "reject">("approve");
  const [error, setError] = useState<{ field?: string; message: string }>();
  const link = co ? currentLink(co) : undefined;
  function submit() {
    if (!co || !link) return;
    const r = act(customerDecideChangeOrder, co.id, link.id, { decision: mode, signer: name, signed, reason });
    if (!r.ok) return setError({ field: r.field, message: r.error });
    toast.success(mode === "approve" ? "Change order approved" : "Change order declined", "Thank you. Your contractor has been told.");
    onClose();
  }
  return (
    <Modal open={!!co} onOpenChange={(v) => !v && onClose()} size="lg" title={`Change Order ${co?.id ?? ""}`} description="Approve or decline the whole change order."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant={mode === "approve" ? "primary" : "danger"} onClick={submit}>{mode === "approve" ? "Approve change order" : "Decline change order"}</Button></>}>
      {co && (
        <div className="space-y-4">
          <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-200"><CoDocument co={co} /></div>
          <div className="flex gap-2">
            {(["approve", "reject"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${mode === m ? "border-primary-600 bg-primary-50 text-primary-700" : "border-gray-200 text-gray-600"}`}>
                {m === "approve" ? "Approve" : "Decline"}
              </button>
            ))}
          </div>
          <Field label="Full Name" required error={error?.field === "signer" ? error.message : undefined}>
            <Input value={name} onChange={(e) => setName(e.target.value)} invalid={error?.field === "signer"} />
          </Field>
          {mode === "approve" ? (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700">E-Signature<span className="ml-0.5 text-red-500">*</span></span>
                <button onClick={() => setClearKey((k) => k + 1)} className="text-xs font-bold text-primary-700 hover:underline">Clear</button>
              </div>
              <SignatureCanvas onChange={setSigned} clearKey={clearKey} />
              {error?.field === "signature" && <p className="mt-1 text-xs font-medium text-red-600">{error.message}</p>}
            </div>
          ) : (
            <Field label="Reason" required error={error?.field === "reason" ? error.message : undefined}>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} invalid={error?.field === "reason"} />
            </Field>
          )}
          {error && !error.field && <Banner tone="danger">{error.message}</Banner>}
        </div>
      )}
    </Modal>
  );
}
