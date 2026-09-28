"use client";
/**
 * "Add New Lead" (live: leads/listings/modals/lead-form.tsx with
 * contact-selection.tsx). New contact or an existing one, the job location,
 * the lead source (COMMON_SOURCES or Other) and a first note.
 */
import { useEffect, useState } from "react";
import { act, useDb } from "@/features/lib/store";
import { createLead, type LeadDraft } from "@/features/lib/store/actions/leads";
import { COMMON_SOURCES } from "@/features/lib/rules/lead-pipeline";
import { contactLocations } from "@/features/components/features/contacts/details/contact-shared";
import { toast } from "@/features/lib/toast";
import { cn } from "@/features/lib/cn";
import { Banner, Button, Field, Input, Modal, Select, Textarea } from "@/features/components/ui";

const EMPTY: LeadDraft = { firstName: "", lastName: "", phone: "", email: "", address: "", city: "", state: "TX", zip: "", source: "Website", note: "" };

export function LeadFormModal({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated?: (id: string) => void }) {
  const db = useDb((d) => d);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [draft, setDraft] = useState<LeadDraft>(EMPTY);
  const [other, setOther] = useState("");
  const [error, setError] = useState<{ field?: string; message: string }>();
  useEffect(() => {
    if (open) { setDraft(EMPTY); setMode("new"); setOther(""); setError(undefined); }
  }, [open]);
  const set = (k: keyof LeadDraft, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const locations = draft.customerId ? contactLocations(db, draft.customerId) : [];
  const submit = () => {
    const input = { ...draft, source: draft.source === "Other" ? other : draft.source, customerId: mode === "existing" ? draft.customerId : undefined, propertyId: mode === "existing" ? draft.propertyId : undefined };
    if (mode === "existing" && !input.customerId) return setError({ field: "customerId", message: "Select a contact." });
    const r = act(createLead, input);
    if (!r.ok) return setError({ field: r.field, message: r.error });
    toast.success("Lead created successfully");
    onOpenChange(false);
    onCreated?.(r.value as string);
  };
  const err = (f: string) => (error?.field === f ? error.message : undefined);
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" title="Add New Lead"
      footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" onClick={submit}>Save Lead</Button></>}>
      <div className="space-y-5">
        <div className="flex rounded-xl border border-gray-200 bg-gray-100 p-1">
          {([["new", "New Contact"], ["existing", "Existing Contact"]] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setMode(v)} className={cn("flex-1 rounded-lg px-3 py-2 text-sm font-bold", mode === v ? "bg-white text-primary-700 shadow-sm" : "text-gray-500")}>{label}</button>
          ))}
        </div>
        {error && !error.field && <Banner tone="danger">{error.message}</Banner>}
        {mode === "existing" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact" required error={err("customerId")}>
              <Select value={draft.customerId ?? ""} onChange={(e) => setDraft((d) => ({ ...d, customerId: e.target.value || undefined, propertyId: contactLocations(db, e.target.value)[0]?.id }))}>
                <option value="">Select a contact…</option>
                {db.customers.filter((c) => !c.personalDataDeleted).sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Job Location" error={err("propertyId")}>
              <Select value={draft.propertyId ?? ""} onChange={(e) => setDraft((d) => ({ ...d, propertyId: e.target.value || undefined }))} disabled={!draft.customerId}>
                {locations.length === 0 && <option value="">No service location</option>}
                {locations.map((p) => <option key={p.id} value={p.id}>{p.address}, {p.city}</option>)}
              </Select>
            </Field>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First Name" required error={err("firstName")}><Input value={draft.firstName} onChange={(e) => set("firstName", e.target.value)} /></Field>
              <Field label="Last Name"><Input value={draft.lastName} onChange={(e) => set("lastName", e.target.value)} /></Field>
              <Field label="Phone" error={err("phone")}><Input value={draft.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(555) 555-5555" /></Field>
              <Field label="Email" error={err("email")}><Input type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr_80px_100px]">
              <Field label="Street"><Input value={draft.address} onChange={(e) => set("address", e.target.value)} /></Field>
              <Field label="City" error={err("city")}><Input value={draft.city} onChange={(e) => set("city", e.target.value)} /></Field>
              <Field label="State"><Input value={draft.state} onChange={(e) => set("state", e.target.value)} /></Field>
              <Field label="Zip"><Input value={draft.zip} onChange={(e) => set("zip", e.target.value)} /></Field>
            </div>
          </>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Lead Source" required error={err("source")}>
            <Select value={draft.source} onChange={(e) => set("source", e.target.value)}>
              {COMMON_SOURCES.map((s) => <option key={s}>{s}</option>)}
              <option>Other</option>
            </Select>
          </Field>
          {draft.source === "Other" && <Field label="Other Source" required><Input value={other} onChange={(e) => setOther(e.target.value)} /></Field>}
        </div>
        <Field label="Notes"><Textarea rows={3} value={draft.note} onChange={(e) => set("note", e.target.value)} placeholder="Project details, preferences…" /></Field>
      </div>
    </Modal>
  );
}
