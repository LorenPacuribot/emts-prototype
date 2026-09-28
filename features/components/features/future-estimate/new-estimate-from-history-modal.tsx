"use client";
/**
 * NEW (feature 28) — "New Estimate from History" on the contact's Paint
 * History and Job History tabs.
 *
 * Step 1: select surfaces from the service location's history.
 * Step 2: the lead. The live app creates an estimate only from a Scheduled
 * lead without an estimate, so pick one for this address or book the
 * appointment (which creates the lead). Then the draft estimate opens.
 */
import { useEffect, useState } from "react";
import type { Property } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { startEstimateFromHistory } from "@/features/lib/store/actions/history-estimate";
import { openRecords } from "@/features/lib/store/actions/future-estimate";
import { leadEligibleForEstimate } from "@/features/lib/rules/estimate-lifecycle";
import { currentOwnership } from "@/features/lib/selectors";
import { useNav } from "@/features/lib/navigation";
import { estimateHref } from "@/features/lib/hrefs";
import { dateTime } from "@/features/lib/format";
import { toast } from "@/features/lib/toast";
import { cn } from "@/features/lib/cn";
import { Banner, Button, Checkbox, Field, Input, Modal, NewBadge, Select } from "@/features/components/ui";
import { SurfaceSelector } from "./surface-selector";

export function NewEstimateFromHistoryModal({ open, onOpenChange, property, followUpId, preselect = [] }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  property: Property;
  followUpId?: string;
  preselect?: string[];
}) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const nav = useNav();
  const owner = currentOwnership(property);
  const [step, setStep] = useState<"surfaces" | "lead">("surfaces");
  const [selected, setSelected] = useState<string[]>(preselect);
  const [leadId, setLeadId] = useState<string>("new");
  const [when, setWhen] = useState("");
  const [estimatorId, setEstimatorId] = useState("");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string }>();

  useEffect(() => {
    if (!open) return;
    setStep("surfaces");
    setSelected(preselect);
    setError(undefined);
    setAck(false);
    const d = new Date(Date.now() + 2 * 86400000);
    d.setHours(10, 0, 0, 0);
    setWhen(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T10:00`);
    setEstimatorId(["estimator", "senior_estimator"].includes(user.role) ? user.id : "U-EST");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const leads = db.leads.filter((l) => l.customerId === owner.customerId && (!l.propertyId || l.propertyId === property.id) && !leadEligibleForEstimate(l));
  useEffect(() => {
    if (open) setLeadId(leads[0]?.id ?? "new");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const open_ = openRecords(db, property.id);
  const openCount = open_.repeatDrafts.length + open_.openEstimates.length + open_.pendingReorders.length;
  const estimators = db.users.filter((u) => ["owner", "office_manager", "senior_estimator", "estimator"].includes(u.role));

  function create() {
    const r = act(startEstimateFromHistory, {
      propertyId: property.id, applicationIds: selected, followUpId, acknowledgedOpen: ack,
      ...(leadId === "new" ? { newLead: { scheduledAt: when ? new Date(when).toISOString() : "", estimatorId } } : { leadId }),
    });
    if (!r.ok) return setError({ field: r.field, message: r.error });
    toast.success("Estimate started from history", "Scope, colours and specifications copied. Reconfirm, record the inspection, then Send.");
    onOpenChange(false);
    nav.push(estimateHref(r.value as string, "section-from-history"));
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="xl" title="New Estimate from History" description={`${property.address} · the result is a normal estimate`}
      footer={step === "surfaces"
        ? <><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" disabled={selected.length === 0} onClick={() => setStep("lead")}>Next: lead</Button></>
        : <><Button onClick={() => setStep("surfaces")}>Back</Button><Button variant="primary" onClick={create}>Create Estimate</Button></>}>
      <div className="mb-3"><NewBadge feature={28} /></div>
      {step === "surfaces" ? (
        <SurfaceSelector db={db} property={property} selected={selected} onChange={setSelected} />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Every estimate originates from a scheduled lead. Pick the lead for this address, or book the estimate appointment now.</p>
          <div className="space-y-2">
            {leads.map((l) => (
              <label key={l.id} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-3", leadId === l.id ? "border-primary-500 bg-primary-50/40" : "border-gray-200")}>
                <input type="radio" checked={leadId === l.id} onChange={() => setLeadId(l.id)} />
                <div className="text-sm"><b>{l.id}</b> · Estimate Scheduled{l.scheduledAt && ` · ${dateTime(l.scheduledAt)}`}</div>
              </label>
            ))}
            <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3", leadId === "new" ? "border-primary-500 bg-primary-50/40" : "border-gray-200")}>
              <input type="radio" className="mt-1" checked={leadId === "new"} onChange={() => setLeadId("new")} />
              <div className="flex-1 text-sm">
                <b>Book the estimate appointment</b> <span className="text-gray-500">(creates a Scheduled lead{followUpId ? `, source Repaint alert` : ", source Existing Client"})</span>
                {leadId === "new" && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Date and time" required error={error?.field === "scheduledAt" ? error.message : undefined}><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
                    <Field label="Assigned Estimator" required error={error?.field === "estimatorId" ? error.message : undefined}>
                      <Select value={estimatorId} onChange={(e) => setEstimatorId(e.target.value)}>
                        <option value="">Select Estimator...</option>
                        {estimators.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </Select>
                    </Field>
                  </div>
                )}
              </div>
            </label>
          </div>
          {openCount > 0 && (
            <Banner tone="warn" title="This address already has an open record">
              {[...open_.repeatDrafts.map((r) => r.id), ...open_.openEstimates.map((e) => e.id), ...open_.pendingReorders.map((r) => r.id)].join(", ")}. Open it instead, or confirm a separate estimate is needed.
              <div className="mt-2"><Checkbox checked={ack} onCheckedChange={setAck} label="A separate estimate is needed" /></div>
            </Banner>
          )}
          {error && !["scheduledAt", "estimatorId"].includes(error.field ?? "") && <Banner tone="danger">{error.message}</Banner>}
        </div>
      )}
    </Modal>
  );
}
