/**
 * Estimate calculation for the rebuilt Estimate Details page.
 *
 * The live app runs this on the server (POST /estimates/calculate). The
 * prototype keeps a small stand-in so the scope grid, the Paint Color Card
 * and the Summary show real numbers:
 * - hours per surface come from a production rate (sq ft per hour, first
 *   coat) with later coats faster, like the live Surface Rates;
 * - gallons per colour come from the feature 18 demand rule (coverage
 *   precedence, highest waste only, Rule 6 rounding);
 * - labour is hours × the base labour rate; paint is gallons × the gallon price.
 */
import type { Database, Job, SpecLine, Surface, SurfaceCondition, SurfaceType } from "@/features/types";
import { roundHalfUp, roundMoney } from "./rounding";
import { specDemand } from "./procurement";
import { estimateTotals as builderTotals } from '@/lib/calculations';

/** First-coat production rates, sq ft per hour (live Surface Rates `rateCoat1`). */
export const PRODUCTION_RATES: Record<SurfaceType, number> = {
  walls: 150,
  ceiling: 130,
  trim: 60,
  door: 40,
  body: 120,
  siding: 110,
  cabinets: 25,
};

/** Later coats go faster: live default rates 150 / 188 / 203 / 225 → ×1.25 from coat 2. */
export const LATER_COAT_SPEED = 1.25;

/** Live General Configuration "Base Labor Rate ($/hr)" default. */
export const BASE_LABOR_RATE = 70.3125;

/** Live Paint Surface column: Smooth / Medium / Rough. */
export type PaintSurface = "SMOOTH" | "MEDIUM" | "ROUGH";

export function paintSurfaceFor(condition: SurfaceCondition): PaintSurface {
  return condition === "rough" ? "ROUGH" : condition === "new_drywall" ? "MEDIUM" : "SMOOTH";
}

/** Hours for one surface at a number of coats, rounded to 2 decimals. */
export function surfaceHours(surface: Pick<Surface, "type" | "areaSqft">, coats: number): number {
  const rate = PRODUCTION_RATES[surface.type];
  if (!rate || coats < 1 || surface.areaSqft <= 0) return 0;
  const first = surface.areaSqft / rate;
  const later = (coats - 1) * (surface.areaSqft / (rate * LATER_COAT_SPEED));
  return roundHalfUp(first + later, 2);
}

/** The specification a surface is assigned to on this job's card, if any. */
export function specForSurface(db: Database, jobId: string, surfaceId: string): SpecLine | undefined {
  return db.specs.find((s) => s.jobId === jobId && s.state !== "superseded" && s.surfaceIds.includes(surfaceId));
}

/** Read the saved estimating hours before falling back to prototype production rates. */
export function jobSurfaceHours(db: Database, jobId: string, surface: Surface): number {
  const job = db.jobs.find((j) => j.id === jobId);
  const line = db.estimates.find((e) => e.id === job?.estimateId)?.pricingSnapshot?.lineItems.find((l) => l.id === surface.id);
  if (line) return line.optional && !line.selected ? 0 : line.laborHours;
  return surfaceHours(surface, specForSurface(db, jobId, surface.id)?.coats ?? 2);
}

export interface EstimateTotals {
  totalHours: number;
  laborTotal: number;
  totalGallons: number;
  paintTotal: number;
  subtotal: number;
  taxRatePct: number;
  taxAmount: number;
  grandTotal: number;
}

/** Totals for a job's scope. Surfaces without a colour count 2 coats and no paint. */
export function estimateTotals(db: Database, job: Job): EstimateTotals {
  const snapshot = db.estimates.find((e) => e.id === job.estimateId)?.pricingSnapshot;
  if (snapshot) {
    const total = builderTotals(snapshot);
    const totalGallons = db.specs.filter((s) => s.jobId === job.id && s.state !== 'superseded').reduce((sum, s) => sum + specDemand(db, s).needGal, 0);
    return { totalHours: total.laborHours, laborTotal: total.laborCost, totalGallons: roundHalfUp(totalGallons, 3), paintTotal: total.materialCost, subtotal: total.taxable, taxRatePct: snapshot.taxRate, taxAmount: total.tax, grandTotal: total.total };
  }
  const surfaces = job.surfaceIds.map((id) => db.surfaces.find((s) => s.id === id)).filter((s): s is Surface => !!s && !s.removedAt);
  let totalHours = 0;
  for (const s of surfaces) totalHours += surfaceHours(s, specForSurface(db, job.id, s.id)?.coats ?? 2);
  const specs = db.specs.filter((s) => s.jobId === job.id && s.state !== "superseded");
  let totalGallons = 0;
  let paintTotal = 0;
  for (const spec of specs) {
    const line = specDemand(db, spec);
    totalGallons += line.needGal;
    paintTotal += line.needGal * (line.catalog?.cost.gal ?? 0);
  }
  const laborTotal = roundMoney(totalHours * BASE_LABOR_RATE);
  paintTotal = roundMoney(paintTotal);
  const subtotal = roundMoney(laborTotal + paintTotal);
  const taxAmount = roundMoney((subtotal * job.taxRatePct) / 100);
  return {
    totalHours: roundHalfUp(totalHours, 2),
    laborTotal,
    totalGallons: roundHalfUp(totalGallons, 3),
    paintTotal,
    subtotal,
    taxRatePct: job.taxRatePct,
    taxAmount,
    grandTotal: roundMoney(subtotal + taxAmount),
  };
}
