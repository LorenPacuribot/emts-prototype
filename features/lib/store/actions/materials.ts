/**
 * Feature 18 — Material Calculation And Order Generation.
 *
 * Each exported action receives an Immer draft of the database and the acting
 * user, validates first, then mutates. Figures always come from the pure rules
 * in lib/rules/procurement.ts, so the screen and the action agree.
 *
 * Tables (spec "Tables To Use"): MATERIAL_CALCULATIONS = materialCalcs,
 * MATERIAL_LINES = derived demand lines + demandAdjustments + materialOverrides,
 * SHELF_STOCK / SHELF_RESERVATIONS = shelfStock (reservedJobId),
 * PURCHASE_ORDERS / PO_LINES = purchaseOrders, RECEIPTS = receipts.
 */
import type { Database, OrderRequest, PurchaseOrder, User } from "@/features/types";
import { can, whoCan } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { byId } from "@/features/lib/selectors";
import { money } from "@/features/lib/format";
import { adjustmentNeedsApproval, packContainers } from "@/features/lib/rules/materials";
import { roundHalfUp, roundMoney } from "@/features/lib/rules/rounding";
import {
  COVERAGE_LABEL, SHELF_MAX_AGE_DAYS, branchGaps, isQuarterGallon, isStale, jobDemand, jobOrderEntries, limitCheck, lineState, nextPoNumber,
  packsCost, routeReceipt, shelfAgeDays, shelfMatches, snapshotLines, specDemand,
} from "@/features/lib/rules/procurement";
import { denied, fail, log, ok, userName } from "../helpers";

const MODULE = "Materials";
const PO_MODULE = "Supplier Orders";

/** Next free ID for a prefix, without relying on a shared counter. */
export function nextFreeId(list: { id: string }[], prefix: string): string {
  const max = list.map((x) => Number(x.id.startsWith(prefix) ? x.id.slice(prefix.length) : 0) || 0).reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${max + 1}`;
}

const pctText = (p: number) => (Number.isFinite(p) ? `${p >= 0 ? "+" : ""}${(p * 100).toFixed(1)}` : "from zero");

/* ------------------------------------------------------------------ */
/* Calculation                                                         */
/* ------------------------------------------------------------------ */

/** Accept the live calculation as the new baseline (Recalculate, 18.1). */
export function acceptRecalculation(db: Database, actor: User, jobId: string) {
  const job = byId(db.jobs, jobId);
  if (!job) return fail("Job not found.");
  if (!can(actor, "materials.approveDemand")) return denied(db, actor, MODULE, "recalculate material demand", whoCan("materials.approveDemand"));
  const lines = jobDemand(db, jobId);
  const snapshot = { jobId, calculatedAt: now(), calculatedBy: actor.id, lines: snapshotLines(lines) };
  db.materialCalcs = [...(db.materialCalcs ?? []).filter((c) => c.jobId !== jobId), snapshot];
  for (const l of lines) {
    log(db, actor, MODULE, `Materials: Job ${jobId} – Demand calculated using coverage source ${COVERAGE_LABEL[l.source].replace(" rate", "").replace("Project ", "")} at ${l.rate} sq ft/gal, waste ${Math.round(l.waste * 100)}%, by ${actor.name} (${l.specId}: ${l.calculatedNeedGal.toFixed(3)} gal)`);
  }
  return ok();
}

export function setCoverageOverride(db: Database, actor: User, jobId: string, specId: string, rate: number | null, reason: string) {
  if (!can(actor, "catalog.edit")) return denied(db, actor, MODULE, "set a project coverage override", whoCan("catalog.edit"));
  const spec = byId(db.specs, specId);
  if (!spec || spec.jobId !== jobId) return fail("Specification not found.");
  db.materialOverrides ??= [];
  if (rate === null) {
    db.materialOverrides = db.materialOverrides.filter((o) => !(o.jobId === jobId && o.specId === specId && o.kind === "coverage"));
    log(db, actor, MODULE, `Materials: Job ${jobId} – Project coverage override removed from ${specId} by ${actor.name}`);
    return ok();
  }
  if (!(rate > 0)) return fail("Coverage must be more than zero sq ft per gallon.", "rate");
  if (rate > 1000) return fail("Coverage above 1,000 sq ft per gallon is not realistic. Check the number.", "rate");
  if (!reason.trim()) return fail("Give a reason for the override.", "reason");
  db.materialOverrides.push({ id: nextFreeId(db.materialOverrides, "OVR-"), jobId, specId, kind: "coverage", value: rate, reason: reason.trim(), by: actor.id, at: now() });
  log(db, actor, MODULE, `Materials: Job ${jobId} – Project coverage override ${rate} sq ft/gal set on ${specId} by ${actor.name}. Reason: ${reason.trim()}`);
  return ok();
}

export function setWasteOverride(db: Database, actor: User, jobId: string, specId: string, pct: number | null, reason: string) {
  if (!can(actor, "materials.approveDemand")) return denied(db, actor, MODULE, "override the waste allowance", whoCan("materials.approveDemand"));
  const spec = byId(db.specs, specId);
  if (!spec || spec.jobId !== jobId) return fail("Specification not found.");
  db.materialOverrides ??= [];
  if (pct === null) {
    db.materialOverrides = db.materialOverrides.filter((o) => !(o.jobId === jobId && o.specId === specId && o.kind === "waste"));
    log(db, actor, MODULE, `Materials: Job ${jobId} – Waste override removed from ${specId} by ${actor.name}`);
    return ok();
  }
  if (!(pct >= 0) || pct > 0.5) return fail("Waste must be between 0% and 50%.", "pct");
  if (!reason.trim()) return fail("A reason is required to override the waste allowance.", "reason");
  db.materialOverrides.push({ id: nextFreeId(db.materialOverrides, "OVR-"), jobId, specId, kind: "waste", value: pct, reason: reason.trim(), by: actor.id, at: now() });
  log(db, actor, MODULE, `Materials: Job ${jobId} – Waste on ${specId} overridden to ${Math.round(pct * 100)}% by ${actor.name}. Reason: ${reason.trim()}`);
  return ok();
}

export function setPackingStrategy(db: Database, actor: User, strategy: "least_leftover" | "lowest_price") {
  if (!can(actor, "catalog.edit")) return denied(db, actor, MODULE, "change the packing objective", whoCan("catalog.edit"));
  db.procurementSettings = { packingStrategy: strategy, updatedBy: actor.id, updatedAt: now() };
  log(db, actor, MODULE, `Materials: Packing objective set to ${strategy === "least_leftover" ? "Least leftover" : "Lowest price"} by ${actor.name}`);
  return ok();
}

/* ------------------------------------------------------------------ */
/* Line adjustments (18 System Validations)                            */
/* ------------------------------------------------------------------ */

export function proposeAdjustment(db: Database, actor: User, jobId: string, specId: string, proposedGal: number, note: string) {
  if (!can(actor, "materials.approveDemand")) return denied(db, actor, MODULE, "adjust a demand line", whoCan("materials.approveDemand"));
  const spec = byId(db.specs, specId);
  if (!spec || spec.jobId !== jobId) return fail("Specification not found.");
  if (!Number.isFinite(proposedGal) || proposedGal < 0) return fail("Enter a quantity of zero or more gallons.", "proposed");
  if (!note.trim()) return fail("A note is required for every adjustment.", "note");
  if (db.demandAdjustments.some((a) => a.jobId === jobId && a.specId === specId && a.status === "pending_approval")) {
    return fail("This line already has an adjustment waiting for approval. Approve or reject it first.");
  }
  const line = specDemand(db, spec);
  const baseline = line.unroundedNeedGal;
  const { pct, needsApproval } = adjustmentNeedsApproval(baseline, proposedGal);
  const selfApprover = can(actor, "materials.approveAdjustment");
  const status = needsApproval && !selfApprover ? "pending_approval" : "applied";
  db.demandAdjustments.push({
    id: nextFreeId(db.demandAdjustments, "ADJ-"),
    jobId, specId, baselineGal: roundHalfUp(baseline, 3), proposedGal, pct: Number.isFinite(pct) ? pct : 0, note: note.trim(), by: actor.id, at: now(), status,
    approvedBy: status === "applied" ? actor.id : undefined, decidedAt: status === "applied" ? now() : undefined,
  });
  const approver = status === "applied" ? (needsApproval ? actor.name : `${actor.name} (within ±10%, self-approved)`) : "pending owner or office manager";
  log(db, actor, MODULE, `Materials: Job ${jobId} – Line ${specId} quantity changed from ${baseline.toFixed(3)} to ${proposedGal.toFixed(3)} (${pctText(pct)}%) by ${actor.name}. Note: ${note.trim()}. Approved by: ${approver}`);
  return ok(status);
}

export function decideAdjustment(db: Database, actor: User, adjId: string, approve: boolean, note = "") {
  const adj = byId(db.demandAdjustments, adjId);
  if (!adj) return fail("Adjustment not found.");
  if (!can(actor, "materials.approveAdjustment")) return denied(db, actor, MODULE, "approve a quantity adjustment", whoCan("materials.approveAdjustment"));
  if (adj.status !== "pending_approval") return fail("This adjustment has already been decided.");
  if (!approve && !note.trim()) return fail("Give a reason for rejecting.", "note");
  adj.status = approve ? "applied" : "rejected";
  adj.approvedBy = actor.id;
  adj.decidedAt = now();
  adj.decisionNote = note.trim() || undefined;
  log(db, actor, MODULE, `Materials: Job ${adj.jobId} – Line ${adj.specId} quantity changed from ${adj.baselineGal.toFixed(3)} to ${adj.proposedGal.toFixed(3)} (${pctText(adj.pct)}%) by ${userName(db, adj.by)}. Note: ${adj.note}. ${approve ? `Approved by: ${actor.name}` : `Rejected by ${actor.name}: ${note.trim()}`}`);
  return ok();
}

/* ------------------------------------------------------------------ */
/* Equipment rentals (manual rows)                                     */
/* ------------------------------------------------------------------ */

export interface RentalDraft {
  description: string;
  vendor?: string;
  days: number;
  cost?: number;
}

export function saveRental(db: Database, actor: User, jobId: string, draft: RentalDraft, rentalId?: string) {
  if (!can(actor, "materials.approveDemand")) return denied(db, actor, MODULE, "edit equipment rentals", whoCan("materials.approveDemand"));
  if (!draft.description.trim()) return fail("Describe the equipment.", "description");
  if (!Number.isInteger(draft.days) || draft.days < 1) return fail("Days must be a whole number of one or more.", "days");
  const seesPrices = can(actor, "materials.seePrices");
  if (seesPrices && draft.cost !== undefined && (!Number.isFinite(draft.cost) || draft.cost < 0)) return fail("Cost must be zero or more.", "cost");
  db.equipmentRentals ??= [];
  if (rentalId) {
    const r = byId(db.equipmentRentals, rentalId);
    if (!r) return fail("Rental row not found.");
    r.description = draft.description.trim();
    r.vendor = draft.vendor?.trim() || undefined;
    r.days = draft.days;
    if (seesPrices) r.cost = draft.cost === undefined ? undefined : roundMoney(draft.cost);
    log(db, actor, MODULE, `Materials: Job ${jobId} – Equipment rental "${r.description}" updated by ${actor.name}`);
    return ok(r.id);
  }
  const id = nextFreeId(db.equipmentRentals, "RENT-");
  db.equipmentRentals.push({ id, jobId, description: draft.description.trim(), vendor: draft.vendor?.trim() || undefined, days: draft.days, cost: seesPrices && draft.cost !== undefined ? roundMoney(draft.cost) : undefined, addedBy: actor.id, addedAt: now() });
  log(db, actor, MODULE, `Materials: Job ${jobId} – Equipment rental "${draft.description.trim()}" (${draft.days} days) added by ${actor.name}`);
  return ok(id);
}

export function removeRental(db: Database, actor: User, rentalId: string) {
  if (!can(actor, "materials.approveDemand")) return denied(db, actor, MODULE, "remove an equipment rental", whoCan("materials.approveDemand"));
  const r = byId(db.equipmentRentals ?? [], rentalId);
  if (!r) return fail("Rental row not found.");
  db.equipmentRentals = (db.equipmentRentals ?? []).filter((x) => x.id !== rentalId);
  log(db, actor, MODULE, `Materials: Job ${r.jobId} – Equipment rental "${r.description}" removed by ${actor.name}`);
  return ok();
}

/* ------------------------------------------------------------------ */
/* Leftover shelf (18.3)                                               */
/* ------------------------------------------------------------------ */

export function confirmShelf(db: Database, actor: User, input: { stockId: string; jobId: string; specId: string; measuredGal: number; checkerId: string; checkDate: string }) {
  if (!can(actor, "materials.confirmShelf")) return denied(db, actor, MODULE, "confirm shelf stock", whoCan("materials.confirmShelf"));
  const stock = byId(db.shelfStock, input.stockId);
  const spec = byId(db.specs, input.specId);
  const colour = spec && byId(db.colours, spec.colourId);
  if (!stock || !spec || !colour) return fail("Stock or specification not found.");
  if (stock.reservedJobId && stock.reservedJobId !== input.jobId) return fail(`This stock is reserved to ${stock.reservedJobId}. It can't be used here.`);
  if (stock.reservedJobId === input.jobId) return fail("This stock is already confirmed and reserved to this job.");
  if (!shelfMatches(stock, { product: spec.product, colourNumber: colour.number, sheen: spec.sheen })) return fail("Product, color and sheen must all match the line.");
  if (!stock.sealed) return fail("Only sealed containers can be confirmed.");
  if (shelfAgeDays(stock, now()) >= SHELF_MAX_AGE_DAYS) return fail("Stock two years or older can't be confirmed without a rematch.");
  if (!input.checkerId) return fail("Choose who physically checked the container.", "checker");
  if (!input.checkDate) return fail("Check date is required.", "checkDate");
  if (input.checkDate.slice(0, 10) > now().slice(0, 10)) return fail("Check date can't be in the future.", "checkDate");
  if (!isQuarterGallon(input.measuredGal)) return fail("Record the measured quantity to the nearest quarter gallon (e.g. 0.75, 1.25).", "measured");
  const capacity = { qt: 0.25, gal: 1, "5gal": 5 }[stock.containerSize];
  if (input.measuredGal > capacity) return fail(`A ${stock.containerSize === "5gal" ? "5-gallon" : stock.containerSize === "gal" ? "gallon" : "quart"} container can't hold ${input.measuredGal} gal.`, "measured");
  stock.measuredGal = input.measuredGal;
  stock.confirmedBy = input.checkerId;
  stock.checkDate = input.checkDate;
  stock.reservedJobId = input.jobId;
  stock.reservedAt = now();
  log(db, actor, MODULE, `Materials: Job ${input.jobId} – Shelf stock ${stock.id} confirmed ${input.measuredGal} gal by ${userName(db, input.checkerId)} on ${input.checkDate.slice(0, 10)}; reserved to job ${input.jobId}`);
  return ok();
}

export function rejectShelf(db: Database, actor: User, stockId: string, jobId: string, reason: string) {
  if (!can(actor, "materials.confirmShelf")) return denied(db, actor, MODULE, "reject a shelf proposal", whoCan("materials.confirmShelf"));
  const stock = byId(db.shelfStock, stockId);
  if (!stock) return fail("Stock not found.");
  if (!reason.trim()) return fail("Give a reason for rejecting the proposal.", "reason");
  stock.rejections = [...(stock.rejections ?? []).filter((r) => r.jobId !== jobId), { jobId, reason: reason.trim(), by: actor.id, at: now() }];
  log(db, actor, MODULE, `Materials: Job ${jobId} – Shelf proposal ${stockId} rejected by ${actor.name}. Reason: ${reason.trim()}`);
  return ok();
}

/** Move reserved stock to another job at transfer cost (credit A, debit B). */
export function transferShelf(db: Database, actor: User, stockId: string, toJobId: string) {
  if (!can(actor, "po.generate")) return denied(db, actor, MODULE, "transfer shelf stock between jobs", whoCan("po.generate"));
  const stock = byId(db.shelfStock, stockId);
  if (!stock || !stock.reservedJobId) return fail("Only reserved stock can be transferred.");
  if (!byId(db.jobs, toJobId)) return fail("Choose the receiving job.", "toJob");
  if (toJobId === stock.reservedJobId) return fail("The stock is already reserved to that job.", "toJob");
  const cost = roundMoney((stock.measuredGal ?? 0) * (stock.unitCostPerGal ?? 0));
  const from = stock.reservedJobId;
  stock.transfers = [...(stock.transfers ?? []), { fromJobId: from, toJobId, cost, by: actor.id, at: now() }];
  stock.reservedJobId = toJobId;
  stock.reservedAt = now();
  log(db, actor, MODULE, `Materials: Stock ${stockId} transferred from job ${from} to job ${toJobId} at ${money(cost)} by ${actor.name}`);
  return ok();
}

/* ------------------------------------------------------------------ */
/* Preliminary list, requests and order generation (18.5)              */
/* ------------------------------------------------------------------ */

export function logPreliminaryList(db: Database, actor: User, jobId: string) {
  if (!byId(db.jobs, jobId)) return fail("Job not found.");
  log(db, actor, MODULE, `Materials: Job ${jobId} – Preliminary shopping list generated by ${actor.name} (no PO number)`);
  return ok();
}

export interface OrderDraft {
  jobId: string;
  supplierId: string;
  branchId: string;
  phase: string;
  deliveryDate: string;
  fulfilment: "pickup" | "delivery";
  pickupContact?: string;
  pickupPhone?: string;
  lines: { specId: string; gallons: number }[];
}

interface Built {
  lines: { specId: string; gallons: number; packs: ReturnType<typeof packContainers> }[];
  value: number;
}

/** Shared validation for requests and generation. Returns the packed lines or an error. */
function buildOrder(db: Database, draft: OrderDraft): Built | { error: string; field?: string } {
  const job = byId(db.jobs, draft.jobId);
  if (!job) return { error: "Job not found." };
  if (!job.contractSigned) return { error: "This job is not signed. Only a preliminary shopping list is available." };
  const snapshot = (db.materialCalcs ?? []).find((c) => c.jobId === job.id);
  const demand = jobDemand(db, job.id);
  if (isStale(snapshot, demand)) return { error: "Scope or rates changed since last calculation. Recalculate before ordering." };
  const supplier = byId(db.suppliers, draft.supplierId);
  if (!supplier) return { error: "Choose a supplier.", field: "supplier" };
  const branch = byId(db.branches, draft.branchId);
  if (!branch || branch.supplierId !== supplier.id) return { error: "Choose a branch of this supplier.", field: "branch" };
  if (branch.active === false) return { error: `${branch.name} is deactivated.`, field: "branch" };
  const gaps = branchGaps(branch);
  if (gaps.length) return { error: `${branch.name} setup is incomplete (missing ${gaps.map((g) => g.label.toLowerCase()).join(", ")}). Complete setup before assigning orders.`, field: "branch" };
  if (!draft.phase.trim()) return { error: "Phase is required.", field: "phase" };
  if (!draft.deliveryDate) return { error: "Delivery or pickup date is required.", field: "deliveryDate" };
  if (draft.deliveryDate.slice(0, 10) < now().slice(0, 10)) return { error: "Delivery date can't be in the past.", field: "deliveryDate" };
  if (draft.lines.length === 0) return { error: "Select at least one line.", field: "lines" };
  const built: Built["lines"] = [];
  let value = 0;
  for (const l of draft.lines) {
    const line = demand.find((d) => d.specId === l.specId);
    if (!line) return { error: `${l.specId} is not on this job.` };
    if (line.blocked.length) return { error: `${l.specId} can't be ordered: ${line.blocked[0]}.` };
    const state = lineState(db, job.id, l.specId, line.needGal);
    if (!(l.gallons > 0)) return { error: `${l.specId}: enter a quantity above zero.` };
    if (l.gallons > state.orderableNow + 1e-9) {
      return { error: state.orderableNow === 0 && state.sentUnacknowledged > 0 ? `${l.specId}: Already ordered, awaiting acknowledgment.` : `${l.specId}: only ${state.orderableNow.toFixed(2)} gal is orderable now.` };
    }
    const packs = packContainers(l.gallons, line.catalog!.available, { strategy: db.procurementSettings?.packingStrategy, cost: line.catalog!.cost });
    value += packsCost(packs.packs, line.catalog!.cost);
    built.push({ specId: l.specId, gallons: l.gallons, packs });
  }
  return { lines: built, value: roundMoney(value) };
}

/** Limit check for the builder (pure read, used by the screen too). */
export function previewLimit(db: Database, actor: User, draft: OrderDraft) {
  const built = buildOrder(db, draft);
  if ("error" in built) return { error: built.error, field: built.field };
  return { ...limitCheck({ entries: jobOrderEntries(db, draft.jobId), newValue: built.value, orderDate: now(), requesterRole: actor.role }), lines: built.lines };
}

/** Estimator: request submission. The office generates the priced order. */
export function requestSubmission(db: Database, actor: User, draft: OrderDraft, note = "") {
  if (!can(actor, "materials.approveDemand")) return denied(db, actor, MODULE, "request order submission", whoCan("materials.approveDemand"));
  const built = buildOrder(db, draft);
  if ("error" in built) return fail(built.error, built.field);
  db.orderRequests ??= [];
  const dup = db.orderRequests.find((r) => r.jobId === draft.jobId && r.status === "requested" && r.lines.some((l) => draft.lines.some((d) => d.specId === l.specId)));
  if (dup) return fail(`${dup.id} already requests these lines and is waiting for the office. No second request was created.`);
  const result = limitCheck({ entries: jobOrderEntries(db, draft.jobId), newValue: built.value, orderDate: now(), requesterRole: actor.role });
  const req: OrderRequest = {
    id: nextFreeId(db.orderRequests, "REQ-"),
    jobId: draft.jobId, supplierId: draft.supplierId, branchId: draft.branchId, phase: draft.phase.trim(), deliveryDate: draft.deliveryDate, fulfilment: draft.fulfilment,
    lines: built.lines.map((l) => ({ specId: l.specId, gallons: l.gallons, packs: l.packs.packs })),
    requestedBy: actor.id, requestedAt: now(), note: note.trim() || undefined,
    limit: { ...result, checkedAt: now() }, status: "requested",
  };
  db.orderRequests.push(req);
  const needs = result.needs === "none" ? "office to generate" : result.needs === "office_manager" ? "office manager approval" : "owner approval";
  log(db, actor, MODULE, `Materials: Job ${draft.jobId} – Submission request ${req.id} by ${actor.name}. Limit check ${result.estimatorPass ? "Pass" : "Fail"}; routed for ${needs}.`);
  return ok(req.id);
}

export function rejectRequest(db: Database, actor: User, requestId: string, note: string) {
  if (!can(actor, "po.generate")) return denied(db, actor, MODULE, "reject an order request", whoCan("po.generate"));
  const req = byId(db.orderRequests ?? [], requestId);
  if (!req || req.status !== "requested") return fail("Request not found or already decided.");
  if (!note.trim()) return fail("Give a reason so the estimator knows what to change.", "note");
  req.status = "rejected";
  req.decidedBy = actor.id;
  req.decidedAt = now();
  req.note = `${req.note ? req.note + " · " : ""}Rejected: ${note.trim()}`;
  log(db, actor, MODULE, `Materials: Job ${req.jobId} – Submission request ${req.id} rejected by ${actor.name}. Reason: ${note.trim()}`);
  return ok();
}

/**
 * Owner / office manager: generate the priced order. Idempotent: a repeat
 * with the same generation key (or the same request) returns the existing
 * order and creates nothing.
 */
export function generateOrder(db: Database, actor: User, input: OrderDraft & { key: string; requestId?: string }) {
  const existing = db.purchaseOrders.find((p) => p.generationKey === input.key);
  if (existing) return ok(existing.id);
  const req = input.requestId ? byId(db.orderRequests ?? [], input.requestId) : undefined;
  if (req?.poId) return ok(req.poId);
  if (!can(actor, "po.generate")) return denied(db, actor, PO_MODULE, "generate a priced purchase order", whoCan("po.generate"));
  if (req && req.status !== "requested") return fail("This request was already decided.");
  const built = buildOrder(db, input);
  if ("error" in built) return fail(built.error, built.field);
  const result = limitCheck({
    entries: jobOrderEntries(db, input.jobId).filter((e) => !(req && e.createdAt === req.requestedAt && e.credits === 0 && e.value === req.limit.orderValue)),
    newValue: built.value,
    orderDate: now(),
    requesterRole: req ? byId(db.users, req.requestedBy)?.role ?? actor.role : actor.role,
  });
  if (result.needs === "owner" && actor.role !== "owner") {
    return fail(`Lifetime job purchasing would reach ${money(result.lifetimeTotal)}, above $3,000. Owner approval is required before generation. Route it to the owner.`, "owner");
  }
  const t = now();
  const id = nextPoNumber(db, input.jobId);
  const job = byId(db.jobs, input.jobId)!;
  const po: PurchaseOrder = {
    id, jobId: input.jobId, supplierId: input.supplierId, branchId: input.branchId, phase: input.phase.trim(), deliveryDate: input.deliveryDate, originalDeliveryDate: input.deliveryDate,
    status: "issued", createdAt: t, createdBy: actor.id, approvedBy: actor.id, destinationConfirmed: false,
    fulfilment: input.fulfilment, pickupContact: input.pickupContact?.trim() || userName(db, job.crewLeadId), pickupPhone: input.pickupPhone?.trim() || undefined,
    generationKey: input.key, requestId: req?.id,
    lines: built.lines.map((l, i) => {
      const line = specDemand(db, byId(db.specs, l.specId)!);
      const cost = packsCost(l.packs.packs, line.catalog!.cost);
      const unit = l.packs.totalGal > 0 ? cost / l.packs.totalGal : 0;
      const colour = byId(db.colours, line.spec.colourId);
      return {
        id: `L${i + 1}`, specId: l.specId, description: `${line.colourName} ${line.colourNumber}`.trim(), product: line.spec.product!, colourLabel: `${line.colourName} ${line.colourNumber}`.trim(),
        manufacturer: line.catalog!.manufacturer || colour?.manufacturer, productLine: line.spec.productLine, colourName: line.colourName, colourNumber: line.colourNumber, tintBase: line.spec.tintBase,
        sheen: line.spec.sheen ?? "", packs: l.packs.packs, gallons: l.packs.totalGal, unitCostPerGal: unit, approvedCostPerGal: unit, status: "open",
        receivedGal: 0, cancelledGal: 0, returnedGal: 0, creditAmount: 0, tintFormula: colour?.tintFormula,
        allocations: [{ jobId: input.jobId, surfaceIds: line.spec.surfaceIds }],
      };
    }),
    limitCheck: { ...result, checkedAt: t },
    approvedTotal: built.value,
    events: [{ at: t, by: actor.id, text: req ? `Order generated from ${req.id} (requested by ${userName(db, req.requestedBy)}).` : "Order generated from approved demand." }],
  };
  db.purchaseOrders.push(po);
  if (req) {
    req.status = "generated";
    req.poId = id;
    req.decidedBy = actor.id;
    req.decidedAt = t;
  }
  const branch = byId(db.branches, input.branchId)!;
  const supplier = byId(db.suppliers, input.supplierId)!;
  log(db, actor, PO_MODULE, `Purchase Order ${id} generated for job ${input.jobId}, supplier ${supplier.name}, branch ${branch.name} (${branch.storeNumber}), total ${money(built.value)} by ${actor.name}`);
  log(db, actor, PO_MODULE, `Purchase Order ${id} – Limit check ${result.needs === "none" ? "Pass" : "Fail"} at ${money(built.value)}; approved by ${actor.name}. Rolling seven-day job total: ${money(result.windowTotal)}`);
  return ok(id);
}

/* ------------------------------------------------------------------ */
/* Receiving (18.Q04)                                                  */
/* ------------------------------------------------------------------ */

export function receiveLine(db: Database, actor: User, poId: string, lineId: string, qty: number) {
  if (!can(actor, "po.receive")) return denied(db, actor, PO_MODULE, "record a receipt", whoCan("po.receive"));
  const po = byId(db.purchaseOrders, poId);
  const line = po?.lines.find((l) => l.id === lineId);
  if (!po || !line) return fail("Order line not found.");
  if (!po.ackAt) return fail("The supplier hasn't acknowledged this order. Record the acknowledgment before receiving.");
  if (!(qty > 0)) return fail("Enter the quantity received, above zero.", "qty");
  if (!isQuarterGallon(qty)) return fail("Record received quantity to the nearest quarter gallon.", "qty");
  const ordered = line.gallons - line.cancelledGal;
  const route = routeReceipt(ordered, line.receivedGal, qty);
  const needsApproval = route.overGal > 0 && !can(actor, "po.approveOverReceipt");
  db.receipts ??= [];
  const id = nextFreeId(db.receipts, "RCPT-");
  db.receipts.push({
    id, poId, lineId, jobId: po.jobId, qtyGal: qty, orderedGal: ordered, at: now(), by: actor.id, overGal: route.overGal, toJobCostGal: route.toJobCostGal, toShelfGal: route.toShelfGal,
    status: route.overGal > 0 ? (needsApproval ? "pending_approval" : "approved") : "recorded", approvedBy: route.overGal > 0 && !needsApproval ? actor.id : undefined,
  });
  line.receivedGal = roundHalfUp(line.receivedGal + qty, 3);
  if (line.receivedGal + 1e-9 >= ordered) line.status = "picked_up";
  else line.status = "partially_filled";
  po.events.push({ at: now(), by: actor.id, text: `Line ${lineId} received ${qty} gal (${line.receivedGal} of ${ordered}).` });
  if (route.overGal > 0 && !needsApproval) routeToShelf(db, po, line, route.toShelfGal);
  const routed = route.overGal === 0 ? "none" : route.toShelfGal > 0 ? "ShelfStock" : "JobCost";
  log(db, actor, PO_MODULE, `Purchase Order ${poId} – Line ${lineId} received ${qty} of ${ordered} by ${actor.name}. Over-receipt ${(route.overPct * 100).toFixed(1)}% routed to ${routed}${needsApproval ? " (awaiting office manager approval)" : ""}`);
  return ok(needsApproval ? "pending" : "recorded");
}

function routeToShelf(db: Database, po: PurchaseOrder, line: PurchaseOrder["lines"][number], gallons: number) {
  if (gallons <= 0) return;
  const spec = line.specId ? byId(db.specs, line.specId) : undefined;
  const colour = spec && byId(db.colours, spec.colourId);
  db.shelfStock.push({
    id: nextFreeId(db.shelfStock, "SH-"),
    product: line.product, colourName: colour?.name ?? line.colourLabel, colourNumber: colour?.number ?? "", sheen: (spec?.sheen ?? "Satin"),
    containerSize: line.packs[0]?.size ?? "gal", sealed: true, tintDate: now(), purchaseDate: now(), unitCostPerGal: line.unitCostPerGal,
    source: `Over-receipt on ${po.id} line ${line.id} (${gallons.toFixed(2)} gal credited off the job)`,
  });
}

export function approveReceipt(db: Database, actor: User, receiptId: string) {
  if (!can(actor, "po.approveOverReceipt")) return denied(db, actor, PO_MODULE, "approve an over-receipt", whoCan("po.approveOverReceipt"));
  const r = byId(db.receipts ?? [], receiptId);
  if (!r || r.status !== "pending_approval") return fail("Receipt not found or already approved.");
  const po = byId(db.purchaseOrders, r.poId)!;
  const line = po.lines.find((l) => l.id === r.lineId)!;
  r.status = "approved";
  r.approvedBy = actor.id;
  routeToShelf(db, po, line, r.toShelfGal);
  log(db, actor, PO_MODULE, `Purchase Order ${r.poId} – Line ${r.lineId} over-receipt ${r.overGal.toFixed(2)} gal approved by ${actor.name}: ${r.toJobCostGal.toFixed(2)} gal to job cost, ${r.toShelfGal.toFixed(2)} gal to shelf stock at purchase cost`);
  return ok();
}
