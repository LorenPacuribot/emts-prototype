/**
 * NEW (feature 28) — "New Estimate from History", in the live flow.
 *
 * The live app creates an estimate only from a Scheduled lead that has no
 * estimate yet. So the button on the contact's Paint History and Job History
 * tabs first picks that lead (or books a new one), then:
 *   1. starts the repeat-estimate record (copied lines, reference actuals,
 *      inspection gate, pricing basis — the feature 28 rules);
 *   2. creates a normal draft estimate from the lead;
 *   3. copies the chosen surfaces, colours and specifications into the
 *      estimate's scope (never the approval or completion state).
 *
 * Endpoint: POST /service-locations/:id/estimates-from-history
 *   { applicationIds, leadId | newLead { scheduledAt, estimatorId }, followUpId? }
 */
import type { Database, Estimate, LeadSource, RepeatEstimate, User } from "@/features/types";
import { can, whoCan } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { byId, currentOwnership } from "@/features/lib/selectors";
import { leadEligibleForEstimate } from "@/features/lib/rules/estimate-lifecycle";
import { specLifespanDefault } from "@/features/lib/rules/lifespan";
import { createDraftEstimate } from "./estimates";
import { applyPricingMode, startRepeatEstimate } from "./future-estimate";
import { denied, fail, log, nextId, nextNumber, ok } from "../helpers";

const MODULE = "Estimates";

export interface EstimateFromHistoryInput {
  propertyId: string;
  applicationIds: string[];
  /** An existing Scheduled lead for this service location. */
  leadId?: string;
  /** Or book the estimate appointment now: this creates the lead. */
  newLead?: { scheduledAt: string; estimatorId: string; source?: LeadSource };
  followUpId?: string;
  acknowledgedOpen?: boolean;
  /** Patent 25: keep last time's prices or use current pricing; prefills every line's price. */
  pricingMode?: "current" | "previous";
}

export function startEstimateFromHistory(db: Database, actor: User, input: EstimateFromHistoryInput) {
  if (!can(actor, "repeat.build")) return denied(db, actor, MODULE, "start an estimate from history", whoCan("repeat.build"));
  if (!can(actor, "estimate.create")) return denied(db, actor, MODULE, "create an estimate", whoCan("estimate.create"));
  const property = byId(db.properties, input.propertyId);
  if (!property) return fail("Service location not found.");
  const owner = currentOwnership(property);
  if (input.applicationIds.length === 0) return fail("Select at least one surface.");

  // Validate the lead before anything is written.
  if (input.leadId) {
    const lead = byId(db.leads, input.leadId);
    if (!lead || lead.customerId !== owner.customerId) return fail("Pick a lead for this customer.", "leadId");
    if (lead.propertyId && lead.propertyId !== property.id) return fail("That lead is for another address.", "leadId");
    const notEligible = leadEligibleForEstimate(lead);
    if (notEligible) return fail(notEligible, "leadId");
  } else if (input.newLead) {
    if (!input.newLead.scheduledAt) return fail("Choose the estimate appointment date.", "scheduledAt");
    if (!byId(db.users, input.newLead.estimatorId)) return fail("Assign an estimator.", "estimatorId");
  } else {
    return fail("Every estimate starts from a scheduled lead. Pick one or book the appointment.", "leadId");
  }

  const started = startRepeatEstimate(db, actor, property.id, input.applicationIds, { followUpId: input.followUpId, acknowledgedOpen: input.acknowledgedOpen });
  if (!started.ok) return started;
  const rep = byId(db.repeatEstimates, started.value as string)!;
  if (input.pricingMode) applyPricingMode(db, actor, rep, input.pricingMode);

  let leadId = input.leadId;
  // NEW (29, D5): a follow-up already has its pipeline lead. Book the appointment on it
  // instead of opening a second lead, unless that lead already carries an estimate.
  const fuLead = byId(db.leads, byId(db.followUps, input.followUpId)?.leadId);
  if (!leadId && fuLead && !fuLead.estimateId && input.newLead) {
    fuLead.stage = "estimate_scheduled";
    fuLead.scheduledAt = input.newLead.scheduledAt;
    fuLead.assignedUserId = input.newLead.estimatorId;
    fuLead.lastActivityAt = now();
    leadId = fuLead.id;
    log(db, actor, "Leads", `Estimate appointment booked on lead ${leadId} (follow-up ${input.followUpId}) by ${actor.name}`);
  }
  if (!leadId) {
    leadId = `LEAD-${new Date(now()).getFullYear()}-${nextNumber(db, "lead")}`;
    db.leads.unshift({
      id: leadId, customerId: owner.customerId, propertyId: property.id, source: input.newLead!.source ?? (input.followUpId ? "repaint_alert" : "existing_customer"),
      stage: "estimate_scheduled", createdAt: now(), scheduledAt: input.newLead!.scheduledAt, assignedUserId: input.newLead!.estimatorId,
      note: `Repeat work from paint history (${rep.id}).`,
    });
    log(db, actor, "Leads", `Lead ${leadId} created for ${property.address} with the estimate appointment booked, by ${actor.name}`);
  }
  const lead = byId(db.leads, leadId)!;
  const estimateId = attachEstimate(db, actor, rep, leadId, lead.assignedUserId ?? actor.id);
  log(db, actor, MODULE, `Estimate ${estimateId} started from history (${rep.id}) for lead ${leadId} by ${actor.name}`);
  return ok(estimateId);
}

/** Creates the draft estimate for a repeat record and copies the scope. Also used by the seed. */
export function attachEstimate(db: Database, actor: User | undefined, rep: RepeatEstimate, leadId: string, estimatorId: string): string {
  const areas = rep.lines.map((l) => byId(db.areas, byId(db.surfaces, l.surfaceId)?.areaId));
  const kinds = new Set(areas.map((a) => a?.kind));
  const jobType = kinds.size > 1 ? "mixed" : kinds.has("exterior") ? "exterior_repaint" : "interior_repaint";
  const estimateId = createDraftEstimate(db, actor, { leadId, title: rep.title?.replace(/^Repeat Estimate — /, "Repaint — ") ?? "Repaint", estimatorId, jobType });
  const est = byId(db.estimates, estimateId)!;
  est.repeatEstimateId = rep.id;
  est.isRepaint = true;
  est.sourceJobIds = Array.from(new Set(rep.lines.map((l) => l.sourceJobId).filter(Boolean))) as string[];
  rep.estimateId = estimateId;
  syncHistoryScope(db, rep, est);
  return estimateId;
}

/**
 * Keeps the estimate's scope in step with the repeat lines: each copied
 * surface joins the scope under a colour and specification rebuilt from the
 * last application (colour, product, sheen, coats). Approval state is never
 * copied: the new specifications start as drafts with the primer to confirm.
 */
export function syncHistoryScope(db: Database, rep: RepeatEstimate, est: Estimate) {
  const job = byId(db.jobs, est.jobId)!;
  const t = now();
  for (const line of rep.lines) {
    if (!job.surfaceIds.includes(line.surfaceId)) job.surfaceIds.push(line.surfaceId);
    if (db.specs.some((s) => s.jobId === job.id && s.surfaceIds.includes(line.surfaceId))) continue;
    const number = line.colourNumber ?? line.colourLabel;
    let colour = db.colours.find((c) => c.jobId === job.id && c.number === number);
    if (!colour) {
      colour = {
        id: nextId(db, "colour", "COL-"), jobId: job.id, manufacturer: line.manufacturer ?? "Sherwin-Williams",
        name: line.colourLabel.replace(` ${number}`, ""), number, hex: line.hex, tintFormula: line.tintFormula, customMatch: false, createdAt: t, createdBy: est.estimatorId ?? "U-EST",
      };
      db.colours.push(colour);
    }
    let spec = db.specs.find((s) => s.jobId === job.id && s.colourId === colour!.id && s.product === line.product && s.sheen === line.sheen && s.coats === line.coats);
    if (!spec) {
      spec = {
        id: nextId(db, "spec", "SPEC-"), jobId: job.id, colourId: colour.id, sheen: line.sheen === "Unknown" ? undefined : (line.sheen as never), coats: line.coats,
        coatSequence: Array.from({ length: line.coats }, (_, i) => `Finish coat ${i + 1}`), surfaceIds: [],
        lifespanYears: specLifespanDefault(db, [line.surfaceId], { manufacturer: colour.manufacturer, productLine: line.productLine, product: line.product }), lifespanLocked: false,
        productLine: line.productLine, product: line.product, state: "draft", referencedBy: [], createdAt: t, updatedAt: t,
      };
      db.specs.push(spec);
    }
    spec.surfaceIds.push(line.surfaceId);
  }
}

/** After surfaces are added to the repeat lines on the estimate page, bring them into the scope. */
export function refreshHistoryScope(db: Database, _actor: User, estimateId: string) {
  const est = byId(db.estimates, estimateId);
  const rep = est?.repeatEstimateId ? byId(db.repeatEstimates, est.repeatEstimateId) : undefined;
  if (!est || !rep) return fail("This estimate wasn't made from history.");
  syncHistoryScope(db, rep, est);
  return ok();
}
