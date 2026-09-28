/**
 * Features 18 and 19 — procurement rules.
 *
 * Pure functions over the database. They build on the existing rules:
 *   - materials.ts   coverage precedence, waste, packing, adjustments
 *   - demand.ts      Cross-Feature Rule 2 (outstanding demand)
 *   - change-rule.ts Cross-Feature Rule 1 (signed-scope change)
 *   - dates.ts       the four-working-hour acknowledgment clock
 *
 * Nothing here mutates data. Store actions and screens both call these so the
 * numbers on screen and the numbers the actions validate are always the same.
 */
import type {
  Database, DemandAdjustment, Job, POLine, PackSize, ProductCatalogItem, PurchaseOrder, Role, ShelfStock, SpecLine,
  SurfaceCondition, User, LimitCheckResult, POStatus, LineStatus,
} from "@/features/types";
import {
  ESTIMATOR_ORDER_LIMIT, OWNER_LIFETIME_LIMIT, consumablesAllowance, packContainers, wasteAllowance, type CoverageSource, type PackResult,
} from "./materials";
import { demandBalance, type DemandBalance } from "./demand";
import { roundHalfUp, roundMoney } from "./rounding";
import { classifyChange, type Selection } from "./change-rule";
import { ackClock, DAY_MS } from "./dates";

export const COVERAGE_LABEL: Record<CoverageSource, string> = {
  override: "Project override",
  field_rate: "Field rate",
  manufacturer: "Manufacturer rate",
};

export const CONDITION_LABEL: Record<SurfaceCondition, string> = {
  sound: "Sound repaint",
  new_drywall: "New drywall",
  rough: "Rough surface",
};

/* ------------------------------------------------------------------ */
/* Demand calculation (18.1, 18.2)                                     */
/* ------------------------------------------------------------------ */

export interface SurfacePart {
  surfaceId: string;
  name: string;
  areaName: string;
  kind: "interior" | "exterior";
  condition: SurfaceCondition;
  sqft: number;
  coatSqft: number;
  rate: number;
  source: CoverageSource | "condition_rule" | "missing";
  /** Unrounded. */
  baseNeedGal: number;
}

export interface DemandLine {
  specId: string;
  jobId: string;
  spec: SpecLine;
  catalog?: ProductCatalogItem;
  colourName: string;
  colourNumber: string;
  hex: string;
  coats: number;
  parts: SurfacePart[];
  measuredSqft: number;
  coatSqft: number;
  /** Rate used for sound surfaces (or the override). */
  rate: number;
  source: CoverageSource;
  /** Extra rates used for other surface conditions. */
  conditionRates: { condition: SurfaceCondition; rate: number }[];
  waste: number;
  wasteOverride?: { value: number; reason: string };
  /** Unrounded base need, carried at full precision (Rule 6). */
  baseNeedGal: number;
  /** base × (1 + waste), unrounded. The adjustment baseline (18 System Validations). */
  unroundedNeedGal: number;
  /** Rounded once to three decimals before packing (Rule 6). */
  calculatedNeedGal: number;
  adjustment?: DemandAdjustment;
  pendingAdjustment?: DemandAdjustment;
  /** Need used for packing and ordering: the applied adjustment, else calculated. */
  needGal: number;
  packs: PackResult;
  /** Reasons the line cannot be ordered. Empty means orderable. */
  blocked: string[];
}

function latest<T extends { at: string }>(list: T[]): T | undefined {
  return [...list].sort((a, b) => b.at.localeCompare(a.at))[0];
}

/** Calculate one specification's demand from the job's measured surfaces. */
export function specDemand(db: Database, spec: SpecLine): DemandLine {
  const colour = db.colours.find((c) => c.id === spec.colourId);
  const catalog = db.catalog.find((c) => c.product === spec.product);
  const overrides = (db.materialOverrides ?? []).filter((o) => o.jobId === spec.jobId && o.specId === spec.id);
  const coverageOverride = latest(overrides.filter((o) => o.kind === "coverage"));
  const wasteOverride = latest(overrides.filter((o) => o.kind === "waste"));
  const coats = spec.coats ?? 0;
  const blocked: string[] = [];

  // Coverage precedence: project override > field rate > manufacturer spread rate.
  const soundRate = coverageOverride?.value ?? catalog?.fieldRate ?? catalog?.spreadRate ?? 0;
  const source: CoverageSource = coverageOverride ? "override" : catalog?.fieldRate ? "field_rate" : "manufacturer";

  const parts: SurfacePart[] = spec.surfaceIds
    .map((id) => db.surfaces.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s && !s.removedAt)
    .map((s) => {
      const area = db.areas.find((a) => a.id === s.areaId);
      const coatSqft = s.areaSqft * coats;
      let rate = soundRate;
      let partSource: SurfacePart["source"] = source;
      // A non-sound condition never inherits the sound-repaint rate (18.1).
      if (!coverageOverride && s.condition !== "sound") {
        const r = catalog?.conditionRates?.[s.condition];
        rate = r ?? 0;
        partSource = r ? "condition_rule" : "missing";
      }
      return {
        surfaceId: s.id,
        name: s.name,
        areaName: area?.name ?? "",
        kind: area?.kind ?? "interior",
        condition: s.condition,
        sqft: s.areaSqft,
        coatSqft,
        rate,
        source: rate > 0 ? partSource : "missing",
        baseNeedGal: rate > 0 ? coatSqft / rate : 0,
      };
    });

  const measuredSqft = parts.reduce((a, p) => a + p.sqft, 0);
  const coatSqft = parts.reduce((a, p) => a + p.coatSqft, 0);
  const baseNeedGal = parts.reduce((a, p) => a + p.baseNeedGal, 0);
  const ruleWaste = wasteAllowance({ kind: parts.some((p) => p.kind === "exterior") ? "exterior" : "interior", conditions: parts.map((p) => p.condition) });
  const waste = wasteOverride?.value ?? ruleWaste;
  const unroundedNeedGal = baseNeedGal * (1 + waste);
  const calculatedNeedGal = roundHalfUp(unroundedNeedGal, 3);

  const adjustments = db.demandAdjustments.filter((a) => a.jobId === spec.jobId && a.specId === spec.id);
  const adjustment = latest(adjustments.filter((a) => a.status === "applied"));
  const pendingAdjustment = latest(adjustments.filter((a) => a.status === "pending_approval"));
  const needGal = adjustment ? roundHalfUp(adjustment.proposedGal, 3) : calculatedNeedGal;

  // Ordering blocks (18 System Validations, 18.5).
  if (spec.state !== "approved") blocked.push(spec.state === "pending_sample" ? "Colour unresolved — custom sample not accepted" : "Scope not approved by the customer");
  if (!spec.productLine) blocked.push("Product line missing on the colour card");
  if (!spec.product) blocked.push("Specific product missing on the colour card");
  if (!spec.tintBase) blocked.push("Tint base missing on the colour card");
  if (spec.product && !catalog) blocked.push(`"${spec.product}" is not in the product library`);
  if (parts.length === 0) blocked.push("No surfaces assigned");
  if (coats < 1) blocked.push("Coats missing");
  for (const p of catalog ? parts : []) {
    if (p.rate <= 0) blocked.push(`Coverage missing or zero on ${p.areaName} · ${p.name} (${CONDITION_LABEL[p.condition]})`);
  }
  if (catalog && catalog.available.length === 0) {
    blocked.push("No pack sizes are marked available for this product. The office manager must set availability before ordering.");
  }

  const strategy = db.procurementSettings?.packingStrategy ?? "least_leftover";
  const packs = packContainers(needGal, catalog?.available ?? [], { strategy, cost: catalog?.cost });

  const conditionRates = Array.from(new Set(parts.filter((p) => p.condition !== "sound" && p.rate > 0).map((p) => p.condition))).map((condition) => ({
    condition,
    rate: parts.find((p) => p.condition === condition)!.rate,
  }));

  return {
    specId: spec.id,
    jobId: spec.jobId,
    spec,
    catalog,
    colourName: colour?.name ?? "Unknown colour",
    colourNumber: colour?.number ?? "",
    hex: colour?.hex ?? "#CBD5E1",
    coats,
    parts,
    measuredSqft,
    coatSqft,
    rate: soundRate,
    source,
    conditionRates,
    waste,
    wasteOverride: wasteOverride ? { value: wasteOverride.value, reason: wasteOverride.reason } : undefined,
    baseNeedGal,
    unroundedNeedGal,
    calculatedNeedGal,
    adjustment,
    pendingAdjustment,
    needGal,
    packs,
    blocked,
  };
}

/** All demand lines for a job (superseded specs are left out). */
export function jobDemand(db: Database, jobId: string): DemandLine[] {
  return db.specs.filter((s) => s.jobId === jobId && s.state !== "superseded").map((s) => specDemand(db, s));
}

/** Snapshot shape used for the stale check (18.1). */
export function snapshotLines(lines: DemandLine[]) {
  return lines.map((l) => ({ specId: l.specId, rate: l.rate, source: l.source, waste: l.waste, coatSqft: l.coatSqft, adjustedNeedGal: l.calculatedNeedGal }));
}

/** True when the live calculation no longer matches the last accepted one. */
export function isStale(snapshot: { lines: { specId: string; rate: number; waste: number; coatSqft: number; adjustedNeedGal: number }[] } | undefined, lines: DemandLine[]): boolean {
  if (!snapshot) return false;
  const live = snapshotLines(lines);
  if (live.length !== snapshot.lines.length) return true;
  return live.some((l) => {
    const s = snapshot.lines.find((x) => x.specId === l.specId);
    return !s || s.rate !== l.rate || s.waste !== l.waste || s.coatSqft !== l.coatSqft || s.adjustedNeedGal !== l.adjustedNeedGal;
  });
}

/** Coverage or cost changed since the estimate was approved (18.A15). */
export function assumptionChanges(db: Database, jobId: string, lines: DemandLine[]) {
  const basis = (db.estimateBases ?? []).find((b) => b.jobId === jobId);
  if (!basis) return [];
  return lines.flatMap((l) => {
    const b = basis.lines.find((x) => x.specId === l.specId);
    if (!b) return [];
    const currentCost = l.catalog?.cost.gal ?? 0;
    const rateChanged = b.rate !== l.rate;
    const costChanged = b.costPerGal !== currentCost;
    return rateChanged || costChanged
      ? [{ specId: l.specId, label: `${l.colourName} · ${l.spec.product ?? ""}`, approvedRate: b.rate, currentRate: l.rate, approvedCost: b.costPerGal, currentCost, rateChanged, costChanged }]
      : [];
  });
}

/* ------------------------------------------------------------------ */
/* Consumables (18 System Validations, 18.Q02)                         */
/* ------------------------------------------------------------------ */

export function jobConsumables(db: Database, job: Job) {
  const surfaces = job.surfaceIds.map((id) => db.surfaces.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s && !s.removedAt);
  const areas = Array.from(new Set(surfaces.map((s) => s.areaId))).map((id) => db.areas.find((a) => a.id === id)!).filter(Boolean);
  const interiorRooms = areas.filter((a) => a.kind === "interior");
  const exteriorSqft = surfaces.filter((s) => db.areas.find((a) => a.id === s.areaId)?.kind === "exterior").reduce((a, s) => a + s.areaSqft, 0);
  const hasExterior = areas.some((a) => a.kind === "exterior");
  const totals = consumablesAllowance({ interiorRooms, exteriorSqft, hasExterior });
  return {
    rooms: interiorRooms.map((r) => ({ id: r.id, name: r.name, neverPainted: !!r.neverPainted, amount: r.neverPainted ? 55 : 35 })),
    exteriorSqft,
    hasExterior,
    exteriorBase: hasExterior ? 150 : 0,
    exteriorPerThousand: hasExterior ? roundMoney((25 * exteriorSqft) / 1000) : 0,
    ...totals,
  };
}

/* ------------------------------------------------------------------ */
/* Shelf stock (18.3)                                                  */
/* ------------------------------------------------------------------ */

export const SHELF_MAX_AGE_DAYS = 730;

export function shelfAgeDays(stock: ShelfStock, nowIso: string): number {
  return Math.floor((new Date(nowIso).getTime() - new Date(stock.tintDate ?? stock.purchaseDate).getTime()) / DAY_MS);
}

export function shelfMatches(stock: ShelfStock, target: { product?: string; colourNumber: string; sheen?: string }): boolean {
  return stock.product === target.product && stock.colourNumber === target.colourNumber && stock.sheen === target.sheen;
}

export type ShelfState = "proposed" | "reserved_here" | "reserved_elsewhere" | "rejected" | "too_old" | "unsealed";

export interface ShelfCandidate {
  stock: ShelfStock;
  state: ShelfState;
  ageDays: number;
  reason?: string;
}

/**
 * Shelf stock for one demand line. Only matching product, colour and sheen,
 * sealed and under two years old is proposed. Stock reserved elsewhere is
 * shown but not selectable.
 */
export function shelfCandidates(db: Database, line: Pick<DemandLine, "jobId" | "colourNumber" | "spec">, nowIso: string): ShelfCandidate[] {
  return db.shelfStock
    .filter((s) => shelfMatches(s, { product: line.spec.product, colourNumber: line.colourNumber, sheen: line.spec.sheen }))
    .map((stock) => {
      const ageDays = shelfAgeDays(stock, nowIso);
      const rejection = stock.rejections?.find((r) => r.jobId === line.jobId);
      let state: ShelfState;
      let reason: string | undefined;
      if (stock.reservedJobId === line.jobId) state = "reserved_here";
      else if (stock.reservedJobId) {
        state = "reserved_elsewhere";
        reason = `Reserved to ${stock.reservedJobId}`;
      } else if (!stock.sealed) {
        state = "unsealed";
        reason = "Container opened — only sealed stock is proposed";
      } else if (ageDays >= SHELF_MAX_AGE_DAYS) {
        state = "too_old";
        reason = `${Math.floor(ageDays / 30.44)} months old — over the two-year limit`;
      } else if (rejection) {
        state = "rejected";
        reason = rejection.reason;
      } else state = "proposed";
      return { stock, state, ageDays, reason };
    });
}

/** Measured quantity must be a positive quarter-gallon step. */
export function isQuarterGallon(q: number): boolean {
  return q > 0 && Math.abs(q * 4 - Math.round(q * 4)) < 1e-9;
}

/* ------------------------------------------------------------------ */
/* Quantity states — Cross-Feature Rule 2 (18.4)                       */
/* ------------------------------------------------------------------ */

const OPEN_UNSENT: POStatus[] = ["issued"];

export interface LineState extends DemandBalance {
  calculated: number;
  reservedShelf: number;
  sentUnacknowledged: number;
  acknowledged: number;
  confirmedCancellations: number;
  confirmedReturns: number;
  received: number;
  /** Acknowledged but not yet received (and not cancelled). */
  unfilled: number;
  /** Cancellation requests not yet confirmed by the branch. They change nothing. */
  requestedCancellations: number;
  orders: { poId: string; lineId: string; status: string; gallons: number }[];
}

export function lineState(db: Database, jobId: string, specId: string, calculated: number): LineState {
  const spec = db.specs.find((s) => s.id === specId);
  const colour = spec && db.colours.find((c) => c.id === spec.colourId);
  const reservedShelf = db.shelfStock
    .filter((s) => s.reservedJobId === jobId && spec && colour && shelfMatches(s, { product: spec.product, colourNumber: colour.number, sheen: spec.sheen }))
    .reduce((a, s) => a + (s.measuredGal ?? 0), 0);

  let sentUnacknowledged = 0;
  let acknowledged = 0;
  let confirmedCancellations = 0;
  let confirmedReturns = 0;
  let received = 0;
  let requestedCancellations = 0;
  const orders: LineState["orders"] = [];

  for (const po of db.purchaseOrders.filter((p) => p.jobId === jobId)) {
    for (const line of po.lines.filter((l) => l.specId === specId)) {
      orders.push({ poId: po.id, lineId: line.id, status: line.status, gallons: line.gallons });
      received += line.receivedGal;
      requestedCancellations += (po.cancellations ?? []).filter((c) => c.lineId === line.id && !c.confirmedAt).reduce((a, c) => a + c.qtyGal, 0);
      if (po.ackAt) {
        acknowledged += line.gallons;
        confirmedCancellations += line.cancelledGal;
        confirmedReturns += line.returnedGal;
      } else if (po.status === "sent" || OPEN_UNSENT.includes(po.status)) {
        // A send is not an acknowledgment: held, not netted (Rule 2).
        sentUnacknowledged += Math.max(0, line.gallons - line.cancelledGal);
      }
    }
  }
  const balance = demandBalance({ calculated, reservedShelf, acknowledged, confirmedCancellations, confirmedReturns, sentUnacknowledged });
  const unfilled = Math.max(0, acknowledged - confirmedCancellations - received);
  return {
    calculated,
    reservedShelf,
    sentUnacknowledged,
    acknowledged,
    confirmedCancellations,
    confirmedReturns,
    received,
    unfilled,
    requestedCancellations,
    orders,
    ...balance,
    outstanding: roundHalfUp(balance.outstanding, 3),
    orderableNow: roundHalfUp(balance.orderableNow, 3),
  };
}

/* ------------------------------------------------------------------ */
/* Order values and the limit check (18 System Validations, 18.Q03)    */
/* ------------------------------------------------------------------ */

export function lineValue(l: Pick<POLine, "gallons" | "unitCostPerGal">): number {
  return roundMoney(l.gallons * l.unitCostPerGal);
}

export function poValue(po: PurchaseOrder): number {
  return roundMoney(po.lines.reduce((a, l) => a + l.gallons * l.unitCostPerGal, 0));
}

/** Confirmed cancellations and issued credits. Unconfirmed requests count for nothing. */
export function poCredits(po: PurchaseOrder): number {
  return roundMoney(po.lines.reduce((a, l) => a + l.cancelledGal * l.unitCostPerGal + l.creditAmount, 0));
}

export function packsCost(packs: { size: PackSize; count: number }[], cost: Partial<Record<PackSize, number>> = {}): number {
  return roundMoney(packs.reduce((a, p) => a + p.count * (cost[p.size] ?? 0), 0));
}

export interface OrderValueEntry {
  createdAt: string;
  value: number;
  credits: number;
}

const ESTIMATOR_ROLES: Role[] = ["estimator", "senior_estimator"];

/**
 * Limit check (18.5). Estimators: $1,500 pre-tax over a rolling seven
 * calendar days counted back from the new order date, same job. Anyone:
 * lifetime job purchasing above $3,000 needs the owner.
 */
export function limitCheck(opts: { entries: OrderValueEntry[]; newValue: number; orderDate: string; requesterRole: Role }): Omit<LimitCheckResult, "checkedAt"> {
  const windowStart = new Date(opts.orderDate).getTime() - 7 * DAY_MS;
  const net = (e: OrderValueEntry) => e.value - e.credits;
  const windowTotal = roundMoney(opts.entries.filter((e) => new Date(e.createdAt).getTime() >= windowStart).reduce((a, e) => a + net(e), 0) + opts.newValue);
  const lifetimeTotal = roundMoney(opts.entries.reduce((a, e) => a + net(e), 0) + opts.newValue);
  const estimatorPass = windowTotal <= ESTIMATOR_ORDER_LIMIT + 1e-9;
  const isEstimator = ESTIMATOR_ROLES.includes(opts.requesterRole);
  const needs: LimitCheckResult["needs"] =
    lifetimeTotal > OWNER_LIFETIME_LIMIT + 1e-9 ? "owner" : isEstimator && !estimatorPass ? "office_manager" : "none";
  return { orderValue: roundMoney(opts.newValue), windowTotal, lifetimeTotal, estimatorPass, needs };
}

/** Existing orders and pending requests for a job, as limit-check entries. */
export function jobOrderEntries(db: Database, jobId: string): OrderValueEntry[] {
  const pos = db.purchaseOrders.filter((p) => p.jobId === jobId && p.status !== "preliminary").map((p) => ({ createdAt: p.createdAt, value: poValue(p), credits: poCredits(p) }));
  const reqs = (db.orderRequests ?? [])
    .filter((r) => r.jobId === jobId && r.status === "requested")
    .map((r) => ({ createdAt: r.requestedAt, value: r.limit.orderValue, credits: 0 }));
  return [...pos, ...reqs];
}

/** Next number on the JOB-PO-01 sequence: JOB-2026-1-PO-02. */
export function nextPoNumber(db: Database, jobId: string): string {
  const max = db.purchaseOrders
    .filter((p) => p.jobId === jobId)
    .map((p) => Number(p.id.match(/-PO-(\d+)$/)?.[1] ?? 0))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${jobId}-PO-${String(max + 1).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Receiving (18.Q04)                                                  */
/* ------------------------------------------------------------------ */

/** Split the over-receipt created by one new receipt into job cost and shelf. */
export function routeReceipt(orderedGal: number, alreadyReceived: number, qty: number) {
  const route = (total: number) => {
    const over = Math.max(0, total - orderedGal);
    const pct = orderedGal > 0 ? over / orderedGal : 0;
    if (pct <= 0.1 + 1e-9) return { job: over, shelf: 0 };
    return { job: orderedGal * 0.1, shelf: over - orderedGal * 0.1 };
  };
  const before = route(alreadyReceived);
  const after = route(alreadyReceived + qty);
  const overGal = roundHalfUp(after.job + after.shelf - before.job - before.shelf, 3);
  const total = alreadyReceived + qty;
  return {
    overGal,
    overPct: orderedGal > 0 ? Math.max(0, total - orderedGal) / orderedGal : 0,
    toJobCostGal: roundHalfUp(after.job - before.job, 3),
    toShelfGal: roundHalfUp(after.shelf - before.shelf, 3),
  };
}

/* ------------------------------------------------------------------ */
/* Supplier order status (19)                                          */
/* ------------------------------------------------------------------ */

const KNOWN_TEXT: Record<string, LineStatus> = {
  "received": "received",
  "order received": "received",
  "processing": "processing",
  "in process": "processing",
  "substitute available": "substitute_available",
  "substitute offered": "substitute_available",
  "ready for pickup": "ready_for_pickup",
  "ready": "ready_for_pickup",
  "picked up": "picked_up",
  "delivered": "picked_up",
  "picked up / delivered": "picked_up",
  "fulfilled": "picked_up",
  "partially filled": "partially_filled",
  "partial": "partially_filled",
  "problem": "problem",
};

/**
 * Supplier text is mapped only when it matches a known status exactly.
 * Anything else is kept verbatim for human review and no status is inferred.
 */
export function interpretSupplierStatus(text: string): LineStatus | null {
  return KNOWN_TEXT[text.trim().toLowerCase()] ?? null;
}

/** Order status from its lines. One ready line never marks the order fulfilled. */
export function aggregateStatus(po: Pick<PurchaseOrder, "status" | "ackAt" | "lines">): POStatus {
  if (["preliminary", "draft", "pending_approval", "issued", "cancelled"].includes(po.status)) return po.status;
  if (!po.ackAt) return "sent";
  const active = po.lines.filter((l) => l.status !== "cancelled");
  if (active.length === 0) return "cancelled";
  if (active.some((l) => l.status === "problem")) return "problem";
  // A substitute offer needs a decision before the order can progress.
  if (active.some((l) => l.status === "substitute_available")) return "substitute_available";
  if (active.every((l) => l.status === "picked_up")) return "picked_up";
  if (active.some((l) => l.status === "partially_filled" || l.status === "picked_up")) return "partially_filled";
  if (active.every((l) => l.status === "ready_for_pickup")) return "ready_for_pickup";
  if (active.some((l) => l.status === "processing")) return "processing";
  if (active.some((l) => l.status === "received")) return "received";
  return "acknowledged";
}

export type EscalationStep = "sender" | "office_manager" | "owner";
export const ESCALATION_LABEL: Record<EscalationStep, string> = { sender: "Sender", office_manager: "Office manager", owner: "Business owner" };

/**
 * Four-working-hour acknowledgment exception (19.4). The sender owns the
 * follow-up. If the sender is absent it routes to the office manager, then to
 * the owner when still unactioned after another four working hours.
 */
export function ackException(po: PurchaseOrder, users: User[], nowIso: string) {
  const waiting = po.status === "sent" && !po.ackAt;
  const since = po.resentAt ?? po.sentAt;
  if (!waiting || !since) return undefined;
  const clock = ackClock(since, nowIso);
  const sender = users.find((u) => u.id === po.sentBy);
  const office = users.find((u) => u.role === "office_manager");
  const owner = users.find((u) => u.role === "owner");
  const order: EscalationStep[] = ["sender", "office_manager", "owner"];
  let step: EscalationStep = po.escalation ?? "sender";
  if (step === "sender" && sender?.outOfOffice) step = "office_manager";
  if (step === "office_manager" && (office?.outOfOffice || (sender?.outOfOffice && clock.usedMinutes >= 8 * 60))) step = "owner";
  const responsible = step === "sender" ? sender : step === "office_manager" ? office : owner;
  const next = order[order.indexOf(step) + 1];
  return { ...clock, step, responsible, senderAbsent: !!sender?.outOfOffice, next };
}

/* ------------------------------------------------------------------ */
/* Delivery changes and replacements (19 System Validations)           */
/* ------------------------------------------------------------------ */

export function deliveryChangeApprover(fromIso: string, toIso: string): { days: number; needs: "office_manager" | "owner" } {
  const days = Math.round(Math.abs(new Date(toIso).getTime() - new Date(fromIso).getTime()) / DAY_MS);
  return { days, needs: days <= 3 ? "office_manager" : "owner" };
}

export const REPLACEMENT_LINE_PCT = 0.1;
export const REPLACEMENT_ORDER_TOTAL = 200;

/**
 * Replacement authority (19.A11) on top of Rule 1. Structural changes (brand,
 * product line, colour, sheen, or a product that is not a published direct
 * successor) need a priced change order. Otherwise the office manager
 * approves alone, unless the line rises more than 10% over the approved PO
 * price or the order total rises more than $200 — then the owner approves.
 */
export function replacementDecision(opts: {
  before: Selection;
  after: Selection;
  jobSigned: boolean;
  isDirectSuccessor: boolean;
  approvedCostPerGal: number;
  orderTotalDelta: number;
}): { decision: "office_manager" | "owner" | "change_order"; pct: number; reason: string } {
  const structural = classifyChange(opts.before, { ...opts.after, costPerGal: opts.before.costPerGal }, {
    jobSigned: opts.jobSigned,
    tintedOrOrdered: true,
    priceChanges: false,
    isDirectSuccessor: opts.isDirectSuccessor,
  });
  const pct = opts.approvedCostPerGal > 0 ? (opts.after.costPerGal - opts.approvedCostPerGal) / opts.approvedCostPerGal : 0;
  if (structural.kind === "change_order" || structural.kind === "colour_reapproval") {
    return { decision: "change_order", pct, reason: structural.kind === "change_order" ? structural.reason : "Colour change on an ordered line needs a priced change order." };
  }
  const reasons: string[] = [];
  if (pct > REPLACEMENT_LINE_PCT + 1e-9) reasons.push(`line price up ${(pct * 100).toFixed(1)}% over the approved PO price (limit 10%)`);
  if (opts.orderTotalDelta > REPLACEMENT_ORDER_TOTAL + 1e-9) reasons.push(`order total up $${opts.orderTotalDelta.toFixed(2)} (limit $200)`);
  if (reasons.length) return { decision: "owner", pct, reason: `Owner approval required: ${reasons.join("; ")}.` };
  return { decision: "office_manager", pct, reason: "Same brand, line, colour and sheen within the thresholds. The office manager approves alone; no customer document." };
}

/* ------------------------------------------------------------------ */
/* Branch setup and product mapping (19.1, 19.2)                       */
/* ------------------------------------------------------------------ */

/** Fields a branch still needs before it can receive orders. */
export function branchGaps(b: { name: string; storeNumber: string; accountNumber: string; phone: string }): { field: string; label: string }[] {
  const gaps: { field: string; label: string }[] = [];
  if (!b.name.trim()) gaps.push({ field: "name", label: "Branch name" });
  if (!b.storeNumber.trim()) gaps.push({ field: "storeNumber", label: "Store number" });
  if (!b.accountNumber.trim()) gaps.push({ field: "accountNumber", label: "Account number" });
  if (!b.phone.trim()) gaps.push({ field: "phone", label: "Phone" });
  return gaps;
}

/** Store item code for a product and pack size at a branch, if mapped. */
export function itemCodeFor(db: Database, opts: { product: string; packSize: PackSize; branchId?: string }): string | undefined {
  const cat = db.catalog.find((c) => c.product === opts.product);
  if (!cat) return undefined;
  const maps = (db.productMappings ?? []).filter((m) => m.catalogId === cat.id && m.packSize === opts.packSize);
  return (maps.find((m) => m.branchId && m.branchId === opts.branchId) ?? maps.find((m) => !m.branchId))?.itemCode;
}

export interface LineIdentity {
  manufacturer?: string;
  productLine?: string;
  colourName: string;
  colourNumber?: string;
  tintBase?: string;
}

/**
 * Manufacturer, colour name, colour number and tint base for an order line.
 * Values stored on the line win; older lines fall back to the catalogue and
 * the linked colour card spec.
 */
export function lineIdentity(db: Pick<Database, "catalog" | "specs" | "colours">, l: POLine): LineIdentity {
  const spec = l.specId ? db.specs.find((s) => s.id === l.specId) : undefined;
  const colour = spec ? db.colours.find((c) => c.id === spec.colourId) : undefined;
  const cat = db.catalog.find((c) => c.product === l.product);
  return {
    manufacturer: l.manufacturer ?? cat?.manufacturer ?? colour?.manufacturer,
    productLine: l.productLine ?? cat?.productLine ?? spec?.productLine,
    colourName: l.colourName ?? colour?.name ?? l.colourLabel,
    colourNumber: l.colourNumber ?? colour?.number,
    tintBase: l.tintBase ?? spec?.tintBase,
  };
}

/** Orders that still hold an active commitment (not closed or cancelled). */
export function isOpenOrder(po: PurchaseOrder): boolean {
  return !["cancelled", "picked_up", "preliminary"].includes(aggregateStatus(po)) && po.status !== "cancelled";
}
