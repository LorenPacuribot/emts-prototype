/**
 * Feature 28 — Future Estimating And Touch-Up Reordering.
 *
 * Pure rules, no database access. Screens and store actions both call these,
 * so the UI and the validation always agree.
 */
import type { PackResult } from "./materials";
import type { PackSize, PropertyType, SurfaceType } from "@/features/types";
import { PACK_GALLONS, packContainers } from "./materials";
import { addDays, isHoliday } from "./dates";
import { roundHalfUp, roundMoney } from "./rounding";
import { classifyChange, type Selection } from "./change-rule";

/* ------------------------------------------------------------------ */
/* Inspection gate (Component 28.2)                                    */
/* ------------------------------------------------------------------ */

/** A small interior is one room, or no more than 400 sq ft of walls and ceilings. */
export const SMALL_INTERIOR_MAX_SQFT = 400;

export function isSmallInterior(opts: { rooms: number; wallCeilingSqft: number }): boolean {
  return opts.rooms <= 1 || opts.wallCeilingSqft <= SMALL_INTERIOR_MAX_SQFT;
}

export interface InspectionEvidence {
  path: "site_visit" | "small_interior";
  visitDate?: string;
  measurementDate?: string;
  photos: number;
  callDate?: string;
  callNote?: string;
}

export interface GateInput {
  /** Any copied line is on an exterior area. */
  hasExterior: boolean;
  /** Distinct interior rooms in the estimate. */
  rooms: number;
  /** Walls and ceilings only, interior. */
  wallCeilingSqft: number;
  inspection?: InspectionEvidence;
}

export interface GateResult {
  met: boolean;
  /** Is the small-interior path available for this scope? */
  smallInteriorAvailable: boolean;
  reasons: string[];
  summary?: string;
}

/**
 * Evaluated at issue time, not draft time, so the estimator can build first
 * and inspect after.
 */
export function evaluateInspectionGate(input: GateInput): GateResult {
  const smallInteriorAvailable = !input.hasExterior && isSmallInterior(input);
  const i = input.inspection;
  const reasons: string[] = [];
  if (!i) {
    reasons.push(input.hasExterior ? "Inspection evidence required: exterior work needs a saved site visit with a measurement date and at least one photograph." : "Inspection evidence required: record a site visit, or photographs and a phone call for a small interior.");
    return { met: false, smallInteriorAvailable, reasons };
  }
  if (i.path === "small_interior") {
    if (input.hasExterior) reasons.push("Exterior work needs a saved site visit. The small-interior path does not apply.");
    else if (!smallInteriorAvailable) reasons.push(`Small-interior path unavailable: ${input.wallCeilingSqft} sq ft of walls and ceilings across ${input.rooms} rooms is over ${SMALL_INTERIOR_MAX_SQFT} sq ft. A site visit is required.`);
    if (i.photos < 1) reasons.push("At least one photograph is required.");
    if (!i.callDate) reasons.push("A recorded phone call is required.");
    return {
      met: reasons.length === 0,
      smallInteriorAvailable,
      reasons,
      summary: reasons.length === 0 ? `Small interior: ${i.photos} photograph${i.photos === 1 ? "" : "s"} and a call on ${i.callDate?.slice(0, 10)}. Area ${input.wallCeilingSqft} sq ft.` : undefined,
    };
  }
  if (!i.visitDate) reasons.push("Site visit date is required.");
  if (!i.measurementDate) reasons.push("Measurement date is required.");
  if (i.photos < 1) reasons.push("At least one photograph is required.");
  return {
    met: reasons.length === 0,
    smallInteriorAvailable,
    reasons,
    summary: reasons.length === 0 ? `Site visit ${i.visitDate?.slice(0, 10)}, measured ${i.measurementDate?.slice(0, 10)}, ${i.photos} photograph${i.photos === 1 ? "" : "s"}.` : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Reconfirmation and issue                                            */
/* ------------------------------------------------------------------ */

export interface ReconfirmLine {
  newQtyGal?: number;
  prep?: string;
  condition?: string;
  price?: number;
}

/** Fields still missing before a line can be reconfirmed. */
export function reconfirmGaps(line: ReconfirmLine): ("quantity" | "preparation" | "condition" | "price")[] {
  const gaps: ("quantity" | "preparation" | "condition" | "price")[] = [];
  if (line.newQtyGal === undefined || !(line.newQtyGal > 0)) gaps.push("quantity");
  if (!line.prep) gaps.push("preparation");
  if (!line.condition) gaps.push("condition");
  if (line.price === undefined || !(line.price > 0)) gaps.push("price");
  return gaps;
}

export const DIFFERING_CONDITIONS_CLAUSE =
  "This quote is based on the conditions observed at inspection. If conditions found during the work differ from those observed, a written change order must be approved by you before the changed work proceeds.";

/* ------------------------------------------------------------------ */
/* Quote validity                                                      */
/* ------------------------------------------------------------------ */

export const QUOTE_VALIDITY_DAYS = 30;

export function quoteValidUntil(issuedAtIso: string): string {
  return addDays(issuedAtIso, QUOTE_VALIDITY_DAYS);
}

/** A quote issued 31 days ago is expired. */
export function isQuoteExpired(validUntilIso: string | undefined, nowIso: string): boolean {
  if (!validUntilIso) return false;
  return new Date(nowIso).getTime() > new Date(validUntilIso).getTime();
}

/* ------------------------------------------------------------------ */
/* Pricing basis and productivity (Component 28.3)                     */
/* ------------------------------------------------------------------ */

/** Current settings (Settings > Labor Config / Financial Settings). Always current, never historical. */
export const CURRENT_BASIS = {
  wageRate: 48,
  wageSource: "Settings > Labor Config (estimating labor rate)",
  markupPct: 45,
  markupSource: "Settings > Goals & Profit",
  taxRatePct: 8.25,
  taxSource: "Settings > Tax Regions (Texas, combined)",
};

/** Current production rates, sq ft per labour hour per coat. */
export const CURRENT_PRODUCTIVITY: Record<SurfaceType, number> = {
  walls: 175,
  ceiling: 150,
  trim: 55,
  door: 30,
  body: 140,
  siding: 130,
  cabinets: 25,
};

export const PREP_LABOUR_FACTOR = { standard: 1, extra_scrape: 1.25, full_prime: 1.5 } as const;
export const CONDITION_LABOUR_FACTOR = { good: 1, fair: 1.1, poor: 1.25 } as const;
export const PREP_LABEL = { standard: "Standard", extra_scrape: "Extra scrape & sand", full_prime: "Full prime" } as const;
export const CONDITION_LABEL = { good: "Good", fair: "Fair", poor: "Poor" } as const;

export const HISTORICAL_RATE_WARN_MONTHS = 18;

/** Whole months between two dates (floor). */
export function monthsBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso);
  const b = new Date(toIso);
  let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) m -= 1;
  return Math.max(0, m);
}

/** Historical rate from recorded actual hours, or undefined when missing (never guessed). */
export function historicalRate(opts: { sqft: number; coats: number; actualHours?: number }): number | undefined {
  if (!opts.actualHours || opts.actualHours <= 0) return undefined;
  return (opts.sqft * opts.coats) / opts.actualHours;
}

export interface ProductivityDecision {
  /** Rate used, sq ft per hour per coat. */
  rate: number;
  source: "historical" | "current";
  /** Historical requested but missing: explicit fallback to current. */
  fallback: boolean;
  ageMonths?: number;
  stale: boolean;
}

export function chooseProductivity(opts: {
  useHistorical: boolean;
  policyApproved: boolean;
  surfaceType: SurfaceType;
  historical?: number;
  historicalDate?: string;
  nowIso: string;
}): ProductivityDecision {
  const current = CURRENT_PRODUCTIVITY[opts.surfaceType];
  if (!opts.useHistorical || !opts.policyApproved) return { rate: current, source: "current", fallback: false, stale: false };
  if (opts.historical === undefined || !opts.historicalDate) return { rate: current, source: "current", fallback: true, stale: false };
  const ageMonths = monthsBetween(opts.historicalDate, opts.nowIso);
  return { rate: opts.historical, source: "historical", fallback: false, ageMonths, stale: ageMonths > HISTORICAL_RATE_WARN_MONTHS };
}

/** Policy gate: historical productivity reuse needs an owner-approved policy for the property type. */
export function productivityAllowed(policies: { propertyType: PropertyType }[], type: PropertyType): boolean {
  return policies.some((p) => p.propertyType === type);
}

export const NO_POLICY_MESSAGE = "Historical productivity reuse is not approved for this property type.";

export interface LinePriceInput {
  sqft: number;
  coats: number;
  surfaceType: SurfaceType;
  rate: number;
  wageRate: number;
  markupPct: number;
  /** Current catalog cost per gallon. Undefined when the product has no current price. */
  materialCostPerGal?: number;
  /** Gallons used for the material cost: the estimator's new quantity. */
  gallons?: number;
  prep?: keyof typeof PREP_LABOUR_FACTOR;
  condition?: keyof typeof CONDITION_LABOUR_FACTOR;
}

export interface LinePrice {
  hours: number;
  labour: number;
  material: number;
  cost: number;
  price: number;
  missingMaterialPrice: boolean;
}

/**
 * Suggested line price at today's costs. No historical discount, ever.
 * Full precision until the final money rounding (Rule 6).
 */
export function priceLine(i: LinePriceInput): LinePrice {
  const prepF = PREP_LABOUR_FACTOR[i.prep ?? "standard"];
  const condF = CONDITION_LABOUR_FACTOR[i.condition ?? "good"];
  const hours = i.rate > 0 ? ((i.sqft * i.coats) / i.rate) * prepF * condF : 0;
  const labour = hours * i.wageRate;
  const material = (i.gallons ?? 0) * (i.materialCostPerGal ?? 0);
  const cost = labour + material;
  return {
    hours: roundHalfUp(hours, 2),
    labour: roundMoney(labour),
    material: roundMoney(material),
    cost: roundMoney(cost),
    price: roundMoney(cost * (1 + i.markupPct / 100)),
    missingMaterialPrice: i.materialCostPerGal === undefined,
  };
}

/** Quote totals. Tax at the current rate. A source-job discount is never applied. */
export function quoteTotals(prices: number[], taxRatePct: number) {
  const subtotal = roundMoney(prices.reduce((a, b) => a + b, 0));
  const tax = roundMoney((subtotal * taxRatePct) / 100);
  return { subtotal, tax, total: roundMoney(subtotal + tax) };
}

/* ------------------------------------------------------------------ */
/* Discontinued replacement (Rule 1)                                   */
/* ------------------------------------------------------------------ */

export function classifyReplacement(before: Selection, after: Selection, isDirectSuccessor: boolean) {
  // Repeat work is treated like signed scope: a brand, line, colour or sheen
  // change always needs a priced change order, even when it began as a reorder.
  const decision = classifyChange(before, after, {
    jobSigned: true,
    tintedOrOrdered: true,
    priceChanges: before.costPerGal !== after.costPerGal,
    isDirectSuccessor,
  });
  const approver: "office" | "owner" = decision.kind === "office_approval" ? "office" : "owner";
  const document: "None" | "ChangeOrder" = decision.kind === "change_order" ? "ChangeOrder" : "None";
  return { decision, approver, document };
}

/* ------------------------------------------------------------------ */
/* Touch-up reorder quantity (Component 28.4)                          */
/* ------------------------------------------------------------------ */

export const TOUCH_UP_MAX_GAL = 2;
export const TOUCH_UP_MIN_GAL = 0.25; // one quart
export const NON_TOUCH_UP_MIN_GAL = 1;

export interface ReorderQuantity {
  ok: boolean;
  error?: string;
  /** Quantity actually packed after minimums. */
  orderGal: number;
  packs: PackResult["packs"];
  excessGal: number;
  /** Plain explanation of any raise or excess. */
  note?: string;
  /** Non-touch-up excess goes to shelf stock. */
  excessToShelf: boolean;
}

export function reorderQuantity(opts: { requestedGal: number; purpose: "touch_up" | "non_touch_up"; available: PackSize[] }): ReorderQuantity {
  const empty = { orderGal: 0, packs: [], excessGal: 0, excessToShelf: false };
  const req = opts.requestedGal;
  if (!(req > 0)) return { ok: false, error: "Enter a quantity.", ...empty };
  if (req > TOUCH_UP_MAX_GAL + 1e-9) return { ok: false, error: `The maximum is ${TOUCH_UP_MAX_GAL} gallons. ${req} gallons needs an estimate.`, ...empty };
  if (opts.available.length === 0) return { ok: false, error: "No pack sizes are available for this product.", ...empty };

  let need = req;
  let note: string | undefined;
  if (opts.purpose === "touch_up") {
    if (need < TOUCH_UP_MIN_GAL) need = TOUCH_UP_MIN_GAL;
    const smallest = Math.min(...opts.available.map((s) => PACK_GALLONS[s]));
    if (smallest > need + 1e-9) {
      note = `No ${need === 0.25 ? "quart" : `${need} gal`} pack is available. The smallest available pack (${smallest} gal) is required; the extra ${roundHalfUp(smallest - req, 3)} gal goes to the customer with the order.`;
      need = smallest;
    }
  } else if (need < NON_TOUCH_UP_MIN_GAL) {
    note = `Non-touch-up orders have a 1-gallon minimum. Raised from ${req} gal to 1 gal; the excess ${roundHalfUp(1 - req, 3)} gal goes to shelf stock.`;
    need = NON_TOUCH_UP_MIN_GAL;
  }
  const packed = packContainers(need, opts.available);
  if (packed.totalGal > TOUCH_UP_MAX_GAL + 1e-9) {
    return { ok: false, error: `The available pack sizes can't fill this within the ${TOUCH_UP_MAX_GAL}-gallon maximum.`, ...empty };
  }
  const excessGal = roundHalfUp(packed.totalGal - req, 3);
  if (!note && excessGal > 0) {
    note = opts.purpose === "non_touch_up" ? `Packs total ${packed.totalGal} gal; the excess ${excessGal} gal goes to shelf stock.` : `Packs total ${packed.totalGal} gal (${excessGal} gal over the request).`;
  }
  return { ok: true, orderGal: packed.totalGal, packs: packed.packs, excessGal, note, excessToShelf: opts.purpose === "non_touch_up" && excessGal > 0 };
}

/* ------------------------------------------------------------------ */
/* Payment, stock check, refund                                        */
/* ------------------------------------------------------------------ */

export const PAYMENT_BLOCKED = "Prepayment not cleared and no On account status set.";

export function paymentAllowsApproval(payment: "unpaid" | "prepaid_cleared" | "on_account"): boolean {
  return payment === "prepaid_cleared" || payment === "on_account";
}

export const STOCK_MAX_AGE_MONTHS = 24;

export interface StockCheckInput {
  tintDate?: string;
  nowIso: string;
  issues: ("skinning" | "separation" | "unlabelled")[];
  brandMatches: boolean;
  codeMatches: boolean;
  sheenMatches: boolean;
}

/** Physical stock check. Any failure means the surface must be rematched. */
export function stockCheckResult(i: StockCheckInput): { result: "Usable" | "Rematch required"; reasons: string[]; ageMonths?: number } {
  const reasons: string[] = [];
  if (i.issues.includes("skinning")) reasons.push("Skinning");
  if (i.issues.includes("separation")) reasons.push("Separation");
  if (i.issues.includes("unlabelled")) reasons.push("Unlabelled paint");
  let ageMonths: number | undefined;
  if (!i.tintDate) reasons.push("No tint date");
  else {
    ageMonths = monthsBetween(i.tintDate, i.nowIso);
    if (ageMonths > STOCK_MAX_AGE_MONTHS) reasons.push(`Tint date ${ageMonths} months old (over 2 years)`);
  }
  if (!i.brandMatches) reasons.push("Brand does not match the record");
  if (!i.codeMatches) reasons.push("Color code does not match the record");
  if (!i.sheenMatches) reasons.push("Sheen does not match the record");
  return { result: reasons.length ? "Rematch required" : "Usable", reasons, ageMonths };
}

export const REFUND_WORKING_DAYS = 5;

/** Add working days (Mon–Fri, skipping US federal holidays). */
export function addWorkingDays(iso: string, days: number): string {
  let t = iso;
  let added = 0;
  while (added < days) {
    t = addDays(t, 1);
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6 && !isHoliday(t)) added += 1;
  }
  return t;
}

export function refundDueDate(cancelledAtIso: string): string {
  return addWorkingDays(cancelledAtIso, REFUND_WORKING_DAYS);
}

/** Working days left until the refund deadline (negative when overdue). */
export function workingDaysUntil(fromIso: string, dueIso: string): number {
  const from = new Date(fromIso.slice(0, 10) + "T12:00:00Z");
  const due = new Date(dueIso.slice(0, 10) + "T12:00:00Z");
  const sign = due >= from ? 1 : -1;
  let count = 0;
  let t = from.toISOString();
  const target = due.toISOString().slice(0, 10);
  while (t.slice(0, 10) !== target) {
    t = addDays(t, sign);
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6 && !isHoliday(t)) count += sign;
    if (Math.abs(count) > 400) break;
  }
  return count;
}

/* ------------------------------------------------------------------ */
/* Ownership period access (feature 25 rules, applied by 28)           */
/* ------------------------------------------------------------------ */

export type HistoryAccess = "full" | "spec_only" | "hidden";

/**
 * Work completed before the current owner's period is predecessor history.
 * It is shared only with seller consent, or as specification only when the
 * seller was unreachable. Undated work is treated as the current period.
 */
export function historyAccess(opts: {
  completedAt?: string;
  currentStart: string;
  consent?: "granted" | "refused" | "unreachable_spec_only" | "not_requested";
}): HistoryAccess {
  if (!opts.completedAt || opts.completedAt >= opts.currentStart) return "full";
  if (opts.consent === "granted") return "full";
  if (opts.consent === "unreachable_spec_only") return "spec_only";
  return "hidden";
}
