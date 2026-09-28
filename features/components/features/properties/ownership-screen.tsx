"use client";
/**
 * Feature 25 — Owners & Consent (component 25.4).
 * Ownership periods, sale (revoke → former-owner PDF → buyer link),
 * predecessor consent / refusal / unreachable determination (25.Q01),
 * personal-data deletion, and merge / unit renumber requests that the
 * Business Owner approves one at a time.
 */
import { useRef, useState } from "react";
import { Check, CircleX, Eraser, FileText, GitMerge, Hash, KeyRound, Mail, Phone, Printer, ShieldCheck, ShieldOff, UserCheck, Users, X } from "lucide-react";
import type { OwnershipPeriod, Property } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import {
  approveUnreachable, decideStructureRequest, deletePersonalData, logConsentAttempt, recordConsent, recordOwnershipChange, requestStructureChange, requestUnreachable,
} from "@/features/lib/store/actions/property";
import { can } from "@/features/lib/permissions";
import { AppLink } from "@/features/lib/navigation";
import { byId, currentOwnership } from "@/features/lib/selectors";
import { PREDECESSOR_CONSENT, STRUCTURE_REQUEST_STATUS } from "@/features/lib/status";
import { dateLong, titleCase } from "@/features/lib/format";
import { printElement } from "@/features/lib/export";
import { toast } from "@/features/lib/toast";
import { unreachableCheck } from "@/features/lib/rules/property";
import { PanelHeader as PageHeader } from "@/features/components/features/contacts/details/panel-header";
import { Badge, Banner, Button, Card, CardLabel, ConfirmDialog, EmptyState, Field, IdChip, Input, Modal, PillTabs, Select, Table, TD, TH, THead, TR, Textarea } from "@/features/components/ui";
import { buildCustomerRecord } from "@/features/components/features/public-record/customer-record";
import { RecordBody, RecordFooter, RecordHeader } from "@/features/components/features/public-record/record-document";
import { propertyHref } from "@/features/lib/hrefs";
import { fromDateInput, todayInput } from "./property-shared";


type Errors = Record<string, string | undefined>;

export function OwnershipPanel({ property }: { property: Property }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const current = currentOwnership(property);
  const idx = property.ownership.findIndex((o) => o.id === current.id);
  const seller = idx > 0 ? byId(db.customers, property.ownership[idx - 1].customerId) : undefined;
  const [sale, setSale] = useState(false);
  const [pdfFor, setPdfFor] = useState<OwnershipPeriod>();
  const [deleting, setDeleting] = useState<string>();
  const [structure, setStructure] = useState<"merge" | "renumber">();

  const requests = (db.propertyRequests ?? []).filter((r) => r.propertyId === property.id || r.targetPropertyId === property.id);
  const deletions = property.personalDataDeletions ?? [];

  return (
    <>
      <PageHeader
        title="Owners & Consent"
        subtitle="Access is scoped to the current ownership period. A new owner does not automatically see the previous owner's history."
        actions={
          <Button variant="primary" onClick={() => setSale(true)} disabled={!can(user, "property.ownershipChange")} title={can(user, "property.ownershipChange") ? undefined : "Office Manager or Business Owner"}>
            <Users className="h-4 w-4" /> Record ownership change
          </Button>
        }
      />
      {!can(user, "property.ownershipChange") && (
        <Banner tone="info" className="mb-4" title="Read-only for your role">The Office Manager records ownership changes and seller consent. The Business Owner approves unreachable determinations, merges and renumbering.</Banner>
      )}

      <Card className="mb-4 p-5">
        <CardLabel icon={<UserCheck />}>Ownership periods</CardLabel>
        <Table className="mt-3">
          <THead>
            <tr>
              <TH>Period</TH>
              <TH>Owner</TH>
              <TH>Start</TH>
              <TH>End</TH>
              <TH>QR link</TH>
              <TH>Predecessor history</TH>
              <TH>Former-owner PDF</TH>
            </tr>
          </THead>
          <tbody>
            {[...property.ownership].reverse().map((o, i) => {
              const c = byId(db.customers, o.customerId);
              const links = db.qrLinks.filter((l) => l.ownershipPeriodId === o.id);
              const active = links.find((l) => !l.revokedAt);
              const first = property.ownership[0].id === o.id;
              return (
                <TR key={o.id}>
                  <TD><IdChip>{o.id}</IdChip>{i === 0 && !o.end && <Badge tone="green" className="ml-1.5">Current</Badge>}</TD>
                  <TD className="font-medium text-ink">{c?.name ?? "—"}</TD>
                  <TD>{dateLong(o.start)}</TD>
                  <TD>{o.end ? dateLong(o.end) : "—"}</TD>
                  <TD>
                    {active ? <Badge tone="blue">Active · {active.ref.slice(0, 6)}…</Badge> : links.length ? <Badge tone="gray">Revoked</Badge> : <span className="text-slate-400">None</span>}
                  </TD>
                  <TD>{first ? <span className="text-slate-400">First recorded owner</span> : <Badge tone={PREDECESSOR_CONSENT[o.predecessorConsent ?? "not_requested"].tone}>{PREDECESSOR_CONSENT[o.predecessorConsent ?? "not_requested"].label}</Badge>}</TD>
                  <TD>
                    {o.end ? (
                      <Button size="sm" onClick={() => setPdfFor(o)}>
                        <FileText className="h-3.5 w-3.5" /> {o.formerOwnerPdf ? `Issued ${dateLong(o.formerOwnerPdf.issuedAt)}` : "View fixed PDF"}
                      </Button>
                    ) : (
                      <span className="text-slate-400">Live link</span>
                    )}
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ConsentCard property={property} period={current} sellerName={seller?.name} isFirst={idx === 0} />

        <div className="space-y-4">
          <Card className="p-5">
            <CardLabel icon={<Eraser />}>Personal-data deletion</CardLabel>
            <p className="mt-1 text-[12px] text-slate-500">Removes names, contact details and photographs showing faces, house numbers or identifiable possessions. The paint specification at the address stays.</p>
            <div className="mt-3 space-y-2">
              {property.ownership.map((o) => {
                const c = byId(db.customers, o.customerId);
                if (!c) return null;
                return (
                  <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-[12.5px]">
                    <div>
                      <div className="font-semibold text-ink">{c.name}</div>
                      <div className="text-slate-500">{c.personalDataDeleted ? "Personal data deleted" : [c.email, c.phone].filter(Boolean).join(" · ") || "No contact details"}</div>
                    </div>
                    {!c.personalDataDeleted && (
                      <Button size="sm" variant="danger" disabled={!can(user, "property.deletePersonalData")} onClick={() => setDeleting(c.id)}>
                        <Eraser className="h-3.5 w-3.5" /> Delete personal data
                      </Button>
                    )}
                  </div>
                );
              })}
              {deletions.map((d) => (
                <div key={d.id} className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
                  Deleted {d.subject} on {dateLong(d.at)} by {byId(db.users, d.by)?.name}. Backup purge due <strong>{dateLong(d.purgeDue)}</strong> (within 35 days). A restore from backup does not bring it back.
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <CardLabel
              icon={<GitMerge />}
              right={
                can(user, "property.editStructure") && (
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button size="sm" onClick={() => setStructure("merge")}><GitMerge className="h-3.5 w-3.5" /> Request merge</Button>
                    <Button size="sm" onClick={() => setStructure("renumber")} disabled={!db.areas.some((a) => a.propertyId === property.id && a.unit)}><Hash className="h-3.5 w-3.5" /> Renumber unit</Button>
                  </div>
                )
              }
            >
              Merge &amp; renumber
            </CardLabel>
            <p className="mt-1 text-[12px] text-slate-500">Each merge and each unit renumber is approved individually by the Business Owner. There is no bulk approval.</p>
            <div className="mt-3 space-y-2">
              {requests.length === 0 && <EmptyState title="No requests" body="Duplicates are matched on street, postcode and unit. Differing units need manual review." />}
              {requests.map((r) => {
                const st = STRUCTURE_REQUEST_STATUS[r.status];
                return (
                  <div key={r.id} className="rounded-lg border border-line px-3 py-2.5 text-[12.5px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <IdChip>{r.id}</IdChip>
                      <span className="font-semibold text-ink">
                        {r.kind === "merge" ? `Merge ${r.propertyId} into ${r.targetPropertyId}` : `Renumber ${r.oldUnit} → ${r.newUnit}`}
                      </span>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                    <div className="mt-1 text-slate-500">{r.reason}</div>
                    {r.kind === "merge" && (
                      <div className="mt-1 text-[11.5px] text-slate-500">
                        <AppLink className="text-brand hover:underline" href={propertyHref(r.propertyId)}>{byId(db.properties, r.propertyId)?.address}</AppLink> and{" "}
                        <AppLink className="text-brand hover:underline" href={propertyHref(r.targetPropertyId!)}>{byId(db.properties, r.targetPropertyId)?.address}</AppLink>. Both identifiers are preserved.
                      </div>
                    )}
                    <div className="mt-1 text-[11.5px] text-slate-400">
                      Requested by {byId(db.users, r.requestedBy)?.name} {dateLong(r.requestedAt)}
                      {r.decidedBy && ` · ${titleCase(r.status)} by ${byId(db.users, r.decidedBy)?.name} ${dateLong(r.decidedAt)}`}
                    </div>
                    {r.status === "pending" && (
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="success" onClick={() => act(decideStructureRequest, r.id, true).ok && toast.success(r.kind === "merge" ? "Merge approved" : "Unit renumbered", "Originating identifiers preserved.")}>
                          <Check className="h-3.5 w-3.5" /> Approve (owner)
                        </Button>
                        <Button size="sm" onClick={() => act(decideStructureRequest, r.id, false).ok && toast.success("Request rejected")}>
                          <X className="h-3.5 w-3.5" /> Reject
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      <SaleModal open={sale} onClose={() => setSale(false)} property={property} />
      <FormerOwnerPdfModal property={property} period={pdfFor} onClose={() => setPdfFor(undefined)} />
      <StructureModal kind={structure} onClose={() => setStructure(undefined)} property={property} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(undefined)}
        title={`Delete personal data for ${byId(db.customers, deleting)?.name}?`}
        body={
          <>
            Their name, email and phone number are removed everywhere, and identifying photographs at this property are deleted. The paint specification at the address stays. The deletion is purged from nightly backups within 35 days. This cannot be undone.
          </>
        }
        confirmLabel="Delete personal data"
        onConfirm={() => {
          if (deleting && act(deletePersonalData, property.id, deleting).ok) toast.success("Personal data deleted", "Paint specification preserved. Backup purge scheduled.");
        }}
      />
    </>
  );
}

/* ------------------------------ Consent ------------------------------ */

function ConsentCard({ property, period, sellerName, isFirst }: { property: Property; period: OwnershipPeriod; sellerName?: string; isFirst: boolean }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const [recording, setRecording] = useState<"granted" | "refused">();
  const [attempt, setAttempt] = useState(false);
  const canRecord = can(user, "property.recordConsent");
  const check = unreachableCheck(period.consentAttempts ?? []);
  const state = period.predecessorConsent ?? "not_requested";

  if (isFirst) {
    return (
      <Card className="p-5">
        <CardLabel icon={<KeyRound />}>Predecessor consent</CardLabel>
        <EmptyState className="mt-3" title="No predecessor" body="The current owner is the first recorded owner, so their link covers the full history." />
      </Card>
    );
  }

  const note =
    state === "granted" ? "The seller consented in writing. The buyer's link includes predecessor history." :
    state === "refused" ? "Seller has refused sharing. Everything is withheld, including specification-only detail." :
    state === "unreachable_spec_only" ? "Specification-only: colours, products, sheen, surfaces and dates are shared. Names, prices, photographs and contact details are not." :
    "Seller consent not yet recorded. Predecessor history is hidden from the buyer.";

  return (
    <Card className="p-5">
      <CardLabel icon={<KeyRound />}>Predecessor consent</CardLabel>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone={PREDECESSOR_CONSENT[state].tone}>{PREDECESSOR_CONSENT[state].label}</Badge>
        <span className="text-[12.5px] text-slate-500">Seller: {sellerName ?? "—"}</span>
      </div>
      <Banner tone={state === "refused" ? "danger" : state === "not_requested" ? "warn" : "info"} className="mt-3">{note}</Banner>

      {period.consentRecord && (
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600">
          Written {period.consentRecord.decision === "granted" ? "consent" : "refusal"} on {dateLong(period.consentRecord.at)} via {period.consentRecord.channel}. Spoke to {period.consentRecord.spokeTo}. Recorded by {byId(db.users, period.consentRecord.recordedBy)?.name}.
        </div>
      )}

      {!period.consentRecord && state !== "unreachable_spec_only" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="success" disabled={!canRecord} onClick={() => setRecording("granted")}><ShieldCheck className="h-3.5 w-3.5" /> Record consent</Button>
          <Button size="sm" variant="danger" disabled={!canRecord} onClick={() => setRecording("refused")}><ShieldOff className="h-3.5 w-3.5" /> Record refusal</Button>
        </div>
      )}

      {!period.consentRecord && (
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] font-bold text-ink">Contact attempts</div>
            {state !== "unreachable_spec_only" && <Button size="sm" disabled={!canRecord} onClick={() => setAttempt(true)}>Log contact attempt</Button>}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[11.5px]">
            {[
              [`${check.attempts} of 3 attempts`, check.attempts >= 3],
              [`${check.days} of 14 days`, check.days >= 14],
              [`${check.channels.length} of 2 channels`, check.channels.length >= 2],
            ].map(([label, okv]) => (
              <div key={String(label)} className={okv ? "flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1.5 font-semibold text-emerald-700" : "flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1.5 font-semibold text-slate-500"}>
                {okv ? <Check className="h-3 w-3" /> : <CircleX className="h-3 w-3" />} {label}
              </div>
            ))}
          </div>
          <div className="mt-2 space-y-1.5">
            {(period.consentAttempts ?? []).length === 0 && <p className="text-[12px] italic text-slate-400">No attempts logged yet.</p>}
            {(period.consentAttempts ?? []).map((a) => (
              <div key={a.id} className="flex items-start gap-2 text-[12px] text-slate-600">
                {a.channel === "phone" || a.channel === "text" ? <Phone className="mt-0.5 h-3.5 w-3.5 text-slate-400" /> : <Mail className="mt-0.5 h-3.5 w-3.5 text-slate-400" />}
                <span><strong>{dateLong(a.at)}</strong> · {titleCase(a.channel)} — {a.note} <span className="text-slate-400">({byId(db.users, a.by)?.name})</span></span>
              </div>
            ))}
          </div>
          {state !== "unreachable_spec_only" && (
            <div className="mt-3 flex flex-wrap gap-2">
              {!period.unreachableRequestedAt ? (
                <Button size="sm" disabled={!canRecord} onClick={() => act(requestUnreachable, property.id, period.id).ok && toast.success("Sent to the Business Owner", "Nothing is shared until the owner approves.")}>
                  Request unreachable determination
                </Button>
              ) : (
                <>
                  <Badge tone="amber">Waiting on owner approval since {dateLong(period.unreachableRequestedAt)}</Badge>
                  <Button size="sm" variant="primary" onClick={() => act(approveUnreachable, property.id, period.id).ok && toast.success("Unreachable determination approved", "Specification-only sharing is now available to the buyer.")}>
                    Approve determination (owner)
                  </Button>
                </>
              )}
            </div>
          )}
          {period.unreachableApprovedBy && (
            <p className="mt-2 text-[12px] text-slate-600">Approved by {byId(db.users, period.unreachableApprovedBy)?.name} on {dateLong(period.unreachableApprovedAt)}.</p>
          )}
        </div>
      )}

      <ConsentModal decision={recording} onClose={() => setRecording(undefined)} property={property} period={period} sellerName={sellerName} />
      <AttemptModal open={attempt} onClose={() => setAttempt(false)} property={property} period={period} />
    </Card>
  );
}

function ConsentModal({ decision, onClose, property, period, sellerName }: { decision?: "granted" | "refused"; onClose: () => void; property: Property; period: OwnershipPeriod; sellerName?: string }) {
  const [f, setF] = useState({ at: todayInput(), channel: "Signed letter", spokeTo: sellerName ?? "" });
  const [errors, setErrors] = useState<Errors>({});
  if (!decision) return null;
  const save = () => {
    const res = act(recordConsent, property.id, period.id, decision, { at: fromDateInput(f.at) ?? "", channel: f.channel, spokeTo: f.spokeTo });
    if (!res.ok) return setErrors({ [res.field ?? "_"]: res.error });
    toast.success(decision === "granted" ? "Seller consent recorded" : "Seller refusal recorded", decision === "granted" ? "Predecessor history is now shared on the buyer's link." : "Everything is withheld, including specification-only detail.");
    onClose();
  };
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} size="sm" title={decision === "granted" ? "Record written seller consent" : "Record seller refusal"} description="Predecessor history requires written seller consent, recorded with the date, the channel and who the office spoke to." footer={<><Button onClick={onClose}>Cancel</Button><Button variant={decision === "granted" ? "success" : "dark"} onClick={save}>Record {decision === "granted" ? "consent" : "refusal"}</Button></>}>
      <div className="space-y-3">
        <Field label="Date" required error={errors.at}><Input type="date" value={f.at} max={todayInput()} invalid={!!errors.at} onChange={(e) => setF({ ...f, at: e.target.value })} /></Field>
        <Field label="Channel" required error={errors.channel}>
          <Select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>
            {["Signed letter", "Email", "Phone call (written follow-up)", "In person"].map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Spoke to" required error={errors.spokeTo}><Input value={f.spokeTo} invalid={!!errors.spokeTo} onChange={(e) => setF({ ...f, spokeTo: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function AttemptModal({ open, onClose, property, period }: { open: boolean; onClose: () => void; property: Property; period: OwnershipPeriod }) {
  const [f, setF] = useState({ at: todayInput(), channel: "letter" as "phone" | "email" | "letter" | "text", note: "" });
  const [errors, setErrors] = useState<Errors>({});
  const save = () => {
    const res = act(logConsentAttempt, property.id, period.id, { ...f, at: fromDateInput(f.at) ?? "" });
    if (!res.ok) return setErrors({ [res.field ?? "_"]: res.error });
    toast.success("Contact attempt logged");
    setF({ at: todayInput(), channel: "letter", note: "" });
    setErrors({});
    onClose();
  };
  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} size="sm" title="Log seller contact attempt" description="Unreachable means three documented attempts over 14 days across at least two channels." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Log attempt</Button></>}>
      <div className="space-y-3">
        <Field label="Date" required error={errors.at}><Input type="date" value={f.at} max={todayInput()} invalid={!!errors.at} onChange={(e) => setF({ ...f, at: e.target.value })} /></Field>
        <Field label="Channel" required>
          <Select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value as typeof f.channel })}>
            <option value="phone">Phone</option><option value="email">Email</option><option value="letter">Letter</option><option value="text">Text</option>
          </Select>
        </Field>
        <Field label="What happened" required error={errors.note}><Textarea value={f.note} invalid={!!errors.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Letter posted to forwarding address." /></Field>
      </div>
    </Modal>
  );
}

/* ------------------------------ Sale -------------------------------- */

function SaleModal({ open, onClose, property }: { open: boolean; onClose: () => void; property: Property }) {
  const db = useDb((d) => d);
  const current = currentOwnership(property);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [f, setF] = useState({ saleDate: todayInput(), customerId: "", name: "", email: "", phone: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [confirm, setConfirm] = useState(false);
  const oldLink = db.qrLinks.find((l) => l.ownershipPeriodId === current.id && !l.revokedAt);
  const others = db.customers.filter((c) => c.id !== current.customerId && !c.personalDataDeleted);

  const run = () => {
    const res = act(recordOwnershipChange, property.id, {
      saleDate: fromDateInput(f.saleDate) ?? "",
      buyerCustomerId: mode === "existing" ? f.customerId || "__none" : undefined,
      buyer: mode === "new" ? { name: f.name, email: f.email, phone: f.phone } : undefined,
    });
    if (!res.ok) {
      setErrors({ [res.field ?? "_"]: res.error });
      return;
    }
    toast.success("Ownership changed", `${res.value?.revoked ? `Old link revoked, ` : ""}former-owner PDF issued, new link issued for ${res.value?.buyer}.`);
    setErrors({});
    onClose();
  };

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(v) => !v && onClose()}
        title="Record ownership change"
        description={`${byId(db.customers, current.customerId)?.name} sells ${property.address}.`}
        footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => setConfirm(true)}>Record sale</Button></>}
      >
        <div className="space-y-4">
          <Field label="Sale date" required error={errors.saleDate}><Input type="date" value={f.saleDate} max={todayInput()} invalid={!!errors.saleDate} onChange={(e) => setF({ ...f, saleDate: e.target.value })} /></Field>
          <PillTabs value={mode} onChange={setMode} options={[{ value: "new", label: "New buyer" }, { value: "existing", label: "Existing customer" }]} />
          {mode === "new" ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Buyer name" required error={errors.buyerName}><Input value={f.name} invalid={!!errors.buyerName} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <Field label="Email" error={errors.buyerEmail}><Input type="email" value={f.email} invalid={!!errors.buyerEmail} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
              <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            </div>
          ) : (
            <Field label="Buyer" required error={errors.buyer}>
              <Select value={f.customerId} invalid={!!errors.buyer} onChange={(e) => setF({ ...f, customerId: e.target.value })}>
                <option value="">Choose a customer…</option>
                {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          )}
          <div className="rounded-xl border border-line bg-slate-50 p-3 text-[12.5px] text-slate-700">
            <div className="mb-1 font-semibold text-ink">What happens, in this order</div>
            <ol className="list-decimal space-y-0.5 pl-5">
              <li>{oldLink ? <>Old link <code className="text-[11.5px]">{oldLink.ref}</code> is revoked. Its printed code shows “Record has moved”.</> : "No active link to revoke."}</li>
              <li>The former owner receives a permanent PDF. It never updates.</li>
              <li>The buyer&apos;s ownership period starts. Predecessor history stays hidden until the seller consents.</li>
              <li>A new link is issued for the buyer. A person still presses Send.</li>
            </ol>
          </div>
          {errors._ && <Banner tone="danger">{errors._}</Banner>}
        </div>
      </Modal>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Record this sale?" body="The current link is revoked immediately and cannot be reused." confirmLabel="Record sale" onConfirm={run} />
    </>
  );
}

function FormerOwnerPdfModal({ property, period, onClose }: { property: Property; period?: OwnershipPeriod; onClose: () => void }) {
  const db = useDb((d) => d);
  const ref = useRef<HTMLDivElement>(null);
  if (!period) return null;
  const record = buildCustomerRecord(db, property, period.id, { asOf: period.end });
  const owner = byId(db.customers, period.customerId);
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      size="lg"
      title="Former-owner permanent PDF"
      description={`Fixed copy for ${owner?.name}, as of ${dateLong(period.end)}. Later work never appears in it.`}
      footer={<><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => printElement(ref.current, `${property.id} former-owner record`)}><Printer className="h-4 w-4" /> Print / Save PDF</Button></>}
    >
      {period.formerOwnerPdf && <Banner tone="success" className="mb-4">Issued to {period.formerOwnerPdf.recipient} on {dateLong(period.formerOwnerPdf.issuedAt)} by {byId(db.users, period.formerOwnerPdf.issuedBy)?.name}.</Banner>}
      <div ref={ref} className="space-y-6 rounded-xl border border-line bg-white p-6">
        <RecordHeader record={record} subtitle={`Paint record as of ${dateLong(period.end)}`} />
        <RecordBody record={record} printMode />
        <RecordFooter />
      </div>
    </Modal>
  );
}

function StructureModal({ kind, onClose, property }: { kind?: "merge" | "renumber"; onClose: () => void; property: Property }) {
  const db = useDb((d) => d);
  const units = Array.from(new Set(db.areas.filter((a) => a.propertyId === property.id && a.unit).map((a) => a.unit!)));
  const candidates = db.properties.filter((p) => p.id !== property.id && !p.mergedInto && p.zip === property.zip);
  const [f, setF] = useState({ target: "", oldUnit: units[0] ?? "", newUnit: "", reason: "" });
  const [errors, setErrors] = useState<Errors>({});
  if (!kind) return null;
  const save = () => {
    const res = act(requestStructureChange, { kind, propertyId: property.id, targetPropertyId: f.target, oldUnit: f.oldUnit, newUnit: f.newUnit, reason: f.reason });
    if (!res.ok) return setErrors({ [res.field ?? "_"]: res.error });
    toast.success("Request sent to the Business Owner", "It is approved individually.");
    setErrors({});
    onClose();
  };
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} size="sm" title={kind === "merge" ? "Request property merge" : "Request unit renumber"} description="The Business Owner approves each request individually." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Send request</Button></>}>
      <div className="space-y-3">
        {kind === "merge" ? (
          <Field label={`Merge ${property.id} into`} required error={errors.targetPropertyId} hint="Candidates share the postcode. Differing units need manual review.">
            <Select value={f.target} invalid={!!errors.targetPropertyId} onChange={(e) => setF({ ...f, target: e.target.value })}>
              <option value="">Choose a property…</option>
              {candidates.map((p) => <option key={p.id} value={p.id}>{p.id} — {p.address}</option>)}
            </Select>
          </Field>
        ) : (
          <>
            <Field label="Unit" required error={errors.oldUnit}>
              <Select value={f.oldUnit} onChange={(e) => setF({ ...f, oldUnit: e.target.value })}>{units.map((u) => <option key={u}>{u}</option>)}</Select>
            </Field>
            <Field label="New unit label" required error={errors.newUnit}><Input value={f.newUnit} invalid={!!errors.newUnit} onChange={(e) => setF({ ...f, newUnit: e.target.value })} /></Field>
          </>
        )}
        <Field label="Reason" required error={errors.reason}><Textarea value={f.reason} invalid={!!errors.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        {errors._ && <Banner tone="danger">{errors._}</Banner>}
      </div>
    </Modal>
  );
}
