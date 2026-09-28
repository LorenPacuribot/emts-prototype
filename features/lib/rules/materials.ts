/**
 * Feature 18 — material demand, waste and container packing.
 *
 * Order of operations (18 System Behavior):
 *   coverage rate -> waste allowance -> container packing.
 * Full precision is kept until adjusted need, which is rounded once to three
 * decimals before packing (Rule 6, 18.Q01).
 */
import type { PackCount, PackSize, SurfaceCondition, AreaKind } from "@/features/types";
import { roundHalfUp, roundMoney } from "./rounding";

export const PACK_GALLONS: Record<PackSize, number> = { qt: 0.25, gal: 1, "5gal": 5 };
export const PACK_LABEL: Record<PackSize, string> = { qt: "Quart", gal: "Gallon", "5gal": "5-Gallon" };

export type CoverageSource = "override" | "field_rate" | "manufacturer";

/** Coverage precedence: project override > proven field rate > manufacturer spread rate. */
export function pickCoverage(opts: { override?: number; fieldRate?: number; spreadRate?: number }): {
  rate: number;
  source: CoverageSource;
} {
  if (opts.override && opts.override > 0) return { rate: opts.override, source: "override" };
  if (opts.fieldRate && opts.fieldRate > 0) return { rate: opts.fieldRate, source: "field_rate" };
  return { rate: opts.spreadRate ?? 0, source: "manufacturer" };
}

/**
 * Only the highest matching waste allowance applies. Never added together.
 * 5% interior repaint, 10% exterior or spray, 15% rough surface.
 */
export function wasteAllowance(opts: { kind: AreaKind; spray?: boolean; conditions: SurfaceCondition[] }): number {
  const matches = [0.05];
  if (opts.kind === "exterior" || opts.spray) matches.push(0.1);
  if (opts.conditions.includes("rough")) matches.push(0.15);
  return Math.max(...matches);
}

/** Openings strictly over 20 sq ft are deducted. Exactly 20 is not. */
export function netArea(grossSqft: number, openings: number[]): number {
  return grossSqft - openings.filter((o) => o > 20).reduce((a, b) => a + b, 0);
}

export interface DemandCalc {
  coatAdjustedSqft: number;
  baseNeedGal: number; // unrounded
  adjustedNeedGal: number; // rounded to 3 decimals, the only rounding before packing
}

export function calcDemand(opts: { areaSqft: number; coats: number; rate: number; waste: number }): DemandCalc {
  const coatAdjustedSqft = opts.areaSqft * opts.coats;
  const baseNeedGal = opts.rate > 0 ? coatAdjustedSqft / opts.rate : 0;
  const adjustedNeedGal = roundHalfUp(baseNeedGal * (1 + opts.waste), 3);
  return { coatAdjustedSqft, baseNeedGal, adjustedNeedGal };
}

export interface PackResult {
  packs: PackCount[];
  totalGal: number;
  excessGal: number;
  containers: number;
  cost?: number;
}

/**
 * Container packing. Default: least leftover volume, ties broken by fewest
 * containers. Alternative: lowest price. Only available pack sizes are used.
 */
export function packContainers(
  needGal: number,
  available: PackSize[],
  opts: { strategy?: "least_leftover" | "lowest_price"; cost?: Partial<Record<PackSize, number>> } = {},
): PackResult {
  const strategy = opts.strategy ?? "least_leftover";
  if (needGal <= 0 || available.length === 0) return { packs: [], totalGal: 0, excessGal: 0, containers: 0, cost: 0 };

  const maxFive = available.includes("5gal") ? Math.ceil(needGal / 5) : 0;
  const maxGal = available.includes("gal") ? Math.ceil(needGal) + 1 : 0;
  const maxQt = available.includes("qt") ? 3 + (available.includes("gal") ? 0 : Math.ceil(needGal * 4)) : 0;

  let best: PackResult | null = null;
  for (let f = 0; f <= maxFive; f++) {
    for (let g = 0; g <= maxGal; g++) {
      for (let q = 0; q <= maxQt; q++) {
        const total = f * 5 + g + q * 0.25;
        if (total + 1e-9 < needGal) continue;
        const containers = f + g + q;
        const cost = opts.cost ? f * (opts.cost["5gal"] ?? 0) + g * (opts.cost.gal ?? 0) + q * (opts.cost.qt ?? 0) : undefined;
        const candidate: PackResult = {
          packs: [
            ...(f ? [{ size: "5gal" as const, count: f }] : []),
            ...(g ? [{ size: "gal" as const, count: g }] : []),
            ...(q ? [{ size: "qt" as const, count: q }] : []),
          ],
          totalGal: total,
          excessGal: roundHalfUp(total - needGal, 3),
          containers,
          cost: cost !== undefined ? roundMoney(cost) : undefined,
        };
        if (!best || isBetter(candidate, best, strategy)) best = candidate;
      }
    }
  }
  return best!;
}

function isBetter(a: PackResult, b: PackResult, strategy: "least_leftover" | "lowest_price"): boolean {
  if (strategy === "lowest_price" && a.cost !== undefined && b.cost !== undefined && a.cost !== b.cost) {
    return a.cost < b.cost;
  }
  if (Math.abs(a.excessGal - b.excessGal) > 1e-9) return a.excessGal < b.excessGal;
  return a.containers < b.containers;
}

export function formatPacks(packs: PackCount[]): string {
  if (packs.length === 0) return "—";
  return packs.map((p) => `${p.count} × ${PACK_LABEL[p.size]}`).join(" + ");
}

/**
 * Consumables allowance (18 System Validations, 18.Q02).
 * $35 per interior repaint room, $55 per never-painted room,
 * exterior $150 per job + $25 per 1,000 sq ft prorated, once per job.
 */
export function consumablesAllowance(opts: {
  interiorRooms: { neverPainted?: boolean }[];
  exteriorSqft: number;
  hasExterior: boolean;
}): { interior: number; exterior: number; total: number } {
  const interior = opts.interiorRooms.reduce((sum, r) => sum + (r.neverPainted ? 55 : 35), 0);
  const exterior = opts.hasExterior ? 150 + (25 * opts.exteriorSqft) / 1000 : 0;
  return { interior: roundMoney(interior), exterior: roundMoney(exterior), total: roundMoney(interior + exterior) };
}

/** Estimator self-approval band: -10% to +10% of unrounded demand, and never from a zero baseline. */
export function adjustmentNeedsApproval(baselineGal: number, proposedGal: number): { pct: number; needsApproval: boolean } {
  if (baselineGal === 0) return { pct: proposedGal > 0 ? Infinity : 0, needsApproval: proposedGal > 0 };
  const pct = (proposedGal - baselineGal) / baselineGal;
  return { pct, needsApproval: Math.abs(pct) > 0.1 + 1e-9 };
}

/** Over-receipt routing (18.Q04): up to 10% becomes job cost, above goes to shelf. */
export function routeOverReceipt(orderedGal: number, receivedGal: number): { toJobCost: number; toShelf: number } {
  const over = Math.max(0, receivedGal - orderedGal);
  const cap = orderedGal * 0.1;
  const pct = orderedGal > 0 ? over / orderedGal : 0;
  if (pct <= 0.1 + 1e-9) return { toJobCost: over, toShelf: 0 };
  return { toJobCost: cap, toShelf: over - cap };
}

export const ESTIMATOR_ORDER_LIMIT = 1500;
export const OWNER_LIFETIME_LIMIT = 3000;
