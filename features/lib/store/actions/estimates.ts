/**
 * Estimate lifecycle, as the live app runs it (estimates/details and
 * estimates/client-preview). Each function is one endpoint:
 *
 *   createEstimateFromLead   POST /estimates                      (CreateEstimateDto, needs a Scheduled lead)
 *   saveEstimate             PUT  /estimates/:id
 *   sendEstimate             POST /estimates/:id/send
 *   markEstimateApproved     POST /estimates/:id/manual-approve
 *   amendEstimate            POST /estimates/:id/amend            (NEW rule D4: blocked once work starts)
 *   sendForReapproval        POST /estimates/:id/send-for-reapproval
 *   acceptEstimateByToken    POST /public/estimates/:token/accept
 *   declineEstimateByToken   POST /public/estimates/:token/decline
 *
 * Scope edits (areas and surfaces) are the prototype's stand-in for the
 * live form state that the page saves with PUT /estimates/:id.
 */
import type { AreaKind, Database, Estimate, EstimateHistoryEntry, Job, RoomType, SurfaceCondition, SurfaceType, User, WorkOrder } from "@/features/types";
import { can, whoCan } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { byId } from "@/features/lib/selectors";
import { addDays } from "@/features/lib/rules/dates";
import { estimateTotals } from "@/features/lib/rules/estimate";
import { estimateTotals as builderTotals } from '@/lib/calculations';
import {
  amendBlockedReason, customerCanAccept, DEFAULT_DEPOSIT_PERCENT, depositAmount, firstWorkOrderStatus, isEditable, leadEligibleForEstimate,
} from "@/features/lib/rules/estimate-lifecycle";
import { approvalGaps } from "./color-card";
import { issueBlockers, recordRepeatIssued, repPricing } from "./future-estimate";
import { denied, fail, log, nextId, nextNumber, ok, randomRef } from "../helpers";

const MODULE = "Estimates";

const year = () => new Date(now()).getFullYear();

function history(db: Database, est: Estimate, trigger: string, by: EstimateHistoryEntry["performedBy"], actor?: User, extra: Partial<EstimateHistoryEntry> = {}) {
  db.estimateHistory.push({
    id: nextId(db, "eh", "EH-"),
    estimateId: est.id,
    amendmentNumber: est.amendmentNumber ?? 0,
    trigger,
    status: est.status,
    grandTotal: est.total,
    performedBy: by,
    userId: by === "ORG_USER" ? actor?.id : undefined,
    customerName: by === "CLIENT" ? est.signatureName ?? db.customers.find((c) => c.id === est.customerId)?.name : undefined,
    changes: [],
    createdAt: now(),
    ...extra,
  });
}

/**
 * The total a draft saves: the live calculation, or for an estimate made
 * from history (feature 28) the repeat pricing basis with current tax.
 */
export function draftTotal(db: Database, est: Estimate, job: Job): number {
  const rep = est.repeatEstimateId ? byId(db.repeatEstimates, est.repeatEstimateId) : undefined;
  if (rep) return repPricing(db, rep).totals.total;
  if (est.pricingSnapshot) return builderTotals(est.pricingSnapshot).total;
  return estimateTotals(db, job).grandTotal;
}

function load(db: Database, id: string) {
  const est = byId(db.estimates, id);
  const job = est?.jobId ? byId(db.jobs, est.jobId) : undefined;
  return { est, job };
}

/** Scope edits: the estimate must be Draft or Editing Amendment and the user may edit estimates. */
function guardScope(db: Database, actor: User, estimateId: string, what: string) {
  const { est, job } = load(db, estimateId);
  if (!est || !job) return { error: fail("Estimate not found.") };
  if (!can(actor, "estimate.edit")) return { error: denied(db, actor, MODULE, what, whoCan("estimate.edit")) };
  if (!isEditable(est.status)) return { error: fail("This estimate is read-only. Use Edit, or Amend Estimate on an approved estimate.") };
  return { est, job };
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

export function createEstimateFromLead(db: Database, actor: User, input: { leadId: string; title: string; estimatorId: string; jobType?: Job["jobType"] }) {
  if (!can(actor, "estimate.create")) return denied(db, actor, MODULE, "create an estimate", whoCan("estimate.create"));
  const lead = byId(db.leads, input.leadId);
  if (!lead) return fail("Pick the lead this estimate is for.", "leadId");
  const notEligible = leadEligibleForEstimate(lead);
  if (notEligible) return fail(notEligible, "leadId");
  if (!lead.propertyId) return fail("The lead has no service address. Add one on the lead first.", "leadId");
  if (!input.title.trim()) return fail("Enter a project name.", "title");
  if (!byId(db.users, input.estimatorId)) return fail("Select an estimator.", "estimatorId");
  const estimateId = createDraftEstimate(db, actor, { leadId: lead.id, title: input.title, estimatorId: input.estimatorId, jobType: input.jobType });
  log(db, actor, MODULE, `Estimate ${estimateId} "${input.title.trim()}" created from lead ${lead.id} by ${actor.name}`);
  return ok(estimateId);
}

/** The data part of POST /estimates, without the checks (also used by the seed). */
export function createDraftEstimate(db: Database, actor: User | undefined, input: { leadId: string; title: string; estimatorId: string; jobType?: Job["jobType"] }): string {
  const lead = byId(db.leads, input.leadId)!;
  const t = now();
  const y = year();
  const jobId = `JOB-${y}-${nextNumber(db, "job")}`;
  const estimateId = `EST-${y}-${nextNumber(db, "estimate")}`;
  db.jobs.push({
    id: jobId, name: input.title.trim(), propertyId: lead.propertyId!, customerId: lead.customerId, estimateId, leadId: lead.id, status: "estimating",
    contractSigned: false, contractValue: 0, depositsCollected: 0, markupPct: 45, taxRatePct: 8.25, estimatorId: input.estimatorId, crewLeadId: "U-CREW",
    surfaceIds: [], cardVersion: 1, cardRowVersion: 0, jobType: input.jobType ?? "interior_repaint",
  });
  const est: Estimate = {
    id: estimateId, title: input.title.trim(), customerId: lead.customerId, propertyId: lead.propertyId!, leadId: lead.id, status: "DRAFT", total: 0,
    createdAt: t, estimatorId: input.estimatorId, estimateDate: t, validUntil: addDays(t, 30), jobId, publicToken: randomRef(16), amendmentNumber: 0,
  };
  db.estimates.push(est);
  lead.estimateId = estimateId;
  history(db, est, "CREATED", "ORG_USER", actor, { changes: [{ type: "item_added", entity: "Estimate", entityLabel: est.title }] });
  return estimateId;
}

/* ------------------------------------------------------------------ */
/* Header, dates, notes                                                */
/* ------------------------------------------------------------------ */

export function updateEstimateDetails(db: Database, actor: User, id: string, patch: Partial<Pick<Estimate, "title" | "estimatorId" | "validUntil" | "estimateDate" | "customerNotes" | "internalNotes">>) {
  const g = guardScope(db, actor, id, "edit this estimate");
  if (g.error) return g.error;
  if (patch.title !== undefined && !patch.title.trim()) return fail("Enter a project name.", "title");
  const estimateDate = patch.estimateDate ?? g.est.estimateDate ?? g.est.createdAt;
  const validUntil = patch.validUntil ?? g.est.validUntil;
  if (validUntil && validUntil.slice(0, 10) < estimateDate.slice(0, 10)) return fail("Valid Until must be on or after the estimate date.", "validUntil");
  Object.assign(g.est, patch);
  if (patch.title) g.job.name = patch.title.trim();
  if (patch.estimatorId) g.job.estimatorId = patch.estimatorId;
  return ok();
}

/* ------------------------------------------------------------------ */
/* Scope: Area & Line Items                                            */
/* ------------------------------------------------------------------ */

export function addEstimateArea(db: Database, actor: User, estimateId: string, input: { name: string; kind: AreaKind; roomType: RoomType }) {
  const g = guardScope(db, actor, estimateId, "add an area");
  if (g.error) return g.error;
  if (!input.name.trim()) return fail("Area Name is required.", "name");
  const id = nextId(db, "area", "AR-E");
  db.areas.push({ id, propertyId: g.job.propertyId, name: input.name.trim(), kind: input.kind, roomType: input.roomType });
  log(db, actor, MODULE, `Estimate ${estimateId} – Area "${input.name.trim()}" added by ${actor.name}`);
  return ok(id);
}

export interface ScopeSurfaceDraft {
  areaId: string;
  name: string;
  type: SurfaceType;
  areaSqft: number;
  condition: SurfaceCondition;
}

export function addScopeSurface(db: Database, actor: User, estimateId: string, draft: ScopeSurfaceDraft) {
  const g = guardScope(db, actor, estimateId, "add a line item");
  if (g.error) return g.error;
  const area = byId(db.areas, draft.areaId);
  if (!area || area.propertyId !== g.job.propertyId) return fail("Choose an area first.", "areaId");
  if (!draft.name.trim()) return fail("Item name is required.", "name");
  if (!(draft.areaSqft > 0)) return fail("Amount must be more than 0.", "areaSqft");
  const id = nextId(db, "surface", "SF-E");
  db.surfaces.push({ id, propertyId: g.job.propertyId, areaId: area.id, name: draft.name.trim(), type: draft.type, areaSqft: draft.areaSqft, condition: draft.condition });
  g.job.surfaceIds.push(id);
  log(db, actor, MODULE, `Estimate ${estimateId} – Line item "${area.name} - ${draft.name.trim()}" (${draft.areaSqft} sq ft) added by ${actor.name}`);
  return ok(id);
}

/** Add a surface already recorded at the service location (repeat work) to this estimate's scope. */
export function addExistingSurface(db: Database, actor: User, estimateId: string, surfaceId: string) {
  const g = guardScope(db, actor, estimateId, "add a line item");
  if (g.error) return g.error;
  const s = byId(db.surfaces, surfaceId);
  if (!s || s.propertyId !== g.job.propertyId || s.removedAt) return fail("Surface not found at this address.");
  if (!g.job.surfaceIds.includes(s.id)) g.job.surfaceIds.push(s.id);
  return ok();
}

export function updateScopeSurface(db: Database, actor: User, estimateId: string, surfaceId: string, patch: Partial<Pick<ScopeSurfaceDraft, "name" | "areaSqft" | "condition">>) {
  const g = guardScope(db, actor, estimateId, "edit a line item");
  if (g.error) return g.error;
  const s = byId(db.surfaces, surfaceId);
  if (!s || !g.job.surfaceIds.includes(surfaceId)) return fail("Line item not found.");
  if (patch.areaSqft !== undefined && !(patch.areaSqft > 0)) return fail("Amount must be more than 0.", "areaSqft");
  if (patch.name !== undefined && !patch.name.trim()) return fail("Item name is required.", "name");
  Object.assign(s, patch);
  return ok();
}

export function removeScopeSurface(db: Database, actor: User, estimateId: string, surfaceId: string) {
  const g = guardScope(db, actor, estimateId, "delete a line item");
  if (g.error) return g.error;
  const s = byId(db.surfaces, surfaceId);
  if (!s || !g.job.surfaceIds.includes(surfaceId)) return fail("Line item not found.");
  g.job.surfaceIds = g.job.surfaceIds.filter((id) => id !== surfaceId);
  for (const spec of db.specs.filter((x) => x.jobId === g.job.id)) spec.surfaceIds = spec.surfaceIds.filter((id) => id !== surfaceId);
  log(db, actor, MODULE, `Estimate ${estimateId} – Line item "${s.name}" deleted by ${actor.name}`);
  return ok();
}

/**
 * Live "Paint with this color" bucket: clicking a surface row assigns it to
 * the colour. In the prototype a colour's surfaces sit on its specification
 * lines, so the surface joins the colour's first specification.
 */
export function assignSurfaceColour(db: Database, actor: User, estimateId: string, surfaceId: string, colourId: string) {
  const g = guardScope(db, actor, estimateId, "assign a colour");
  if (g.error) return g.error;
  if (!g.job.surfaceIds.includes(surfaceId)) return fail("Line item not found.");
  const target = db.specs.find((s) => s.jobId === g.job.id && s.colourId === colourId && s.state !== "superseded");
  if (!target) return fail("This colour has no specification yet. Edit the colour and choose a product and sheen first.");
  for (const spec of db.specs.filter((x) => x.jobId === g.job.id && x.id !== target.id)) spec.surfaceIds = spec.surfaceIds.filter((id) => id !== surfaceId);
  if (!target.surfaceIds.includes(surfaceId)) target.surfaceIds.push(surfaceId);
  target.updatedAt = now();
  g.job.cardRowVersion += 1;
  return ok();
}

/* ------------------------------------------------------------------ */
/* Save, send, approve                                                 */
/* ------------------------------------------------------------------ */

export function saveEstimate(db: Database, actor: User, id: string) {
  const g = guardScope(db, actor, id, "save this estimate");
  if (g.error) return g.error;
  const before = g.est.total;
  const total = draftTotal(db, g.est, g.job);
  g.est.total = total;
  history(db, g.est, "UPDATED", "ORG_USER", actor, {
    changes: before !== total ? [{ type: "field_change", entity: "Estimate", entityLabel: g.est.title, field: "grandTotal", from: before, to: total }] : [],
  });
  log(db, actor, MODULE, `Estimate ${id} saved by ${actor.name}. Total ${total.toFixed(2)}`);
  return ok(total);
}

function checkSendable(db: Database, est: Estimate, job: Job) {
  if (!est.estimatorId) return "Select an estimator before sending.";
  if (job.surfaceIds.length === 0) return "Add at least one line item before sending.";
  if (!(est.total > 0)) return "Save the estimate so it has a total before sending.";
  const customer = byId(db.customers, est.customerId);
  if (!customer?.email) return "The client has no email address.";
  return undefined;
}

export function sendEstimate(db: Database, actor: User, id: string) {
  if (!can(actor, "estimate.send")) return denied(db, actor, MODULE, "send an estimate", whoCan("estimate.send"));
  const { est, job } = load(db, id);
  if (!est || !job) return fail("Estimate not found.");
  if (est.status === "AMENDED_DRAFT") return sendForReapproval(db, actor, id);
  if (!["DRAFT", "SENT", "VIEWED"].includes(est.status)) return fail("Only a draft or sent estimate can be sent.");
  // NEW (feature 28): an estimate made from history keeps its repeat rules.
  const rep = est.repeatEstimateId ? byId(db.repeatEstimates, est.repeatEstimateId) : undefined;
  if (rep && rep.status === "draft") {
    const repBlocked = issueBlockers(db, rep);
    if (repBlocked.length) return fail(`From history: ${repBlocked[0]}`);
  }
  if (est.status === "DRAFT") {
    const total = draftTotal(db, est, job);
    if (total > 0) est.total = total;
  }
  const blocked = checkSendable(db, est, job);
  if (blocked) return fail(blocked);
  est.status = "SENT";
  est.sentAt = now();
  est.publicToken = est.publicToken ?? randomRef(16);
  const lead = byId(db.leads, est.leadId);
  if (lead && lead.stage === "estimate_scheduled") lead.stage = "pending";
  history(db, est, "SENT", "ORG_USER", actor);
  if (rep && rep.status === "draft") recordRepeatIssued(db, actor, rep, est);
  const customer = byId(db.customers, est.customerId);
  log(db, actor, MODULE, `Estimate ${id} sent to ${customer?.email} by ${actor.name} (email and SMS recorded, not sent: prototype)`);
  return ok();
}

export function markEstimateApproved(db: Database, actor: User, id: string) {
  if (!can(actor, "estimate.send")) return denied(db, actor, MODULE, "approve an estimate", whoCan("estimate.send"));
  const { est, job } = load(db, id);
  if (!est || !job) return fail("Estimate not found.");
  if (!["DRAFT", "SENT", "VIEWED"].includes(est.status)) return fail("Only a draft or sent estimate can be marked approved.");
  if (job.surfaceIds.length === 0) return fail("Add at least one line item first.");
  const rep = est.repeatEstimateId ? byId(db.repeatEstimates, est.repeatEstimateId) : undefined;
  if (rep && rep.status === "draft") {
    const repBlocked = issueBlockers(db, rep);
    if (repBlocked.length) return fail(`From history: ${repBlocked[0]}`);
    recordRepeatIssued(db, actor, rep, est);
  }
  if (est.status === "DRAFT") est.total = draftTotal(db, est, job) || est.total;
  accept(db, actor, est, job, { trigger: "MANUAL_APPROVED", by: "ORG_USER", signer: `${actor.name} (manual approval)` });
  return ok();
}

/** NEW rule D4 on the live POST /estimates/:id/amend. */
export function amendEstimate(db: Database, actor: User, id: string) {
  if (!can(actor, "estimate.amend")) return denied(db, actor, MODULE, "amend an estimate", whoCan("estimate.amend"));
  const { est, job } = load(db, id);
  if (!est || !job) return fail("Estimate not found.");
  const wo = db.workOrders.find((w) => w.jobId === job.id);
  const blocked = amendBlockedReason(est, wo?.status);
  if (blocked) return fail(blocked);
  if (est.status === "ACCEPTED") est.amendmentNumber = (est.amendmentNumber ?? 0) + 1;
  est.status = "AMENDED_DRAFT";
  est.lastAmendedAt = now();
  history(db, est, "AMENDMENT_OPENED", "ORG_USER", actor, { preAmendmentTotal: est.total });
  log(db, actor, MODULE, `Estimate ${id} opened for amendment #${est.amendmentNumber} by ${actor.name}. Customer not notified.`);
  return ok();
}

export function sendForReapproval(db: Database, actor: User, id: string) {
  if (!can(actor, "estimate.amend")) return denied(db, actor, MODULE, "send for re-approval", whoCan("estimate.amend"));
  const { est, job } = load(db, id);
  if (!est || !job) return fail("Estimate not found.");
  if (est.status !== "AMENDED_DRAFT") return fail("Only an estimate being amended can be sent for re-approval.");
  // The total is whatever the amendment last saved (Save re-prices the scope).
  const before = job.contractValue;
  const blocked = checkSendable(db, est, job);
  if (blocked) return fail(blocked);
  est.status = "PENDING_REAPPROVAL";
  est.sentAt = now();
  // Live: the share link is rotated and the previous payment link is invalidated.
  est.publicToken = randomRef(16);
  history(db, est, "SENT_FOR_REAPPROVAL", "ORG_USER", actor, {
    preAmendmentTotal: job.contractValue,
    changes: before !== est.total ? [{ type: "field_change", entity: "Estimate", entityLabel: est.title, field: "grandTotal", from: before, to: est.total }] : [],
  });
  const customer = byId(db.customers, est.customerId);
  log(db, actor, MODULE, `Amended estimate ${id} sent to ${customer?.email} for re-approval by ${actor.name} (recorded, not sent: prototype)`);
  return ok();
}

/* ------------------------------------------------------------------ */
/* Public page                                                         */
/* ------------------------------------------------------------------ */

export function openPublicEstimate(db: Database, _actor: User, token: string) {
  const est = db.estimates.find((e) => e.publicToken === token);
  if (!est) return fail("This link is not valid.");
  if (est.status === "SENT") {
    est.status = "VIEWED";
    est.viewedAt = now();
    history(db, est, "VIEWED", "CLIENT");
  }
  return ok(est.id);
}

export function acceptEstimateByToken(db: Database, actor: User, token: string, input: { signatureName: string; signed: boolean; selectedOptionalIds?: string[] }) {
  const est = db.estimates.find((e) => e.publicToken === token);
  if (!est) return fail("This link is not valid.");
  const job = est.jobId ? byId(db.jobs, est.jobId) : undefined;
  if (!job) return fail("This estimate can't be accepted online.");
  if (!customerCanAccept(est.status)) return fail("This estimate can no longer be accepted.");
  if (!input.signatureName.trim()) return fail("Please enter your full name", "signatureName");
  if (!input.signed) return fail("Please sign above before accepting", "signature");
  if (input.selectedOptionalIds) {
    const snapshot = est.pricingSnapshot;
    if (!snapshot || input.selectedOptionalIds.some((id) => !snapshot.lineItems.some((l) => l.id === id && l.optional))) return fail('An optional item is no longer available. Refresh the estimate.');
    const lines = snapshot.lineItems.map((l) => l.optional ? { ...l, selected: input.selectedOptionalIds!.includes(l.id) } : l);
    const includedIds = lines.filter((l) => !l.optional || l.selected).map((l) => l.id);
    if (includedIds.some((id) => !db.surfaces.some((s) => s.id === id))) return fail('The selected scope needs review by the estimator.');
    snapshot.lineItems = lines;
    job.surfaceIds = includedIds;
    est.total = builderTotals(snapshot).total;
  }
  accept(db, actor, est, job, { trigger: "ACCEPTED", by: "CLIENT", signer: input.signatureName.trim() });
  return ok();
}

export function declineEstimateByToken(db: Database, _actor: User, token: string) {
  const est = db.estimates.find((e) => e.publicToken === token);
  if (!est) return fail("This link is not valid.");
  if (!["SENT", "VIEWED"].includes(est.status)) return fail("This estimate can no longer be declined.");
  est.status = "DECLINED";
  est.declinedAt = now();
  const lead = byId(db.leads, est.leadId);
  if (lead) lead.stage = "lost";
  history(db, est, "DECLINED", "CLIENT");
  return ok();
}

/* ------------------------------------------------------------------ */
/* Acceptance: job, work order and draft invoice                       */
/* ------------------------------------------------------------------ */

function accept(db: Database, actor: User, est: Estimate, job: Job, opts: { trigger: string; by: "ORG_USER" | "CLIENT"; signer: string }) {
  const t = now();
  const first = !job.contractSigned;
  const reapproval = est.status === "PENDING_REAPPROVAL";
  est.status = "ACCEPTED";
  est.acceptedAt = t;
  est.signatureName = opts.signer;
  job.contractValue = est.total;

  if (first) {
    job.status = "confirmed";
    job.contractSigned = true;
    job.contractSignedAt = t;
    const pct = db.financialSettings?.depositPercent ?? DEFAULT_DEPOSIT_PERCENT;
    const woStatus = firstWorkOrderStatus(pct);
    const wo: WorkOrder = {
      id: job.id.replace("JOB-", "WO-"), jobId: job.id, status: woStatus, companyResponsibilities: [], customerResponsibilities: [],
      timeEntries: [], fieldNotes: [], attachments: [], shifts: [], createdAt: t,
      statusHistory: [{ id: nextId(db, "wsh", "WSH-"), to: woStatus, by: actor.id, at: t, notes: "Created when the estimate was accepted." }],
    };
    db.workOrders.push(wo);
    if (pct > 0) {
      db.invoices.push({ id: nextId(db, "invoice", `INV-${year()}-`), jobId: job.id, kind: "standard", status: "draft", amount: depositAmount(est.total, pct), createdAt: t });
    }
  } else {
    // Live: a draft invoice is updated in place when the amendment is re-signed.
    const draft = db.invoices.find((i) => i.jobId === job.id && i.status === "draft" && i.kind === "standard");
    if (draft) draft.amount = depositAmount(est.total, db.financialSettings?.depositPercent ?? DEFAULT_DEPOSIT_PERCENT);
  }

  // NEW (feature 3): the signature is the approval evidence for every
  // complete specification on the card ("as part of the estimate PDF").
  const approvable = db.specs.filter((s) => s.jobId === job.id && (s.state === "draft" || s.state === "sent") && approvalGaps(s).length === 0);
  if (approvable.length) {
    for (const s of approvable) {
      s.state = "approved";
      s.approvedVersion = job.cardVersion;
      s.updatedAt = t;
    }
    db.colourApprovals.push({
      id: nextId(db, "approval", "CA-"), jobId: job.id, cardVersion: job.cardVersion, specIds: approvable.map((s) => s.id), channel: "estimate_pdf",
      sentAt: est.sentAt ?? t, sentBy: est.estimatorId ?? actor.id, status: "approved", signer: opts.signer, approvedAt: t,
      senderAddress: byId(db.customers, est.customerId)?.email,
    });
    log(db, actor, "Colour Card", `Approval = Colour Card: Job ${job.id} v${job.cardVersion} – Specifications ${approvable.map((s) => s.id).join(", ")} approved by ${opts.signer} with estimate ${est.id}`);
  }

  const lead = byId(db.leads, est.leadId);
  if (lead) lead.stage = "sold";
  history(db, est, opts.trigger, opts.by, actor, reapproval ? { preAmendmentTotal: undefined } : {});
  log(db, actor, MODULE, first
    ? `Estimate ${est.id} accepted by ${opts.signer}. Job ${job.id}, work order ${job.id.replace("JOB-", "WO-")} and draft deposit invoice created.`
    : `Amendment #${est.amendmentNumber} of estimate ${est.id} re-signed by ${opts.signer}. Contract value now $${est.total.toFixed(2)}.`);
}

/** Delete a draft estimate (live: DRAFT only, ESTIMATE_DELETE). Frees the lead. */
export function deleteEstimate(db: Database, actor: User, id: string) {
  if (!can(actor, "estimate.delete")) return denied(db, actor, MODULE, "delete an estimate", whoCan("estimate.delete"));
  const { est, job } = load(db, id);
  if (!est) return fail("Estimate not found.");
  if (est.status !== "DRAFT") return fail("Only a draft estimate can be deleted.");
  db.estimates = db.estimates.filter((e) => e.id !== id);
  if (job && job.status === "estimating") {
    db.jobs = db.jobs.filter((j) => j.id !== job.id);
    db.colours = db.colours.filter((c) => c.jobId !== job.id);
    db.specs = db.specs.filter((s) => s.jobId !== job.id);
  }
  const lead = byId(db.leads, est.leadId);
  if (lead && lead.estimateId === id) lead.estimateId = undefined;
  log(db, actor, MODULE, `Estimate ${id} deleted by ${actor.name}`);
  return ok();
}
