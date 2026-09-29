/**
 * Feature 3 — Project-Specific Color Card.
 *
 * Each exported function is one user action. It receives an Immer draft of
 * the database and the acting user, validates, then mutates the draft.
 * Validation always runs before any mutation, except blocked-attempt logging.
 */
import type { ApprovalChannel, Colour, Database, Sheen, SpecLine, User } from "@/features/types";
import { PRIMER_NONE_SOUND } from "@/features/types";
import { can, whoCan } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { byId, catalogFor, surfaceLabel } from "@/features/lib/selectors";
import { classifyChange, type ChangeDecision } from "@/features/lib/rules/change-rule";
import { denied, fail, log, nextId, ok, userName } from "../helpers";

const MODULE = "Colour Card";

function guardEdit(db: Database, actor: User, jobId: string, what: string) {
  const job = byId(db.jobs, jobId);
  if (!job) return fail("Job not found.");
  if (!can(actor, "colourCard.edit")) return denied(db, actor, MODULE, what, whoCan("colourCard.edit"));
  if (job.status === "completed" && !can(actor, "colourCard.editCompleted")) {
    return denied(db, actor, MODULE, `${what} on a completed job`, "the Business Owner or Office Manager");
  }
  return null;
}

/** Optimistic concurrency: the second conflicting save fails (feature 3). */
function checkVersion(db: Database, jobId: string, expected?: number) {
  const job = byId(db.jobs, jobId)!;
  if (expected !== undefined && job.cardRowVersion !== expected) {
    return fail("Someone else saved this card after you opened it. Reload to see their change, then try again.");
  }
  job.cardRowVersion += 1;
  return null;
}

/* ---------------------------- Colours ---------------------------- */

export interface ColourDraft {
  manufacturer: string;
  name: string;
  number: string;
  hex: string;
  tintFormula?: string;
  sampleRef?: string;
  customMatch: boolean;
}

export function addColour(db: Database, actor: User, jobId: string, draft: ColourDraft, expectedVersion?: number) {
  const blocked = guardEdit(db, actor, jobId, "add a color");
  if (blocked) return blocked;
  if (!draft.manufacturer.trim()) return fail("Manufacturer is required.", "manufacturer");
  if (!draft.name.trim()) return fail("Color name is required.", "name");
  if (!draft.number.trim()) return fail("Color number is required.", "number");
  const count = db.colours.filter((c) => c.jobId === jobId).length;
  if (count >= 25) return fail("A card supports up to 25 colors.");
  const conflict = checkVersion(db, jobId, expectedVersion);
  if (conflict) return conflict;

  const colour: Colour = {
    id: nextId(db, "colour", "COL-"),
    jobId,
    manufacturer: draft.manufacturer.trim(),
    name: draft.name.trim(),
    number: draft.number.trim(),
    hex: draft.hex || "#CBD5E1",
    tintFormula: draft.tintFormula?.trim() || undefined,
    sampleRef: draft.sampleRef?.trim() || undefined,
    customMatch: draft.customMatch,
    createdAt: now(),
    createdBy: actor.id,
  };
  db.colours.push(colour);
  log(db, actor, MODULE, `Color Card: Job ${jobId} – Color "${colour.name} ${colour.number}" (${colour.manufacturer}) added by ${actor.name}`);
  return ok(colour.id);
}

export function updateColour(db: Database, actor: User, colourId: string, draft: ColourDraft, expectedVersion?: number) {
  const colour = byId(db.colours, colourId);
  if (!colour) return fail("Color not found.");
  const blocked = guardEdit(db, actor, colour.jobId, "edit a color");
  if (blocked) return blocked;
  if (!draft.manufacturer.trim()) return fail("Manufacturer is required.", "manufacturer");
  if (!draft.name.trim()) return fail("Color name is required.", "name");
  if (!draft.number.trim()) return fail("Color number is required.", "number");
  const approved = db.specs.some((s) => s.colourId === colourId && s.state === "approved");
  if (approved && draft.number !== colour.number) {
    return fail("This color has approved specifications. Change the color through the specification editor, so the app can decide which document is needed.");
  }
  const conflict = checkVersion(db, colour.jobId, expectedVersion);
  if (conflict) return conflict;
  const changes = (["manufacturer", "name", "number", "tintFormula", "sampleRef"] as const).filter((k) => (colour[k] ?? "") !== (draft[k] ?? ""));
  Object.assign(colour, { ...draft, tintFormula: draft.tintFormula || undefined, sampleRef: draft.sampleRef || undefined });
  for (const k of changes) {
    log(db, actor, MODULE, `Color Card: Job ${colour.jobId} – ${k} on "${colour.name}" changed by ${actor.name}`);
  }
  // Marking as custom match puts its specs into Pending sample.
  if (draft.customMatch) {
    const accepted = db.sampleRounds.some((r) => r.colourId === colourId && r.outcome === "accepted");
    if (!accepted) db.specs.filter((s) => s.colourId === colourId && s.state === "draft").forEach((s) => (s.state = "pending_sample"));
  }
  return ok();
}

export function removeColour(db: Database, actor: User, colourId: string) {
  const colour = byId(db.colours, colourId);
  if (!colour) return fail("Color not found.");
  const blocked = guardEdit(db, actor, colour.jobId, "remove a color");
  if (blocked) return blocked;
  if (db.specs.some((s) => s.colourId === colourId)) return fail("Remove this color's specifications first.");
  db.colours = db.colours.filter((c) => c.id !== colourId);
  log(db, actor, MODULE, `Color Card: Job ${colour.jobId} – Color "${colour.name}" removed by ${actor.name}`);
  return ok();
}

/* ------------------------- Specifications ------------------------ */

export interface SpecDraft {
  sheen?: Sheen;
  coats?: number;
  primer?: string;
  coatSequence: string[];
  surfaceIds: string[];
  lifespanYears: number;
  lifespanReason?: string;
  productLine?: string;
  product?: string;
  tintBase?: string;
}

/** Fields required before a specification can be sent for approval. */
export function approvalGaps(spec: Pick<SpecLine, "sheen" | "coats" | "primer" | "coatSequence" | "surfaceIds">): { field: string; message: string }[] {
  const gaps: { field: string; message: string }[] = [];
  if (!spec.sheen) gaps.push({ field: "sheen", message: "Sheen is required before approval." });
  if (!spec.coats || spec.coats < 1 || !Number.isInteger(spec.coats)) gaps.push({ field: "coats", message: "Coats must be a whole number of one or more." });
  if (!spec.primer || !spec.primer.trim()) gaps.push({ field: "primer", message: `Primer needs a deliberate value. Choose "${PRIMER_NONE_SOUND}" if no primer is needed.` });
  if (!spec.coatSequence.length) gaps.push({ field: "coatSequence", message: "Coat sequence is required before approval." });
  if (!spec.surfaceIds.length) gaps.push({ field: "surfaceIds", message: "Assign at least one surface before approval." });
  return gaps;
}

/**
 * Rule 1 preview for a change to an approved spec on a signed job.
 * Returns undefined when the change is not covered by Rule 1.
 */
export function previewChange(db: Database, spec: SpecLine, draft: SpecDraft): ChangeDecision | undefined {
  const job = byId(db.jobs, spec.jobId)!;
  if (spec.state !== "approved") return undefined;
  const colour = byId(db.colours, spec.colourId)!;
  const before = catalogFor(db, spec.product);
  const after = catalogFor(db, draft.product);
  const tintedOrOrdered = db.purchaseOrders.some((po) => po.jobId === job.id && po.status !== "cancelled" && po.lines.some((l) => l.specId === spec.id));
  return classifyChange(
    { brand: before?.manufacturer ?? colour.manufacturer, productLine: spec.productLine ?? "", colour: colour.number, sheen: spec.sheen ?? "", product: spec.product ?? "", costPerGal: before?.cost.gal ?? 0 },
    { brand: after?.manufacturer ?? colour.manufacturer, productLine: draft.productLine ?? "", colour: colour.number, sheen: draft.sheen ?? "", product: draft.product ?? "", costPerGal: after?.cost.gal ?? 0 },
    { jobSigned: job.contractSigned, tintedOrOrdered, priceChanges: (before?.cost.gal ?? 0) !== (after?.cost.gal ?? 0) },
  );
}

export function saveSpec(db: Database, actor: User, input: { jobId: string; colourId: string; specId?: string; draft: SpecDraft; expectedVersion?: number }) {
  const { jobId, colourId, specId, draft } = input;
  const blocked = guardEdit(db, actor, jobId, specId ? "edit a specification" : "add a specification");
  if (blocked) return blocked;
  const job = byId(db.jobs, jobId)!;
  const colour = byId(db.colours, colourId);
  if (!colour) return fail("Color not found.");
  if (draft.coats !== undefined && (!Number.isInteger(draft.coats) || draft.coats < 1)) return fail("Coats must be a whole number of one or more.", "coats");
  const surfacesOnCard = new Set(db.specs.filter((s) => s.jobId === jobId).flatMap((s) => s.surfaceIds));
  if (surfacesOnCard.size + draft.surfaceIds.length > 200) return fail("A card supports approximately 200 surfaces.");

  const existing = specId ? byId(db.specs, specId) : undefined;
  if (specId && !existing) return fail("Specification not found.");

  // Lifespan rules (feature 3 Access Validations).
  const defaultLife = existing?.lifespanYears ?? draft.lifespanYears;
  if (existing && draft.lifespanYears !== existing.lifespanYears) {
    if (existing.lifespanLocked && actor.role !== "owner") {
      log(db, actor, MODULE, `Blocked: ${actor.name} tried to change an owner-locked lifespan on ${existing.id}.`, true);
      return fail("Lifespan is locked by an owner override. Only the Business Owner can change it.", "lifespan");
    }
    if (actor.role !== "owner" && (existing.state !== "draft" && existing.state !== "pending_sample")) {
      return fail("Estimators may change lifespan only on a draft, before customer approval.", "lifespan");
    }
    if (actor.role !== "owner" && !draft.lifespanReason?.trim()) return fail("Give a reason for the lifespan change.", "lifespanReason");
  }

  // Rule 1 on approved specs of signed jobs.
  if (existing?.state === "approved") {
    const decision = previewChange(db, existing, draft);
    if (decision?.kind === "change_order") return fail(`${decision.reason} Use "Create change order" instead of saving.`);
    if (decision?.kind === "office_approval" && !["office_manager", "owner"].includes(actor.role)) {
      return fail("This change is approved by the Office Manager alone. Ask the Office Manager to save it.");
    }
  }

  const conflict = checkVersion(db, jobId, input.expectedVersion);
  if (conflict) return conflict;
  const t = now();

  if (!existing) {
    const spec: SpecLine = {
      id: nextId(db, "spec", "SPEC-"),
      jobId,
      colourId,
      sheen: draft.sheen,
      coats: draft.coats,
      primer: draft.primer || undefined,
      coatSequence: draft.coatSequence,
      surfaceIds: draft.surfaceIds,
      lifespanYears: draft.lifespanYears,
      lifespanLocked: false,
      productLine: draft.productLine || undefined,
      product: draft.product || undefined,
      tintBase: draft.tintBase || undefined,
      state: colour.customMatch && !db.sampleRounds.some((r) => r.colourId === colourId && r.outcome === "accepted") ? "pending_sample" : "draft",
      referencedBy: [],
      createdAt: t,
      updatedAt: t,
    };
    db.specs.push(spec);
    log(
      db,
      actor,
      MODULE,
      `Color Card: Job ${jobId} – Specification added under "${colour.name}": sheen ${spec.sheen ?? "—"}, ${spec.coats ?? "—"} coats, surfaces ${spec.surfaceIds.map((s) => surfaceLabel(db, s)).join(", ") || "none"}, by ${actor.name}`,
    );
    return ok(spec.id);
  }

  // Update — log every changed field, only this line changes (walls vs trim rule).
  const fields: (keyof SpecDraft)[] = ["sheen", "coats", "primer", "productLine", "product", "tintBase"];
  for (const f of fields) {
    const oldV = String(existing[f as keyof SpecLine] ?? "");
    const newV = String(draft[f] ?? "");
    if (oldV !== newV) log(db, actor, MODULE, `Color Card: Job ${jobId} – ${f} on "${colour.name}" changed from "${oldV || "—"}" to "${newV || "—"}" by ${actor.name}.`);
  }
  if (draft.lifespanYears !== defaultLife) {
    log(db, actor, MODULE, `Color Card: Job ${jobId} – Lifespan on "${colour.name}" changed from ${defaultLife} to ${draft.lifespanYears} by ${actor.name}. Reason: ${draft.lifespanReason || "owner change"}`);
  }
  const wasApproved = existing.state === "approved";
  Object.assign(existing, {
    sheen: draft.sheen,
    coats: draft.coats,
    primer: draft.primer || undefined,
    coatSequence: draft.coatSequence,
    surfaceIds: draft.surfaceIds,
    lifespanYears: draft.lifespanYears,
    productLine: draft.productLine || undefined,
    product: draft.product || undefined,
    tintBase: draft.tintBase || undefined,
    updatedAt: t,
  });

  // Changed approved selection: flag linked orders, never cancel them.
  if (wasApproved) {
    const linked = db.purchaseOrders.filter((po) => po.jobId === jobId && po.status !== "cancelled" && po.lines.some((l) => l.specId === existing.id));
    for (const po of linked) {
      db.commitmentFlags.push({
        id: nextId(db, "flag", "FLAG-"),
        jobId,
        specId: existing.id,
        poId: po.id,
        message: `Approved selection "${colour.name}" changed. Order ${po.id} and the work order are flagged. The order was not canceled.`,
        responsibleUserId: actor.id,
        createdAt: t,
      });
      log(db, actor, MODULE, `Color Card: Job ${jobId} – Changed selection flagged order ${po.id} and work order. Buyer ${userName(db, "U-OFFICE")} and crew lead ${userName(db, job.crewLeadId)} notified. Responsible caller: ${actor.name}`);
    }
  }
  return ok(existing.id);
}

export function duplicateSpec(db: Database, actor: User, specId: string) {
  const spec = byId(db.specs, specId);
  if (!spec) return fail("Specification not found.");
  const blocked = guardEdit(db, actor, spec.jobId, "duplicate a specification");
  if (blocked) return blocked;
  const t = now();
  const copy: SpecLine = { ...spec, id: nextId(db, "spec", "SPEC-"), surfaceIds: [], state: "draft", approvedVersion: undefined, referencedBy: [], lifespanLocked: false, createdAt: t, updatedAt: t };
  db.specs.push(copy);
  byId(db.jobs, spec.jobId)!.cardRowVersion += 1;
  log(db, actor, MODULE, `Color Card: Job ${spec.jobId} – Specification ${spec.id} duplicated as ${copy.id} by ${actor.name}`);
  return ok(copy.id);
}

/** Delete, blocked while referenced unless reassigned or set unresolved. */
export function removeSpec(db: Database, actor: User, specId: string, resolution?: { kind: "reassign"; targetSpecId: string } | { kind: "unresolved" }) {
  const spec = byId(db.specs, specId);
  if (!spec) return fail("Specification not found.");
  const blocked = guardEdit(db, actor, spec.jobId, "remove a specification");
  if (blocked) return blocked;
  if (spec.referencedBy.length && !resolution) {
    return fail(`This specification is referenced by ${spec.referencedBy.join(", ").replace(/_/g, " ")}. Reassign the reference or set it to unresolved first.`);
  }
  if (resolution?.kind === "reassign") {
    const target = byId(db.specs, resolution.targetSpecId);
    if (!target) return fail("Choose a specification to reassign to.");
    target.referencedBy = Array.from(new Set([...target.referencedBy, ...spec.referencedBy]));
    db.purchaseOrders.forEach((po) => po.lines.forEach((l) => l.specId === specId && (l.specId = target.id)));
  }
  db.specs = db.specs.filter((s) => s.id !== specId);
  byId(db.jobs, spec.jobId)!.cardRowVersion += 1;
  const target = resolution?.kind === "reassign" ? resolution.targetSpecId : resolution?.kind === "unresolved" ? "Unresolved" : "—";
  log(db, actor, MODULE, `Color Card: Job ${spec.jobId} – Specification ${specId} removed by ${actor.name}. Reassigned to: ${target}`);
  return ok();
}

/* ----------------------------- Samples --------------------------- */

export function addSampleRound(db: Database, actor: User, colourId: string, input: { date: string; deliveredBy: string; note?: string }) {
  const colour = byId(db.colours, colourId);
  if (!colour) return fail("Color not found.");
  const blocked = guardEdit(db, actor, colour.jobId, "record a sample round");
  if (blocked) return blocked;
  if (!input.date) return fail("Sample date is required.", "date");
  if (!input.deliveredBy) return fail("Who delivered the sample is required.", "deliveredBy");
  const open = db.sampleRounds.find((r) => r.colourId === colourId && !r.outcome);
  if (open) return fail(`Round ${open.round} has no outcome yet. Record it first.`);
  const round = db.sampleRounds.filter((r) => r.colourId === colourId).length + 1;
  db.sampleRounds.push({ id: nextId(db, "sample", "SR-"), colourId, round, date: input.date, deliveredBy: input.deliveredBy, note: input.note });
  db.specs.filter((s) => s.colourId === colourId && s.state === "draft").forEach((s) => (s.state = "pending_sample"));
  log(db, actor, MODULE, `Sample = Color Card: Job ${colour.jobId} – Custom sample "Round ${round}" recorded ${input.date.slice(0, 10)}, delivered by ${userName(db, input.deliveredBy)}`);
  return ok();
}

export function recordSampleOutcome(db: Database, actor: User, roundId: string, outcome: "accepted" | "rejected", note?: string) {
  const round = byId(db.sampleRounds, roundId);
  if (!round) return fail("Sample round not found.");
  const colour = byId(db.colours, round.colourId)!;
  const blocked = guardEdit(db, actor, colour.jobId, "record a sample outcome");
  if (blocked) return blocked;
  if (round.outcome) return fail("Outcomes are kept permanently and can't be overwritten. Add a new round instead.");
  round.outcome = outcome;
  round.note = note || round.note;
  if (outcome === "accepted") {
    db.specs.filter((s) => s.colourId === colour.id && s.state === "pending_sample").forEach((s) => (s.state = "draft"));
  }
  log(db, actor, MODULE, `Sample = Color Card: Job ${colour.jobId} – Custom sample round ${round.round} outcome ${outcome}, recorded by ${actor.name}`);
  return ok();
}

/* ----------------------------- Approval -------------------------- */

export function sendForApproval(db: Database, actor: User, jobId: string, specIds: string[], channel: ApprovalChannel) {
  const blocked = guardEdit(db, actor, jobId, "send colors for approval");
  if (blocked) return blocked;
  if (specIds.length === 0) return fail("Select at least one specification.");
  for (const id of specIds) {
    const spec = byId(db.specs, id);
    if (!spec) return fail("Specification not found.");
    if (spec.state === "pending_sample") return fail(`${spec.id} is waiting on a custom sample. It can't be approved yet.`);
    const gaps = approvalGaps(spec);
    if (gaps.length) return fail(`${spec.id}: ${gaps[0].message}`, gaps[0].field);
  }
  const job = byId(db.jobs, jobId)!;
  db.colourApprovals.push({ id: nextId(db, "approval", "CA-"), jobId, cardVersion: job.cardVersion, specIds, channel, sentAt: now(), sentBy: actor.id, status: "sent" });
  specIds.forEach((id) => (byId(db.specs, id)!.state = "sent"));
  log(db, actor, MODULE, `Color Card: Job ${jobId} v${job.cardVersion} – Specifications ${specIds.join(", ")} sent for approval via ${channel} by ${actor.name}`);
  return ok();
}

/**
 * Record the customer's reply. The customer may approve only some of the
 * sent specifications; the rest stay "Sent for approval" (body ≠ trim).
 */
export function recordCustomerApproval(db: Database, actor: User, approvalId: string, input: { signer: string; approvedSpecIds: string[]; senderAddress: string }) {
  const approval = byId(db.colourApprovals, approvalId);
  if (!approval) return fail("Approval not found.");
  if (!input.signer.trim()) return fail("Signer name is required.", "signer");
  if (!input.senderAddress.trim()) return fail("Sender address is required as evidence.", "senderAddress");
  if (input.approvedSpecIds.length === 0) return fail("Select the specifications the customer approved.");
  const job = byId(db.jobs, approval.jobId)!;
  if (approval.cardVersion !== job.cardVersion) return fail("This approval was sent for an earlier card version. Send the current version instead.");
  const t = now();
  input.approvedSpecIds.forEach((id) => {
    const s = byId(db.specs, id);
    if (s) {
      s.state = "approved";
      s.approvedVersion = job.cardVersion;
    }
  });
  if (input.approvedSpecIds.length === approval.specIds.length) {
    approval.status = "approved";
    approval.signer = input.signer;
    approval.approvedAt = t;
    approval.senderAddress = input.senderAddress;
  } else {
    // Split: record an approved approval for the subset, leave the rest sent.
    approval.specIds = approval.specIds.filter((id) => !input.approvedSpecIds.includes(id));
    db.colourApprovals.push({ ...approval, id: nextId(db, "approval", "CA-"), specIds: input.approvedSpecIds, status: "approved", signer: input.signer, approvedAt: t, senderAddress: input.senderAddress });
  }
  log(db, actor, MODULE, `Approval = Color Card: Job ${job.id} v${job.cardVersion} – Specifications ${input.approvedSpecIds.join(", ")} approved by ${input.signer} via ${approval.channel} at ${new Date(t).toLocaleString()}. Sender: ${input.senderAddress}`);
  return ok();
}

/** New card version: snapshot the old one; the new one inherits no signature. */
export function createNewVersion(db: Database, actor: User, jobId: string) {
  const blocked = guardEdit(db, actor, jobId, "create a new card version");
  if (blocked) return blocked;
  const job = byId(db.jobs, jobId)!;
  db.cardSnapshots.push({
    jobId,
    version: job.cardVersion,
    createdAt: now(),
    createdBy: actor.id,
    colours: JSON.parse(JSON.stringify(db.colours.filter((c) => c.jobId === jobId))),
    specs: JSON.parse(JSON.stringify(db.specs.filter((s) => s.jobId === jobId))),
  });
  job.cardVersion += 1;
  job.cardRowVersion += 1;
  db.specs.filter((s) => s.jobId === jobId && (s.state === "approved" || s.state === "sent")).forEach((s) => (s.state = "draft"));
  log(db, actor, MODULE, `Color Card: Job ${jobId} – Version ${job.cardVersion} created by ${actor.name}. Previous signatures stay with v${job.cardVersion - 1}.`);
  return ok(job.cardVersion);
}

export function confirmStoreCall(db: Database, actor: User, flagId: string) {
  const flag = byId(db.commitmentFlags, flagId);
  if (!flag) return fail("Flag not found.");
  if (flag.responsibleUserId !== actor.id && !["owner", "office_manager"].includes(actor.role)) {
    return fail(`Only ${userName(db, flag.responsibleUserId)} (who made the change) or the office can confirm the store call.`);
  }
  flag.storeCallConfirmedAt = now();
  log(db, actor, MODULE, `Follow-up = Color Card: Job ${flag.jobId} – Store call confirmation recorded by ${actor.name} at ${new Date().toLocaleString()}`);
  return ok();
}

/** Owner-only: lock a lifespan override against later estimator edits. */
export function toggleLifespanLock(db: Database, actor: User, specId: string) {
  const spec = byId(db.specs, specId);
  if (!spec) return fail("Specification not found.");
  if (!can(actor, "colourCard.lockLifespan")) return denied(db, actor, MODULE, "lock a lifespan override", "the Business Owner");
  spec.lifespanLocked = !spec.lifespanLocked;
  log(db, actor, MODULE, `Color Card: Job ${spec.jobId} – Lifespan on ${spec.id} ${spec.lifespanLocked ? "locked" : "unlocked"} by ${actor.name}`);
  return ok();
}

/** Demo helper: pretend another user saved the card, to show the version check. */
export function simulateConcurrentSave(db: Database, _actor: User, jobId: string) {
  const job = byId(db.jobs, jobId);
  if (!job) return fail("Job not found.");
  job.cardRowVersion += 1;
  return ok();
}

/** Create a change order draft from a blocked Rule 1 change (feature 3 → 24). */
export function createChangeOrderFromSpec(db: Database, actor: User, specId: string, draft: SpecDraft, reason: string) {
  const spec = byId(db.specs, specId);
  if (!spec) return fail("Specification not found.");
  const job = byId(db.jobs, spec.jobId)!;
  const colour = byId(db.colours, spec.colourId)!;
  const n = db.changeOrders.filter((c) => c.jobId === job.id).length + 1;
  const id = `CO-${job.id.replace("JOB-", "")}-${String(n).padStart(2, "0")}`;
  const before = catalogFor(db, spec.product);
  const after = catalogFor(db, draft.product);
  const sqft = spec.surfaceIds.reduce((a, s) => a + (byId(db.surfaces, s)?.areaSqft ?? 0), 0);
  const gallons = (sqft * (spec.coats ?? 2)) / (after?.spreadRate ?? 350);
  const delta = Math.round(((after?.cost.gal ?? 0) - (before?.cost.gal ?? 0)) * gallons * 100) / 100;
  db.changeOrders.push({
    id,
    jobId: job.id,
    type: "product_substitution",
    title: `${colour.name}: ${spec.productLine ?? "—"} ${spec.sheen ?? ""} → ${draft.productLine ?? "—"} ${draft.sheen ?? ""}`.trim(),
    status: "draft",
    lines: [
      { id: "L1", kind: "remove", description: `${colour.name} — ${spec.product ?? "product"} ${spec.sheen ?? ""}`, sqft, cost: 0 },
      { id: "L2", kind: "add", description: `${colour.name} — ${draft.product ?? "product"} ${draft.sheen ?? ""}`, sqft, cost: Math.max(0, delta) },
    ],
    markupPct: job.markupPct,
    taxRatePct: job.taxRatePct,
    taxDate: now(),
    createdAt: now(),
    createdBy: actor.id,
    recipientVerified: false,
    downstream: { work_order: "not_started", materials: "not_started", scheduler: "not_started", billing: "not_started" },
  });
  log(db, actor, MODULE, `Color Card: Job ${job.id} – Change order ${id} drafted from ${spec.id}. ${reason}`);
  return ok(id);
}
