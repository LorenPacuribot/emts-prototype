"use client";
/**
 * Estimate Details — live route /estimates/[id]
 * (features/(main)/estimates/details/templates/index.tsx).
 *
 * Rebuilt only as far as the new features need, in the live order:
 * toolbar, then one card with the header, Client / Job Site / Dates, Paint
 * Color Card (feature 3), Area & Line Items, Change Orders (NEW, feature 24),
 * Customer / Internal Notes, Paint & Materials (feature 18 preliminary list)
 * and Finalize Estimate with the Summary.
 */
import { useState } from "react";
import { Calendar, ClipboardList, FileText, MapPin, Package, Pencil, Printer, StickyNote, UserRound } from "lucide-react";
import type { Estimate, Job } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { useParam } from "@/features/lib/navigation";
import { AppLink } from "@/features/lib/navigation";
import { draftTotal, updateEstimateDetails, sendEstimate } from "@/features/lib/store/actions/estimates";
import { estimateTotals } from "@/features/lib/rules/estimate";
import { DEFAULT_DEPOSIT_PERCENT, isEditable } from "@/features/lib/rules/estimate-lifecycle";
import { jobDemand } from "@/features/lib/rules/procurement";
import { formatPacks } from "@/features/lib/rules/materials";
import { byId } from "@/features/lib/selectors";
import { contactHref } from "@/features/lib/hrefs";
import { can } from "@/features/lib/permissions";
import { date, money } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { Screen } from "@/features/components/layout/screen";
import { Logo } from "@/features/components/layout/icon-rail";
import { Banner, Button, EmptyState, EstimateSection, Field, Input, Modal, NewBadge, SectionHeader, Select, Textarea } from "@/features/components/ui";
import { ChangeOrdersSection } from "@/features/components/features/change-orders/change-orders-section";
import { PreliminaryListModal } from "@/features/components/features/materials/side-panels";
import { FromHistorySection } from "@/features/components/features/future-estimate/from-history-section";
import { ProjectToolbar } from "./project-toolbar";
import { PaintColors } from "./paint-colors";
import { ScopeOfWork } from "./scope-of-work";

export function EstimateDetailsScreen() {
  const id = useParam("id");
  const db = useDb((d) => d);
  const estimate = byId(db.estimates, id);
  const job = estimate?.jobId ? byId(db.jobs, estimate.jobId) : undefined;
  return (
    <Screen crumbs={[{ label: "Estimates", href: "/estimates" }, { label: "Estimate Details" }]} bare>
      {!estimate ? (
        <div className="mx-auto max-w-[1200px] p-8">
          <EmptyState icon={<FileText />} title="Estimate not found." body="It may have been deleted." action={<AppLink href="/estimates"><Button>Back to Estimates</Button></AppLink>} />
        </div>
      ) : (
        <EstimateDetails estimate={estimate} job={job} />
      )}
    </Screen>
  );
}

function EstimateDetails({ estimate, job }: { estimate: Estimate; job?: Job }) {
  const [paintColourId, setPaintColourId] = useState<string>();
  // NEW (24): the work order kebab opens the estimate with ?newco=1.
  const [creatingCo, setCreatingCo] = useState(useParam("newco") === "1" && estimate.status === "ACCEPTED");
  const editable = isEditable(estimate.status) && !!job;
  const db = useDb((d) => d);
  const rep = estimate.repeatEstimateId ? byId(db.repeatEstimates, estimate.repeatEstimateId) : undefined;

  return (
    <div className="mx-auto my-4 w-full max-w-[1200px] px-4 md:my-6 md:px-6 lg:px-8">
      <ProjectToolbar estimate={estimate} job={job} onCreateChangeOrder={() => {
        setCreatingCo(true);
        document.getElementById("section-change-orders")?.scrollIntoView({ behavior: "smooth" });
      }} />
      <div className="rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <EstimateHeader estimate={estimate} job={job} editable={editable} />
        <ClientInfo estimate={estimate} editable={editable} />
        <div className="space-y-6 p-4 md:space-y-12 md:p-12">
          {!job ? (
            <Banner tone="info" title="Scope not recorded in the prototype">
              This estimate was imported without its scope. Its total is kept as it was signed.
            </Banner>
          ) : (
            <>
              {rep && <FromHistorySection estimate={estimate} rep={rep} />}
              <PaintColors job={job} editable={editable} paintColourId={paintColourId} onPaint={setPaintColourId} />
              <ScopeOfWork estimateId={estimate.id} job={job} editable={editable} paintColourId={paintColourId} />
              <ChangeOrdersSection job={job} estimateId={estimate.id} creating={creatingCo} setCreating={setCreatingCo} />
              <NotesSection estimate={estimate} editable={editable} />
              <MaterialsSummary estimate={estimate} job={job} />
            </>
          )}
          <FinalizeSection estimate={estimate} job={job} editable={editable} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const TYPE_TITLE: Record<Job["jobType"], string> = {
  interior_repaint: "Interior Estimate",
  exterior_repaint: "Exterior Estimate",
  mixed: "Interior & Exterior Estimate",
  new_construction: "New Construction Estimate",
};

function EstimateHeader({ estimate, job, editable }: { estimate: Estimate; job?: Job; editable: boolean }) {
  const db = useDb((d) => d);
  const estimators = db.users.filter((u) => ["owner", "office_manager", "senior_estimator", "estimator"].includes(u.role));
  return (
    <div className="px-4 pt-8 md:px-12 md:pt-10">
      <div className="text-center">
        <h2 className="font-heading text-2xl font-extrabold text-gray-900 md:text-3xl">{job ? TYPE_TITLE[job.jobType] : "Estimate"}</h2>
        <p className="mt-1 text-sm text-gray-500">Detailed Proposal &amp; Scope of Work</p>
      </div>
      <div className="mt-8 flex flex-col gap-6 border-b border-gray-200 pb-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Logo className="h-14 w-14" />
          <div>
            <div className="font-heading text-lg font-bold text-gray-900">Estimate Master</div>
            <div className="text-sm text-gray-500">410 Commerce Park, Dallas, TX 75201</div>
            <div className="text-xs text-gray-400">license #TX-PNT-20418</div>
          </div>
        </div>
        <div className="sm:text-right">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Estimator</div>
          {editable ? (
            <Select value={estimate.estimatorId ?? ""} onChange={(e) => act(updateEstimateDetails, estimate.id, { estimatorId: e.target.value })} className="h-10 w-56 rounded-full" aria-label="Estimator">
              <option value="">Select Estimator ▾</option>
              {estimators.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          ) : (
            <span className="inline-flex rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-800">{byId(db.users, estimate.estimatorId)?.name ?? "Not assigned"}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ClientInfo({ estimate, editable }: { estimate: Estimate; editable: boolean }) {
  const db = useDb((d) => d);
  const customer = byId(db.customers, estimate.customerId);
  const property = byId(db.properties, estimate.propertyId);
  const [datesOpen, setDatesOpen] = useState(false);
  return (
    <div className="grid gap-6 px-4 pt-8 sm:grid-cols-3 md:px-12">
      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-gray-400"><UserRound className="h-3.5 w-3.5" /> Client</h4>
        <AppLink href={contactHref(estimate.customerId)} className="font-bold text-gray-900 hover:text-primary-700">{customer?.name}</AppLink>
        <div className="text-sm text-gray-500">{customer?.email}</div>
        <div className="text-sm text-gray-500">{customer?.phone}</div>
      </div>
      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-gray-400"><MapPin className="h-3.5 w-3.5" /> Job Site</h4>
        <div className="font-semibold text-gray-900">{property?.address}</div>
        <div className="text-sm text-gray-500">{property ? `${property.city}, ${property.state} ${property.zip}` : "No job address specified"}</div>
      </div>
      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-gray-400"><Calendar className="h-3.5 w-3.5" /> Dates
          {editable && <button onClick={() => setDatesOpen(true)} className="ml-1 text-gray-400 hover:text-primary-600" aria-label="Edit Estimate Dates"><Pencil className="h-3.5 w-3.5" /></button>}
        </h4>
        <div className="text-sm text-gray-600"><span className="text-gray-400">Estimate Date:</span> {date(estimate.estimateDate ?? estimate.createdAt)}</div>
        <div className="text-sm text-gray-600"><span className="text-gray-400">Valid Until:</span> {date(estimate.validUntil)}</div>
      </div>
      <DatesModal open={datesOpen} onOpenChange={setDatesOpen} estimate={estimate} />
    </div>
  );
}

function DatesModal({ open, onOpenChange, estimate }: { open: boolean; onOpenChange: (v: boolean) => void; estimate: Estimate }) {
  const [from, setFrom] = useState((estimate.estimateDate ?? estimate.createdAt).slice(0, 10));
  const [to, setTo] = useState((estimate.validUntil ?? estimate.createdAt).slice(0, 10));
  const [error, setError] = useState<string>();
  function save() {
    const r = act(updateEstimateDetails, estimate.id, { estimateDate: new Date(from).toISOString(), validUntil: new Date(to).toISOString() });
    if (!r.ok) return setError(r.error);
    toast.success("Dates updated");
    onOpenChange(false);
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Edit Estimate Dates" size="sm" footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Estimate Date"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Valid Until" error={error}><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} invalid={!!error} /></Field>
      </div>
    </Modal>
  );
}

function NotesSection({ estimate, editable }: { estimate: Estimate; editable: boolean }) {
  return (
    <EstimateSection id="section-notes">
      <div className="grid gap-6 md:grid-cols-2">
        {([["customerNotes", "Customer Notes", "Notes visible to customer..."], ["internalNotes", "Internal Notes", "Private internal notes..."]] as const).map(([k, label, ph]) => (
          <div key={k}>
            <SectionHeader icon={<StickyNote />} title={label} className="mb-4 md:mb-4" />
            <Textarea
              key={estimate[k] ?? ""}
              defaultValue={estimate[k] ?? ""}
              placeholder={ph}
              readOnly={!editable}
              rows={4}
              onBlur={(e) => editable && e.target.value !== (estimate[k] ?? "") && act(updateEstimateDetails, estimate.id, { [k]: e.target.value })}
            />
          </div>
        ))}
      </div>
    </EstimateSection>
  );
}

function MaterialsSummary({ estimate, job }: { estimate: Estimate; job: Job }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [prelim, setPrelim] = useState(false);
  const lines = jobDemand(db, job.id).filter((l) => l.spec.product);
  const showPrices = can(user, "estimate.viewFinancials");
  return (
    <EstimateSection id="section-materials">
      <SectionHeader
        icon={<Package />}
        title="Paint & Materials"
        subtitle="Includes waste & container optimization"
        right={estimate.status === "DRAFT" && (
          <Button size="sm" onClick={() => setPrelim(true)} data-tour="preliminary-list">
            <Printer className="h-3.5 w-3.5" /> Preliminary List <NewBadge feature={18} />
          </Button>
        )}
      />
      <div className="text-xs font-bold uppercase tracking-widest text-gray-400">Paint Products (Calculated)</div>
      {lines.length === 0 ? (
        <p className="mt-3 text-sm italic text-gray-400">Add a colour with a product, then assign surfaces.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {["Product", "Color", "Est. Gal", "Containers", ...(showPrices ? ["Cost"] : [])].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((l) => (
                <tr key={l.specId}>
                  <td className="px-4 py-3 font-semibold text-gray-900">{l.spec.product}</td>
                  <td className="px-4 py-3 text-gray-600">{l.colourName} {l.colourNumber} · {l.spec.sheen ?? "—"}</td>
                  <td className="px-4 py-3 font-semibold text-blue-600">{l.needGal.toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatPacks(l.packs.packs) || "—"}</td>
                  {showPrices && <td className="px-4 py-3 text-gray-700">{money(l.needGal * (l.catalog?.cost.gal ?? 0))}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PreliminaryListModal open={prelim} job={job} lines={jobDemand(db, job.id)} onClose={() => setPrelim(false)} />
    </EstimateSection>
  );
}

function FinalizeSection({ estimate, job, editable }: { estimate: Estimate; job?: Job; editable: boolean }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const t = job ? estimateTotals(db, job) : undefined;
  const fromHistory = !!estimate.repeatEstimateId;
  const showFinancials = can(user, "estimate.viewFinancials");
  // Editable estimates show the live calculation; signed ones keep their signed total.
  const total = editable && job ? draftTotal(db, estimate, job) : estimate.total;
  return (
    <section id="section-summary" className="scroll-mt-24">
      <SectionHeader icon={<ClipboardList />} title="Finalize Estimate" subtitle="Configure pricing, terms, and final settings" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="text-xs font-bold uppercase tracking-widest text-gray-400">Deposit &amp; Payment Schedule</div>
            <p className="mt-2 text-sm text-gray-700">{DEFAULT_DEPOSIT_PERCENT}% deposit due at signing. Balance due on completion.</p>
          </div>
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="text-xs font-bold uppercase tracking-widest text-gray-400">Terms and Conditions</div>
            <p className="mt-2 text-sm text-gray-700">Standard Residential Terms v3</p>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 lg:sticky lg:top-24">
          <div className="flex items-center justify-between">
            <div className="font-heading text-lg font-bold text-gray-900">Summary</div>
            <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-bold text-primary-700">Hourly Model</span>
          </div>
          <p className="text-xs text-gray-500">Review final base bid and calculation logic.</p>
          {fromHistory && <p className="mt-2 rounded-lg bg-emerald-50 px-2 py-1 text-xs text-emerald-800">Priced from history (feature 28): the pricing basis in the From history section.</p>}
          {t && showFinancials && !fromHistory && (
            <div className="mt-4 space-y-1.5 rounded-xl border border-gray-200 bg-white p-3 text-sm">
              <Row label="Labor" value={`${money(t.laborTotal)} · ${t.totalHours.toFixed(2)} hrs`} />
              <Row label="Paint" value={`${money(t.paintTotal)} · ${t.totalGallons.toFixed(1)} gal`} />
              <Row label={`Tax (${t.taxRatePct}%)`} value={money(t.taxAmount)} />
            </div>
          )}
          <div className="mt-4 text-[10px] font-bold uppercase tracking-widest text-gray-400">Base Bid Total</div>
          <div className="font-heading text-4xl font-black text-gray-900">{money(total, { cents: true })}</div>
          {editable && total !== estimate.total && <p className="mt-1 text-xs text-amber-700">Save to update the stored total ({money(estimate.total, { cents: true })}).</p>}
          {estimate.status === "DRAFT" && can(user, "estimate.send") && (
            <Button variant="primary" className="mt-4 h-11 w-full justify-center font-black" onClick={() => act(sendEstimate, estimate.id).ok && toast.success("Estimate sent", "Email and SMS recorded (not sent: prototype).")}>
              Send Estimate
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-gray-800">{value}</span>
    </div>
  );
}
