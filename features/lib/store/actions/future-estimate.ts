/**
 * Feature 28 — Future Estimating And Touch-Up Reordering.
 *
 * Two record types:
 * - RepeatEstimate (REP-2026-n): a new quote started from selected history.
 * - TouchUpReorder (TUR-2026-n): a small, property-linked paint sale.
 *
 * The derive helpers at the top are pure reads shared by screens and actions,
 * so a screen never shows a state the action would reject.
 */
import type {
  Application, Area, Database, Estimate, HistoricalJobSummary, OwnershipPeriod, ProductCatalogItem, Property, PropertyType,
  RepeatEstimate, RepeatEstimateLine, Surface, TouchUpReorder, User,
} from "@/features/types";
import { OPEN_ESTIMATE_STATUSES } from "@/features/types";
import { can, whoCan } from "@/features/lib/permissions";
import { now } from "@/features/lib/clock";
import { byId, catalogFor, currentOwnership } from "@/features/lib/selectors";
import { titleCase } from "@/features/lib/format";
import {
  chooseProductivity, classifyReplacement, evaluateInspectionGate, historicalRate, historyAccess, isQuoteExpired, NO_POLICY_MESSAGE,
  PAYMENT_BLOCKED, paymentAllowsApproval, priceLine, productivityAllowed, quoteTotals, quoteValidUntil, reconfirmGaps, refundDueDate,
  reorderQuantity, stockCheckResult, CURRENT_BASIS, PREP_LABEL, CONDITION_LABEL, type HistoryAccess, type InspectionEvidence,
  type ProductivityDecision,
} from "@/features/lib/rules/future-estimate";
import { formatPacks } from "@/features/lib/rules/materials";
import { denied, fail, log, nextNumber, ok } from "../helpers";

const REP = "Repeat Estimate";
const TUR = "Touch-up Reorder";

/* ================================================================== */
/* Derive helpers (pure reads)                                         */
/* ================================================================== */

export interface HistoryItem {
  app: Application;
  surface?: Surface;
  area?: Area;
  access: HistoryAccess;
  removed: boolean;
}

export interface HistoryGroup {
  key: string;
  jobId?: string;
  label: string;
  date?: string;
  unverified: boolean;
  items: HistoryItem[];
}

export interface OwnershipContext {
  current: OwnershipPeriod;
  consent?: OwnershipPeriod["predecessorConsent"];
  hasPredecessor: boolean;
  hiddenCount: number;
  specOnlyCount: number;
}

export function ownershipContext(db: Database, property: Property): OwnershipContext {
  const current = currentOwnership(property);
  const apps = db.applications.filter((a) => a.propertyId === property.id);
  let hiddenCount = 0;
  let specOnlyCount = 0;
  for (const a of apps) {
    const access = historyAccess({ completedAt: a.completedAt, currentStart: current.start, consent: current.predecessorConsent });
    if (access === "hidden") hiddenCount += 1;
    if (access === "spec_only") specOnlyCount += 1;
  }
  return { current, consent: current.predecessorConsent, hasPredecessor: property.ownership.length > 1, hiddenCount, specOnlyCount };
}

/** Prior work at the property, grouped by job, newest first. Hidden (restricted) work is left out. */
export function historyGroups(db: Database, property: Property): HistoryGroup[] {
  const current = currentOwnership(property);
  const groups = new Map<string, HistoryGroup>();
  for (const app of db.applications.filter((a) => a.propertyId === property.id)) {
    const access = historyAccess({ completedAt: app.completedAt, currentStart: current.start, consent: current.predecessorConsent });
    if (access === "hidden") continue;
    const surface = byId(db.surfaces, app.surfaceId);
    const area = surface ? byId(db.areas, surface.areaId) : undefined;
    const key = app.jobId ?? `unverified-${app.id}`;
    const hist = app.jobId ? historicalJob(db, app.jobId) : undefined;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        jobId: app.jobId,
        label: app.jobId ? `${app.jobId}${hist ? ` · ${hist.name}` : ""}` : `Customer-reported work · ${app.manufacturer}`,
        date: app.completedAt,
        unverified: app.verification === "unverified",
        items: [],
      });
    }
    const g = groups.get(key)!;
    if (app.completedAt && (!g.date || app.completedAt > g.date)) g.date = app.completedAt;
    g.items.push({ app, surface, area, access, removed: !!surface?.removedAt });
  }
  return Array.from(groups.values()).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

export function historicalJob(db: Database, jobId?: string): HistoricalJobSummary | undefined {
  return (db.historicalJobs ?? []).find((j) => j.id === jobId);
}

export function policies(db: Database) {
  return db.productivityPolicies ?? [];
}

export function policyFor(db: Database, type: PropertyType) {
  return policies(db).find((p) => p.propertyType === type);
}

export interface OpenRecords {
  repeatDrafts: RepeatEstimate[];
  openEstimates: Estimate[];
  pendingReorders: TouchUpReorder[];
}

/** Open repaint estimates and pending reorders that a new record would compete with. */
export function openRecords(db: Database, propertyId: string, excludeRepId?: string): OpenRecords {
  const t = now();
  return {
    repeatDrafts: db.repeatEstimates.filter((r) => r.propertyId === propertyId && r.status === "draft" && r.id !== excludeRepId),
    openEstimates: db.estimates.filter(
      (e) => e.propertyId === propertyId && e.isRepaint && OPEN_ESTIMATE_STATUSES.includes(e.status) && !isQuoteExpired(e.validUntil, t) && e.repeatEstimateId !== excludeRepId,
    ),
    pendingReorders: db.touchUpReorders.filter((r) => r.propertyId === propertyId && (r.status === "draft" || r.status === "approved")),
  };
}

export function lineSurface(db: Database, line: RepeatEstimateLine) {
  const surface = byId(db.surfaces, line.surfaceId);
  const area = surface ? byId(db.areas, surface.areaId) : undefined;
  const app = byId(db.applications, line.sourceApplicationId);
  return { surface, area, app };
}

/** Scope facts for the inspection gate. */
export function repScope(db: Database, rep: RepeatEstimate) {
  let hasExterior = false;
  const rooms = new Set<string>();
  let wallCeilingSqft = 0;
  for (const l of rep.lines) {
    const { surface, area } = lineSurface(db, l);
    if (area?.kind === "exterior") hasExterior = true;
    else if (area) {
      rooms.add(area.id);
      if (surface && (surface.type === "walls" || surface.type === "ceiling")) wallCeilingSqft += l.sqft;
    }
  }
  return { hasExterior, rooms: rooms.size, wallCeilingSqft };
}

export function repGate(db: Database, rep: RepeatEstimate) {
  const scope = repScope(db, rep);
  return { scope, gate: evaluateInspectionGate({ ...scope, inspection: rep.inspection as InspectionEvidence | undefined }) };
}

export interface LinePricing {
  line: RepeatEstimateLine;
  productivity: ProductivityDecision;
  catalog?: ProductCatalogItem;
  suggested: ReturnType<typeof priceLine>;
  combination: string;
}

export function repPricing(db: Database, rep: RepeatEstimate, nowIso = now()) {
  const property = byId(db.properties, rep.propertyId)!;
  const policy = policyFor(db, property.type);
  const lines: LinePricing[] = rep.lines.map((line) => {
    const { surface, area, app } = lineSurface(db, line);
    const type = surface?.type ?? "walls";
    const productivity = chooseProductivity({
      useHistorical: rep.useHistoricalProductivity,
      policyApproved: !!policy,
      surfaceType: type,
      historical: line.unverified || line.specOnly ? undefined : historicalRate({ sqft: line.sqft, coats: line.coats, actualHours: app?.actualHours }),
      historicalDate: app?.completedAt,
      nowIso,
    });
    const catalog = catalogFor(db, line.product);
    const costPerGal = catalog?.cost.gal ?? (catalog?.cost.qt !== undefined ? catalog.cost.qt * 4 : undefined);
    const suggested = priceLine({
      sqft: line.sqft,
      coats: line.coats,
      surfaceType: type,
      rate: productivity.rate,
      wageRate: CURRENT_BASIS.wageRate,
      markupPct: CURRENT_BASIS.markupPct,
      materialCostPerGal: costPerGal,
      gallons: line.newQtyGal,
      prep: line.prep,
      condition: line.condition,
    });
    return { line, productivity, catalog, suggested, combination: `${area?.name ?? "—"} ${surface?.name.toLowerCase() ?? ""} · ${line.product}` };
  });
  const totals = quoteTotals(rep.lines.map((l) => l.price ?? 0), CURRENT_BASIS.taxRatePct);
  const historical = lines.filter((l) => l.productivity.source === "historical");
  const oldestMonths = historical.reduce((m, l) => Math.max(m, l.productivity.ageMonths ?? 0), 0);
  return { lines, totals, policy, historicalCount: historical.length, fallbacks: lines.filter((l) => l.productivity.fallback), oldestMonths };
}

/** Everything that stops Issue Quote, in order. Empty means the quote can be issued. */
export function issueBlockers(db: Database, rep: RepeatEstimate): string[] {
  const out: string[] = [];
  if (rep.status !== "draft") return ["This repeat estimate has already been issued."];
  if (rep.lines.length === 0) out.push("Add at least one surface.");
  const { gate } = repGate(db, rep);
  if (!gate.met) out.push(gate.reasons[0]?.startsWith("Inspection evidence required") ? gate.reasons.join(" ") : `Inspection evidence required: ${gate.reasons.join(" ")}`);
  for (const l of rep.lines) {
    const { area, surface } = lineSurface(db, l);
    const name = `${area?.name ?? ""} ${surface?.name ?? l.surfaceId}`.trim();
    if (l.replacement?.status === "proposed") out.push(`${name}: product replacement awaiting ${l.replacement.approver === "office" ? "office" : "owner"} approval.`);
    const cat = catalogFor(db, l.product);
    if (cat?.discontinued && l.replacement?.status !== "approved") out.push(`${name}: ${l.product} is discontinued. Propose a replacement.`);
    const gaps = reconfirmGaps(l);
    if (gaps.length) out.push(`${name}: ${gaps.join(", ")} not reconfirmed.`);
    else if (!l.reconfirmed) out.push(`${name}: not marked Reconfirmed.`);
  }
  if (!rep.clauseIncluded) out.push("Include the differing-conditions clause on the customer quote.");
  return out;
}

/* ================================================================== */
/* Repeat estimate actions                                             */
/* ================================================================== */

function guardBuild(db: Database, actor: User, what: string) {
  if (!can(actor, "repeat.build")) return denied(db, actor, REP, what, whoCan("repeat.build"));
  return null;
}

function getDraft(db: Database, repId: string) {
  const rep = byId(db.repeatEstimates, repId);
  if (!rep) return { error: fail("Repeat estimate not found.") };
  if (rep.status !== "draft") return { error: fail(`${rep.id} has been issued and can no longer be changed.`) };
  return { rep };
}

function buildLines(db: Database, property: Property, rep: RepeatEstimate, applicationIds: string[], actor: User) {
  const current = currentOwnership(property);
  const taken = new Set(rep.lines.map((l) => l.surfaceId));
  const lines: RepeatEstimateLine[] = [];
  for (const appId of applicationIds) {
    const app = byId(db.applications, appId);
    if (!app || app.propertyId !== property.id) return fail(`Application ${appId} is not recorded at this property.`);
    const access = historyAccess({ completedAt: app.completedAt, currentStart: current.start, consent: current.predecessorConsent });
    if (access === "hidden") return fail(`Application ${appId} belongs to a previous owner's period and seller consent has not been given.`);
    const surface = byId(db.surfaces, app.surfaceId);
    if (!surface) return fail(`Surface for ${appId} not found.`);
    if (surface.removedAt) return fail(`${surface.name} is marked Removed and can't be selected.`);
    if (taken.has(surface.id)) return fail(`${surface.name} is already on this estimate from another job. Choose one source per surface.`);
    taken.add(surface.id);
    const cat = catalogFor(db, app.product);
    lines.push({
      // Copy carries surfaces, measurements, colours, products, sheen and coats.
      // It never carries approval state or completion state.
      id: "",
      surfaceId: surface.id,
      sourceJobId: app.jobId,
      sourceApplicationId: app.id,
      sqft: surface.areaSqft,
      colourLabel: `${app.colourName} ${app.colourNumber}`,
      colourNumber: app.colourNumber,
      hex: app.hex,
      manufacturer: app.manufacturer,
      productLine: cat?.productLine,
      product: app.product,
      sheen: app.sheen,
      coats: app.coats,
      priorActualGal: access === "full" ? app.actualGallons : undefined,
      priorActualHours: access === "full" ? app.actualHours : undefined,
      unverified: app.verification === "unverified",
      sourceNote: app.verification === "unverified" ? app.source ?? "recorded from customer" : undefined,
      specOnly: access === "spec_only" || undefined,
      tintFormula: app.tintFormula,
      reconfirmed: false,
    });
  }
  return ok(lines);
}

function appendLines(db: Database, actor: User, rep: RepeatEstimate, lines: RepeatEstimateLine[]) {
  for (const l of lines) {
    const n = rep.lines.reduce((m, x) => Math.max(m, Number(x.id.split("-L")[1] ?? 0)), 0) + 1;
    l.id = `${rep.id}-L${n}`;
    rep.lines.push(l);
    log(db, actor, REP, `Repeat Estimate: Estimate ${rep.id} – Surface ${l.surfaceId} copied from job ${l.sourceJobId ?? "none (customer-reported)"}, application ${l.sourceApplicationId} by ${actor.name}`);
    if (l.unverified) {
      log(db, actor, REP, `Repeat Estimate: Estimate ${rep.id} – Unverified third-party history used as a starting point. Source: ${l.sourceNote ?? "recorded from customer"} (${l.sourceApplicationId})`);
    }
  }
  rep.updatedAt = now();
}

export function startRepeatEstimate(
  db: Database,
  actor: User,
  propertyId: string,
  applicationIds: string[],
  opts: { followUpId?: string; acknowledgedOpen?: boolean } = {},
) {
  const blocked = guardBuild(db, actor, "start a repeat estimate");
  if (blocked) return blocked;
  const property = byId(db.properties, propertyId);
  if (!property) return fail("Property not found.");
  if (applicationIds.length === 0) return fail("Select at least one surface before the builder opens.");
  const open = openRecords(db, propertyId);
  const openCount = open.repeatDrafts.length + open.openEstimates.length + open.pendingReorders.length;
  if (openCount > 0 && !opts.acknowledgedOpen) {
    const ref = open.repeatDrafts[0]?.id ?? open.openEstimates[0]?.id ?? open.pendingReorders[0]?.id;
    return fail(`This property already has an open record (${ref}). Open it, or confirm that a separate estimate is needed.`);
  }
  const rep: RepeatEstimate = {
    id: `REP-2026-${nextNumber(db, "rep")}`,
    propertyId,
    status: "draft",
    createdAt: now(),
    createdBy: actor.id,
    updatedAt: now(),
    lines: [],
    useHistoricalProductivity: false,
    clauseIncluded: true,
    ownershipPeriodId: currentOwnership(property).id,
    followUpId: opts.followUpId && byId(db.followUps, opts.followUpId)?.propertyId === propertyId ? opts.followUpId : undefined,
  };
  const built = buildLines(db, property, rep, applicationIds, actor);
  if (!built.ok) {
    db.counters.rep -= 1;
    return built;
  }
  const jobs = Array.from(new Set(built.value!.map((l) => l.sourceJobId).filter(Boolean)));
  rep.title = `Repeat Estimate — from ${jobs.join(", ") || "customer-reported history"}`;
  db.repeatEstimates.unshift(rep);
  log(db, actor, REP, `Repeat Estimate: Property ${propertyId} – New estimate started from history by ${actor.name}`);
  appendLines(db, actor, rep, built.value!);
  return ok(rep.id);
}

export function addRepeatLines(db: Database, actor: User, repId: string, applicationIds: string[]) {
  const blocked = guardBuild(db, actor, "add surfaces to a repeat estimate");
  if (blocked) return blocked;
  const { rep, error } = getDraft(db, repId);
  if (error) return error;
  if (applicationIds.length === 0) return fail("Select at least one surface.");
  const property = byId(db.properties, rep!.propertyId)!;
  const built = buildLines(db, property, rep!, applicationIds, actor);
  if (!built.ok) return built;
  appendLines(db, actor, rep!, built.value!);
  return ok(built.value!.length);
}

export type LinePatch = Partial<Pick<RepeatEstimateLine, "newQtyGal" | "prep" | "condition" | "price" | "sqft">>;

/** Draft edit of a copied line. Any change clears Reconfirmed, so it must be reconfirmed again. */
export function updateRepeatLine(db: Database, actor: User, repId: string, lineId: string, patch: LinePatch) {
  const blocked = guardBuild(db, actor, "edit a repeat estimate");
  if (blocked) return blocked;
  const { rep, error } = getDraft(db, repId);
  if (error) return error;
  const line = rep!.lines.find((l) => l.id === lineId);
  if (!line) return fail("Line not found.");
  if (patch.newQtyGal !== undefined && patch.newQtyGal < 0) return fail("Quantity can't be negative.", "newQtyGal");
  if (patch.price !== undefined && patch.price < 0) return fail("Price can't be negative.", "price");
  if ("sqft" in patch && !(patch.sqft! > 0)) return fail("Measurement must be greater than zero.", "sqft");
  const changed = (Object.keys(patch) as (keyof LinePatch)[]).some((k) => line[k] !== patch[k]);
  Object.assign(line, patch);
  if (changed && line.reconfirmed) {
    line.reconfirmed = false;
    line.reconfirmedAt = undefined;
  }
  rep!.updatedAt = now();
  return ok();
}

export function setLineReconfirmed(db: Database, actor: User, repId: string, lineId: string, value: boolean) {
  const blocked = guardBuild(db, actor, "reconfirm a repeat estimate line");
  if (blocked) return blocked;
  const { rep, error } = getDraft(db, repId);
  if (error) return error;
  const line = rep!.lines.find((l) => l.id === lineId);
  if (!line) return fail("Line not found.");
  if (value) {
    const gaps = reconfirmGaps(line);
    const { surface, area } = lineSurface(db, line);
    if (gaps.length) return fail(`${area?.name ?? ""} ${surface?.name ?? ""}: enter ${gaps.join(", ")} before reconfirming.`);
    line.reconfirmed = true;
    line.reconfirmedAt = now();
    line.reconfirmedBy = actor.id;
    log(
      db, actor, REP,
      `Repeat Estimate: Estimate ${rep!.id} – Line ${line.id} reconfirmed: quantity ${line.newQtyGal} gal, preparation ${PREP_LABEL[line.prep!]}, condition ${CONDITION_LABEL[line.condition!]}, price $${line.price!.toFixed(2)} by ${actor.name}`,
    );
  } else {
    line.reconfirmed = false;
    line.reconfirmedAt = undefined;
  }
  rep!.updatedAt = now();
  return ok();
}

export function removeRepeatLine(db: Database, actor: User, repId: string, lineId: string) {
  const blocked = guardBuild(db, actor, "remove a line from a repeat estimate");
  if (blocked) return blocked;
  const { rep, error } = getDraft(db, repId);
  if (error) return error;
  const line = rep!.lines.find((l) => l.id === lineId);
  if (!line) return fail("Line not found.");
  rep!.lines = rep!.lines.filter((l) => l.id !== lineId);
  rep!.updatedAt = now();
  log(db, actor, REP, `Repeat Estimate: Estimate ${rep!.id} – Line ${lineId} (surface ${line.surfaceId}) removed by ${actor.name}`);
  return ok();
}

export function saveRepeatDraft(db: Database, actor: User, repId: string, title: string) {
  const blocked = guardBuild(db, actor, "save a repeat estimate");
  if (blocked) return blocked;
  const { rep, error } = getDraft(db, repId);
  if (error) return error;
  if (!title.trim()) return fail("Title is required.", "title");
  if (title.trim().length > 120) return fail("Keep the title under 120 characters.", "title");
  rep!.title = title.trim();
  rep!.updatedAt = now();
  log(db, actor, REP, `Repeat Estimate: Estimate ${rep!.id} – Draft saved by ${actor.name}`);
  return ok();
}

export function deleteRepeatEstimate(db: Database, actor: User, repId: string) {
  const blocked = guardBuild(db, actor, "delete a repeat estimate");
  if (blocked) return blocked;
  const { rep, error } = getDraft(db, repId);
  if (error) return error;
  db.repeatEstimates = db.repeatEstimates.filter((r) => r.id !== rep!.id);
  log(db, actor, REP, `Repeat Estimate: Estimate ${rep!.id} – Draft deleted by ${actor.name}`);
  return ok();
}

export function setQuoteClause(db: Database, actor: User, repId: string, included: boolean) {
  const blocked = guardBuild(db, actor, "change the quote clause");
  if (blocked) return blocked;
  const { rep, error } = getDraft(db, repId);
  if (error) return error;
  rep!.clauseIncluded = included;
  rep!.updatedAt = now();
  return ok();
}

export function recordInspection(db: Database, actor: User, repId: string, ev: InspectionEvidence) {
  const blocked = guardBuild(db, actor, "record an inspection");
  if (blocked) return blocked;
  const { rep, error } = getDraft(db, repId);
  if (error) return error;
  const scope = repScope(db, rep!);
  const t = now();
  if (!(ev.photos >= 0) || !Number.isInteger(ev.photos)) return fail("Photographs must be a whole number.", "photos");
  if (ev.path === "site_visit") {
    if (!ev.visitDate) return fail("Site visit date is required.", "visitDate");
    if (ev.visitDate > t) return fail("Site visit date can't be in the future.", "visitDate");
    if (ev.measurementDate && ev.measurementDate > t) return fail("Measurement date can't be in the future.", "measurementDate");
    rep!.inspection = { path: "site_visit", visitDate: ev.visitDate, measurementDate: ev.measurementDate || undefined, photos: ev.photos, recordedBy: actor.id, recordedAt: t };
    log(db, actor, REP, `Repeat Estimate: Estimate ${rep!.id} – Site visit recorded ${ev.visitDate.slice(0, 10)}, measured ${ev.measurementDate?.slice(0, 10) ?? "not recorded"}, photographs ${ev.photos} by ${actor.name}`);
  } else {
    const gate = evaluateInspectionGate({ ...scope, inspection: ev });
    if (!gate.smallInteriorAvailable) {
      return fail(
        scope.hasExterior
          ? "Exterior work needs a saved site visit. The small-interior path is not available."
          : `Small-interior path rejected: ${scope.wallCeilingSqft} sq ft across ${scope.rooms} rooms is over 400 sq ft. A site visit is required.`,
        "path",
      );
    }
    if (!ev.callDate) return fail("Record the date of the phone call.", "callDate");
    if (ev.callDate > t) return fail("Call date can't be in the future.", "callDate");
    if (ev.photos < 1) return fail("At least one photograph is required for the small-interior path.", "photos");
    rep!.inspection = { path: "small_interior", photos: ev.photos, callDate: ev.callDate, callNote: ev.callNote?.trim() || undefined, recordedBy: actor.id, recordedAt: t };
    log(db, actor, REP, `Repeat Estimate: Estimate ${rep!.id} – Small interior gate met via photographs and call on ${ev.callDate.slice(0, 10)} by ${actor.name}. Area: ${scope.wallCeilingSqft} sq ft`);
  }
  rep!.updatedAt = t;
  return ok();
}

export function approveProductivityPolicy(db: Database, actor: User, propertyType: PropertyType) {
  if (!can(actor, "repeat.approveProductivity")) return denied(db, actor, REP, "approve historical productivity reuse", whoCan("repeat.approveProductivity"));
  if (policyFor(db, propertyType)) return fail(`A policy for ${titleCase(propertyType)} is already approved.`);
  db.productivityPolicies = [
    ...policies(db),
    { id: `PP-${policies(db).length + 1}`, propertyType, approvedBy: actor.id, approvedAt: now() },
  ];
  log(db, actor, REP, `Repeat Estimate: Historical productivity reuse approved for property type ${titleCase(propertyType)} by ${actor.name}`);
  return ok();
}

export function setProductivityMode(db: Database, actor: User, repId: string, useHistorical: boolean) {
  const blocked = guardBuild(db, actor, "change the productivity basis");
  if (blocked) return blocked;
  const { rep, error } = getDraft(db, repId);
  if (error) return error;
  const property = byId(db.properties, rep!.propertyId)!;
  if (useHistorical) {
    if (!productivityAllowed(policies(db), property.type)) {
      log(db, actor, REP, `Blocked: ${actor.name} attempted historical productivity reuse on ${rep!.id}. ${NO_POLICY_MESSAGE} (${titleCase(property.type)})`, true);
      return fail(`${NO_POLICY_MESSAGE} The Business Owner approves it once per property type.`);
    }
    rep!.useHistoricalProductivity = true;
    const pricing = repPricing(db, rep!);
    const policy = pricing.policy!;
    log(db, actor, REP, `Repeat Estimate: Estimate ${rep!.id} – Historical productivity reused for property type ${titleCase(property.type)} under owner policy approved ${policy.approvedAt.slice(0, 10)}. Rate age: ${pricing.oldestMonths} months`);
    for (const f of pricing.fallbacks) {
      log(db, actor, REP, `Repeat Estimate: Estimate ${rep!.id} – No historical rate available for ${f.combination}. Current rate applied.`);
    }
  } else {
    rep!.useHistoricalProductivity = false;
    log(db, actor, REP, `Repeat Estimate: Estimate ${rep!.id} – Current rates requested instead of historical productivity by ${actor.name}`);
  }
  rep!.updatedAt = now();
  return ok();
}

export interface ReplacementDraft {
  catalogId: string;
  colourNumber: string;
  sheen: string;
  isDirectSuccessor: boolean;
}

export function previewReplacement(db: Database, line: RepeatEstimateLine, draft: ReplacementDraft) {
  const next = byId(db.catalog, draft.catalogId);
  if (!next) return undefined;
  const old = catalogFor(db, line.product);
  return classifyReplacement(
    { brand: line.manufacturer ?? old?.manufacturer ?? "", productLine: line.productLine ?? old?.productLine ?? "", colour: line.colourNumber ?? "", sheen: line.sheen, product: line.product, costPerGal: old?.cost.gal ?? 0 },
    { brand: next.manufacturer, productLine: next.productLine, colour: draft.colourNumber, sheen: draft.sheen, product: next.product, costPerGal: next.cost.gal ?? 0 },
    draft.isDirectSuccessor,
  );
}

export function proposeReplacement(db: Database, actor: User, repId: string, lineId: string, draft: ReplacementDraft) {
  const blocked = guardBuild(db, actor, "propose a product replacement");
  if (blocked) return blocked;
  const { rep, error } = getDraft(db, repId);
  if (error) return error;
  const line = rep!.lines.find((l) => l.id === lineId);
  if (!line) return fail("Line not found.");
  const next = byId(db.catalog, draft.catalogId);
  if (!next) return fail("Choose a replacement product.", "catalogId");
  if (next.product === line.product) return fail("Choose a different product from the current one.", "catalogId");
  if (next.discontinued) return fail(`${next.product} is also discontinued.`, "catalogId");
  if (!draft.colourNumber.trim()) return fail("Colour number is required.", "colourNumber");
  if (!draft.sheen) return fail("Sheen is required.", "sheen");
  if (draft.isDirectSuccessor && next.successorOf !== catalogFor(db, line.product)?.id) {
    return fail(`${next.product} is not a manufacturer-published direct successor of ${line.product}.`, "isDirectSuccessor");
  }
  const r = previewReplacement(db, line, draft)!;
  line.replacement = {
    oldProduct: line.product,
    newProduct: next.product,
    newManufacturer: next.manufacturer,
    newProductLine: next.productLine,
    newColourNumber: draft.colourNumber.trim(),
    newSheen: draft.sheen,
    isDirectSuccessor: draft.isDirectSuccessor,
    decision: r.decision.kind,
    approver: r.approver,
    document: r.document,
    reason: "reason" in r.decision ? r.decision.reason : "",
    status: "proposed",
    proposedBy: actor.id,
    proposedAt: now(),
  };
  line.reconfirmed = false;
  rep!.updatedAt = now();
  log(db, actor, REP, `Repeat Estimate: Estimate ${rep!.id} – Discontinued product ${line.product} proposed to be replaced with ${next.product} by ${actor.name}. Approved by: ${r.approver === "office" ? "Office" : "Owner"} (pending). Document required: ${r.document}`);
  return ok(r);
}

export function decideReplacement(db: Database, actor: User, repId: string, lineId: string, approve: boolean) {
  const { rep, error } = getDraft(db, repId);
  if (error) return error;
  const line = rep!.lines.find((l) => l.id === lineId);
  const rp = line?.replacement;
  if (!line || !rp || rp.status !== "proposed") return fail("No replacement is waiting for a decision.");
  const perm = rp.approver === "office" ? "repeat.approveReplacementOffice" : "repeat.approveReplacementOwner";
  if (!can(actor, perm)) return denied(db, actor, REP, `${approve ? "approve" : "reject"} this replacement`, whoCan(perm));
  rp.status = approve ? "approved" : "rejected";
  rp.decidedBy = actor.id;
  rp.decidedAt = now();
  if (approve) {
    // The custom tint formula is carried for store review; it is never auto-substituted.
    line.product = rp.newProduct;
    line.productLine = rp.newProductLine;
    line.manufacturer = rp.newManufacturer;
    if (rp.newColourNumber !== line.colourNumber) {
      line.colourLabel = `${line.colourLabel.replace(line.colourNumber ?? "", "").trim()} ${rp.newColourNumber}`.trim();
      line.colourNumber = rp.newColourNumber;
    }
    line.sheen = rp.newSheen;
    line.reconfirmed = false;
  }
  rep!.updatedAt = now();
  log(db, actor, REP, `Repeat Estimate: Estimate ${rep!.id} – Discontinued product ${rp.oldProduct} ${approve ? "replaced with" : "replacement rejected:"} ${rp.newProduct} by ${userName(db, rp.proposedBy)}. Approved by: ${approve ? `${rp.approver === "office" ? "Office" : "Owner"} (${actor.name})` : "—"}. Document required: ${rp.document}`);
  return ok();
}

function userName(db: Database, id: string) {
  return byId(db.users, id)?.name ?? id;
}

/** Log that an existing open record was used instead of creating a duplicate. */
export function linkExistingRecord(db: Database, actor: User, propertyId: string, kind: "Estimate" | "Reorder", ref: string) {
  log(db, actor, kind === "Estimate" ? REP : TUR, `Repeat Estimate: Property ${propertyId} – Existing open ${kind} ${ref} linked instead of creating a duplicate`);
  return ok();
}

export function issueRepeatEstimate(db: Database, actor: User, repId: string, followUpId?: string) {
  const blocked = guardBuild(db, actor, "issue a repeat quote");
  if (blocked) return blocked;
  const rep = byId(db.repeatEstimates, repId);
  if (!rep) return fail("Repeat estimate not found.");
  // A second click after issue lands here and creates nothing.
  if (rep.status !== "draft") return fail(`${rep.id} was already issued as ${rep.estimateId}.`);
  const property = byId(db.properties, rep.propertyId)!;
  const current = currentOwnership(property);
  if (rep.ownershipPeriodId && rep.ownershipPeriodId !== current.id) {
    return fail("The property has changed hands since this draft was started. Start a new estimate under the current owner's history.");
  }
  const blockers = issueBlockers(db, rep);
  if (blockers.length) return fail(blockers[0]);
  const t = now();
  const totals = quoteTotals(rep.lines.map((l) => l.price ?? 0), CURRENT_BASIS.taxRatePct);
  const estimate: Estimate = {
    id: `EST-2026-${nextNumber(db, "estimate")}`,
    title: rep.title ?? "Repeat Estimate",
    customerId: current.customerId,
    propertyId: rep.propertyId,
    status: "SENT",
    total: totals.subtotal,
    createdAt: t,
    isRepaint: true,
    validUntil: quoteValidUntil(t),
    repeatEstimateId: rep.id,
    sourceJobIds: Array.from(new Set(rep.lines.map((l) => l.sourceJobId).filter(Boolean))) as string[],
  };
  db.estimates.unshift(estimate);
  recordRepeatIssued(db, actor, rep, estimate, followUpId);
  return ok(estimate.id);
}

/**
 * Marks a repeat estimate issued with its estimate, and moves a linked
 * follow-up to Estimate sent. Used by the live "Send" on an estimate made
 * from history (feature 28 in the Estimate Details host).
 */
export function recordRepeatIssued(db: Database, actor: User, rep: RepeatEstimate, estimate: Estimate, followUpId?: string) {
  const t = now();
  rep.status = "issued";
  rep.issuedAt = t;
  rep.issuedBy = actor.id;
  rep.validUntil = estimate.validUntil;
  rep.estimateId = estimate.id;
  rep.updatedAt = t;
  log(db, actor, REP, `Repeat Estimate: Estimate ${rep.id} issued by ${actor.name} on ${t.slice(0, 10)}, valid until ${estimate.validUntil!.slice(0, 10)}`);
  if (!rep.followUpId && followUpId && byId(db.followUps, followUpId)?.propertyId === rep.propertyId) rep.followUpId = followUpId;
  const fu = rep.followUpId ? byId(db.followUps, rep.followUpId) : undefined;
  if (fu) {
    fu.estimateId = estimate.id;
    fu.status = "estimate_sent";
    fu.history.push({ status: "estimate_sent", at: t, by: actor.id, note: `Repeat quote ${estimate.id} issued from ${rep.id}` });
    log(db, actor, "Follow-Ups", `Follow-up ${fu.id} – Estimate ${estimate.id} sent (repeat estimate ${rep.id}) by ${actor.name}`);
  }
}

/* ================================================================== */
/* Touch-up reorder actions                                            */
/* ================================================================== */

function guardReorder(db: Database, actor: User, what: string) {
  if (!can(actor, "reorder.approve")) return denied(db, actor, TUR, what, whoCan("reorder.approve"));
  return null;
}

export function reorderLabel(db: Database, r: TouchUpReorder) {
  const app = byId(db.applications, r.applicationId);
  return app ? `${app.product} ${app.colourName} ${app.colourNumber} ${app.sheen}` : r.applicationId;
}

export function pendingReorderFor(db: Database, propertyId: string, applicationId: string) {
  return db.touchUpReorders.find((r) => r.propertyId === propertyId && r.applicationId === applicationId && (r.status === "draft" || r.status === "approved"));
}

export interface ReorderDraft {
  applicationId: string;
  touchUpRequestId?: string;
  purpose: "touch_up" | "non_touch_up";
  requestedGal: number;
  note?: string;
}

export function createReorder(db: Database, actor: User, propertyId: string, draft: ReorderDraft) {
  const blocked = guardReorder(db, actor, "start a touch-up reorder");
  if (blocked) return blocked;
  const property = byId(db.properties, propertyId);
  if (!property) return fail("Property not found.");
  const app = byId(db.applications, draft.applicationId);
  if (!app || app.propertyId !== propertyId) return fail("Choose a colour record from this property's history.", "applicationId");
  const current = currentOwnership(property);
  if (historyAccess({ completedAt: app.completedAt, currentStart: current.start, consent: current.predecessorConsent }) === "hidden") {
    return fail("That record belongs to a previous owner's period and can't be shared without seller consent.", "applicationId");
  }
  const existing = pendingReorderFor(db, propertyId, app.id);
  if (existing) {
    log(db, actor, TUR, `Repeat Estimate: Property ${propertyId} – Existing open Reorder ${existing.id} linked instead of creating a duplicate`);
    return fail(`Reorder ${existing.id} for this colour is already pending. Open it instead of creating a duplicate purchase.`);
  }
  const cat = catalogFor(db, app.product);
  if (!cat) return fail(`${app.product} is not in the paint library, so pack sizes are unknown. Call the store and add it first.`, "applicationId");
  const q = reorderQuantity({ requestedGal: draft.requestedGal, purpose: draft.purpose, available: cat.available });
  if (!q.ok) return fail(q.error!, "requestedGal");
  const req = draft.touchUpRequestId ? byId(db.touchUpRequests, draft.touchUpRequestId) : undefined;
  if (draft.touchUpRequestId && (!req || req.propertyId !== propertyId)) return fail("Touch-up request not found at this property.");
  if (req && req.status === "converted") return fail(`${req.id} has already been converted to a reorder.`);
  const r: TouchUpReorder = {
    id: `TUR-2026-${nextNumber(db, "tur")}`,
    propertyId,
    applicationId: app.id,
    touchUpRequestId: req?.id,
    purpose: draft.purpose,
    requestedGal: draft.requestedGal,
    packs: q.packs,
    gallons: q.orderGal,
    excessGal: q.excessGal,
    payment: "unpaid",
    supply: "new_order",
    status: "draft",
    createdAt: now(),
    createdBy: actor.id,
    note: draft.note?.trim() || undefined,
  };
  db.touchUpReorders.unshift(r);
  if (req) req.status = "converted";
  log(db, actor, TUR, `Touch-up Reorder: Property ${propertyId} – Reorder ${r.id} started for ${formatPacks(r.packs)} of ${app.product} ${app.colourName} ${app.sheen}${req ? ` from touch-up request ${req.id}` : ""} by ${actor.name}`);
  return ok(r.id);
}

function getReorder(db: Database, id: string, statuses: TouchUpReorder["status"][]) {
  const r = byId(db.touchUpReorders, id);
  if (!r) return { error: fail("Reorder not found.") };
  if (!statuses.includes(r.status)) return { error: fail(`${r.id} is ${r.status} and can't be changed this way.`) };
  return { r };
}

export function updateReorderQuantity(db: Database, actor: User, id: string, requestedGal: number, purpose: "touch_up" | "non_touch_up") {
  const blocked = guardReorder(db, actor, "change a reorder quantity");
  if (blocked) return blocked;
  const { r, error } = getReorder(db, id, ["draft"]);
  if (error) return error;
  const app = byId(db.applications, r!.applicationId)!;
  const cat = catalogFor(db, app.product);
  const q = reorderQuantity({ requestedGal, purpose, available: cat?.available ?? [] });
  if (!q.ok) return fail(q.error!, "requestedGal");
  Object.assign(r!, { requestedGal, purpose, packs: q.packs, gallons: q.orderGal, excessGal: q.excessGal });
  log(db, actor, TUR, `Touch-up Reorder: ${r!.id} quantity set to ${formatPacks(q.packs)} (${q.orderGal} gal) by ${actor.name}`);
  return ok();
}

export function setReorderPayment(
  db: Database,
  actor: User,
  id: string,
  payment: TouchUpReorder["payment"],
  detail: { source?: string; method?: string },
) {
  const blocked = guardReorder(db, actor, "set reorder payment status");
  if (blocked) return blocked;
  const { r, error } = getReorder(db, id, ["draft"]);
  if (error) return error;
  if (payment === "prepaid_cleared") {
    if (!detail.method?.trim()) return fail("Enter the payment method (card, check, cash).", "method");
    if (!detail.source?.trim()) return fail("Enter how the cleared payment was verified.", "source");
  }
  if (payment === "on_account" && !detail.source?.trim()) {
    return fail("On account needs the bookkeeper receivables information it is based on.", "source");
  }
  r!.payment = payment;
  r!.paymentMethod = payment === "prepaid_cleared" ? detail.method!.trim() : undefined;
  r!.paymentSource = payment === "unpaid" ? undefined : detail.source!.trim();
  log(db, actor, TUR, `Touch-up Reorder: ${r!.id} payment status set to ${payment === "prepaid_cleared" ? "Prepaid (cleared)" : payment === "on_account" ? "On account" : "Unpaid"}${r!.paymentSource ? ` — source: ${r!.paymentSource}` : ""} by ${actor.name}`);
  return ok();
}

export interface StockCheckDraft {
  supply: "new_order" | "company_stock" | "customer_cans";
  stockId?: string;
  customerCansNote?: string;
  brand: string;
  code: string;
  sheen: string;
  tintDate?: string;
  issues: ("skinning" | "separation" | "unlabelled")[];
}

export function recordStockCheck(db: Database, actor: User, id: string, d: StockCheckDraft) {
  const blocked = guardReorder(db, actor, "record a stock check");
  if (blocked) return blocked;
  const { r, error } = getReorder(db, id, ["draft"]);
  if (error) return error;
  const app = byId(db.applications, r!.applicationId)!;
  if (d.supply === "new_order") {
    r!.supply = "new_order";
    r!.stockCheck = undefined;
    r!.customerCansNote = undefined;
    log(db, actor, TUR, `Touch-up Reorder: ${r!.id} will be filled by a new order (tinted from the colour record) by ${actor.name}`);
    return ok<{ result: string; reasons: string[] }>({ result: "Usable", reasons: [] });
  }
  if (d.supply === "company_stock" && !byId(db.shelfStock, d.stockId)) return fail("Choose the shelf stock item that was checked.", "stockId");
  if (d.supply === "customer_cans" && !d.customerCansNote?.trim()) return fail("Describe the customer's cans (how many, where kept).", "customerCansNote");
  if (!d.brand.trim()) return fail("Brand read from the can is required.", "brand");
  if (!d.code.trim()) return fail("Colour code read from the can is required.", "code");
  if (!d.sheen.trim()) return fail("Sheen read from the can is required.", "sheen");
  const res = stockCheckResult({
    tintDate: d.tintDate,
    nowIso: now(),
    issues: d.issues,
    brandMatches: d.brand.trim().toLowerCase() === app.manufacturer.toLowerCase(),
    codeMatches: d.code.replace(/\s/g, "").toLowerCase() === app.colourNumber.replace(/\s/g, "").toLowerCase(),
    sheenMatches: d.sheen.toLowerCase() === String(app.sheen).toLowerCase(),
  });
  r!.supply = d.supply;
  r!.customerCansNote = d.supply === "customer_cans" ? d.customerCansNote!.trim() : undefined;
  r!.stockCheck = {
    ok: res.result === "Usable",
    note: res.reasons.join("; ") || "All checks passed",
    stockId: d.supply === "company_stock" ? d.stockId : undefined,
    brand: d.brand.trim(),
    code: d.code.trim(),
    sheen: d.sheen,
    tintDate: d.tintDate,
    issues: d.issues,
    checkedAt: now(),
    checkedBy: actor.id,
  };
  const stockRef = d.supply === "company_stock" ? d.stockId : "customer-owned can";
  log(db, actor, TUR, `Touch-up Reorder: Stock ${stockRef} checked – brand ${d.brand.trim()}, code ${d.code.trim()}, sheen ${d.sheen}, tint date ${d.tintDate?.slice(0, 10) ?? "none"}. Result: ${res.result}`);
  return ok<{ result: string; reasons: string[] }>({ result: res.result, reasons: res.reasons });
}

export function approveReorder(db: Database, actor: User, id: string) {
  const blocked = guardReorder(db, actor, "approve a touch-up reorder");
  if (blocked) return blocked;
  const { r, error } = getReorder(db, id, ["draft"]);
  if (error) return error;
  if (r!.gallons > 2) return fail("Office approval without an estimate is limited to two gallons.");
  if (!paymentAllowsApproval(r!.payment)) return fail(PAYMENT_BLOCKED);
  if (r!.supply !== "new_order" && !r!.stockCheck) return fail("Record the physical stock check before issuing existing stock.");
  if (r!.stockCheck && !r!.stockCheck.ok) return fail(`Rematch required: ${r!.stockCheck.note}. This stock can't be issued. Switch to a new order to rematch the surface.`);
  r!.status = "approved";
  r!.approvedBy = actor.id;
  r!.approvedAt = now();
  const app = byId(db.applications, r!.applicationId)!;
  log(db, actor, TUR, `Touch-up Reorder: Property ${r!.propertyId} – ${formatPacks(r!.packs)} of ${app.product} ${app.colourName} ${app.colourNumber} ${app.sheen} approved by ${actor.name}. Payment: ${r!.payment === "on_account" ? "OnAccount" : "Prepaid"}`);
  return ok();
}

/**
 * Hand the paint over. A paint sale never creates an application record and
 * never resets the repaint clock.
 */
export function fulfilReorder(db: Database, actor: User, id: string) {
  const blocked = guardReorder(db, actor, "fulfil a touch-up reorder");
  if (blocked) return blocked;
  const { r, error } = getReorder(db, id, ["approved"]);
  if (error) return error;
  const t = now();
  const app = byId(db.applications, r!.applicationId)!;
  if (r!.supply === "company_stock" && r!.stockCheck?.stockId) {
    db.shelfStock = db.shelfStock.filter((s) => s.id !== r!.stockCheck!.stockId);
  }
  if (r!.purpose === "non_touch_up" && (r!.excessGal ?? 0) > 0 && r!.supply === "new_order") {
    db.shelfStock.push({
      id: `SH-${r!.id}`,
      product: app.product,
      colourName: app.colourName,
      colourNumber: app.colourNumber,
      sheen: app.sheen === "Unknown" ? "Eggshell" : app.sheen,
      containerSize: "gal",
      sealed: false,
      tintDate: t,
      purchaseDate: t,
      measuredGal: r!.excessGal,
      confirmedBy: actor.id,
      checkDate: t,
    });
  }
  r!.status = "fulfilled";
  r!.fulfilledAt = t;
  log(db, actor, TUR, `Touch-up Reorder: ${r!.id} fulfilled by ${actor.name}. Paint sale only: no application history created and the repaint clock is unchanged.`);
  return ok();
}

export function cancelReorder(db: Database, actor: User, id: string, reason: "customer_cancelled" | "unfillable") {
  const blocked = guardReorder(db, actor, "cancel a touch-up reorder");
  if (blocked) return blocked;
  const { r, error } = getReorder(db, id, ["draft", "approved"]);
  if (error) return error;
  const t = now();
  r!.status = "cancelled";
  r!.cancelledAt = t;
  r!.cancelReason = reason;
  if (r!.payment === "prepaid_cleared") r!.refundDueAt = refundDueDate(t);
  log(db, actor, TUR, `Touch-up Reorder: ${r!.id} ${reason === "unfillable" ? "marked unfillable" : "cancelled"} by ${actor.name}.${r!.refundDueAt ? ` Refund to original method due by ${r!.refundDueAt.slice(0, 10)}.` : " No prepayment to refund."}`);
  return ok();
}

export function recordRefund(db: Database, actor: User, id: string) {
  const blocked = guardReorder(db, actor, "record a refund");
  if (blocked) return blocked;
  const { r, error } = getReorder(db, id, ["cancelled"]);
  if (error) return error;
  if (!r!.refundDueAt) return fail("This reorder had no cleared prepayment, so there is nothing to refund.");
  if (r!.refundRecordedAt) return fail(`Refund already recorded on ${r!.refundRecordedAt.slice(0, 10)}.`);
  const t = now();
  r!.refundRecordedAt = t;
  r!.refundRecordedBy = actor.id;
  log(db, actor, TUR, `Touch-up Reorder: ${r!.id} cancelled or unfillable. Refund to original method recorded by ${actor.name} on ${t.slice(0, 10)}, due by ${r!.refundDueAt.slice(0, 10)}`);
  return ok();
}

export function deleteReorderDraft(db: Database, actor: User, id: string) {
  const blocked = guardReorder(db, actor, "delete a reorder draft");
  if (blocked) return blocked;
  const { r, error } = getReorder(db, id, ["draft"]);
  if (error) return error;
  db.touchUpReorders = db.touchUpReorders.filter((x) => x.id !== r!.id);
  const req = r!.touchUpRequestId ? byId(db.touchUpRequests, r!.touchUpRequestId) : undefined;
  if (req && req.status === "converted") req.status = "acknowledged";
  log(db, actor, TUR, `Touch-up Reorder: ${r!.id} draft deleted by ${actor.name}${req ? `; ${req.id} returned to acknowledged` : ""}`);
  return ok();
}

/**
 * Customer-applied work reported after a paint sale. Logged as an Unverified
 * touch-up note on the colour record: never a new application, never a
 * reset of the repaint clock.
 */
export function logCustomerAppliedWork(db: Database, actor: User, id: string, dateIso: string, note: string) {
  const blocked = guardReorder(db, actor, "log customer-applied work");
  if (blocked) return blocked;
  const { r, error } = getReorder(db, id, ["fulfilled"]);
  if (error) return error;
  if (!dateIso) return fail("Enter the date the customer says they applied it.", "date");
  if (dateIso > now()) return fail("The date can't be in the future.", "date");
  if (!note.trim()) return fail("Describe what the customer reported.", "note");
  const app = byId(db.applications, r!.applicationId)!;
  app.touchUps.push({ date: dateIso, note: `Unverified — recorded from customer: ${note.trim()} (paint from ${r!.id})`, by: actor.id });
  log(db, actor, TUR, `Touch-up Reorder: ${r!.id} – Customer-applied work logged as Unverified on ${app.id} by ${actor.name}. Repaint clock unchanged.`);
  return ok();
}
