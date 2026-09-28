"use client";
/**
 * "Start New Estimate" (live: estimates/listings/modals/create-estimate.tsx
 * with components/lead-selection.tsx).
 *
 * Step "lead" (contact flow, or no lead given): pick a Scheduled lead that
 * has no estimate yet — "Every estimate originates from a scheduled lead."
 * Step "type": project type. The live app then opens /estimates/new; the
 * prototype creates the draft straight away and opens it.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Building2, Home, Layers, PaintRoller, Search } from "lucide-react";
import type { Job } from "@/features/types";
import { act, getDb, useCurrentUser, useDb } from "@/features/lib/store";
import { createEstimateFromLead } from "@/features/lib/store/actions/estimates";
import { leadEligibleForEstimate } from "@/features/lib/rules/estimate-lifecycle";
import { byId, propertyAddress } from "@/features/lib/selectors";
import { useNav } from "@/features/lib/navigation";
import { estimateHref } from "@/features/lib/hrefs";
import { dateTime } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { cn } from "@/features/lib/cn";
import { Banner, Button, Field, Input, Modal, Select } from "@/features/components/ui";

const TYPES: { value: Job["jobType"]; label: string; body: string; icon: React.ReactNode }[] = [
  { value: "interior_repaint", label: "Interior", body: "Rooms, ceilings, trim and doors.", icon: <Home className="h-6 w-6" /> },
  { value: "exterior_repaint", label: "Exterior", body: "Siding, trim, doors and elevations.", icon: <Building2 className="h-6 w-6" /> },
  { value: "mixed", label: "Interior & Exterior", body: "Both, on one estimate.", icon: <Layers className="h-6 w-6" /> },
  { value: "new_construction", label: "New Construction", body: "Never-painted drywall and trim.", icon: <PaintRoller className="h-6 w-6" /> },
];

export function CreateEstimateModal({ open, onOpenChange, leadId: boundLeadId, customerId, onCreated, title = "Start New Estimate" }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Bound lead (lead details page): the lead step is skipped. */
  leadId?: string;
  /** Contact flow: only this customer's leads are listed. */
  customerId?: string;
  /** Called with the new estimate ID instead of opening it (feature 28 pre-fill). */
  onCreated?: (estimateId: string) => void;
  title?: string;
}) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const nav = useNav();
  const [step, setStep] = useState<"lead" | "type">(boundLeadId ? "type" : "lead");
  const [leadId, setLeadId] = useState<string | undefined>(boundLeadId);
  const [q, setQ] = useState("");
  const [jobType, setJobType] = useState<Job["jobType"]>("interior_repaint");
  const [name, setName] = useState("");
  const [estimatorId, setEstimatorId] = useState("");
  const [error, setError] = useState<{ field?: string; message: string }>();

  useEffect(() => {
    if (!open) return;
    setStep(boundLeadId ? "type" : "lead");
    setLeadId(boundLeadId);
    setQ("");
    setError(undefined);
    // A bound lead (lead details page) starts with its appointment's estimator, like picking it.
    const bound = boundLeadId ? byId(getDb().leads, boundLeadId) : undefined;
    if (bound) {
      setEstimatorId(bound.assignedUserId ?? (["estimator", "senior_estimator"].includes(user.role) ? user.id : "U-EST"));
      setName(`${TYPES.find((x) => x.value === jobType)!.label} Repaint`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, boundLeadId]);

  const eligible = useMemo(
    () =>
      db.leads
        .filter((l) => !leadEligibleForEstimate(l) && (!customerId || l.customerId === customerId))
        .filter((l) => {
          const c = byId(db.customers, l.customerId);
          const p = byId(db.properties, l.propertyId);
          const hay = `${c?.name} ${c?.email} ${c?.phone} ${l.id} ${propertyAddress(p)}`.toLowerCase();
          return hay.includes(q.toLowerCase());
        }),
    [db.leads, db.customers, db.properties, customerId, q],
  );

  const lead = byId(db.leads, leadId);
  const estimators = db.users.filter((u) => ["owner", "office_manager", "senior_estimator", "estimator"].includes(u.role));

  function pickLead(id: string) {
    const l = byId(db.leads, id)!;
    setLeadId(id);
    setEstimatorId(l.assignedUserId ?? (["estimator", "senior_estimator"].includes(user.role) ? user.id : "U-EST"));
    const t = TYPES.find((x) => x.value === jobType)!;
    setName(`${t.label} Repaint`);
    setStep("type");
  }

  function create() {
    if (!leadId) return setError({ message: "Pick the lead this estimate is for." });
    const r = act(createEstimateFromLead, { leadId, title: name, estimatorId, jobType });
    if (!r.ok) return setError({ field: r.field, message: r.error });
    toast.success("Estimate created", "Add areas, line items and colours, then send it.");
    onOpenChange(false);
    if (onCreated) onCreated(r.value as string);
    else nav.push(estimateHref(r.value as string));
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" title={title}
      footer={step === "type" ? <><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" onClick={create}>Create Estimate</Button></> : undefined}>
      {step === "lead" && (
        <div>
          <p className="mb-4 text-sm text-gray-500">Every estimate originates from a scheduled lead. Pick the lead this estimate is for.</p>
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, address, phone, email, or lead number..." className="pl-9" />
          </div>
          {eligible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
              No scheduled leads without an estimate.
              <div className="mt-1 text-xs text-gray-400">Schedule the estimate appointment on a lead first (Lead Pipeline › lead › Schedule).</div>
            </div>
          ) : (
            <div className="space-y-2">
              {eligible.map((l) => {
                const c = byId(db.customers, l.customerId);
                const p = byId(db.properties, l.propertyId);
                return (
                  <button key={l.id} onClick={() => pickLead(l.id)} className="w-full rounded-xl border border-gray-200 p-4 text-left hover:border-primary-300 hover:bg-primary-50/40">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-gray-900">{c?.name}</span>
                      <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-xs font-bold text-gray-600">{l.id}</span>
                    </div>
                    <div className="mt-1 text-sm text-gray-500">{propertyAddress(p)}</div>
                    <div className="text-xs text-gray-400">{c?.email} · {c?.phone}{l.scheduledAt && ` · Appointment ${dateTime(l.scheduledAt)}`}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {step === "type" && (
        <div className="space-y-5">
          {!boundLeadId && (
            <button onClick={() => setStep("lead")} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-primary-600">
              <ArrowLeft className="h-4 w-4" /> Back to leads
            </button>
          )}
          {lead && (
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-100 bg-primary-50 px-3 py-1 text-xs font-bold text-primary-700">
              {lead.id} · {byId(db.customers, lead.customerId)?.name}
            </div>
          )}
          <p className="text-sm text-gray-500">Choose the type of project you are estimating.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {TYPES.map((t) => (
              <button key={t.value} onClick={() => { setJobType(t.value); setName(`${t.label} Repaint`); }}
                className={cn("flex flex-col gap-3 rounded-2xl border-2 p-5 text-left transition-all hover:shadow-lg", jobType === t.value ? "border-primary-500 bg-primary-50/50 ring-2 ring-primary-200" : "border-gray-100 bg-white hover:border-primary-200")}>
                <span className={cn("flex h-12 w-12 items-center justify-center rounded-xl", jobType === t.value ? "bg-primary-500 text-white shadow-lg shadow-primary-500/30" : "bg-gray-100 text-gray-500")}>{t.icon}</span>
                <span>
                  <span className="block text-lg font-bold text-gray-900">{t.label}</span>
                  <span className="text-sm text-gray-500">{t.body}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project Name" required error={error?.field === "title" ? error.message : undefined}>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter Project Name" invalid={error?.field === "title"} />
            </Field>
            <Field label="Estimator" required error={error?.field === "estimatorId" ? error.message : undefined}>
              <Select value={estimatorId} onChange={(e) => setEstimatorId(e.target.value)} invalid={error?.field === "estimatorId"}>
                <option value="">Select Estimator...</option>
                {estimators.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </Field>
          </div>
          {error && error.field !== "title" && error.field !== "estimatorId" && <Banner tone="danger">{error.message}</Banner>}
        </div>
      )}
    </Modal>
  );
}
